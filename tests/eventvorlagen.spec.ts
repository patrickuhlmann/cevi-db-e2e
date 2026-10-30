import { test, expect, Page } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';
import { setEventContact } from './event-form';

// Seit hitobito/hitobito#4259 lassen sich auf Ebenen-Gruppen Eventvorlagen
// verwalten (Bearbeiten-Dropdown → "Eventvorlagen"). Aus einer Vorlage wird über
// das Dropdown von "Anlass erstellen" ein neuer Anlass erstellt; bestehende
// Anlässe lassen sich "Als Vorlage speichern". Mit "Vererbung" steht eine
// Vorlage auch auf untergeordneten Ebenen zur Verfügung.

const JUNGSCHAR_ID = 584;
const MIO_ID = 582;
const E2E_AL_PERSON_ID = 3552;
const E2E_MIO_ADMIN_PERSON_ID = 3557;
const API_ANLASS_ID = 1458; // Fixture "E2E API Anlass" in E2E Jungschar
const API_KURS_ID = 1459; // Fixture "E2E API Kurs" in E2E Mio

async function impersonate(page: Page, groupId: number, personId: number) {
  await page.goto(`/groups/${groupId}/people/${personId}`);
  await page.getByRole('link', { name: 'Imitieren' }).click();
  await expect(page.locator('.user-impersonation')).toBeVisible();
}

async function stopImpersonation(page: Page) {
  await page.getByRole('link', { name: 'Imitation beenden' }).click();
  await expect(page.locator('.user-impersonation')).not.toBeVisible();
  // Session-ID wurde durch sign_in() rotiert – neue Session speichern
  await page.context().storageState({ path: AUTH_FILE });
}

// Globale Fragen (Anmeldungsangaben) brauchen einen Disclosure-Wert
async function setQuestionDisclosures(page: Page) {
  await page.locator('a[href="#application_questions"]').click();
  const radios = page.locator('input[name*="application_questions"][name*="disclosure"][value="optional"]');
  const count = await radios.count();
  for (let i = 0; i < count; i++) {
    await radios.nth(i).check();
  }
}

