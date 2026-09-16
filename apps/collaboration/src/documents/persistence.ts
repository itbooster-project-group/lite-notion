import * as Y from 'yjs';

import { ApiDeniedError, type InternalApiClient } from '../api/internal-api-client.js';
import { parsePageDocumentName } from './document-name.js';

/** Предел итогового Yjs state. WebSocket payload ограничивается отдельно. */
export const DOCUMENT_MAX_BYTES = 1024 * 1024;

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
      return this.createDocumentFromState(await this.api.readDocument(pageId));
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
      await this.api.replaceDocument(pageId, state);
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
