import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from './prisma.service';

/**
 * Клиент запроса: пул либо транзакция. Запрос на клиенте пула внутри `$transaction`
 * уходит на другое соединение — мимо локов и отката, не падая. Клиент транзакции
 * репозиторий получает через `bind`.
 */
export type DatabaseClient = Prisma.TransactionClient;

/**
 * Ключ advisory-блокировки. Строится только `ownerLock`: ключ со стороны
 * сериализовал бы операции не с теми, с кем нужно.
 */
export interface LockKey {
  value: string;
}

/** Клиент объявлен реализацией, чтобы контракт не зависел от Prisma. */
export interface TransactionScope {
  lock(key: LockKey): Promise<void>;
}

export class PrismaTransactionScope implements TransactionScope {
  constructor(readonly client: DatabaseClient) {}

  async lock(key: LockKey): Promise<void> {
    await this.client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key.value}))`;
  }
}

/** Чужой скоуп отклоняется, а не приводится типом. */
export function databaseClientOf(scope: TransactionScope): DatabaseClient {
  if (!(scope instanceof PrismaTransactionScope)) {
    throw new Error('Prisma repository requires a Prisma transaction scope');
  }

  return scope.client;
}

/** Транзакцию открывает юзкейс, а не репозиторий. Абстрактный класс служит DI-токеном. */
@Injectable()
export abstract class TransactionRunner {
  abstract run<T>(operation: (scope: TransactionScope) => Promise<T>): Promise<T>;
}

@Injectable()
export class PrismaTransactionRunner extends TransactionRunner {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  run<T>(operation: (scope: TransactionScope) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => operation(new PrismaTransactionScope(tx)));
  }
}
