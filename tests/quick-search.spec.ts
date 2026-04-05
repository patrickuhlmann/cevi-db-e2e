import { test, expect } from '@playwright/test';

test.describe('Schnellsuche', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Leiter in Ortsgruppe wird gefunden', async ({ page }) => {
    await page.fill('#quicksearch', 'E2E Leiter');
    await page.click('.quicksearch-button');

    // Hitobito navigiert bei genau einem Treffer direkt zur Personenseite,
    // bei mehreren Treffern zur Suchergebnisseite /full?q=
    await page.waitForURL(/\/full\?q=|\/people\/\d+/, { timeout: 10000 });
    await expect(page.locator('body')).toContainText('E2E Leiter');
  });

  test('Kind in Ortsgruppe wird nicht gefunden', async ({ page }) => {
    await page.fill('#quicksearch', 'E2E Kind');
    await page.click('.quicksearch-button');

    await page.waitForURL(/\/full\?q=|\/people\/\d+/, { timeout: 10000 });
    await expect(page.locator('body')).not.toContainText('E2E Kind');
  });
});
