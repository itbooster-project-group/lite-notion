import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TransactionRunner } from '../database/transaction';
import { InMemoryTransactionRunner } from '../database/transaction.in-memory';
import { PageDocumentRepository } from '../pages/page-document/page-document.repository';
import { InMemoryPageDocumentRepository } from '../pages/page-document/page-document.repository.in-memory';
import { PageDocumentService } from '../pages/page-document/page-document.service';
import { PagesRepository } from '../pages/pages.repository';
import { InMemoryPagesRepository, type StoredPage } from '../pages/pages.repository.in-memory';
import { PagesService } from '../pages/pages.service';
import { CreatePageUseCase } from '../pages/use-cases/create-page.use-case';
import { SoftDeletePageUseCase } from '../pages/use-cases/soft-delete-page.use-case';
import { ProjectNotFoundError } from './errors';
import { ProjectsRepository } from './projects.repository';
import { InMemoryProjectsRepository, type StoredProject } from './projects.repository.in-memory';
import { ProjectsService } from './projects.service';
import { RestoreProjectUseCase } from './use-cases/restore-project.use-case';
import { SoftDeleteProjectUseCase } from './use-cases/soft-delete-project.use-case';

const owner = '11111111-1111-1111-1111-111111111111';
const stranger = '22222222-2222-2222-2222-222222222222';
const missingId = '33333333-3333-4333-8333-333333333333';

/**
 * Корзина проектов: мягкое удаление с каскадом на страницы, восстановление и
 * список удалённых. Дерево страниц здесь участвует как следствие каскада,
 * поэтому в тесте поднят и `PagesService`.
 */
