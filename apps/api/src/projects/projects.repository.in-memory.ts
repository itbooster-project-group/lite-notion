import { randomUUID } from 'node:crypto';

import { PurgeConfirmationRequiredError } from '../common/errors';
import type { PageDeletionOrigin } from '../generated/prisma/enums';
import { ProjectNotFoundError } from './errors';
import {
  type CreateProjectInput,
  type DeletedProjectRecord,
  type ProjectRecord,
  ProjectsRepository,
} from './projects.repository';

/**
 * Минимальная форма строки страницы, которой достаточно каскаду проекта.
 *
 * Объявлена структурно, а не импортом из `pages`: каскад проекта не знает про
 * дерево, ему хватает `projectId` и пары отметок, а импорт развернул бы
 * зависимость модулей задом наперёд — сейчас `pages` зависит от `projects`.
 * Хранилище `InMemoryPagesRepository` этой форме удовлетворяет, и тест передаёт
 * сюда ту же самую Map, что и туда: в базе это одна таблица.
 */
export interface CascadablePage {
  id: string;
  ownerId: string;
  projectId: string;
  title: string;
  deletedAt: Date | null;
  deletedOrigin: PageDeletionOrigin | null;
}

/** Строка таблицы проектов. `deletedAt` — та же отметка мягкого удаления, что в базе. */
export interface StoredProject extends ProjectRecord {
  deletedAt: Date | null;
}

/**
 * Тестовая реализация. Воспроизводит наблюдаемый контракт Prisma-версии, включая
 * порядок выдачи (имя, затем id), фильтрацию по владельцу, исключение удалённых
 * из обычных чтений и каскад пометки на страницы проекта.
 */
export class InMemoryProjectsRepository extends ProjectsRepository {
  /**
   * Хранилища передаются снаружи: в базе это отдельные таблицы, и тест,
   * удаливший проект, обязан увидеть последствия через репозиторий страниц.
   *
   * Документы здесь типизированы как `Map<string, unknown>`: каскаду нужно
   * только удалить строку по `pageId`, а знать её форму значило бы завести
   * импорт из `pages` и развернуть зависимость модулей задом наперёд.
   */
  constructor(
    readonly pages: Map<string, CascadablePage> = new Map(),
    readonly records: Map<string, StoredProject> = new Map(),
    readonly documents: Map<string, unknown> = new Map(),
  ) {
    super();
  }

  async create(input: CreateProjectInput): Promise<ProjectRecord> {
    const project = {
      deletedAt: null,
      id: randomUUID(),
      name: input.name,
      ownerId: input.ownerId,
    };

    this.records.set(project.id, project);

    return this.toRecord(project);
  }

  async findAllByOwner(ownerId: string): Promise<ProjectRecord[]> {
    return [...this.records.values()]
      .filter((project) => project.deletedAt === null && project.ownerId === ownerId)
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
      .map((project) => this.toRecord(project));
  }

  async findByIdForOwner(id: string, ownerId: string): Promise<ProjectRecord | null> {
    const project = this.records.get(id);

    return project === undefined || project.deletedAt !== null || project.ownerId !== ownerId
      ? null
      : this.toRecord(project);
  }

  async findDeletedByOwner(ownerId: string): Promise<DeletedProjectRecord[]> {
    return [...this.records.values()]
      .filter((project) => project.deletedAt !== null && project.ownerId === ownerId)
      .sort(
        (left, right) =>
          (right.deletedAt?.getTime() ?? 0) - (left.deletedAt?.getTime() ?? 0) ||
          left.id.localeCompare(right.id),
      )
      .map((project) => ({ ...this.toRecord(project), deletedAt: project.deletedAt as Date }));
  }

  async softDelete(id: string, ownerId: string): Promise<boolean> {
    const project = this.records.get(id);

    if (project === undefined || project.deletedAt !== null || project.ownerId !== ownerId) {
      return false;
    }

    const deletedAt = new Date();

    project.deletedAt = deletedAt;

    for (const page of this.pages.values()) {
      if (page.projectId === id && page.deletedAt === null) {
        page.deletedAt = deletedAt;
        page.deletedOrigin = 'PROJECT';
      }
    }

    return true;
  }

  async restore(id: string, ownerId: string): Promise<ProjectRecord | null> {
    const project = this.records.get(id);

    if (project === undefined || project.deletedAt === null || project.ownerId !== ownerId) {
      return null;
    }

    project.deletedAt = null;

    for (const page of this.pages.values()) {
      if (page.projectId === id && page.deletedOrigin === 'PROJECT') {
        page.deletedAt = null;
        page.deletedOrigin = null;
      }
    }

    return this.toRecord(project);
  }

  async purge(id: string, ownerId: string, cascade: boolean): Promise<void> {
    const project = this.records.get(id);

    if (project === undefined || project.deletedAt === null || project.ownerId !== ownerId) {
      throw new ProjectNotFoundError();
    }

    this.assertConfirmed([id], ownerId, cascade);
    this.deleteProjects([id]);
  }

  async purgeTrash(ownerId: string, cascade: boolean): Promise<void> {
    const ids = [...this.records.values()]
      .filter((project) => project.deletedAt !== null && project.ownerId === ownerId)
      .map((project) => project.id);

    if (ids.length === 0) {
      return;
    }

    this.assertConfirmed(ids, ownerId, cascade);
    this.deleteProjects(ids);
  }

  /** Собираются только `SELF`-страницы — корни корзины; их ветки нарисованы под ними. */
  private assertConfirmed(projectIds: string[], ownerId: string, cascade: boolean): void {
    if (cascade) {
      return;
    }

    const doomed = [...this.pages.values()]
      .filter(
        (page) =>
          page.ownerId === ownerId &&
          projectIds.includes(page.projectId) &&
          page.deletedOrigin === 'SELF',
      )
      .map((page) => page.title)
      .sort();

    if (doomed.length > 0) {
      throw new PurgeConfirmationRequiredError(doomed);
    }
  }

  /**
   * Страницы и их документы уносит FK-каскад: в двойнике он воспроизводится
   * вручную, и документы забыть нельзя — иначе на двойнике не проверить, что
   * содержимое ушло вместе со страницей.
   */
  private deleteProjects(projectIds: string[]): void {
    for (const [pageId, page] of [...this.pages.entries()]) {
      if (projectIds.includes(page.projectId)) {
        this.pages.delete(pageId);
        this.documents.delete(pageId);
      }
    }

    for (const projectId of projectIds) {
      this.records.delete(projectId);
    }
  }

  private toRecord(project: StoredProject): ProjectRecord {
    return { id: project.id, name: project.name, ownerId: project.ownerId };
  }
}
