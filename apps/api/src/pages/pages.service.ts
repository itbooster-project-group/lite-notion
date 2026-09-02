import { Inject, Injectable } from '@nestjs/common';

import { ProjectsService } from '../projects/projects.service';
import { TIPTAP_SCHEMA_VERSION } from './constants';
import { PageNotFoundError, PageProjectMismatchError } from './errors';
import { compareSiblings } from './helpers';
import { type DeletedPageRecord, type PageRecord, PagesRepository } from './pages.repository';

export interface CreatePageCommand {
  ownerId: string;
  projectId: string;
  parentPageId: string | null;
  title: string;
}

export interface MovePageCommand {
  ownerId: string;
  pageId: string;
  parentPageId: string | null;
  previousSiblingId: string | null;
  nextSiblingId: string | null;
}

export interface PageTreeNode extends PageRecord {
  children: PageTreeNode[];
}

export interface DeletedPageTreeNode extends DeletedPageRecord {
  children: DeletedPageTreeNode[];
}

/**
 * Правила, которыми отличается сборка корзины от сборки живого дерева. Оба
 * прохода одинаковы во всём остальном, поэтому вынесены в один helper: иначе
 * порядок братьев и детерминированность пришлось бы поддерживать дважды.
 */
interface TreeShape<TRow> {
  /** Подвешивать ли узел к родителю, если родитель есть в выдаче. */
  nests: (row: TRow) => boolean;
  /** Порядок корней выдачи. Братья внутри всегда сравниваются по рангу. */
  compareRoots: (left: TRow, right: TRow) => number;
}

@Injectable()
export class PagesService {
  constructor(
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(ProjectsService) private readonly projects: ProjectsService,
  ) {}

  async create(command: CreatePageCommand): Promise<PageRecord> {
    // Проект проверяется всегда, даже когда есть родитель: иначе клиент мог бы
    // подставить чужой projectId и узнать по коду ответа, существует ли он.
    await this.projects.requireOwned(command.projectId, command.ownerId);

    if (command.parentPageId !== null) {
      const parent = await this.requireOwnedPage(command.parentPageId, command.ownerId);

      if (parent.projectId !== command.projectId) {
        throw new PageProjectMismatchError();
      }
    }

    return this.pages.create({
      createdById: command.ownerId,
      ownerId: command.ownerId,
      parentPageId: command.parentPageId,
      projectId: command.projectId,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      title: command.title,
    });
  }

  /**
   * Собирает вложенность из плоского списка за один проход. Страница, чей
   * родитель отфильтрован как удалённый, становится корнем выдачи, а не
   * исчезает: потерять поддерево молча хуже, чем показать его выше по уровню.
   */
  async findTree(ownerId: string): Promise<PageTreeNode[]> {
    return assembleTree(await this.pages.findAllByOwner(ownerId), {
      compareRoots: compareSiblings,
      nests: () => true,
    });
  }

  /**
   * Дерево корзины. Отличается от живого двумя правилами, и только ими.
   *
   * Мягкое удаление не трогает `parentPageId` — он нужен восстановлению, — поэтому
   * страница, удалённая отдельно и раньше своего предка, физически лежит внутри
   * его поддерева. Подвешивать её туда нельзя: пользователь удалял её сам, и
   * восстанавливается она отдельно. Отсюда правило вложенности «удалена не
   * самостоятельно», а не «есть родитель».
   *
   * Правило сформулировано через `SELF`, а не через `PARENT_PAGE`: удаление
   * проекта помечает `PROJECT` и root-страницы, и вложенные, и проверка на
   * `PARENT_PAGE` рассыпала бы дерево удалённого проекта в плоский список корней.
   *
   * Корни сортируются по времени удаления, а не по рангу: они приходят с разных
   * уровней живого дерева, их ранги из разных групп братьев и несравнимы — два
   * корня вполне могут иметь одинаковый `position`.
   */
  async findDeletedTree(ownerId: string): Promise<DeletedPageTreeNode[]> {
    return assembleTree(await this.pages.findDeletedByOwner(ownerId), {
      // Тай-брейк по `id`, а не по рангу: отметка времени у поддерева одна на
      // всех, и ничья здесь — частый случай, а не край. Ранги корней сравнивать
      // нельзя — они из разных групп братьев.
      compareRoots: (left, right) =>
        right.deletedAt.getTime() - left.deletedAt.getTime() || compareIds(left, right),
      nests: (node) => node.deletedOrigin !== 'SELF',
    });
  }

