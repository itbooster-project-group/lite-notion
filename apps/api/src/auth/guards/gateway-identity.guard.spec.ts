import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  INTERNAL_IDENTITY_SESSION_HEADER,
  INTERNAL_IDENTITY_USER_HEADER,
} from '../../internal/constants';
import { GatewayIdentityGuard } from './gateway-identity.guard';

const user = '11111111-1111-1111-1111-111111111111';
const session = '99999999-9999-9999-9999-999999999999';

const identity: Record<string, string> = {
  [INTERNAL_IDENTITY_SESSION_HEADER]: session,
  [INTERNAL_IDENTITY_USER_HEADER]: user,
};

@Controller('probe')
class ProbeController {
  @Get('public')
  @Public()
  getPublic(): { ok: true } {
    return { ok: true };
  }

  @Get('private')
  getPrivate(@CurrentUser() current: AuthenticatedUser): AuthenticatedUser {
    return current;
  }
}

describe('GatewayIdentityGuard', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: GatewayIdentityGuard }],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('пропускает публичный маршрут без заголовков', async () => {
    await request(app.getHttpServer()).get('/probe/public').expect(200, { ok: true });
  });

  it('выводит личность из заголовков шлюза', async () => {
    const response = await request(app.getHttpServer())
      .get('/probe/private')
      .set(identity)
      .expect(200);

    expect(response.body).toEqual({ id: user, sessionId: session });
  });

  it('отклоняет приватный маршрут без заголовков личности', async () => {
    await request(app.getHttpServer()).get('/probe/private').expect(401);
  });

  it.each([INTERNAL_IDENTITY_USER_HEADER, INTERNAL_IDENTITY_SESSION_HEADER])(
    'отклоняет приватный маршрут без %s',
    async (missing) => {
      const partial = { ...identity };
      delete partial[missing];

      await request(app.getHttpServer()).get('/probe/private').set(partial).expect(401);
    },
  );

  it('отклоняет пустые заголовки личности', async () => {
    await request(app.getHttpServer())
      .get('/probe/private')
      .set({ [INTERNAL_IDENTITY_SESSION_HEADER]: session, [INTERNAL_IDENTITY_USER_HEADER]: '' })
      .expect(401);
  });

  // Токен сам по себе больше ничего не значит: его проверяет шлюз, а сюда
  // доходит только результат проверки.
  it('не принимает access-токен вместо заголовков', async () => {
    await request(app.getHttpServer())
      .get('/probe/private')
      .set('Authorization', 'Bearer any.access.token')
      .expect(401);
  });
});
