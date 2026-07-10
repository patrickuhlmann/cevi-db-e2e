import { test, expect } from '@playwright/test';

// Permanente API-Test-Fixtures, siehe README Testdaten / docs/api-testing.md
const ANLASS_ID = 1458; // E2E API Anlass
const KURS_ID = 1459; // E2E API Kurs

test('Anlass-Teilnehmer via API abrufen', async ({ request }) => {
  const response = await request.get('/api/event_participations', {
    params: { 'filter[event_id]': ANLASS_ID },
  });
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.data.length).toBeGreaterThan(0);
  expect(body.data[0].attributes.event_id).toBe(ANLASS_ID);
  expect(body.data[0].attributes.active).toBe(true);
});

test('Kurs-Teilnehmer via API abrufen', async ({ request }) => {
  const response = await request.get('/api/event_participations', {
    params: { 'filter[event_id]': KURS_ID },
  });
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.data.length).toBeGreaterThan(0);
  expect(body.data[0].attributes.event_id).toBe(KURS_ID);
  expect(body.data[0].attributes.active).toBe(true);
});
