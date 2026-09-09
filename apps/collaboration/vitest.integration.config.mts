import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      COLLABORATION_ALLOWED_ORIGIN: 'http://localhost:3000',
      DATABASE_CONNECTION_TIMEOUT_MS: '5000',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
      JWT_SECRET: 'local-development-only-change-me-before-deploy',
      NODE_ENV: 'test',
      WEBSOCKET_MAX_PAYLOAD_BYTES: '1048576',
    },
    environment: 'node',
    fileParallelism: false,
    include: ['src/**/*.integration-spec.ts'],
  },
});
