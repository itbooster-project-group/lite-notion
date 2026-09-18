/**
 * Нарушение уникальности email на уровне базы. Отдельный тип нужен, чтобы
 * репозиторий не знал про HTTP: перевод в `ConflictException` делает сервис.
 */
export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('Email is already registered');
    this.name = 'EmailAlreadyRegisteredError';
  }
}

/** Причина наружу не уходит: просроченный, malformed и чужой токен неразличимы. */
export class AccessTokenVerificationError extends Error {
  constructor() {
    super('Access token verification failed');
    this.name = 'AccessTokenVerificationError';
  }
}
