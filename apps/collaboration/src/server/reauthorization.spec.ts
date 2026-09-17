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
    schedule.arm(connection, new Date(Date.now() + 900_000), () => undefined);

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
      schedule.arm(connection, expiresAt, () => undefined);
    }

    vi.advanceTimersByTime(900_000);

    expect(new Set(fired).size).toBeGreaterThan(1);
  });

  it('каждое соединение комнаты живёт по своему сроку', () => {
    const schedule = createReauthorizationSchedule({ ...timings, jitterMs: 0 });
    const shortLived = fakeConnection('socket-short');
    const longLived = fakeConnection('socket-long');

    // Одна комната, два пользователя: срок одного не должен вытеснять срок другого.
    schedule.arm(shortLived, new Date(Date.now() + 120_000), () => undefined);
    schedule.arm(longLived, new Date(Date.now() + 900_000), () => undefined);

    vi.advanceTimersByTime(120_000 - timings.leadMs);

    expect(shortLived.requestToken).toHaveBeenCalled();
    expect(longLived.requestToken).not.toHaveBeenCalled();

    vi.advanceTimersByTime(900_000 - timings.leadMs);

    expect(longLived.requestToken).toHaveBeenCalled();
  });

  it('закрывает соединение, если клиент не ответил в грейс-период', () => {
    const schedule = createReauthorizationSchedule(timings);
    const connection = fakeConnection();
    const onGiveUp = vi.fn();
    schedule.arm(connection, new Date(Date.now() + 900_000), onGiveUp);

    vi.advanceTimersByTime(900_000);

    expect(connection.close).toHaveBeenCalled();
    expect(onGiveUp).toHaveBeenCalled();
  });

  it('продление снимает ожидание ответа и ставит новый срок', () => {
    const schedule = createReauthorizationSchedule(timings);
    const connection = fakeConnection();
    schedule.arm(connection, new Date(Date.now() + 900_000), () => undefined);

    vi.advanceTimersByTime(900_000 - timings.leadMs + timings.jitterMs);
    schedule.arm(connection, new Date(Date.now() + 900_000), () => undefined);
    vi.advanceTimersByTime(timings.responseGraceMs * 2);

    expect(connection.close).not.toHaveBeenCalled();
  });

  it('терпит недоступность в пределах окна и сдаётся по его исчерпании', () => {
    let clock = 0;
    const schedule = createReauthorizationSchedule(timings, () => clock);
    const connection = fakeConnection();
    schedule.arm(connection, new Date(900_000), () => undefined);

    expect(schedule.tolerate(connection, () => undefined)).toBe(true);

    clock += timings.unavailableGraceMs + 1;

    expect(schedule.tolerate(connection, () => undefined)).toBe(false);
  });

  it('повторяет попытку внутри окна недоступности', () => {
    const schedule = createReauthorizationSchedule(timings);
    const connection = fakeConnection();
    schedule.arm(connection, new Date(Date.now() + 900_000), () => undefined);
    schedule.tolerate(connection, () => undefined);

    vi.advanceTimersByTime(timings.responseGraceMs);

    expect(connection.requestToken).toHaveBeenCalled();
  });

  it('закрывает соединение, если клиент молчит на повторе после недоступности', () => {
    const schedule = createReauthorizationSchedule(timings);
    const connection = fakeConnection();
    const onGiveUp = vi.fn();
    schedule.arm(connection, new Date(Date.now() + 900_000), onGiveUp);
    schedule.tolerate(connection, onGiveUp);

    // Повтор уходит клиенту, а он не отвечает: ожидание ответа обязано быть и здесь.
    vi.advanceTimersByTime(timings.responseGraceMs);

    expect(connection.requestToken).toHaveBeenCalledTimes(1);
    expect(connection.close).not.toHaveBeenCalled();

    vi.advanceTimersByTime(timings.responseGraceMs);

    expect(onGiveUp).toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
  });

  it('забытое соединение больше не будит таймеры', () => {
    const schedule = createReauthorizationSchedule(timings);
    const connection = fakeConnection();
    schedule.arm(connection, new Date(Date.now() + 900_000), () => undefined);
    schedule.forget(connection.socketId);

    vi.advanceTimersByTime(900_000);

    expect(connection.requestToken).not.toHaveBeenCalled();
    expect(connection.close).not.toHaveBeenCalled();
  });
});
