import { test, expect, Page } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';
import { setEventContact } from './event-form';

// Seit hitobito_sww#376 halten sich Anmeldebestätigung (PDF), Teilnahme-Mails, iCal
// und die API an die Anzeigeoptionen der Kontaktperson im Anlass-Formular
// ("Name anzeigen", "E-Mail anzeigen", …). Testbar ist der iCal-Export: vorher
// standen Name, öffentliche Telefonnummern und E-Mail der Kontaktperson immer drin.
// Die Teilnahme-Seite ("Angemeldet bei") ist in der Cevi nicht betroffen: Sie
// beachtet die Optionen nur, wenn die Anmeldestelle die Kontaktperson selbst ist.

const GROUP_ID = 584;                 // E2E Jungschar – hier hat der E2E AL Rechte
const E2E_AL_PERSON_ID = 3552;        // ist auch die Kontaktperson (setEventContact)
const CONTACT_NAME = 'E2E AL';
const CONTACT_EMAIL = 'e2e-al@uhlme.ch';

const EVENT_NAME = 'E2E Kontaktperson-Anzeige';
const EVENT_YEAR = 2027;

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

// Die Checkboxen stehen in einem Container, der erst sichtbar wird, wenn die
// Kontaktperson über das Autocomplete gewählt wurde. Darum direkt setzen.
async function setContactOption(page: Page, label: string, checked: boolean) {
  await page.locator('label', { hasText: label }).locator('input[type="checkbox"]')
    .evaluate((el: HTMLInputElement, value: boolean) => { el.checked = value; }, checked);
}

async function ical(page: Page, eventUrl: string) {
  const response = await page.request.get(`${eventUrl}.ics`);
  expect(response.ok()).toBeTruthy();
  // Lange Zeilen sind im iCal-Format umbrochen (CRLF + Leerzeichen)
  return (await response.text()).replace(/\r\n /g, '');
}

async function saveEdit(page: Page, eventUrl: string, changes: Record<string, boolean>) {
  await page.goto(`${eventUrl}/edit`);
  for (const [label, checked] of Object.entries(changes)) {
    await setContactOption(page, label, checked);
  }
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page.locator('#flash .alert-success')).toContainText(/erfolgreich aktualisiert/);
}

test.describe('Anzeigeoptionen der Kontaktperson', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await stopImpersonation(page);
    }
  });

  test('iCal-Export zeigt nur die gewählten Angaben (als E2E AL)', async ({ page }) => {
    await impersonate(page, E2E_AL_PERSON_ID);
    await deleteEvents(page);

    // Neuer Anlass: alle Anzeigeoptionen sind standardmässig angewählt
    await page.goto(`/groups/${GROUP_ID}/events/new?event[type]=Event`);
    await page.locator('#event_name').fill(EVENT_NAME);
    await setEventContact(page);
    await expect(page.locator('label', { hasText: 'E-Mail anzeigen' }).locator('input')).toBeChecked();
    await page.locator('a[href="#dates"]').click();
    const startAtInput = page.locator('input[id$="_start_at_date"]').first();
    await startAtInput.pressSequentially(`01.06.${EVENT_YEAR}`);
    await startAtInput.blur();
    await page.locator('a[href="#application_questions"]').click();
    const disclosureRadios = page.locator('input[name*="application_questions"][name*="disclosure"][value="optional"]');
    const count = await disclosureRadios.count();
    for (let i = 0; i < count; i++) {
      await disclosureRadios.nth(i).check();
    }
    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await expect(page).toHaveURL(/\/events\/\d+$/);
    const eventUrl = new URL(page.url()).pathname;

    let calendar = await ical(page, eventUrl);
    expect(calendar).toContain(`CONTACT:${CONTACT_NAME}`);
    expect(calendar).toContain(CONTACT_EMAIL);

    // Ohne "E-Mail anzeigen": Name ja, E-Mail nein
    await saveEdit(page, eventUrl, { 'E-Mail anzeigen': false });
    await page.screenshot({ path: 'screenshots/kontaktperson-anzeige_ohne_email.png' });
    calendar = await ical(page, eventUrl);
    expect(calendar).toContain(`CONTACT:${CONTACT_NAME}`);
    expect(calendar).not.toContain(CONTACT_EMAIL);

    // Zusätzlich ohne "Name anzeigen": keine Angaben zur Kontaktperson mehr
    await saveEdit(page, eventUrl, { 'Name anzeigen': false });
    calendar = await ical(page, eventUrl);
    expect(calendar).not.toContain('CONTACT:');
    expect(calendar).not.toContain(CONTACT_NAME);
    expect(calendar).not.toContain(CONTACT_EMAIL);

    await deleteEvents(page);
    await stopImpersonation(page);
  });
});
