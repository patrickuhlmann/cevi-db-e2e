import { test, expect, Page } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';
import { setEventContact } from './event-form';

// Seit hitobito/hitobito#4046 lässt sich pro Anmelde-/Administrationsfrage festlegen,
// welche Anlassrollen die Antworten einsehen dürfen ("Einsehbar für"). Rollen mit
// vollem Zugriff auf die Teilnahmen (in Cevi nur die Hauptleitung) sehen immer alle
// Antworten und sind darum nicht wählbar. Neue Fragen sind für keine weitere Rolle
// einsehbar.

const GROUP_ID = 584;             // E2E Jungschar – hier hat der E2E AL Rechte
const E2E_AL_PERSON_ID = 3552;
const E2E_LEITER_PERSON_ID = 3550;
const E2E_MAMI_PERSON_ID = 3553;

const EVENT_NAME = 'E2E Antwort-Sichtbarkeit';
const EVENT_YEAR = 2027;
const QUESTION_LEITUNG = 'E2E Frage für die Leitung';
const QUESTION_HAUPTLEITUNG = 'E2E Frage nur für die Hauptleitung';
const ANSWER_LEITUNG = 'Antwort für die Leitung';
const ANSWER_HAUPTLEITUNG = 'Antwort nur für die Hauptleitung';
const GLOBAL_QUESTION = 'AHV-Nummer?'; // globale Frage, wird jedem Anlass hinzugefügt

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

// Löscht alle Testanlässe mit diesem Namen (auch Überbleibsel abgebrochener Läufe)
async function deleteEvents(page: Page) {
  const eventLinks = page.locator('table a', { hasText: EVENT_NAME });
  await page.goto(`/groups/${GROUP_ID}/events?year=${EVENT_YEAR}`);
  while ((await eventLinks.count()) > 0) {
    await eventLinks.first().click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: /^Löschen$/i }).click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
    await page.goto(`/groups/${GROUP_ID}/events?year=${EVENT_YEAR}`);
  }
}

// Fügt eine eigene Freitext-Frage hinzu und gibt deren Formular-Block zurück
async function addQuestion(page: Page, question: string) {
  const fields = page.locator('#application_questions_fields > .fields');
  const count = await fields.count();
  await page.locator('#application_questions').getByRole('link', { name: 'Eintrag hinzufügen' }).click();
  const block = fields.nth(count);
  await block.locator('textarea[name$="[question]"]').fill(question);
  return block;
}

function visibilityCheckbox(block: any, roleType: string) {
  return block.locator(`input[type="checkbox"][name$="[visible_role_types][]"][value="${roleType}"]`);
}

function questionBlock(page: Page, question: string) {
  return page.locator('#application_questions_fields > .fields')
    .filter({ has: page.locator('textarea[name$="[question]"]', { hasText: question }) });
}

// Neue Teilnahme: Weiterleitung auf die Teilnahme. Zusätzliche Rolle auf einer
// bestehenden Teilnahme: Weiterleitung auf die Teilnehmerliste.
async function addRole(page: Page, eventId: number, personId: number, roleType: string) {
  await page.goto(
    `/groups/${GROUP_ID}/events/${eventId}/roles/new` +
    `?event_role[type]=${encodeURIComponent(roleType)}` +
    `&event_role[person_id]=${personId}`
  );
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page.locator('#flash .alert-success')).toContainText(/erstellt/i);
}

async function addParticipation(page: Page, eventId: number, personId: number, roleType: string) {
  await addRole(page, eventId, personId, roleType);
  await expect(page).toHaveURL(/\/participations\/\d+/);
  return parseInt(page.url().match(/\/participations\/(\d+)/)![1]);
}

