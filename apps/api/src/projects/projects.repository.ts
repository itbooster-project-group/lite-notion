import { Inject, Injectable } from '@nestjs/common';

import { PurgeConfirmationRequiredError } from '../common/errors';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { PageDeletionOrigin } from '../generated/prisma/enums';
import { ProjectNotFoundError } from './errors';

/** Клиент внутри `$transaction`: те же модели, но без вложенных транзакций. */
type TransactionClient = Prisma.TransactionClient;

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

export interface CreateProjectInput {
  ownerId: string;
  name: string;
}

const PROJECT_FIELDS = { id: true, name: true, ownerId: true } as const;

const DELETED_PROJECT_FIELDS = { ...PROJECT_FIELDS, deletedAt: true } as const;

/**
 * Узкий доступ к таблице проектов. Абстрактный класс, а не интерфейс: он же
 * служит DI-токеном, и тесты подставляют вместо него in-memory реализацию.
 *
 * Каждый метод принимает `ownerId` и фильтрует по нему. Метода «найти проект по
 * id без владельца» здесь нет намеренно — он позволил бы вызывающему коду
 * случайно прочитать чужой проект.
 *
 * Обычные чтения дополнительно фильтруют `deletedAt: null`: удалённый проект
 * неотличим от несуществующего везде, кроме корзины и восстановления.
 */
@Injectable()
export abstract class ProjectsRepository {
  abstract create(input: CreateProjectInput): Promise<ProjectRecord>;

  abstract findAllByOwner(ownerId: string): Promise<ProjectRecord[]>;

  abstract findByIdForOwner(id: string, ownerId: string): Promise<ProjectRecord | null>;

  abstract findDeletedByOwner(ownerId: string): Promise<DeletedProjectRecord[]>;

  /** `false`, когда проект не найден, чужой или уже удалён. */
  abstract softDelete(id: string, ownerId: string): Promise<boolean>;

  abstract restore(id: string, ownerId: string): Promise<ProjectRecord | null>;

  /**
   * Безвозвратно удаляет проект со всеми его страницами. `cascade` подтверждает
   * уничтожение страниц, удалённых раньше и самостоятельно: корзина страниц
   * показывает их отдельными корнями, а вне проекта они существовать не могут.
   */
  abstract purge(id: string, ownerId: string, cascade: boolean): Promise<void>;

  abstract purgeTrash(ownerId: string, cascade: boolean): Promise<void>;
}