describe('ProjectsService: корзина', () => {
  let projectsService: ProjectsService;
  let softDeleteProject: SoftDeleteProjectUseCase;
  let restoreProject: RestoreProjectUseCase;
  let pagesService: PagesService;
  let createPageUseCase: CreatePageUseCase;
  let softDeletePageUseCase: SoftDeletePageUseCase;
  let pages: InMemoryPagesRepository;
  let projects: InMemoryProjectsRepository;
  let projectId: string;

  const createPage = async (overrides: { parentPageId?: string | null; title?: string } = {}) =>
    createPageUseCase.execute({
      ownerId: owner,
      parentPageId: overrides.parentPageId ?? null,
      projectId,
      title: overrides.title ?? '',
    });

  beforeEach(async () => {
    const pageStore = new Map<string, StoredPage>();
    const projectStore = new Map<string, StoredProject>();

    pages = new InMemoryPagesRepository(new Map(), projectStore, pageStore);
    projects = new InMemoryProjectsRepository(pageStore, projectStore);

    const moduleRef = await Test.createTestingModule({
      providers: [
        PagesService,
        ProjectsService,
        RestoreProjectUseCase,
        CreatePageUseCase,
        PageDocumentService,
        SoftDeletePageUseCase,
        SoftDeleteProjectUseCase,
        { provide: PagesRepository, useValue: pages },
        {
          provide: PageDocumentRepository,
          useValue: new InMemoryPageDocumentRepository(pages.documents, pages.pages),
        },
        { provide: ProjectsRepository, useValue: projects },
        { provide: TransactionRunner, useValue: new InMemoryTransactionRunner() },
      ],
    }).compile();

    projectsService = moduleRef.get(ProjectsService);
    softDeleteProject = moduleRef.get(SoftDeleteProjectUseCase);
    restoreProject = moduleRef.get(RestoreProjectUseCase);
    pagesService = moduleRef.get(PagesService);
    createPageUseCase = moduleRef.get(CreatePageUseCase);
    softDeletePageUseCase = moduleRef.get(SoftDeletePageUseCase);
    projectId = (await projectsService.create(owner, 'Workspace')).id;
  });

  describe('мягкое удаление', () => {
    it('убирает проект из списка и все его страницы из дерева', async () => {
      const root = await createPage({ title: 'root' });
      await createPage({ parentPageId: root.id, title: 'child' });

      await softDeleteProject.execute(projectId, owner);

      await expect(projectsService.listForOwner(owner)).resolves.toEqual([]);
      await expect(pagesService.findTree(owner)).resolves.toEqual([]);
    });

    it('помечает страницы источником «вместе с проектом»', async () => {
      const page = await createPage();

      await softDeleteProject.execute(projectId, owner);

      expect(pages.pages.get(page.id)?.deletedOrigin).toBe('PROJECT');
    });

    it('не перемечает страницу, удалённую раньше и самостоятельно', async () => {
      const page = await createPage();
      await softDeletePageUseCase.execute(page.id, owner);
      const deletedAtBefore = pages.pages.get(page.id)?.deletedAt;

      await softDeleteProject.execute(projectId, owner);

      expect(pages.pages.get(page.id)?.deletedOrigin).toBe('SELF');
      expect(pages.pages.get(page.id)?.deletedAt).toBe(deletedAtBefore);
    });

    it('не трогает соседний проект', async () => {
      const other = await projectsService.create(owner, 'Other');

      await softDeleteProject.execute(projectId, owner);

      await expect(projectsService.listForOwner(owner)).resolves.toEqual([other]);
    });

    it('отвечает одинаково на повторное удаление, чужой и несуществующий проект', async () => {
      await softDeleteProject.execute(projectId, owner);

      const repeated = await softDeleteProject.execute(projectId, owner).catch((error) => error);
      const missing = await softDeleteProject.execute(missingId, owner).catch((error) => error);
      const foreign = await softDeleteProject.execute(projectId, stranger).catch((error) => error);

      expect(repeated).toBeInstanceOf(ProjectNotFoundError);
      expect(missing.message).toBe(repeated.message);
      expect(foreign.message).toBe(repeated.message);
    });
  });

  describe('восстановление', () => {
    it('возвращает проект и его дерево в прежнем виде', async () => {
      const root = await createPage({ title: 'root' });
      await createPage({ parentPageId: root.id, title: 'child' });
      const before = await pagesService.findTree(owner);

      await softDeleteProject.execute(projectId, owner);
      await restoreProject.execute(projectId, owner);

      await expect(pagesService.findTree(owner)).resolves.toEqual(before);
    });

    it('не воскрешает страницу, удалённую раньше и самостоятельно', async () => {
      const kept = await createPage({ title: 'kept' });
      const dropped = await createPage({ title: 'dropped' });
      await softDeletePageUseCase.execute(dropped.id, owner);
      await softDeleteProject.execute(projectId, owner);

      await restoreProject.execute(projectId, owner);

      const tree = await pagesService.findTree(owner);

      expect(tree.map((node) => node.id)).toEqual([kept.id]);
      expect(pages.pages.get(dropped.id)?.deletedOrigin).toBe('SELF');
    });

    it('оставляет отдельно удалённую страницу корнем корзины', async () => {
      const dropped = await createPage({ title: 'dropped' });
      await softDeletePageUseCase.execute(dropped.id, owner);
      await softDeleteProject.execute(projectId, owner);
      await restoreProject.execute(projectId, owner);

      const trash = await pagesService.findDeletedTree(owner);

      expect(trash.map((node) => node.id)).toEqual([dropped.id]);
    });

    it('отвечает одинаково на неудалённый, чужой и несуществующий проект', async () => {
      const alive = await restoreProject.execute(projectId, owner).catch((error) => error);
      const missing = await restoreProject.execute(missingId, owner).catch((error) => error);

      expect(alive).toBeInstanceOf(ProjectNotFoundError);
      expect(missing.message).toBe(alive.message);
    });

    it('не восстанавливает чужой проект', async () => {
      await softDeleteProject.execute(projectId, owner);

      await expect(restoreProject.execute(projectId, stranger)).rejects.toBeInstanceOf(
        ProjectNotFoundError,
      );
      await expect(projectsService.listForOwner(owner)).resolves.toEqual([]);
    });
  });

  describe('список удалённых', () => {
    it('возвращает удалённые проекты с отметкой времени и без страниц', async () => {
      await createPage();
      await softDeleteProject.execute(projectId, owner);

      const deleted = await projectsService.listDeletedForOwner(owner);

      expect(deleted).toHaveLength(1);
      expect(deleted[0]).toMatchObject({ id: projectId, name: 'Workspace', ownerId: owner });
      expect(deleted[0]?.deletedAt).toBeInstanceOf(Date);
      expect(deleted[0]).not.toHaveProperty('pages');
    });

    it('не показывает ни живых, ни чужих проектов', async () => {
      await projectsService.create(owner, 'Alive');
      await projectsService.create(stranger, 'Foreign');
      await softDeleteProject.execute(projectId, owner);

      const deleted = await projectsService.listDeletedForOwner(owner);

      expect(deleted.map((project) => project.id)).toEqual([projectId]);
      await expect(projectsService.listDeletedForOwner(stranger)).resolves.toEqual([]);
    });

    it('ставит недавно удалённый проект первым', async () => {
      const older = await projectsService.create(owner, 'Older');
      const newer = await projectsService.create(owner, 'Newer');
      await softDeleteProject.execute(older.id, owner);
      await softDeleteProject.execute(newer.id, owner);

      // Отметки задаются явно: два удаления в одном тике дали бы ничью, и тест
      // проверял бы тай-брейк вместо правила «свежее сверху».
      (projects.records.get(older.id) as { deletedAt: Date }).deletedAt = new Date(1_000);
      (projects.records.get(newer.id) as { deletedAt: Date }).deletedAt = new Date(2_000);

      const deleted = await projectsService.listDeletedForOwner(owner);

      expect(deleted.map((project) => project.id)).toEqual([newer.id, older.id]);
    });

    it('возвращает пустой список, а не ошибку', async () => {
      await expect(projectsService.listDeletedForOwner(owner)).resolves.toEqual([]);
    });
  });

  describe('изоляция удалённого проекта', () => {
    it('не даёт создать страницу в удалённом проекте', async () => {
      await softDeleteProject.execute(projectId, owner);

      await expect(
        createPageUseCase.execute({
          ownerId: owner,
          parentPageId: null,
          projectId,
          title: 'nope',
        }),
      ).rejects.toBeInstanceOf(ProjectNotFoundError);
    });

    it('делает удалённый и несуществующий проект неразличимыми', async () => {
      await softDeleteProject.execute(projectId, owner);

      const create = (targetProjectId: string) =>
        createPageUseCase
          .execute({ ownerId: owner, parentPageId: null, projectId: targetProjectId, title: '' })
          .catch((error) => error);

      const deleted = await create(projectId);
      const missing = await create(missingId);

      expect(deleted).toBeInstanceOf(ProjectNotFoundError);
      expect(missing.message).toBe(deleted.message);
    });
  });
});
