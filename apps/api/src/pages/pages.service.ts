import { Inject, Injectable } from '@nestjs/common';

import { PageNotFoundError } from './errors';
import { compareSiblings } from './helpers';
import { type DeletedPageRecord, type PageRecord, PagesRepository } from './pages.repository';

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
  constructor(@Inject(PagesRepository) private readonly pages: PagesRepository) {}

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
   * Дерево корзины отличается от живого двумя правилами.
   *
   * Вложенность — «удалена не самостоятельно», а не «есть родитель»: мягкое удаление
   * не трогает `parentPageId`, и страница, удалённая отдельно, физически лежит внутри
   * чужого поддерева. Условие через `SELF`, а не `PARENT_PAGE`: удаление проекта
   * помечает `PROJECT`, и проверка на `PARENT_PAGE` рассыпала бы его дерево.
   *
   * Корни сортируются по времени удаления: их ранги из разных групп братьев и
   * несравнимы — два корня могут иметь одинаковый `position`.
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

  private async requireOwnedPage(pageId: string, ownerId: string): Promise<PageRecord> {
    const page = await this.pages.findByIdForOwner(pageId, ownerId);

    if (page === null) {
      throw new PageNotFoundError();
    }

    return page;
  }
}

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
