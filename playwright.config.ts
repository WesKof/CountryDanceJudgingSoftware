import { defineConfig } from '@playwright/test';
import { requireBrowserTestEndpoints } from './tests/test-endpoints';

export default defineConfig({
  testDir: './tests', testMatch: '**/*browser.spec.ts', timeout: 240000, workers: 1, retries: 0,
  outputDir: 'test-results', reporter: 'list',
  use: { baseURL: requireBrowserTestEndpoints(), channel: 'msedge', headless: true, actionTimeout: 15000, navigationTimeout: 20000, trace: 'off', screenshot: 'only-on-failure' },
});
