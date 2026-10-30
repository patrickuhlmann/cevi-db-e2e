import { test, expect, request as playwrightRequest, APIRequestContext } from '@playwright/test';

// Seit hitobito/hitobito#4488 sind Gruppen- und Rollentypen ohne Authentisierung
// abrufbar (GET /api/group_types, /api/role_types). Alle anderen Endpoints verlangen
// weiterhin ein Token.

let anonymous: APIRequestContext;

test.beforeAll(async ({ baseURL }) => {
  // Eigener Kontext ohne X-Token (die Konfiguration setzt das Token für alle Requests)
  anonymous = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { Accept: 'application/vnd.api+json' },
  });
});

test.afterAll(async () => {
  await anonymous.dispose();
});

test('Gruppentypen ohne Token abrufen', async () => {
  const response = await anonymous.get('/api/group_types?include=possible_children');
  expect(response.status()).toBe(200);

  const body = await response.json();
  const ortsgruppe = body.data.find((type: any) => type.id === 'Group::Ortsgruppe');
  expect(ortsgruppe.type).toBe('group_types');
  expect(ortsgruppe.attributes).toEqual({ label: 'Ortsgruppe', label_plural: 'Ortsgruppen', layer: true });
  const children = ortsgruppe.relationships.possible_children.data.map((child: any) => child.id);
  expect(children).toContain('Group::Jungschar');
});

test('Rollentypen ohne Token abrufen', async () => {
  const response = await anonymous.get('/api/role_types?include=group_types');
  expect(response.status()).toBe(200);

  const body = await response.json();
  const administrator = body.data.find((type: any) => type.id === 'Group::Ortsgruppe::AdministratorCeviDB');
  expect(administrator.type).toBe('role_types');
  expect(administrator.attributes).toEqual({
    label: 'Administrator/-in Cevi DB',
    kind: 'member',
    permissions: ['layer_and_below_full', 'see_invisible_from_above'],
    visible_from_above: true,
  });
  expect(administrator.relationships.group_types.data).toEqual([{ type: 'group_types', id: 'Group::Ortsgruppe' }]);
});

test('Andere Endpoints verlangen weiterhin ein Token', async () => {
  const response = await anonymous.get('/api/groups/582');
  expect(response.status()).toBe(401);
});
