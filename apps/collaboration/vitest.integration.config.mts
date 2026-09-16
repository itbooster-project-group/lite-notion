import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      API_BASE_URL: 'http://localhost:3001',
      API_TIMEOUT_MS: '2000',
      COLLABORATION_ALLOWED_ORIGIN: 'http://localhost:3000',
      INTERNAL_SERVICE_TOKEN: 'local-development-only-change-me-before-deploy',
      NODE_ENV: 'test',
      REDIS_HOST: process.env.REDIS_HOST ?? '127.0.0.1',
      REDIS_PORT: process.env.REDIS_PORT ?? '6379',
      WEBSOCKET_MAX_PAYLOAD_BYTES: '1048576',
    },
    environment: 'node',
    fileParallelism: false,
    include: ['src/**/*.integration-spec.ts'],
  },
});
