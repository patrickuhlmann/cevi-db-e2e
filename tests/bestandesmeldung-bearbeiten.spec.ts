import { test, expect, Page } from '@playwright/test';

// Seit hitobito_cevi 55a4959 (hitobito#4470) ist das Formular zum Bearbeiten der
// Mitgliederzahlen ein Nested-Form: bestehende Jahrgänge als Zeilen, neue über
// "Eintrag hinzufügen". Bearbeiten dürfen nur Personen mit layer_and_below_full in
// einer übergeordneten Ebene (hier der Admin des Dachverbands).

const GROUP_ID = 584; // E2E Jungschar
const CENSUS_URL = `/groups/${GROUP_ID}/census/group`;
const EDIT_URL = `/groups/${GROUP_ID}/member_counts/edit`;

// Jahrgänge weit weg von echten Mitgliedern, damit sie eindeutig als Testdaten erkennbar sind
const BORN_IN_A = '2015';
const BORN_IN_B = '2016';

function countRow(page: Page, bornIn: string) {
  return page.locator('#main-content table tr, #main table tr')
    .filter({ has: page.locator('td', { hasText: new RegExp(`^${bornIn}$`) }) });
}

function totalRow(page: Page) {
  return page.locator('#main-content table tr, #main table tr')
    .filter({ has: page.locator('td, th', { hasText: /^Total$/ }) }).last();
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Gruppe aktualisieren' }).first().click();
}

// Löscht alle Mitgliederzahlen der aktuellen Bestandesmeldung von E2E Jungschar
async function deleteCounts(page: Page) {
  await page.goto(CENSUS_URL);
  const deleteLink = page.getByRole('link', { name: 'Löschen' });
  if ((await countRow(page, BORN_IN_A).count()) + (await countRow(page, BORN_IN_B).count()) === 0) {
    return;
  }
  page.once('dialog', (dialog) => dialog.accept());
  await deleteLink.click();
  await expect(page.locator('#flash .alert-success')).toContainText(/wurden erfolgreich gelöscht/);
}

test.describe('Bestandesmeldung bearbeiten', () => {
  test('Mitgliederzahlen erfassen, ändern und löschen (als Admin)', async ({ page }) => {
    await deleteCounts(page);

    // Neue Jahrgänge erfassen
    await page.goto(EDIT_URL);
    const year = await page.locator('input#year').inputValue();
    await expect(page.locator('main h1, #main-content h1').first()).toContainText(year);
    const rows = page.locator('#current_member_counts_fields tr.fields');
    await expect(rows).toHaveCount(0);

    const addLink = page.getByRole('link', { name: 'Eintrag hinzufügen' });
    await addLink.click();
    await rows.nth(0).locator('input[name$="[born_in]"]').fill(BORN_IN_A);
    await rows.nth(0).locator('input[name$="[person_f]"]').fill('3');
    await rows.nth(0).locator('input[name$="[person_m]"]').fill('2');
    await addLink.click();
    await rows.nth(1).locator('input[name$="[born_in]"]').fill(BORN_IN_B);
    await rows.nth(1).locator('input[name$="[person_f]"]').fill('1');
    await rows.nth(1).locator('input[name$="[person_m]"]').fill('0');
    await page.screenshot({ path: 'screenshots/bestandesmeldung-bearbeiten_formular.png' });
    await save(page);

    await expect(page.locator('#flash .alert-success'))
      .toContainText(`Die Mitgliederzahlen für ${year} wurden erfolgreich gespeichert`);
    await expect(countRow(page, BORN_IN_A).locator('td')).toHaveText([BORN_IN_A, '3', '2', '5', '']);
    await expect(countRow(page, BORN_IN_B).locator('td')).toHaveText([BORN_IN_B, '1', '-', '1', '']);
    await expect(totalRow(page)).toContainText('6');
    await page.screenshot({ path: 'screenshots/bestandesmeldung-bearbeiten_gespeichert.png' });

    // Bestehende Jahrgänge erscheinen als Zeilen, der Jahrgang ist nicht mehr änderbar
    await page.goto(EDIT_URL);
    await expect(rows).toHaveCount(2);
    const rowA = rows.filter({ hasText: BORN_IN_A });
    await expect(rowA.locator('input[name$="[born_in]"]')).toHaveCount(0);
    await expect(rowA.locator('input[name$="[person_f]"]')).toHaveValue('3');

    // Ungültiger Wert: nichts wird gespeichert. Die Fehlermeldung ("Nicht alle Jahrgänge
    // konnten gespeichert werden …") erscheint nicht: Der Server rendert das Formular mit
    // Status 200 statt 422, Turbo verwirft die Antwort ("Form responses must redirect to
    // another location") und das Formular bleibt unverändert stehen (Bug).
    await rowA.locator('input[name$="[person_f]"]').fill('-1');
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST'),
      save(page),
    ]);
    expect(response.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${EDIT_URL}$`));
    await page.screenshot({ path: 'screenshots/bestandesmeldung-bearbeiten_fehler.png' });
    await page.goto(CENSUS_URL);
    await expect(countRow(page, BORN_IN_A).locator('td')).toHaveText([BORN_IN_A, '3', '2', '5', '']);

    // Gültigen Wert speichern
    await page.goto(EDIT_URL);
    await rows.filter({ hasText: BORN_IN_A }).locator('input[name$="[person_f]"]').fill('4');
    await save(page);
    await expect(page.locator('#flash .alert-success')).toContainText('erfolgreich gespeichert');
    await expect(countRow(page, BORN_IN_A).locator('td')).toHaveText([BORN_IN_A, '4', '2', '6', '']);
    await expect(totalRow(page)).toContainText('7');

    // Aufräumen
    await deleteCounts(page);
    await expect(countRow(page, BORN_IN_A)).toHaveCount(0);
    await expect(countRow(page, BORN_IN_B)).toHaveCount(0);
  });
});
