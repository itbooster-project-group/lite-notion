import type * as Y from 'yjs';
import {
  decodePageDocumentState,
  isSupportedPageDocumentSchemaVersion,
} from '@/entities/page-document';

import {
  createPageDocumentSessionLifecycle,
  type PageDocumentError,
  type PageDocumentSession,
} from './page-document-session';

type InMemoryPageDocumentSessionOptions = Readonly<{
  doc: Y.Doc;
  schemaVersion: unknown;
  editable?: boolean;
}>;

type PersistedPageDocumentSessionOptions = Readonly<{
  state: Uint8Array;
  schemaVersion: unknown;
  editable?: boolean;
}>;

const INVALID_METADATA_ERROR = {
  code: 'invalid-document-metadata',
  message: 'Метаданные документа некорректны.',
} as const satisfies PageDocumentError;

const UNSUPPORTED_SCHEMA_ERROR = {
  code: 'unsupported-schema-version',
  message: 'Версия документа не поддерживается.',
} as const satisfies PageDocumentError;

const DOCUMENT_DECODE_ERROR = {
  code: 'document-decode-failed',
  message: 'Документ не удалось открыть.',
} as const satisfies PageDocumentError;

function getSchemaAdmissionError(schemaVersion: unknown): PageDocumentError | undefined {
  if (isSupportedPageDocumentSchemaVersion(schemaVersion)) return undefined;

  if (typeof schemaVersion === 'number' && Number.isInteger(schemaVersion)) {
    return UNSUPPORTED_SCHEMA_ERROR;
  }

  return INVALID_METADATA_ERROR;
}

function createErrorSession(error: PageDocumentError): PageDocumentSession {
  const lifecycle = createPageDocumentSessionLifecycle();

  return {
    doc: null,
    editable: false,
    status: 'error',
    error,
    destroy: lifecycle.destroy,
  };
}

/**
 * Takes exclusive ownership of `doc` immediately, including when schema
 * admission fails. The caller owns the returned session lifecycle and must
 * call `session.destroy()` instead of destroying or reusing the transferred
 * Y.Doc directly.
 */
export function createInMemoryPageDocumentSession({
  doc,
  schemaVersion,
  editable = true,
}: InMemoryPageDocumentSessionOptions): PageDocumentSession {
  const admissionError = getSchemaAdmissionError(schemaVersion);

  if (admissionError) {
    doc.destroy();
    return createErrorSession(admissionError);
  }

  const lifecycle = createPageDocumentSessionLifecycle();
  lifecycle.addCleanup(() => doc.destroy());

  return {
    doc,
    editable,
    status: 'ready',
    destroy: lifecycle.destroy,
  };
}

export function createPageDocumentSessionFromState({
  state,
  schemaVersion,
  editable = true,
}: PersistedPageDocumentSessionOptions): PageDocumentSession {
  const admissionError = getSchemaAdmissionError(schemaVersion);
  if (admissionError) return createErrorSession(admissionError);

  try {
    return createInMemoryPageDocumentSession({
      doc: decodePageDocumentState(state),
      schemaVersion,
      editable,
    });
  } catch {
    return createErrorSession(DOCUMENT_DECODE_ERROR);
  }
}
