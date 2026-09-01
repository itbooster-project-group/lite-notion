import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectNotFoundError } from '../projects/errors';
import { ProjectsRepository } from '../projects/projects.repository';
import {
  InMemoryProjectsRepository,
  type StoredProject,
} from '../projects/projects.repository.in-memory';
import { ProjectsService } from '../projects/projects.service';
import {
  PageNotFoundError,
  PageRestoreProjectDeletedError,
  PageRestoreTargetProjectRejectedError,
} from './errors';
import { PagesRepository } from './pages.repository';
import { InMemoryPagesRepository, type StoredPage } from './pages.repository.in-memory';
import { PagesService } from './pages.service';

const owner = '11111111-1111-1111-1111-111111111111';
const stranger = '22222222-2222-2222-2222-222222222222';
const missingId = '33333333-3333-4333-8333-333333333333';

/**
 * Корзина: мягкое удаление, восстановление и чтение удалённого дерева.
 *
 * Вынесено из `pages.service.spec.ts` отдельным файлом — там проверяется живое
 * дерево, здесь удалённое, и общего у наборов только фабрика страницы.
 */
describe('PagesService: корзина', () => {
  let service: PagesService;
  let pages: InMemoryPagesRepository;
  let projects: InMemoryProjectsRepository;
  let projectId: string;

  const createPage = async (overrides: { parentPageId?: string | null; title?: string } = {}) =>
    service.create({
      ownerId: owner,
      parentPageId: overrides.parentPageId ?? null,
      projectId,
      title: overrides.title ?? '',
    });

  beforeEach(async () => {
    // Хранилища общие на оба репозитория: в базе это отдельные таблицы одной
    // схемы, и каскад удаления проекта обязан быть виден через страницы.
    const pageStore = new Map<string, StoredPage>();
    const projectStore = new Map<string, StoredProject>();

    pages = new InMemoryPagesRepository(new Map(), projectStore, pageStore);
    projects = new InMemoryProjectsRepository(pageStore, projectStore);

    const moduleRef = await Test.createTestingModule({
      providers: [
        PagesService,
        ProjectsService,
        { provide: PagesRepository, useValue: pages },
        { provide: ProjectsRepository, useValue: projects },
      ],
    }).compile();

    service = moduleRef.get(PagesService);
    projectId = (await projects.create({ name: 'Workspace', ownerId: owner })).id;
  });

  describe('мягкое удаление', () => {
    it('помечает страницу и всё её живое поддерево', async () => {
      const root = await createPage({ title: 'root' });
      const child = await createPage({ parentPageId: root.id, title: 'child' });
      const grandchild = await createPage({ parentPageId: child.id, title: 'grandchild' });

      await service.softDelete(root.id, owner);

      await expect(service.findTree(owner)).resolves.toEqual([]);
      await expect(service.findById(grandchild.id, owner)).rejects.toBeInstanceOf(
        PageNotFoundError,
      );
    });

    it('различает источник удаления корня и его потомков', async () => {
      const root = await createPage({ title: 'root' });
      const child = await createPage({ parentPageId: root.id, title: 'child' });

      await service.softDelete(root.id, owner);

      expect(pages.pages.get(root.id)?.deletedOrigin).toBe('SELF');
      expect(pages.pages.get(child.id)?.deletedOrigin).toBe('PARENT_PAGE');
    });

    it('даёт всему поддереву одну отметку времени', async () => {
      const root = await createPage({ title: 'root' });
      const child = await createPage({ parentPageId: root.id, title: 'child' });

      await service.softDelete(root.id, owner);

      expect(pages.pages.get(child.id)?.deletedAt).toEqual(pages.pages.get(root.id)?.deletedAt);
    });

    it('не трогает соседнее поддерево', async () => {
      const first = await createPage({ title: 'first' });
      const second = await createPage({ title: 'second' });

      await service.softDelete(first.id, owner);

      const tree = await service.findTree(owner);

      expect(tree).toHaveLength(1);
      expect(tree[0]).toMatchObject({ id: second.id, position: second.position });
    });

    it('не перемечает ранее удалённое поддерево', async () => {
      const root = await createPage({ title: 'root' });
      const child = await createPage({ parentPageId: root.id, title: 'child' });
      await service.softDelete(child.id, owner);
      const deletedAtBefore = pages.pages.get(child.id)?.deletedAt;

      await service.softDelete(root.id, owner);

      expect(pages.pages.get(child.id)?.deletedOrigin).toBe('SELF');
      expect(pages.pages.get(child.id)?.deletedAt).toBe(deletedAtBefore);
    });

    it('отвечает одинаково на повторное удаление, чужую и несуществующую страницу', async () => {
      const page = await createPage();
      await service.softDelete(page.id, owner);

      const repeated = await service.softDelete(page.id, owner).catch((error) => error);
      const missing = await service.softDelete(missingId, owner).catch((error) => error);
      const foreign = await service.softDelete(page.id, stranger).catch((error) => error);

      expect(repeated).toBeInstanceOf(PageNotFoundError);
      expect(missing.message).toBe(repeated.message);
      expect(foreign.message).toBe(repeated.message);
    });
  });

  describe('восстановление', () => {
    it('возвращает поддерево целиком и на прежнее место', async () => {
      const root = await createPage({ title: 'root' });
      const child = await createPage({ parentPageId: root.id, title: 'child' });
      await service.softDelete(root.id, owner);

      await service.restore(root.id, owner, null);

      const tree = await service.findTree(owner);

      expect(tree).toHaveLength(1);
      expect(tree[0]?.children.map((node) => node.id)).toEqual([child.id]);
      expect(tree[0]).toMatchObject({ position: root.position });
    });

    it('не воскрешает поддерево, удалённое раньше и самостоятельно', async () => {
      const root = await createPage({ title: 'root' });
      const child = await createPage({ parentPageId: root.id, title: 'child' });
      const grandchild = await createPage({ parentPageId: child.id, title: 'grandchild' });
      await service.softDelete(child.id, owner);
      await service.softDelete(root.id, owner);

      await service.restore(root.id, owner, null);

      const tree = await service.findTree(owner);

      expect(tree.map((node) => node.id)).toEqual([root.id]);
      expect(tree[0]?.children).toEqual([]);
      await expect(service.findById(grandchild.id, owner)).rejects.toBeInstanceOf(
        PageNotFoundError,
      );
    });

    it('поднимает в корень каскадно удалённого потомка', async () => {
      const root = await createPage({ title: 'root' });
      const child = await createPage({ parentPageId: root.id, title: 'child' });
      const grandchild = await createPage({ parentPageId: child.id, title: 'grandchild' });
      await service.softDelete(root.id, owner);

      const restored = await service.restore(child.id, owner, null);

      expect(restored.parentPageId).toBeNull();

      const tree = await service.findTree(owner);

      // Поддерево уехало вместе с поднятой страницей, предок остался в корзине.
      expect(tree.map((node) => node.id)).toEqual([child.id]);
      expect(tree[0]?.children.map((node) => node.id)).toEqual([grandchild.id]);
      expect(pages.pages.get(root.id)?.deletedAt).not.toBeNull();
    });

    it('не трогает поднятую страницу при последующем восстановлении её прежнего предка', async () => {
      const root = await createPage({ title: 'root' });
      const child = await createPage({ parentPageId: root.id, title: 'child' });
      await service.softDelete(root.id, owner);
      await service.restore(child.id, owner, null);

      await service.restore(root.id, owner, null);

      const tree = await service.findTree(owner);

      expect(tree.map((node) => node.id).sort()).toEqual([child.id, root.id].sort());
      expect(tree.every((node) => node.children.length === 0)).toBe(true);
    });

    it('поднимает страницу в корень, когда её родитель остался удалённым', async () => {
      const root = await createPage({ title: 'root' });
      const child = await createPage({ parentPageId: root.id, title: 'child' });
      const grandchild = await createPage({ parentPageId: child.id, title: 'grandchild' });
      await service.softDelete(child.id, owner);
      await service.softDelete(root.id, owner);

      const restored = await service.restore(child.id, owner, null);

      expect(restored.parentPageId).toBeNull();

      const tree = await service.findTree(owner);

      expect(tree.map((node) => node.id)).toEqual([child.id]);
      expect(tree[0]?.children.map((node) => node.id)).toEqual([grandchild.id]);
    });

    it('ставит поднятую страницу последней среди root-страниц, не трогая их рангов', async () => {
      const first = await createPage({ title: 'first' });
      const second = await createPage({ title: 'second' });
      const child = await createPage({ parentPageId: first.id, title: 'child' });
      await service.softDelete(child.id, owner);
      await service.softDelete(first.id, owner);

      const restored = await service.restore(child.id, owner, null);

      const tree = await service.findTree(owner);

      expect(tree.map((node) => node.id)).toEqual([second.id, restored.id]);
      expect(tree[0]?.position).toBe(second.position);
      expect(restored.position > second.position).toBe(true);
    });

    it('возвращает страницу под родителя, если тот успел ожить', async () => {
      const parent = await createPage({ title: 'parent' });
      const child = await createPage({ parentPageId: parent.id, title: 'child' });
      await service.softDelete(child.id, owner);
      await service.softDelete(parent.id, owner);
      await service.restore(parent.id, owner, null);

      const restored = await service.restore(child.id, owner, null);

      expect(restored).toMatchObject({ parentPageId: parent.id, position: child.position });

      const tree = await service.findTree(owner);

      expect(tree[0]?.children.map((node) => node.id)).toEqual([child.id]);
    });

    it('отказывает, пока проект страницы лежит в корзине', async () => {
      const page = await createPage();
      await service.softDelete(page.id, owner);
      await projects.softDelete(projectId, owner);

      await expect(service.restore(page.id, owner, null)).rejects.toBeInstanceOf(
        PageRestoreProjectDeletedError,
      );
    });

    it('отвечает одинаково на неудалённую и несуществующую страницу', async () => {
      const page = await createPage();

      const alive = await service.restore(page.id, owner, null).catch((error) => error);
      const missing = await service.restore(missingId, owner, null).catch((error) => error);

      expect(alive).toBeInstanceOf(PageNotFoundError);
      expect(missing.message).toBe(alive.message);
    });

    it('не восстанавливает чужую страницу', async () => {
      const page = await createPage();
      await service.softDelete(page.id, owner);

      await expect(service.restore(page.id, stranger, null)).rejects.toBeInstanceOf(
        PageNotFoundError,
      );
      expect(pages.pages.get(page.id)?.deletedAt).not.toBeNull();
    });

    it('делает удаление и восстановление обратимыми', async () => {
      await createPage({ title: 'first' });
      const second = await createPage({ title: 'second' });
      await createPage({ parentPageId: second.id, title: 'child' });
      const before = await service.findTree(owner);

      await service.softDelete(second.id, owner);
      await service.restore(second.id, owner, null);

      await expect(service.findTree(owner)).resolves.toEqual(before);
    });
  });

  describe('чтение корзины', () => {
    it('возвращает удалённое поддерево одним корнем', async () => {
      const root = await createPage({ title: 'root' });
      const child = await createPage({ parentPageId: root.id, title: 'child' });
      await createPage({ title: 'alive' });
      await service.softDelete(root.id, owner);

      const trash = await service.findDeletedTree(owner);

      expect(trash.map((node) => node.id)).toEqual([root.id]);
      expect(trash[0]?.children.map((node) => node.id)).toEqual([child.id]);
      expect(trash[0]?.deletedAt).toBeInstanceOf(Date);
    });

    it('показывает отдельно удалённое поддерево отдельным корнем', async () => {
      const root = await createPage({ title: 'root' });
      const child = await createPage({ parentPageId: root.id, title: 'child' });
      await service.softDelete(child.id, owner);
      await service.softDelete(root.id, owner);

      const trash = await service.findDeletedTree(owner);

      // Порядок здесь не проверяется: обе пометки могут попасть в один
      // миллисекунд, и корни разойдутся по тай-брейку. Порядок проверяет
      // отдельный тест, задающий отметки времени явно.
      expect(trash.map((node) => node.id).sort()).toEqual([root.id, child.id].sort());
      expect(trash.every((node) => node.children.length === 0)).toBe(true);
    });

    it('ставит недавно удалённый корень первым', async () => {
      const older = await createPage({ title: 'older' });
      const newer = await createPage({ title: 'newer' });
      await service.softDelete(older.id, owner);
      await service.softDelete(newer.id, owner);

      // Отметки задаются явно: `new Date()` внутри одного тика даёт ничью, и
      // тест проверял бы тай-брейк вместо правила «свежее сверху».
      (pages.pages.get(older.id) as { deletedAt: Date }).deletedAt = new Date(1_000);
      (pages.pages.get(newer.id) as { deletedAt: Date }).deletedAt = new Date(2_000);

      const trash = await service.findDeletedTree(owner);

      expect(trash.map((node) => node.id)).toEqual([newer.id, older.id]);
    });

    it('возвращает одинаковый порядок при двух чтениях подряд', async () => {
      const first = await createPage({ title: 'first' });
      const second = await createPage({ title: 'second' });
      await service.softDelete(first.id, owner);
      await service.softDelete(second.id, owner);

      const [left, right] = await Promise.all([
        service.findDeletedTree(owner),
        service.findDeletedTree(owner),
      ]);

      expect(left.map((node) => node.id)).toEqual(right.map((node) => node.id));
    });

    it('сохраняет вложенность страниц удалённого проекта', async () => {
      const root = await createPage({ title: 'root' });
      const child = await createPage({ parentPageId: root.id, title: 'child' });

      await projects.softDelete(projectId, owner);

      const trash = await service.findDeletedTree(owner);

      expect(trash.map((node) => node.id)).toEqual([root.id]);
      expect(trash[0]?.children.map((node) => node.id)).toEqual([child.id]);
    });

    it('не показывает ни живых, ни чужих страниц', async () => {
      const mine = await createPage({ title: 'mine' });
      await createPage({ title: 'alive' });
      await service.softDelete(mine.id, owner);

      await expect(service.findDeletedTree(stranger)).resolves.toEqual([]);
      await expect(service.findDeletedTree(owner)).resolves.toHaveLength(1);
    });

    it('возвращает пустой список, а не ошибку', async () => {
      await expect(service.findDeletedTree(owner)).resolves.toEqual([]);
    });
  });

  describe('восстановление в другой проект', () => {
    it('возвращает страницу и её вложенную ветку в указанный проект', async () => {
      const root = await createPage({ title: 'root' });
      const child = await createPage({ parentPageId: root.id, title: 'child' });
      const other = await projects.create({ name: 'Other', ownerId: owner });
      await projects.softDelete(projectId, owner);

      const restored = await service.restore(root.id, owner, other.id);

      expect(restored).toMatchObject({ parentPageId: null, projectId: other.id });
      // Ветка была нарисована вложенной в корзине — возвращается вместе с корнем.
      expect(pages.pages.get(child.id)).toMatchObject({
        deletedAt: null,
        parentPageId: root.id,
        projectId: other.id,
      });
    });

    it('ставит перенесённую страницу последней среди root-страниц назначения', async () => {
      const page = await createPage({ title: 'page' });
      const other = await projects.create({ name: 'Other', ownerId: owner });
      const existing = await service.create({
        ownerId: owner,
        parentPageId: null,
        projectId: other.id,
        title: 'existing',
      });
      await projects.softDelete(projectId, owner);

      const restored = await service.restore(page.id, owner, other.id);

      expect(restored.position > existing.position).toBe(true);
      expect(pages.pages.get(existing.id)?.position).toBe(existing.position);
    });

    it('уводит удалённое вложенное поддерево за переносимой страницей', async () => {
      const root = await createPage({ title: 'root' });
      const dropped = await createPage({ parentPageId: root.id, title: 'dropped' });
      await service.softDelete(dropped.id, owner);
      const other = await projects.create({ name: 'Other', ownerId: owner });
      await projects.softDelete(projectId, owner);

      await service.restore(root.id, owner, other.id);

      // Осталась удалённой, но проект сменила: иначе ребёнок лежал бы в одном
      // проекте, а родитель в другом.
      expect(pages.pages.get(dropped.id)).toMatchObject({
        deletedOrigin: 'SELF',
        projectId: other.id,
      });
      expect(pages.pages.get(dropped.id)?.deletedAt).not.toBeNull();
    });

    it('позволяет восстановить уведённое поддерево уже в новом проекте', async () => {
      const root = await createPage({ title: 'root' });
      const dropped = await createPage({ parentPageId: root.id, title: 'dropped' });
      await service.softDelete(dropped.id, owner);
      const other = await projects.create({ name: 'Other', ownerId: owner });
      await projects.softDelete(projectId, owner);
      await service.restore(root.id, owner, other.id);

      const restored = await service.restore(dropped.id, owner, null);

      expect(restored.projectId).toBe(other.id);
    });

    it('отклоняет проект назначения, когда собственный проект жив', async () => {
      const page = await createPage({ title: 'page' });
      const other = await projects.create({ name: 'Other', ownerId: owner });
      await service.softDelete(page.id, owner);

      await expect(service.restore(page.id, owner, other.id)).rejects.toBeInstanceOf(
        PageRestoreTargetProjectRejectedError,
      );
    });

    it('отвечает одинаково на чужой, удалённый и несуществующий проект назначения', async () => {
      const page = await createPage({ title: 'page' });
      const foreign = await projects.create({ name: 'Foreign', ownerId: stranger });
      const deleted = await projects.create({ name: 'Deleted', ownerId: owner });
      await projects.softDelete(deleted.id, owner);
      await projects.softDelete(projectId, owner);

      const foreignError = await service
        .restore(page.id, owner, foreign.id)
        .catch((error) => error);
      const deletedError = await service
        .restore(page.id, owner, deleted.id)
        .catch((error) => error);
      const missingError = await service.restore(page.id, owner, missingId).catch((error) => error);

      expect(foreignError).toBeInstanceOf(ProjectNotFoundError);
      expect(deletedError.message).toBe(foreignError.message);
      expect(missingError.message).toBe(foreignError.message);
    });
  });
});
