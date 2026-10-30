import { test, expect, Page } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';

// Seit hitobito/hitobito#1516 unterstützt hitobito EBICS 3.0. In den
// Rechnungseinstellungen (Tab "Zahlungsschnittstellen") gibt es pro Bank einen
// Abschnitt für EBICS 3.0 und, solange das Feature-Gate `invoices.ebics.legacy_ebics_25`
// aktiv ist, zusätzlich einen für EBICS 2.5. Der eigentliche Austausch mit der Bank
// ist nicht testbar, der Test prüft nur das Formular und speichert nichts.

const GROUP_ID = 584;                 // E2E Jungschar
const E2E_FINANZEN_PERSON_ID = 3556;

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

test.describe('EBICS 3.0', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await stopImpersonation(page);
    }
  });

  test('Zahlungsschnittstellen pro Bank für EBICS 3.0 und 2.5 (als E2E Finanzen)', async ({ page }) => {
    await impersonate(page, E2E_FINANZEN_PERSON_ID);

    await page.goto(`/groups/${GROUP_ID}/invoice_config/edit`);
    await page.locator('a[href="#payment_provider_configs"]').click();
    const legends = (await page.locator('#payment_provider_configs legend').allInnerTexts())
      .map((text) => text.trim());
    await page.screenshot({ path: 'screenshots/ebics_zahlungsschnittstellen.png', fullPage: true });

    // Abschnitte: "Zahlungsschnittstelle - <Bank> (EBICS 3.0|EBICS 2.5)"
    const parsed = legends.map((legend) => legend.match(/ - (.+) \((EBICS 3\.0|EBICS 2\.5)\)$/));
    expect(parsed.every(Boolean), `unerwartete Abschnitte: ${legends.join(' | ')}`).toBe(true);
    const banks = [...new Set(parsed.map((m) => m![1]))];
    expect(banks).toContain('Zürcher Kantonalbank');
    expect(banks).toContain('Postfinance');
    // Die ZKB-Testumgebung (neu im Code) ist nur für Entwicklung gedacht
    expect(banks.filter((bank) => bank.includes('Testumgebung'))).toEqual([]);

    // Pro Bank genau ein Abschnitt EBICS 3.0 und einer EBICS 2.5, 3.0 zuerst
    for (const bank of banks) {
      const versions = parsed.filter((m) => m![1] === bank).map((m) => m![2]);
      expect(versions, bank).toEqual(['EBICS 3.0', 'EBICS 2.5']);
    }

    // Felder sind pro Abschnitt vorhanden, die Version steckt im versteckten Feld
    const zkb30 = page.locator('#payment_provider_configs fieldset', { hasText: 'Zürcher Kantonalbank (EBICS 3.0)' });
    await expect(zkb30.getByLabel('Teilnehmer-ID')).toBeVisible();
    await expect(zkb30.locator('input[type="hidden"][name$="[legacy_25_ebics]"]')).toHaveValue('false');
    const zkb25 = page.locator('#payment_provider_configs fieldset', { hasText: 'Zürcher Kantonalbank (EBICS 2.5)' });
    await expect(zkb25.locator('input[type="hidden"][name$="[legacy_25_ebics]"]')).toHaveValue('true');

    await stopImpersonation(page);
  });
});
