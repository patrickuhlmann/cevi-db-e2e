import { test, expect, Page } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';

// Seit hitobito/hitobito#4517 können Admins beim CSV-Import eine Spalte der
// Personennummer (people.id) zuordnen. Personen werden dann ausschliesslich über
// die ID gefunden (aktualisiert) bzw. mit dieser ID neu erstellt.

const TEAM_GROUP_ID = 585; // E2E Team
const ROLE = 'Mitarbeiter/-in';
const E2E_LEITER_PERSON_ID = 3550; // hat bereits die Rolle Mitarbeiter/-in in E2E Team
const E2E_AL_PERSON_ID = 3552;
const NEW_PERSON_LAST_NAME = 'CSV-Import';

async function uploadCsv(page: Page, csv: string) {
  await page.goto(`/groups/${TEAM_GROUP_ID}/csv_imports/new`);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.getByRole('button', { name: 'Hochladen' }).click();
  await expect(page).toHaveURL(/\/csv_imports\/define_mapping/);
}

async function preview(page: Page, { override = false } = {}) {
  if (override) {
    await page.locator('input[name="update_behaviour"][value="override"]').check();
  }
  await page.locator('#role_type').selectOption({ label: ROLE });
  await page.getByRole('button', { name: 'Vorschau' }).first().click();
  await expect(page).toHaveURL(/\/csv_imports\/preview/);
}

