export interface PageDocumentRoom {
  documentName: string;
  pageId: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidDocumentNameError extends Error {
  constructor() {
    super('Invalid collaboration document name');
  }
}

export function parsePageDocumentName(documentName: string): PageDocumentRoom {
  const parts = documentName.split(':');

  const pageId = parts[1];

  if (
    parts.length !== 2 ||
    parts[0] !== 'page' ||
    typeof pageId !== 'string' ||
    !uuid.test(pageId)
  ) {
    throw new InvalidDocumentNameError();
  }

  return {
    documentName,
    pageId,
  };
}
