import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { applicationConfig } from '../../config/application-config';
import { TokenService } from '../crypto/token.service';

const jwtSecret = 'test-jwt-secret-value-at-least-32-chars';
const accessTokenTtlS = 900;

describe('TokenService', () => {
  let service: TokenService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: jwtSecret })],
      providers: [
        TokenService,
        { provide: applicationConfig.KEY, useValue: { accessTokenTtlS, jwtSecret } },
      ],
    }).compile();

    service = moduleRef.get(TokenService);
    jwtService = moduleRef.get(JwtService);
  });

  it('подписывает access-токен с claims sub и sid', async () => {
    const accessToken = await service.signAccessToken({ sid: 'session-id', sub: 'user-id' });

    expect(jwtService.verify(accessToken, { secret: jwtSecret })).toMatchObject({
      sid: 'session-id',
      sub: 'user-id',
    });
  });

  it('задаёт access-токену настроенный срок жизни', async () => {
    const accessToken = await service.signAccessToken({ sid: 'session-id', sub: 'user-id' });
    const { exp, iat } = jwtService.verify<{ exp: number; iat: number }>(accessToken, {
      secret: jwtSecret,
    });

    expect(exp - iat).toBe(accessTokenTtlS);
  });

  it('отклоняет токен, подписанный другим ключом', async () => {
    const accessToken = await service.signAccessToken({ sid: 'session-id', sub: 'user-id' });

    expect(() =>
      jwtService.verify(accessToken, { secret: 'another-secret-value-32-characters' }),
    ).toThrow();
  });

  it('генерирует разные refresh-токены', () => {
    expect(service.generateRefreshToken()).not.toBe(service.generateRefreshToken());
  });

  it('генерирует refresh-токен без padding и служебных символов', () => {
    expect(service.generateRefreshToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('считает хеш refresh-токена стабильно и не оставляет в нём исходный токен', () => {
    const refreshToken = service.generateRefreshToken();
    const tokenHash = service.hashRefreshToken(refreshToken);

    expect(tokenHash).toBe(service.hashRefreshToken(refreshToken));
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash).not.toContain(refreshToken);
  });

  it('даёт разные хеши для разных токенов', () => {
    expect(service.hashRefreshToken('first')).not.toBe(service.hashRefreshToken('second'));
  });
});
