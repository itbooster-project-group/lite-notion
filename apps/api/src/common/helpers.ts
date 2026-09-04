import type { LockKey } from '../database/transaction';

/**
 * Email хранится нормализованным, поэтому уникальность держит обычный `@unique`.
 * Нормализация нужна и в DTO, и в сервисах — вызов может идти мимо HTTP.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Единственная блокировка приложения: сериализует пишущие операции владельца.
 * Живёт здесь — страницы и проекты обязаны блокировать владельца одним значением.
 */
export function ownerLock(ownerId: string): LockKey {
  return { value: ownerId };
}
