import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionRepository } from './session.repository';
import { InMemorySessionRepository } from './session.repository.in-memory';
import { REVOKED_SESSION_RETENTION_MS, SessionCleanupService } from './session-cleanup.service';

const now = new Date('2026-08-21T12:00:00.000Z');

describe('SessionCleanupService', () => {
  let service: SessionCleanupService;
  let repository: InMemorySessionRepository;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    repository = new InMemorySessionRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [SessionCleanupService, { provide: SessionRepository, useValue: repository }],
    }).compile();

    service = moduleRef.get(SessionCleanupService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function seed(overrides: { expiresAt: Date; revokedAt?: Date }): Promise<string> {
    const session = await repository.create({
      expiresAt: overrides.expiresAt,
      familyId: 'family',
      ip: null,
      tokenHash: `hash-${repository.records.size}`,
      userAgent: null,
      userId: 'user-id',
    });

    if (overrides.revokedAt !== undefined) {
      repository.records.set(session.id, { ...session, revokedAt: overrides.revokedAt });
    }

    return session.id;
  }

  it('удаляет истёкшие сессии', async () => {
    const expired = await seed({ expiresAt: new Date(now.getTime() - 1) });

    await service.removeStaleSessions();

    expect(repository.records.has(expired)).toBe(false);
  });

  it('удаляет сессии, отозванные раньше порога хранения', async () => {
    const longRevoked = await seed({
      expiresAt: new Date(now.getTime() + 86_400_000),
      revokedAt: new Date(now.getTime() - REVOKED_SESSION_RETENTION_MS - 1),
    });

    await service.removeStaleSessions();

    expect(repository.records.has(longRevoked)).toBe(false);
  });

  it('сохраняет действующие сессии', async () => {
    const live = await seed({ expiresAt: new Date(now.getTime() + 86_400_000) });

    await service.removeStaleSessions();

    expect(repository.records.has(live)).toBe(true);
  });

  it('сохраняет недавно отозванные сессии, нужные grace-периоду и расследованию', async () => {
    const recentlyRevoked = await seed({
      expiresAt: new Date(now.getTime() + 86_400_000),
      revokedAt: new Date(now.getTime() - 1_000),
    });

    await service.removeStaleSessions();

    expect(repository.records.has(recentlyRevoked)).toBe(true);
  });

  it('логирует ошибку базы и не пробрасывает её наружу', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(repository, 'deleteStale').mockRejectedValueOnce(new Error('connection refused'));

    await expect(service.removeStaleSessions()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('выполняет следующий запуск после неуспешного', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const deleteStale = vi.spyOn(repository, 'deleteStale');
    deleteStale.mockRejectedValueOnce(new Error('connection refused'));

    await service.removeStaleSessions();
    const live = await seed({ expiresAt: new Date(now.getTime() - 1) });
    await service.removeStaleSessions();

    expect(deleteStale).toHaveBeenCalledTimes(2);
    expect(repository.records.has(live)).toBe(false);
  });

  it('не логирует, когда удалять нечего', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await service.removeStaleSessions();

    expect(log).not.toHaveBeenCalled();
  });
});
