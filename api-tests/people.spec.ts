import { test, expect } from '@playwright/test';

// E2E AL, siehe README Testdaten
const PERSON_ID = 3552;

test('Persondetails via API abrufen', async ({ request }) => {
  const response = await request.get(`/api/people/${PERSON_ID}`);
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.data.type).toBe('people');
  expect(body.data.id).toBe(String(PERSON_ID));
  expect(body.data.attributes.first_name).toBe('E2E');
  expect(body.data.attributes.last_name).toBe('AL');
});
