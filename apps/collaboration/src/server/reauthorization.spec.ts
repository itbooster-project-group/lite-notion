import type { Connection } from '@hocuspocus/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createReauthorizationSchedule, type ReauthorizationTimings } from './reauthorization.js';

const timings: ReauthorizationTimings = {
  jitterMs: 1_000,
  leadMs: 60_000,
  responseGraceMs: 15_000,
  unavailableGraceMs: 300_000,
};

function fakeConnection(socketId = 'socket-1') {
  return {
    close: vi.fn(),
    requestToken: vi.fn(),
    socketId,
  } as unknown as Connection & {
    close: ReturnType<typeof vi.fn>;
    requestToken: ReturnType<typeof vi.fn>;
  };
}

describe('createReauthorizationSchedule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('запрашивает токен до истечения, а не после', () => {
    const schedule = createReauthorizationSchedule(timings);
    const connection = fakeConnection();
    schedule.remember('page:a', new Date(Date.now() + 900_000));
    schedule.arm(connection, 'page:a', () => undefined);

    // Запас leadMs плюс джиттер: к этому моменту запрос уже должен уйти.
    vi.advanceTimersByTime(900_000 - timings.leadMs);

    expect(connection.requestToken).toHaveBeenCalled();
  });

  it('джиттер разводит одновременные соединения', () => {
    const schedule = createReauthorizationSchedule({ ...timings, jitterMs: 60_000 });
    const expiresAt = new Date(Date.now() + 900_000);
    const fired: number[] = [];

    for (let index = 0; index < 20; index += 1) {
      const connection = fakeConnection(`socket-${index}`);
      Object.defineProperty(connection, 'requestToken', {
        value: () => fired.push(Date.now()),
      });
      schedule.remember(`page:${index}`, expiresAt);
      schedule.arm(connection, `page:${index}`, () => undefined);
    }

    vi.advanceTimersByTime(900_000);

    expect(new Set(fired).size).toBeGreaterThan(1);
  });

  it('закрывает соединение, если клиент не ответил в грейс-период', () => {
    const schedule = createReauthorizationSchedule(timings);
    const connection = fakeConnection();
    const onGiveUp = vi.fn();
    schedule.remember('page:a', new Date(Date.now() + 900_000));
    schedule.arm(connection, 'page:a', onGiveUp);

    vi.advanceTimersByTime(900_000);

    expect(connection.close).toHaveBeenCalled();
    expect(onGiveUp).toHaveBeenCalled();
  });

  it('продление снимает ожидание ответа и ставит новый срок', () => {
    const schedule = createReauthorizationSchedule(timings);
    const connection = fakeConnection();
    schedule.remember('page:a', new Date(Date.now() + 900_000));
    schedule.arm(connection, 'page:a', () => undefined);

    vi.advanceTimersByTime(900_000 - timings.leadMs + timings.jitterMs);
    schedule.renew(connection, new Date(Date.now() + 900_000), () => undefined);
    vi.advanceTimersByTime(timings.responseGraceMs * 2);

    expect(connection.close).not.toHaveBeenCalled();
  });

  it('терпит недоступность в пределах окна и сдаётся по его исчерпании', () => {
    let clock = 0;
    const schedule = createReauthorizationSchedule(timings, () => clock);
    const connection = fakeConnection();
    schedule.remember('page:a', new Date(900_000));
    schedule.arm(connection, 'page:a', () => undefined);

    expect(schedule.tolerate(connection)).toBe(true);

    clock += timings.unavailableGraceMs + 1;

    expect(schedule.tolerate(connection)).toBe(false);
  });

  it('повторяет попытку внутри окна недоступности', () => {
    const schedule = createReauthorizationSchedule(timings);
    const connection = fakeConnection();
    schedule.remember('page:a', new Date(Date.now() + 900_000));
    schedule.arm(connection, 'page:a', () => undefined);
    schedule.tolerate(connection);

    vi.advanceTimersByTime(timings.responseGraceMs);

    expect(connection.requestToken).toHaveBeenCalled();
  });

  it('забытое соединение больше не будит таймеры', () => {
    const schedule = createReauthorizationSchedule(timings);
    const connection = fakeConnection();
    schedule.remember('page:a', new Date(Date.now() + 900_000));
    schedule.arm(connection, 'page:a', () => undefined);
    schedule.forget(connection.socketId);

    vi.advanceTimersByTime(900_000);

    expect(connection.requestToken).not.toHaveBeenCalled();
    expect(connection.close).not.toHaveBeenCalled();
  });
});
