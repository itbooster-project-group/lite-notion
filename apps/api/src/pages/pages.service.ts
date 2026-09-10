import type { PageAccessMode } from '@lite-notion/database/enums';
import { PageRole } from '@lite-notion/page-permissions';
import { Inject, Injectable } from '@nestjs/common';

import type { AccessiblePageRow } from '../page-permissions/page-permissions.repository';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { PageNotFoundError } from './errors';
import { compareSiblings } from './helpers';
import { type DeletedPageRecord, type PageRecord, PagesRepository } from './pages.repository';

export interface PageTreeNode extends PageRecord {
  children: PageTreeNode[];
}

/**
 * Страница вместе с эффективной ролью спрашивающего. Поле рядом с записью, а не
 * обёртка: роль — такая же часть ответа, как заголовок, и вызывающим удобнее читать
 * `page.id`, чем разбирать пару.
 */
export interface PageWithRole extends PageRecord {
  role: PageRole;
}

export interface DeletedPageTreeNode extends DeletedPageRecord {
  children: DeletedPageTreeNode[];
}

/** Узел выдачи доступных страниц: у каждого своя роль — побеждает ближайшая. */
export interface AccessiblePageTreeNode extends AccessiblePageRow {
  children: AccessiblePageTreeNode[];
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
    @Inject(PagePermissionsService) private readonly permissions: PagePermissionsService,
  ) {}

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

  /**
   * Чтение — минимальное, что даёт любое разрешение, поэтому `viewer`. Роль
   * возвращается вместе со страницей: контроллеру она нужна для ответа, а второй
   * запрос за ней был бы лишним.
   */
  /**
   * Доступные чужие страницы с вложенностью. Корни приходят с разных уровней чужих
   * деревьев, поэтому сравниваются по заголовку и `id`: их ранги из разных групп
   * братьев и между собой несравнимы.
   */
  async findAccessibleTree(userId: string): Promise<AccessiblePageTreeNode[]> {
    const rows = await this.permissions.findAccessiblePages(userId);

    return assembleTree(rows, {
      compareRoots: (left, right) => compareTitles(left, right) || compareIds(left, right),
      nests: () => true,
    });
  }

  async findById(pageId: string, userId: string): Promise<PageWithRole> {
    const role = await this.permissions.requireRole(userId, pageId, PageRole.VIEWER);

    return { ...(await this.requireLivePage(pageId)), role };
  }

  /** Заголовок — часть содержимого страницы, а не структуры дерева, поэтому `editor`. */
  async rename(pageId: string, userId: string, title: string): Promise<PageWithRole> {
    const role = await this.permissions.requireRole(userId, pageId, PageRole.EDITOR);
    const page = await this.pages.rename(pageId, title);

    if (page === null) {
      throw new PageNotFoundError();
    }

    return { ...page, role };
  }

  /**
   * Переключение режима наследования. Требует `owner`: границу доступа двигает только
   * хозяин дерева. Идемпотентно и не трогает ни заголовок, ни родителя, ни ранг, ни
   * прямые разрешения — меняется одна колонка.
   */
  async setAccessMode(
    pageId: string,
    userId: string,
    accessMode: PageAccessMode,
  ): Promise<PageWithRole> {
    const role = await this.permissions.requireRole(userId, pageId, PageRole.OWNER);
    const page = await this.pages.setAccessMode(pageId, accessMode);

    if (page === null) {
      throw new PageNotFoundError();
    }

    return { ...page, role };
  }

  /**
   * Страница уже прошла проверку прав, поэтому `null` здесь означает не отказ, а
   * гонку: её удалили между проверкой и чтением. Ответ тот же `404`.
   */
  private async requireLivePage(pageId: string): Promise<PageRecord> {
    const page = await this.pages.findLiveById(pageId);

    if (page === null) {
      throw new PageNotFoundError();
    }

    return page;
  }
}

type TreeNode<TRow> = TRow & { children: TreeNode<TRow>[] };

function compareTitles(left: { title: string }, right: { title: string }): number {
  if (left.title === right.title) {
    return 0;
  }

  return left.title < right.title ? -1 : 1;
}

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
