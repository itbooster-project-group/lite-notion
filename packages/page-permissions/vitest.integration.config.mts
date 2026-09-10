import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_CONNECTION_TIMEOUT_MS: '5000',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
      NODE_ENV: 'test',
    },
    environment: 'node',
    // Тесты делят одну базу и чистят её за собой, поэтому идут по одному.
    fileParallelism: false,
    include: ['src/**/*.integration-spec.ts'],
  },
});
