import { test, expect } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';

const ABO_NAME = 'E2E Test-Abo';
const GROUP_ID = 584;
const E2E_AL_PERSON_ID = 3552;

test.describe('Abos', () => {
  test('Neues Abo erstellen und wieder löschen (als E2E AL)', async ({ page }) => {
    // E2E AL imitieren (hat Gruppenleiter-Rechte in E2E Jungschar)
    await page.goto(`/groups/${GROUP_ID}/people/${E2E_AL_PERSON_ID}`);
    await page.getByRole('link', { name: 'Imitieren' }).click();
    await expect(page.locator('.user-impersonation')).toBeVisible();

    // Neues Abo erstellen
    await page.goto(`/groups/${GROUP_ID}/mailing_lists/new`);
    await page.getByLabel('Name').fill(ABO_NAME);
    await page.getByRole('button', { name: 'Speichern' }).first().click();

    // Erfolgreich gespeichert → Abo-Detailseite
    await expect(page).toHaveURL(/\/mailing_lists\/\d+/);
    await expect(page.locator('main h1, #main-content h1').first()).toContainText(ABO_NAME);

    // Cleanup: Abo löschen
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: /Löschen/i }).click();
    await expect(page).toHaveURL(/\/mailing_lists/);
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);

    // Imitation beenden und neue Session als E2E Admin speichern.
    // Nötig weil sign_in() die Session-ID rotiert (ActiveRecord session store).
    await page.getByRole('link', { name: 'Imitation beenden' }).click();
    await expect(page.locator('.user-impersonation')).not.toBeVisible();
    await page.context().storageState({ path: AUTH_FILE });
  });
});
