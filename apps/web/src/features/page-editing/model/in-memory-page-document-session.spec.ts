import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  encodePageDocumentState,
  getPageDocumentContentFragment,
  PAGE_DOCUMENT_SCHEMA_VERSION,
} from '@/entities/page-document';

import {
  createInMemoryPageDocumentSession,
  createPageDocumentSessionFromState,
} from './in-memory-page-document-session';

describe('page document session admission', () => {
  it('допускает поддерживаемую schema metadata и декодируемый Yjs state', () => {
    const source = new Y.Doc();
    getPageDocumentContentFragment(source).insert(0, [new Y.XmlElement('paragraph')]);

    const session = createPageDocumentSessionFromState({
      state: encodePageDocumentState(source),
      schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
    });

    expect(session.status).toBe('ready');
    expect(session.editable).toBe(true);
    expect(session.doc).not.toBeNull();

    session.destroy();
    source.destroy();
  });

  it('блокирует неподдерживаемую schema version до декодирования state', () => {
    const session = createPageDocumentSessionFromState({
      state: new Uint8Array([255]),
      schemaVersion: 2,
    });

    expect(session).toMatchObject({
      doc: null,
      editable: false,
      status: 'error',
      error: { code: 'unsupported-schema-version' },
    });
  });

  it('отличает несовместимую metadata от неподдерживаемой версии', () => {
    const session = createPageDocumentSessionFromState({
      state: new Uint8Array(),
      schemaVersion: '1',
    });

    expect(session.error?.code).toBe('invalid-document-metadata');
  });

  it('возвращает blocking error для повреждённого Yjs state', () => {
    const session = createPageDocumentSessionFromState({
      state: new Uint8Array([255]),
      schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
    });

    expect(session).toMatchObject({
      doc: null,
      editable: false,
      status: 'error',
      error: { code: 'document-decode-failed' },
    });
  });

  it('допускает empty Y.Doc без физически сохранённого content fragment', () => {
    const source = new Y.Doc();
    getPageDocumentContentFragment(source);

    const session = createPageDocumentSessionFromState({
      state: encodePageDocumentState(source),
      schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
    });

    expect(session.status).toBe('ready');
    expect(session.doc).not.toBeNull();
    expect(session.doc && getPageDocumentContentFragment(session.doc).length).toBe(0);

    session.destroy();
    source.destroy();
  });

  it('владеет временным Y.Doc и уничтожает его ровно один раз', () => {
    const doc = new Y.Doc();
    const onDestroy = vi.fn();
    doc.on('destroy', onDestroy);
    const session = createInMemoryPageDocumentSession({
      doc,
      schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
    });

    session.destroy();
    session.destroy();

    expect(onDestroy).toHaveBeenCalledTimes(1);
  });

  it('уничтожает отклонённый временный Y.Doc', () => {
    const doc = new Y.Doc();
    const onDestroy = vi.fn();
    doc.on('destroy', onDestroy);

    const session = createInMemoryPageDocumentSession({ doc, schemaVersion: 2 });

    expect(session.status).toBe('error');
    expect(onDestroy).toHaveBeenCalledTimes(1);
  });
});
