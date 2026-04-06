import { test, expect } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';

const GROUP_ID = 584;
const E2E_FINANZEN_PERSON_ID = 3556;

async function impersonateFinanzen(page: any) {
  await page.goto(`/groups/${GROUP_ID}/people/${E2E_FINANZEN_PERSON_ID}`);
  await page.getByRole('link', { name: 'Imitieren' }).click();
  await expect(page.locator('.user-impersonation')).toBeVisible();
}

async function stopImpersonation(page: any) {
  await page.getByRole('link', { name: 'Imitation beenden' }).click();
  await expect(page.locator('.user-impersonation')).not.toBeVisible();
  await page.context().storageState({ path: AUTH_FILE });
}

async function createInvoice(page: any): Promise<string> {
  await page.goto(`/groups/${GROUP_ID}/invoices/new`);
  await page.getByLabel('Titel').fill('E2E Test-Rechnung');
  await page.locator('input[name="invoice[recipient_name]"]').fill('E2E Test-Empfänger');
  await page.locator('input[name="invoice[recipient_street]"]').fill('Teststrasse');
  await page.locator('input[name="invoice[recipient_housenumber]"]').fill('1');
  await page.locator('input[name="invoice[recipient_zip_code]"]').fill('8000');
  await page.locator('input[name="invoice[recipient_town]"]').fill('Zürich');
  await page.locator('select[name="invoice[recipient_country]"]').selectOption('CH');
  await page.getByRole('link', { name: 'Eintrag hinzufügen' }).click();
  await page.locator('#invoice_items_fields .fields:visible input[placeholder="Name"]').fill('E2E Testposition');
  await page.locator('#invoice_items_fields .fields:visible input[placeholder="Preis"]').fill('42.00');
  await page.locator('#invoice_items_fields .fields:visible input[placeholder="Anzahl"]').fill('1');
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await page.waitForURL(/\/invoices\/\d+/);
  await expect(page.locator('#flash .alert-success')).toContainText(/erstellt/);
  return page.url();
}

async function stornierenAndCleanup(page: any) {
  page.once('dialog', (dialog: any) => dialog.accept());
  await page.getByRole('link', { name: 'Stornieren' }).click();
  await expect(page.locator('#flash .alert-success')).toContainText(/storniert/);
  await expect(page.locator('main')).not.toContainText('E2E Test-Rechnung');
}

test.describe('Rechnungen', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await stopImpersonation(page);
    }
  });

  test('E2E Admin kann keine Rechnung erstellen (fehlende Berechtigung)', async ({ page }) => {
    await page.goto(`/groups/${GROUP_ID}/invoices/new`);

    await expect(page).not.toHaveURL(/\/invoices\/new/);
    await expect(page.locator('#flash .alert-danger')).toContainText('nicht berechtigt');
  });

  test('Neue Rechnung erstellen und stornieren (als E2E Finanzen)', async ({ page }) => {
    await impersonateFinanzen(page);

    await createInvoice(page);

    await stornierenAndCleanup(page);
    await stopImpersonation(page);
  });

  test('Rechnung als PDF drucken (als E2E Finanzen)', async ({ page }) => {
    await impersonateFinanzen(page);

    const invoiceUrl = await createInvoice(page);

    // Drucken-Dropdown öffnen und PDF-Export starten
    await page.goto(invoiceUrl);
    await page.locator('.dropdown-toggle', { hasText: 'Drucken' }).click();
    await page.getByRole('link', { name: 'Rechnung inkl. Einzahlungsschein', exact: true }).click();

    // Asynchroner Export: Download-Spinner erscheint
    await expect(page.locator('#file-download-spinner')).toBeVisible();

    // Download abbrechen damit der Cookie nicht in die Session gespeichert wird
    await page.locator('#cancel_async_downloads').click();
    await expect(page.locator('#file-download-spinner')).not.toBeVisible();

    // Cleanup
    await page.goto(invoiceUrl);
    await stornierenAndCleanup(page);
    await stopImpersonation(page);
  });

  test('Rechnung per E-Mail senden (als E2E Finanzen)', async ({ page }) => {
    await impersonateFinanzen(page);

    const invoiceUrl = await createInvoice(page);

    // Rechnung stellen und per E-Mail verschicken
    await page.goto(invoiceUrl);
    await page.locator('.dropdown-toggle', { hasText: 'Rechnung stellen' }).click();
    await page.getByRole('link', { name: 'Status setzen (Gestellt/Gemahnt) und per E-Mail verschicken' }).click();

    // Flash bestätigt den Hintergrund-Versand
    await expect(page.locator('#flash')).toContainText(/im Hintergrund per E-Mail verschickt/);

    // Cleanup: stornierte Rechnungen sind im Standardfilter nicht sichtbar
    await page.goto(invoiceUrl);
    await stornierenAndCleanup(page);
    await stopImpersonation(page);
  });
});
