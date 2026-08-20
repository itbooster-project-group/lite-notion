import { describe, expect, it } from 'vitest';

import { createApplicationConfig } from './application-config';
import { NodeEnvironment } from './environment';

describe('createApplicationConfig', () => {
  it('маппит конфигурацию из env-шаблона во внутренний контракт', () => {
    expect(
      createApplicationConfig({
        CORS_ORIGIN: 'http://localhost:3000',
        DATABASE_CONNECTION_TIMEOUT_MS: '5000',
        DATABASE_URL: 'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion',
        NODE_ENV: 'development',
        PORT: '3001',
      }),
    ).toEqual({
      corsOrigin: 'http://localhost:3000',
      databaseConnectionTimeoutMs: 5000,
      databaseUrl: 'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion',
      nodeEnvironment: NodeEnvironment.Development,
      port: 3001,
    });
  });

  it('валидирует и маппит пользовательскую конфигурацию', () => {
    expect(
      createApplicationConfig({
        CORS_ORIGIN: 'https://notes.example.com',
        DATABASE_CONNECTION_TIMEOUT_MS: '2500',
        DATABASE_URL: 'postgres://app:secret@database.example.com:5432/notes',
        NODE_ENV: 'production',
        PORT: '4100',
        UNRELATED_VALUE: 'not-mapped',
      }),
    ).toEqual({
      corsOrigin: 'https://notes.example.com',
      databaseConnectionTimeoutMs: 2500,
      databaseUrl: 'postgres://app:secret@database.example.com:5432/notes',
      nodeEnvironment: NodeEnvironment.Production,
      port: 4100,
    });
  });

  it('отклоняет невалидное окружение до создания runtime-конфига', () => {
    expect(() =>
      createApplicationConfig({
        CORS_ORIGIN: 'http://localhost:3000',
        DATABASE_CONNECTION_TIMEOUT_MS: '5000',
        DATABASE_URL: 'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion',
        NODE_ENV: 'development',
        PORT: 'not-a-number',
      }),
    ).toThrowError(/Environment validation failed: PORT/);
  });
});
