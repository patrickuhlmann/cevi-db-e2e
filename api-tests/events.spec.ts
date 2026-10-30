import { test, expect } from '@playwright/test';

// Permanente API-Test-Fixtures, siehe README Testdaten / docs/api-testing.md
const ANLASS_ID = 1458; // E2E API Anlass, in E2E Jungschar (584)
const KURS_ID = 1459; // E2E API Kurs, in E2E Mio (582)

test('Anlass-Details via API abrufen', async ({ request }) => {
  const response = await request.get(`/api/events/${ANLASS_ID}`);
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.data.type).toBe('events');
  expect(body.data.id).toBe(String(ANLASS_ID));
  expect(body.data.attributes.name).toBe('E2E API Anlass');
});

test('Kurs-Details via API abrufen', async ({ request }) => {
  // Ein Kurs ist ein STI-Subtyp von Event (Event::Course) und läuft über
  // denselben /api/events-Endpoint wie ein Anlass, siehe docs/api-testing.md
  const response = await request.get(`/api/events/${KURS_ID}`);
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.data.type).toBe('courses');
  expect(body.data.id).toBe(String(KURS_ID));
  expect(body.data.attributes.name).toBe('E2E API Kurs');
  expect(body.data.attributes.type).toBe('Event::Course');
});

// Seit hitobito_sww#376 lassen sich die Angaben der Kontaktperson mit
// include=contact_details laden. Enthalten sind nur die Angaben, die im Anlass unter
// den Anzeigeoptionen der Kontaktperson angewählt sind (bei E2E API Anlass alle).
test('Kontaktperson eines Anlasses mit include=contact_details abrufen', async ({ request }) => {
  const response = await request.get(`/api/events/${ANLASS_ID}?include=contact_details`);
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.data.relationships.contact_details.data).toEqual({ type: 'event-contact-details', id: String(ANLASS_ID) });
  const contactDetails = body.included.find((entry: any) => entry.type === 'event-contact-details');
  expect(contactDetails.attributes).toMatchObject({
    first_name: 'E2E',
    last_name: 'AL',
    email: 'e2e-al@uhlme.ch',
  });
});
