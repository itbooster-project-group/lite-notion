import type { Document as HocusDocument, Hocuspocus } from '@hocuspocus/server';
import * as Y from 'yjs';
import type { InternalApiClient, PersistedDocumentRecord } from '../api/internal-api-client.js';
import { parsePageDocumentName } from './document-name.js';
import { DOCUMENT_MAX_BYTES, DocumentSizeLimitExceededError } from './persistence.js';

export class DocumentCaptureEncodingError extends Error {
  constructor() {
    super('Document capture encoding failed');
  }
}

/** Captures a live document if this process owns one, otherwise reads persisted state. */
export class DocumentCapture {
  constructor(
    private readonly api: InternalApiClient,
    private readonly encodeState: (document: Y.Doc) => Uint8Array = Y.encodeStateAsUpdate,
  ) {}

  async capture(pageId: string, instance: Hocuspocus): Promise<PersistedDocumentRecord> {
    const { documentName } = parsePageDocumentName(`page:${pageId}`);
    const document = await this.findActiveDocument(documentName, instance);

    if (document !== undefined) {
      return this.persistLiveState(pageId, document);
    }

    const persisted = await this.api.readDocumentRecord(pageId);
    const activeDocument = this.findActiveDocument(documentName, instance);

    if (activeDocument !== undefined) {
      return this.persistLiveState(pageId, await activeDocument);
    }

    return persisted;
  }

  private findActiveDocument(
    documentName: string,
    instance: Hocuspocus,
  ): HocusDocument | Promise<HocusDocument> | undefined {
    const document = instance.documents.get(documentName);

    if (document !== undefined) {
      return document;
    }

    // Hocuspocus tracks a load before publishing its document in the live map.
    return instance.loadingDocuments.get(documentName);
  }

  private async persistLiveState(
    pageId: string,
    document: HocusDocument,
  ): Promise<PersistedDocumentRecord> {
    return document.saveMutex.runExclusive(async () => {
      let yjsState: Uint8Array;

      try {
        yjsState = this.encodeState(document);
      } catch {
        throw new DocumentCaptureEncodingError();
      }

      if (yjsState.byteLength > DOCUMENT_MAX_BYTES) {
        throw new DocumentSizeLimitExceededError();
      }

      const persisted = await this.api.replaceDocument(pageId, yjsState);

      return {
        ...persisted,
        yjsState,
      };
    });
  }
}
