import { describe, expect, it, vi } from 'vitest';
import { TIPTAP_SCHEMA_VERSION } from '../../../database/constants';
import { PageNotFoundError } from '../../errors';
import type { PageDocumentRecord, PageDocumentRepository } from '../page-document.repository';
import { PersistPageDocumentStateUseCase } from './persist-page-document-state.use-case';

describe('PersistPageDocumentStateUseCase', () => {
  it('upgrades legacy writes to the current schema version and returns provenance', async () => {
    const record: PageDocumentRecord = {
      pageId: 'page-1',
      storageRevision: 12n,
      tiptapSchemaVersion: 5,
      yjsState: new Uint8Array([1, 2, 3]),
    };
    const replaceYjsState = vi.fn(async () => record);
    const useCase = new PersistPageDocumentStateUseCase(
      {
        replaceYjsState,
      } as unknown as PageDocumentRepository,
      { execute: vi.fn(async () => undefined) } as never,
    );
    const state = new Uint8Array([1, 2, 3]);

    await expect(useCase.execute(record.pageId, state, 11n, 1)).resolves.toEqual({
      accepted: true,
      document: record,
    });
    expect(replaceYjsState).toHaveBeenCalledWith(record.pageId, state, 11n, TIPTAP_SCHEMA_VERSION);
  });

  it('preserves a newer schema version supplied by a collaboration runtime', async () => {
    const record: PageDocumentRecord = {
      pageId: 'page-1',
      storageRevision: 12n,
      tiptapSchemaVersion: 5,
      yjsState: new Uint8Array([1, 2, 3]),
    };
    const replaceYjsState = vi.fn(async () => record);
    const useCase = new PersistPageDocumentStateUseCase(
      { replaceYjsState } as unknown as PageDocumentRepository,
      { execute: vi.fn(async () => undefined) } as never,
    );

    await useCase.execute(record.pageId, record.yjsState, 11n, 5);

    expect(replaceYjsState).toHaveBeenCalledWith(record.pageId, record.yjsState, 11n, 5);
  });

  it('preserves not-found behavior when no live page document can be updated', async () => {
    const useCase = new PersistPageDocumentStateUseCase(
      {
        replaceYjsState: vi.fn(async () => null),
        find: vi.fn(async () => null),
      } as unknown as PageDocumentRepository,
      { execute: vi.fn() } as never,
    );

    await expect(useCase.execute('missing-page', new Uint8Array(), 0n, 1)).rejects.toBeInstanceOf(
      PageNotFoundError,
    );
  });
});
