import { test, expect, Page } from '@playwright/test';

// Seit hitobito/hitobito#1976 muss zum Löschen einer Gruppe der Gruppenname in
// einem Modal eingetippt werden. Der Happy Path ist in ortsgruppe-aufbau.spec.ts
// abgedeckt; hier geht es um den Schutz vor versehentlichem Löschen.

const E2E_MIO_ID = 582;
const GROUP_NAME = 'E2E Lösch-Test';

async function openDeleteDialog(page: Page, groupId: number) {
  await page.goto(`/groups/${groupId}`);
  await page.locator('#dropdown_group_edit a.dropdown-toggle').click();
  await page.getByRole('link', { name: /^Löschen$/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

function deleteButton(dialog: ReturnType<Page['getByRole']>) {
  return dialog.getByRole('button', { name: 'Gruppen und Rollen definitiv löschen' });
}

async function deleteGroup(page: Page, groupId: number, name: string) {
  const dialog = await openDeleteDialog(page, groupId);
  await dialog.getByRole('textbox').fill(name);
  await deleteButton(dialog).click();
  await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
}

test.describe('Gruppe löschen', () => {
  test('Gruppe wird erst nach Eingabe des Gruppennamens gelöscht', async ({ page }) => {
    // Überbleibsel eines abgebrochenen Laufs entfernen
    await page.goto(`/groups/${E2E_MIO_ID}`);
    for (const link of await page.locator('#main').getByRole('link', { name: GROUP_NAME, exact: true }).all()) {
      const leftoverId = parseInt((await link.getAttribute('href'))!.match(/\/groups\/(\d+)/)![1]);
      await deleteGroup(page, leftoverId, GROUP_NAME);
      await page.goto(`/groups/${E2E_MIO_ID}`);
    }

    await page.goto(`/groups/new?group[parent_id]=${E2E_MIO_ID}&group[type]=${encodeURIComponent('Group::Ortsgruppe')}`);
    await page.locator('#group_name').fill(GROUP_NAME);
    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await expect(page).toHaveURL(/\/groups\/\d+/);
    const groupId = parseInt(page.url().match(/\/groups\/(\d+)/)![1]);

    // Modal nennt die Gruppe, Button ist ohne Eingabe deaktiviert
    let dialog = await openDeleteDialog(page, groupId);
    await expect(dialog).toContainText(`Willst du die Gruppe "${GROUP_NAME}" wirklich löschen?`);
    await expect(deleteButton(dialog)).toBeDisabled();

    // Falscher bzw. unvollständiger Name: Button bleibt deaktiviert, auch Enter löscht nicht
    const nameInput = dialog.getByRole('textbox');
    await nameInput.fill('E2E Lösch');
    await expect(deleteButton(dialog)).toBeDisabled();
    await nameInput.press('Enter');
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
    await page.screenshot({ path: 'screenshots/gruppe-loeschen_falscher_name.png' });

    // Abbrechen schliesst das Modal, die Gruppe bleibt bestehen
    await dialog.getByRole('link', { name: 'Abbrechen' }).click();
    await expect(dialog).toBeHidden();
    await page.goto(`/groups/${groupId}`);
    await expect(page.locator('main h1, #main-content h1').first()).toContainText(GROUP_NAME);

    // Gross/Kleinschreibung und Leerzeichen am Rand spielen keine Rolle
    dialog = await openDeleteDialog(page, groupId);
    await dialog.getByRole('textbox').fill(`  ${GROUP_NAME.toLowerCase()} `);
    await expect(deleteButton(dialog)).toBeEnabled();
    await page.screenshot({ path: 'screenshots/gruppe-loeschen_name_eingegeben.png' });
    await deleteButton(dialog).click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);

    await page.goto(`/groups/${E2E_MIO_ID}`);
    await expect(page.locator('#main').getByRole('link', { name: GROUP_NAME, exact: true })).toHaveCount(0);
  });
});
