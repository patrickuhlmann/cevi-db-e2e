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

async function createInvoice(page: any, screenshotPrefix: string): Promise<string> {
  await page.goto(`/groups/${GROUP_ID}/invoices/new`);
  await page.getByLabel('Titel').fill('E2E Test-Rechnung');
  // Empfängername ist seit Hitobito-Update auf Vor-/Nachname aufgeteilt
  // (recipient_name existiert nicht mehr).
  await page.locator('input[name="invoice[recipient_first_name]"]').fill('E2E');
  await page.locator('input[name="invoice[recipient_last_name]"]').fill('Test-Empfänger');
  await page.locator('input[name="invoice[recipient_street]"]').fill('Teststrasse');
  await page.locator('input[name="invoice[recipient_housenumber]"]').fill('1');
  await page.locator('input[name="invoice[recipient_zip_code]"]').fill('8000');
  await page.locator('input[name="invoice[recipient_town]"]').fill('Zürich');
  // Land ist jetzt ein Tom-Select-Widget; das echte <select> ist visuell
  // versteckt, daher über das Control-Element auswählen statt selectOption.
  await page.locator('#invoice_recipient_country-ts-control').click();
  await page.locator('#invoice_recipient_country-ts-dropdown [data-value="CH"]').first().click();
  await page.getByRole('link', { name: 'Eintrag hinzufügen' }).click();
  await page.locator('#invoice_items_fields .fields:visible input[placeholder="Name"]').fill('E2E Testposition');
  await page.locator('#invoice_items_fields .fields:visible input[placeholder="Preis"]').fill('42.00');
  await page.locator('#invoice_items_fields .fields:visible input[placeholder="Anzahl"]').fill('1');
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await page.waitForURL(/\/invoices\/\d+/);
  await expect(page.locator('#flash .alert-success')).toContainText(/erstellt/);
  await page.screenshot({ path: `screenshots/${screenshotPrefix}_erstellt.png` });
  return page.url();
}

async function stornierenAndCleanup(page: any, screenshotPrefix: string) {
  page.once('dialog', (dialog: any) => dialog.accept());
  await page.getByRole('link', { name: 'Stornieren' }).click();
  await expect(page.locator('#flash .alert-success')).toContainText(/storniert/);
  await expect(page.locator('main')).not.toContainText('E2E Test-Rechnung');
  await page.screenshot({ path: `screenshots/${screenshotPrefix}_storniert.png` });
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
    await page.screenshot({ path: 'screenshots/rechnungen_admin_kein_zugriff.png' });
  });

  test('Neue Rechnung erstellen und stornieren (als E2E Finanzen)', async ({ page }) => {
    await impersonateFinanzen(page);

    await createInvoice(page, 'rechnungen_erstellen');

    await stornierenAndCleanup(page, 'rechnungen_erstellen');
    await stopImpersonation(page);
  });

  test('Rechnung als PDF drucken (als E2E Finanzen)', async ({ page }) => {
    await impersonateFinanzen(page);

    const invoiceUrl = await createInvoice(page, 'rechnungen_drucken');

    // Drucken-Dropdown öffnen und PDF-Export starten
    await page.goto(invoiceUrl);
    await page.locator('.dropdown-toggle', { hasText: 'Drucken' }).click();

    // PDF-Export ist seit dem Hitobito-Update ein direkter, synchroner Download
    // (kein async Export mit Spinner/Cancel mehr). Der Link zeigt direkt auf .pdf
    // und löst ein download-Event aus.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Rechnung inkl. Einzahlungsschein', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    await page.screenshot({ path: 'screenshots/rechnungen_drucken_pdf.png' });

    // Cleanup
    await page.goto(invoiceUrl);
    await stornierenAndCleanup(page, 'rechnungen_drucken');
    await stopImpersonation(page);
  });

  test('Rechnung per E-Mail senden (als E2E Finanzen)', async ({ page }) => {
    await impersonateFinanzen(page);

    const invoiceUrl = await createInvoice(page, 'rechnungen_mail');

    // Rechnung stellen und per E-Mail verschicken
    await page.goto(invoiceUrl);
    await page.locator('.dropdown-toggle', { hasText: 'Rechnung stellen' }).click();
    await page.getByRole('link', { name: 'Status setzen (Gestellt/Gemahnt) und per E-Mail verschicken' }).click();

    // Flash bestätigt den Hintergrund-Versand
    await expect(page.locator('#flash')).toContainText(/im Hintergrund per E-Mail verschickt/);
    await page.screenshot({ path: 'screenshots/rechnungen_mail_versand.png' });

    // Cleanup
    await page.goto(invoiceUrl);
    await stornierenAndCleanup(page, 'rechnungen_mail');
    await stopImpersonation(page);
  });
});