  async softDelete(pageId: string, ownerId: string): Promise<void> {
    if (!(await this.pages.softDelete(pageId, ownerId))) {
      throw new PageNotFoundError();
    }
  }

  /**
   * Правила восстановления — корень корзины, живой проект, подъём из-под
   * удалённого родителя — живут в репозитории: все они читают строки, которые
   * параллельная транзакция может изменить, и обязаны идти под одной блокировкой
   * с записью. Разнести их по слоям значило бы проверить дерево до блокировки.
   */
  restore(pageId: string, ownerId: string, targetProjectId: string | null): Promise<PageRecord> {
    return this.pages.restore(pageId, ownerId, targetProjectId);
  }

  /**
   * Проверка подтверждения тоже в репозитории: перечень обречённых записей и
   * само удаление обязаны идти одной транзакцией, иначе между ними вклинилась бы
   * чужая запись и уничтожено было бы не то, что подтвердил вызывающий.
   */
  purge(pageId: string, ownerId: string, cascade: boolean): Promise<void> {
    return this.pages.purge(pageId, ownerId, cascade);
  }

  purgeTrash(ownerId: string): Promise<void> {
    return this.pages.purgeTrash(ownerId);
  }

  findById(pageId: string, ownerId: string): Promise<PageRecord> {
    return this.requireOwnedPage(pageId, ownerId);
  }

  async rename(pageId: string, ownerId: string, title: string): Promise<PageRecord> {
    const page = await this.pages.rename(pageId, ownerId, title);

    if (page === null) {
      throw new PageNotFoundError();
    }

    return page;
  }

  /**
   * Проверка владельца, проверка цикла и запись живут в репозитории: они обязаны
   * идти в одной транзакции под advisory lock, а разнести их по слоям значило бы
   * проверить дерево до блокировки.
   */
  move(command: MovePageCommand): Promise<PageRecord> {
    return this.pages.move({
      nextSiblingId: command.nextSiblingId,
      ownerId: command.ownerId,
      pageId: command.pageId,
      parentPageId: command.parentPageId,
      previousSiblingId: command.previousSiblingId,
    });
  }

  private async requireOwnedPage(pageId: string, ownerId: string): Promise<PageRecord> {
    const page = await this.pages.findByIdForOwner(pageId, ownerId);

    if (page === null) {
      throw new PageNotFoundError();
    }

    return page;
  }
}

/** Узел выдачи: та же строка плюс её дети. */
type TreeNode<TRow> = TRow & { children: TreeNode<TRow>[] };

function compareIds(left: { id: string }, right: { id: string }): number {
  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? -1 : 1;
}

/**
 * Один проход по плоскому списку: узел подвешивается к родителю, только если тот
 * есть в выдаче и правило вложенности это разрешает. Всё остальное — корни.
 */
function assembleTree<TRow extends { id: string; parentPageId: string | null; position: string }>(
  rows: readonly TRow[],
  shape: TreeShape<TRow>,
): TreeNode<TRow>[] {
  const nodes = new Map<string, TreeNode<TRow>>(
    rows.map((row) => [row.id, { ...row, children: [] } as TreeNode<TRow>]),
  );
  const roots: TreeNode<TRow>[] = [];

  for (const node of nodes.values()) {
    const parent = node.parentPageId === null ? undefined : nodes.get(node.parentPageId);

    if (parent === undefined || !shape.nests(node)) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }

  for (const node of nodes.values()) {
    node.children.sort(compareSiblings);
  }

  return roots.sort(shape.compareRoots);
}
