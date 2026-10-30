import { test, expect, Page } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';

// Seit hitobito_sww#296 (hitobito `2b07d03e`) heisst der Menüpunkt "Einzelrechnungen"
// neu "Rechnungen" und zeigt alle Rechnungen der Gruppe, auch die aus Rechnungsläufen.
// Über Checkboxen lässt sich nach Herkunft filtern: "Einzelrechnungen",
// "aus Rechnungsläufen", "aus Sammelrechnungen". Eine Checkbox erscheint nur, wenn es
// in der Gruppe Rechnungen dieser Herkunft gibt (in der Cevi keine Sammelrechnungen).

const GROUP_ID = 584;                 // E2E Jungschar
const E2E_FINANZEN_PERSON_ID = 3556;
const E2E_MAMI_PERSON_ID = 3553;
const E2E_ELTERN_GROUP_ID = 587;

const SINGLE_TITLE = 'E2E Herkunft Einzelrechnung';
const RUN_TITLE = 'E2E Herkunft Rechnungslauf';

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

// Die Herkunfts-Filter werden in der Session gemerkt (remember_params). Immer
// explizit mit beiden Checkboxen aktiv öffnen, sonst verfälscht ein abgebrochener
// Lauf die Rechnungsliste in anderen Specs.
async function openInvoices(page: Page) {
  await page.goto(`/groups/${GROUP_ID}/invoices?standalone=1&from_standalone_invoice_run=1`);
}

function invoiceRows(page: Page, title: string) {
  return page.locator('table tbody tr').filter({ hasText: title });
}

// Rechnungen eines Laufs gehen nur an Personen mit vollständiger Adresse, die
// übrigen überspringt hitobito stillschweigend. Keine der Testpersonen hatte eine
// Adresse, darum bekommt E2E Mami bei Bedarf eine (bleibt bestehen).
async function ensureMamiAddress(page: Page) {
  await page.goto(`/groups/${E2E_ELTERN_GROUP_ID}/people/${E2E_MAMI_PERSON_ID}/edit`);
  if ((await page.locator('#person_zip_code').inputValue()) !== '') return;
  await page.locator('#person_street').fill('Teststrasse');
  await page.locator('#person_housenumber').fill('2');
  await page.locator('#person_zip_code').fill('8000');
  await page.locator('#person_town').fill('Zürich');
  await page.locator('.ts-control:has(#person_country-ts-control)').click();
  await page.locator('#person_country-ts-dropdown [data-value="CH"]').first().click();
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page.locator('#flash .alert-success')).toBeVisible();
}

async function createSingleInvoice(page: Page) {
  await page.goto(`/groups/${GROUP_ID}/invoices/new`);
  await page.getByLabel('Titel').fill(SINGLE_TITLE);
  await page.locator('input[name="invoice[recipient_first_name]"]').fill('E2E');
  await page.locator('input[name="invoice[recipient_last_name]"]').fill('Test-Empfänger');
  await page.locator('input[name="invoice[recipient_street]"]').fill('Teststrasse');
  await page.locator('input[name="invoice[recipient_housenumber]"]').fill('1');
  await page.locator('input[name="invoice[recipient_zip_code]"]').fill('8000');
  await page.locator('input[name="invoice[recipient_town]"]').fill('Zürich');
  await page.locator('#invoice_recipient_country-ts-control').click();
  await page.locator('#invoice_recipient_country-ts-dropdown [data-value="CH"]').first().click();
  await page.getByRole('link', { name: 'Eintrag hinzufügen' }).click();
  await page.locator('#invoice_items_fields .fields:visible input[placeholder="Name"]').fill('E2E Einzelposten');
  await page.locator('#invoice_items_fields .fields:visible input[placeholder="Preis"]').fill('42.00');
  await page.locator('#invoice_items_fields .fields:visible input[placeholder="Anzahl"]').fill('1');
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await page.waitForURL(/\/invoices\/\d+/);
  await expect(page.locator('#flash .alert-success')).toContainText(/erstellt/);
}

// Rechnungslauf an E2E Mami (wie "Rechnung erstellen" mit mehreren Personen: ?ids=…)
async function createInvoiceRun(page: Page) {
  await page.goto(`/groups/${GROUP_ID}/invoice_run/new?ids=${E2E_MAMI_PERSON_ID}`);
  await page.getByLabel('Titel').fill(RUN_TITLE);
  await page.getByRole('link', { name: 'Eintrag hinzufügen' }).click();
  await page.locator('#invoice_items_fields .fields:visible input[placeholder="Name"]').fill('E2E Laufposten');
  await page.locator('#invoice_items_fields .fields:visible input[placeholder="Preis"]').fill('5.00');
  await page.locator('#invoice_items_fields .fields:visible input[placeholder="Anzahl"]').fill('1');
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page.locator('#flash .alert-success')).toContainText(`Rechnung ${RUN_TITLE} wurde erstellt.`);
  // Die Meldung kommt auch, wenn keine Rechnung entstanden ist (Empfänger ohne
  // Adresse). Darum den Betrag des Laufs prüfen.
  await page.goto(`/groups/${GROUP_ID}/invoice_runs`);
  await expect(page.locator('table tbody tr', { hasText: RUN_TITLE })).toContainText('5.00 CHF');
}

