* Neu erstellte Tests jeweils ausführen um sicherzustellen, dass diese funktionieren
* Der globale Playwright-Timeout ist 15s. Tests mit mehreren Phasen (Erstellen → externe Anmeldung → Cleanup) brauchen einen Test-Level-Timeout: `test.setTimeout(120000)` am Anfang des Testbodys setzen.
* Neue Testpersonen/Testdaten die bereits existieren müssen und nicht selber angelegt werden im README.md beschreiben
* An sinnvollen Stellen (nach wichtigen Assertions) Screenshots erstellen: `await page.screenshot({ path: 'screenshots/name.png' })`. Benennung: `{spec}_{schritt}.png`, z.B. `rechnungen_erstellt.png`. Screenshots gehen nach `e2e/screenshots/` und werden bei jedem Lauf überschrieben (immer aktueller Stand). Zweck: manuelle visuelle Prüfung nach automatischer Ausführung.
* Sofern weitere Eigenheiten der cevi.db auftauchen bitte diese in der CLAUDE.md dokumentieren (für AI-Agents optimiert, damit diese bei Testentwicklung direkt darauf zugreifen können).
* Es wird direkt auf `main` gearbeitet (kein Feature-Branch / PR-Workflow). Commits direkt auf `main` und pushen.

## Eigenheiten der cevi.db

### Formularfelder

`getByLabel('Name')` ist nicht eindeutig – das Gruppenformular hat mehrere Felder die auf "Name" matchen (Name, Kurzname, SMS Benutzername). Immer `#group_name` verwenden:
```typescript
await page.locator('#group_name').fill(name);
```

### Gruppe löschen

Der Löschen-Link ist im "Bearbeiten"-Dropdown versteckt, das nur ein Caret-Toggle (kein sichtbarer Text) hat. Erst Toggle öffnen, dann Löschen klicken:
```typescript
await page.locator('#dropdown_group_edit a.dropdown-toggle').click();
page.once('dialog', (dialog) => dialog.accept());
await page.getByRole('link', { name: /^Löschen$/i }).click();
```

### Seitentitel

Die Seite hat zwei `<h1>`: Umgebungs-Banner + eigentlicher Titel. Immer den ersten in `main` ansprechen:
```typescript
await expect(page.locator('main h1, #main-content h1').first()).toContainText('...');
```

### Flash-Meldungen

```typescript
await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
await expect(page.locator('#flash .alert-danger')).toContainText('...');
```
Nicht `.alert` allein – auf jeder Seite gibt es globale Banner (Download, MailChimp).

### Untergruppen auf Gruppendetailseite

Untergruppen erscheinen im `#main`-Bereich (rechte Spalte der Infoansicht), nicht in `main`. Bei Link-Assertions:
```typescript
await expect(page.locator('#main').getByRole('link', { name: 'Gruppenname' })).toBeVisible();
```

### Bestätigungsdialoge

Hitobito verwendet native Browser-`confirm()`-Dialoge (via Turbo `data-confirm`):
```typescript
page.once('dialog', (dialog) => dialog.accept());
await page.getByRole('link', { name: /Löschen/i }).click();
```

### Session-Rotation bei Impersonation

Nach Impersonation rotiert Rails die Session-ID. Test muss am Schluss Imitation beenden und Session neu speichern:
```typescript
await page.getByRole('link', { name: 'Imitation beenden' }).click();
await page.context().storageState({ path: AUTH_FILE });
```

### Anlass löschen

Events verwenden **keine Dropdown-Toggles** (anders als Gruppen). Der Löschen-Link ist ein direkter Button auf der Detailseite:
```typescript
page.once('dialog', (dialog) => dialog.accept());
await page.getByRole('link', { name: /^Löschen$/i }).click();
```

### Anlass-Formular: Tab-Navigation

Das Anlass-Formular hat mehrere Tabs (allgemein, Daten, Anmeldung, Anmeldungsangaben, …). Die Datum-Felder sind im "Daten"-Tab, der erst geöffnet werden muss. Datum-Inputs sind `type="text"` mit class `date` und Format `DD.MM.YYYY`. `pressSequentially` statt `fill` verwenden, um JS-Events zu triggern:
```typescript
await page.locator('a[href="#dates"]').click();
const startAtInput = page.locator('input[id$="_start_at_date"]').first();
await startAtInput.pressSequentially('01.06.2026');
await startAtInput.blur();
```

### Anlass-Formular: Globale Fragen (Anmeldungsangaben-Tab)

Beim Erstellen eines Anlasses fügt hitobito automatisch globale `Event::Question`-Einträge hinzu (via `init_questions` im Controller). Diese haben ein Pflichtfeld `disclosure` (optional/required/hidden). Ohne Disclosure-Wert schlägt die Validierung fehl ("Anmeldungsangaben sind nicht gültig"). Im Test den "Anmeldungsangaben"-Tab öffnen und alle Radio-Buttons setzen:
```typescript
await page.locator('a[href="#application_questions"]').click();
const disclosureRadios = page.locator('input[name*="application_questions"][name*="disclosure"][value="optional"]');
const count = await disclosureRadios.count();
for (let i = 0; i < count; i++) {
  await disclosureRadios.nth(i).check();
}
```

### Personennamen in Tabellen

Hitobito zeigt Personennamen in Tabellen als **"Nachname Vorname"** (nicht "Vorname Nachname"). "E2E Leiter" erscheint in der Tabelle als `Leiter E2E`:
```typescript
await expect(page.locator('table')).toContainText('Leiter E2E');
```

### Person für Anlass anmelden (als Leiter)

