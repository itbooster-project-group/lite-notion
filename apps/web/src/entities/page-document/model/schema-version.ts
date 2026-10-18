export const PAGE_DOCUMENT_SCHEMA_VERSION = 2;
export const PAGE_CONTENT_YJS_FIELD = 'default';

export type PageDocumentSchemaVersion = 1 | typeof PAGE_DOCUMENT_SCHEMA_VERSION;

const SUPPORTED_PAGE_DOCUMENT_SCHEMA_VERSIONS = [1, PAGE_DOCUMENT_SCHEMA_VERSION] as const;

export function isSupportedPageDocumentSchemaVersion(
  value: unknown,
): value is PageDocumentSchemaVersion {
  return (
    value === SUPPORTED_PAGE_DOCUMENT_SCHEMA_VERSIONS[0] || value === PAGE_DOCUMENT_SCHEMA_VERSION
  );
}
