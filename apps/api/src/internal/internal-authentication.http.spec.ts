import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHttpTestContext, type HttpTestContext } from '../testing/http-application';
import {
  INTERNAL_AUTHENTICATE_PATH,
  INTERNAL_IDENTITY_SESSION_HEADER,
  INTERNAL_IDENTITY_USER_HEADER,
} from './constants';

const user = '11111111-1111-1111-1111-111111111111';
const sessionId = '99999999-9999-9999-9999-999999999999';

describe('internal authenticate HTTP contract', () => {
  let context: HttpTestContext;

  beforeEach(async () => {
    context = await createHttpTestContext();
  });

  afterEach(async () => {
    await context.app.close();
  });

  const authenticate = (authorization?: string) => {
    const call = request(context.app.getHttpServer()).post(`/${INTERNAL_AUTHENTICATE_PATH}`);

    return authorization === undefined ? call : call.set('Authorization', authorization);
  };

  it('маршрут живёт вне публичного префикса', async () => {
    const accessToken = await context.signAccessToken(user);

    await authenticate(`Bearer ${accessToken}`).expect(200);
    await request(context.app.getHttpServer())
      .post(`/api/v1/${INTERNAL_AUTHENTICATE_PATH}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  // ext_authz подставляет свой path_prefix перед исходным путём, поэтому проверка
  // обязана отвечать и на `/internal/authenticate/<исходный путь>` любым методом.
  it('отвечает на путь с префиксом проверяемого запроса', async () => {
    const accessToken = await context.signAccessToken(user);

    const response = await request(context.app.getHttpServer())
      .get(`/${INTERNAL_AUTHENTICATE_PATH}/api/v1/pages`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.headers[INTERNAL_IDENTITY_USER_HEADER]).toBe(user);
  });

  it('отклоняет путь с префиксом при недействительном токене', async () => {
    await request(context.app.getHttpServer())
      .get(`/${INTERNAL_AUTHENTICATE_PATH}/api/v1/pages`)
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  it('подтверждает действительный токен личностью в теле и заголовках', async () => {
    const accessToken = await context.signAccessToken(user);

    const response = await authenticate(`Bearer ${accessToken}`).expect(200);

    expect(response.body).toEqual({
      expiresAt: expect.any(String),
      sessionId,
      userId: user,
    });
    expect(Date.parse(response.body.expiresAt)).toBeGreaterThan(Date.now());
    expect(response.headers[INTERNAL_IDENTITY_USER_HEADER]).toBe(user);
    expect(response.headers[INTERNAL_IDENTITY_SESSION_HEADER]).toBe(sessionId);
  });

  it('не возвращает предъявленный токен', async () => {
    const accessToken = await context.signAccessToken(user);

    const response = await authenticate(`Bearer ${accessToken}`).expect(200);

    expect(JSON.stringify(response.body)).not.toContain(accessToken);
  });

  it('отклоняет запрос без заголовка', async () => {
    await authenticate().expect(401);
  });

  it('отклоняет просроченный токен', async () => {
    const expired = await context.app
      .get(JwtService)
      .signAsync({ sid: sessionId, sub: user }, { expiresIn: -1 });

    await authenticate(`Bearer ${expired}`).expect(401);
  });

  it('отклоняет токен, подписанный другим ключом', async () => {
    const foreign = await new JwtService({
      secret: 'a-different-secret-of-at-least-32-chars',
    }).signAsync({ sid: sessionId, sub: user }, { expiresIn: 900 });

    await authenticate(`Bearer ${foreign}`).expect(401);
  });

  it('не различает причины отказа', async () => {
    const expired = await context.app
      .get(JwtService)
      .signAsync({ sid: sessionId, sub: user }, { expiresIn: -1 });
    const malformed = 'not-a-jwt';

    const [withoutHeader, withExpired, withMalformed] = await Promise.all([
      authenticate(),
      authenticate(`Bearer ${expired}`),
      authenticate(`Bearer ${malformed}`),
    ]);

    const normalize = (body: Record<string, unknown>) => ({ ...body, timestamp: undefined });

    expect(normalize(withExpired.body)).toEqual(normalize(withoutHeader.body));
    expect(normalize(withMalformed.body)).toEqual(normalize(withoutHeader.body));
  });
});
