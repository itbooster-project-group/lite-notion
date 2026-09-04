import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TransactionRunner } from '../database/transaction';
import { InMemoryTransactionRunner } from '../database/transaction.in-memory';
import { ProjectNotFoundError } from '../projects/errors';
import { ProjectsRepository } from '../projects/projects.repository';
import {
  InMemoryProjectsRepository,
  type StoredProject,
} from '../projects/projects.repository.in-memory';
import { ProjectsService } from '../projects/projects.service';
import { TIPTAP_SCHEMA_VERSION } from './constants';
import {
  NextSiblingNotFoundError,
  PageCycleError,
  PageNotFoundError,
  PageParentNotFoundError,
  PageProjectMismatchError,
  PreviousSiblingNotFoundError,
  SiblingOrderError,
  SiblingParentMismatchError,
  SiblingsNotAdjacentError,
} from './errors';
import { positionBetween } from './helpers';
import { PageDocumentRepository } from './page-document/page-document.repository';
import { InMemoryPageDocumentRepository } from './page-document/page-document.repository.in-memory';
import { PageDocumentService } from './page-document/page-document.service';
import { PagesRepository } from './pages.repository';
import { InMemoryPagesRepository, type StoredPage } from './pages.repository.in-memory';
import { PagesService } from './pages.service';
import { CreatePageUseCase } from './use-cases/create-page.use-case';
import { MovePageUseCase } from './use-cases/move-page.use-case';

const owner = '11111111-1111-1111-1111-111111111111';
const stranger = '22222222-2222-2222-2222-222222222222';
const missingId = '33333333-3333-4333-8333-333333333333';

