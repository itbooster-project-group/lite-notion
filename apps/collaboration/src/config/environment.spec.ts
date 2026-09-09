import { describe, expect, it } from 'vitest';

import { createCollaborationConfig } from './environment';

const validEnvironment = {
  COLLABORATION_ALLOWED_ORIGIN: 'http://localhost:3000',
  COLLABORATION_WEBSOCKET_MAX_PAYLOAD_BYTES: '1048576',
  DATABASE_CONNECTION_TIMEOUT_MS: '5000',
  DATABASE_URL: 'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
  JWT_SECRET: 'local-development-only-change-me-before-deploy',
  NODE_ENV: 'test',
  PORT: '3002',
};

describe('createCollaborationConfig', () => {
  it('валидирует runtime environment', () => {
    expect(createCollaborationConfig(validEnvironment)).toMatchObject({
      allowedOrigin: 'http://localhost:3000',
      databaseConnectionTimeoutMs: 5000,
      nodeEnvironment: 'test',
      port: 3002,
      websocketMaxPayloadBytes: 1048576,
    });
  });

  it.each([
    ['COLLABORATION_ALLOWED_ORIGIN', 'http://localhost:3000/path?token=secret-value'],
    ['DATABASE_URL', 'mysql://admin:secret-value@database.example.com/lite_notion'],
    ['JWT_SECRET', 'short-secret-value'],
    ['PORT', '0'],
    ['COLLABORATION_WEBSOCKET_MAX_PAYLOAD_BYTES', '0'],
  ])('не раскрывает значение %s в ошибке', (name, value) => {
    expect(() => createCollaborationConfig({ ...validEnvironment, [name]: value })).toThrowError(
      new RegExp(`^(?!.*${value}).*Environment validation failed: ${name}`),
    );
  });
});
