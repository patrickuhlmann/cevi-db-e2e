import { test, expect, Page } from '@playwright/test';

// Seit hitobito_oeku#12 (hitobito/hitobito#4481) ist "Kanton" ein Attribut
// der Person im Core. Es erscheint nur bei der Hauptadresse und nur, wenn als
// Land die Schweiz ausgewählt ist.

const GROUP_ID = 584;
const E2E_AL_PERSON_ID = 3552;
const EDIT_URL = `/groups/${GROUP_ID}/people/${E2E_AL_PERSON_ID}/edit`;

// Land und Kanton sind Tom-Select-Widgets (natives <select> ist versteckt).
// Geklickt wird der umgebende .ts-control-Container: ist bereits ein Wert gewählt,
// hat das innere Input (#…-ts-control) keine klickbare Fläche mehr.
async function selectTomSelect(page: Page, selectId: string, value: string) {
  await page.locator(`.ts-control:has(#${selectId}-ts-control)`).click();
  await page.locator(`#${selectId}-ts-dropdown [data-value="${value}"]`).first().click();
}

// Land leeren (Ausgangszustand von E2E AL). Tom-Select löst dabei wie bei einer
// Benutzereingabe ein change-Event auf dem nativen <select> aus.
async function clearCountry(page: Page) {
  await page.locator('#person_country').evaluate((el: any) => el.tomselect.clear());
}

// Detailseite: die Zeile "Kanton" wird immer angezeigt, ohne Wert mit leerem <dd>
function cantonValue(page: Page) {
  return page.locator('dt', { hasText: /^Kanton$/ }).locator('xpath=following-sibling::dd[1]');
}

function cantonLabel(page: Page) {
  return page.locator('label[for="person_canton-ts-control"]');
}

test.describe('Kanton', () => {
  test('Kanton erscheint nur bei Hauptadresse mit Land Schweiz', async ({ page }) => {
    await page.goto(EDIT_URL);

    // Zusätzliche Adressen haben kein Kantonsfeld, auch nicht mit Land Schweiz
    const additionalAddresses = page.locator('.nested-form[data-nested-form-assoc-value="additional_addresses"]');
    await additionalAddresses.getByRole('link', { name: 'Eintrag hinzufügen' }).click();
    const newAddress = additionalAddresses.locator('.address-input-fields').last();
    const additionalCountryId = await newAddress.locator('select[name$="[country]"]').getAttribute('id');
    await selectTomSelect(page, additionalCountryId!, 'CH');
    await expect(newAddress.locator('select[name$="[canton]"]')).toHaveCount(0);
    await expect(newAddress.getByText('Kanton')).toHaveCount(0);

    // Hauptadresse: ohne Land kein Kantonsfeld (räumt auch Überbleibsel eines abgebrochenen Laufs auf)
    await page.goto(EDIT_URL);
    await clearCountry(page);
    await expect(cantonLabel(page)).toBeHidden();

    // Land Schweiz → Kantonsfeld erscheint
    await selectTomSelect(page, 'person_country', 'CH');
    await expect(cantonLabel(page)).toBeVisible();
    await selectTomSelect(page, 'person_canton', 'ag');
    await page.screenshot({ path: 'screenshots/kanton_formular.png' });
    await page.getByRole('button', { name: 'Speichern' }).first().click();

    await expect(page).toHaveURL(new RegExp(`/people/${E2E_AL_PERSON_ID}$`));
    await expect(page.locator('#flash .alert-success')).toBeVisible();
    await expect(cantonValue(page)).toHaveText('Aargau');
    await page.screenshot({ path: 'screenshots/kanton_gespeichert.png' });

    // Anderes Land → Kantonsfeld verschwindet, Kanton wird geleert
    await page.goto(EDIT_URL);
    await expect(page.locator('#person_canton')).toHaveValue('ag');
    await selectTomSelect(page, 'person_country', 'DE');
    await expect(cantonLabel(page)).toBeHidden();
    await expect(page.locator('#person_canton')).toHaveValue('');
    await page.getByRole('button', { name: 'Speichern' }).first().click();

    await expect(page.locator('#flash .alert-success')).toBeVisible();
    await expect(cantonValue(page)).toHaveText('');
    await page.screenshot({ path: 'screenshots/kanton_ausland.png' });

    // Cleanup: Land wieder leeren (Ausgangszustand)
    await page.goto(EDIT_URL);
    await clearCountry(page);
    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await expect(page.locator('#flash .alert-success')).toBeVisible();
  });
});
