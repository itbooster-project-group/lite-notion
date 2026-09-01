import { Inject, Injectable } from '@nestjs/common';

import { PurgeConfirmationRequiredError } from '../common/errors';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { PageDeletionOrigin } from '../generated/prisma/enums';
import { ProjectNotFoundError } from '../projects/errors';
import {
  PageCycleError,
  PageNotFoundError,
  PageProjectMismatchError,
  PageRestoreProjectDeletedError,
  PageRestoreTargetProjectRejectedError,
  SiblingOrderError,
  SiblingParentMismatchError,
} from './errors';
import { positionBetween, siblingLevelLockKey } from './helpers';

/** Клиент внутри `$transaction`: те же модели, но без вложенных транзакций. */
type TransactionClient = Prisma.TransactionClient;

/**
 * Prisma отдаёт и принимает колонку `Bytes` как Uint8Array поверх обычного
 * ArrayBuffer. Объявлено здесь, потому что страница создаёт пустой документ;
 * чтение и запись содержимого живут в подмодуле `page-document`.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

export interface PageRecord {
  id: string;
  ownerId: string;
  projectId: string;
  parentPageId: string | null;
  createdById: string;
  title: string;
  position: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeletedPageRecord extends PageRecord {
  deletedAt: Date;
  deletedOrigin: PageDeletionOrigin;
}

export interface CreatePageInput {
  ownerId: string;
  projectId: string;
  parentPageId: string | null;
  createdById: string;
  title: string;
  tiptapSchemaVersion: number;
}

export interface MovePageInput {
  pageId: string;
  ownerId: string;
  parentPageId: string | null;
  previousSiblingId: string | null;
  nextSiblingId: string | null;
}

const PAGE_FIELDS = {
  createdAt: true,
  createdById: true,
  id: true,
  ownerId: true,
  parentPageId: true,
  position: true,
  projectId: true,
  title: true,
  updatedAt: true,
} as const;

const DELETED_PAGE_FIELDS = { ...PAGE_FIELDS, deletedAt: true, deletedOrigin: true } as const;

/**
 * Узкий доступ к дереву страниц. Абстрактный класс, а не интерфейс: он же служит
 * DI-токеном, и тесты подставляют вместо него in-memory реализацию.
 *
 * Каждый метод принимает `ownerId` и фильтрует по нему вместе с `deletedAt: null`.
 * Метода «найти страницу по id без владельца» здесь нет намеренно.
 *
 * Репозиторий не покидает модуль: снаружи с деревом работают только через
 * `PagesService`, где лежат бизнес-правила. Содержимое документа сюда не
 * относится — им владеет `PageDocumentRepository`.
 */
@Injectable()
export abstract class PagesRepository {
  abstract findAllByOwner(ownerId: string): Promise<PageRecord[]>;

  abstract findByIdForOwner(id: string, ownerId: string): Promise<PageRecord | null>;

  abstract create(input: CreatePageInput): Promise<PageRecord>;

  abstract rename(id: string, ownerId: string, title: string): Promise<PageRecord | null>;

  abstract move(input: MovePageInput): Promise<PageRecord>;

  /** Все удалённые страницы владельца, без исключений по источнику. */
  abstract findDeletedByOwner(ownerId: string): Promise<DeletedPageRecord[]>;

  /** `false`, когда страница не найдена, чужая или уже удалена. */
  abstract softDelete(id: string, ownerId: string): Promise<boolean>;

  /**
   * `targetProjectId` принимается только когда собственный проект страницы лежит
   * в корзине: восстановить её на место некуда, и клиент выбирает живой проект.
   */
  abstract restore(
    id: string,
    ownerId: string,
    targetProjectId: string | null,
  ): Promise<PageRecord>;

  /**
   * Безвозвратно удаляет страницу и всё её физическое поддерево. `cascade`
   * подтверждает уничтожение страниц, которые корзина показывала отдельными
   * корнями; без него такой запрос отклоняется их перечнем.
   */
  abstract purge(id: string, ownerId: string, cascade: boolean): Promise<void>;

  /** Безвозвратно удаляет всю корзину владельца. Подтверждения не требует. */
  abstract purgeTrash(ownerId: string): Promise<void>;
}

