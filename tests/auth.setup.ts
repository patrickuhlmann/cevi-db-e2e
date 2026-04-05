import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import { AUTH_FILE } from '../playwright.config';
import { generateTOTP } from '../helpers/totp';

const EMAIL = 'e2e-cevidb@cevimail.ch';
const PASSWORD = process.env.HITOBITO_PASSWORD || '';

setup('Login und Session speichern', async ({ page }) => {
  if (!PASSWORD) {
    throw new Error('HITOBITO_PASSWORD muss als Umgebungsvariable gesetzt sein.');
  }

  await page.goto('/users/sign_in');

  // Selektoren via Label — robust gegen ID-Änderungen
  await page.getByLabel('Haupt-E-Mail').fill(EMAIL);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();

  // 2FA: Hitobito verwendet second_factor_code als Feldname
  const totpSecret = process.env.HITOBITO_TOTP_SECRET;
  const otpInput = page.locator('input[name="second_factor_code"]');
  if (await otpInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    if (!totpSecret) {
      await page.screenshot({ path: path.join(__dirname, '../test-results/auth-2fa-required.png') });
      throw new Error(
        '2FA wird verlangt, aber HITOBITO_TOTP_SECRET ist nicht gesetzt.\n' +
        'Screenshot gespeichert: test-results/auth-2fa-required.png'
      );
    }
    await otpInput.fill(generateTOTP(totpSecret));
    await page.getByRole('button', { name: 'Absenden' }).click();
  }

  // Warte auf vollständige Navigation nach Login
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(__dirname, '../test-results/auth-after-login.png') });

  // Verifikation: Wir sind wirklich eingeloggt (Navbar mit Abmelden-Link)
  await expect(page.locator('a[href*="sign_out"]').first()).toBeVisible({ timeout: 10000 });

  await page.context().storageState({ path: AUTH_FILE });
});
