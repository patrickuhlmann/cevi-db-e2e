# UI-Test-Eigenheiten (Playwright)

Alle bekannten Selektoren, Eigenheiten und Code-Snippets für die Playwright-UI-Tests (`tests/`) gegen die cevi.db-Weboberfläche.

## Formularfelder

`getByLabel('Name')` ist nicht eindeutig – das Gruppenformular hat mehrere Felder die auf "Name" matchen (Name, Kurzname, SMS Benutzername). Immer `#group_name` verwenden:
```typescript
await page.locator('#group_name').fill(name);
```

## Gruppe löschen

Der Löschen-Link ist im "Bearbeiten"-Dropdown versteckt, das nur ein Caret-Toggle (kein sichtbarer Text) hat. Erst Toggle öffnen, dann Löschen klicken. Seit Release 2026-10 erscheint danach **kein** nativer `confirm()` mehr, sondern ein Bootstrap-Modal, in dem der Gruppenname zur Bestätigung eingetippt werden muss (der Button bleibt sonst `disabled`):
```typescript
await page.locator('#dropdown_group_edit a.dropdown-toggle').click();
await page.getByRole('link', { name: /^Löschen$/i }).click();
const dialog = page.getByRole('dialog');
await dialog.getByRole('textbox').fill(groupName);
await dialog.getByRole('button', { name: 'Gruppen und Rollen definitiv löschen' }).click();
```
Details zum Modal (Stimulus-Controller `confirm-deletion`): Der Vergleich ignoriert Gross/Kleinschreibung und Leerzeichen am Rand (`"  e2e lösch-test "` passt). Bei falschem Namen bleibt der Button `disabled`, Enter im Textfeld löst dann keinen Submit aus. "Abbrechen" ist ein Link (`getByRole('link', { name: 'Abbrechen' })`) und schliesst das Modal. Der Server prüft den Namen nicht, der Schutz ist rein clientseitig.

## Seitentitel

Die Seite hat zwei `<h1>`: Umgebungs-Banner + eigentlicher Titel. Immer den ersten in `main` ansprechen:
```typescript
await expect(page.locator('main h1, #main-content h1').first()).toContainText('...');
```

## Flash-Meldungen

```typescript
await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
await expect(page.locator('#flash .alert-danger')).toContainText('...');
```
Nicht `.alert` allein – auf jeder Seite gibt es globale Banner (Download, MailChimp).

## Untergruppen auf Gruppendetailseite

Untergruppen erscheinen im `#main`-Bereich (rechte Spalte der Infoansicht), nicht in `main`. Bei Link-Assertions:
```typescript
await expect(page.locator('#main').getByRole('link', { name: 'Gruppenname' })).toBeVisible();
```

## Bestätigungsdialoge

Hitobito verwendet für die meisten Löschaktionen (Anlässe, Teilnahmen, Abos) native Browser-`confirm()`-Dialoge (via Turbo `data-confirm`). Ausnahme: Gruppen löschen (eigenes Modal, siehe oben).

**Achtung:** Läuft ein `page.once('dialog', …)` ins Leere, weil stattdessen ein Modal erscheint, gibt es keinen Fehler – der Test scheitert erst an der nachfolgenden Flash-Assertion.
```typescript
page.once('dialog', (dialog) => dialog.accept());
await page.getByRole('link', { name: /Löschen/i }).click();
```

## Session-Rotation bei Impersonation

Nach Impersonation rotiert Rails die Session-ID. Test muss am Schluss Imitation beenden und Session neu speichern:
```typescript
await page.getByRole('link', { name: 'Imitation beenden' }).click();
await page.context().storageState({ path: AUTH_FILE });
```

## Anlass löschen

Events verwenden **keine Dropdown-Toggles** (anders als Gruppen). Der Löschen-Link ist ein direkter Button auf der Detailseite:
```typescript
page.once('dialog', (dialog) => dialog.accept());
await page.getByRole('link', { name: /^Löschen$/i }).click();
```

## Anlass-Formular: Tab-Navigation

Das Anlass-Formular hat mehrere Tabs (allgemein, Daten, Anmeldung, Anmeldungsangaben, …). Die Datum-Felder sind im "Daten"-Tab, der erst geöffnet werden muss. Datum-Inputs sind `type="text"` mit class `date` und Format `DD.MM.YYYY`. `pressSequentially` statt `fill` verwenden, um JS-Events zu triggern:
```typescript
await page.locator('a[href="#dates"]').click();
const startAtInput = page.locator('input[id$="_start_at_date"]').first();
await startAtInput.pressSequentially('01.06.2026');
await startAtInput.blur();
```

