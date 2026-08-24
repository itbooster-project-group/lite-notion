import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applicationConfig } from '../config/application-config';
import { NodeEnvironment } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { HttpExceptionFilter } from '../http-exception.filter';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { InMemoryAuthRepository } from './auth.repository.in-memory';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE_NAME } from './constants';
import { PasswordService } from './crypto/password.service';
import { TokenService } from './crypto/token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { SessionService } from './session/session.service';

const jwtSecret = 'test-jwt-secret-value-at-least-32-chars';
const credentials = { email: 'ada@example.com', name: 'Ada', password: 'correct horse' };

function readRefreshCookie(headers: Record<string, unknown>): string | undefined {
  const setCookie = headers['set-cookie'];

  return Array.isArray(setCookie)
    ? setCookie.find((cookie: string) => cookie.startsWith(`${REFRESH_COOKIE_NAME}=`))
    : undefined;
}

describe('AuthController', () => {
  let app: INestApplication;
  let repository: InMemoryAuthRepository;
  // biome-ignore lint/suspicious/noExplicitAny: узкое тестовое хранилище пользователей
  let stored: Map<string, any>;

  beforeEach(async () => {
    stored = new Map();

    repository = new InMemoryAuthRepository(stored);

    const user = {
      create: vi.fn(),
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) =>
        where.email === undefined
          ? ([...stored.values()].find((record) => record.id === where.id) ?? null)
          : (stored.get(where.email) ?? null),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      imports: [JwtModule.register({ secret: jwtSecret }), PassportModule],
      providers: [
        AuthService,
        JwtStrategy,
        PasswordService,
        SessionService,
        TokenService,
        UsersService,
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: PrismaService, useValue: { user } },
        { provide: AuthRepository, useValue: repository },
        {
          provide: applicationConfig.KEY,
          useValue: {
            accessTokenTtlS: 900,
            bcryptRounds: 4,
            jwtSecret,
            nodeEnvironment: NodeEnvironment.Development,
            refreshTokenTtlS: 2_592_000,
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Повторяет то, что configureApplication делает для настоящего приложения:
    // без cookie-parser refresh-маршрут не увидит cookie и всегда вернёт 401.
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('создаёт учётную запись и ставит refresh cookie', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);

      expect(response.body.accessToken).toBeTypeOf('string');
      expect(response.body.user).toMatchObject({ email: 'ada@example.com', name: 'Ada' });
      expect(readRefreshCookie(response.headers)).toMatch(/HttpOnly/i);
    });

    it('ограничивает cookie путём аутентификации и ставит SameSite', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);
      const cookie = readRefreshCookie(response.headers) ?? '';

      expect(cookie).toMatch(/Path=\/api\/v1\/auth/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    });

    it('отклоняет повторный email статусом 409', async () => {
      await request(app.getHttpServer()).post('/auth/register').send(credentials).expect(201);

      await request(app.getHttpServer()).post('/auth/register').send(credentials).expect(409);
    });

    it.each([
      ['некорректный email', { ...credentials, email: 'not-an-email' }],
      ['короткий пароль', { ...credentials, password: 'short' }],
      ['пароль длиннее 72 байт', { ...credentials, password: 'a'.repeat(73) }],
      ['кириллический пароль длиннее 72 байт', { ...credentials, password: 'п'.repeat(37) }],
      // Проходит @Length(72) по символам, но это 80 и 144 байта — bcrypt обрезал бы их.
      ['40 символов кириллицы (80 байт)', { ...credentials, password: 'п'.repeat(40) }],
      ['36 emoji (144 байта)', { ...credentials, password: '😀'.repeat(36) }],
      ['пустой name', { ...credentials, name: '   ' }],
      ['лишнее поле', { ...credentials, role: 'admin' }],
    ])('отклоняет %s статусом 400', async (_case, body) => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(body)
        .expect(400);

      expect(response.body).toMatchObject({ statusCode: 400 });
      expect(stored.size).toBe(0);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer()).post('/auth/register').send(credentials).expect(201);
    });

    it('выдаёт токен при верных учётных данных', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(200);

      expect(response.body.accessToken).toBeTypeOf('string');
      expect(readRefreshCookie(response.headers)).toBeDefined();
    });

    it.each([
      ['73 ASCII-символа', 'a'.repeat(73)],
      ['37 символов кириллицы (74 байта)', 'п'.repeat(37)],
      ['40 символов кириллицы (80 байт)', 'п'.repeat(40)],
      ['36 emoji (144 байта)', '😀'.repeat(36)],
    ])('отклоняет пароль длиннее 72 байт: %s', async (_case, password) => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password })
        .expect(400);

      expect(response.body).toMatchObject({ statusCode: 400 });
    });

    it('принимает пароль ровно в 72 байта', async () => {
      const password = 'п'.repeat(36);

      expect(Buffer.byteLength(password, 'utf8')).toBe(72);
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'cyrillic@example.com', name: 'Ада', password })
        .expect(201);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'cyrillic@example.com', password })
        .expect(200);
    });

    it('отвечает одинаково на неверный пароль и несуществующий email', async () => {
      const wrongPassword = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: 'wrong password' })
        .expect(401);
      const unknownEmail = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong password' })
        .expect(401);

      expect(unknownEmail.body.message).toEqual(wrongPassword.body.message);
      expect(unknownEmail.body.error).toEqual(wrongPassword.body.error);
    });
  });

  describe('POST /auth/refresh', () => {
    it('обновляет пару токенов по cookie', async () => {
      const registered = await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', readRefreshCookie(registered.headers) ?? '')
        .expect(200);

      expect(response.body.accessToken).toBeTypeOf('string');
      expect(readRefreshCookie(response.headers)).toBeDefined();
    });

    it('отвечает 401 без cookie', async () => {
      await request(app.getHttpServer()).post('/auth/refresh').expect(401);
    });

    it('очищает cookie при отказе', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=unknown-token`)
        .expect(401);

      expect(readRefreshCookie(response.headers)).toMatch(/Expires=Thu, 01 Jan 1970/i);
    });
  });

  describe('защищённые маршруты', () => {
    it('GET /auth/me возвращает профиль владельца токена', async () => {
      const registered = await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${registered.body.accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({ email: 'ada@example.com', name: 'Ada' });
    });

    it.each([
      ['GET', '/auth/me'],
      ['POST', '/auth/logout'],
      ['POST', '/auth/logout-all'],
    ])('%s %s без токена отвечает 401 в едином формате ошибок', async (method, path) => {
      const response = await (method === 'GET'
        ? request(app.getHttpServer()).get(path)
        : request(app.getHttpServer()).post(path)
      ).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401 });
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('path', path);
    });

    it('POST /auth/logout завершает цепочку и очищает cookie', async () => {
      const registered = await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);
      const refreshCookie = readRefreshCookie(registered.headers) ?? '';

      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${registered.body.accessToken}`)
        .expect(204);

      expect(readRefreshCookie(response.headers)).toMatch(/Expires=Thu, 01 Jan 1970/i);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(401);
    });

    it('POST /auth/logout-all закрывает другие устройства', async () => {
      const first = await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);
      const second = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/logout-all')
        .set('Authorization', `Bearer ${first.body.accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', readRefreshCookie(second.headers) ?? '')
        .expect(401);
    });
  });

  describe('утечки в телах ответов', () => {
    it('ни один ответ не содержит пароль, его хеш и refresh-токен', async () => {
      const registered = await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);
      const refreshCookie = readRefreshCookie(registered.headers) ?? '';
      const refreshToken = refreshCookie.split(';')[0]?.split('=')[1] ?? '';

      const loggedIn = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(200);
      const refreshed = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(200);
      const profile = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${registered.body.accessToken}`)
        .expect(200);

      for (const response of [registered, loggedIn, refreshed, profile]) {
        const body = JSON.stringify(response.body);

        expect(body).not.toContain(credentials.password);
        expect(body).not.toContain('passwordHash');
        expect(body).not.toContain('$2b$');
        expect(body).not.toContain(refreshToken);
        expect(body).not.toContain('tokenHash');
      }
    });
  });
});
