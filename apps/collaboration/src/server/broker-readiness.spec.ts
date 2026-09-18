import { describe, expect, it, vi } from 'vitest';

import {
  assertBrokerReachable,
  type BrokerProbe,
  BrokerUnavailableError,
} from './broker-readiness.js';

type ErrorListener = (event: 'error', listener: (error: Error) => void) => unknown;

function probe(ping: () => Promise<unknown>) {
  return {
    off: vi.fn<ErrorListener>(),
    on: vi.fn<ErrorListener>(),
    ping,
  } satisfies BrokerProbe;
}

describe('assertBrokerReachable', () => {
  it('пропускает старт, когда брокер отвечает', async () => {
    await expect(
      assertBrokerReachable(
        probe(async () => 'PONG'),
        50,
      ),
    ).resolves.toBeUndefined();
  });

  it('останавливает старт, когда брокер недоступен', async () => {
    const unreachable = probe(async () => {
      throw new Error('connect ECONNREFUSED');
    });

    await expect(assertBrokerReachable(unreachable, 50)).rejects.toBeInstanceOf(
      BrokerUnavailableError,
    );
  });

  it('останавливает старт, когда брокер молчит', async () => {
    // ioredis копит команды в offline-очереди, поэтому висящий ping — это тоже недоступность.
    const silent = probe(() => new Promise(() => undefined));

    await expect(assertBrokerReachable(silent, 20)).rejects.toBeInstanceOf(BrokerUnavailableError);
  });

  it('снимает свой слушатель ошибок после проверки', async () => {
    const reachable = probe(async () => 'PONG');

    await assertBrokerReachable(reachable, 50);

    expect(reachable.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(reachable.off).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
