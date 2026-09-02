import { defineConfig } from 'vitest/config';
import { DefaultReporter, type TestCase, type TestModuleState } from 'vitest/node';

/**
 * Штатный репортер раскрывает зелёные тесты упавшего файла — одна ошибка в
 * большом спеке добавляет два десятка лишних строк. Гасим только эту ветку,
 * подменяя состояние модуля: падения, медленные тесты и полный список при
 * запуске одного файла печатаются как обычно.
 */
export class FailedOnlyReporter extends DefaultReporter {
  protected printTestCase(moduleState: TestModuleState, test: TestCase): void {
    super.printTestCase(moduleState === 'failed' ? 'passed' : moduleState, test);
  }
}

export default defineConfig({
  test: {
    env: {
      CORS_ORIGIN: 'http://localhost:3000',
      DATABASE_CONNECTION_TIMEOUT_MS: '5000',
      DATABASE_URL: 'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
      NODE_ENV: 'test',
      JWT_SECRET: 'local-development-only-change-me-before-deploy',
      ACCESS_TOKEN_TTL_S: '900',
      REFRESH_TOKEN_TTL_S: '2592000',
      BCRYPT_ROUNDS: '12',
      PORT: '3001',
    },
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
    hideSkippedTests: true,
    printConsoleTrace: true,
    // Убирает node_modules из стек-трейса
    onStackTrace: (_error, frame) => !frame.file.includes('node_modules'),
    reporters: [new FailedOnlyReporter()],
    slowTestThreshold: 1000
  },
});
