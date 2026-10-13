export type DocumentProjectionErrorCode =
  | 'unsupported_schema_version'
  | 'invalid_yjs_state'
  | 'unsupported_content'
  | 'invalid_media_attributes';

export class DocumentProjectionError extends Error {
  constructor(
    readonly code: DocumentProjectionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DocumentProjectionError';
  }
}
