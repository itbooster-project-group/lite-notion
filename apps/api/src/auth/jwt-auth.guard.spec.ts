import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { applicationConfig } from '../config/application-config';
import { PrismaService } from '../database/prisma.service';
import { type AuthenticatedUser, CurrentUser } from './current-user.decorator';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from './public.decorator';

const jwtSecret = 'test-jwt-secret-value-at-least-32-chars';
const prisma = { session: { findUnique: vi.fn() }, user: { findUnique: vi.fn() } };

@Controller('probe')
class ProbeController {
  @Get('public')
  @Public()
  getPublic(): { ok: true } {
    return { ok: true };
  }

  @Get('private')
  getPrivate(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}

describe('JwtAuthGuard', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      imports: [JwtModule.register({ secret: jwtSecret }), PassportModule],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: PrismaService, useValue: prisma },
        { provide: applicationConfig.KEY, useValue: { accessTokenTtlS: 900, jwtSecret } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    jwtService = moduleRef.get(JwtService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('пропускает публичный маршрут без токена', async () => {
    await request(app.getHttpServer()).get('/probe/public').expect(200, { ok: true });
  });

  it('отклоняет приватный маршрут без токена', async () => {
    await request(app.getHttpServer()).get('/probe/private').expect(401);
  });

  it('пропускает приватный маршрут с действительным токеном', async () => {
    const accessToken = jwtService.sign(
      { sid: 'session-id', sub: 'user-id' },
      { expiresIn: 900, secret: jwtSecret },
    );

    await request(app.getHttpServer())
      .get('/probe/private')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200, { id: 'user-id', sessionId: 'session-id' });
  });

  it('отклоняет просроченный токен', async () => {
    const accessToken = jwtService.sign(
      { sid: 'session-id', sub: 'user-id' },
      { expiresIn: -1, secret: jwtSecret },
    );

    await request(app.getHttpServer())
      .get('/probe/private')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('отклоняет токен, подписанный другим ключом', async () => {
    const accessToken = jwtService.sign(
      { sid: 'session-id', sub: 'user-id' },
      { expiresIn: 900, secret: 'another-secret-value-at-least-32-chars' },
    );

    await request(app.getHttpServer())
      .get('/probe/private')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('отклоняет токен с изменённой полезной нагрузкой', async () => {
    const accessToken = jwtService.sign(
      { sid: 'session-id', sub: 'user-id' },
      { expiresIn: 900, secret: jwtSecret },
    );
    const [header, , signature] = accessToken.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sid: 'session-id', sub: 'another-user-id' }),
    ).toString('base64url');

    await request(app.getHttpServer())
      .get('/probe/private')
      .set('Authorization', `Bearer ${header}.${forgedPayload}.${signature}`)
      .expect(401);
  });

  it('не раскрывает причину отклонения', async () => {
    const expired = jwtService.sign({ sid: 's', sub: 'u' }, { expiresIn: -1, secret: jwtSecret });

    const withoutToken = await request(app.getHttpServer()).get('/probe/private');
    const withExpiredToken = await request(app.getHttpServer())
      .get('/probe/private')
      .set('Authorization', `Bearer ${expired}`);

    expect(withExpiredToken.body).toEqual(withoutToken.body);
  });

  it('не обращается к базе при успешной проверке', async () => {
    const accessToken = jwtService.sign(
      { sid: 'session-id', sub: 'user-id' },
      { expiresIn: 900, secret: jwtSecret },
    );

    prisma.user.findUnique.mockClear();
    prisma.session.findUnique.mockClear();

    await request(app.getHttpServer())
      .get('/probe/private')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });
});
