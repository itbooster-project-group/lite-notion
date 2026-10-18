import type { Document as HocusDocument, Hocuspocus } from '@hocuspocus/server';
import * as Y from 'yjs';
import type { InternalApiClient, PersistedDocumentRecord } from '../api/internal-api-client.js';
import { parsePageDocumentName } from './document-name.js';
import {
  DOCUMENT_MAX_BYTES,
  DocumentSizeLimitExceededError,
  documentStorageRevision,
  documentTiptapSchemaVersion,
  setDocumentStorageRevision,
  setDocumentTiptapSchemaVersion,
} from './persistence.js';

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
      const live = await activeDocument;
      if (documentStorageRevision(live) === undefined) {
        setDocumentStorageRevision(live, persisted.storageRevision);
        setDocumentTiptapSchemaVersion(live, persisted.tiptapSchemaVersion);
      }
      return this.persistLiveState(pageId, live);
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

      let expectedRevision = documentStorageRevision(document);
      let schemaVersion = documentTiptapSchemaVersion(document);
      if (expectedRevision === undefined) {
        const latest = await this.api.readDocumentRecord(pageId);
        expectedRevision = latest.storageRevision;
        schemaVersion = latest.tiptapSchemaVersion;
      }
      schemaVersion ??= 1;
      let state = yjsState;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await this.api.replaceDocument(
          pageId,
          state,
          expectedRevision,
          schemaVersion,
        );
        if (result.accepted) {
          setDocumentStorageRevision(document, result.document.storageRevision);
          setDocumentTiptapSchemaVersion(document, result.document.tiptapSchemaVersion);
          return { ...result.document, yjsState: state };
        }
        Y.applyUpdate(document, result.document.yjsState);
        state = this.encodeState(document);
        expectedRevision = result.document.storageRevision;
        schemaVersion = result.document.tiptapSchemaVersion;
      }
      throw new Error('Document changed concurrently too many times');
    });
  }
}
