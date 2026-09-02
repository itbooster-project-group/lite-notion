import type { JSONContent } from '@tiptap/core';
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import * as Y from 'yjs';

import { getPageDocumentSchema } from '../model/editor-schema';
import { PAGE_CONTENT_YJS_FIELD } from '../model/schema-version';

export function getPageDocumentContentFragment(document: Y.Doc): Y.XmlFragment {
  return document.getXmlFragment(PAGE_CONTENT_YJS_FIELD);
}

export function encodePageDocumentState(document: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(document);
}

export function decodePageDocumentState(state: Uint8Array): Y.Doc {
  const document = new Y.Doc();

  try {
    Y.applyUpdate(document, state);
    return document;
  } catch (error) {
    document.destroy();
    throw error;
  }
}

export function pageDocumentToJSON(document: Y.Doc): JSONContent {
  const root = yXmlFragmentToProseMirrorRootNode(
    getPageDocumentContentFragment(document),
    getPageDocumentSchema(),
  );

  return root.toJSON() as JSONContent;
}
