import { test, expect, Page } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';

const E2E_AL_PERSON_ID = 3552;
const E2E_KIND_PERSON_ID = 3554;

// Hitobito navigiert bei genau einem Treffer direkt zur Personenseite,
// sonst zur Suchergebnisseite /full?q=. Gewartet wird, bis sich die URL geändert
// hat: die Startseite "/" leitet selbst schon auf eine Personenseite um, ein
// reines waitForURL(/people/…) wäre sofort erfüllt.
async function search(page: Page, term: string) {
  const startUrl = page.url();
  await page.fill('#quicksearch', term);
  await page.click('.quicksearch-button');
  await page.waitForURL(
    (url) => url.href !== startUrl && (url.pathname === '/full' || /\/people\/\d+$/.test(url.pathname)),
    { timeout: 10000 },
  );
}

test.describe('Schnellsuche', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Leiter in Ortsgruppe wird gefunden', async ({ page }) => {
    await search(page, 'E2E Leiter');
    await expect(page.locator('body')).toContainText('E2E Leiter');
    await page.screenshot({ path: 'screenshots/quicksearch_leiter_gefunden.png' });
  });

  test('Kind in Ortsgruppe wird nicht gefunden', async ({ page }) => {
    await search(page, 'E2E Kind');
    await expect(page.locator('body')).not.toContainText('E2E Kind');
    await page.screenshot({ path: 'screenshots/quicksearch_kind_nicht_gefunden.png' });
  });

  // Seit hitobito_pfadi_de#50 findet die Suche Personen auch über ihre ID (Personennummer).
  // ID-Treffer stehen vor den Volltext-Treffern (eine Zahl matcht z.B. auch PLZ/Telefon).
  test('Person wird über ihre ID gefunden', async ({ page }) => {
    await page.locator('#quicksearch').pressSequentially(String(E2E_AL_PERSON_ID), { delay: 50 });
    const firstSuggestion = page.locator('#quicksearch ~ [role="listbox"] [role="option"]').first();
    await expect(firstSuggestion).toHaveText('E2E AL');
    await page.screenshot({ path: 'screenshots/quicksearch_id_vorschlag.png' });

    await firstSuggestion.click();
    await expect(page).toHaveURL(new RegExp(`/people/${E2E_AL_PERSON_ID}$`));
    await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E AL');
  });

  test('Kind wird auch über seine ID nicht gefunden', async ({ page }) => {
    await search(page, String(E2E_KIND_PERSON_ID));
    await expect(page).not.toHaveURL(new RegExp(`/people/${E2E_KIND_PERSON_ID}$`));
    await expect(page.locator('body')).toContainText('Keine Einträge gefunden');
    await expect(page.locator('body')).not.toContainText('E2E Kind');
    await page.screenshot({ path: 'screenshots/quicksearch_id_kind_nicht_gefunden.png' });
  });
});

test.describe('Schnellsuche mit Leserecht (als E2E AL)', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await page.getByRole('link', { name: 'Imitation beenden' }).click();
      await expect(page.locator('.user-impersonation')).not.toBeVisible();
      // Session-ID wurde durch sign_in() rotiert – neue Session speichern
      await page.context().storageState({ path: AUTH_FILE });
    }
  });

  test('Kind wird über seine ID gefunden', async ({ page }) => {
    await page.goto(`/groups/584/people/${E2E_AL_PERSON_ID}`);
    await page.getByRole('link', { name: 'Imitieren' }).click();
    await expect(page.locator('.user-impersonation')).toBeVisible();

    await search(page, String(E2E_KIND_PERSON_ID));
    await expect(page.locator('body')).toContainText('E2E Kind');
    await page.screenshot({ path: 'screenshots/quicksearch_id_kind_gefunden.png' });
  });
});
