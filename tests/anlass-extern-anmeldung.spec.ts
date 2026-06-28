import { test, expect, Cookie } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';

const GROUP_ID = 584;           // E2E Jungschar – hier hat der E2E AL Rechte
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

async function createEventWithExternalApplications(page: any): Promise<number> {
  await page.goto(`/groups/${GROUP_ID}/events`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: /Anlass erstellen/i }).click();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/events\/new/);

  await page.locator('#event_name').fill('E2E Externer Anmeldungs-Anlass');

  // Daten: Startdatum
  await page.locator('a[href="#dates"]').click();
  const startAtInput = page.locator('input[id$="_start_at_date"]').first();
  await startAtInput.pressSequentially('01.06.2026');
  await startAtInput.blur();

  // Anmeldung: Öffnungsdatum setzen + externe Anmeldung aktivieren
  await page.locator('a[href="#application"]').click();
  const openingDateInput = page.locator('input[id$="_application_opening_at"]');
  if (await openingDateInput.count() > 0) {
    await openingDateInput.first().pressSequentially('01.01.2026');
    await openingDateInput.first().blur();
  }
  await page.locator('#event_external_applications').check();

  // Anmeldungsangaben: Disclosure setzen
  await page.locator('a[href="#application_questions"]').click();
  const disclosureRadios = page.locator('input[name*="application_questions"][name*="disclosure"][value="optional"]');
  const count = await disclosureRadios.count();
  for (let i = 0; i < count; i++) {
    await disclosureRadios.nth(i).check();
  }

  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/events\/\d+/);

  const match = page.url().match(/\/events\/(\d+)/);
  if (!match) throw new Error(`Konnte Event-ID nicht aus URL extrahieren: ${page.url()}`);
  return parseInt(match[1]);
}

test.describe('Externe Anlass-Anmeldung', () => {
  test('Externe Person meldet sich für einen Anlass mit externer Anmeldung an', async ({ page }) => {
    test.setTimeout(60000);
    // === Phase 1: Anlass erstellen (als E2E AL) ===
    await impersonateAL(page);
    const eventId = await createEventWithExternalApplications(page);
    await page.screenshot({ path: 'screenshots/anlass_extern_anlass_erstellt.png' });
    await stopImpersonation(page);

    // Admin-Cookies für Cleanup sichern
    const adminCookies: Cookie[] = (await page.context().storageState()).cookies;

    // === Phase 2: Externe Anmeldung (ohne Session) ===
    await page.context().clearCookies();

    await page.goto(`/groups/${GROUP_ID}/public_events/${eventId}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/anlass_extern_public_event.png' });

    // Eindeutige Test-Email (Person bleibt nach dem Test im System)
    const testEmail = `e2e-extern-anlass-${Date.now()}@example.com`;

    // Email eingeben im "Ohne Login"-Bereich
    await page.locator('#person_email').fill(testEmail);
    await page.getByRole('button', { name: /Weiter/i }).first().click();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/anlass_extern_email_check.png' });

    // Registrierungsformular: Vorname + Nachname
    await expect(page).toHaveURL(/\/register/);
    await page.locator('#event_participation_contact_data_first_name').fill('E2E');
    await page.locator('#event_participation_contact_data_last_name').fill('Extern');

    // Datenschutzrichtlinie akzeptieren falls vorhanden
    const privacyCheckbox = page.locator('input[type="checkbox"][id*="privacy_policy"]');
    if (await privacyCheckbox.count() > 0) {
      await privacyCheckbox.first().check();
    }

    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/anlass_extern_registriert.png' });

    // Person wurde erstellt und eingeloggt
    await expect(page.locator('#flash .alert-notice, #flash .alert-success'))
      .toContainText(/Daten.*aufgenommen|registriert|angemeldet/i);

    // === Phase 3: Anmeldungs-Formular (als neu registrierte externe Person) ===
    await page.goto(`/groups/${GROUP_ID}/events/${eventId}/participations/new`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/participations\/new/);
    await page.screenshot({ path: 'screenshots/anlass_extern_participation_form.png' });

    await page.getByRole('button', { name: 'Anmelden' }).first().click();
    await page.waitForLoadState('networkidle');

    // Participation erfolgreich erstellt
    await expect(page).toHaveURL(/\/participations\/\d+/);
    await page.screenshot({ path: 'screenshots/anlass_extern_angemeldet.png' });

    // === Phase 4: Cleanup (Admin-Session wiederherstellen, Anlass löschen) ===
    await page.context().clearCookies();
    await page.context().addCookies(adminCookies);

    await impersonateAL(page);

    await page.goto(`/groups/${GROUP_ID}/events/${eventId}`);
    await page.waitForLoadState('networkidle');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: /^Löschen$/i }).click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
    await page.screenshot({ path: 'screenshots/anlass_extern_anlass_geloescht.png' });

    await stopImpersonation(page);
  });
});
