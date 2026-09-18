import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { ApiDeniedError, ApiUnavailableError } from '../api/internal-api-client.js';
import {
  DOCUMENT_MAX_BYTES,
  DocumentLoadError,
  DocumentSizeLimitExceededError,
  DocumentStoreSkippedError,
  PageDocumentPersistence,
} from './persistence.js';

const documentName = 'page:550e8400-e29b-41d4-a716-446655440000';
const pageId = '550e8400-e29b-41d4-a716-446655440000';

function persistenceWith(api: Record<string, unknown>) {
  return new PageDocumentPersistence(api as never);
}

describe('PageDocumentPersistence', () => {
  it('загружает существующее состояние', async () => {
    const source = new Y.Doc();
    source.getText('body').insert(0, 'hello');
    const service = persistenceWith({
      readDocument: vi.fn(async () => Y.encodeStateAsUpdate(source)),
    });

    const loaded = await service.load(documentName);

    expect(loaded.getText('body').toString()).toBe('hello');
  });

  it('пустое состояние даёт валидный пустой документ', async () => {
    const service = persistenceWith({ readDocument: vi.fn(async () => new Uint8Array()) });

    const loaded = await service.load(documentName);

    expect(loaded.getText('body').toString()).toBe('');
  });

  it('отказ API при загрузке даёт DocumentLoadError', async () => {
    const service = persistenceWith({
      readDocument: vi.fn(async () => {
        throw new ApiDeniedError(404);
      }),
    });

    await expect(service.load(documentName)).rejects.toBeInstanceOf(DocumentLoadError);
  });

  it('недоступность API при загрузке не выдаётся за отсутствие документа', async () => {
    const service = persistenceWith({
      readDocument: vi.fn(async () => {
        throw new ApiUnavailableError('timeout');
      }),
    });

    await expect(service.load(documentName)).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it('сохраняет закодированное состояние по идентификатору страницы', async () => {
    const replaceDocument = vi.fn(async () => undefined);
    const document = new Y.Doc();
    document.getText('body').insert(0, 'stored');

    await persistenceWith({ replaceDocument }).store(documentName, document);

    const [calledPageId, state] = replaceDocument.mock.calls[0] as unknown as [string, Uint8Array];
    expect(calledPageId).toBe(pageId);
    expect(state.byteLength).toBeGreaterThan(0);
  });

  it('отказ API при сохранении даёт DocumentStoreSkippedError', async () => {
    const service = persistenceWith({
      replaceDocument: vi.fn(async () => {
        throw new ApiDeniedError(404);
      }),
    });

    await expect(service.store(documentName, new Y.Doc())).rejects.toBeInstanceOf(
      DocumentStoreSkippedError,
    );
  });

  it('состояние сверх предела не отправляется', async () => {
    const replaceDocument = vi.fn(async () => undefined);
    const document = new Y.Doc();
    document.getText('body').insert(0, 'x'.repeat(DOCUMENT_MAX_BYTES + 1024));

    await expect(
      persistenceWith({ replaceDocument }).store(documentName, document),
    ).rejects.toBeInstanceOf(DocumentSizeLimitExceededError);
    expect(replaceDocument).not.toHaveBeenCalled();
  });
});
