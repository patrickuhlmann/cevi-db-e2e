import { test, expect, Cookie } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';

const GROUP_ID = 582;               // E2E Mio
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

// Erstellt einen Kurs mit externer Anmeldung und gibt die Event-ID zurück
async function createCourseWithExternalApplications(page: any): Promise<number> {
  await page.goto(`/groups/${GROUP_ID}/events/course`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: /Kurs erstellen/i }).click();
  await page.waitForLoadState('networkidle');

  // Allgemein: Name, Kursart, Status "Offen zur Anmeldung"
  await page.locator('#event_name').fill('E2E Externer Anmeldungs-Kurs');
  await page.locator('#event_kind_id').selectOption({ index: 1 });
  await page.locator('#event_state').selectOption('application_open');

  // Daten: Startdatum
  await page.locator('a[href="#dates"]').click();
  const startAtInput = page.locator('input[id$="_start_at_date"]').first();
  await startAtInput.pressSequentially('01.06.2026');
  await startAtInput.blur();

  // Anmeldung: Externe Anmeldung aktivieren
  await page.locator('a[href="#application"]').click();
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

test.describe('Externe Kurs-Anmeldung', () => {
  test('Externe Person meldet sich für einen Kurs mit externer Anmeldung an', async ({ page }) => {
    // === Phase 1: Kurs erstellen (als E2E Mio Admin) ===
    await impersonateMioAdmin(page);
    const eventId = await createCourseWithExternalApplications(page);
    await page.screenshot({ path: 'screenshots/kurs_extern_kurs_erstellt.png' });
    await stopImpersonation(page);

    // Admin-Cookies für Cleanup sichern
    const adminCookies: Cookie[] = (await page.context().storageState()).cookies;

    // === Phase 2: Externe Anmeldung (ohne Session) ===
    await page.context().clearCookies();

    // Public-Event-Seite aufrufen (nur ohne Login zugänglich)
    await page.goto(`/groups/${GROUP_ID}/public_events/${eventId}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/kurs_extern_public_event.png' });

    // Eindeutige Testperson-Email (Hinweis: Person bleibt nach dem Test im System)
    const testEmail = `e2e-extern-kurs-${Date.now()}@example.com`;

    // Email eingeben im "Ohne Login"-Bereich
    await page.locator('#person_email').fill(testEmail);
    await page.getByRole('button', { name: /Weiter/i }).first().click();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/kurs_extern_email_check.png' });

    // Registrierungsformular: Vorname + Nachname (Email ist vorausgefüllt)
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
    await page.screenshot({ path: 'screenshots/kurs_extern_registriert.png' });

    // Person wurde erstellt und eingeloggt → Flash-Meldung sichtbar
    // Hinweis: Mit aktiviertem "people.people_managers"-Feature geht der Redirect auf die
    // Event-Seite (group_event_path) statt auf /participations/new.
    await expect(page.locator('#flash .alert-notice, #flash .alert-success'))
      .toContainText(/Daten.*aufgenommen|registriert|angemeldet/i);

    // === Phase 3: Anmeldungs-Formular (als neu registrierte externe Person) ===
    // Direkt zum Participation-Formular navigieren (unabhängig vom Redirect-Ziel)
    await page.goto(`/groups/${GROUP_ID}/events/${eventId}/participations/new`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/participations\/new/);
    await page.screenshot({ path: 'screenshots/kurs_extern_participation_form.png' });

    // Anmeldungsangaben: Disclosure setzen (falls vorhanden)
    const appQuestionsTab = page.locator('a[href="#application_questions"]');
    if (await appQuestionsTab.isVisible()) {
      await appQuestionsTab.click();
      const radios = page.locator('input[name*="application_questions"][name*="disclosure"][value="optional"]');
      const radioCount = await radios.count();
      for (let i = 0; i < radioCount; i++) {
        await radios.nth(i).check();
      }
    }

    // Participation-Formular hat "Anmelden"-Button (nicht "Speichern")
    await page.getByRole('button', { name: 'Anmelden' }).first().click();
    await page.waitForLoadState('networkidle');

    // Participation erfolgreich erstellt: Redirect auf Participation-Detailseite.
    // hitobito-youth erstellt eine Voranmeldung – die URL-Prüfung bestätigt den Erfolg.
    await expect(page).toHaveURL(/\/participations\/\d+/);
    await page.screenshot({ path: 'screenshots/kurs_extern_angemeldet.png' });

    // === Phase 4: Cleanup (Admin-Session wiederherstellen, Kurs löschen) ===
    // Hinweis: Die externe Testperson (testEmail) verbleibt im System als Testdaten.
    // Nur der Kurs wird gelöscht (kaskadiert die Participation-Löschung).
    await page.context().clearCookies();
    await page.context().addCookies(adminCookies);

    // E2E Mio Admin imitieren für Kurs-Löschung (Admin selbst hat keine Layer-Full-Rechte auf MO-Ebene)
    await impersonateMioAdmin(page);

    await page.goto(`/groups/${GROUP_ID}/events/${eventId}`);
    await page.waitForLoadState('networkidle');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: /^Löschen$/i }).click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
    await page.screenshot({ path: 'screenshots/kurs_extern_kurs_geloescht.png' });

    await stopImpersonation(page);
  });
});
