import { test, expect, Page } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';
import { setEventContact } from './event-form';

// Seit hitobito_sac_cas#2646 (hitobito `53ecd10c`) gibt es auf der Seite
// "Qualifikationen" eines Kurses pro Person die Auswahl Bestanden / Nicht bestanden /
// Nicht beurteilt und ein Kommentarfeld. Der Kommentar erscheint im Verlauf der
// Person als Info-Icon mit Tooltip. In Cevi (hitobito_youth) erscheint die
// Qualifikation im Verlauf erst, wenn der Kurs den Status "Qualifikationen erfasst"
// (completed) oder "Abgeschlossen" (closed) hat.

const GROUP_ID = 582;                 // E2E Mio
const E2E_MIO_ADMIN_PERSON_ID = 3557;
const E2E_LEITER_PERSON_ID = 3550;
const E2E_LEITER_GROUP_ID = 585;      // E2E Team

const COURSE_NAME = 'E2E Quali-Kommentar';
const COURSE_YEAR = 2026;
const COURSE_DATE = `01.06.${COURSE_YEAR}`;
const KIND_MIRA_BK = '8';             // Kursart "MIRA BK", vergibt die Qualifikation "MIRA Basiskurs"
const COMMENT = 'E2E Kommentar zur Qualifikation';

async function impersonate(page: Page, personId: number) {
  // /people/:id leitet auf die Hauptgruppe der Person weiter
  await page.goto(`/people/${personId}`);
  await page.getByRole('link', { name: 'Imitieren' }).click();
  await expect(page.locator('.user-impersonation')).toBeVisible();
}

async function stopImpersonation(page: Page) {
  await page.getByRole('link', { name: 'Imitation beenden' }).click();
  await expect(page.locator('.user-impersonation')).not.toBeVisible();
  // Session-ID wurde durch sign_in() rotiert – neue Session speichern
  await page.context().storageState({ path: AUTH_FILE });
}

function qualificationRow(page: Page) {
  return page.locator('table tbody tr').filter({ hasText: 'Leiter E2E' });
}

// Status über das Kursformular setzen (Tab "Allgemein"). "closed" vermeiden: Beim
// Wechsel darauf setzt hitobito_youth alle Teilnahmen auf "attended".
async function setCourseState(page: Page, courseUrl: string, state: string) {
  await page.goto(`${courseUrl}/edit`);
  await page.locator('#event_state').selectOption(state);
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page.locator('#flash .alert-success')).toBeVisible();
}

async function saveQualifications(page: Page) {
  await page.getByRole('button', { name: 'Qualifikationen aktualisieren' }).click();
  await expect(page.locator('#flash .alert-success'))
    .toContainText('Die Qualifikationen wurden erfolgreich aktualisiert.');
}

// Löscht alle Testkurse mit diesem Namen (auch Überbleibsel abgebrochener Läufe).
// Vorher die Qualifikation auf "Nicht beurteilt" setzen, damit E2E Leiter keine
// MIRA-Qualifikation behält.
async function deleteCourses(page: Page) {
  const courseLinks = page.locator('table a', { hasText: COURSE_NAME });
  await page.goto(`/groups/${GROUP_ID}/events/course?year=${COURSE_YEAR}`);
  while ((await courseLinks.count()) > 0) {
    await courseLinks.first().click();
    await expect(page).toHaveURL(/\/events\/\d+$/);
    const courseUrl = page.url();
    await setCourseState(page, courseUrl, 'created');
    await page.goto(`${courseUrl}/qualifications`);
    if ((await qualificationRow(page).count()) > 0) {
      await qualificationRow(page).getByRole('radio', { name: 'Nicht beurteilt' }).check();
      await saveQualifications(page);
    }
    await page.goto(courseUrl);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: /^Löschen$/i }).click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
    await page.goto(`/groups/${GROUP_ID}/events/course?year=${COURSE_YEAR}`);
  }
}

async function createCourse(page: Page): Promise<number> {
  await page.goto(`/groups/${GROUP_ID}/events/new?event[type]=Event::Course`);
  await page.locator('#event_name').fill(COURSE_NAME);
  await setEventContact(page);
  await page.locator('#event_kind_id').selectOption(KIND_MIRA_BK);
  await page.locator('a[href="#dates"]').click();
  const startAtInput = page.locator('input[id$="_start_at_date"]').first();
  await startAtInput.pressSequentially(COURSE_DATE);
  await startAtInput.blur();
  await page.locator('a[href="#application_questions"]').click();
  const radios = page.locator('input[name*="application_questions"][name*="disclosure"][value="optional"]');
  for (let i = 0; i < await radios.count(); i++) {
    await radios.nth(i).check();
  }
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page).toHaveURL(/\/events\/\d+$/);
  return parseInt(page.url().match(/\/events\/(\d+)/)![1]);
}

