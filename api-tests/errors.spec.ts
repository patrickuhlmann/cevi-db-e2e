import { test, expect } from '@playwright/test';

const GROUP_ID = 582; // E2E Mio

test('Falsches Token liefert 401', async ({ request }) => {
  const response = await request.get(`/api/groups/${GROUP_ID}`, {
    headers: { 'X-Token': 'invalid-token-xyz' },
  });
  expect(response.status()).toBe(401);
});

test('Nicht existierende Gruppen-ID liefert 404', async ({ request }) => {
  const response = await request.get('/api/groups/999999999');
  expect(response.status()).toBe(404);
});
