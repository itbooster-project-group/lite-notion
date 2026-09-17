import type { Connection } from '@hocuspocus/server';

export interface ReauthorizationTimings {
  /** За сколько до истечения токена запрашивать новый. */
  leadMs: number;
  /** Разброс, чтобы соединения не пошли на продление синхронно после деплоя. */
  jitterMs: number;
  /** Сколько ждать ответа клиента на запрос токена. */
  responseGraceMs: number;
  /** Сколько соединение живёт, пока проверка невозможна по вине инфраструктуры. */
  unavailableGraceMs: number;
}

export interface ReauthorizationSchedule {
  /** Срок берётся из личности этого соединения: у соседа по комнате он свой. */
  arm(connection: Connection, expiresAt: Date, onGiveUp: () => void): void;
  /** `true`, пока грейс-окно недоступности не исчерпано. */
  tolerate(connection: Connection, onGiveUp: () => void): boolean;
  forget(socketId: string): void;
  stop(): void;
}

interface Tracked {
  refreshTimer: NodeJS.Timeout;
  responseTimer: NodeJS.Timeout | undefined;
  unavailableSince: number | undefined;
}

export function defaultTimings(): ReauthorizationTimings {
  return {
    jitterMs: 30_000,
    leadMs: 60_000,
    responseGraceMs: 15_000,
    unavailableGraceMs: 300_000,
  };
}

/**
 * Сроки переавторизации соединений. Вынесено из сервера, потому что тесты обязаны
 * управлять временем, а не ждать реальных минут.
 */
export function createReauthorizationSchedule(
  timings: ReauthorizationTimings = defaultTimings(),
  now: () => number = Date.now,
): ReauthorizationSchedule {
  const tracked = new Map<string, Tracked>();

  const delayUntil = (expiresAt: Date): number => {
    const jitter = Math.floor(Math.random() * timings.jitterMs);

    return Math.max(0, expiresAt.getTime() - now() - timings.leadMs - jitter);
  };

  const clear = (entry: Tracked): void => {
    clearTimeout(entry.refreshTimer);

    if (entry.responseTimer !== undefined) {
      clearTimeout(entry.responseTimer);
    }
  };

  /**
   * Запрос токена и ожидание ответа всегда идут вместе: молчащий клиент обязан
   * терять соединение и на плановом продлении, и на повторе после недоступности.
   */
  const requestToken = (connection: Connection, onGiveUp: () => void): void => {
    connection.requestToken();

    const entry = tracked.get(connection.socketId);

    if (entry === undefined) {
      return;
    }

    const responseTimer = setTimeout(() => {
      onGiveUp();
      connection.close({ code: 4001, reason: 'token refresh timed out' });
    }, timings.responseGraceMs);

    responseTimer.unref?.();
    tracked.set(connection.socketId, { ...entry, responseTimer });
  };

  const schedule = (
    connection: Connection,
    delayMs: number,
    unavailableSince: number | undefined,
    onGiveUp: () => void,
  ): void => {
    const existing = tracked.get(connection.socketId);

    if (existing) {
      clear(existing);
    }

    const refreshTimer = setTimeout(() => requestToken(connection, onGiveUp), delayMs);

    refreshTimer.unref?.();
    tracked.set(connection.socketId, {
      refreshTimer,
      responseTimer: undefined,
      unavailableSince,
    });
  };

  return {
    arm(connection, expiresAt, onGiveUp) {
      schedule(connection, delayUntil(expiresAt), undefined, onGiveUp);
    },
    tolerate(connection, onGiveUp) {
      const entry = tracked.get(connection.socketId);

      if (entry === undefined) {
        return false;
      }

      const since = entry.unavailableSince ?? now();

      if (now() - since > timings.unavailableGraceMs) {
        return false;
      }

      // Следующая попытка внутри окна: короткая, а не по сроку токена.
      schedule(connection, timings.responseGraceMs, since, onGiveUp);

      return true;
    },
    forget(socketId) {
      const entry = tracked.get(socketId);

      if (entry) {
        clear(entry);
        tracked.delete(socketId);
      }
    },
    stop() {
      for (const entry of tracked.values()) {
        clear(entry);
      }

      tracked.clear();
    },
  };
}
