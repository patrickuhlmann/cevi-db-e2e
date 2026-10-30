import { test, expect, Page } from '@playwright/test';

// Seit Release 2026-11 lehnt hitobito E-Mail-Adressen mit zwei aufeinanderfolgenden
// Punkten oder einem Punkt direkt vor dem @ ab (SMTP-Server verweigern sie,
// Truemail-Muster). Das Eingabefeld (type="email") lässt beide Formen durch, die
// Prüfung passiert auf dem Server.
//
// Nicht getestet: Ändern der Haupt-E-Mail einer bestehenden Person. Dort wird eine
// ungültige Adresse gespeichert, solange die bisherige gültig war (Bug, siehe
// CHANGELOG). Ein Test würde die Login-Adresse von Testpersonen verändern.

const GROUP_ID = 585; // E2E Team
const E2E_LEITER_PERSON_ID = 3550;
const PERSON_URL = `/groups/${GROUP_ID}/people/${E2E_LEITER_PERSON_ID}`;

const INVALID_EMAILS = ['e2e..validierung@uhlme.ch', 'e2e-validierung.@uhlme.ch'];

// Speichert und wartet auf die Antwort, damit nicht die Fehlermeldung des vorherigen
// Versuchs geprüft wird
async function save(page: Page) {
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Speichern' }).first().click(),
  ]);
  await page.waitForLoadState('networkidle');
}

test.describe('E-Mail-Validierung', () => {
  INVALID_EMAILS.forEach((email, i) => {
    test(`Weitere E-Mail ${email} ist ungültig (als Admin)`, async ({ page }) => {
      await page.goto(`${PERSON_URL}/edit`);
      const form = page.locator('.nested-form[data-nested-form-assoc-value="additional_emails"]');
      await form.getByRole('link', { name: 'Eintrag hinzufügen' }).click();
      const row = form.locator('.fields').last();
      await row.locator('input[name$="[email]"]').fill(email);
      await row.locator('select[name$="[category_id]"]').selectOption({ label: 'Andere' });
      await save(page);
      await expect(page.locator('#error_explanation')).toContainText('ist nicht gültig');
      await page.screenshot({ path: `screenshots/email-validierung_weitere_${i}.png` });

      await page.goto(PERSON_URL);
      await expect(page.locator('body')).not.toContainText(email);
    });

    test(`Neue Person mit Haupt-E-Mail ${email} wird abgelehnt (als Admin)`, async ({ page }) => {
      await page.goto(`/groups/${GROUP_ID}/roles/new`);
      await page.getByRole('link', { name: 'Neue Person erfassen' }).click();
      await page.locator('#role_new_person_first_name').fill('E2E');
      await page.locator('#role_new_person_last_name').fill('E-Mail-Validierung');
      await page.locator('#role_new_person_email').fill(email);
      await page.locator('#role_new_person_privacy_policy_accepted').check();
      await page.locator('#role_type').selectOption({ label: 'Mitarbeiter/-in' });
      await save(page);
      await expect(page.locator('#error_explanation')).toContainText('Haupt-E-Mail ist nicht gültig');
      await page.screenshot({ path: `screenshots/email-validierung_neue_person_${i}.png` });

      await page.goto(`/groups/${GROUP_ID}/people`);
      await expect(page.locator('body')).not.toContainText('E-Mail-Validierung');
    });
  });
});
