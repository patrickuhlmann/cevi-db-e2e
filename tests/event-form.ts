// Kontaktperson für Test-Anlässe/-Kurse: E2E AL hat eine E-Mail-Adresse
// (E2E Mio Admin nicht) und darf als Kontakt jeder Gruppe gesetzt werden.
const EVENT_CONTACT_PERSON_ID = 3552;

// Setzt die Kontaktperson im Anlass-/Kurs-Formular. hitobito_cevi verlangt seit
// Release 2026-10 eine Kontaktperson mit E-Mail (Reply-To für Anlass-Mails).
// Das Autocomplete-Widget ist headless unzuverlässig, daher direkt das
// versteckte ID-Feld setzen.
export async function setEventContact(page: any): Promise<void> {
  await page.locator('#event_contact_id').evaluate(
    (el: HTMLInputElement, id: number) => { el.value = String(id); },
    EVENT_CONTACT_PERSON_ID,
  );
}
