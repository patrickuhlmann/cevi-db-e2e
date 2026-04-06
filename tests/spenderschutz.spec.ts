import { test, expect } from '@playwright/test';

test.describe('Spenderschutz', () => {
  test('Spender sind für Admins nicht sichtbar', async ({ page }) => {
    await page.goto('/groups/588/people?returning=true');

    await expect(page.locator('body')).toContainText('0 Personen angezeigt');
    await expect(page.locator('body')).toContainText('1 weitere Person ist für dich nicht sichtbar');
    await page.screenshot({ path: 'screenshots/spenderschutz_nicht_sichtbar.png' });
  });
});
