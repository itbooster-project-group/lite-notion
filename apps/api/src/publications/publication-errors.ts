export class PublicationNotFoundError extends Error {
  constructor() {
    super('Publication not found');
    this.name = 'PublicationNotFoundError';
  }
}

export class PublicationStateConflictError extends Error {
  constructor() {
    super('Publication state does not allow this operation');
    this.name = 'PublicationStateConflictError';
  }
}

export class PublicationSlugConflictError extends Error {
  constructor() {
    super('Publication slug is already in use');
    this.name = 'PublicationSlugConflictError';
  }
}

export class PublicationAssetUnavailableError extends Error {
  constructor() {
    super('A publication asset is unavailable');
    this.name = 'PublicationAssetUnavailableError';
  }
}
