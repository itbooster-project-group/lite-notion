import { randomUUID } from 'node:crypto';

import type { TransactionScope } from '../database/transaction';
import type { PageDeletionOrigin } from '../generated/prisma/enums';
import {
  type CreateProjectInput,
  type DeletedProjectRecord,
  type ProjectLifetime,
  type ProjectRecord,
  ProjectsRepository,
} from './projects.repository';

/**
 * Форма строки страницы, которой достаточно каскаду проекта. Объявлена структурно, а
 * не импортом из `pages`: импорт развернул бы зависимость модулей задом наперёд.
 * Тест передаёт сюда ту же Map, что и в `InMemoryPagesRepository`.
 */
export interface CascadablePage {
  id: string;
  ownerId: string;
  projectId: string;
  title: string;
  deletedAt: Date | null;
  deletedOrigin: PageDeletionOrigin | null;
}

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
   * Хранилища передаются снаружи: тест, удаливший проект, обязан увидеть последствия
   * через репозиторий страниц. Документы — `Map<string, unknown>`: каскаду нужно лишь
   * удалить строку по `pageId`, а её форма пришла бы импортом из `pages`.
   */
  constructor(
    readonly pages: Map<string, CascadablePage> = new Map(),
    readonly records: Map<string, StoredProject> = new Map(),
    readonly documents: Map<string, unknown> = new Map(),
  ) {
    super();
  }

  /** Хранилище одно на все скоупы: соединения, которое выбирает `bind`, здесь нет. */
  bind(_scope: TransactionScope): InMemoryProjectsRepository {
    return this;
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

  async markDeleted(id: string, ownerId: string, deletedAt: Date): Promise<boolean> {
    const project = this.records.get(id);

    if (project === undefined || project.deletedAt !== null || project.ownerId !== ownerId) {
      return false;
    }

    project.deletedAt = deletedAt;

    return true;
  }

  async clearDeleted(id: string, ownerId: string): Promise<boolean> {
    const project = this.records.get(id);

    if (project === undefined || project.deletedAt === null || project.ownerId !== ownerId) {
      return false;
    }

    project.deletedAt = null;

    return true;
  }

  async findAnyByIdForOwner(id: string, ownerId: string): Promise<ProjectLifetime | null> {
    const project = this.records.get(id);

    return project === undefined || project.ownerId !== ownerId
      ? null
      : { deletedAt: project.deletedAt, id: project.id };
  }

  async findDeletedByIdForOwner(id: string, ownerId: string): Promise<ProjectRecord | null> {
    const project = this.records.get(id);

    return project === undefined || project.deletedAt === null || project.ownerId !== ownerId
      ? null
      : this.toRecord(project);
  }

  async findDeletedIdsByOwner(ownerId: string): Promise<string[]> {
    return [...this.records.values()]
      .filter((project) => project.deletedAt !== null && project.ownerId === ownerId)
      .map((project) => project.id);
  }

  async deleteById(id: string): Promise<void> {
    this.deleteProjects([id]);
  }

  async deleteManyByIds(ids: readonly string[], _ownerId: string): Promise<void> {
    this.deleteProjects([...ids]);
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
