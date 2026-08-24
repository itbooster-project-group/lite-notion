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