Das Autocomplete-Widget (`data-provide="entity"`) funktioniert im headless-Browser nicht zuverlässig. Stattdessen direkt mit `person_id` in der URL navigieren – `build_entry` im RolesController weist die Person der Participation zu ohne Formular-Interaktion:
```typescript
await page.goto(
  `/groups/${GROUP_ID}/events/${eventId}/roles/new` +
  `?event_role[type]=Event%3A%3ARole%3A%3AParticipant` +
  `&event_role[person_id]=${PERSON_ID}`
);
await page.getByRole('button', { name: 'Speichern' }).first().click();
```
Nach dem Speichern leitet hitobito auf die **Participation-Detailseite** (nicht die Liste) um. Participation-ID aus URL extrahieren:
```typescript
await expect(page).toHaveURL(/\/participations\/\d+/);
const participationId = page.url().match(/\/participations\/(\d+)/)[1];
```

### Kurs-Liste URL

Die Kurs-Liste für eine Gruppe ist unter `/groups/:id/events/course` (collection action), **nicht** `/groups/:id/course`.

### Kurs erstellen: Kursart (kind_id) ist Pflichtfeld

Beim Erstellen eines Kurses ist `kind_id` Pflichtfeld. Das Select-Feld hat die ID `event_kind_id`. Da Index 0 "Bitte auswählen" ist, immer `{ index: 1 }` wählen:
```typescript
await page.locator('#event_kind_id').selectOption({ index: 1 });
```

### Kurs-Teilnahme via Roles-Controller: Status "applied", nicht "assigned"

Bei Kursen ist `supports_applications = true`. Wenn eine Teilnahme via Roles-Controller (`/roles/new?event_role[person_id]=...`) angelegt wird, erstellt `init_application` automatisch ein Application-Objekt. Dadurch setzt `default_participation_state` den Status auf "applied" (statt "assigned"). "applied" ist **nicht** in `active_participation_states`, daher erscheint die Person **nicht** in der normalen Teilnehmerliste (`/participations`), sondern im Application Market. Die Participation-Detailseite ist aber direkt per ID erreichbar:

```typescript
// Prüfung auf der Detailseite statt in der Tabelle:
await page.goto(`/groups/${GROUP_ID}/events/${eventId}/participations/${participationId}`);
await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E Leiter');
```

### Kurs erstellen: Geschäftsstelle als Anmeldestelle (application_contact)

Das hitobito_cevi-Wagon verlangt für Kurse eine `application_contact` – eine Geschäftsstelle-Untergruppe der kursgebenden Gruppe. Der Controller setzt sie automatisch, wenn genau eine Geschäftsstelle existiert. Ohne Geschäftsstelle schlägt die Validierung fehl ("Geschäftsstelle muss vorhanden sein da Anmeldungen an diese Adresse erfolgen"). Die Gruppe muss also eine Untergruppe vom Typ `Group::MitgliederorganisationGeschaeftsstelle` (bzw. dem entsprechenden `contact_group_type`) besitzen. Diese Untergruppe muss als Testdaten vorhanden sein und wird im Test nicht angelegt/gelöscht.

### Anlass-URL nach Erstellung merken

Nach dem Speichern kann eine Turbo-Weiterleitung stattfinden. Event-ID aus der URL sofort extrahieren und für spätere Navigationen verwenden:
```typescript
await expect(page).toHaveURL(/\/events\/\d+/);
const eventUrl = page.url();
const eventId = parseInt(eventUrl.match(/\/events\/(\d+)/)[1]);
// Später: await page.goto(`/groups/${GROUP_ID}/events/${eventId}`);
```

### Rechnungs-Empfänger: Vor-/Nachname statt `recipient_name`

Seit dem Hitobito-Update gibt es **kein** `invoice[recipient_name]`-Feld mehr. Der Empfängername ist aufgeteilt in `invoice[recipient_first_name]`, `invoice[recipient_last_name]` und `invoice[recipient_company_name]`. Strasse/Nr./PLZ/Ort heissen unverändert `recipient_street`/`recipient_housenumber`/`recipient_zip_code`/`recipient_town` (street ist jetzt ein Adress-Autocomplete, `.fill()` funktioniert aber weiterhin):
```typescript
await page.locator('input[name="invoice[recipient_first_name]"]').fill('E2E');
await page.locator('input[name="invoice[recipient_last_name]"]').fill('Test-Empfänger');
```

### Rechnungs-Land: Tom-Select-Widget

Das Land-Select (`#invoice_recipient_country`) ist jetzt ein Tom-Select-Widget (`data-controller="tom-select"`); das echte `<select>` ist visuell versteckt (`ts-hidden-accessible`), daher schlägt `selectOption` an der Sichtbarkeitsprüfung fehl. Stattdessen über das Control-Element öffnen und im Dropdown wählen. `getByRole('option', …)` matcht die nativen `<option>`-Elemente (CH kommt doppelt vor) – darum den Dropdown-Div ansprechen:
```typescript
await page.locator('#invoice_recipient_country-ts-control').click();
await page.locator('#invoice_recipient_country-ts-dropdown [data-value="CH"]').first().click();
```

### Rechnung als PDF: direkter Download statt async Export

Der PDF-Export im "Drucken"-Dropdown ist **kein asynchroner Export mit Spinner mehr** (`#file-download-spinner` / `#cancel_async_downloads` existieren nicht mehr). Die Links zeigen direkt auf `…/invoices/:id.pdf` und lösen ein synchrones `download`-Event aus:
```typescript
await page.locator('.dropdown-toggle', { hasText: 'Drucken' }).click();
const downloadPromise = page.waitForEvent('download');
await page.getByRole('link', { name: 'Rechnung inkl. Einzahlungsschein', exact: true }).click();
const download = await downloadPromise;
expect(download.suggestedFilename()).toMatch(/\.pdf$/);
```