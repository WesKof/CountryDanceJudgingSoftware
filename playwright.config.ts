import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: '**/*browser.spec.ts', timeout: 240000, workers: 1, retries: 0,
  outputDir: 'test-results', reporter: 'list',
  use: { baseURL: process.env.LIVE_TEST_URL ?? 'http://127.0.0.1:3000', channel: 'msedge', headless: true, actionTimeout: 15000, navigationTimeout: 20000, trace: 'off', screenshot: 'only-on-failure' },
});
