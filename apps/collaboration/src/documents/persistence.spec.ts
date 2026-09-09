import { DOCUMENT_MAX_BYTES } from '@lite-notion/database';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import {
  createDocumentFromState,
  DocumentLoadError,
  DocumentSizeLimitExceededError,
  DocumentStoreSkippedError,
  PageDocumentPersistence,
} from './persistence';

describe('PageDocumentPersistence', () => {
  it('загружает existing binary Yjs state', async () => {
    const source = new Y.Doc();
    source.getText('body').insert(0, 'hello');
    const yjsState = Y.encodeStateAsUpdate(source);
    const service = new PageDocumentPersistence({
      pageDocument: { findFirst: vi.fn(async () => ({ yjsState })) },
    } as never);

    const loaded = await service.load('page:550e8400-e29b-41d4-a716-446655440000');

    expect(loaded.getText('body').toString()).toBe('hello');
  });

  it('инициализирует empty yjsState как пустой Y.Doc без applyUpdate', async () => {
    const applyUpdate = vi.fn();

    const loaded = createDocumentFromState(new Uint8Array(), applyUpdate);

    expect(loaded.getText('body').toString()).toBe('');
    expect(applyUpdate).not.toHaveBeenCalled();
  });

  it('отклоняет load для missing или deleted page/document', async () => {
    const service = new PageDocumentPersistence({
      pageDocument: { findFirst: vi.fn(async () => null) },
    } as never);

    await expect(service.load('page:550e8400-e29b-41d4-a716-446655440000')).rejects.toThrow(
      DocumentLoadError,
    );
  });

  it('сохраняет state через conditional write и increment storageRevision', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const service = new PageDocumentPersistence({ pageDocument: { updateMany } } as never);
    const document = new Y.Doc();
    document.getText('body').insert(0, 'stored');

    await service.store('page:550e8400-e29b-41d4-a716-446655440000', document);

    expect(updateMany).toHaveBeenCalledWith({
      data: {
        storageRevision: { increment: 1 },
        updatedAt: expect.any(Date),
        yjsState: expect.any(Uint8Array),
      },
      where: {
        page: { deletedAt: null },
        pageId: '550e8400-e29b-41d4-a716-446655440000',
      },
    });
  });

  it('не сохраняет state после soft delete или отсутствующего документа', async () => {
    const service = new PageDocumentPersistence({
      pageDocument: { updateMany: vi.fn(async () => ({ count: 0 })) },
    } as never);

    await expect(
      service.store('page:550e8400-e29b-41d4-a716-446655440000', new Y.Doc()),
    ).rejects.toThrow(DocumentStoreSkippedError);
  });

  it('проверяет размер итогового Yjs state отдельно от WebSocket payload', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const service = new PageDocumentPersistence({ pageDocument: { updateMany } } as never);
    const document = new Y.Doc();
    document.getText('body').insert(0, 'x'.repeat(DOCUMENT_MAX_BYTES));

    await expect(
      service.store('page:550e8400-e29b-41d4-a716-446655440000', document),
    ).rejects.toThrow(DocumentSizeLimitExceededError);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
