import { test, expect } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';

const GROUP_ID = 584;           // E2E Jungschar – hier hat der E2E AL (Abteilungsleiter/-in) Rechte
const E2E_AL_PERSON_ID = 3552;

async function impersonateAL(page: any) {
  await page.goto(`/groups/${GROUP_ID}/people/${E2E_AL_PERSON_ID}`);
  await page.getByRole('link', { name: 'Imitieren' }).click();
  await expect(page.locator('.user-impersonation')).toBeVisible();
}

async function stopImpersonation(page: any) {
  await page.getByRole('link', { name: 'Imitation beenden' }).click();
  await expect(page.locator('.user-impersonation')).not.toBeVisible();
  await page.context().storageState({ path: AUTH_FILE });
}

test.describe('Anlass', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await stopImpersonation(page);
    }
  });

  test('Anlass erstellen und wieder löschen (als E2E AL in E2E Jungschar)', async ({ page }) => {
    await impersonateAL(page);

    // Via Anlass-Tab navigieren statt direkter URL
    await page.goto(`/groups/${GROUP_ID}/events`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/anlass_liste.png' });

    // "Anlass erstellen" Button klicken
    await page.getByRole('link', { name: /Anlass erstellen/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/events\/new/);
    await page.screenshot({ path: 'screenshots/anlass_formular.png' });

    // Name ausfüllen (allgemein-Tab ist standardmässig aktiv)
    await page.locator('#event_name').fill('E2E Test-Anlass');

    // "Daten"-Tab öffnen – die Datum-Felder (type="text", class="date") sind dort versteckt
    await page.locator('a[href="#dates"]').click();

    // Datum in Format DD.MM.YYYY tippen; fill() reicht nicht, pressSequentially löst JS-Events aus
    const startAtInput = page.locator('input[id$="_start_at_date"]').first();
    await startAtInput.pressSequentially('01.06.2026');
    await startAtInput.blur();

    // "Anmeldungsangaben"-Tab öffnen: globale Fragen brauchen ein Disclosure-Wert
    await page.locator('a[href="#application_questions"]').click();
    // Alle disclosure-Radio-Buttons auf "optional" setzen
    const disclosureRadios = page.locator('input[name*="application_questions"][name*="disclosure"][value="optional"]');
    const count = await disclosureRadios.count();
    for (let i = 0; i < count; i++) {
      await disclosureRadios.nth(i).check();
    }

    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await page.waitForLoadState('networkidle');

    // Nach dem Speichern: auf Anlass-Detailseite landen, Event-ID merken
    await expect(page).toHaveURL(/\/events\/\d+/);
    const eventUrl = page.url();
    const eventIdMatch = eventUrl.match(/\/events\/(\d+)/);
    if (!eventIdMatch) throw new Error(`Konnte Event-ID nicht aus URL extrahieren: ${eventUrl}`);
    const eventId = parseInt(eventIdMatch[1]);

    await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E Test-Anlass');
    await page.screenshot({ path: 'screenshots/anlass_erstellt.png' });

    // Zur Event-Detailseite navigieren (falls Redirect stattgefunden hat)
    await page.goto(`/groups/${GROUP_ID}/events/${eventId}`);
    await page.waitForLoadState('networkidle');

    // Anlass löschen – Events verwenden direkte Buttons (kein Dropdown wie Gruppen)
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: /^Löschen$/i }).click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
    await page.screenshot({ path: 'screenshots/anlass_geloescht.png' });

    await stopImpersonation(page);
  });
});