async function importNow(page: Page) {
  await page.getByRole('button', { name: 'Personen jetzt importieren' }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${TEAM_GROUP_ID}/people`));
}

function profession(page: Page) {
  return page.locator('dt', { hasText: /^Beruf\/Klasse$/ }).locator('xpath=following-sibling::dd[1]');
}

async function deletePerson(page: Page, personId: number) {
  await page.goto(`/groups/${TEAM_GROUP_ID}/people/${personId}`);
  page.once('dialog', (dialog) => dialog.accept());
  // Person-Löschen-Button (nicht die "Löschen"-Icons der Rollen)
  await page.locator('a.btn-danger[data-method="delete"]', { hasText: 'Löschen' }).click();
  await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
}

// ID der Testperson aus der Personenliste von E2E Team (oder undefined)
async function findNewPersonId(page: Page) {
  await page.goto(`/groups/${TEAM_GROUP_ID}/people`);
  const link = page.locator('table').getByRole('link', { name: `${NEW_PERSON_LAST_NAME} E2E` });
  if ((await link.count()) === 0) return undefined;
  return parseInt((await link.first().getAttribute('href'))!.match(/\/people\/(\d+)/)![1]);
}

test.describe('CSV-Import mit Personennummer', () => {
  test('Bestehende Person über die Personennummer aktualisieren', async ({ page }) => {
    await uploadCsv(page, `Personennummer;Vorname;Nachname;Beruf/Klasse\n${E2E_LEITER_PERSON_ID};E2E;Leiter;E2E CSV-Import\n`);

    // Spalte "Personennummer" wird automatisch der Personennummer zugeordnet
    await expect(page.locator('select[name="field_mappings[Personennummer]"]')).toHaveValue('id');
    await preview(page, { override: true });
    await expect(page.locator('.alert-warning')).toContainText('Die Duplikaterkennung ist deaktiviert');
    await expect(page.locator('#flash')).toContainText(`1 Person (${ROLE}) wird aktualisiert.`);
    await page.screenshot({ path: 'screenshots/csv-import_vorschau_aktualisieren.png' });

    await importNow(page);
    await expect(page.locator('#flash .alert-success')).toContainText(`1 Person (${ROLE}) wurde erfolgreich aktualisiert.`);

    await page.goto(`/groups/${TEAM_GROUP_ID}/people/${E2E_LEITER_PERSON_ID}`);
    await expect(profession(page)).toHaveText('E2E CSV-Import');
    await page.screenshot({ path: 'screenshots/csv-import_aktualisiert.png' });

    // Cleanup: Beruf/Klasse wieder leeren
    await page.goto(`/groups/${TEAM_GROUP_ID}/people/${E2E_LEITER_PERSON_ID}/edit`);
    await page.locator('#person_profession').fill('');
    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await expect(profession(page)).toHaveText('');
  });

  test('Neue Person mit vorgegebener Personennummer erstellen', async ({ page }) => {
    // Überbleibsel eines abgebrochenen Laufs entfernen
    const leftoverId = await findNewPersonId(page);
    if (leftoverId) await deletePerson(page, leftoverId);

    // Freie Personennummer beschaffen, ohne die ID-Sequenz zu verschieben: Person
    // normal importieren (bekommt die nächste ID) und wieder löschen.
    await uploadCsv(page, `Vorname;Nachname\nE2E;${NEW_PERSON_LAST_NAME}\n`);
    await preview(page);
    await importNow(page);
    const freeId = (await findNewPersonId(page))!;
    expect(freeId).toBeGreaterThan(0);
    await deletePerson(page, freeId);

    // Import mit dieser Personennummer erstellt die Person mit genau dieser ID
    await uploadCsv(page, `Personennummer;Vorname;Nachname\n${freeId};E2E;${NEW_PERSON_LAST_NAME}\n`);
    await preview(page);
    await expect(page.locator('#flash')).toContainText(`1 Person (${ROLE}) wird neu importiert.`);
    await importNow(page);
    await expect(page.locator('#flash .alert-success')).toContainText(`1 Person (${ROLE}) wurde erfolgreich importiert.`);

    await page.goto(`/groups/${TEAM_GROUP_ID}/people/${freeId}`);
    await expect(page.locator('main h1, #main-content h1').first()).toContainText(`E2E ${NEW_PERSON_LAST_NAME}`);
    await page.screenshot({ path: 'screenshots/csv-import_neu_mit_id.png' });

    await deletePerson(page, freeId);
  });

  test('Doppelte Personennummer bricht den Import ab', async ({ page }) => {
    await uploadCsv(
      page,
      `Personennummer;Vorname;Nachname;Beruf/Klasse\n` +
        `${E2E_LEITER_PERSON_ID};E2E;Leiter;E2E Doppelt\n${E2E_LEITER_PERSON_ID};E2E;Leiter;E2E Doppelt\n`,
    );
    await preview(page, { override: true });
    await expect(page.locator('#flash .alert-danger')).toContainText(`ID mehrmals vergeben: ${E2E_LEITER_PERSON_ID}`);
    await expect(page.locator('body')).toContainText('Keine Einträge gefunden');
    await page.screenshot({ path: 'screenshots/csv-import_doppelte_id.png' });

    await importNow(page);
    await expect(page.locator('#flash .alert-danger')).toContainText(`ID mehrmals vergeben: ${E2E_LEITER_PERSON_ID}`);
    // Nichts importiert (die Erfolgsmeldung "1 Person … wurde erfolgreich aktualisiert"
    // erscheint trotzdem – Bug hitobito/hitobito#4611)
    await page.goto(`/groups/${TEAM_GROUP_ID}/people/${E2E_LEITER_PERSON_ID}`);
    await expect(profession(page)).toHaveText('');
  });
});

test.describe('CSV-Import ohne Admin-Berechtigung (als E2E AL)', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await page.getByRole('link', { name: 'Imitation beenden' }).click();
      await expect(page.locator('.user-impersonation')).not.toBeVisible();
      // Session-ID wurde durch sign_in() rotiert – neue Session speichern
      await page.context().storageState({ path: AUTH_FILE });
    }
  });

  test('Personennummer kann nicht zugeordnet werden', async ({ page }) => {
    await page.goto(`/groups/584/people/${E2E_AL_PERSON_ID}`);
    await page.getByRole('link', { name: 'Imitieren' }).click();
    await expect(page.locator('.user-impersonation')).toBeVisible();

    await uploadCsv(page, `Personennummer;Vorname;Nachname\n${E2E_LEITER_PERSON_ID};E2E;Leiter\n`);
    const mapping = page.locator('select[name="field_mappings[Personennummer]"]');
    await expect(mapping.locator('option[value="id"]')).toHaveCount(0);
    await expect(mapping).not.toHaveValue('id');
    await expect(page.locator('select[name="field_mappings[Vorname]"] option[value="first_name"]')).toHaveCount(1);
    await page.screenshot({ path: 'screenshots/csv-import_ohne_admin.png' });
  });
});
