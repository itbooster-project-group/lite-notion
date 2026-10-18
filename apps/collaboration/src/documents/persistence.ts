import * as Y from 'yjs';

import { ApiDeniedError } from '../api/errors/api-denied.error.js';
import type { InternalApiClient } from '../api/internal-api-client.js';
import { parsePageDocumentName } from './document-name.js';

/** Предел итогового Yjs state. WebSocket payload ограничивается отдельно. */
export const DOCUMENT_MAX_BYTES = 1024 * 1024;
const documentRevisions = new WeakMap<Y.Doc, bigint>();
const documentSchemaVersions = new WeakMap<Y.Doc, number>();

export function documentStorageRevision(document: Y.Doc): bigint | undefined {
  return documentRevisions.get(document);
}

export function setDocumentStorageRevision(document: Y.Doc, revision: bigint): void {
  documentRevisions.set(document, revision);
}

export function documentTiptapSchemaVersion(document: Y.Doc): number | undefined {
  return documentSchemaVersions.get(document);
}

export function setDocumentTiptapSchemaVersion(document: Y.Doc, version: number): void {
  documentSchemaVersions.set(document, version);
}

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

/**
 * Содержимое ходит через внутренние маршруты API под сервисным креденшлом:
 * у отложенного сохранения пользователя в скоупе нет.
 */
export class PageDocumentPersistence {
  constructor(private readonly api: InternalApiClient) {}

  async load(documentName: string): Promise<Y.Doc> {
    const { pageId } = parsePageDocumentName(documentName);

    try {
      const record = await this.api.readDocumentRecord(pageId);
      const document = this.createDocumentFromState(record.yjsState);
      setDocumentStorageRevision(document, record.storageRevision);
      setDocumentTiptapSchemaVersion(document, record.tiptapSchemaVersion);
      return document;
    } catch (error) {
      if (error instanceof ApiDeniedError) {
        throw new DocumentLoadError();
      }

      throw error;
    }
  }

  async store(documentName: string, document: Y.Doc): Promise<void> {
    const { pageId } = parsePageDocumentName(documentName);
    const state = Y.encodeStateAsUpdate(document);

    if (state.byteLength > DOCUMENT_MAX_BYTES) {
      throw new DocumentSizeLimitExceededError();
    }

    try {
      let expectedRevision = documentStorageRevision(document);
      let schemaVersion = documentTiptapSchemaVersion(document);
      if (expectedRevision === undefined) {
        const latest = await this.api.readDocumentRecord(pageId);
        expectedRevision = latest.storageRevision;
        schemaVersion = latest.tiptapSchemaVersion;
      }
      schemaVersion ??= 1;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await this.api.replaceDocument(
          pageId,
          Y.encodeStateAsUpdate(document),
          expectedRevision,
          schemaVersion,
        );
        if (result.accepted) {
          setDocumentStorageRevision(document, result.document.storageRevision);
          setDocumentTiptapSchemaVersion(document, result.document.tiptapSchemaVersion);
          return;
        }
        Y.applyUpdate(document, result.document.yjsState);
        expectedRevision = result.document.storageRevision;
        schemaVersion = result.document.tiptapSchemaVersion;
      }
      throw new Error('Document changed concurrently too many times');
    } catch (error) {
      // Отказ по инварианту живости страницы: комнату надо завершить, а не повторять.
      if (error instanceof ApiDeniedError) {
        throw new DocumentStoreSkippedError();
      }

      throw error;
    }
  }

  private createDocumentFromState(state: Uint8Array): Y.Doc {
    const document = new Y.Doc();

    // Пустой state — валидное состояние нового документа: applyUpdate на нём бросает.
    if (state.byteLength > 0) {
      Y.applyUpdate(document, state);
    }

    return document;
  }
}