## Anlass-/Kurs-Formular: Kontaktperson mit E-Mail ist Pflicht

Seit Release 2026-10 (hitobito_cevi `cb750ab`, `Cevi::Event#assert_contact_with_valid_email`) braucht jeder Anlass und Kurs eine Kontaktperson **mit E-Mail-Adresse** (wird als Reply-To für Anlass-Mails verwendet). Ohne sie: "Kontaktperson mit gültiger E-Mail-Adresse muss vorhanden sein, …". Das Feld "Kontaktperson" im Tab "Allgemein" ist ein Personen-Autocomplete (`data-provide="entity"`) mit verstecktem `#event_contact_id`. Wie bei der Personenauswahl unten direkt das versteckte Feld setzen – Helper `setEventContact(page)` in `tests/event-form.ts`:
```typescript
await page.locator('#event_name').fill('…');
await setEventContact(page);
```
Als Kontakt wird immer E2E AL (3552, hat E-Mail) gesetzt, auch bei Kursen – E2E Mio Admin hat **keine** E-Mail-Adresse.

## Imitation im `afterEach` beenden

Jeder Spec, der imitiert, braucht ein `afterEach`, das die Imitation beendet. Scheitert ein Test während der Imitation, bleibt sonst die gespeicherte Session (`AUTH_FILE`) serverseitig im imitierten Zustand, und **alle folgenden Tests** schlagen fehl (z.B. "Imitieren"-Link nicht gefunden, fehlende Rechte) – ein einzelner echter Fehler sieht dann aus wie viele:
```typescript
test.afterEach(async ({ page }) => {
  if (await page.locator('.user-impersonation').isVisible()) {
    await stopImpersonation(page);
  }
});
```

## Anlass-Formular: Globale Fragen (Anmeldungsangaben-Tab)

Beim Erstellen eines Anlasses fügt hitobito automatisch globale `Event::Question`-Einträge hinzu (via `init_questions` im Controller). Diese haben ein Pflichtfeld `disclosure` (optional/required/hidden). Ohne Disclosure-Wert schlägt die Validierung fehl ("Anmeldungsangaben sind nicht gültig"). Im Test den "Anmeldungsangaben"-Tab öffnen und alle Radio-Buttons setzen:
```typescript
await page.locator('a[href="#application_questions"]').click();
const disclosureRadios = page.locator('input[name*="application_questions"][name*="disclosure"][value="optional"]');
const count = await disclosureRadios.count();
for (let i = 0; i < count; i++) {
  await disclosureRadios.nth(i).check();
}
```

## Personennamen in Tabellen

Hitobito zeigt Personennamen in Tabellen als **"Nachname Vorname"** (nicht "Vorname Nachname"). "E2E Leiter" erscheint in der Tabelle als `Leiter E2E`:
```typescript
await expect(page.locator('table')).toContainText('Leiter E2E');
```

## Person für Anlass anmelden (als Leiter)

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

## Kurs/Anlass duplizieren

Der Button "Duplizieren" auf der Detailseite führt auf `/groups/:id/events/new?source_id=<id>` (`EventsController#build_entry` → `Event#duplicate`). Übernommen werden alle Attribute (Name, Kursart, Kontaktperson, Anmeldungs-/Admin-Fragen), **nicht** übernommen werden Daten (`event_dates`), Status, Anmeldefristen und Teilnehmerzahlen. Im Test daher das Startdatum neu setzen; hat die Quelle keine Kontaktperson (z.B. Fixture "E2E API Kurs"), zusätzlich `setEventContact(page)` aufrufen:
```typescript
await page.getByRole('link', { name: 'Duplizieren' }).click();
await expect(page.locator('#event_name')).toHaveValue('E2E API Kurs');
await page.locator('#event_name').fill('E2E Kurs-Duplikat');
await setEventContact(page);
```

## Kurs-Liste URL

Die Kurs-Liste für eine Gruppe ist unter `/groups/:id/events/course` (collection action), **nicht** `/groups/:id/course`.

## Kurs erstellen: Kursart (kind_id) ist Pflichtfeld

Beim Erstellen eines Kurses ist `kind_id` Pflichtfeld. Das Select-Feld hat die ID `event_kind_id`. Da Index 0 "Bitte auswählen" ist, immer `{ index: 1 }` wählen:
```typescript
await page.locator('#event_kind_id').selectOption({ index: 1 });
```

