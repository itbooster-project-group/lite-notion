import { describe, expect, it } from 'vitest';

import { ownerLock } from '../common/helpers';
import { InMemoryTransactionRunner } from './transaction.in-memory';

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_OWNER_ID = '22222222-2222-2222-2222-222222222222';

describe('InMemoryTransactionRunner', () => {
  it('вызывает операцию со скоупом и отдаёт её результат', async () => {
    const runner = new InMemoryTransactionRunner();

    const result = await runner.run(async (scope) => {
      await scope.lock(ownerLock(OWNER_ID));

      return 'done';
    });

    expect(result).toBe('done');
    expect(runner.scopes).toHaveLength(1);
    expect(runner.scopes[0]?.taken).toEqual([ownerLock(OWNER_ID)]);
  });

  it('заводит отдельный скоуп на каждую операцию', async () => {
    const runner = new InMemoryTransactionRunner();

    await runner.run(async (scope) => scope.lock(ownerLock(OWNER_ID)));
    await runner.run(async (scope) => scope.lock(ownerLock(OTHER_OWNER_ID)));

    expect(runner.scopes).toHaveLength(2);
    expect(runner.scopes[1]?.taken).toEqual([ownerLock(OTHER_OWNER_ID)]);
  });
});
