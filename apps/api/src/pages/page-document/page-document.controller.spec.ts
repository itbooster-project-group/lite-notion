import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PageNotFoundError } from '../errors';
import { PageDocumentController } from './page-document.controller';
import { PageDocumentService } from './page-document.service';

const user: AuthenticatedUser = {
  id: '11111111-1111-1111-1111-111111111111',
  sessionId: '99999999-9999-9999-9999-999999999999',
};
const pageId = '55555555-5555-5555-5555-555555555555';

describe('PageDocumentController', () => {
  let controller: PageDocumentController;
  let documents: { read: ReturnType<typeof vi.fn>; replace: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const record = { pageId, tiptapSchemaVersion: 1, yjsState: new Uint8Array([1, 2, 3]) };

    documents = {
      read: vi.fn().mockResolvedValue(record),
      replace: vi.fn().mockResolvedValue(record),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [PageDocumentController],
      providers: [{ provide: PageDocumentService, useValue: documents }],
    }).compile();

    controller = moduleRef.get(PageDocumentController);
  });

  it('передаёт чтение в сервис и кодирует содержимое в base64', async () => {
    const document = await controller.read(user, pageId);

    expect(documents.read).toHaveBeenCalledWith(pageId, user.id);
    expect(document.yjsState).toBe(Buffer.from([1, 2, 3]).toString('base64'));
  });

  it('декодирует base64 перед передачей в сервис', async () => {
    const state = Buffer.from([9, 8, 7]);

    await controller.replace(user, pageId, {
      tiptapSchemaVersion: 2,
      yjsState: state.toString('base64'),
    });

    expect(documents.replace).toHaveBeenCalledWith({
      ownerId: user.id,
      pageId,
      tiptapSchemaVersion: 2,
      yjsState: new Uint8Array(state),
    });
  });

  it('принимает пустое содержимое', async () => {
    await controller.replace(user, pageId, { tiptapSchemaVersion: 1, yjsState: '' });

    expect(documents.replace).toHaveBeenCalledWith(
      expect.objectContaining({ yjsState: new Uint8Array() }),
    );
  });

  it('не публикует счётчик ревизии', async () => {
    const document = await controller.read(user, pageId);

    expect(Object.keys(document).sort()).toEqual(['pageId', 'tiptapSchemaVersion', 'yjsState']);
  });

  it('переводит PageNotFoundError в 404 при чтении и при записи', async () => {
    documents.read.mockRejectedValue(new PageNotFoundError());
    documents.replace.mockRejectedValue(new PageNotFoundError());

    await expect(controller.read(user, pageId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.replace(user, pageId, { tiptapSchemaVersion: 1, yjsState: '' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