## Kurs-Teilnahme via Roles-Controller: Status "applied", nicht "assigned"

Bei Kursen ist `supports_applications = true`. Wenn eine Teilnahme via Roles-Controller (`/roles/new?event_role[person_id]=...`) angelegt wird, erstellt `init_application` automatisch ein Application-Objekt. Dadurch setzt `default_participation_state` den Status auf "applied" (statt "assigned"). "applied" ist **nicht** in `active_participation_states`, daher erscheint die Person **nicht** in der normalen Teilnehmerliste (`/participations`), sondern im Application Market. Die Participation-Detailseite ist aber direkt per ID erreichbar:

```typescript
// Prüfung auf der Detailseite statt in der Tabelle:
await page.goto(`/groups/${GROUP_ID}/events/${eventId}/participations/${participationId}`);
await expect(page.locator('main h1, #main-content h1').first()).toContainText('E2E Leiter');
```

## Kurs erstellen: Geschäftsstelle als Anmeldestelle (application_contact)

Das hitobito_cevi-Wagon verlangt für Kurse eine `application_contact` – eine Geschäftsstelle-Untergruppe der kursgebenden Gruppe. Der Controller setzt sie automatisch, wenn genau eine Geschäftsstelle existiert. Ohne Geschäftsstelle schlägt die Validierung fehl ("Geschäftsstelle muss vorhanden sein da Anmeldungen an diese Adresse erfolgen"). Die Gruppe muss also eine Untergruppe vom Typ `Group::MitgliederorganisationGeschaeftsstelle` (bzw. dem entsprechenden `contact_group_type`) besitzen. Diese Untergruppe muss als Testdaten vorhanden sein und wird im Test nicht angelegt/gelöscht.

## Anlass-URL nach Erstellung merken

Nach dem Speichern kann eine Turbo-Weiterleitung stattfinden. Event-ID aus der URL sofort extrahieren und für spätere Navigationen verwenden:
```typescript
await expect(page).toHaveURL(/\/events\/\d+/);
const eventUrl = page.url();
const eventId = parseInt(eventUrl.match(/\/events\/(\d+)/)[1]);
// Später: await page.goto(`/groups/${GROUP_ID}/events/${eventId}`);
```

## Rechnungs-Empfänger: Vor-/Nachname statt `recipient_name`

Seit dem Hitobito-Update gibt es **kein** `invoice[recipient_name]`-Feld mehr. Der Empfängername ist aufgeteilt in `invoice[recipient_first_name]`, `invoice[recipient_last_name]` und `invoice[recipient_company_name]`. Strasse/Nr./PLZ/Ort heissen unverändert `recipient_street`/`recipient_housenumber`/`recipient_zip_code`/`recipient_town` (street ist jetzt ein Adress-Autocomplete, `.fill()` funktioniert aber weiterhin):
```typescript
await page.locator('input[name="invoice[recipient_first_name]"]').fill('E2E');
await page.locator('input[name="invoice[recipient_last_name]"]').fill('Test-Empfänger');
```

## Rechnungs-Land: Tom-Select-Widget

Das Land-Select (`#invoice_recipient_country`) ist jetzt ein Tom-Select-Widget (`data-controller="tom-select"`); das echte `<select>` ist visuell versteckt (`ts-hidden-accessible`), daher schlägt `selectOption` an der Sichtbarkeitsprüfung fehl. Stattdessen über das Control-Element öffnen und im Dropdown wählen. `getByRole('option', …)` matcht die nativen `<option>`-Elemente (CH kommt doppelt vor) – darum den Dropdown-Div ansprechen:
```typescript
await page.locator('#invoice_recipient_country-ts-control').click();
await page.locator('#invoice_recipient_country-ts-dropdown [data-value="CH"]').first().click();
```

## Rechnung als PDF: direkter Download statt async Export

Der PDF-Export im "Drucken"-Dropdown ist **kein asynchroner Export mit Spinner mehr** (`#file-download-spinner` / `#cancel_async_downloads` existieren nicht mehr). Die Links zeigen direkt auf `…/invoices/:id.pdf` und lösen ein synchrones `download`-Event aus:
```typescript
await page.locator('.dropdown-toggle', { hasText: 'Drucken' }).click();
const downloadPromise = page.waitForEvent('download');
await page.getByRole('link', { name: 'Rechnung inkl. Einzahlungsschein', exact: true }).click();
const download = await downloadPromise;
expect(download.suggestedFilename()).toMatch(/\.pdf$/);
```