@Injectable()
export class PrismaPagesRepository extends PagesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  findAllByOwner(ownerId: string): Promise<PageRecord[]> {
    // Плоский список: вложенность собирает сервис. Рекурсивный CTE выбрал бы те
    // же строки, но не избавил бы от сборки дерева в приложении.
    return this.prisma.page.findMany({
      orderBy: [{ parentPageId: 'asc' }, { position: 'asc' }, { id: 'asc' }],
      select: PAGE_FIELDS,
      where: { deletedAt: null, ownerId },
    });
  }

  findByIdForOwner(id: string, ownerId: string): Promise<PageRecord | null> {
    return this.prisma.page.findFirst({
      select: PAGE_FIELDS,
      where: { deletedAt: null, id, ownerId },
    });
  }

  async create(input: CreatePageInput): Promise<PageRecord> {
    return this.prisma.$transaction(async (tx) => {
      // Блокировка владельца первой, до уровневой: тот же порядок, что у `move` и
      // восстановления. Покрывает узкий кейс проверки между созданием и мягким удалением
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.ownerId}))`;
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${siblingLevelLockKey(input.projectId, input.parentPageId)})
        )`;

      // Проверки сервиса шли до транзакции и к этому моменту могли устареть.
      // Повторяются здесь, под блокировкой, и только здесь они окончательны.
      await this.assertDestinationAlive(tx, input);

      const last = await tx.page.findFirst({
        orderBy: [{ position: 'desc' }, { id: 'desc' }],
        select: { position: true },
        where: {
          deletedAt: null,
          ownerId: input.ownerId,
          parentPageId: input.parentPageId,
          projectId: input.projectId,
        },
      });

      const page = await tx.page.create({
        data: {
          createdById: input.createdById,
          ownerId: input.ownerId,
          parentPageId: input.parentPageId,
          position: positionBetween(last?.position ?? null, null),
          projectId: input.projectId,
          title: input.title,
        },
        select: PAGE_FIELDS,
      });

      // Документ создаётся в той же транзакции: связь 1..1 должна выполняться с
      // первой строки, иначе чтение документа пришлось бы делать ленивым.
      await tx.pageDocument.create({
        data: {
          pageId: page.id,
          tiptapSchemaVersion: input.tiptapSchemaVersion,
          yjsState: new Uint8Array(),
        },
      });

      return page;
    });
  }

  /**
   * Проект и родитель обязаны быть живы на момент вставки, а не на момент
   * проверки в сервисе. Ошибки те же, что отдал бы сервис: гонка неотличима от
   * «родителя не существует», и раскрывать её вызывающему незачем.
   */
  private async assertDestinationAlive(
    tx: TransactionClient,
    input: CreatePageInput,
  ): Promise<void> {
    const project = await tx.project.findFirst({
      select: { id: true },
      where: { deletedAt: null, id: input.projectId, ownerId: input.ownerId },
    });

    if (project === null) {
      throw new ProjectNotFoundError();
    }

    if (input.parentPageId === null) {
      return;
    }

    const parent = await tx.page.findFirst({
      select: { id: true },
      where: { deletedAt: null, id: input.parentPageId, ownerId: input.ownerId },
    });

    if (parent === null) {
      throw new PageNotFoundError();
    }
  }

  async rename(id: string, ownerId: string, title: string): Promise<PageRecord | null> {
    const { count } = await this.prisma.page.updateMany({
      data: { title },
      where: { deletedAt: null, id, ownerId },
    });

    return count === 0 ? null : this.findByIdForOwner(id, ownerId);
  }

  async move(input: MovePageInput): Promise<PageRecord> {
    return this.prisma.$transaction(async (tx) => {
      // Первой операцией и до любого чтения: две транзакции, взявшие строчные
      // блокировки до advisory lock, получили бы deadlock. Блокировка снимается
      // вместе с транзакцией и берётся только на перемещение.
      // $executeRaw, а не $queryRaw: функция возвращает void, и Prisma не умеет
      // десериализовать такую колонку — запрос упал бы на живой базе.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.ownerId}))`;

      const page = await tx.page.findFirst({
        select: PAGE_FIELDS,
        where: { deletedAt: null, id: input.pageId, ownerId: input.ownerId },
      });

      if (page === null) {
        throw new PageNotFoundError();
      }

      // Вторая блокировка — на уровень назначения, тем же ключом, что берёт
      // `create`: перемещение в конец уровня читает того же «последнего брата».
      // Порядок «владелец → уровень» соблюдается везде, поэтому взаимной
      // блокировки не возникает: `create` берёт только уровень и никогда не
      // ждёт владельца.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${siblingLevelLockKey(page.projectId, input.parentPageId)})
        )`;

      if (input.parentPageId !== null) {
        await this.assertParentAccepts(tx, page, input.parentPageId);
      }

      const position = await this.resolvePosition(tx, page, input);

      return tx.page.update({
        // projectId и ownerId не обновляются: тройной FK всё равно отверг бы
        // смену, не согласованную со всем поддеревом.
        data: { parentPageId: input.parentPageId, position },
        select: PAGE_FIELDS,
        where: { id: page.id },
      });
    });
  }

  /**
   * Новый родитель должен принадлежать тому же владельцу, лежать в том же
   * проекте и не быть потомком перемещаемой страницы. Подъём по предкам делается
   * рекурсивным CTE внутри той же транзакции, что и запись.
   */
  private async assertParentAccepts(
    tx: TransactionClient,
    page: PageRecord,
    parentPageId: string,
  ): Promise<void> {
    if (parentPageId === page.id) {
      throw new PageCycleError();
    }

    const parent = await tx.page.findFirst({
      select: { id: true, projectId: true },
      where: { deletedAt: null, id: parentPageId, ownerId: page.ownerId },
    });

    if (parent === null) {
      throw new PageNotFoundError();
    }

    if (parent.projectId !== page.projectId) {
      throw new PageProjectMismatchError();
    }

    const ancestors = await tx.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE ancestors AS (
        SELECT "id", "parentPageId" FROM "Page" WHERE "id" = ${parentPageId}::uuid
        UNION ALL
        SELECT parent."id", parent."parentPageId"
        FROM "Page" parent
        JOIN ancestors child ON child."parentPageId" = parent."id"
      )
      SELECT "id" FROM ancestors WHERE "id" = ${page.id}::uuid
    `;

    if (ancestors.length > 0) {
      throw new PageCycleError();
    }
  }

  /** Соседи задают щель; их ранги читаются в той же транзакции, что и запись. */
  private async resolvePosition(
    tx: TransactionClient,
    page: PageRecord,
    input: MovePageInput,
  ): Promise<string> {
    if (input.previousSiblingId !== null && input.previousSiblingId === input.nextSiblingId) {
      throw new SiblingOrderError();
    }

    const previous = await this.readSibling(tx, page, input.parentPageId, input.previousSiblingId);
    const next = await this.readSibling(tx, page, input.parentPageId, input.nextSiblingId);

    // Щель должна существовать: перевёрнутая пара соседей и пара с одинаковым
    // рангом иначе дошли бы до генератора и упали внутренней ошибкой.
    if (previous !== null && next !== null && previous.position >= next.position) {
      throw new SiblingOrderError();
    }

    if (previous === null && next === null) {
      const last = await tx.page.findFirst({
        orderBy: [{ position: 'desc' }, { id: 'desc' }],
        select: { position: true },
        where: {
          deletedAt: null,
          id: { not: page.id },
          ownerId: page.ownerId,
          parentPageId: input.parentPageId,
          projectId: page.projectId,
        },
      });

      return positionBetween(last?.position ?? null, null);
    }

    return positionBetween(previous?.position ?? null, next?.position ?? null);
  }

  private async readSibling(
    tx: TransactionClient,
    page: PageRecord,
    parentPageId: string | null,
    siblingId: string | null,
  ): Promise<{ position: string } | null> {
    if (siblingId === null) {
      return null;
    }

    const sibling = await tx.page.findFirst({
      select: { parentPageId: true, position: true },
      where: { deletedAt: null, id: siblingId, projectId: page.projectId, ownerId: page.ownerId },
    });

    if (sibling === null) {
      throw new PageNotFoundError();
    }

    if (sibling.parentPageId !== parentPageId) {
      throw new SiblingParentMismatchError();
    }

    return { position: sibling.position };
  }

  findDeletedByOwner(ownerId: string): Promise<DeletedPageRecord[]> {
    // Плоский список: вложенность корзины собирает сервис, и собирает он её не по
    // `parentPageId`, а по источнику удаления — см. `PagesService`.
    return this.prisma.page.findMany({
      orderBy: [{ deletedAt: 'desc' }, { position: 'asc' }, { id: 'asc' }],
      select: DELETED_PAGE_FIELDS,
      where: { deletedAt: { not: null }, ownerId },
    }) as Promise<DeletedPageRecord[]>;
  }

  async softDelete(id: string, ownerId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Тот же ключ и то же место, что у `move`: иначе перемещение успело бы
      // вставить живое поддерево под страницу, которую мы в этот момент помечаем,
      // и живая страница осталась бы под удалённым предком, не нарушив ни одного FK.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      // Спуск не проходит сквозь уже удалённые узлы: их поддеревья помечены
      // раньше, и перемечать их нельзя — иначе страница, удалённая отдельно,
      // перестала бы быть самостоятельным корнем корзины.
      const deletedAt = new Date();
      const updated = await tx.$executeRaw`
        WITH RECURSIVE subtree AS (
          SELECT "id"
          FROM "Page"
          WHERE "id" = ${id}::uuid AND "ownerId" = ${ownerId}::uuid AND "deletedAt" IS NULL
          UNION ALL
          SELECT child."id"
          FROM "Page" child
          JOIN subtree ON child."parentPageId" = subtree."id"
          WHERE child."deletedAt" IS NULL
        )
        UPDATE "Page"
        SET "deletedAt" = ${deletedAt},
            "deletedOrigin" = CASE
              WHEN "id" = ${id}::uuid THEN 'SELF'::"PageDeletionOrigin"
              ELSE 'PARENT_PAGE'::"PageDeletionOrigin"
            END
        WHERE "id" IN (SELECT "id" FROM subtree)
      `;

      return updated > 0;
    });
  }

  async restore(id: string, ownerId: string, targetProjectId: string | null): Promise<PageRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      // Источник удаления восстановление не проверяет: вложенная страница не
      // отклоняется, а поднимается в корень — её прежний родитель остался в
      // корзине, и вернуть её на место некуда.
      const page = await tx.page.findFirst({
        select: PAGE_FIELDS,
        where: { deletedAt: { not: null }, id, ownerId },
      });

      if (page === null) {
        throw new PageNotFoundError();
      }

      const destinationProjectId = await this.resolveDestinationProject(
        tx,
        page,
        ownerId,
        targetProjectId,
      );
      const movesProject = destinationProjectId !== page.projectId;

      // Перенос идёт до снятия отметки и отдельным statement'ом: `onUpdate:
      // NoAction` у тройного FK означает, что база не протянет смену `projectId`
      // сама, а проверяет ограничения в конце statement'а. Предок и потомки
      // обязаны меняться одним запросом, иначе FK отвергнет первый же.
      //
      // Переносится всё физическое поддерево, включая вложенные поддеревья,
      // которые остаются удалёнными: ребёнок не может лежать в одном проекте с
      // родителем в другом, и оставить его позади нельзя.
      if (movesProject) {
        await tx.$executeRaw`
          WITH RECURSIVE subtree AS (
            SELECT "id" FROM "Page" WHERE "id" = ${id}::uuid
            UNION ALL
            SELECT child."id"
            FROM "Page" child
            JOIN subtree ON child."parentPageId" = subtree."id"
          )
          UPDATE "Page"
          SET "projectId" = ${destinationProjectId}::uuid
          WHERE "id" IN (SELECT "id" FROM subtree)
        `;
      }

      const raises = movesProject || (await this.parentIsGone(tx, page, ownerId));

      // Условие спуска — то же «удалена не самостоятельно», которым корзина
      // подвешивает узел к родителю: восстанавливается ровно то, что корзина
      // показывала вложенным. Проверка на `PARENT_PAGE` не забрала бы детей,
      // помеченных `PROJECT`, и вернула бы одинокий узел.
      await tx.$executeRaw`
        WITH RECURSIVE subtree AS (
          SELECT "id" FROM "Page" WHERE "id" = ${id}::uuid
          UNION ALL
          SELECT child."id"
          FROM "Page" child
          JOIN subtree ON child."parentPageId" = subtree."id"
          WHERE child."deletedOrigin" <> 'SELF'::"PageDeletionOrigin"
        )
        UPDATE "Page"
        SET "deletedAt" = NULL, "deletedOrigin" = NULL
        WHERE "id" IN (SELECT "id" FROM subtree)
      `;

      if (raises && (movesProject || page.parentPageId !== null)) {
        // Прежний ранг не переиспользуется: он считался среди братьев другого
        // уровня и мог бы совпасть с рангом существующей root-страницы.
        return tx.page.update({
          data: {
            parentPageId: null,
            position: await this.lastRootPosition(tx, destinationProjectId, ownerId, page.id),
          },
          select: PAGE_FIELDS,
          where: { id },
        });
      }

      return tx.page.findFirstOrThrow({ select: PAGE_FIELDS, where: { id } });
    });
  }

  /**
   * Живой собственный проект означает восстановление на место; удалённый —
   * обязательный проект назначения, потому что живой страницы в удалённом
   * проекте не бывает, а подъём в корень не помогает: корень принадлежит тому же
   * проекту.
   */
  private async resolveDestinationProject(
    tx: TransactionClient,
    page: PageRecord,
    ownerId: string,
    targetProjectId: string | null,
  ): Promise<string> {
    const own = await tx.project.findFirst({
      select: { deletedAt: true },
      where: { id: page.projectId, ownerId },
    });

    if (own !== null && own.deletedAt === null) {
      if (targetProjectId !== null && targetProjectId !== page.projectId) {
        throw new PageRestoreTargetProjectRejectedError();
      }

      return page.projectId;
    }

    if (targetProjectId === null) {
      throw new PageRestoreProjectDeletedError();
    }

    const target = await tx.project.findFirst({
      select: { id: true },
      where: { deletedAt: null, id: targetProjectId, ownerId },
    });

    if (target === null) {
      throw new ProjectNotFoundError();
    }

    return target.id;
  }

  private async parentIsGone(
    tx: TransactionClient,
    page: PageRecord,
    ownerId: string,
  ): Promise<boolean> {
    if (page.parentPageId === null) {
      return false;
    }

    const parent = await tx.page.findFirst({
      select: { id: true },
      where: { deletedAt: null, id: page.parentPageId, ownerId },
    });

    return parent === null;
  }

  async purge(id: string, ownerId: string, cascade: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      const page = await tx.page.findFirst({
        select: { id: true },
        where: { deletedAt: { not: null }, id, ownerId },
      });

      if (page === null) {
        throw new PageNotFoundError();
      }

      // Спуск идёт по всему физическому поддереву, а не только по удалённым: это
      // ровно то, что унесёт FK-каскад. Собираются только `SELF`-потомки —
      // корни корзины; их собственные ветки нарисованы под ними и отдельного
      // упоминания не требуют.
      const doomed = await tx.$queryRaw<{ title: string }[]>`
        WITH RECURSIVE subtree AS (
          SELECT "id", "title", "deletedOrigin" FROM "Page" WHERE "id" = ${id}::uuid
          UNION ALL
          SELECT child."id", child."title", child."deletedOrigin"
          FROM "Page" child
          JOIN subtree ON child."parentPageId" = subtree."id"
        )
        SELECT "title"
        FROM subtree
        WHERE "id" <> ${id}::uuid AND "deletedOrigin" = 'SELF'::"PageDeletionOrigin"
        ORDER BY "title" ASC, "id" ASC
      `;

      // Сбор и удаление — одна транзакция: иначе между ними вклинилась бы чужая
      // запись, и уничтожено было бы не то, что подтвердил вызывающий.
      if (doomed.length > 0 && !cascade) {
        throw new PurgeConfirmationRequiredError(doomed.map((row) => row.title));
      }

      // Поддерево и документы уносят физические FK-каскады — обходить нечего.
      await tx.page.delete({ where: { id } });
    });
  }

  async purgeTrash(ownerId: string): Promise<void> {
    // Подтверждения нет намеренно: очищается ровно то, что показывает корзина, и
    // ничего сверх неё не гибнет. Потомки уходят FK-каскадом, поэтому удаление
    // строк, чьи предки уже удалены этим же запросом, безвредно.
    await this.prisma.page.deleteMany({ where: { deletedAt: { not: null }, ownerId } });
  }

  /** Блокировка уровня берётся тем же ключом, что и у `create`, и в том же порядке. */
  private async lastRootPosition(
    tx: TransactionClient,
    projectId: string,
    ownerId: string,
    excludedId: string,
  ): Promise<string> {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${siblingLevelLockKey(projectId, null)}))`;

    const last = await tx.page.findFirst({
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
      where: { deletedAt: null, id: { not: excludedId }, ownerId, parentPageId: null, projectId },
    });

    return positionBetween(last?.position ?? null, null);
  }
}
