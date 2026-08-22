import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applicationConfig } from '../config/application-config';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionRepository } from './session.repository';
import { InMemorySessionRepository } from './session.repository.in-memory';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

const jwtSecret = 'test-jwt-secret-value-at-least-32-chars';
const origin = { ip: '127.0.0.1', userAgent: 'vitest' };
const config = { accessTokenTtlS: 900, bcryptRounds: 4, jwtSecret, refreshTokenTtlS: 2_592_000 };

describe('AuthService', () => {
  let service: AuthService;
  let repository: InMemorySessionRepository;
  let passwords: PasswordService;
  let users: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let stored: Map<string, { id: string; email: string; nickname: string; passwordHash: string }>;

  beforeEach(async () => {
    stored = new Map();
    repository = new InMemorySessionRepository();
    users = {
      create: vi.fn(async ({ data }) => {
        const user = { ...data, createdAt: new Date(), id: `user-${stored.size + 1}` };
        stored.set(data.email, user);
        return user;
      }),
      findUnique: vi.fn(async ({ where }) => stored.get(where.email) ?? null),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: jwtSecret })],
      providers: [
        AuthService,
        PasswordService,
        SessionService,
        TokenService,
        UsersService,
        { provide: PrismaService, useValue: { user: users } },
        { provide: SessionRepository, useValue: repository },
        { provide: applicationConfig.KEY, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    passwords = moduleRef.get(PasswordService);
    await passwords.onModuleInit();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('register', () => {
    it('создаёт учётную запись и открывает сессию', async () => {
      const result = await service.register(
        { email: 'ada@example.com', nickname: 'Ada', password: 'correct horse' },
        origin,
      );

      expect(result.user.email).toBe('ada@example.com');
      expect(result.session.accessToken).toBeTypeOf('string');
      expect(repository.records.size).toBe(1);
    });

    it('сохраняет пароль только в виде bcrypt-хеша', async () => {
      const result = await service.register(
        { email: 'ada@example.com', nickname: 'Ada', password: 'correct horse' },
        origin,
      );

      expect(result.user.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(result.user.passwordHash).not.toContain('correct horse');
      await expect(passwords.compare('correct horse', result.user.passwordHash)).resolves.toBe(
        true,
      );
    });

    it('отклоняет занятый email', async () => {
      await service.register(
        { email: 'ada@example.com', nickname: 'Ada', password: 'correct horse' },
        origin,
      );

      await expect(
        service.register(
          { email: 'ada@example.com', nickname: 'Other', password: 'another pass' },
          origin,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(stored.size).toBe(1);
    });

    it('считает email занятым при отличии только в регистре', async () => {
      await service.register(
        { email: 'ada@example.com', nickname: 'Ada', password: 'correct horse' },
        origin,
      );

      await expect(
        service.register(
          { email: 'ADA@Example.COM', nickname: 'Other', password: 'another pass' },
          origin,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await service.register(
        { email: 'ada@example.com', nickname: 'Ada', password: 'correct horse' },
        origin,
      );
    });

    it('выдаёт пару токенов при верных учётных данных', async () => {
      const result = await service.login(
        { email: 'ada@example.com', password: 'correct horse' },
        origin,
      );

      expect(result.session.accessToken).toBeTypeOf('string');
      expect(result.session.refreshToken).toBeTypeOf('string');
    });

    it('принимает email в другом регистре', async () => {
      await expect(
        service.login({ email: 'ADA@Example.COM', password: 'correct horse' }, origin),
      ).resolves.toBeDefined();
    });

    it('отвечает одинаково на неверный пароль и несуществующий email', async () => {
      const wrongPassword = await service
        .login({ email: 'ada@example.com', password: 'wrong pass' }, origin)
        .catch((error: UnauthorizedException) => error);
      const unknownEmail = await service
        .login({ email: 'nobody@example.com', password: 'wrong pass' }, origin)
        .catch((error: UnauthorizedException) => error);

      expect(wrongPassword).toBeInstanceOf(UnauthorizedException);
      expect(unknownEmail).toBeInstanceOf(UnauthorizedException);
      expect((unknownEmail as UnauthorizedException).getStatus()).toBe(
        (wrongPassword as UnauthorizedException).getStatus(),
      );
      expect((unknownEmail as UnauthorizedException).getResponse()).toEqual(
        (wrongPassword as UnauthorizedException).getResponse(),
      );
    });

    it('сравнивает пароль даже при несуществующем email', async () => {
      const compareWithDummy = vi.spyOn(passwords, 'compareWithDummy');

      await expect(
        service.login({ email: 'nobody@example.com', password: 'wrong pass' }, origin),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(compareWithDummy).toHaveBeenCalledOnce();
    });

    it('не создаёт сессию при неверных учётных данных', async () => {
      const sessionsBefore = repository.records.size;

      await expect(
        service.login({ email: 'ada@example.com', password: 'wrong pass' }, origin),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        service.login({ email: 'nobody@example.com', password: 'wrong pass' }, origin),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(repository.records.size).toBe(sessionsBefore);
    });
  });

  describe('выход', () => {
    it('завершает цепочку текущего запроса', async () => {
      const { session } = await service.register(
        { email: 'ada@example.com', nickname: 'Ada', password: 'correct horse' },
        origin,
      );

      await service.logout(session.sessionId);

      expect(repository.records.size).toBe(0);
    });

    it('выход со всех устройств закрывает каждую цепочку пользователя', async () => {
      const { user } = await service.register(
        { email: 'ada@example.com', nickname: 'Ada', password: 'correct horse' },
        origin,
      );
      await service.login({ email: 'ada@example.com', password: 'correct horse' }, origin);

      await service.logoutEverywhere(user.id);

      expect(repository.records.size).toBe(0);
    });
  });
});
