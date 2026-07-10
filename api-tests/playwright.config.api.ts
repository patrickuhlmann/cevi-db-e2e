import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30000,
  reporter: [['list'], ['html', { outputFolder: '../playwright-report-api', open: 'never' }]],

  use: {
    baseURL: process.env.BASE_URL || 'https://cevi.puzzle.ch',
    extraHTTPHeaders: {
      Accept: 'application/vnd.api+json',
      'X-Token': process.env.HITOBITO_API_TOKEN || '',
    },
  },
});
