import type { LockKey, TransactionScope } from './transaction';
import { TransactionRunner } from './transaction';

/**
 * Тестовый скоуп. Advisory lock не берётся — однопоточность JavaScript уже
 * сериализует операции. Взятые ключи сохраняются, чтобы тест мог их проверить.
 */
export class InMemoryTransactionScope implements TransactionScope {
  readonly taken: LockKey[] = [];

  lock(key: LockKey): Promise<void> {
    this.taken.push(key);

    return Promise.resolve();
  }
}

/** Откат не воспроизводится — его проверяют интеграционные тесты. */
export class InMemoryTransactionRunner extends TransactionRunner {
  readonly scopes: InMemoryTransactionScope[] = [];

  run<T>(operation: (scope: InMemoryTransactionScope) => Promise<T>): Promise<T> {
    const scope = new InMemoryTransactionScope();

    this.scopes.push(scope);

    return operation(scope);
  }
}