@Injectable()
export class PrismaProjectsRepository extends ProjectsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  create(input: CreateProjectInput): Promise<ProjectRecord> {
    return this.prisma.project.create({
      data: { name: input.name, ownerId: input.ownerId },
      select: PROJECT_FIELDS,
    });
  }

  findAllByOwner(ownerId: string): Promise<ProjectRecord[]> {
    return this.prisma.project.findMany({
      // Имя не уникально, поэтому одного порядка по нему мало: id добавлен
      // тай-брейком, иначе выдача двух одноимённых проектов могла бы меняться
      // между запросами.
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: PROJECT_FIELDS,
      where: { deletedAt: null, ownerId },
    });
  }

  findByIdForOwner(id: string, ownerId: string): Promise<ProjectRecord | null> {
    return this.prisma.project.findFirst({
      select: PROJECT_FIELDS,
      where: { deletedAt: null, id, ownerId },
    });
  }

  findDeletedByOwner(ownerId: string): Promise<DeletedProjectRecord[]> {
    // Недавно удалённое идёт первым — тем же правилом, что и корни корзины
    // страниц. Порядок по имени здесь не годится: в корзине важно, что уходит
    // первым по сроку хранения, а не алфавит.
    return this.prisma.project.findMany({
      orderBy: [{ deletedAt: 'desc' }, { id: 'asc' }],
      select: DELETED_PROJECT_FIELDS,
      where: { deletedAt: { not: null }, ownerId },
    }) as Promise<DeletedProjectRecord[]>;
  }

  async softDelete(id: string, ownerId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Тот же ключ и то же место, что у операций над страницами: иначе создание
      // страницы успело бы вставить живую строку в проект, который в этот момент
      // уезжает в корзину, и живая страница осталась бы в удалённом проекте.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      const deletedAt = new Date();
      const { count } = await tx.project.updateMany({
        data: { deletedAt },
        where: { deletedAt: null, id, ownerId },
      });

      if (count === 0) {
        return false;
      }

      // Рекурсия не нужна: `projectId` есть в каждой строке, дерево тут ни при
      // чём. Уже удалённые страницы не трогаются — они сохраняют свой источник и
      // свою прежнюю отметку, чтобы остаться самостоятельными корнями корзины.
      await tx.page.updateMany({
        data: { deletedAt, deletedOrigin: PageDeletionOrigin.PROJECT },
        where: { deletedAt: null, ownerId, projectId: id },
      });

      return true;
    });
  }

  async purge(id: string, ownerId: string, cascade: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Без блокировки подсчёт обречённых страниц и удаление разъезжаются:
      // READ COMMITTED позволяет параллельному мягкому удалению страницы
      // закоммититься между `assertConfirmed` и `delete`, и она уедет навсегда,
      // не попав в перечень, который подтверждал вызывающий.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      // Без блокировки подсчёт обречённых страниц и удаление разъезжаются:
      // READ COMMITTED позволяет параллельному мягкому удалению страницы
      // закоммититься между `assertConfirmed` и `delete`, и она уедет
      // навсегда, не попав в перечень, который подтверждал вызывающий.
      const project = await tx.project.findFirst({
        select: { id: true },
        where: { deletedAt: { not: null }, id, ownerId },
      });

      if (project === null) {
        throw new ProjectNotFoundError();
      }

      await this.assertConfirmed(tx, [id], ownerId, cascade);

      // Страницы и документы уносят физические FK-каскады.
      await tx.project.delete({ where: { id } });
    });
  }

  async purgeTrash(ownerId: string, cascade: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      const projects = await tx.project.findMany({
        select: { id: true },
        where: { deletedAt: { not: null }, ownerId },
      });

      if (projects.length === 0) {
        return;
      }

      const ids = projects.map((project) => project.id);

      await this.assertConfirmed(tx, ids, ownerId, cascade);

      await tx.project.deleteMany({ where: { id: { in: ids }, ownerId } });
    });
  }

  /**
   * Собираются только `SELF`-страницы — корни корзины. Их собственные ветки
   * нарисованы под ними, и перечислять их отдельно значило бы утопить перечень в
   * шуме. Сбор идёт в той же транзакции, что и удаление: иначе между ними
   * вклинилась бы чужая запись, и уничтожено было бы не то, что подтвердили.
   */
  private async assertConfirmed(
    tx: TransactionClient,
    projectIds: readonly string[],
    ownerId: string,
    cascade: boolean,
  ): Promise<void> {
    if (cascade) {
      return;
    }

    const doomed = await tx.page.findMany({
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      select: { title: true },
      where: {
        deletedOrigin: PageDeletionOrigin.SELF,
        ownerId,
        projectId: { in: [...projectIds] },
      },
    });

    if (doomed.length > 0) {
      throw new PurgeConfirmationRequiredError(doomed.map((page) => page.title));
    }
  }

  async restore(id: string, ownerId: string): Promise<ProjectRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      const { count } = await tx.project.updateMany({
        data: { deletedAt: null },
        where: { deletedAt: { not: null }, id, ownerId },
      });

      if (count === 0) {
        return null;
      }

      // Снимается отметка ровно с тех страниц, которые пометило удаление этого
      // проекта. Удалённые раньше и самостоятельно сохраняют `SELF` и остаются в
      // корзине — восстановление проекта не отменяет чужую операцию удаления.
      await tx.page.updateMany({
        data: { deletedAt: null, deletedOrigin: null },
        where: { deletedOrigin: PageDeletionOrigin.PROJECT, ownerId, projectId: id },
      });

      return tx.project.findFirst({ select: PROJECT_FIELDS, where: { id, ownerId } });
    });
  }
}
