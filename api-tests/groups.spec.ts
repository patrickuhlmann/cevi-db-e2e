import { test, expect } from '@playwright/test';

// E2E Mio, siehe README Testdaten
const GROUP_ID = 582;

test('Gruppendetails via API abrufen', async ({ request }) => {
  const response = await request.get(`/api/groups/${GROUP_ID}`);
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.data.type).toBe('groups');
  expect(body.data.id).toBe(String(GROUP_ID));
  expect(body.data.attributes.name).toBe('E2E Mio');
});
