import { test, expect } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';

const GROUP_ID = 584;           // E2E Jungschar – hier hat der E2E AL Rechte
const E2E_AL_PERSON_ID = 3552;
const E2E_LEITER_PERSON_ID = 3550;

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

// Erstellt einen Testanlass und gibt die Event-ID zurück
async function createTestEvent(page: any): Promise<number> {
  await page.goto(`/groups/${GROUP_ID}/events`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: /Anlass erstellen/i }).click();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/events\/new/);

  await page.locator('#event_name').fill('E2E Anmeldung-Test');

  await page.locator('a[href="#dates"]').click();
  const startAtInput = page.locator('input[id$="_start_at_date"]').first();
  await startAtInput.pressSequentially('01.06.2026');
  await startAtInput.blur();

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

async function deleteEvent(page: any, eventId: number): Promise<void> {
  await page.goto(`/groups/${GROUP_ID}/events/${eventId}`);
  await page.waitForLoadState('networkidle');
  page.once('dialog', (dialog: any) => dialog.accept());
  await page.getByRole('link', { name: /^Löschen$/i }).click();
  await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
}

test.describe('Anlass-Anmeldung', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await stopImpersonation(page);
    }
  });

  test('E2E Leiter für einen Anlass anmelden und wieder abmelden (als E2E AL)', async ({ page }) => {
    await impersonateAL(page);

    // Testanlass erstellen
    const eventId = await createTestEvent(page);

    // Zur Teilnehmerliste navigieren
    await page.goto(`/groups/${GROUP_ID}/events/${eventId}/participations`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/anlass_anmeldung_liste_leer.png' });

    // Direkt zur Rollen-Formularseite navigieren mit vorausgefüllter Person-ID
    // (umgeht das Autocomplete-Widget; person_id wird in build_entry der Participation zugewiesen)
    await page.goto(
      `/groups/${GROUP_ID}/events/${eventId}/roles/new` +
      `?event_role[type]=Event%3A%3ARole%3A%3AParticipant` +
      `&event_role[person_id]=${E2E_LEITER_PERSON_ID}`
    );
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/roles\/new/);
    await page.screenshot({ path: 'screenshots/anlass_anmeldung_formular.png' });

    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await page.waitForLoadState('networkidle');

    // Nach dem Speichern: Erfolgsmeldung prüfen und Participation-ID aus URL lesen
    // (Hitobito leitet auf die Participation-Detailseite um, nicht die Liste)
    await expect(page).toHaveURL(/\/participations\/\d+/);
    const participationUrl = page.url();
    const participationIdMatch = participationUrl.match(/\/participations\/(\d+)/);
    if (!participationIdMatch) throw new Error(`Konnte Participation-ID nicht aus URL extrahieren: ${participationUrl}`);
    const participationId = participationIdMatch[1];

    await expect(page.locator('#flash .alert-success')).toContainText(/erstellt/i);
    await page.screenshot({ path: 'screenshots/anlass_anmeldung_angemeldet.png' });

    // Zur Teilnehmerliste navigieren und E2E Leiter in der Tabelle prüfen
    await page.goto(`/groups/${GROUP_ID}/events/${eventId}/participations`);
    await page.waitForLoadState('networkidle');
    // Hitobito zeigt Namen als "Nachname Vorname" → "Leiter E2E"
    await expect(page.locator('table')).toContainText('Leiter E2E');
    await page.screenshot({ path: 'screenshots/anlass_anmeldung_liste_mit_teilnehmer.png' });

    // E2E Leiter vom Anlass abmelden (direkt zur Participation navigieren)
    await page.goto(`/groups/${GROUP_ID}/events/${eventId}/participations/${participationId}`);
    await page.waitForLoadState('networkidle');
    page.once('dialog', (dialog: any) => dialog.accept());
    await page.getByRole('link', { name: /Löschen/i }).first().click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht|entfernt/i);
    await page.screenshot({ path: 'screenshots/anlass_anmeldung_abgemeldet.png' });

    // Testanlass löschen
    await deleteEvent(page, eventId);

    await stopImpersonation(page);
  });
});
