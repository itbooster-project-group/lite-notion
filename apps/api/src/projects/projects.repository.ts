import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import {
  type DatabaseClient,
  databaseClientOf,
  type TransactionScope,
} from '../database/transaction';

export interface ProjectRecord {
  id: string;
  ownerId: string;
  name: string;
}

/**
 * Проект в корзине. Отметка удаления вынесена в отдельный тип, а не добавлена в
 * `ProjectRecord` необязательным полем: живой проект её никогда не несёт, и
 * nullable-поле заставляло бы каждого потребителя разбирать случай, которого не
 * бывает.
 */
export interface DeletedProjectRecord extends ProjectRecord {
  deletedAt: Date;
}

/** Проект вместе с отметкой удаления. Нужен восстановлению страницы. */
export interface ProjectLifetime {
  id: string;
  deletedAt: Date | null;
}

export interface CreateProjectInput {
  ownerId: string;
  name: string;
}

const PROJECT_FIELDS = { id: true, name: true, ownerId: true } as const;

const DELETED_PROJECT_FIELDS = { ...PROJECT_FIELDS, deletedAt: true } as const;

/**
 * Абстрактный класс служит DI-токеном; тесты подставляют in-memory реализацию.
 * Решений здесь нет — они в юзкейсах модуля.
 *
 * Метода «найти проект по id без владельца» нет намеренно. Обычные чтения фильтруют
 * `deletedAt: null`: удалённый проект неотличим от несуществующего везде, кроме
 * корзины и восстановления.
 */
@Injectable()
export abstract class ProjectsRepository {
  /**
   * Копия репозитория на соединении транзакции. Новый экземпляр, а не мутация:
   * провайдер Nest — синглтон, и мутация увела бы чужой запрос в эту транзакцию.
   */
  abstract bind(scope: TransactionScope): ProjectsRepository;

  abstract create(input: CreateProjectInput): Promise<ProjectRecord>;

  abstract findAllByOwner(ownerId: string): Promise<ProjectRecord[]>;

  abstract findByIdForOwner(id: string, ownerId: string): Promise<ProjectRecord | null>;

  abstract findDeletedByOwner(ownerId: string): Promise<DeletedProjectRecord[]>;

  /** Помечает проект удалённым. `false` — не найден, чужой или уже удалён. */
  abstract markDeleted(id: string, ownerId: string, deletedAt: Date): Promise<boolean>;

  /** Снимает отметку удаления с проекта. `false`, когда он не найден, чужой или жив. */
  abstract clearDeleted(id: string, ownerId: string): Promise<boolean>;

  /** Проект владельца независимо от отметки удаления. `null` — нет или чужой. */
  abstract findAnyByIdForOwner(id: string, ownerId: string): Promise<ProjectLifetime | null>;

  /** Удалённый проект владельца. `null`, когда он жив, чужой или не существует. */
  abstract findDeletedByIdForOwner(id: string, ownerId: string): Promise<ProjectRecord | null>;

  abstract findDeletedIdsByOwner(ownerId: string): Promise<string[]>;

  /** Безвозвратно удаляет проект. Страницы и документы уносят физические FK-каскады. */
  abstract deleteById(id: string): Promise<void>;

  abstract deleteManyByIds(ids: readonly string[], ownerId: string): Promise<void>;
}

@Injectable()
export class PrismaProjectsRepository extends ProjectsRepository {
  constructor(@Inject(PrismaService) private readonly client: DatabaseClient) {
    super();
  }

  bind(scope: TransactionScope): PrismaProjectsRepository {
    return new PrismaProjectsRepository(databaseClientOf(scope));
  }

  create(input: CreateProjectInput): Promise<ProjectRecord> {
    return this.client.project.create({
      data: { name: input.name, ownerId: input.ownerId },
      select: PROJECT_FIELDS,
    });
  }

  findAllByOwner(ownerId: string): Promise<ProjectRecord[]> {
    return this.client.project.findMany({
      // Имя не уникально, поэтому одного порядка по нему мало: id добавлен
      // тай-брейком, иначе выдача двух одноимённых проектов могла бы меняться
      // между запросами.
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: PROJECT_FIELDS,
      where: { deletedAt: null, ownerId },
    });
  }

  findByIdForOwner(id: string, ownerId: string): Promise<ProjectRecord | null> {
    return this.client.project.findFirst({
      select: PROJECT_FIELDS,
      where: { deletedAt: null, id, ownerId },
    });
  }

  findDeletedByOwner(ownerId: string): Promise<DeletedProjectRecord[]> {
    // Недавно удалённое идёт первым — тем же правилом, что и корни корзины
    // страниц. Порядок по имени здесь не годится: в корзине важно, что уходит
    // первым по сроку хранения, а не алфавит.
    return this.client.project.findMany({
      orderBy: [{ deletedAt: 'desc' }, { id: 'asc' }],
      select: DELETED_PROJECT_FIELDS,
      where: { deletedAt: { not: null }, ownerId },
    }) as Promise<DeletedProjectRecord[]>;
  }

  async markDeleted(id: string, ownerId: string, deletedAt: Date): Promise<boolean> {
    const { count } = await this.client.project.updateMany({
      data: { deletedAt },
      where: { deletedAt: null, id, ownerId },
    });

    return count > 0;
  }

  findAnyByIdForOwner(id: string, ownerId: string): Promise<ProjectLifetime | null> {
    return this.client.project.findFirst({
      select: { deletedAt: true, id: true },
      where: { id, ownerId },
    });
  }

  findDeletedByIdForOwner(id: string, ownerId: string): Promise<ProjectRecord | null> {
    return this.client.project.findFirst({
      select: PROJECT_FIELDS,
      where: { deletedAt: { not: null }, id, ownerId },
    });
  }

  async findDeletedIdsByOwner(ownerId: string): Promise<string[]> {
    const projects = await this.client.project.findMany({
      select: { id: true },
      where: { deletedAt: { not: null }, ownerId },
    });

    return projects.map((project) => project.id);
  }

  async deleteById(id: string): Promise<void> {
    await this.client.project.delete({ where: { id } });
  }

  async deleteManyByIds(ids: readonly string[], ownerId: string): Promise<void> {
    await this.client.project.deleteMany({ where: { id: { in: [...ids] }, ownerId } });
  }

  async clearDeleted(id: string, ownerId: string): Promise<boolean> {
    const { count } = await this.client.project.updateMany({
      data: { deletedAt: null },
      where: { deletedAt: { not: null }, id, ownerId },
    });

    return count > 0;
  }
}