// Anmeldung über den Roles-Controller (Status "applied") und danach im
// Anmeldungs-Markt zuteilen, damit die Person auf der Qualifikationsseite erscheint
async function addAssignedParticipant(page: Page, eventId: number, personId: number) {
  await page.goto(
    `/groups/${GROUP_ID}/events/${eventId}/roles/new` +
    `?event_role[type]=${encodeURIComponent('Event::Course::Role::Participant')}` +
    `&event_role[person_id]=${personId}`
  );
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page.locator('#flash .alert-success')).toContainText(/erstellt/i);

  await page.goto(`/groups/${GROUP_ID}/events/${eventId}/application_market`);
  await page.locator('#applications tr', { hasText: 'Leiter E2E' }).locator('a:has(.fa-arrow-left)').click();
  await page.locator('#email-confirmation-modal').getByRole('link', { name: 'Bestätigen ohne E-Mail' }).click();
  await expect(page.locator('#participants')).toContainText('Leiter E2E');
}

test.describe('Kommentare zu Qualifikationen', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await stopImpersonation(page);
    }
  });

  test('Kursleitung kommentiert die Qualifikation, Teilnehmer sieht den Kommentar im Verlauf', async ({ page }) => {
    await impersonate(page, E2E_MIO_ADMIN_PERSON_ID);
    await deleteCourses(page);

    const eventId = await createCourse(page);
    await addAssignedParticipant(page, eventId, E2E_LEITER_PERSON_ID);

    // Qualifikationsseite: Auswahl in drei Spalten, neu mit Kommentar
    await page.goto(`/groups/${GROUP_ID}/events/${eventId}/qualifications`);
    await expect(page.locator('body')).toContainText('Vergibt die Qualifikation MIRA Basiskurs');
    const row = qualificationRow(page);
    await expect(row.getByRole('radio', { name: 'Nicht beurteilt' })).toBeChecked();
    await row.getByRole('radio', { name: 'Bestanden', exact: true }).check();
    await row.getByRole('textbox', { name: 'Kommentar' }).fill(COMMENT);
    await saveQualifications(page);
    await expect(qualificationRow(page).getByRole('radio', { name: 'Bestanden', exact: true })).toBeChecked();
    await expect(qualificationRow(page).getByRole('textbox', { name: 'Kommentar' })).toHaveValue(COMMENT);
    await page.screenshot({ path: 'screenshots/qualifikation_kommentar_erfasst.png', fullPage: true });

    // Erst mit Status "Qualifikationen erfasst" ist die Qualifikation im Verlauf sichtbar
    await setCourseState(page, `/groups/${GROUP_ID}/events/${eventId}`, 'completed');

    // Der Teilnehmer sieht den Kommentar in seinem Verlauf
    await stopImpersonation(page);
    await impersonate(page, E2E_LEITER_PERSON_ID);
    await page.goto(`/groups/${E2E_LEITER_GROUP_ID}/people/${E2E_LEITER_PERSON_ID}/history`);
    const historyRow = page.locator('tr[id^="event_participation_"]').filter({ hasText: COURSE_NAME });
    await expect(historyRow).toContainText('Bestanden');
    await expect(historyRow.locator(`[title="${COMMENT}"]`)).toBeVisible();
    await page.screenshot({ path: 'screenshots/qualifikation_kommentar_verlauf.png', fullPage: true });

    // Cleanup (setzt die Qualifikation zurück und löscht den Kurs)
    await stopImpersonation(page);
    await impersonate(page, E2E_MIO_ADMIN_PERSON_ID);
    await deleteCourses(page);
    await stopImpersonation(page);

    // E2E Leiter hat die Qualifikation nicht mehr
    await page.goto(`/groups/${E2E_LEITER_GROUP_ID}/people/${E2E_LEITER_PERSON_ID}/history`);
    await expect(page.locator('body')).not.toContainText('MIRA Basiskurs');
  });
});
