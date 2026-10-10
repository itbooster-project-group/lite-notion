import { describe, expect, it, vi } from 'vitest';
import { PageNotFoundError } from '../../errors';
import type { PageDocumentRecord, PageDocumentRepository } from '../page-document.repository';
import { PersistPageDocumentStateUseCase } from './persist-page-document-state.use-case';

describe('PersistPageDocumentStateUseCase', () => {
  it('persists through the repository and returns the updated provenance record', async () => {
    const record: PageDocumentRecord = {
      pageId: 'page-1',
      storageRevision: 12n,
      tiptapSchemaVersion: 5,
      yjsState: new Uint8Array([1, 2, 3]),
    };
    const replaceYjsState = vi.fn(async () => record);
    const useCase = new PersistPageDocumentStateUseCase({
      replaceYjsState,
    } as unknown as PageDocumentRepository);
    const state = new Uint8Array([1, 2, 3]);

    await expect(useCase.execute(record.pageId, state)).resolves.toBe(record);
    expect(replaceYjsState).toHaveBeenCalledWith(record.pageId, state);
  });

  it('preserves not-found behavior when no live page document can be updated', async () => {
    const useCase = new PersistPageDocumentStateUseCase({
      replaceYjsState: vi.fn(async () => null),
    } as unknown as PageDocumentRepository);

    await expect(useCase.execute('missing-page', new Uint8Array())).rejects.toBeInstanceOf(
      PageNotFoundError,
    );
  });
});
