import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';

import { defineConfig, devices } from '@playwright/test';

const e2eEnvPath = join(process.cwd(), '.env.e2e');

if (existsSync(e2eEnvPath)) {
  loadEnvFile(e2eEnvPath);
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // Приложение открывается по адресу шлюза: за ним и frontend, и API, и WebSocket.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
