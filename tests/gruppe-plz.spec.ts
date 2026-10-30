import { test, expect, Page } from '@playwright/test';

// Seit hitobito_pfadi_de#86 ist die PLZ einer Gruppe ein Text statt einer Zahl.
// Führende Nullen (z.B. deutsche PLZ 01067) bleiben erhalten, und alphanumerische
// PLZ (z.B. Niederlande "1234 AB") sind möglich. Geprüft wird die PLZ je nach Land.

const GROUP_ID = 584; // E2E Jungschar, hat keine eigene Adresse
const GROUP_URL = `/groups/${GROUP_ID}`;

async function openContactTab(page: Page) {
  await page.goto(`${GROUP_URL}/edit`);
  await page.getByRole('tab', { name: 'Kontaktangaben' }).click();
}

async function selectCountry(page: Page, countryCode: string) {
  await page.locator('.ts-control:has(#group_country-ts-control)').click();
  await page.locator(`#group_country-ts-dropdown [data-value="${countryCode}"]`).first().click();
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page.locator('#flash .alert-success')).toContainText(/erfolgreich aktualisiert/);
}

async function setAddress(page: Page, address: { country: string; zip: string; town: string }) {
  await openContactTab(page);
  await page.locator('#group_street').fill('E2E-Strasse');
  await selectCountry(page, address.country);
  await page.locator('#group_zip_code').fill(address.zip);
  await page.locator('#group_town').fill(address.town);
  await save(page);
}

async function clearAddress(page: Page) {
  await openContactTab(page);
  await page.locator('#group_street').fill('');
  await page.locator('#group_zip_code').fill('');
  await page.locator('#group_town').fill('');
  await page.locator('#group_country').evaluate((el: any) => el.tomselect.clear());
  await save(page);
}

test.describe('PLZ von Gruppen', () => {
  test('Führende Null und alphanumerische PLZ werden gespeichert (als Admin)', async ({ page }) => {
    await clearAddress(page);

    await setAddress(page, { country: 'DE', zip: '01067', town: 'Dresden' });
    await expect(page.locator('body')).toContainText('01067 Dresden');
    await page.screenshot({ path: 'screenshots/gruppe-plz_fuehrende_null.png' });

    await setAddress(page, { country: 'NL', zip: '1234 AB', town: 'Amsterdam' });
    await expect(page.locator('body')).toContainText('1234 AB Amsterdam');
    await page.screenshot({ path: 'screenshots/gruppe-plz_alphanumerisch.png' });

    // Die PLZ wird je nach Land geprüft: eine niederländische PLZ ist in der Schweiz ungültig
    await openContactTab(page);
    await selectCountry(page, 'CH');
    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await expect(page.locator('#error_explanation')).toContainText('PLZ');

    await clearAddress(page);
    await expect(page.locator('body')).not.toContainText('E2E-Strasse');
  });
});
