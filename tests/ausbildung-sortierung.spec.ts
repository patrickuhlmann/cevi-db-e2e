import { test, expect, Page } from '@playwright/test';

// Seit hitobito_youth 365737a (hitobito_sac_cas#2613) lässt sich die Ausbildungs-Liste
// einer Gruppe (Reiter "Ausbildung") nach Person, Qualifikationen und Geburtstag
// sortieren. Bei Qualifikationen zählt pro Person die gültige Qualifikation, die zuerst
// abläuft. Vorher war die Liste fest nach Geburtstag sortiert.

const GROUP_ID = 584; // E2E Jungschar: direkte Mitglieder sind E2E AL und E2E Finanzen
const EDUCATIONS_URL = `/groups/${GROUP_ID}/educations`;
const QUALIFICATION_KIND = 'Quali SiBe-Test'; // 4 Jahre gültig, nicht reaktivierbar

const AL = { id: 3552, name: 'AL E2E', birthday: '01.01.1990', qualificationStart: '01.01.2026' };
const FINANZEN = { id: 3556, name: 'Finanzen E2E', birthday: '01.01.2000', qualificationStart: '01.01.2024' };

function personUrl(personId: number) {
  return `/groups/${GROUP_ID}/people/${personId}`;
}

async function setBirthday(page: Page, personId: number, birthday: string) {
  await page.goto(`${personUrl(personId)}/edit`);
  await page.locator('#person_birthday').fill(birthday);
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page.locator('#flash .alert-success')).toContainText(/erfolgreich aktualisiert/);
}

async function addQualification(page: Page, personId: number, startAt: string) {
  await page.goto(`${personUrl(personId)}/qualifications/new`);
  await page.locator('#qualification_qualification_kind_id').selectOption({ label: QUALIFICATION_KIND });
  await page.locator('#qualification_start_at').fill(startAt);
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page.locator('#flash .alert-success')).toContainText(/erfolgreich erstellt/);
}

async function deleteQualifications(page: Page, personId: number) {
  await page.goto(personUrl(personId));
  const deleteLinks = page.locator('tr', { hasText: QUALIFICATION_KIND })
    .locator('a[data-method="delete"][href*="/qualifications/"]');
  while ((await deleteLinks.count()) > 0) {
    page.once('dialog', (dialog) => dialog.accept());
    await deleteLinks.first().click();
    await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
  }
}

async function cleanup(page: Page) {
  for (const person of [AL, FINANZEN]) {
    await deleteQualifications(page, person.id);
    await setBirthday(page, person.id, '');
  }
}

function names(page: Page) {
  return page.locator('#main table tbody tr td:first-child');
}

async function sortBy(page: Page, header: string, sort: string, direction: 'asc' | 'desc') {
  await page.locator('#main table th a', { hasText: header }).click();
  await expect(page).toHaveURL(new RegExp(`sort=${sort}&sort_dir=${direction}`));
}

test.describe('Ausbildungs-Liste sortieren', () => {
  test('nach Person, Qualifikationen und Geburtstag (als Admin)', async ({ page }) => {
    await cleanup(page);

    for (const person of [AL, FINANZEN]) {
      await setBirthday(page, person.id, person.birthday);
      await addQualification(page, person.id, person.qualificationStart);
    }

    await page.goto(EDUCATIONS_URL);
    await expect(page.locator('#main table tbody tr', { hasText: FINANZEN.name }))
      .toContainText(`${QUALIFICATION_KIND} bis 31.12.2028`);
    await expect(page.locator('#main table tbody tr', { hasText: AL.name }))
      .toContainText(`${QUALIFICATION_KIND} bis 31.12.2030`);

    await sortBy(page, 'Person', 'name', 'asc');
    await expect(names(page)).toHaveText([AL.name, FINANZEN.name]);
    await sortBy(page, 'Person', 'name', 'desc');
    await expect(names(page)).toHaveText([FINANZEN.name, AL.name]);

    // Die zuerst ablaufende Qualifikation (Finanzen, bis 2028) kommt aufsteigend zuerst
    await sortBy(page, 'Qualifikationen', 'qualification', 'asc');
    await expect(names(page)).toHaveText([FINANZEN.name, AL.name]);
    await page.screenshot({ path: 'screenshots/ausbildung-sortierung_qualifikation.png' });
    await sortBy(page, 'Qualifikationen', 'qualification', 'desc');
    await expect(names(page)).toHaveText([AL.name, FINANZEN.name]);

    await sortBy(page, 'Geburtstag', 'birthday', 'asc');
    await expect(names(page)).toHaveText([AL.name, FINANZEN.name]);
    await sortBy(page, 'Geburtstag', 'birthday', 'desc');
    await expect(names(page)).toHaveText([FINANZEN.name, AL.name]);
    await page.screenshot({ path: 'screenshots/ausbildung-sortierung_geburtstag.png' });

    await cleanup(page);
    await page.goto(EDUCATIONS_URL);
    await expect(page.locator('#main table')).not.toContainText(QUALIFICATION_KIND);
  });
});
