import { DOCUMENT_MAX_BYTES, type PrismaClient } from '@lite-notion/database';
import * as Y from 'yjs';

import { parsePageDocumentName } from './document-name';

export class DocumentLoadError extends Error {
  constructor() {
    super('Document cannot be loaded');
  }
}

export class DocumentStoreSkippedError extends Error {
  constructor() {
    super('Document store skipped');
  }
}

export class DocumentSizeLimitExceededError extends Error {
  constructor() {
    super('Document size limit exceeded');
  }
}

export function createDocumentFromState(
  state: Uint8Array,
  applyUpdate: (document: Y.Doc, update: Uint8Array) => void = Y.applyUpdate,
): Y.Doc {
  const document = new Y.Doc();

  if (state.byteLength > 0) {
    applyUpdate(document, state);
  }

  return document;
}

function toArrayBufferBytes(state: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(state.byteLength);
  copy.set(state);

  return copy;
}

export class PageDocumentPersistence {
  constructor(private readonly prisma: PrismaClient) {}

  async load(documentName: string): Promise<Y.Doc> {
    const { pageId } = parsePageDocumentName(documentName);
    const stored = await this.prisma.pageDocument.findFirst({
      select: { yjsState: true },
      where: {
        page: { deletedAt: null },
        pageId,
      },
    });

    if (!stored) {
      throw new DocumentLoadError();
    }

    return createDocumentFromState(stored.yjsState);
  }

  async store(documentName: string, document: Y.Doc): Promise<void> {
    const { pageId } = parsePageDocumentName(documentName);
    const state = toArrayBufferBytes(Y.encodeStateAsUpdate(document));

    if (state.byteLength > DOCUMENT_MAX_BYTES) {
      throw new DocumentSizeLimitExceededError();
    }

    const result = await this.prisma.pageDocument.updateMany({
      data: {
        storageRevision: { increment: 1 },
        updatedAt: new Date(),
        yjsState: state,
      },
      where: {
        page: { deletedAt: null },
        pageId,
      },
    });

    if (result.count === 0) {
      throw new DocumentStoreSkippedError();
    }
  }
}
