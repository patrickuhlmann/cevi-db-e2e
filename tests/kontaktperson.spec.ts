import { test, expect, Page } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';
import { setEventContact } from './event-form';

// hitobito/hitobito#2881: Anlass-Mails (Anmeldebestätigung, Benachrichtigung,
// Registrierung) setzen die E-Mail der Kontaktperson als Reply-To, wenn
// `Settings.event.use_contact_as_reply_to` aktiv ist (in hitobito_cevi: ja).
// hitobito_cevi verlangt darum für jeden Anlass/Kurs eine Kontaktperson mit
// E-Mail-Adresse. Den Mail-Header selbst kann die Suite nicht prüfen (kein
// Postfach-Zugriff), getestet wird die Validierung im Formular.

const GROUP_ID = 584;                 // E2E Jungschar – hier hat der E2E AL Rechte
const E2E_AL_PERSON_ID = 3552;
const E2E_MAMI_PERSON_ID = 3553;      // hat keine E-Mail-Adresse, für E2E AL sichtbar

const EVENT_NAME = 'E2E Kontaktperson-Test';
const EVENT_YEAR = 2027;
const CONTACT_ERROR = 'Kontaktperson mit gültiger E-Mail-Adresse muss vorhanden sein';

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

async function setContactId(page: Page, personId: number) {
  await page.locator('a[href="#general"]').click();
  await page.locator('#event_contact_id').evaluate(
    (el: HTMLInputElement, id: number) => { el.value = String(id); },
    personId,
  );
}

// Wartet auf die Antwort des Submits: Bei einem Validierungsfehler bleibt die alte
// Fehlermeldung bis zum Neu-Rendern stehen, eine Text-Assertion allein wäre zu früh.
async function save(page: Page) {
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Speichern' }).first().click(),
  ]);
  await page.waitForLoadState('networkidle');
}

test.describe('Kontaktperson als Reply-To für Anlass-Mails', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await stopImpersonation(page);
    }
  });

  test('Anlass braucht eine Kontaktperson mit E-Mail-Adresse (als E2E AL)', async ({ page }) => {
    await impersonate(page, E2E_AL_PERSON_ID);
    await deleteEvents(page);

    await page.goto(`/groups/${GROUP_ID}/events/new?event[type]=Event`);
    await page.locator('#event_name').fill(EVENT_NAME);
    await page.locator('a[href="#dates"]').click();
    const startAtInput = page.locator('input[id$="_start_at_date"]').first();
    await startAtInput.pressSequentially(`01.06.${EVENT_YEAR}`);
    await startAtInput.blur();
    await page.locator('a[href="#application_questions"]').click();
    const radios = page.locator('input[name*="application_questions"][name*="disclosure"][value="optional"]');
    for (let i = 0; i < await radios.count(); i++) {
      await radios.nth(i).check();
    }

    // Ohne Kontaktperson
    await save(page);
    await expect(page.locator('body')).toContainText(CONTACT_ERROR);
    await page.screenshot({ path: 'screenshots/kontaktperson_fehlt.png' });

    // Kontaktperson ohne E-Mail-Adresse
    await setContactId(page, E2E_MAMI_PERSON_ID);
    await save(page);
    await expect(page.locator('body')).toContainText(CONTACT_ERROR);
    await page.screenshot({ path: 'screenshots/kontaktperson_ohne_email.png' });

    // Kontaktperson mit E-Mail-Adresse
    await setEventContact(page);
    await save(page);
    await expect(page).toHaveURL(/\/events\/\d+$/);
    await expect(page.locator('#flash .alert-success')).toBeVisible();
    await expect(page.locator('body')).toContainText('E2E AL');
    await page.screenshot({ path: 'screenshots/kontaktperson_gespeichert.png' });

    await deleteEvents(page);
    await stopImpersonation(page);
  });
});
