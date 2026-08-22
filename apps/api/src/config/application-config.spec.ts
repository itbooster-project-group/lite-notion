import { describe, expect, it } from 'vitest';

import { createApplicationConfig } from './application-config';
import { NodeEnvironment } from './environment';

const jwtSecret = 'local-development-jwt-secret-value';

describe('createApplicationConfig', () => {
  it('маппит конфигурацию из env-шаблона во внутренний контракт', () => {
    expect(
      createApplicationConfig({
        ACCESS_TOKEN_TTL_S: '900',
        BCRYPT_ROUNDS: '12',
        CORS_ORIGIN: 'http://localhost:3000',
        DATABASE_CONNECTION_TIMEOUT_MS: '5000',
        DATABASE_URL: 'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion',
        JWT_SECRET: jwtSecret,
        NODE_ENV: 'development',
        PORT: '3001',
        REFRESH_TOKEN_TTL_S: '2592000',
      }),
    ).toEqual({
      accessTokenTtlS: 900,
      bcryptRounds: 12,
      corsOrigin: 'http://localhost:3000',
      databaseConnectionTimeoutMs: 5000,
      databaseUrl: 'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion',
      jwtSecret,
      nodeEnvironment: NodeEnvironment.Development,
      port: 3001,
      refreshTokenTtlS: 2592000,
    });
  });

  it('валидирует и маппит пользовательскую конфигурацию', () => {
    expect(
      createApplicationConfig({
        ACCESS_TOKEN_TTL_S: '600',
        BCRYPT_ROUNDS: '10',
        CORS_ORIGIN: 'https://notes.example.com',
        DATABASE_CONNECTION_TIMEOUT_MS: '2500',
        DATABASE_URL: 'postgres://app:secret@database.example.com:5432/notes',
        JWT_SECRET: 'production-jwt-secret-value-32-chars',
        NODE_ENV: 'production',
        PORT: '4100',
        REFRESH_TOKEN_TTL_S: '604800',
        UNRELATED_VALUE: 'not-mapped',
      }),
    ).toEqual({
      accessTokenTtlS: 600,
      bcryptRounds: 10,
      corsOrigin: 'https://notes.example.com',
      databaseConnectionTimeoutMs: 2500,
      databaseUrl: 'postgres://app:secret@database.example.com:5432/notes',
      jwtSecret: 'production-jwt-secret-value-32-chars',
      nodeEnvironment: NodeEnvironment.Production,
      port: 4100,
      refreshTokenTtlS: 604800,
    });
  });

  it('отклоняет невалидное окружение до создания runtime-конфига', () => {
    expect(() =>
      createApplicationConfig({
        ACCESS_TOKEN_TTL_S: '900',
        BCRYPT_ROUNDS: '12',
        CORS_ORIGIN: 'http://localhost:3000',
        DATABASE_CONNECTION_TIMEOUT_MS: '5000',
        DATABASE_URL: 'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion',
        JWT_SECRET: jwtSecret,
        NODE_ENV: 'development',
        PORT: 'not-a-number',
        REFRESH_TOKEN_TTL_S: '2592000',
      }),
    ).toThrowError(/Environment validation failed: PORT/);
  });
});
