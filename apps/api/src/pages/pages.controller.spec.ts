import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectNotFoundError } from '../projects/errors';
import {
  PageCycleError,
  PageNotFoundError,
  PageProjectMismatchError,
  SiblingOrderError,
  SiblingParentMismatchError,
} from './errors';
import { PagesController } from './pages.controller';
import { PagesService } from './pages.service';
import { CreatePageUseCase } from './use-cases/create-page.use-case';
import { MovePageUseCase } from './use-cases/move-page.use-case';
import { PurgePageUseCase } from './use-cases/purge-page.use-case';
import { PurgePagesTrashUseCase } from './use-cases/purge-pages-trash.use-case';
import { RestorePageUseCase } from './use-cases/restore-page.use-case';
import { SoftDeletePageUseCase } from './use-cases/soft-delete-page.use-case';

const user: AuthenticatedUser = {
  id: '11111111-1111-1111-1111-111111111111',
  sessionId: '99999999-9999-9999-9999-999999999999',
};
const pageId = '55555555-5555-5555-5555-555555555555';
const projectId = '44444444-4444-4444-4444-444444444444';

const record = {
  createdAt: new Date('2026-08-27T12:00:00.000Z'),
  createdById: user.id,
  id: pageId,
  ownerId: user.id,
  parentPageId: null,
  position: 'V',
  projectId,
  title: 'page',
  updatedAt: new Date('2026-08-27T12:00:00.000Z'),
};

describe('PagesController', () => {
  let controller: PagesController;
  let createPage: { execute: ReturnType<typeof vi.fn> };
  let movePage: { execute: ReturnType<typeof vi.fn> };
  let pages: {
    findTree: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    createPage = { execute: vi.fn().mockResolvedValue(record) };
    movePage = { execute: vi.fn().mockResolvedValue(record) };
    pages = {
      findById: vi.fn().mockResolvedValue(record),
      findTree: vi.fn().mockResolvedValue([{ ...record, children: [] }]),
      rename: vi.fn().mockResolvedValue(record),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [PagesController],
      providers: [
        { provide: PagesService, useValue: pages },
        { provide: CreatePageUseCase, useValue: createPage },
        { provide: MovePageUseCase, useValue: movePage },
        { provide: SoftDeletePageUseCase, useValue: { execute: vi.fn() } },
        { provide: RestorePageUseCase, useValue: { execute: vi.fn() } },
        { provide: PurgePageUseCase, useValue: { execute: vi.fn() } },
        { provide: PurgePagesTrashUseCase, useValue: { execute: vi.fn() } },
      ],
    }).compile();

    controller = moduleRef.get(PagesController);
  });

  it('передаёт создание в сервис, подставляя владельца из токена', async () => {
    await controller.create(user, { parentPageId: null, projectId, title: 'draft' });

    expect(createPage.execute).toHaveBeenCalledWith({
      ownerId: user.id,
      parentPageId: null,
      projectId,
      title: 'draft',
    });
  });

  it('подставляет пустой заголовок, когда клиент его не прислал', async () => {
    await controller.create(user, { projectId });

    expect(createPage.execute).toHaveBeenCalledWith(expect.objectContaining({ title: '' }));
  });

  it('передаёт чтение дерева в сервис и разворачивает узлы в DTO', async () => {
    const tree = await controller.findTree(user);

    expect(pages.findTree).toHaveBeenCalledWith(user.id);
    expect(tree[0]).toMatchObject({ children: [], id: pageId });
  });

  it('передаёт чтение страницы в сервис', async () => {
    await controller.findById(user, pageId);

    expect(pages.findById).toHaveBeenCalledWith(pageId, user.id);
  });

  it('передаёт переименование в сервис', async () => {
    await controller.rename(user, pageId, { title: 'renamed' });

    expect(pages.rename).toHaveBeenCalledWith(pageId, user.id, 'renamed');
  });

  it('передаёт перемещение в сервис, нормализуя отсутствующих соседей в null', async () => {
    await controller.move(user, pageId, { parentPageId: null });

    expect(movePage.execute).toHaveBeenCalledWith({
      nextSiblingId: null,
      ownerId: user.id,
      pageId,
      parentPageId: null,
      previousSiblingId: null,
    });
  });

  it('не публикует полей сверх контракта DTO', async () => {
    const page = await controller.findById(user, pageId);

    expect(Object.keys(page).sort()).toEqual([
      'createdAt',
      'createdById',
      'id',
      'ownerId',
      'parentPageId',
      'position',
      'projectId',
      'title',
      'updatedAt',
    ]);
  });

  describe('перевод доменных ошибок в HTTP', () => {
    it('PageNotFoundError → 404', async () => {
      pages.findById.mockRejectedValue(new PageNotFoundError());

      await expect(controller.findById(user, pageId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ProjectNotFoundError → 404', async () => {
      createPage.execute.mockRejectedValue(new ProjectNotFoundError());

      await expect(controller.create(user, { projectId })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('PageCycleError → 409', async () => {
      movePage.execute.mockRejectedValue(new PageCycleError());

      await expect(controller.move(user, pageId, {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('SiblingParentMismatchError → 400', async () => {
      movePage.execute.mockRejectedValue(new SiblingParentMismatchError('previousSiblingId'));

      await expect(controller.move(user, pageId, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('SiblingOrderError → 400', async () => {
      movePage.execute.mockRejectedValue(new SiblingOrderError());

      await expect(controller.move(user, pageId, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('PageProjectMismatchError → 400', async () => {
      movePage.execute.mockRejectedValue(new PageProjectMismatchError());

      await expect(controller.move(user, pageId, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('не подменяет неожиданную ошибку', async () => {
      movePage.execute.mockRejectedValue(new Error('database is on fire'));

      await expect(controller.move(user, pageId, {})).rejects.toThrow('database is on fire');
    });
  });
});
