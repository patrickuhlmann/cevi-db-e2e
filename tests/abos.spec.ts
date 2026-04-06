import { test, expect } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';

const GROUP_ID = 584;
const E2E_AL_PERSON_ID = 3552;

async function impersonateAL(page: any) {
  await page.goto(`/groups/${GROUP_ID}/people/${E2E_AL_PERSON_ID}`);
  await page.getByRole('link', { name: 'Imitieren' }).click();
  await expect(page.locator('.user-impersonation')).toBeVisible();
}

async function stopImpersonation(page: any) {
  await page.getByRole('link', { name: 'Imitation beenden' }).click();
  await expect(page.locator('.user-impersonation')).not.toBeVisible();
  // Session-ID wurde durch sign_in() rotiert – neue Session speichern
  await page.context().storageState({ path: AUTH_FILE });
}

test.describe('Abos', () => {
  // Sicherheitsnetz: Falls ein Test mit aktiver Impersonation abbricht,
  // wird die Session trotzdem korrekt gespeichert.
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await stopImpersonation(page);
    }
  });

  test('Neues Abo erstellen und wieder löschen (als E2E AL)', async ({ page }) => {
    await impersonateAL(page);

    await page.goto(`/groups/${GROUP_ID}/mailing_lists/new`);
    await page.getByLabel('Name').fill('E2E Test-Abo');
    await page.getByRole('button', { name: 'Speichern' }).first().click();

    await expect(page).toHaveURL(/\/mailing_lists\/\d+/);
    await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E Test-Abo');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: /Löschen/i }).click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);

    await stopImpersonation(page);
  });

  test('Für ein Abo an- und abmelden (als E2E AL)', async ({ page }) => {
    await impersonateAL(page);

    // Abo mit Selbst-An/Abmeldung für alle erstellen
    await page.goto(`/groups/${GROUP_ID}/mailing_lists/new`);
    await page.getByLabel('Name').fill('E2E Anmelde-Abo');
    await page.locator('input[name="mailing_list[subscribable_for]"][value="anyone"]').check();
    await page.getByRole('button', { name: 'Speichern' }).first().click();

    await expect(page).toHaveURL(/\/mailing_lists\/\d+/);
    const aboUrl = page.url();

    // Anmelden
    await page.getByRole('link', { name: 'Anmelden' }).click();
    await expect(page.locator('#flash .alert-success')).toContainText(/angemeldet/);

    // Zurück zur Abo-Detailseite → "Abmelden"-Button prüfen und klicken
    await page.goto(aboUrl);
    const abmeldenBtn = page.locator('.btn-group a.btn', { hasText: 'Abmelden' });
    await expect(abmeldenBtn).toBeVisible();
    await abmeldenBtn.click();
    await expect(page.locator('#flash .alert-success')).toContainText(/abgemeldet/);

    // Zurück zur Abo-Detailseite → "Anmelden"-Button prüfen
    await page.goto(aboUrl);
    await expect(page.locator('.btn-group a.btn', { hasText: 'Anmelden' })).toBeVisible();

    // Cleanup
    await page.goto(aboUrl);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: /Löschen/i }).click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);

    await stopImpersonation(page);
  });
});