async function createAnlassTemplate(page: Page, groupId: number, name: string, { inherit = false } = {}) {
  await page.goto(`/groups/${groupId}/event_templates`);
  await page.getByRole('link', { name: 'Anlass Vorlage erstellen' }).click();
  await page.locator('#event_name').fill(name);
  await page.locator('#event_description').fill(`Beschreibung aus ${name}`);
  if (inherit) await page.locator('#event_inherit').check();
  await setEventContact(page);
  await setQuestionDisclosures(page);
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/event_templates$`));
  await expect(templateRow(page, name)).toBeVisible();
}

function templateRow(page: Page, name: string) {
  return page.locator('table tr').filter({ hasText: name });
}

// Löscht alle Vorlagen mit diesem Namen (auch Überbleibsel abgebrochener Läufe)
async function deleteTemplates(page: Page, groupId: number, name: string) {
  await page.goto(`/groups/${groupId}/event_templates`);
  while ((await templateRow(page, name).count()) > 0) {
    page.once('dialog', (dialog) => dialog.accept());
    await templateRow(page, name).first().locator('a[data-method="delete"]').click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
  }
}

async function openNewAnlassDropdown(page: Page, groupId: number) {
  await page.goto(`/groups/${groupId}/events`);
  const dropdown = page.locator('.btn-group.dropdown', { hasText: 'Anlass erstellen' });
  await dropdown.locator('.dropdown-toggle').click();
  return dropdown.locator('.dropdown-menu');
}

test.describe('Eventvorlagen', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await stopImpersonation(page);
    }
  });

  test('Vorlage erstellen, Anlass daraus erstellen und Vorlage löschen (als E2E AL)', async ({ page }) => {
    const templateName = 'E2E Anlass-Vorlage';
    await impersonate(page, JUNGSCHAR_ID, E2E_AL_PERSON_ID);
    await deleteTemplates(page, JUNGSCHAR_ID, templateName);

    // Einstieg über das Bearbeiten-Dropdown der Gruppe
    await page.goto(`/groups/${JUNGSCHAR_ID}`);
    await page.locator('#dropdown_group_edit a.dropdown-toggle').click();
    await page.getByRole('link', { name: 'Eventvorlagen' }).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${JUNGSCHAR_ID}/event_templates$`));

    await createAnlassTemplate(page, JUNGSCHAR_ID, templateName);
    await page.screenshot({ path: 'screenshots/eventvorlagen_liste.png' });

    // Vorlagen erscheinen nicht in der Anlass-Liste
    await page.goto(`/groups/${JUNGSCHAR_ID}/events`);
    await expect(page.locator('table')).not.toContainText(templateName);

    // Anlass aus Vorlage erstellen: Werte werden übernommen, Daten müssen neu gesetzt werden
    const menu = await openNewAnlassDropdown(page, JUNGSCHAR_ID);
    await page.screenshot({ path: 'screenshots/eventvorlagen_anlass_dropdown.png' });
    await menu.getByRole('link', { name: templateName }).click();
    await expect(page).toHaveURL(/\/events\/new\?source_id=\d+/);
    await expect(page.locator('#event_name')).toHaveValue(templateName);
    await expect(page.locator('#event_description')).toHaveValue(`Beschreibung aus ${templateName}`);
    await page.locator('#event_name').fill('E2E Anlass aus Vorlage');
    await page.locator('a[href="#dates"]').click();
    const startAtInput = page.locator('input[id$="_start_at_date"]').first();
    await startAtInput.pressSequentially('01.06.2027');
    await startAtInput.blur();
    await page.getByRole('button', { name: 'Speichern' }).first().click();

    await expect(page).toHaveURL(/\/events\/\d+$/);
    const eventId = parseInt(page.url().match(/\/events\/(\d+)/)![1]);
    await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E Anlass aus Vorlage');
    await expect(page.locator('body')).toContainText(`Beschreibung aus ${templateName}`);
    await page.screenshot({ path: 'screenshots/eventvorlagen_anlass_erstellt.png' });

    // Cleanup: Anlass und Vorlage löschen
    await page.goto(`/groups/${JUNGSCHAR_ID}/events/${eventId}`);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: /^Löschen$/i }).click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
    await deleteTemplates(page, JUNGSCHAR_ID, templateName);
    await expect(templateRow(page, templateName)).toHaveCount(0);
  });

  test('Bestehenden Anlass als Vorlage speichern (als E2E AL)', async ({ page }) => {
    const templateName = 'E2E Vorlage aus Anlass';
    await impersonate(page, JUNGSCHAR_ID, E2E_AL_PERSON_ID);
    await deleteTemplates(page, JUNGSCHAR_ID, templateName);

    await page.goto(`/groups/${JUNGSCHAR_ID}/events/${API_ANLASS_ID}`);
    await page.getByRole('link', { name: 'Als Vorlage speichern' }).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${JUNGSCHAR_ID}/event_templates/new\\?.*source_id=${API_ANLASS_ID}`));
    await expect(page.locator('#event_name')).toHaveValue('E2E API Anlass');
    await page.locator('#event_name').fill(templateName);
    await setEventContact(page);
    await page.getByRole('button', { name: 'Speichern' }).first().click();

    await expect(page).toHaveURL(new RegExp(`/groups/${JUNGSCHAR_ID}/event_templates$`));
    await expect(templateRow(page, templateName)).toContainText('Anlass');
    await page.screenshot({ path: 'screenshots/eventvorlagen_aus_anlass.png' });

    // Quelle bleibt unverändert
    await page.goto(`/groups/${JUNGSCHAR_ID}/events/${API_ANLASS_ID}`);
    await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E API Anlass');

    await deleteTemplates(page, JUNGSCHAR_ID, templateName);
  });

  test('Kurs als Vorlage speichern und Kurs daraus erstellen (als E2E Mio Admin)', async ({ page }) => {
    const templateName = 'E2E Kurs-Vorlage';
    await impersonate(page, MIO_ID, E2E_MIO_ADMIN_PERSON_ID);
    await deleteTemplates(page, MIO_ID, templateName);

    // Cevi-Pflichtfelder (Kursart, Geschäftsstelle) kommen aus der Quelle; die
    // Quelle hat keine Kontaktperson, darum setzen
    await page.goto(`/groups/${MIO_ID}/events/${API_KURS_ID}`);
    await page.getByRole('link', { name: 'Als Vorlage speichern' }).click();
    await page.locator('#event_name').fill(templateName);
    await setEventContact(page);
    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/groups/${MIO_ID}/event_templates$`));
    await expect(templateRow(page, templateName)).toContainText('Kurs');

    // Kurs aus Vorlage über das Dropdown von "Kurs erstellen"
    await page.goto(`/groups/${MIO_ID}/events/course`);
    const dropdown = page.locator('.btn-group.dropdown', { hasText: 'Kurs erstellen' });
    await dropdown.locator('.dropdown-toggle').click();
    await dropdown.locator('.dropdown-menu').getByRole('link', { name: templateName }).click();
    await expect(page).toHaveURL(/\/events\/new\?source_id=\d+/);
    await expect(page.locator('#event_name')).toHaveValue(templateName);
    await expect(page.locator('#event_kind_id option:checked')).toHaveText(/GLK1/);
    await page.locator('#event_name').fill('E2E Kurs aus Vorlage');
    await page.locator('a[href="#dates"]').click();
    const startAtInput = page.locator('input[id$="_start_at_date"]').first();
    await startAtInput.pressSequentially('01.06.2027');
    await startAtInput.blur();
    await page.getByRole('button', { name: 'Speichern' }).first().click();

    await expect(page).toHaveURL(/\/events\/\d+$/);
    await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E Kurs aus Vorlage');
    await page.screenshot({ path: 'screenshots/eventvorlagen_kurs_erstellt.png' });

    // Cleanup
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: /^Löschen$/i }).click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
    await deleteTemplates(page, MIO_ID, templateName);
  });

  test('Vererbte Vorlage steht auf untergeordneter Ebene zur Verfügung', async ({ page }) => {
    const inherited = 'E2E Vorlage vererbt';
    const local = 'E2E Vorlage nur Mio';

    // Als E2E Mio Admin zwei Vorlagen in E2E Mio erstellen: eine mit, eine ohne Vererbung
    await impersonate(page, MIO_ID, E2E_MIO_ADMIN_PERSON_ID);
    await deleteTemplates(page, MIO_ID, inherited);
    await deleteTemplates(page, MIO_ID, local);
    await createAnlassTemplate(page, MIO_ID, inherited, { inherit: true });
    await createAnlassTemplate(page, MIO_ID, local);
    await expect(templateRow(page, inherited)).toContainText('ja');
    await expect(templateRow(page, local)).toContainText('nein');
    await stopImpersonation(page);

    // E2E AL sieht in E2E Jungschar nur die vererbte Vorlage
    await impersonate(page, JUNGSCHAR_ID, E2E_AL_PERSON_ID);
    const menu = await openNewAnlassDropdown(page, JUNGSCHAR_ID);
    await expect(menu.getByRole('link', { name: inherited })).toBeVisible();
    await expect(menu.getByRole('link', { name: local })).toHaveCount(0);
    await page.screenshot({ path: 'screenshots/eventvorlagen_vererbt.png' });
    // Vererbte Vorlagen sind auf der unteren Ebene nicht verwaltbar
    await page.goto(`/groups/${JUNGSCHAR_ID}/event_templates`);
    await expect(templateRow(page, inherited)).toHaveCount(0);
    await stopImpersonation(page);

    // Cleanup
    await impersonate(page, MIO_ID, E2E_MIO_ADMIN_PERSON_ID);
    await deleteTemplates(page, MIO_ID, inherited);
    await deleteTemplates(page, MIO_ID, local);
    await stopImpersonation(page);
  });
});
