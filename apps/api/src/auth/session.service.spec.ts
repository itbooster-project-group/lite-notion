import { UnauthorizedException } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applicationConfig } from '../config/application-config';
import { SessionRepository } from './session.repository';
import { InMemorySessionRepository } from './session.repository.in-memory';
import { REFRESH_GRACE_PERIOD_MS, SessionService } from './session.service';
import { TokenService } from './token.service';

const accessTokenTtlS = 900;
const refreshTokenTtlS = 2_592_000;
const jwtSecret = 'test-jwt-secret-value-at-least-32-chars';
const origin = { ip: '127.0.0.1', userAgent: 'vitest' };

describe('SessionService', () => {
  let service: SessionService;
  let repository: InMemorySessionRepository;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T12:00:00.000Z'));

    repository = new InMemorySessionRepository();

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: jwtSecret })],
      providers: [
        SessionService,
        TokenService,
        { provide: SessionRepository, useValue: repository },
        {
          provide: applicationConfig.KEY,
          useValue: { accessTokenTtlS, jwtSecret, refreshTokenTtlS },
        },
      ],
    }).compile();

    service = moduleRef.get(SessionService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('issue', () => {
    it('сохраняет хеш токена, а не сам токен', async () => {
      const issued = await service.issue('user-id', origin);
      const stored = repository.records.get(issued.sessionId);

      expect(stored?.tokenHash).toBeDefined();
      expect(stored?.tokenHash).not.toBe(issued.refreshToken);
      expect([...repository.records.values()].map((record) => record.tokenHash)).not.toContain(
        issued.refreshToken,
      );
    });

    it('задаёт срок истечения по настроенному refresh TTL', async () => {
      const issued = await service.issue('user-id', origin);

      expect(repository.records.get(issued.sessionId)?.expiresAt).toEqual(
        new Date(Date.now() + refreshTokenTtlS * 1000),
      );
    });

    it('открывает отдельную цепочку на каждый вход', async () => {
      const first = await service.issue('user-id', origin);
      const second = await service.issue('user-id', origin);

      expect(repository.records.get(first.sessionId)?.familyId).not.toBe(
        repository.records.get(second.sessionId)?.familyId,
      );
    });
  });

  describe('rotate', () => {
    it('выдаёт новую пару и отзывает предъявленную сессию', async () => {
      const issued = await service.issue('user-id', origin);
      const rotated = await service.rotate(issued.refreshToken, origin);

      expect(rotated.refreshToken).not.toBe(issued.refreshToken);
      expect(repository.records.get(issued.sessionId)?.revokedAt).not.toBeNull();
      expect(repository.records.get(issued.sessionId)?.replacedById).toBe(rotated.sessionId);
    });

    it('сохраняет цепочку ротаций', async () => {
      const issued = await service.issue('user-id', origin);
      const rotated = await service.rotate(issued.refreshToken, origin);

      expect(repository.records.get(rotated.sessionId)?.familyId).toBe(
        repository.records.get(issued.sessionId)?.familyId,
      );
    });

    it('отклоняет неизвестный токен', async () => {
      await expect(service.rotate('unknown-token', origin)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('отклоняет истёкшую сессию, не отзывая цепочку', async () => {
      const issued = await service.issue('user-id', origin);
      const familyId = repository.records.get(issued.sessionId)?.familyId ?? '';

      vi.advanceTimersByTime(refreshTokenTtlS * 1000 + 1);

      await expect(service.rotate(issued.refreshToken, origin)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repository.liveSessionsOfFamily(familyId)).toHaveLength(1);
    });
  });

  describe('grace-период', () => {
    it('принимает повторное обновление внутри 30 секунд', async () => {
      const issued = await service.issue('user-id', origin);
      const first = await service.rotate(issued.refreshToken, origin);

      vi.advanceTimersByTime(REFRESH_GRACE_PERIOD_MS - 1);

      const second = await service.rotate(issued.refreshToken, origin);

      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(second.sessionId).not.toBe(first.sessionId);
    });

    it('оставляет в цепочке не более одной действующей сессии', async () => {
      const issued = await service.issue('user-id', origin);
      const familyId = repository.records.get(issued.sessionId)?.familyId ?? '';

      await service.rotate(issued.refreshToken, origin);
      vi.advanceTimersByTime(1_000);
      await service.rotate(issued.refreshToken, origin);
      vi.advanceTimersByTime(1_000);
      const last = await service.rotate(issued.refreshToken, origin);

      const live = repository.liveSessionsOfFamily(familyId);

      expect(live).toHaveLength(1);
      expect(live[0]?.id).toBe(last.sessionId);
    });

    it('позволяет продолжить работу по последнему выданному токену', async () => {
      const issued = await service.issue('user-id', origin);
      const first = await service.rotate(issued.refreshToken, origin);

      vi.advanceTimersByTime(1_000);
      const second = await service.rotate(issued.refreshToken, origin);

      vi.advanceTimersByTime(1_000);
      await expect(service.rotate(second.refreshToken, origin)).resolves.toBeDefined();
      expect(first.sessionId).not.toBe(second.sessionId);
    });

    it('принимает обновление ровно на границе grace-периода', async () => {
      const issued = await service.issue('user-id', origin);

      await service.rotate(issued.refreshToken, origin);
      vi.advanceTimersByTime(REFRESH_GRACE_PERIOD_MS);

      await expect(service.rotate(issued.refreshToken, origin)).resolves.toBeDefined();
    });
  });

  describe('обнаружение повторного использования', () => {
    it('отклоняет токен, отозванный более 30 секунд назад', async () => {
      const issued = await service.issue('user-id', origin);

      await service.rotate(issued.refreshToken, origin);
      vi.advanceTimersByTime(REFRESH_GRACE_PERIOD_MS + 1);

      await expect(service.rotate(issued.refreshToken, origin)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('отзывает всю цепочку, включая действующую голову', async () => {
      const issued = await service.issue('user-id', origin);
      const familyId = repository.records.get(issued.sessionId)?.familyId ?? '';

      await service.rotate(issued.refreshToken, origin);
      vi.advanceTimersByTime(REFRESH_GRACE_PERIOD_MS + 1);

      await expect(service.rotate(issued.refreshToken, origin)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repository.liveSessionsOfFamily(familyId)).toHaveLength(0);
    });

    it('делает недействительным самый свежий токен цепочки', async () => {
      const issued = await service.issue('user-id', origin);
      const head = await service.rotate(issued.refreshToken, origin);

      vi.advanceTimersByTime(REFRESH_GRACE_PERIOD_MS + 1);
      await expect(service.rotate(issued.refreshToken, origin)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      await expect(service.rotate(head.refreshToken, origin)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('не затрагивает другие входы того же пользователя', async () => {
      const compromised = await service.issue('user-id', origin);
      const otherDevice = await service.issue('user-id', origin);

      await service.rotate(compromised.refreshToken, origin);
      vi.advanceTimersByTime(REFRESH_GRACE_PERIOD_MS + 1);
      await expect(service.rotate(compromised.refreshToken, origin)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      await expect(service.rotate(otherDevice.refreshToken, origin)).resolves.toBeDefined();
    });
  });

  describe('выход', () => {
    it('делает refresh-токен непригодным немедленно', async () => {
      const issued = await service.issue('user-id', origin);

      await service.logout(issued.sessionId);

      // Grace-период здесь не применяется: он существует ради гонки ротаций,
      // а выход — терминальное состояние цепочки.
      await expect(service.rotate(issued.refreshToken, origin)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('удаляет цепочку целиком, не оставляя отозванных строк', async () => {
      const issued = await service.issue('user-id', origin);
      const familyId = repository.records.get(issued.sessionId)?.familyId ?? '';

      await service.rotate(issued.refreshToken, origin);
      await service.logout(issued.sessionId);

      expect(
        [...repository.records.values()].filter((record) => record.familyId === familyId),
      ).toHaveLength(0);
    });

    it('прекращает доступ, даже если цепочку успели ротировать после выдачи токена', async () => {
      const issued = await service.issue('user-id', origin);
      const rotated = await service.rotate(issued.refreshToken, origin);

      // Выход приходит со старым access-токеном: его sid указывает на сессию,
      // которую фоновая ротация уже заменила. Область выхода — цепочка, поэтому
      // действующая голова тоже должна умереть.
      await service.logout(issued.sessionId);

      await expect(service.rotate(rotated.refreshToken, origin)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('идемпотентен при повторном выходе', async () => {
      const issued = await service.issue('user-id', origin);

      await service.logout(issued.sessionId);

      await expect(service.logout(issued.sessionId)).resolves.toBeUndefined();
    });

    it('не затрагивает другие устройства того же пользователя', async () => {
      const current = await service.issue('user-id', origin);
      const otherDevice = await service.issue('user-id', origin);

      await service.logout(current.sessionId);

      await expect(service.rotate(otherDevice.refreshToken, origin)).resolves.toBeDefined();
    });

    it('выход со всех устройств закрывает каждую цепочку пользователя', async () => {
      const first = await service.issue('user-id', origin);
      const second = await service.issue('user-id', origin);
      const other = await service.issue('another-user-id', origin);

      await service.logoutEverywhere('user-id');

      await expect(service.rotate(first.refreshToken, origin)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(service.rotate(second.refreshToken, origin)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(service.rotate(other.refreshToken, origin)).resolves.toBeDefined();
    });
  });
});
