import type * as Y from 'yjs';

import {
  createPageDocumentSessionLifecycle,
  type PageDocumentError,
  type PageDocumentSession,
} from './page-document-session';

type FakePageDocumentSessionOptions =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; error: PageDocumentError }>
  | Readonly<{ status: 'ready'; doc: Y.Doc; editable?: boolean }>;

export function createFakePageDocumentSession(
  options: FakePageDocumentSessionOptions,
): PageDocumentSession {
  const lifecycle = createPageDocumentSessionLifecycle();

  if (options.status === 'loading') {
    return {
      doc: null,
      editable: false,
      status: 'loading',
      destroy: lifecycle.destroy,
    };
  }

  if (options.status === 'error') {
    return {
      doc: null,
      editable: false,
      status: 'error',
      error: options.error,
      destroy: lifecycle.destroy,
    };
  }

  lifecycle.addCleanup(() => options.doc.destroy());

  return {
    doc: options.doc,
    editable: options.editable ?? true,
    status: 'ready',
    destroy: lifecycle.destroy,
  };
}