describe('PagesService', () => {
  let service: PagesService;
  let createPageUseCase: CreatePageUseCase;
  let movePageUseCase: MovePageUseCase;
  let pages: InMemoryPagesRepository;
  let documents: InMemoryPageDocumentRepository;
  let projects: InMemoryProjectsRepository;
  let projectId: string;

  const createPage = async (
    overrides: { parentPageId?: string | null; title?: string; projectId?: string } = {},
  ) =>
    createPageUseCase.execute({
      ownerId: owner,
      parentPageId: overrides.parentPageId ?? null,
      projectId: overrides.projectId ?? projectId,
      title: overrides.title ?? '',
    });

  beforeEach(async () => {
    // Хранилища общие на оба репозитория: в базе это отдельные таблицы одной схемы,
    // и каскад удаления проекта обязан быть виден через репозиторий страниц.
    const pageStore = new Map<string, StoredPage>();
    const projectStore = new Map<string, StoredProject>();
    pages = new InMemoryPagesRepository(new Map(), projectStore, pageStore);
    documents = new InMemoryPageDocumentRepository(pages.documents, pages.pages);
    projects = new InMemoryProjectsRepository(pageStore, projectStore);

    const moduleRef = await Test.createTestingModule({
      providers: [
        PagesService,
        ProjectsService,
        CreatePageUseCase,
        PageDocumentService,
        MovePageUseCase,
        { provide: PagesRepository, useValue: pages },
        { provide: PageDocumentRepository, useValue: documents },
        { provide: ProjectsRepository, useValue: projects },
        { provide: TransactionRunner, useValue: new InMemoryTransactionRunner() },
      ],
    }).compile();

    service = moduleRef.get(PagesService);
    createPageUseCase = moduleRef.get(CreatePageUseCase);
    movePageUseCase = moduleRef.get(MovePageUseCase);
    projectId = (await projects.create({ name: 'Workspace', ownerId: owner })).id;
  });

  describe('создание', () => {
    it('создаёт root-страницу с владельцем и создателем из текущего пользователя', async () => {
      const page = await createPage();

      expect(page).toMatchObject({
        createdById: owner,
        ownerId: owner,
        parentPageId: null,
        projectId,
      });
    });

    it('создаёт документ вместе со страницей', async () => {
      const page = await createPage();

      // Содержимое читается через подмодуль документа; здесь проверяется только
      // сам факт, что строка появилась в той же операции, что и страница.
      expect(pages.documents.get(page.id)).toEqual({
        storageRevision: 0,
        tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
        yjsState: new Uint8Array(),
      });
    });

    it('наследует владельца и проект от родителя', async () => {
      const parent = await createPage();
      const child = await createPage({ parentPageId: parent.id });

      expect(child).toMatchObject({ ownerId: parent.ownerId, projectId: parent.projectId });
    });

    it('создаёт страницу с пустым заголовком, а не отклоняет запрос', async () => {
      await expect(createPage({ title: '' })).resolves.toMatchObject({ title: '' });
    });

    it('помещает новую страницу последней среди братьев', async () => {
      const first = await createPage({ title: 'first' });
      const second = await createPage({ title: 'second' });

      expect(second.position > first.position).toBe(true);
    });

    // Откат проверяется на живой базе: двойник транзакции не воспроизводит.
    it('отказывает, если документ не создался', async () => {
      documents.failInsert = true;

      await expect(createPage()).rejects.toThrow();
    });
  });

  describe('проект при создании', () => {
    it('отвечает одинаково на чужой и на несуществующий проект', async () => {
      const foreign = await projects.create({ name: 'Not yours', ownerId: stranger });

      const foreignError = await createPage({ projectId: foreign.id }).catch((error) => error);
      const missingError = await createPage({ projectId: missingId }).catch((error) => error);

      expect(foreignError).toBeInstanceOf(ProjectNotFoundError);
      expect(missingError).toBeInstanceOf(ProjectNotFoundError);
      expect(foreignError.message).toBe(missingError.message);
    });

    it('отклоняет проект, не совпадающий с проектом родителя', async () => {
      const other = await projects.create({ name: 'Other', ownerId: owner });
      const parent = await createPage();

      await expect(
        createPage({ parentPageId: parent.id, projectId: other.id }),
      ).rejects.toBeInstanceOf(PageProjectMismatchError);
    });
  });

  describe('родитель при создании', () => {
    it('отвечает одинаково на чужого и на несуществующего родителя', async () => {
      const foreignProject = await projects.create({ name: 'Theirs', ownerId: stranger });
      const foreignPage = await pages.insert({
        createdById: stranger,
        ownerId: stranger,
        parentPageId: null,
        position: positionBetween(null, null),
        projectId: foreignProject.id,
        title: 'theirs',
      });

      const foreignError = await createPage({ parentPageId: foreignPage.id }).catch((e) => e);
      const missingError = await createPage({ parentPageId: missingId }).catch((e) => e);

      expect(foreignError).toBeInstanceOf(PageParentNotFoundError);
      expect(missingError).toBeInstanceOf(PageParentNotFoundError);
      expect(foreignError.message).toBe(missingError.message);
      await expect(service.findTree(owner)).resolves.toEqual([]);
    });
  });

  describe('чтение дерева', () => {
    it('возвращает вложенность нескольких уровней', async () => {
      const root = await createPage({ title: 'root' });
      const child = await createPage({ parentPageId: root.id, title: 'child' });
      const grandchild = await createPage({ parentPageId: child.id, title: 'grandchild' });

      const tree = await service.findTree(owner);

      expect(tree).toHaveLength(1);
      expect(tree[0]?.id).toBe(root.id);
      expect(tree[0]?.children[0]?.id).toBe(child.id);
      expect(tree[0]?.children[0]?.children[0]?.id).toBe(grandchild.id);
    });

    it('возвращает пустое дерево, а не ошибку', async () => {
      await expect(service.findTree(owner)).resolves.toEqual([]);
    });

    it('не показывает страницы другого владельца', async () => {
      const foreignProject = await projects.create({ name: 'Theirs', ownerId: stranger });
      await pages.insert({
        createdById: stranger,
        ownerId: stranger,
        parentPageId: null,
        position: positionBetween(null, null),
        projectId: foreignProject.id,
        title: 'theirs',
      });
      const mine = await createPage({ title: 'mine' });

      const tree = await service.findTree(owner);

      expect(tree.map((node) => node.id)).toEqual([mine.id]);
    });

    it('не показывает страницы с проставленной отметкой удаления', async () => {
      const visible = await createPage({ title: 'visible' });
      const deleted = await createPage({ title: 'deleted' });

      const stored = pages.pages.get(deleted.id);
      if (stored !== undefined) {
        stored.deletedAt = new Date();
      }

      const tree = await service.findTree(owner);

      expect(tree.map((node) => node.id)).toEqual([visible.id]);
    });

    it('возвращает братьев в одинаковом порядке при повторном чтении', async () => {
      await createPage({ title: 'a' });
      await createPage({ title: 'b' });
      await createPage({ title: 'c' });

      const first = await service.findTree(owner);
      const second = await service.findTree(owner);

      expect(second.map((node) => node.id)).toEqual(first.map((node) => node.id));
    });
  });

  describe('чтение одной страницы', () => {
    it('возвращает свою страницу', async () => {
      const page = await createPage();

      await expect(service.findById(page.id, owner)).resolves.toMatchObject({ id: page.id });
    });

    it('отвечает одинаково на чужую, удалённую и несуществующую страницу', async () => {
      const foreignProject = await projects.create({ name: 'Theirs', ownerId: stranger });
      const foreign = await pages.insert({
        createdById: stranger,
        ownerId: stranger,
        parentPageId: null,
        position: positionBetween(null, null),
        projectId: foreignProject.id,
        title: 'theirs',
      });
      const deleted = await createPage();
      const stored = pages.pages.get(deleted.id);
      if (stored !== undefined) {
        stored.deletedAt = new Date();
      }

      const errors = await Promise.all(
        [foreign.id, deleted.id, missingId].map((id) =>
          service.findById(id, owner).catch((error) => error),
        ),
      );

      for (const error of errors) {
        expect(error).toBeInstanceOf(PageNotFoundError);
        expect(error.message).toBe(errors[0].message);
      }
    });
  });

  describe('переименование', () => {
    it('меняет заголовок и не трогает структурные поля', async () => {
      const page = await createPage({ title: 'before' });

      const renamed = await service.rename(page.id, owner, 'after');

      expect(renamed).toMatchObject({
        ownerId: page.ownerId,
        parentPageId: page.parentPageId,
        position: page.position,
        projectId: page.projectId,
        title: 'after',
      });
    });

    it('отклоняет переименование чужой страницы', async () => {
      const page = await createPage();

      await expect(service.rename(page.id, stranger, 'hacked')).rejects.toBeInstanceOf(
        PageNotFoundError,
      );
    });
  });

  describe('перемещение', () => {
    it('переносит страницу под другого родителя', async () => {
      const first = await createPage({ title: 'first' });
      const second = await createPage({ title: 'second' });

      await movePageUseCase.execute({
        nextSiblingId: null,
        ownerId: owner,
        pageId: second.id,
        parentPageId: first.id,
        previousSiblingId: null,
      });

      const tree = await service.findTree(owner);

      expect(tree.map((node) => node.id)).toEqual([first.id]);
      expect(tree[0]?.children.map((node) => node.id)).toEqual([second.id]);
    });

    it('сохраняет поддерево и относительный порядок потомков', async () => {
      const root = await createPage({ title: 'root' });
      const branch = await createPage({ title: 'branch' });
      const leafA = await createPage({ parentPageId: branch.id, title: 'a' });
      const leafB = await createPage({ parentPageId: branch.id, title: 'b' });

      await movePageUseCase.execute({
        nextSiblingId: null,
        ownerId: owner,
        pageId: branch.id,
        parentPageId: root.id,
        previousSiblingId: null,
      });

      const tree = await service.findTree(owner);
      const moved = tree[0]?.children[0];

      expect(moved?.id).toBe(branch.id);
      expect(moved?.children.map((node) => node.id)).toEqual([leafA.id, leafB.id]);
    });

    it('переносит страницу в корень и не меняет её проект', async () => {
      const parent = await createPage();
      const child = await createPage({ parentPageId: parent.id });

      const moved = await movePageUseCase.execute({
        nextSiblingId: null,
        ownerId: owner,
        pageId: child.id,
        parentPageId: null,
        previousSiblingId: null,
      });

      expect(moved).toMatchObject({ parentPageId: null, projectId: child.projectId });
    });

    it('ставит страницу между соседями, не трогая их ранги', async () => {
      const first = await createPage({ title: 'first' });
      const second = await createPage({ title: 'second' });
      const third = await createPage({ title: 'third' });

      const moved = await movePageUseCase.execute({
        nextSiblingId: second.id,
        ownerId: owner,
        pageId: third.id,
        parentPageId: null,
        previousSiblingId: first.id,
      });

      expect(moved.position > first.position).toBe(true);
      expect(moved.position < second.position).toBe(true);

      const tree = await service.findTree(owner);

      expect(tree.map((node) => node.id)).toEqual([first.id, third.id, second.id]);
      expect(tree[0]?.position).toBe(first.position);
      expect(tree[2]?.position).toBe(second.position);
    });

    it('ставит страницу последней, если соседи не указаны', async () => {
      const first = await createPage({ title: 'first' });
      const second = await createPage({ title: 'second' });

      await movePageUseCase.execute({
        nextSiblingId: null,
        ownerId: owner,
        pageId: first.id,
        parentPageId: null,
        previousSiblingId: null,
      });

      const tree = await service.findTree(owner);

      expect(tree.map((node) => node.id)).toEqual([second.id, first.id]);
    });

    it('отклоняет перенос страницы в саму себя', async () => {
      const page = await createPage();

      await expect(
        movePageUseCase.execute({
          nextSiblingId: null,
          ownerId: owner,
          pageId: page.id,
          parentPageId: page.id,
          previousSiblingId: null,
        }),
      ).rejects.toBeInstanceOf(PageCycleError);
    });

    it('отклоняет перенос в собственного потомка на произвольной глубине', async () => {
      const root = await createPage();
      const child = await createPage({ parentPageId: root.id });
      const grandchild = await createPage({ parentPageId: child.id });

      await expect(
        movePageUseCase.execute({
          nextSiblingId: null,
          ownerId: owner,
          pageId: root.id,
          parentPageId: grandchild.id,
          previousSiblingId: null,
        }),
      ).rejects.toBeInstanceOf(PageCycleError);

      const tree = await service.findTree(owner);

      expect(tree.map((node) => node.id)).toEqual([root.id]);
      expect(tree[0]?.children[0]?.id).toBe(child.id);
    });

    it('отклоняет родителя из другого проекта того же владельца', async () => {
      const other = await projects.create({ name: 'Other', ownerId: owner });
      const here = await createPage();
      const there = await createPage({ projectId: other.id });

      await expect(
        movePageUseCase.execute({
          nextSiblingId: null,
          ownerId: owner,
          pageId: here.id,
          parentPageId: there.id,
          previousSiblingId: null,
        }),
      ).rejects.toBeInstanceOf(PageProjectMismatchError);

      await expect(service.findById(here.id, owner)).resolves.toMatchObject({
        parentPageId: null,
        projectId: here.projectId,
      });
    });

    it('отклоняет одинаковые previousSiblingId и nextSiblingId', async () => {
      const first = await createPage({ title: 'first' });
      const second = await createPage({ title: 'second' });

      await expect(
        movePageUseCase.execute({
          nextSiblingId: first.id,
          ownerId: owner,
          pageId: second.id,
          parentPageId: null,
          previousSiblingId: first.id,
        }),
      ).rejects.toBeInstanceOf(SiblingOrderError);
    });

    it('отклоняет перевёрнутую пару соседей', async () => {
      const first = await createPage({ title: 'first' });
      const second = await createPage({ title: 'second' });
      const third = await createPage({ title: 'third' });

      // Соседи названы в обратном порядке: щели между ними не существует.
      await expect(
        movePageUseCase.execute({
          nextSiblingId: first.id,
          ownerId: owner,
          pageId: third.id,
          parentPageId: null,
          previousSiblingId: second.id,
        }),
      ).rejects.toBeInstanceOf(SiblingOrderError);
    });

    it('отклоняет соседей с совпавшими рангами, а не падает внутренней ошибкой', async () => {
      const first = await createPage({ title: 'first' });
      const second = await createPage({ title: 'second' });
      const third = await createPage({ title: 'third' });

      // Дубликат ранга: то, что раньше доходило до генератора и роняло 500.
      const stored = pages.pages.get(second.id);
      if (stored !== undefined) {
        stored.position = first.position;
      }

      await expect(
        movePageUseCase.execute({
          nextSiblingId: second.id,
          ownerId: owner,
          pageId: third.id,
          parentPageId: null,
          previousSiblingId: first.id,
        }),
      ).rejects.toBeInstanceOf(SiblingOrderError);
    });

    it('отклоняет пару соседей, между которыми стоит третий брат', async () => {
      const first = await createPage({ title: 'first' });
      const second = await createPage({ title: 'second' });
      const third = await createPage({ title: 'third' });
      const moved = await createPage({ title: 'moved' });
      const before = (await service.findTree(owner)).map((node) => node.id);

      await expect(
        movePageUseCase.execute({
          nextSiblingId: third.id,
          ownerId: owner,
          pageId: moved.id,
          parentPageId: null,
          previousSiblingId: first.id,
        }),
      ).rejects.toBeInstanceOf(SiblingsNotAdjacentError);

      expect(second.id).not.toBe(moved.id);
      await expect(
        service.findTree(owner).then((tree) => tree.map((node) => node.id)),
      ).resolves.toEqual(before);
    });

    it('пропускает смежную пару и ставит страницу ровно между ними', async () => {
      const first = await createPage({ title: 'first' });
      const second = await createPage({ title: 'second' });
      const moved = await createPage({ title: 'moved' });

      await movePageUseCase.execute({
        nextSiblingId: second.id,
        ownerId: owner,
        pageId: moved.id,
        parentPageId: null,
        previousSiblingId: first.id,
      });

      const tree = await service.findTree(owner);

      expect(tree.map((node) => node.id)).toEqual([first.id, moved.id, second.id]);
    });

    it('не считает перемещаемую страницу помехой между её будущими соседями', async () => {
      const first = await createPage({ title: 'first' });
      const moved = await createPage({ title: 'moved' });
      const third = await createPage({ title: 'third' });

      await expect(
        movePageUseCase.execute({
          nextSiblingId: third.id,
          ownerId: owner,
          pageId: moved.id,
          parentPageId: null,
          previousSiblingId: first.id,
        }),
      ).resolves.toMatchObject({ id: moved.id });
    });

    it('отклоняет соседа под другим родителем', async () => {
      const parent = await createPage();
      const child = await createPage({ parentPageId: parent.id });
      const root = await createPage();

      await expect(
        movePageUseCase.execute({
          nextSiblingId: null,
          ownerId: owner,
          pageId: root.id,
          parentPageId: null,
          previousSiblingId: child.id,
        }),
      ).rejects.toBeInstanceOf(SiblingParentMismatchError);
    });

    /**
     * В теле перемещения четыре идентификатора страниц. Отказ обязан называть тот,
     * который не подошёл, иначе клиенту не из чего понять, что исправлять.
     */
    it('различает, какой из идентификаторов не найден', async () => {
      const page = await createPage();
      const move = (overrides: {
        parentPageId?: string | null;
        previousSiblingId?: string | null;
        nextSiblingId?: string | null;
        pageId?: string;
      }) =>
        movePageUseCase
          .execute({
            nextSiblingId: overrides.nextSiblingId ?? null,
            ownerId: owner,
            pageId: overrides.pageId ?? page.id,
            parentPageId: overrides.parentPageId ?? null,
            previousSiblingId: overrides.previousSiblingId ?? null,
          })
          .catch((error) => error);

      expect(await move({ pageId: missingId })).toBeInstanceOf(PageNotFoundError);
      expect(await move({ parentPageId: missingId })).toBeInstanceOf(PageParentNotFoundError);
      expect(await move({ previousSiblingId: missingId })).toBeInstanceOf(
        PreviousSiblingNotFoundError,
      );
      expect(await move({ nextSiblingId: missingId })).toBeInstanceOf(NextSiblingNotFoundError);

      const messages = await Promise.all([
        move({ pageId: missingId }),
        move({ parentPageId: missingId }),
        move({ previousSiblingId: missingId }),
        move({ nextSiblingId: missingId }),
      ]);

      expect(new Set(messages.map((error) => error.message)).size).toBe(4);
    });

    it('называет соседа, лежащего не под целевым родителем', async () => {
      const parent = await createPage();
      const child = await createPage({ parentPageId: parent.id });
      const page = await createPage();

      const previous = await movePageUseCase
        .execute({
          nextSiblingId: null,
          ownerId: owner,
          pageId: page.id,
          parentPageId: null,
          previousSiblingId: child.id,
        })
        .catch((error) => error);
      const next = await movePageUseCase
        .execute({
          nextSiblingId: child.id,
          ownerId: owner,
          pageId: page.id,
          parentPageId: null,
          previousSiblingId: null,
        })
        .catch((error) => error);

      expect(previous).toBeInstanceOf(SiblingParentMismatchError);
      expect(next).toBeInstanceOf(SiblingParentMismatchError);
      expect(previous.message).not.toBe(next.message);
    });

    it('оставляет чужую и несуществующую запись неразличимыми в каждом слоте', async () => {
      const foreignProject = await projects.create({ name: 'Theirs', ownerId: stranger });
      const foreign = await pages.insert({
        createdById: stranger,
        ownerId: stranger,
        parentPageId: null,
        position: positionBetween(null, null),
        projectId: foreignProject.id,
        title: 'theirs',
      });
      const page = await createPage();

      const slotOf = async (overrides: {
        parentPageId?: string;
        previousSiblingId?: string;
        nextSiblingId?: string;
      }) =>
        (
          await movePageUseCase
            .execute({
              nextSiblingId: overrides.nextSiblingId ?? null,
              ownerId: owner,
              pageId: page.id,
              parentPageId: overrides.parentPageId ?? null,
              previousSiblingId: overrides.previousSiblingId ?? null,
            })
            .catch((error) => error)
        ).message;

      expect(await slotOf({ parentPageId: foreign.id })).toBe(
        await slotOf({ parentPageId: missingId }),
      );
      expect(await slotOf({ previousSiblingId: foreign.id })).toBe(
        await slotOf({ previousSiblingId: missingId }),
      );
      expect(await slotOf({ nextSiblingId: foreign.id })).toBe(
        await slotOf({ nextSiblingId: missingId }),
      );
    });

    it('отвечает одинаково на чужую и на несуществующую перемещаемую страницу', async () => {
      const page = await createPage();

      const foreignError = await movePageUseCase
        .execute({
          nextSiblingId: null,
          ownerId: stranger,
          pageId: page.id,
          parentPageId: null,
          previousSiblingId: null,
        })
        .catch((error) => error);
      const missingError = await movePageUseCase
        .execute({
          nextSiblingId: null,
          ownerId: stranger,
          pageId: missingId,
          parentPageId: null,
          previousSiblingId: null,
        })
        .catch((error) => error);

      expect(foreignError).toBeInstanceOf(PageNotFoundError);
      expect(missingError).toBeInstanceOf(PageNotFoundError);
      expect(foreignError.message).toBe(missingError.message);
    });

    it('не оставляет частичных изменений при отказе после смены родителя', async () => {
      const first = await createPage({ title: 'first' });
      const second = await createPage({ title: 'second' });
      pages.failAfterReparent = true;

      await expect(
        movePageUseCase.execute({
          nextSiblingId: null,
          ownerId: owner,
          pageId: second.id,
          parentPageId: first.id,
          previousSiblingId: null,
        }),
      ).rejects.toThrow();

      await expect(service.findById(second.id, owner)).resolves.toMatchObject({
        parentPageId: null,
        position: second.position,
      });
    });
  });
});