## Rechnung direkt auf einer Person erstellen: zwei getrennte Berechtigungen nötig

Der "Rechnung erstellen"-Button auf der Personendetailseite (`invoice_button(people: [entry])`) verlangt serverseitig **zwei unabhängige Rechte**: `:finance` (Rechnung erstellen dürfen) UND `:update` auf die Person (damit der Empfänger automatisch verknüpft wird, `InvoicesController#new`: `if recipient && can?(:update, recipient)`). Die reine Finanzrolle (`Finanzverantwortlicher`) gewährt in diesem Wagon nur ein sehr eng gescoptes `:financials`-Recht (nur für Personen in Spender-Gruppen), **nicht** das allgemeine Personen-Update-Recht. E2E Finanzen braucht daher zusätzlich eine zweite Rolle mit `layer_and_below_full` (z.B. Adressverwalter/-in) in E2E Jungschar.

Selbst mit beiden Rechten ist der Button in der INTEGRATION-Umgebung als `<a class="disabled">` **ohne `href`** gerendert (`Dropdown::InvoiceNew#single_button` deaktiviert ihn, sobald `invoice_config.invalid?` ist – unabhängig von den Personen-Rechten). Ein Klick funktioniert daher nie; stattdessen direkt auf die vom Button erzeugte Ziel-URL navigieren:
```typescript
await page.goto(
  `/groups/${GROUP_ID}/invoices/new?invoice%5Brecipient_id%5D=${PERSON_ID}&invoice%5Brecipient_type%5D=Person`
);
```
Nur Vor-/Nachname werden vorausgefüllt; falls die Person keine Adresse hinterlegt hat (z.B. E2E AL), müssen Strasse/PLZ/Ort weiterhin manuell ausgefüllt werden (das Land ist dort als normales `<select>` bereits korrekt auf "Schweiz" vorausgewählt, kein Tom-Select-Klick nötig).

Ausserdem: nur **direkte Mitglieder** der in der URL verwendeten Gruppe sind über `/groups/:id/people/:person_id` erreichbar (404 sonst) – z.B. ist E2E Leiter Mitglied von "E2E Team" (Untergruppe), nicht direkt von "E2E Jungschar" (584), und daher unter `/groups/584/people/<E2E-Leiter-ID>` nicht erreichbar. E2E AL ist hingegen direktes Mitglied von 584.

## `<main>` ist auf manchen Seiten nur ein leerer Skip-Link-Anker

Auf Rechnungs-Detailseiten enthält `<main>` **nicht** den eigentlichen Seiteninhalt, sondern ist praktisch leer (nur Ziel des "Zum Hauptinhalt springen"-Links). Negative Prüfungen (`not.toContainText`) fallen dadurch unbemerkt immer grün aus; für positive Prüfungen gegen `body` prüfen:
```typescript
await expect(page.locator('body')).toContainText('Bezahlt');
```

## Zahlung erfassen: Toggle-Link und Submit-Button heissen identisch

Auf der Rechnungs-Detailseite öffnet ein Link "Zahlung erstellen" das Zahlungsformular (Collapse `#payment`); der Submit-Button **im Formular** trägt denselben Text "Zahlung erstellen" (nicht "Speichern"). Beim Button auf `#payment` scopen, um den Toggle-Link nicht versehentlich zu matchen:
```typescript
await page.getByRole('link', { name: 'Zahlung erstellen' }).click();
await page.getByLabel('Betrag').fill('42.00');
await page.locator('#payment').getByRole('button', { name: 'Zahlung erstellen' }).click();
```
Das Eingangsdatum ist bereits mit dem heutigen Datum vorausgefüllt. Die Erfolgsmeldung enthält **kein** Währungskürzel: `Zahlung über 42.00 wurde erfasst.` (nicht "CHF 42.00"). Eine Zahlung über den vollen offenen Betrag setzt den Status direkt auf "Bezahlt" – Rechnungen im Entwurfsstatus sind nicht zahlbar, vorher über "Rechnung stellen / mahnen" → "Status setzen (Gestellt/Gemahnt)" auf "gestellt" setzen.

## Personenname: Reihenfolge unterscheidet sich je nach Kontext

In Tabellen erscheint der Name als "Nachname Vorname" (siehe oben), im Rechnungs-Empfängerblock (Adressfeld) dagegen als "Vorname Nachname" (z.B. "E2E AL").

