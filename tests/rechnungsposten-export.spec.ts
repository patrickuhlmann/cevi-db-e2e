import { test, expect, Page } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';
import * as fs from 'fs';

// Seit hitobito_florist#7 (hitobito `ef2af3ee`) gibt es in der Rechnungsliste unter
// Export → CSV/Excel neu "Rechnungsposten": eine Zeile pro Rechnungsposten, ergänzt
// um die Angaben der Rechnung (für den Import in Buchhaltungssoftware). Der Export
// läuft im Hintergrund, die Datei liegt danach in der Jobübersicht.

const GROUP_ID = 584;                 // E2E Jungschar
const E2E_FINANZEN_PERSON_ID = 3556;

const INVOICE_TITLE = 'E2E Rechnungsposten-Export';
const ITEMS = [
  { name: 'E2E Posten A', unitCost: '42.00', count: '1', total: '42.00' },
  { name: 'E2E Posten B', unitCost: '10.50', count: '2', total: '21.00' },
];

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

async function createInvoice(page: Page): Promise<number> {
  await page.goto(`/groups/${GROUP_ID}/invoices/new`);
  await page.getByLabel('Titel').fill(INVOICE_TITLE);
  await page.locator('input[name="invoice[recipient_first_name]"]').fill('E2E');
  await page.locator('input[name="invoice[recipient_last_name]"]').fill('Test-Empfänger');
  await page.locator('input[name="invoice[recipient_street]"]').fill('Teststrasse');
  await page.locator('input[name="invoice[recipient_housenumber]"]').fill('1');
  await page.locator('input[name="invoice[recipient_zip_code]"]').fill('8000');
  await page.locator('input[name="invoice[recipient_town]"]').fill('Zürich');
  await page.locator('#invoice_recipient_country-ts-control').click();
  await page.locator('#invoice_recipient_country-ts-dropdown [data-value="CH"]').first().click();
  for (const [i, item] of ITEMS.entries()) {
    await page.getByRole('link', { name: 'Eintrag hinzufügen' }).click();
    const fields = page.locator('#invoice_items_fields .fields:visible').nth(i);
    await fields.locator('input[placeholder="Name"]').fill(item.name);
    await fields.locator('input[placeholder="Preis"]').fill(item.unitCost);
    await fields.locator('input[placeholder="Anzahl"]').fill(item.count);
  }
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await page.waitForURL(/\/invoices\/\d+/);
  await expect(page.locator('#flash .alert-success')).toContainText(/erstellt/);
  return parseInt(page.url().match(/\/invoices\/(\d+)/)![1]);
}

// Storniert alle Testrechnungen mit diesem Titel (auch Überbleibsel abgebrochener
// Läufe). Stornierte Rechnungen erscheinen nicht mehr in der Liste.
async function cancelInvoices(page: Page) {
  const invoiceLinks = page.locator('table a', { hasText: INVOICE_TITLE });
  await page.goto(`/groups/${GROUP_ID}/invoices`);
  while ((await invoiceLinks.count()) > 0) {
    await invoiceLinks.first().click();
    await page.waitForURL(/\/invoices\/\d+$/);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: 'Stornieren' }).click();
    await expect(page.locator('#flash .alert-success')).toContainText(/storniert/);
    await page.goto(`/groups/${GROUP_ID}/invoices`);
  }
}

function newestJobId(ids: string[]): number {
  return Math.max(0, ...ids.map((id) => parseInt(id.replace('job_observation_', ''))));
}

// CSV mit ";" und Anführungszeichen; Zeilenumbrüche in Feldern (Adresse) beachten
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

test.describe('Rechnungsposten-Export', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await stopImpersonation(page);
    }
  });

  test('Export mit einer Zeile pro Rechnungsposten (als E2E Finanzen)', async ({ page }) => {
    await impersonate(page, E2E_FINANZEN_PERSON_ID);
    await cancelInvoices(page);
    const invoiceId = await createInvoice(page);

    await page.goto('/job_observations');
    const jobIdBefore = newestJobId(await page.locator('[id^="job_observation_"]').evaluateAll(
      (els) => els.map((el) => el.id)));

    // Nur die Testrechnung anwählen und exportieren
    await page.goto(`/groups/${GROUP_ID}/invoices`);
    await page.locator(`input[name="ids[]"][value="${invoiceId}"]`).check();
    await page.locator('.dropdown-toggle', { hasText: 'Export' }).click();
    await page.locator('.dropdown-menu a', { hasText: /^CSV$/ }).hover();
    await expect(page.locator('a[href*="invoices.csv?invoice_items=true"]')).toHaveText('Rechnungsposten');
    await page.screenshot({ path: 'screenshots/rechnungsposten_export_menu.png' });
    await page.locator('a[href*="invoices.csv?invoice_items=true"]').click();
    await expect(page.locator('#flash .alert-success, #flash .alert-info').first()).toBeVisible();

    // Auf den neuen Job warten, bis die Datei bereitliegt
    const newJob = page.locator('[id^="job_observation_"]').first();
    await expect(async () => {
      await page.goto('/job_observations');
      const id = newestJobId([await newJob.getAttribute('id') ?? '']);
      expect(id).toBeGreaterThan(jobIdBefore);
      await expect(newJob.locator('a[href$="/download"]')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30000 });
    await page.screenshot({ path: 'screenshots/rechnungsposten_export_job.png' });

    const downloadPromise = page.waitForEvent('download');
    await newJob.locator('a[href$="/download"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^rechnungsposten.*\.csv$/);
    const text = fs.readFileSync(await download.path(), 'utf-8').replace(/^﻿/, '');
    const [header, ...rows] = parseCsv(text).filter((r) => r.length > 1);

    // Eine Zeile pro Posten, jeweils mit den Angaben der Rechnung
    expect(rows).toHaveLength(ITEMS.length);
    const col = (name: string) => {
      const index = header.indexOf(name);
      expect(index, `Spalte "${name}" fehlt`).toBeGreaterThanOrEqual(0);
      return index;
    };
    for (const [i, item] of ITEMS.entries()) {
      expect(rows[i][col('Name')]).toBe(item.name);
      expect(rows[i][col('Anzahl')]).toBe(item.count);
      expect(rows[i][col('Preis')]).toBe(item.unitCost);
      expect(rows[i][col('Total')]).toBe(item.total);
      expect(rows[i][col('Titel')]).toBe(INVOICE_TITLE);
    }

    await cancelInvoices(page);
    await stopImpersonation(page);
  });
});
