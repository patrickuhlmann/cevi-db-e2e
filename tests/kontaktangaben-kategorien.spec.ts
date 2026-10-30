import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

// Seit hitobito#4359 haben weitere E-Mails, Telefonnummern, Adressen und Social-Media-
// Konten eine feste Kategorie statt einer frei wählbaren Bezeichnung. hitobito_youth
// ergänzt für Telefon und E-Mail die Kategorien "Mutter" und "Vater" (je höchstens
// einmal pro Person). Der Personen-Export hat eine Spalte pro Kategorie.

const GROUP_ID = 585; // E2E Team
const E2E_LEITER_PERSON_ID = 3550;
const PERSON_URL = `/groups/${GROUP_ID}/people/${E2E_LEITER_PERSON_ID}`;

const PHONE = '079 000 00 01';
const PHONE_FORMATTED = '+41 79 000 00 01';
const PHONE_2 = '079 000 00 02';
const PHONE_LABEL = 'E2E Ergänzung';
const EMAIL = 'e2e-mutter@example.com';

function nestedForm(page: Page, assoc: string) {
  return page.locator(`.nested-form[data-nested-form-assoc-value="${assoc}"]`);
}

async function addEntry(page: Page, assoc: string, valueField: string, value: string, category: string) {
  const form = nestedForm(page, assoc);
  await form.getByRole('link', { name: 'Eintrag hinzufügen' }).click();
  const row = form.locator('.fields').last();
  await row.locator(`input[name$="[${valueField}]"]`).fill(value);
  await row.locator('select[name$="[category_id]"]').selectOption({ label: category });
  return row;
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Speichern' }).first().click();
}

// Entfernt die Testeinträge (Telefon/E-Mail) im Bearbeiten-Formular und speichert
async function removeTestEntries(page: Page) {
  await page.goto(`${PERSON_URL}/edit`);
  const rows = page.locator('.nested-form .fields').filter({
    has: page.locator(
      `input[name$="[number]"][value="${PHONE_FORMATTED}"], input[name$="[email]"][value="${EMAIL}"]`,
    ),
  });
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    await rows.nth(i).locator('.remove_nested_fields').click();
  }
  if (count > 0) {
    await save(page);
    await expect(page.locator('#flash .alert-success')).toContainText(/erfolgreich aktualisiert/);
  }
}

async function exportAllDetails(page: Page) {
  await page.goto(PERSON_URL);
  await page.locator('#dropdown_people_export > .dropdown-toggle').click();
  await page.locator('#dropdown_people_export').getByRole('link', { name: 'CSV', exact: true }).hover();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#dropdown_people_export').getByRole('link', { name: 'Alle Angaben' }).first().click();
  const csv = fs.readFileSync(await (await downloadPromise).path(), 'utf-8').replace(/^﻿/, '');
  const [header, row] = csv.split('\n');
  const columns = header.split(';');
  const values = row.split(';');
  return Object.fromEntries(columns.map((column, i) => [column, values[i]]));
}

test.describe('Kontaktangaben-Kategorien', () => {
  test('Telefonnummer und E-Mail der Mutter erfassen, anzeigen, exportieren (als Admin)', async ({ page }) => {
    await removeTestEntries(page);

    await page.goto(`${PERSON_URL}/edit`);
    const phoneRow = await addEntry(page, 'phone_numbers', 'number', PHONE, 'Mutter');
    await expect(phoneRow.locator('select[name$="[category_id]"] option'))
      .toHaveText(['Bitte auswählen', 'Mobil', 'Festnetz', 'Arbeit', 'Mutter', 'Vater', 'Andere']);
    await phoneRow.locator('input[name$="[label]"]').fill(PHONE_LABEL);
    const emailRow = await addEntry(page, 'additional_emails', 'email', EMAIL, 'Mutter');
    await expect(emailRow.locator('select[name$="[category_id]"] option'))
      .toHaveText(['Bitte auswählen', 'Privat', 'Arbeit', 'Rechnungsadresse', 'Mutter', 'Vater', 'Andere']);
    await page.screenshot({ path: 'screenshots/kontaktangaben-kategorien_formular.png' });
    await save(page);
    await expect(page.locator('#flash .alert-success')).toContainText(/erfolgreich aktualisiert/);

    // Anzeige: Kategorie hinter dem Wert, bei Telefon zusätzlich die Ergänzung
    await expect(page.locator('body')).toContainText(`${PHONE_FORMATTED} Mutter, ${PHONE_LABEL}`);
    await expect(page.locator('body')).toContainText(`${EMAIL} Mutter`);
    await page.screenshot({ path: 'screenshots/kontaktangaben-kategorien_anzeige.png' });

    // Export: eine Spalte pro Kategorie (Telefonnummer mit ' gegen Formel-Injection)
    const exported = await exportAllDetails(page);
    expect(exported['Telefonnummer Mutter']).toBe(`'${PHONE_FORMATTED}`);
    expect(exported['Weitere E-Mail Mutter']).toBe(EMAIL);
    expect(exported).toHaveProperty('Telefonnummer Vater', '');
    expect(exported).not.toHaveProperty('Weitere E-Mail Eltern');

    // "Mutter" gibt es pro Person nur einmal
    await page.goto(`${PERSON_URL}/edit`);
    await addEntry(page, 'phone_numbers', 'number', PHONE_2, 'Mutter');
    await save(page);
    await expect(page.locator('#error_explanation')).toContainText('Kategorie Mutter ist bereits vergeben');
    await page.screenshot({ path: 'screenshots/kontaktangaben-kategorien_doppelt.png' });

    await removeTestEntries(page);
    await page.goto(PERSON_URL);
    await expect(page.locator('body')).not.toContainText(PHONE_FORMATTED);
    await expect(page.locator('body')).not.toContainText(EMAIL);
  });
});
