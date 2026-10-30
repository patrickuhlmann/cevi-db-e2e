import { test, expect, Page } from '@playwright/test';

// Seit hitobito/hitobito#2686 lässt sich pro Hilfetext festlegen, ob er beim Laden
// der Seite schon angezeigt wird ("initial Anzeigen", Feld `start_open`). Ohne die
// Option ist der Text wie bisher versteckt und erscheint erst beim Klick auf das
// Info-Icon.
//
// Hilfetexte sind global (Einstellungen → Hilfetexte, nur Admin). Der Test verwendet
// das Feld "Titel" der Person, für das auf INTEGRATION kein Hilfetext existiert, und
// löscht seinen Hilfetext am Anfang und am Ende.

const E2E_LEITER_EDIT_URL = '/groups/585/people/3550/edit';
const BODY = 'E2E Hilfetext zum Titel';

function helpTextRow(page: Page) {
  return page.locator('table tbody tr').filter({ hasText: BODY });
}

async function deleteHelpTexts(page: Page) {
  await page.goto('/help_texts');
  while ((await helpTextRow(page).count()) > 0) {
    page.once('dialog', (dialog) => dialog.accept());
    await helpTextRow(page).first().locator('a[data-method="delete"]').click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
    await page.goto('/help_texts');
  }
}

async function setStartOpen(page: Page, startOpen: boolean) {
  await page.goto('/help_texts');
  await helpTextRow(page).first().locator('a[href$="/edit"]').click();
  await page.locator('#help_text_start_open').setChecked(startOpen);
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page.locator('#flash .alert-success')).toBeVisible();
}

// Hilfetext beim Feld "Titel" im Personenformular
function titleHelpText(page: Page) {
  return page.locator('.help-text', { hasText: BODY });
}

test.describe('Hilfetexte', () => {
  test('Initiale Sichtbarkeit eines Hilfetexts (als Admin)', async ({ page }) => {
    await deleteHelpTexts(page);

    // Hilfetext für Person / Feld "Titel" mit "initial Anzeigen"
    await page.goto('/help_texts/new');
    await page.locator('#help_text_context').selectOption('people--person');
    await page.locator('select#help_text_key:not([disabled])').selectOption('field.title');
    await page.locator('trix-editor#help_text_body').fill(BODY);
    await expect(page.locator('#help_text_start_open')).not.toBeChecked(); // Standard: versteckt
    await page.locator('#help_text_start_open').check();
    await page.screenshot({ path: 'screenshots/hilfetexte_formular.png', fullPage: true });
    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await expect(page.locator('#flash .alert-success')).toBeVisible();

    // Liste zeigt die neue Spalte "initial Anzeigen"
    await page.goto('/help_texts');
    await expect(page.locator('table thead')).toContainText('initial Anzeigen');
    await expect(helpTextRow(page)).toContainText('ja');

    // Initial angezeigt
    await page.goto(E2E_LEITER_EDIT_URL);
    await expect(titleHelpText(page)).toBeVisible();
    await expect(titleHelpText(page)).not.toHaveAttribute('data-initially-closed');
    await titleHelpText(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'screenshots/hilfetexte_initial_offen.png' });

    // Ohne "initial Anzeigen": versteckt, erscheint per Klick auf das Info-Icon
    await setStartOpen(page, false);
    await page.goto('/help_texts');
    await expect(helpTextRow(page)).toContainText('nein');
    await page.goto(E2E_LEITER_EDIT_URL);
    await expect(titleHelpText(page)).toBeHidden();
    const helpTextClass = (await titleHelpText(page).getAttribute('class'))!.split(' ')
      .find((c) => c.startsWith('help_text_'))!;
    await page.locator(`.help-text-trigger[data-key="${helpTextClass}"]`).click();
    await expect(titleHelpText(page)).toBeVisible();
    await titleHelpText(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'screenshots/hilfetexte_per_klick.png' });

    await deleteHelpTexts(page);
  });
});
