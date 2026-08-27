import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectNotFoundError } from '../projects/errors';
import {
  PageCycleError,
  PageNotFoundError,
  PageProjectMismatchError,
  SiblingParentMismatchError,
} from './errors';
import { PagesController } from './pages.controller';
import { PagesService } from './pages.service';

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
  let pages: {
    create: ReturnType<typeof vi.fn>;
    findTree: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
    move: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    pages = {
      create: vi.fn().mockResolvedValue(record),
      findById: vi.fn().mockResolvedValue(record),
      findTree: vi.fn().mockResolvedValue([{ ...record, children: [] }]),
      move: vi.fn().mockResolvedValue(record),
      rename: vi.fn().mockResolvedValue(record),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [PagesController],
      providers: [{ provide: PagesService, useValue: pages }],
    }).compile();

    controller = moduleRef.get(PagesController);
  });

  it('передаёт создание в сервис, подставляя владельца из токена', async () => {
    await controller.create(user, { parentPageId: null, projectId, title: 'draft' });

    expect(pages.create).toHaveBeenCalledWith({
      ownerId: user.id,
      parentPageId: null,
      projectId,
      title: 'draft',
    });
  });

  it('подставляет пустой заголовок, когда клиент его не прислал', async () => {
    await controller.create(user, { projectId });

    expect(pages.create).toHaveBeenCalledWith(expect.objectContaining({ title: '' }));
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

    expect(pages.move).toHaveBeenCalledWith({
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
      pages.create.mockRejectedValue(new ProjectNotFoundError());

      await expect(controller.create(user, { projectId })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('PageCycleError → 409', async () => {
      pages.move.mockRejectedValue(new PageCycleError());

      await expect(controller.move(user, pageId, {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('SiblingParentMismatchError → 400', async () => {
      pages.move.mockRejectedValue(new SiblingParentMismatchError());

      await expect(controller.move(user, pageId, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('PageProjectMismatchError → 400', async () => {
      pages.move.mockRejectedValue(new PageProjectMismatchError());

      await expect(controller.move(user, pageId, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('не подменяет неожиданную ошибку', async () => {
      pages.move.mockRejectedValue(new Error('database is on fire'));

      await expect(controller.move(user, pageId, {})).rejects.toThrow('database is on fire');
    });
  });
});