// Räumt Testrechnungen und Testläufe auf (auch Überbleibsel abgebrochener Läufe).
// Ein Lauf mit lauter Entwürfen lässt sich samt Rechnungen löschen.
async function cleanup(page: Page) {
  const runRows = page.locator('table tbody tr', { hasText: RUN_TITLE });
  await page.goto(`/groups/${GROUP_ID}/invoice_runs`);
  while ((await runRows.count()) > 0) {
    await runRows.first().locator('a[title="Löschen"]').click();
    await page.locator('.modal').getByRole('button', { name: 'Löschen' }).or(
      page.locator('.modal').getByRole('link', { name: 'Löschen' })).first().click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
    await page.goto(`/groups/${GROUP_ID}/invoice_runs`);
  }

  const singleLinks = page.locator('table a', { hasText: SINGLE_TITLE });
  await openInvoices(page);
  while ((await singleLinks.count()) > 0) {
    await singleLinks.first().click();
    await page.waitForURL(/\/invoices\/\d+$/);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: 'Stornieren' }).click();
    await expect(page.locator('#flash .alert-success')).toContainText(/storniert/);
    await openInvoices(page);
  }
}

test.describe('Rechnungen nach Herkunft filtern', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await openInvoices(page); // gemerkte Filter zurücksetzen
      await stopImpersonation(page);
    }
  });

  test('Einzelrechnungen und Rechnungen aus Läufen in einer Liste (als E2E Finanzen)', async ({ page }) => {
    await impersonate(page, E2E_FINANZEN_PERSON_ID);
    await cleanup(page);
    await ensureMamiAddress(page);
    await createSingleInvoice(page);
    await createInvoiceRun(page);

    // Menüpunkt heisst "Rechnungen" (früher "Einzelrechnungen")
    await openInvoices(page);
    const financeNav = page.locator('a', { hasText: /^Rechnungsläufe$/ }).locator('xpath=..').locator('..');
    await expect(financeNav.getByRole('link', { name: 'Rechnungen', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Einzelrechnungen' })).toHaveCount(0);

    // Beide Herkünfte in der Liste
    const standalone = page.getByRole('checkbox', { name: 'Einzelrechnungen' });
    const fromRun = page.getByRole('checkbox', { name: 'aus Rechnungsläufen' });
    await expect(standalone).toBeChecked();
    await expect(fromRun).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'aus Sammelrechnungen' })).toHaveCount(0);
    await expect(invoiceRows(page, SINGLE_TITLE)).toHaveCount(1);
    await expect(invoiceRows(page, RUN_TITLE)).toHaveCount(1);
    await page.screenshot({ path: 'screenshots/rechnungen_herkunft_alle.png', fullPage: true });

    // Nur Einzelrechnungen
    await fromRun.uncheck();
    await expect(page).toHaveURL(/from_standalone_invoice_run=0/);
    await expect(invoiceRows(page, SINGLE_TITLE)).toHaveCount(1);
    await expect(invoiceRows(page, RUN_TITLE)).toHaveCount(0);
    await page.screenshot({ path: 'screenshots/rechnungen_herkunft_einzel.png', fullPage: true });

    // Nur Rechnungen aus Rechnungsläufen
    await page.getByRole('checkbox', { name: 'aus Rechnungsläufen' }).check();
    await expect(page).toHaveURL(/from_standalone_invoice_run=1/);
    await page.getByRole('checkbox', { name: 'Einzelrechnungen' }).uncheck();
    await expect(page).toHaveURL(/standalone=0/);
    await expect(invoiceRows(page, SINGLE_TITLE)).toHaveCount(0);
    await expect(invoiceRows(page, RUN_TITLE)).toHaveCount(1);
    await page.screenshot({ path: 'screenshots/rechnungen_herkunft_lauf.png', fullPage: true });

    // Der Filter wird gemerkt und bei einer Rückkehr zur Liste (returning=true, z.B.
    // nach einem Export) wiederhergestellt, beim normalen Aufruf nicht
    await page.goto(`/groups/${GROUP_ID}/invoices?returning=true`);
    await expect(page.getByRole('checkbox', { name: 'Einzelrechnungen' })).not.toBeChecked();
    await expect(invoiceRows(page, SINGLE_TITLE)).toHaveCount(0);
    await page.goto(`/groups/${GROUP_ID}/invoices`);
    await expect(page.getByRole('checkbox', { name: 'Einzelrechnungen' })).toBeChecked();
    await expect(invoiceRows(page, SINGLE_TITLE)).toHaveCount(1);

    await cleanup(page);
    await stopImpersonation(page);
  });
});
