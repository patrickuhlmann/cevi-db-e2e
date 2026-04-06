import { test, expect } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';

const GROUP_ID = 582;               // E2E Mio
const E2E_MIO_ADMIN_PERSON_ID = 3557;
const E2E_LEITER_PERSON_ID = 3550;

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

async function createTestCourse(page: any): Promise<number> {
  await page.goto(`/groups/${GROUP_ID}/events/course`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: /Kurs erstellen/i }).click();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/events\/new/);

  await page.locator('#event_name').fill('E2E Anmeldung-Kurs');
  await page.locator('#event_kind_id').selectOption({ index: 1 });

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

async function deleteCourse(page: any, eventId: number): Promise<void> {
  await page.goto(`/groups/${GROUP_ID}/events/${eventId}`);
  await page.waitForLoadState('networkidle');
  page.once('dialog', (dialog: any) => dialog.accept());
  await page.getByRole('link', { name: /^Löschen$/i }).click();
  await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
}

test.describe('Kurs-Anmeldung', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await stopImpersonation(page);
    }
  });

  test('E2E Leiter für einen Kurs anmelden und wieder abmelden (als E2E Mio Admin)', async ({ page }) => {
    await impersonateMioAdmin(page);

    // Testkurs erstellen
    const eventId = await createTestCourse(page);

    // Zur Teilnehmerliste navigieren
    await page.goto(`/groups/${GROUP_ID}/events/${eventId}/participations`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/kurs_anmeldung_liste_leer.png' });

    // E2E Leiter als Teilnehmer anmelden (direkte URL, umgeht Autocomplete)
    await page.goto(
      `/groups/${GROUP_ID}/events/${eventId}/roles/new` +
      `?event_role[type]=Event%3A%3ACourse%3A%3ARole%3A%3AParticipant` +
      `&event_role[person_id]=${E2E_LEITER_PERSON_ID}`
    );
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/roles\/new/);
    await page.screenshot({ path: 'screenshots/kurs_anmeldung_formular.png' });

    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await page.waitForLoadState('networkidle');

    // Nach Speichern: Weiterleitung auf Participation-Detailseite
    await expect(page).toHaveURL(/\/participations\/\d+/);
    const participationId = page.url().match(/\/participations\/(\d+)/)?.[1];
    if (!participationId) throw new Error(`Konnte Participation-ID nicht aus URL extrahieren: ${page.url()}`);

    await expect(page.locator('#flash .alert-success')).toContainText(/erstellt/i);
    await page.screenshot({ path: 'screenshots/kurs_anmeldung_angemeldet.png' });

    // Participation-Detailseite prüfen – Person muss auf ihrer Anmeldeseite sichtbar sein
    // Hinweis: Via Roles-Controller angelegte Teilnahmen sind bei Kursen im Status "applied"
    // (nicht "assigned") und erscheinen daher nicht in der aktiven Teilnehmerliste, sondern
    // im Application Market. Die Detailseite ist in beiden Fällen erreichbar.
    await page.goto(`/groups/${GROUP_ID}/events/${eventId}/participations/${participationId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E Leiter');
    await page.screenshot({ path: 'screenshots/kurs_anmeldung_teilnehmer_detail.png' });

    // E2E Leiter vom Kurs abmelden (von der Participation-Detailseite)
    page.once('dialog', (dialog: any) => dialog.accept());
    await page.getByRole('link', { name: /Löschen/i }).first().click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht|entfernt/i);
    await page.screenshot({ path: 'screenshots/kurs_anmeldung_abgemeldet.png' });

    // Testkurs löschen
    await deleteCourse(page, eventId);

    await stopImpersonation(page);
  });
});