test.describe('Sichtbarkeit von Antworten auf Anmeldefragen', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await stopImpersonation(page);
    }
  });

  test('Leitung sieht nur freigegebene Antworten, Hauptleitung alle', async ({ page }) => {
    await impersonate(page, E2E_AL_PERSON_ID);
    await deleteEvents(page);

    // Anlass mit zwei eigenen Fragen erstellen
    await page.goto(`/groups/${GROUP_ID}/events/new?event[type]=Event`);
    await page.locator('#event_name').fill(EVENT_NAME);
    await setEventContact(page);
    await page.locator('a[href="#dates"]').click();
    const startAtInput = page.locator('input[id$="_start_at_date"]').first();
    await startAtInput.pressSequentially(`01.06.${EVENT_YEAR}`);
    await startAtInput.blur();

    await page.locator('a[href="#application_questions"]').click();
    const radios = page.locator('input[name*="application_questions"][name*="disclosure"][value="optional"]');
    for (let i = 0; i < await radios.count(); i++) {
      await radios.nth(i).check();
    }
    // Hinweis: Hauptleitung sieht immer alles und ist nicht wählbar
    await expect(page.locator('#application_questions'))
      .toContainText('Antworten sind für Hauptleitung immer einsehbar.');

    const leitungBlock = await addQuestion(page, QUESTION_LEITUNG);
    // Neue Fragen: keine Rolle vorausgewählt, Hauptleitung nicht wählbar
    await expect(leitungBlock.locator('input[type="checkbox"][name$="[visible_role_types][]"]:checked')).toHaveCount(0);
    await expect(visibilityCheckbox(leitungBlock, 'Event::Role::Leader')).toHaveCount(0);
    await expect(visibilityCheckbox(leitungBlock, 'Event::Role::AssistantLeader')).toHaveCount(1);
    await visibilityCheckbox(leitungBlock, 'Event::Role::AssistantLeader').check();
    await addQuestion(page, QUESTION_HAUPTLEITUNG);
    await page.screenshot({ path: 'screenshots/antwort_sichtbarkeit_fragen.png', fullPage: true });

    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await expect(page).toHaveURL(/\/events\/\d+$/);
    const eventId = parseInt(page.url().match(/\/events\/(\d+)/)![1]);

    // Auswahl ist gespeichert
    await page.goto(`/groups/${GROUP_ID}/events/${eventId}/edit`);
    await page.locator('a[href="#application_questions"]').click();
    await expect(visibilityCheckbox(questionBlock(page, QUESTION_LEITUNG), 'Event::Role::AssistantLeader')).toBeChecked();
    await expect(visibilityCheckbox(questionBlock(page, QUESTION_HAUPTLEITUNG), 'Event::Role::AssistantLeader')).not.toBeChecked();

    // E2E Leiter als Leitung, E2E Mami als Teilnehmerin
    await addParticipation(page, eventId, E2E_LEITER_PERSON_ID, 'Event::Role::AssistantLeader');
    const participationId = await addParticipation(page, eventId, E2E_MAMI_PERSON_ID, 'Event::Role::Participant');

    // Antworten erfassen
    await page.goto(`/groups/${GROUP_ID}/events/${eventId}/participations/${participationId}/edit`);
    await page.getByLabel(QUESTION_LEITUNG).fill(ANSWER_LEITUNG);
    await page.getByLabel(QUESTION_HAUPTLEITUNG).fill(ANSWER_HAUPTLEITUNG);
    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await expect(page.locator('#flash .alert-success')).toBeVisible();
    await expect(page.locator('body')).toContainText(ANSWER_LEITUNG);
    await expect(page.locator('body')).toContainText(ANSWER_HAUPTLEITUNG);

    const participationUrl = `/groups/${GROUP_ID}/events/${eventId}/participations/${participationId}`;

    // Als Leitung: nur die freigegebene Antwort
    await stopImpersonation(page);
    await impersonate(page, E2E_LEITER_PERSON_ID);
    await page.goto(participationUrl);
    await expect(page.locator('body')).toContainText(QUESTION_LEITUNG);
    await expect(page.locator('body')).toContainText(ANSWER_LEITUNG);
    await expect(page.locator('body')).not.toContainText(QUESTION_HAUPTLEITUNG);
    await expect(page.locator('body')).not.toContainText(ANSWER_HAUPTLEITUNG);
    // Globale Fragen sind ebenfalls für keine weitere Rolle freigegeben
    await expect(page.locator('body')).not.toContainText(GLOBAL_QUESTION);
    await page.screenshot({ path: 'screenshots/antwort_sichtbarkeit_leitung.png', fullPage: true });

    // Mit zusätzlicher Rolle Hauptleitung sieht E2E Leiter alle Antworten
    await stopImpersonation(page);
    await impersonate(page, E2E_AL_PERSON_ID);
    await addRole(page, eventId, E2E_LEITER_PERSON_ID, 'Event::Role::Leader');
    await stopImpersonation(page);
    await impersonate(page, E2E_LEITER_PERSON_ID);
    await page.goto(participationUrl);
    await expect(page.locator('body')).toContainText(ANSWER_LEITUNG);
    await expect(page.locator('body')).toContainText(ANSWER_HAUPTLEITUNG);
    await expect(page.locator('body')).toContainText(GLOBAL_QUESTION);
    await page.screenshot({ path: 'screenshots/antwort_sichtbarkeit_hauptleitung.png', fullPage: true });

    // Cleanup
    await stopImpersonation(page);
    await impersonate(page, E2E_AL_PERSON_ID);
    await deleteEvents(page);
    await stopImpersonation(page);
  });
});
