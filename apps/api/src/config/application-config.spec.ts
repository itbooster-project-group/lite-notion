import { describe, expect, it } from 'vitest';

import { createApplicationConfig } from './application-config';
import { NodeEnvironment } from './environment';

const jwtSecret = 'local-development-jwt-secret-value';
const internalServiceToken = 'local-development-internal-service-token';

describe('createApplicationConfig', () => {
  it('маппит конфигурацию из env-шаблона во внутренний контракт', () => {
    expect(
      createApplicationConfig({
        ACCESS_TOKEN_TTL_S: '900',
        BCRYPT_ROUNDS: '12',
        COLLABORATION_BASE_URL: 'http://localhost:3002',
        COLLABORATION_TIMEOUT_MS: '5000',
        CORS_ORIGIN: 'http://localhost:3000',
        DATABASE_CONNECTION_TIMEOUT_MS: '5000',
        DATABASE_URL: 'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion',
        INTERNAL_SERVICE_TOKEN: internalServiceToken,
        JWT_SECRET: jwtSecret,
        NODE_ENV: 'development',
        PORT: '3001',
        REFRESH_TOKEN_TTL_S: '2592000',
      }),
    ).toEqual({
      assets: {
        gcBatchSize: 50,
        gcEnabled: false,
        gcIntervalSeconds: 60,
        maxConcurrentUploads: 4,
        maxUploadBytes: 10 * 1024 * 1024,
        orphanGraceHours: 24,
        pendingTtlHours: 24,
        projectionStaleWarningSeconds: 300,
        readUrlTtlSeconds: 60,
        s3: null,
        s3RequestTimeoutMs: 15_000,
        uploadTimeoutMs: 120_000,
      },
      accessTokenTtlS: 900,
      bcryptRounds: 12,
      collaborationBaseUrl: 'http://localhost:3002',
      collaborationTimeoutMs: 5000,
      corsOrigin: 'http://localhost:3000',
      databaseConnectionTimeoutMs: 5000,
      databaseUrl: 'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion',
      internalServiceToken,
      jwtSecret,
      nodeEnvironment: NodeEnvironment.Development,
      port: 3001,
      publicationRevalidation: null,
      refreshTokenTtlS: 2592000,
    });
  });

  it('валидирует и маппит пользовательскую конфигурацию', () => {
    expect(
      createApplicationConfig({
        ACCESS_TOKEN_TTL_S: '600',
        ASSETS_S3_ACCESS_KEY_ID: 'access-key',
        ASSETS_S3_BUCKET: 'private-assets',
        ASSETS_S3_ENDPOINT: 'https://s3.example.com',
        ASSETS_S3_REGION: 'ru-1',
        ASSETS_S3_SECRET_ACCESS_KEY: 'secret-key',
        BCRYPT_ROUNDS: '10',
        COLLABORATION_BASE_URL: 'https://collaboration.example.com',
        COLLABORATION_TIMEOUT_MS: '4000',
        CORS_ORIGIN: 'https://notes.example.com',
        DATABASE_CONNECTION_TIMEOUT_MS: '2500',
        DATABASE_URL: 'postgres://app:secret@database.example.com:5432/notes',
        INTERNAL_SERVICE_TOKEN: 'production-internal-service-token-32ch',
        JWT_SECRET: 'production-jwt-secret-value-32-chars',
        NODE_ENV: 'production',
        PORT: '4100',
        PUBLICATION_REVALIDATION_URL: 'https://frontend.example.com/api/internal/revalidate',
        PUBLICATION_REVALIDATION_TOKEN: 'internal-token',
        PUBLICATION_REVALIDATION_TIMEOUT_MS: '4500',
        REFRESH_TOKEN_TTL_S: '604800',
        UNRELATED_VALUE: 'not-mapped',
      }),
    ).toEqual({
      assets: {
        gcBatchSize: 50,
        gcEnabled: false,
        gcIntervalSeconds: 60,
        maxConcurrentUploads: 4,
        maxUploadBytes: 10 * 1024 * 1024,
        orphanGraceHours: 24,
        pendingTtlHours: 24,
        projectionStaleWarningSeconds: 300,
        readUrlTtlSeconds: 60,
        s3: {
          accessKeyId: 'access-key',
          bucket: 'private-assets',
          endpoint: 'https://s3.example.com',
          forcePathStyle: false,
          region: 'ru-1',
          secretAccessKey: 'secret-key',
        },
        s3RequestTimeoutMs: 15_000,
        uploadTimeoutMs: 120_000,
      },
      accessTokenTtlS: 600,
      bcryptRounds: 10,
      collaborationBaseUrl: 'https://collaboration.example.com',
      collaborationTimeoutMs: 4000,
      corsOrigin: 'https://notes.example.com',
      databaseConnectionTimeoutMs: 2500,
      databaseUrl: 'postgres://app:secret@database.example.com:5432/notes',
      internalServiceToken: 'production-internal-service-token-32ch',
      jwtSecret: 'production-jwt-secret-value-32-chars',
      nodeEnvironment: NodeEnvironment.Production,
      port: 4100,
      publicationRevalidation: {
        token: 'internal-token',
        timeoutMs: 4500,
        url: 'https://frontend.example.com/api/internal/revalidate',
      },
      refreshTokenTtlS: 604800,
    });
  });

  it('отклоняет невалидное окружение до создания runtime-конфига', () => {
    expect(() =>
      createApplicationConfig({
        ACCESS_TOKEN_TTL_S: '900',
        BCRYPT_ROUNDS: '12',
        COLLABORATION_BASE_URL: 'http://localhost:3002',
        COLLABORATION_TIMEOUT_MS: '5000',
        CORS_ORIGIN: 'http://localhost:3000',
        DATABASE_CONNECTION_TIMEOUT_MS: '5000',
        DATABASE_URL: 'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion',
        INTERNAL_SERVICE_TOKEN: internalServiceToken,
        JWT_SECRET: jwtSecret,
        NODE_ENV: 'development',
        PORT: 'not-a-number',
        REFRESH_TOKEN_TTL_S: '2592000',
      }),
    ).toThrowError(/Environment validation failed: PORT/);
  });
});
