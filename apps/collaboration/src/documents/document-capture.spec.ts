import { Document as HocusDocument, Hocuspocus } from '@hocuspocus/server';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import type { InternalApiClient, PersistedDocumentRecord } from '../api/internal-api-client.js';
import { DocumentCapture, DocumentCaptureEncodingError } from './document-capture.js';

const pageId = '550e8400-e29b-41d4-a716-446655440000';
const documentName = `page:${pageId}`;

function record(yjsState: Uint8Array, storageRevision = 1n): PersistedDocumentRecord {
  return { pageId, storageRevision, tiptapSchemaVersion: 3, yjsState: yjsState.slice() };
}

function activeInstance(document: HocusDocument): Hocuspocus {
  const instance = new Hocuspocus();
  instance.documents.set(documentName, document);
  return instance;
}

describe('DocumentCapture', () => {
  it('captures the live document once and returns bytes that survive later edits', async () => {
    const document = new HocusDocument(documentName);
    document.getText('body').insert(0, 'state A');
    let persistedBytes = new Uint8Array();
    const api = {
      replaceDocument: vi.fn(async (_id: string, state: Uint8Array) => {
        persistedBytes = state.slice();
        return record(state, 12n);
      }),
      readDocumentRecord: vi.fn(),
    } as unknown as InternalApiClient;
    const encodeState = vi.fn((current: Y.Doc) => Y.encodeStateAsUpdate(current));

    const captured = await new DocumentCapture(api, encodeState).capture(
      pageId,
      activeInstance(document),
    );
    document.getText('body').insert(document.getText('body').length, ' then B');

    const restored = new Y.Doc();
    Y.applyUpdate(restored, captured.yjsState);
    expect(restored.getText('body').toString()).toBe('state A');
    expect(captured.yjsState).toEqual(persistedBytes);
    expect(captured.storageRevision).toBe(12n);
    expect(captured.tiptapSchemaVersion).toBe(3);
    expect(encodeState).toHaveBeenCalledOnce();
    expect(api.replaceDocument).toHaveBeenCalledOnce();
    expect(api.readDocumentRecord).not.toHaveBeenCalled();
  });

  it('reads one persisted record without loading an inactive document', async () => {
    const persisted = record(new Uint8Array([1, 2, 3]), 99n);
    const api = {
      readDocumentRecord: vi.fn(async () => persisted),
      replaceDocument: vi.fn(),
    } as unknown as InternalApiClient;
    const instance = new Hocuspocus();

    await expect(new DocumentCapture(api).capture(pageId, instance)).resolves.toEqual(persisted);

    expect(api.readDocumentRecord).toHaveBeenCalledWith(pageId);
    expect(api.replaceDocument).not.toHaveBeenCalled();
    expect(instance.documents.has(documentName)).toBe(false);
  });

  it('waits for a document that is already loading instead of reading persisted fallback', async () => {
    const document = new HocusDocument(documentName);
    document.getText('body').insert(0, 'loading state');
    const api = {
      readDocumentRecord: vi.fn(),
      replaceDocument: vi.fn(async (_id: string, state: Uint8Array) => record(state, 15n)),
    } as unknown as InternalApiClient;
    const instance = new Hocuspocus();
    instance.loadingDocuments.set(documentName, Promise.resolve(document));

    const captured = await new DocumentCapture(api).capture(pageId, instance);

    const restored = new Y.Doc();
    Y.applyUpdate(restored, captured.yjsState);
    expect(restored.getText('body').toString()).toBe('loading state');
    expect(captured.storageRevision).toBe(15n);
    expect(api.replaceDocument).toHaveBeenCalledOnce();
    expect(api.readDocumentRecord).not.toHaveBeenCalled();
  });

  it('uses a document that becomes active while cold fallback is being read', async () => {
    const instance = new Hocuspocus();
    const liveDocument = new HocusDocument(documentName);
    liveDocument.getText('body').insert(0, 'live state');
    let finishRead!: (value: PersistedDocumentRecord) => void;
    const api = {
      readDocumentRecord: vi.fn(
        () => new Promise<PersistedDocumentRecord>((resolve) => (finishRead = resolve)),
      ),
      replaceDocument: vi.fn(async (_id: string, state: Uint8Array) => record(state, 16n)),
    } as unknown as InternalApiClient;
    const capture = new DocumentCapture(api).capture(pageId, instance);

    await vi.waitFor(() => expect(api.readDocumentRecord).toHaveBeenCalledOnce());
    instance.documents.set(documentName, liveDocument);
    finishRead(record(new Uint8Array([1, 2, 3]), 14n));
    const captured = await capture;

    const restored = new Y.Doc();
    Y.applyUpdate(restored, captured.yjsState);
    expect(restored.getText('body').toString()).toBe('live state');
    expect(captured.storageRevision).toBe(16n);
    expect(api.replaceDocument).toHaveBeenCalledOnce();
  });

  it('keeps capture A while an edit B and its store happen during persistence', async () => {
    const document = new HocusDocument(documentName);
    document.getText('body').insert(0, 'A');
    let finishPersist!: () => void;
    let revision = 6n;
    const api = {
      replaceDocument: vi.fn(async (_id: string, state: Uint8Array) => {
        if (revision === 6n) {
          await new Promise<void>((resolve) => {
            finishPersist = resolve;
          });
        }
        revision += 1n;
        return record(state, revision);
      }),
      readDocumentRecord: vi.fn(),
    } as unknown as InternalApiClient;
    const capture = new DocumentCapture(api).capture(pageId, activeInstance(document));

    await vi.waitFor(() => expect(api.replaceDocument).toHaveBeenCalledOnce());
    document.getText('body').insert(1, 'B');
    const store = document.saveMutex.runExclusive(async () =>
      api.replaceDocument(pageId, Y.encodeStateAsUpdate(document)),
    );
    await Promise.resolve();
    expect(api.replaceDocument).toHaveBeenCalledOnce();
    finishPersist();
    const captured = await capture;
    const stored = await store;

    const restored = new Y.Doc();
    Y.applyUpdate(restored, captured.yjsState);
    expect(restored.getText('body').toString()).toBe('A');
    expect(document.getText('body').toString()).toBe('AB');
    expect(captured.storageRevision).toBe(7n);
    expect(stored.storageRevision).toBe(8n);
    expect(stored.yjsState).toEqual(Y.encodeStateAsUpdate(document));
  });

  it('serializes concurrent active captures and allocates a write revision per capture', async () => {
    const document = new HocusDocument(documentName);
    document.getText('body').insert(0, 'same state');
    let revision = 20n;
    const api = {
      replaceDocument: vi.fn(async (_id: string, state: Uint8Array) => record(state, ++revision)),
      readDocumentRecord: vi.fn(),
    } as unknown as InternalApiClient;
    const capture = new DocumentCapture(api);
    const instance = activeInstance(document);

    const states = await Promise.all([
      capture.capture(pageId, instance),
      capture.capture(pageId, instance),
    ]);

    expect(states.map(({ storageRevision }) => storageRevision)).toEqual([21n, 22n]);
    expect(states[0]?.yjsState).toEqual(states[1]?.yjsState);
    expect(api.replaceDocument).toHaveBeenCalledTimes(2);
  });

  it('does not persist or return a state when Yjs encoding fails', async () => {
    const document = new HocusDocument(documentName);
    const api = {
      replaceDocument: vi.fn(),
      readDocumentRecord: vi.fn(),
    } as unknown as InternalApiClient;
    await expect(
      new DocumentCapture(api, () => {
        throw new Error('encode failed');
      }).capture(pageId, activeInstance(document)),
    ).rejects.toBeInstanceOf(DocumentCaptureEncodingError);

    expect(api.replaceDocument).not.toHaveBeenCalled();
  });

  it('does not return a capture when persistence fails', async () => {
    const document = new HocusDocument(documentName);
    document.getText('body').insert(0, 'state');
    const api = {
      replaceDocument: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
      readDocumentRecord: vi.fn(),
    } as unknown as InternalApiClient;

    await expect(
      new DocumentCapture(api).capture(pageId, activeInstance(document)),
    ).rejects.toThrow('database unavailable');
  });
});