## Zusätzliche Adressen (Personen und Gruppen)

Seit hitobito/hitobito#4471 aktiv. Im Bearbeiten-Formular ist der Block ein Nested-Form `.nested-form[data-nested-form-assoc-value="additional_addresses"]`; bei **Gruppen** liegt er im Tab "Kontaktangaben" (`getByRole('tab', …)`, kein Link). Neuer Eintrag über den Link "Eintrag hinzufügen" im Nested-Form, die neuen Felder sind das letzte `.address-input-fields`. Felder per `name$="[…]"` ansprechen (die IDs enthalten bei neuen Einträgen einen Zufallsindex):
```typescript
const form = page.locator('.nested-form[data-nested-form-assoc-value="additional_addresses"]');
await form.getByRole('link', { name: 'Eintrag hinzufügen' }).click();
const fields = form.locator('.address-input-fields').last();
await fields.locator('select[name$="[category_id]"]').selectOption({ label: 'Andere' });
await fields.locator('input[name$="[street]"]').fill('Bahnhofstrasse');
```
- **Land ist Pflicht** ("Land muss ausgefüllt werden") und ein Tom-Select-Widget (wie bei Rechnungen): ID des versteckten `<select name$="[country]">` auslesen, dann `#<id>-ts-control` klicken und `#<id>-ts-dropdown [data-value="CH"]` wählen.
- **"Namen der Person/Gruppe übernehmen"** (`[uses_contactable_name]`) ist standardmässig aktiv; die Namensfelder sind dann ausgeblendet und werden erst nach `uncheck()` sichtbar.
- **"Bezeichnung" (`[label]`) wird beim Speichern verworfen** (Strong-Params-Fehler in hitobito, hitobito/hitobito#4609). Testeinträge darum nicht über die Bezeichnung, sondern z.B. über die Strasse identifizieren.
- Entfernen: in der Zeile (`.labeled.controls`) den Link `.remove_nested_fields` klicken und speichern.
- Anzeige: im ersten `<address>` als `"<Name>, <Strasse Nr>, <PLZ Ort>"`, gefolgt von der Kategorie (nur Kategorie, keine Bezeichnung) – direkt nach der Hauptadresse und vor den E-Mail-Adressen.

## Kanton (Person, Hauptadresse)

Seit hitobito_oeku#12 ein Core-Attribut der Person. Das Feld `#person_canton` (Tom-Select) steckt in einem `field-visibility`-Container, der nur bei Land `CH` sichtbar ist; beim Wechsel auf ein anderes Land wird der Kanton per JS geleert. Sichtbarkeit über das Label prüfen: `label[for="person_canton-ts-control"]`. Kantonswerte sind Kleinbuchstaben-Kürzel (`ag`, `be`, …).

Die E2E-Personen haben **kein Land** gesetzt (leer), dann ist das Kantonsfeld ausgeblendet, obwohl hitobito eine Person ohne Land als Schweizer behandelt (Bug, hitobito/hitobito#4610). Tests sollten am Schluss das Land wieder leeren.

Detailseite: Die Zeile "Kanton" (Cevi-Angaben) wird **immer** gerendert, ohne Wert mit leerem `<dd>`. Darum den Wert prüfen, nicht die Existenz der Zeile:
```typescript
const canton = page.locator('dt', { hasText: /^Kanton$/ }).locator('xpath=following-sibling::dd[1]');
await expect(canton).toHaveText('Aargau');
```

## Tom-Select: Auswahl ändern, wenn schon ein Wert gewählt ist

Das innere Input `#<id>-ts-control` ist nur klickbar, solange noch nichts gewählt ist. Danach schlägt der Klick fehl ("element is outside of the viewport"). Immer den umgebenden Container klicken:
```typescript
await page.locator(`.ts-control:has(#${selectId}-ts-control)`).click();
await page.locator(`#${selectId}-ts-dropdown [data-value="DE"]`).first().click();
```
Auswahl leeren (löst das `change`-Event aus wie eine Benutzereingabe): `await page.locator('#person_country').evaluate((el: any) => el.tomselect.clear());`

## Personen-Export (Einzelperson): synchroner Download

Auf der Personen-Detailseite hat das Export-Menü `#dropdown_people_export` verschachtelte Untermenüs (CSV / Excel / Etiketten …). Das Untermenü öffnet sich per Hover. Der Export einer **einzelnen** Person ist synchron (`…/people/:id.csv?details=true`) und löst direkt ein `download`-Event aus. Der Export der ganzen Personenliste läuft dagegen als Hintergrund-Job. CSV-Trennzeichen ist `;`, ein allfälliges BOM vor dem Parsen entfernen:
```typescript
await page.locator('#dropdown_people_export > .dropdown-toggle').click();
await page.locator('#dropdown_people_export').getByRole('link', { name: 'CSV', exact: true }).hover();
const downloadPromise = page.waitForEvent('download');
await page.locator('#dropdown_people_export').getByRole('link', { name: 'Alle Angaben' }).first().click();
const csv = fs.readFileSync(await (await downloadPromise).path(), 'utf-8').replace(/^\uFEFF/, '');
```

## Schnellsuche (`#quicksearch`)

- **Startseite `/` leitet auf die eigene Personenseite um** (`/groups/1/people/3549`). Ein `waitForURL(/\/people\/\d+/)` nach dem Absenden der Suche ist darum **sofort** erfüllt, und Negativprüfungen (`not.toContainText`) laufen ins Leere. Immer warten, bis sich die URL geändert hat (Helper `search()` in `tests/quick-search.spec.ts`). Bei genau einem Treffer leitet die Suche direkt auf die Personenseite weiter, sonst auf `/full?q=…`. Ohne Treffer zeigt `/full` "Keine Einträge gefunden".
- **Vorschlagsliste** (autoComplete.js): erscheint beim Tippen (`pressSequentially`, nicht `fill`). Einträge sind `#quicksearch ~ [role="listbox"] [role="option"]` mit dem Namen als Text ("E2E AL", Vorname zuerst). Ein Klick auf einen Eintrag öffnet die Person.
- **Suche über ID**: Eine Zahl findet die Person mit dieser Personennummer als ersten Treffer. Danach folgen Volltext-Treffer, die dieselbe Zahl in anderen Feldern enthalten. Bei einer ID ist darum oft mehr als ein Treffer vorhanden, und es gibt keine direkte Weiterleitung.

## CSV-Import von Personen

Ablauf: `/groups/:id/csv_imports/new` → Datei per `setInputFiles` (Buffer, Trennzeichen `;`) → Button "Hochladen" → `define_mapping` (Rolle `#role_type`, Zuordnung `select[name="field_mappings[<Spaltenname>]"]`, Option `update_behaviour` = `keep`/`override`) → "Vorschau" → `preview` → "Personen jetzt importieren" (ein `<input type=submit>`, darum `getByRole('button', { name })`) → Weiterleitung auf die Personenliste der Gruppe mit gesetztem Rollenfilter. Die Zählung steht im Flash: "1 Person (Mitarbeiter/-in) wird aktualisiert." / "wird neu importiert." bzw. nach dem Import "wurde erfolgreich aktualisiert." / "wurde erfolgreich importiert.".

- Eine bestehende Rolle desselben Typs in derselben Gruppe wird **nicht** doppelt angelegt. Ein Import von E2E Leiter mit "Mitarbeiter/-in" in E2E Team (585) ändert darum nur die Personendaten.
- Personennummer (`id`): nur mit Admin-Recht als Option vorhanden. Der Header "Personennummer" wird automatisch auf `id` gemappt.
- **Neue Person mit vorgegebener ID testen, ohne die ID-Sequenz zu verschieben:** Nach einem Import mit IDs setzt hitobito die Sequenz auf `max(id)`, falls sie dahinter liegt. Eine willkürlich hohe ID würde darum alle künftigen IDs auf INTEGRATION verschieben. Stattdessen eine Person normal importieren (sie bekommt die nächste ID), löschen und diese freie ID für den Import verwenden.
- Person löschen (nur mit Admin-Recht): Auf der Personenseite gibt es mehrere "Löschen"-Links (auch pro Rolle). Den Button `a.btn-danger[data-method="delete"]` verwenden, Bestätigung per nativem `confirm()`.

## Eventvorlagen

- Verwaltung unter `/groups/:id/event_templates` (Bearbeiten-Dropdown → "Eventvorlagen", nur auf Ebenen-Gruppen und nur mit `layer_full`/`layer_and_below_full` in **dieser** Ebene; für E2E Jungschar also E2E AL imitieren, für E2E Mio E2E Mio Admin). Neue Vorlage über "Anlass Vorlage erstellen" bzw. "Kurs Vorlage erstellen". Das Formular ist das normale Anlass-Formular (inkl. leerem Tab "Daten") plus Checkbox `#event_inherit` ("Vererbung"). Nach dem Speichern geht es zurück zur Vorlagenliste, auch bei "Als Vorlage speichern" mit `return_url`. Kontaktperson (`setEventContact`) und Disclosure der globalen Fragen sind wie beim Anlass Pflicht.
- Vorlagenliste: Tabelle mit Name, Typ ("Anlass"/"Kurs"), Vererbung ("ja"/"nein"), Löschen-Icon `a[data-method="delete"]` mit nativem `confirm()`.
- **"Anlass erstellen"/"Kurs erstellen" wird zum Split-Dropdown**, sobald für die Gruppe Vorlagen verfügbar sind (eigene oder vererbte). Dann gibt es zwei Elemente mit diesem Namen (Hauptlink + Toggle). Vorlage wählen:
  ```typescript
  const dropdown = page.locator('.btn-group.dropdown', { hasText: 'Anlass erstellen' });
  await dropdown.locator('.dropdown-toggle').click();
  await dropdown.locator('.dropdown-menu').getByRole('link', { name: 'E2E Anlass-Vorlage' }).click();
  ```
  Führt auf `…/events/new?source_id=<vorlage>`. Alle Angaben ausser den Daten sind übernommen, die Fragen inkl. Disclosure ebenfalls. Nur das Startdatum muss neu gesetzt werden. **Achtung:** Bleiben Vorlagen in E2E Jungschar/E2E Mio liegen, kann `getByRole('link', { name: /Anlass erstellen/ })` in `anlass.spec.ts` mehrdeutig werden. Darum räumen alle Vorlagen-Tests am Anfang und am Ende auf.
- Nach dem Speichern über `waitForURL`/`toHaveURL` auf die Zielseite warten. `waitForLoadState()` direkt nach dem Klick liefert oft noch die alte URL.

## Anmeldefragen: Sichtbarkeit der Antworten ("Einsehbar für")

- Jede Frage im Tab "Anmeldungsangaben" (`#application_questions`) bzw. "Administrationsangaben" hat Checkboxen `input[name$="[visible_role_types][]"]` mit dem Rollentyp als `value` (`Event::Role::AssistantLeader` = Leitung, `Cook`, `Helper`, `Treasurer`, `Speaker`, `Participant`). Die Hauptleitung (`Event::Role::Leader`, einzige Cevi-Rolle mit `participations_full`) fehlt, sie sieht immer alles. Das Label "Einsehbar für" hat ein `for` mit Leerzeichen und passt zu keinem Feld, darum nicht über `getByLabel` gehen.
- Eigene Frage hinzufügen: Link "Eintrag hinzufügen" im Tab. Die neue Frage ist der letzte `#application_questions_fields > .fields`-Block, Fragetext in `textarea[name$="[question]"]`. Im Bearbeiten-Formular eine bestehende Frage über `.fields` mit `has: textarea` und `hasText` finden.
- Antworten erfassen: Teilnahme bearbeiten (`…/participations/:id/edit`), Freitext-Antworten über `getByLabel('<Fragetext>')`.
- Zweite Rolle für eine Person, die schon teilnimmt (`roles/new?event_role[person_id]=…`): Die Rolle wird zur bestehenden Teilnahme hinzugefügt, die Weiterleitung geht dann auf die **Teilnehmerliste**, nicht auf die Teilnahme.
- Imitieren über `/people/:id` (leitet auf die Hauptgruppe weiter), dann muss die Gruppe der Person nicht bekannt sein. E2E Mami kann der Admin wie E2E Kind nicht sehen und darum nicht imitieren.

## Validierungsfehler mehrmals hintereinander prüfen

Ein Formular, das nach einem Validierungsfehler erneut abgeschickt wird, zeigt die alte Fehlermeldung, bis die Antwort neu gerendert ist. `expect(...).toContainText(<Fehler>)` ist dann sofort erfüllt, und die nächsten Eingaben landen noch auf der alten Seite (z.B. gesetzte `#event_contact_id` geht verloren). Darum beim Speichern auf die POST-Antwort warten:
```typescript
await Promise.all([
  page.waitForResponse((response) => response.request().method() === 'POST'),
  page.getByRole('button', { name: 'Speichern' }).first().click(),
]);
await page.waitForLoadState('networkidle');
```
Als Kontaktperson ohne E-Mail eignet sich E2E Mami (3553), sie ist für E2E AL sichtbar. E2E Mio Admin hat zwar auch keine E-Mail, darf von E2E AL aber nicht gesehen werden ("Kontaktperson Zugriff verweigert").

## Kurs-Qualifikationen erfassen (`/groups/:id/events/:id/qualifications`)

- Die Seite gibt es nur bei einer **qualifizierenden Kursart** (sonst 404). E2E API Kurs (Kursart GLK1) vergibt z.B. keine. Für Tests Kursart 8 "MIRA BK" verwenden (`#event_kind_id` → `selectOption('8')`), sie vergibt "MIRA Basiskurs".
- Auf der Seite erscheinen nur **aktive** Teilnahmen. Eine Anmeldung über `roles/new` ist bei Kursen "applied" und muss zuerst im Anmeldungs-Markt zugeteilt werden: `/application_market` → in `#applications` die Zeile der Person → Pfeil-Link `a:has(.fa-arrow-left)` → im Modal `#email-confirmation-modal` den Link "Bestätigen ohne E-Mail". Danach steht die Person in `#participants`.
- Pro Person (Zeile, z.B. `filter({ hasText: 'Leiter E2E' })`) Radios mit `aria-label` "Bestanden", "Nicht bestanden", "Nicht beurteilt" und ein Textfeld "Kommentar". Wichtig: `getByRole('radio', { name: 'Bestanden', exact: true })`, sonst passt auch "Nicht bestanden". Speichern mit "Qualifikationen aktualisieren", Flash "Die Qualifikationen wurden erfolgreich aktualisiert."
- **Sichtbarkeit im Verlauf** (`/groups/:gid/people/:id/history`): hitobito_youth zeigt Qualifikation und Kommentar erst, wenn der Kurs-Status "Qualifikationen erfasst" (`completed`) oder "Abgeschlossen" (`closed`) ist. Status über das Kursformular `#event_state` setzen. `closed` meiden: Der Wechsel darauf setzt alle Teilnahmen auf "attended". Die Zeile der Teilnahme ist `tr[id^="event_participation_"]` (auf derselben Seite gibt es auch die Tabelle "Qualifikationen" mit dem Kursnamen als Ursprung), der Kommentar steckt im `title` des Info-Icons.
- Aufräumen: Status zurück auf `created`, Qualifikation auf "Nicht beurteilt" setzen (entfernt die vergebene Qualifikation bei der Person), dann den Kurs löschen.

## Rechnungslisten-Export (Hintergrund-Job, Jobübersicht)

- Rechnungen anwählen: `input[name="ids[]"][value="<invoiceId>"]` in `/groups/:id/invoices`. Die Export-Links haben `data-checkable` und exportieren dann nur die angewählten Rechnungen.
- Menü: `.dropdown-toggle` mit Text "Export" → Untermenü "CSV"/"Excel" per Hover (`.dropdown-menu a` mit Text `/^CSV$/`) → "Rechnungen", "Rechnungsposten" (`a[href*="invoices.csv?invoice_items=true"]`), "Nicht zuordenbare Zahlungen".
- Der Export ist **asynchron**: Flash mit Link auf die Jobübersicht, Datei danach unter `/job_observations`. Jeder Job ist ein `[id^="job_observation_"]`-Block, der neueste zuoberst, mit Download-Link `a[href$="/download"]` sobald fertig. Vor dem Export die höchste Job-ID merken und dann mit `expect(async () => { … }).toPass()` und neuem `page.goto('/job_observations')` warten, bis ein neuerer Job mit Download-Link da ist (der Name "Rechnungs-Export" ist für beide Rechnungs-Exporte gleich). Der Download ist synchron (`download`-Event).
- CSV: Trennzeichen `;`, Felder in Anführungszeichen, die Empfänger-Adresse enthält Zeilenumbrüche. Darum einen kleinen Parser verwenden statt `split('\n')` (siehe `parseCsv` in `tests/rechnungsposten-export.spec.ts`).
- Stornierte Rechnungen verschwinden aus der Liste (Status-Filter "Alle"), darum kann ein Aufräumen per Titel stornieren, bis keine Zeile mehr übrig ist. Stornieren geht in jedem Status, auch bei bezahlten Rechnungen. Alle Rechnungs-Specs räumen ihre Testrechnungen darum auch **am Anfang** auf (`cancelTestInvoices` in `rechnungen.spec.ts`), sonst sammeln sich nach abgebrochenen Läufen Entwürfe an.
