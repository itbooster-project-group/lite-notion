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
  /** Срок из аутентификации запоминается до того, как появится соединение. */
  remember(documentName: string, expiresAt: Date): void;
  arm(connection: Connection, documentName: string, onGiveUp: () => void): void;
  renew(connection: Connection, expiresAt: Date, onGiveUp: () => void): void;
  /** `true`, пока грейс-окно недоступности не исчерпано. */
  tolerate(connection: Connection): boolean;
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
  const pendingExpiry = new Map<string, Date>();

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

  const schedule = (connection: Connection, expiresAt: Date, onGiveUp: () => void): void => {
    const existing = tracked.get(connection.socketId);

    if (existing) {
      clear(existing);
    }

    const refreshTimer = setTimeout(() => {
      connection.requestToken();

      const entry = tracked.get(connection.socketId);

      if (entry === undefined) {
        return;
      }

      // Клиент может не ответить вовсе: соединение не должно жить дальше молча.
      const responseTimer = setTimeout(() => {
        onGiveUp();
        connection.close({ code: 4001, reason: 'token refresh timed out' });
      }, timings.responseGraceMs);

      responseTimer.unref?.();
      tracked.set(connection.socketId, { ...entry, responseTimer });
    }, delayUntil(expiresAt));

    refreshTimer.unref?.();
    tracked.set(connection.socketId, {
      refreshTimer,
      responseTimer: undefined,
      unavailableSince: undefined,
    });
  };

  return {
    remember(documentName, expiresAt) {
      pendingExpiry.set(documentName, expiresAt);
    },
    arm(connection, documentName, onGiveUp) {
      const expiresAt = pendingExpiry.get(documentName);

      if (expiresAt !== undefined) {
        schedule(connection, expiresAt, onGiveUp);
      }
    },
    renew(connection, expiresAt, onGiveUp) {
      schedule(connection, expiresAt, onGiveUp);
    },
    tolerate(connection) {
      const entry = tracked.get(connection.socketId);

      if (entry === undefined) {
        return false;
      }

      const since = entry.unavailableSince ?? now();

      if (now() - since > timings.unavailableGraceMs) {
        return false;
      }

      clear(entry);
      // Следующая попытка внутри окна: короткая, а не по сроку токена.
      const refreshTimer = setTimeout(() => connection.requestToken(), timings.responseGraceMs);
      refreshTimer.unref?.();
      tracked.set(connection.socketId, {
        refreshTimer,
        responseTimer: undefined,
        unavailableSince: since,
      });

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
      pendingExpiry.clear();
    },
  };
}
