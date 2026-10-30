import { test, expect } from '@playwright/test';
import * as fs from 'fs';

// Seit hitobito_zss#8 wird die Personennummer (people.id) auf der Person
// angezeigt und ist im Export "Alle Angaben" enthalten.

const GROUP_ID = 584;
const E2E_AL_PERSON_ID = 3552;

test.describe('Personennummer', () => {
  test('Personennummer auf der Person anzeigen und exportieren', async ({ page }) => {
    await page.goto(`/groups/${GROUP_ID}/people/${E2E_AL_PERSON_ID}`);

    const number = page.locator('dt', { hasText: /^Personennummer$/ }).locator('xpath=following-sibling::dd[1]');
    await expect(number).toHaveText(String(E2E_AL_PERSON_ID));
    await number.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'screenshots/personennummer_angezeigt.png' });

    // Export → CSV → Alle Angaben (Einzelperson: synchroner Download)
    await page.locator('#dropdown_people_export > .dropdown-toggle').click();
    await page.locator('#dropdown_people_export').getByRole('link', { name: 'CSV', exact: true }).hover();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#dropdown_people_export').getByRole('link', { name: 'Alle Angaben' }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);

    // Personennummer ist neu die erste Spalte
    const csv = fs.readFileSync(await download.path(), 'utf-8').replace(/^﻿/, '');
    const [header, row] = csv.split(/\r?\n/).map((line) => line.split(';'));
    expect(header[0]).toBe('Personennummer');
    expect(row[0]).toBe(String(E2E_AL_PERSON_ID));
  });
});
