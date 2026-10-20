import { test, expect } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';
import { setEventContact } from './event-form';

const GROUP_ID = 582;               // E2E Mio
const E2E_MIO_ADMIN_PERSON_ID = 3557;
const SOURCE_COURSE_ID = 1459;      // Fixture "E2E API Kurs" – wird nur gelesen, nie verändert

async function impersonateMioAdmin(page: any) {
  await page.goto(`/groups/${GROUP_ID}/people/${E2E_MIO_ADMIN_PERSON_ID}`);
  await page.getByRole('link', { name: 'Imitieren' }).click();
  await expect(page.locator('.user-impersonation')).toBeVisible();
}

async function stopImpersonation(page: any) {
  await page.getByRole('link', { name: 'Imitation beenden' }).click();
  await expect(page.locator('.user-impersonation')).not.toBeVisible();
  await page.context().storageState({ path: AUTH_FILE });
}

test.describe('Kurs duplizieren', () => {
  test.afterEach(async ({ page }) => {
    if (await page.locator('.user-impersonation').isVisible()) {
      await stopImpersonation(page);
    }
  });

  test('Bestehenden Kurs duplizieren und Duplikat wieder löschen (als E2E Mio Admin)', async ({ page }) => {
    await impersonateMioAdmin(page);

    // Quellkurs öffnen und "Duplizieren" klicken
    await page.goto(`/groups/${GROUP_ID}/events/${SOURCE_COURSE_ID}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: 'Duplizieren' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(new RegExp(`/events/new\\?source_id=${SOURCE_COURSE_ID}`));

    // Formular ist mit den Daten des Quellkurses vorausgefüllt (Name, Kursart)
    await expect(page.locator('#event_name')).toHaveValue('E2E API Kurs');
    const sourceKind = await page.locator('#event_kind_id option:checked').textContent();
    expect(sourceKind).toMatch(/GLK1/);
    await page.screenshot({ path: 'screenshots/kurs_duplizieren_formular.png' });

    // Name anpassen, damit das Duplikat eindeutig ist
    await page.locator('#event_name').fill('E2E Kurs-Duplikat');
    // Die Fixture hat keine Kontaktperson – beim Duplikat ist sie aber Pflicht
    await setEventContact(page);

    // Daten werden nicht dupliziert: Startdatum neu setzen
    await page.locator('a[href="#dates"]').click();
    const startAtInput = page.locator('input[id$="_start_at_date"]').first();
    await expect(startAtInput).toHaveValue('');
    await startAtInput.pressSequentially('01.06.2026');
    await startAtInput.blur();

    await page.getByRole('button', { name: 'Speichern' }).first().click();
    await page.waitForLoadState('networkidle');

    // Neuer Kurs mit eigener ID, Quellkurs bleibt unverändert
    await expect(page).toHaveURL(/\/events\/\d+/);
    const eventIdMatch = page.url().match(/\/events\/(\d+)/);
    if (!eventIdMatch) throw new Error(`Konnte Event-ID nicht aus URL extrahieren: ${page.url()}`);
    const eventId = parseInt(eventIdMatch[1]);
    expect(eventId).not.toBe(SOURCE_COURSE_ID);
    await expect(page.locator('#flash .alert-success')).toContainText('E2E Kurs-Duplikat');
    await expect(page.locator('body')).toContainText('Gruppenleiter/-innen-Kurs 1');
    await page.screenshot({ path: 'screenshots/kurs_duplizieren_erstellt.png' });

    // Cleanup: Duplikat löschen
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: /^Löschen$/i }).click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);

    // Quellkurs existiert weiterhin
    await page.goto(`/groups/${GROUP_ID}/events/${SOURCE_COURSE_ID}`);
    await expect(page.locator('body')).toContainText('E2E API Kurs');
    await page.screenshot({ path: 'screenshots/kurs_duplizieren_geloescht.png' });
  });
});
