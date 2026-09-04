import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ownerLock } from '../common/helpers';
import {
  type DatabaseClient,
  databaseClientOf,
  PrismaTransactionRunner,
  PrismaTransactionScope,
  type TransactionScope,
} from './transaction';

const OWNER_ID = '11111111-1111-1111-1111-111111111111';

function createClient(): { $executeRaw: ReturnType<typeof vi.fn> } {
  return { $executeRaw: vi.fn(async () => 1) };
}

describe('PrismaTransactionScope', () => {
  let client: ReturnType<typeof createClient>;
  let scope: PrismaTransactionScope;

  beforeEach(() => {
    client = createClient();
    // biome-ignore lint/suspicious/noExplicitAny: узкий тестовый двойник клиента Prisma
    scope = new PrismaTransactionScope(client as any);
  });

  it('берёт advisory lock значением ключа', async () => {
    await scope.lock(ownerLock(OWNER_ID));

    expect(client.$executeRaw).toHaveBeenCalledOnce();
    expect(client.$executeRaw.mock.calls[0]?.[1]).toBe(OWNER_ID);
  });

  it('берёт лок столько раз, сколько его запросили', async () => {
    await scope.lock(ownerLock(OWNER_ID));
    await scope.lock(ownerLock(OWNER_ID));

    expect(client.$executeRaw).toHaveBeenCalledTimes(2);
  });
});

describe('databaseClientOf', () => {
  it('отдаёт клиент транзакции для скоупа Prisma', () => {
    const client = createClient();
    // biome-ignore lint/suspicious/noExplicitAny: узкий тестовый двойник клиента Prisma
    const scope = new PrismaTransactionScope(client as any);

    expect(databaseClientOf(scope)).toBe(client as unknown as DatabaseClient);
  });

  it('отклоняет чужой скоуп, а не приводит его типом', () => {
    const foreign: TransactionScope = { lock: async () => undefined };

    expect(() => databaseClientOf(foreign)).toThrow(/Prisma transaction scope/);
  });
});

describe('PrismaTransactionRunner', () => {
  it('выполняет операцию внутри одной транзакции и отдаёт её результат', async () => {
    const client = createClient();
    const prisma = { $transaction: vi.fn(async (run: (tx: unknown) => unknown) => run(client)) };
    // biome-ignore lint/suspicious/noExplicitAny: узкий тестовый двойник PrismaService
    const runner = new PrismaTransactionRunner(prisma as any);

    const result = await runner.run(async (scope) => {
      await scope.lock(ownerLock(OWNER_ID));

      return 'done';
    });

    expect(result).toBe('done');
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(client.$executeRaw).toHaveBeenCalledOnce();
  });

  it('передаёт операции скоуп, привязанный к клиенту транзакции', async () => {
    const client = createClient();
    const prisma = { $transaction: vi.fn(async (run: (tx: unknown) => unknown) => run(client)) };
    // biome-ignore lint/suspicious/noExplicitAny: узкий тестовый двойник PrismaService
    const runner = new PrismaTransactionRunner(prisma as any);

    const bound = await runner.run(async (scope) => databaseClientOf(scope));

    expect(bound).toBe(client as unknown as DatabaseClient);
  });
});
