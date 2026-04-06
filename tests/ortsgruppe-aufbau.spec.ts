import { test, expect } from '@playwright/test';

const E2E_MIO_ID = 582;

// Erstellt eine Gruppe und gibt die neue Gruppen-ID zurück
async function createGroup(page: any, parentId: number, type: string, name: string): Promise<number> {
  await page.goto(`/groups/new?group[parent_id]=${parentId}&group[type]=${encodeURIComponent(type)}`);
  await page.locator('#group_name').fill(name);
  await page.getByRole('button', { name: 'Speichern' }).first().click();

  // Nach dem Speichern landet man auf der Gruppendetailseite – ID aus URL lesen
  await expect(page).toHaveURL(/\/groups\/\d+/);
  const url = page.url();
  const match = url.match(/\/groups\/(\d+)/);
  if (!match) throw new Error(`Konnte Gruppen-ID nicht aus URL extrahieren: ${url}`);
  return parseInt(match[1]);
}

// Löscht eine Gruppe: Dropdown-Toggle öffnen → "Löschen" klicken
async function deleteGroup(page: any, groupId: number): Promise<void> {
  await page.goto(`/groups/${groupId}`);
  // Caret des "Bearbeiten"-Dropdowns öffnen
  await page.locator('#dropdown_group_edit a.dropdown-toggle').click();
  page.once('dialog', (dialog: any) => dialog.accept());
  await page.getByRole('link', { name: /^Löschen$/i }).click();
  await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
}

test.describe('Ortsgruppe Aufbau', () => {
  test('Ortsgruppe mit Jungschar, Stufe, Verein und Vorstand erstellen und löschen', async ({ page }) => {
    // ── 1. Ortsgruppe erstellen ──────────────────────────────────────────────
    const ortsgruppeId = await createGroup(
      page, E2E_MIO_ID, 'Group::Ortsgruppe', 'E2E Test-Ortsgruppe'
    );
    await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E Test-Ortsgruppe');
    await page.screenshot({ path: 'screenshots/ortsgruppe_aufbau_ortsgruppe.png' });

    // ── 2. Jungschar unter Ortsgruppe erstellen ──────────────────────────────
    const jungscharId = await createGroup(
      page, ortsgruppeId, 'Group::Jungschar', 'E2E Test-Jungschar'
    );
    await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E Test-Jungschar');
    await page.screenshot({ path: 'screenshots/ortsgruppe_aufbau_jungschar.png' });

    // ── 3. Stufe unter Jungschar erstellen ───────────────────────────────────
    const stufenId = await createGroup(
      page, jungscharId, 'Group::Stufe', 'E2E Test-Stufe'
    );
    await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E Test-Stufe');
    await page.screenshot({ path: 'screenshots/ortsgruppe_aufbau_stufe.png' });

    // ── 4. Verein unter Ortsgruppe erstellen ─────────────────────────────────
    const vereinId = await createGroup(
      page, ortsgruppeId, 'Group::Verein', 'E2E Test-Verein'
    );
    await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E Test-Verein');
    await page.screenshot({ path: 'screenshots/ortsgruppe_aufbau_verein.png' });

    // ── 5. Vorstand (VereinVorstand) unter Verein erstellen ──────────────────
    const vorstandId = await createGroup(
      page, vereinId, 'Group::VereinVorstand', 'E2E Test-Vorstand'
    );
    await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E Test-Vorstand');
    await page.screenshot({ path: 'screenshots/ortsgruppe_aufbau_vorstand.png' });

    // ── 6. Hierarchie prüfen: Ortsgruppe zeigt Jungschar und Verein in der Seitenleiste ──
    await page.goto(`/groups/${ortsgruppeId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#main').getByRole('link', { name: 'E2E Test-Jungschar' })).toBeVisible();
    await expect(page.locator('#main').getByRole('link', { name: 'E2E Test-Verein' })).toBeVisible();
    await page.screenshot({ path: 'screenshots/ortsgruppe_aufbau_hierarchie.png' });

    // ── 7. Cleanup: in umgekehrter Reihenfolge löschen ───────────────────────
    await deleteGroup(page, vorstandId);
    await deleteGroup(page, stufenId);
    await deleteGroup(page, jungscharId);
    await deleteGroup(page, vereinId);
    await deleteGroup(page, ortsgruppeId);
    await page.screenshot({ path: 'screenshots/ortsgruppe_aufbau_geloescht.png' });
  });
});
