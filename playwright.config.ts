import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

export const AUTH_FILE = path.join(__dirname, '.auth/session.json');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 15000,
  reporter: 'html',

  use: {
    baseURL: process.env.BASE_URL || 'https://cevi.puzzle.ch',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'de-CH',
  },

  projects: [
    // Erst einloggen und Session speichern
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    // Alle anderen Tests nutzen die gespeicherte Session
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
    },
  ],
});
