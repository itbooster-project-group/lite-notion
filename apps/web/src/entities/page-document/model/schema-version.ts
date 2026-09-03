export const PAGE_DOCUMENT_SCHEMA_VERSION = 1;
export const PAGE_CONTENT_YJS_FIELD = 'default';

export type PageDocumentSchemaVersion = typeof PAGE_DOCUMENT_SCHEMA_VERSION;

export function isSupportedPageDocumentSchemaVersion(
  value: unknown,
): value is PageDocumentSchemaVersion {
  return value === PAGE_DOCUMENT_SCHEMA_VERSION;
}
