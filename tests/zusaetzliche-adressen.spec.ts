import { test, expect, Page } from '@playwright/test';

// Seit hitobito/hitobito#4471 sind zusätzliche Adressen
// in allen Wagons aktiviert – auch für Personen und Gruppen in cevi.db.

const GROUP_ID = 584;
const E2E_AL_PERSON_ID = 3552;

// Die Testadressen werden über die Strasse identifiziert: das Feld "Bezeichnung"
// wird beim Speichern verworfen (siehe docs/ui-testing.md).
const PERSON_STREET = 'Bahnhofstrasse';
const GROUP_STREET = 'Kasernenstrasse';

function additionalAddressesForm(page: Page) {
  return page.locator('.nested-form[data-nested-form-assoc-value="additional_addresses"]');
}

// Entfernt alle zusätzlichen Adressen mit der gegebenen Strasse im offenen
// Bearbeiten-Formular (bestehende Einträge haben den Wert als value-Attribut).
async function removeAdditionalAddress(page: Page, street: string) {
  const rows = additionalAddressesForm(page)
    .locator('.labeled.controls')
    .filter({ has: page.locator(`input[name$="[street]"][value="${street}"]`) });
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    await rows.nth(i).locator('.remove_nested_fields').click();
  }
  return count;
}

async function addAdditionalAddress(
  page: Page,
  address: { category: string; street: string; housenumber: string; zip: string; town: string },
) {
  const form = additionalAddressesForm(page);
  await form.getByRole('link', { name: 'Eintrag hinzufügen' }).click();
  const fields = form.locator('.address-input-fields').last();
  await fields.locator('select[name$="[category_id]"]').selectOption({ label: address.category });
  await fields.locator('input[name$="[public]"][type="checkbox"]').check();
  await fields.locator('input[name$="[street]"]').fill(address.street);
  await fields.locator('input[name$="[housenumber]"]').fill(address.housenumber);
  await fields.locator('input[name$="[zip_code]"]').fill(address.zip);
  await fields.locator('input[name$="[town]"]').fill(address.town);
  // Land ist Pflicht und ein Tom-Select-Widget (natives <select> ist versteckt)
  const countryId = await fields.locator('select[name$="[country]"]').getAttribute('id');
  await page.locator(`#${countryId}-ts-control`).click();
  await page.locator(`#${countryId}-ts-dropdown [data-value="CH"]`).first().click();
  return fields;
}

test.describe('Zusätzliche Adressen', () => {
  test('Zusätzliche Adresse bei Person erfassen und entfernen', async ({ page }) => {
    const editUrl = `/groups/${GROUP_ID}/people/${E2E_AL_PERSON_ID}/edit`;
    await page.goto(editUrl);

    // Überbleibsel eines abgebrochenen Laufs entfernen
    if ((await removeAdditionalAddress(page, PERSON_STREET)) > 0) {
      await page.getByRole('button', { name: 'Speichern' }).first().click();
      await expect(page.locator('#flash .alert-success')).toBeVisible();
      await page.goto(editUrl);
    }

    await expect(additionalAddressesForm(page)).toBeVisible();
    await addAdditionalAddress(page, {
      category: 'Andere',
      street: PERSON_STREET,
      housenumber: '12',
      zip: '5000',
      town: 'Aarau',
    });
    await page.screenshot({ path: 'screenshots/zusaetzliche-adressen_person_formular.png' });
    await page.getByRole('button', { name: 'Speichern' }).first().click();

    await expect(page).toHaveURL(new RegExp(`/people/${E2E_AL_PERSON_ID}$`));
    await expect(page.locator('#flash .alert-success')).toBeVisible();
    // Name wird von der Person übernommen ("Name übernehmen" ist standardmässig aktiv)
    const address = page.locator('address').first();
    await expect(address).toContainText('E2E AL, Bahnhofstrasse 12, 5000 Aarau');
    // Angezeigt wird nur die Kategorie, nicht die Bezeichnung
    await expect(address).toContainText('Aarau Andere');
    // Zusätzliche Adressen stehen direkt nach der Hauptadresse, vor den E-Mail-Adressen
    const addressText = (await address.textContent()) ?? '';
    expect(addressText.indexOf('Bahnhofstrasse 12')).toBeLessThan(addressText.indexOf('e2e-al@uhlme.ch'));
    await page.screenshot({ path: 'screenshots/zusaetzliche-adressen_person_erstellt.png' });

    // Entfernen
    await page.goto(editUrl);
    expect(await removeAdditionalAddress(page, PERSON_STREET)).toBe(1);
    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await expect(page.locator('#flash .alert-success')).toBeVisible();
    await expect(page.locator('address').first()).not.toContainText('Bahnhofstrasse 12');
    await page.screenshot({ path: 'screenshots/zusaetzliche-adressen_person_entfernt.png' });
  });

  test('Zusätzliche Adresse mit abweichendem Namen bei Gruppe erfassen und entfernen', async ({ page }) => {
    const editUrl = `/groups/${GROUP_ID}/edit`;
    // Zusätzliche Adressen liegen im Tab "Kontaktangaben" des Gruppenformulars
    const openEdit = async () => {
      await page.goto(editUrl);
      await page.getByRole('tab', { name: 'Kontaktangaben' }).click();
    };
    await openEdit();

    if ((await removeAdditionalAddress(page, GROUP_STREET)) > 0) {
      await page.getByRole('button', { name: 'Speichern' }).first().click();
      await expect(page.locator('#flash .alert-success')).toBeVisible();
      await openEdit();
    }

    await expect(additionalAddressesForm(page)).toBeVisible();
    const fields = await addAdditionalAddress(page, {
      category: 'Rechnungsadresse',
      street: GROUP_STREET,
      housenumber: '7',
      zip: '5000',
      town: 'Aarau',
    });
    // "Name übernehmen" abwählen → Namensfelder werden eingeblendet
    const firstName = fields.locator('input[name$="[first_name]"]');
    await expect(firstName).toBeHidden();
    await fields.locator('input[name$="[uses_contactable_name]"][type="checkbox"]').uncheck();
    await expect(firstName).toBeVisible();
    await firstName.fill('Erika');
    await fields.locator('input[name$="[last_name]"]').fill('Kassier');
    await page.screenshot({ path: 'screenshots/zusaetzliche-adressen_gruppe_formular.png' });
    await page.getByRole('button', { name: 'Speichern' }).first().click();

    await expect(page).toHaveURL(new RegExp(`/groups/${GROUP_ID}$`));
    await expect(page.locator('#flash .alert-success')).toBeVisible();
    const address = page.locator('address').first();
    await expect(address).toContainText('Erika Kassier, Kasernenstrasse 7, 5000 Aarau');
    await expect(address).toContainText('Aarau Rechnungsadresse');
    await page.screenshot({ path: 'screenshots/zusaetzliche-adressen_gruppe_erstellt.png' });

    // Entfernen
    await openEdit();
    expect(await removeAdditionalAddress(page, GROUP_STREET)).toBe(1);
    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await expect(page.locator('#flash .alert-success')).toBeVisible();
    await expect(page.locator('address').first()).not.toContainText('Kasernenstrasse 7');
    await page.screenshot({ path: 'screenshots/zusaetzliche-adressen_gruppe_entfernt.png' });
  });
});
