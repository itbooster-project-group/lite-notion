import { defineConfig } from 'vitest/config';

import { FailedOnlyReporter } from './vitest.config.mjs';

/**
 * Интеграционные тесты: единственное место, где допустимо обращение к живой
 * базе. Юнит-конфигурация их не подхватывает — она включает `*.spec.ts`, а эти
 * файлы называются `*.integration-spec.ts`, поэтому `pnpm test` остаётся
 * независимым от внешних сервисов.
 *
 * Требуют поднятую базу и применённые миграции.
 */
export default defineConfig({
  test: {
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
      NODE_ENV: 'test',
    },
    environment: 'node',
    // Общая база: параллельные файлы мешали бы друг другу.
    fileParallelism: false,
    include: ['src/**/*.integration-spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
    hideSkippedTests: true,
    printConsoleTrace: true,
    // Убирает node_modules из стек-трейса
    onStackTrace: (_error, frame) => !frame.file.includes('node_modules'),
    reporters: [new FailedOnlyReporter()],
    slowTestThreshold: 1000
  },
});
