import { test, expect } from '@playwright/test';

test.describe('Bestandesmeldung', () => {
  test('Bestandesmeldung für 2026 einfordern schlägt fehl (Jahr bereits vergeben)', async ({ page }) => {
    await page.goto('/censuses/new');

    // Sicherstellen dass das Formular geladen ist
    await expect(page.getByLabel('Jahr')).toBeVisible();

    // Jahr überschreiben auf 2026 (bereits vergeben)
    await page.getByLabel('Jahr').fill('2026');

    await page.getByRole('button', { name: 'Speichern' }).first().click();

    // Validierungsfehler: Hitobito zeigt Fehler in #error_explanation
    await expect(page.locator('#error_explanation')).toContainText('bereits vergeben');
  });
});
