import { test, expect } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';

const GROUP_ID = 582;           // E2E Mio – hier hat der E2E Mio Admin Rechte
const E2E_MIO_ADMIN_PERSON_ID = 3557;

async function impersonateMioAdmin(page: any) {
  await page.goto(`/groups/${GROUP_ID}/people/${E2E_MIO_ADMIN_PERSON_ID}`);
  await page.getByRole('link', { name: 'Imitieren' }).click();
  await expect(page.locator('.user-impersonation')).toBeVisible();
}

async function stopImpersonation(page: any) {
  await page.getByRole('link', { name: 'Imitation beenden' }).click();
  await expect(page.locator('.user-impersonation')).not.toBeVisible();
  await page.context().storageState({ path: AUTH_FILE });
}

test.describe('Kurs', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await stopImpersonation(page);
    }
  });

  test('Kurs erstellen und wieder löschen (als E2E Mio Admin in E2E Mio)', async ({ page }) => {
    await impersonateMioAdmin(page);

    // Kurs-Tab der Gruppe aufrufen
    await page.goto(`/groups/${GROUP_ID}/events/course`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/kurs_liste.png' });

    // "Kurs erstellen" Button klicken
    await page.getByRole('link', { name: /Kurs erstellen/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/events\/new/);
    await page.screenshot({ path: 'screenshots/kurs_formular.png' });

    // Name ausfüllen
    await page.locator('#event_name').fill('E2E Test-Kurs');

    // Kursart wählen (kind_id ist Pflichtfeld für Kurse)
    const kindSelect = page.locator('#event_kind_id');
    await kindSelect.selectOption({ index: 1 });

    // "Daten"-Tab öffnen und Startdatum setzen
    await page.locator('a[href="#dates"]').click();
    const startAtInput = page.locator('input[id$="_start_at_date"]').first();
    await startAtInput.pressSequentially('01.06.2026');
    await startAtInput.blur();

    // "Anmeldungsangaben"-Tab öffnen und Disclosure-Wert setzen
    await page.locator('a[href="#application_questions"]').click();
    const disclosureRadios = page.locator('input[name*="application_questions"][name*="disclosure"][value="optional"]');
    const count = await disclosureRadios.count();
    for (let i = 0; i < count; i++) {
      await disclosureRadios.nth(i).check();
    }

    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await page.waitForLoadState('networkidle');

    // Nach dem Speichern: auf Kurs-Detailseite landen, Event-ID merken
    await expect(page).toHaveURL(/\/events\/\d+/);
    const eventUrl = page.url();
    const eventIdMatch = eventUrl.match(/\/events\/(\d+)/);
    if (!eventIdMatch) throw new Error(`Konnte Event-ID nicht aus URL extrahieren: ${eventUrl}`);
    const eventId = parseInt(eventIdMatch[1]);

    await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E Test-Kurs');
    await page.screenshot({ path: 'screenshots/kurs_erstellt.png' });

    // Zur Kurs-Detailseite navigieren
    await page.goto(`/groups/${GROUP_ID}/events/${eventId}`);
    await page.waitForLoadState('networkidle');

    // Kurs löschen
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: /^Löschen$/i }).click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
    await page.screenshot({ path: 'screenshots/kurs_geloescht.png' });

    await stopImpersonation(page);
  });
});
