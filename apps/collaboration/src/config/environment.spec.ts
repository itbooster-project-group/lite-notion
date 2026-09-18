import { describe, expect, it } from 'vitest';

import { createCollaborationConfig } from './environment.js';

const validEnvironment = {
  API_BASE_URL: 'http://localhost:3001',
  API_TIMEOUT_MS: '2000',
  COLLABORATION_ALLOWED_ORIGIN: 'http://localhost:8080',
  INTERNAL_SERVICE_TOKEN: 'local-development-only-change-me-before-deploy',
  NODE_ENV: 'test',
  PORT: '3002',
  REDIS_HOST: '127.0.0.1',
  REDIS_PORT: '6379',
  WEBSOCKET_MAX_PAYLOAD_BYTES: '1048576',
};

describe('createCollaborationConfig', () => {
  it('валидирует runtime environment', () => {
    expect(createCollaborationConfig(validEnvironment)).toMatchObject({
      allowedOrigin: 'http://localhost:8080',
      apiBaseUrl: 'http://localhost:3001',
      apiTimeoutMs: 2000,
      nodeEnvironment: 'test',
      port: 3002,
      redisHost: '127.0.0.1',
      redisPort: 6379,
      websocketMaxPayloadBytes: 1048576,
    });
  });

  // Прямого доступа к базе у сервиса нет, подписи он не проверяет: этих настроек
  // в контракте быть не должно.
  it.each(['DATABASE_URL', 'DATABASE_CONNECTION_TIMEOUT_MS', 'JWT_SECRET'])(
    'не требует %s',
    (name) => {
      const config = createCollaborationConfig(validEnvironment) as unknown as Record<
        string,
        unknown
      >;

      expect(Object.keys(config)).not.toContain(name);
    },
  );

  it.each([
    'API_BASE_URL',
    'API_TIMEOUT_MS',
    'COLLABORATION_ALLOWED_ORIGIN',
    'INTERNAL_SERVICE_TOKEN',
    'NODE_ENV',
    'PORT',
    'REDIS_HOST',
    'REDIS_PORT',
    'WEBSOCKET_MAX_PAYLOAD_BYTES',
  ])('отклоняет отсутствие %s', (name) => {
    const environment: Record<string, unknown> = { ...validEnvironment };
    delete environment[name];

    expect(() => createCollaborationConfig(environment)).toThrowError(
      new RegExp(`Environment validation failed: ${name}`),
    );
  });

  it.each([
    ['API_BASE_URL', 'http://localhost:3001/path?token=secret-value'],
    ['COLLABORATION_ALLOWED_ORIGIN', 'http://localhost:8080/path?token=secret-value'],
    ['INTERNAL_SERVICE_TOKEN', 'short-secret-value'],
    ['PORT', '0'],
    ['WEBSOCKET_MAX_PAYLOAD_BYTES', '0'],
  ])('не раскрывает значение %s в ошибке', (name, value) => {
    expect(() => createCollaborationConfig({ ...validEnvironment, [name]: value })).toThrowError(
      new RegExp(`^(?!.*${value}).*Environment validation failed: ${name}`),
    );
  });
});
