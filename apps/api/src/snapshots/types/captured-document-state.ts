export interface CapturedDocumentState {
  yjsState: Uint8Array<ArrayBuffer>;
  storageRevision: bigint;
  tiptapSchemaVersion: number;
}
