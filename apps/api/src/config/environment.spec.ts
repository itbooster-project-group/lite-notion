import { describe, expect, it } from 'vitest';

import { NodeEnvironment, validateEnvironment } from './environment';

const validEnvironment: Record<string, unknown> = {
  ACCESS_TOKEN_TTL_S: '900',
  BCRYPT_ROUNDS: '12',
  CORS_ORIGIN: 'https://notes.example.com',
  DATABASE_CONNECTION_TIMEOUT_MS: '5000',
  DATABASE_URL: 'postgresql://lite_notion:secret@database.example.com:5432/lite_notion',
  JWT_SECRET: 'a'.repeat(32),
  NODE_ENV: 'production',
  PORT: '4100',
  REFRESH_TOKEN_TTL_S: '2592000',
};

describe('validateEnvironment', () => {
  it.each([
    'NODE_ENV',
    'PORT',
    'CORS_ORIGIN',
    'DATABASE_URL',
    'DATABASE_CONNECTION_TIMEOUT_MS',
    'JWT_SECRET',
    'ACCESS_TOKEN_TTL_S',
    'REFRESH_TOKEN_TTL_S',
    'BCRYPT_ROUNDS',
  ])('отклоняет отсутствие %s', (property) => {
    const environment = { ...validEnvironment };
    delete environment[property];

    expect(() => validateEnvironment(environment)).toThrowError(
      new RegExp(`Environment validation failed: ${property}`),
    );
  });

  it('преобразует допустимую пользовательскую конфигурацию', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        UNRELATED_VALUE: 'preserved',
      }),
    ).toMatchObject({
      ACCESS_TOKEN_TTL_S: 900,
      BCRYPT_ROUNDS: 12,
      CORS_ORIGIN: 'https://notes.example.com',
      DATABASE_CONNECTION_TIMEOUT_MS: 5000,
      DATABASE_URL: 'postgresql://lite_notion:secret@database.example.com:5432/lite_notion',
      JWT_SECRET: 'a'.repeat(32),
      NODE_ENV: NodeEnvironment.Production,
      PORT: 4100,
      REFRESH_TOKEN_TTL_S: 2592000,
      UNRELATED_VALUE: 'preserved',
    });
  });

  it.each([
    ['NODE_ENV', 'staging'],
    ['PORT', 'not-a-number'],
    ['PORT', '0'],
    ['PORT', '65536'],
    ['CORS_ORIGIN', 'ftp://localhost:3000'],
    ['CORS_ORIGIN', 'http://localhost:3000/path?token=secret'],
    ['DATABASE_URL', 'mysql://user:secret@database.example.com/lite_notion'],
    ['DATABASE_URL', 'not-a-url'],
    ['DATABASE_CONNECTION_TIMEOUT_MS', '0'],
    ['DATABASE_CONNECTION_TIMEOUT_MS', '60001'],
    ['JWT_SECRET', 'a'.repeat(31)],
    ['JWT_SECRET', ''],
    ['ACCESS_TOKEN_TTL_S', 'not-a-number'],
    ['ACCESS_TOKEN_TTL_S', '59'],
    ['ACCESS_TOKEN_TTL_S', '3601'],
    ['REFRESH_TOKEN_TTL_S', '3599'],
    ['REFRESH_TOKEN_TTL_S', '7776001'],
    ['BCRYPT_ROUNDS', '3'],
    ['BCRYPT_ROUNDS', '16'],
    ['BCRYPT_ROUNDS', '12.5'],
  ])('отклоняет невалидный %s', (property, value) => {
    expect(() => validateEnvironment({ ...validEnvironment, [property]: value })).toThrowError(
      new RegExp(`Environment validation failed: ${property}`),
    );
  });

  it('не раскрывает исходные значения в ошибке', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        CORS_ORIGIN: 'http://localhost:3000/path?token=secret-value',
      }),
    ).toThrowError(/^(?!.*secret-value).*Environment validation failed: CORS_ORIGIN/);
  });

  it('не раскрывает database credentials в ошибке', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        DATABASE_URL: 'mysql://admin:secret-value@database.example.com/lite_notion',
      }),
    ).toThrowError(/^(?!.*secret-value).*Environment validation failed: DATABASE_URL/);
  });

  it('не раскрывает значение JWT_SECRET в ошибке', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_SECRET: 'secret-value',
      }),
    ).toThrowError(/^(?!.*secret-value).*Environment validation failed: JWT_SECRET/);
  });

  it.each([
    ['равном ACCESS_TOKEN_TTL_S', '3600', '3600'],
    ['меньше ACCESS_TOKEN_TTL_S', '3600', '3599'],
  ])(
    'отклоняет REFRESH_TOKEN_TTL_S при значении, %s',
    (_case, accessTokenTtlS, refreshTokenTtlS) => {
      expect(() =>
        validateEnvironment({
          ...validEnvironment,
          ACCESS_TOKEN_TTL_S: accessTokenTtlS,
          REFRESH_TOKEN_TTL_S: refreshTokenTtlS,
        }),
      ).toThrowError(
        /Environment validation failed: REFRESH_TOKEN_TTL_S: REFRESH_TOKEN_TTL_S must be greater than ACCESS_TOKEN_TTL_S/,
      );
    },
  );

  it('принимает REFRESH_TOKEN_TTL_S строго больше ACCESS_TOKEN_TTL_S', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        ACCESS_TOKEN_TTL_S: '3600',
        REFRESH_TOKEN_TTL_S: '3601',
      }),
    ).toMatchObject({ ACCESS_TOKEN_TTL_S: 3600, REFRESH_TOKEN_TTL_S: 3601 });
  });
});
