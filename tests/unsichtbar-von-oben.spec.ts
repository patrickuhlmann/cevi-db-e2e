import { test, expect, Page } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';

// Seit hitobito_pbs#473 gibt die Berechtigung see_invisible_from_above selbst keine
// Schreibrechte mehr, sondern nur noch Leserechte nach unten. Bearbeiten dürfen
// Personen mit dieser Berechtigung Personen, die für höhere Ebenen unsichtbar sind
// (z.B. in Fröschli-Gruppen), nur zusammen mit layer_and_below_full.
// In der Cevi haben beide Rollen mit see_invisible_from_above auch layer_and_below_full
// (Administrator/-in Cevi DB in der Ortsgruppe, Admin Ortsgruppen in der
// Geschäftsstelle). Für sie ändert sich darum nichts: Der Test stellt sicher, dass
// E2E OG Admin E2E Kind weiterhin sehen und bearbeiten darf.

const FROESCHLI_GROUP_ID = 586;        // E2E Fröschli – für höhere Ebenen unsichtbar
const E2E_OG_ADMIN_PERSON_ID = 3715;   // Administrator/-in Cevi DB in E2E Ortsgruppe (583)
const E2E_KIND_PERSON_ID = 3554;

const KIND_URL = `/groups/${FROESCHLI_GROUP_ID}/people/${E2E_KIND_PERSON_ID}`;
const NICKNAME = 'E2E Unsichtbar-Test';
const ROLE_LABEL = 'E2E Rollen-Test';

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

async function setNickname(page: Page, nickname: string) {
  await page.goto(`${KIND_URL}/edit`);
  await page.locator('#person_nickname').fill(nickname);
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page.locator('#flash .alert-success')).toContainText(/erfolgreich aktualisiert/);
}

// Die Rolle von E2E Kind in E2E Fröschli, über den Bearbeiten-Link auf der Personenseite
async function setRoleLabel(page: Page, label: string) {
  await page.goto(KIND_URL);
  await page.locator(`a[href^="/groups/${FROESCHLI_GROUP_ID}/roles/"][href$="/edit"]`).first().click();
  await page.locator('#role_label').fill(label);
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page.locator('#flash .alert-success')).toContainText(/erfolgreich aktualisiert/);
}

test.describe('Personen unsichtbar von oben (see_invisible_from_above)', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      // Nach einem Fehler auf einer 404/500-Seite fehlt der Link, darum zuerst eine normale Seite laden
      await page.goto(`/people/${E2E_OG_ADMIN_PERSON_ID}`);
      await stopImpersonation(page);
    }
  });

  test('Administrator/-in Cevi DB der Ortsgruppe sieht und bearbeitet E2E Kind', async ({ page }) => {
    // Der Admin des Dachverbands sieht E2E Kind nicht
    await page.goto(`/groups/${FROESCHLI_GROUP_ID}/people`);
    await expect(page.locator('body')).not.toContainText('Kind E2E');

    await impersonate(page, E2E_OG_ADMIN_PERSON_ID);

    // Aufräumen nach abgebrochenen Läufen
    await setNickname(page, '');
    await setRoleLabel(page, '');

    await page.goto(`/groups/${FROESCHLI_GROUP_ID}/people`);
    await expect(page.locator('table')).toContainText('Kind E2E');

    await page.goto(KIND_URL);
    await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E Kind');
    await expect(page.locator(`a[href="${KIND_URL}/edit"]`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rolle hinzufügen' })).toBeVisible();
    await page.screenshot({ path: 'screenshots/unsichtbar-von-oben_kind.png' });

    // Person bearbeiten
    await setNickname(page, NICKNAME);
    await expect(page.locator('body')).toContainText(NICKNAME);

    // Rolle bearbeiten
    await setRoleLabel(page, ROLE_LABEL);
    await page.goto(KIND_URL);
    await expect(page.locator('body')).toContainText(ROLE_LABEL);
    await page.screenshot({ path: 'screenshots/unsichtbar-von-oben_bearbeitet.png' });

    // Verwalter zuweisen (Dropdown "Erstellen" bei "Kinder / Verwalter*innen"):
    // öffnet inline das Suchfeld "Verwalter*innen", das nicht abgeschickt wird
    await page.locator('h2', { hasText: 'Kinder / Verwalter*innen' }).getByRole('link', { name: 'Erstellen' }).click();
    await page.getByRole('link', { name: 'Verwalter*in zuweisen' }).click();
    await expect(page.getByRole('heading', { name: 'Verwalter*innen', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Person suchen...')).toBeVisible();
    await page.screenshot({ path: 'screenshots/unsichtbar-von-oben_verwalter.png' });

    // Aufräumen
    await setNickname(page, '');
    await setRoleLabel(page, '');
    await page.goto(KIND_URL);
    await expect(page.locator('body')).not.toContainText(NICKNAME);
    await expect(page.locator('body')).not.toContainText(ROLE_LABEL);

    await stopImpersonation(page);
  });
});
