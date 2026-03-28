import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: '*.pw.ts',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'bun run dev',
    port: 4321,
    reuseExistingServer: true,
    timeout: 10000,
  },
});
