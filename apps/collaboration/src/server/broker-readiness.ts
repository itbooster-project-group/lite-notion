import { Redis } from '@hocuspocus/extension-redis';

import type { CollaborationConfig } from '../config/environment.js';

/** Отличима от прочих ошибок запуска: startup обязан падать именно на брокере. */
export class BrokerUnavailableError extends Error {
  constructor() {
    super('Broker is unavailable');
    this.name = 'BrokerUnavailableError';
  }
}

export interface BrokerProbe {
  ping(): Promise<unknown>;
  on(event: 'error', listener: (error: Error) => void): unknown;
  off(event: 'error', listener: (error: Error) => void): unknown;
}

/** Столько ждём ответа брокера на старте: дальше это уже не медленная сеть, а недоступность. */
export const brokerReadinessTimeoutMs = 5_000;

export function createBroker(config: CollaborationConfig): Redis {
  return new Redis({ host: config.redisHost, port: config.redisPort });
}

/**
 * Брокер обязателен: без него реплики расходятся молча, поэтому недоступность
 * обязана останавливать startup, а не всплыть на первой публикации.
 */
export async function assertBrokerReachable(
  probe: BrokerProbe,
  timeoutMs: number = brokerReadinessTimeoutMs,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  // Без слушателя ioredis роняет процесс на 'error' вместо ожидаемого отказа.
  const swallow = (): void => undefined;

  probe.on('error', swallow);

  try {
    await Promise.race([
      probe.ping(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new BrokerUnavailableError()), timeoutMs);
      }),
    ]);
  } catch {
    throw new BrokerUnavailableError();
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }

    probe.off('error', swallow);
  }
}
