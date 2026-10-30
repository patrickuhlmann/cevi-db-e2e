# E2E Tests – cevi.db Integrationssystem

Playwright-Tests gegen https://cevi.puzzle.ch (Umgebung: INTEGRATION). Zwei Suiten:
- `tests/` – Browser-basierte UI-Tests
- `api-tests/` – API-Smoke-Tests gegen die hitobito JSON:API (kein Browser, kein Login)

## Voraussetzungen

- Docker installiert
- `.env` Datei anlegen (siehe `.env.example`):
  ```
  HITOBITO_PASSWORD=...
  HITOBITO_TOTP_SECRET=...   # nur falls 2FA aktiv
  HITOBITO_API_TOKEN=...     # Service Token für api-tests/, siehe Abschnitt "API-Tests"
  ```

## Testdaten

Alle Tests basieren auf einer fixen Teststruktur auf dem Integrationssystem:

| Gruppe | Typ | Inhalt |
|---|---|---|
| E2E Mio (ID: 582) | Mitgliederorganisation | Dachgruppe |
| └ E2E Geschäftsstelle (ID: 619) | MitgliederorganisationGeschaeftsstelle | Person: E2E GS Mitarbeiter (ID: 3558) |
| └ E2E Ortsgruppe (ID: 583) | Ortsgruppe | Person: E2E OG Admin (ID: 3715, Rolle Administrator/-in Cevi DB) |
| &nbsp;&nbsp;└ E2E Jungschar (ID: 584) | Jungschar | |
| &nbsp;&nbsp;&nbsp;&nbsp;├ E2E Eltern (ID: 587) | Untergruppe | Person: E2E Mami (ID: 3553, keine E-Mail-Adresse, Adresse Teststrasse 2, 8000 Zürich, CH) |
| &nbsp;&nbsp;&nbsp;&nbsp;├ E2E Fröschli (ID: 586) | Untergruppe | Person: E2E Kind (ID: 3554) |
| &nbsp;&nbsp;&nbsp;&nbsp;├ E2E Spender (ID: 588) | Untergruppe | 1 Spender (versteckt) |
| &nbsp;&nbsp;&nbsp;&nbsp;└ E2E Team (ID: 585) | Untergruppe | Person: E2E Leiter (ID: 3550, Rolle Mitarbeiter/-in), E2E AL (ID: 3552) |

**E2E Admin** (e2e-cevidb@cevimail.ch): Administrator auf Ebene Cevi Schweiz (Dachverband).

**E2E Kind** (ID: 3554): Kind in E2E Fröschli. Für E2E Admin (Dachverband) nicht sichtbar, für E2E AL (Jungschar) schon. Wird in `quick-search.spec.ts` für die Suche nach Name und ID verwendet.

**E2E OG Admin** (ID: 3715): Administrator/-in Cevi DB in E2E Ortsgruppe (Gruppe 583), ohne E-Mail-Adresse. Die Rolle hat `layer_and_below_full` und `see_invisible_from_above`, die Person sieht darum E2E Kind. Wird in `unsichtbar-von-oben.spec.ts` imitiert.

**E2E Mio Admin** (ID: 3557): Administrator/-in in E2E Mio (Gruppe 582). Wird für Kurs-Tests imitiert. Hat keine E-Mail-Adresse und kann darum nicht Kontaktperson von Anlässen/Kursen sein.

**E2E Finanzen** (ID: 3556): Person mit Finanz-Berechtigung (Finanzverantwortliche/-r) sowie zusätzlich Adressverwalter/-in in E2E Jungschar (Gruppe 584). Wird für Rechnungs-Tests imitiert. Die zweite Rolle (layer_and_below_full) ist nötig, damit die Person-zu-Person-Rechnungserstellung (Empfänger-Vorausfüllung) funktioniert – die reine Finanzrolle gewährt kein Personen-Update-Recht, das dafür serverseitig verlangt wird.

**E2E Mami** (ID: 3553): Hat keine E-Mail-Adresse (Kontaktperson-Test), aber eine vollständige Adresse. Sie ist die einzige Testperson mit Adresse und darum Empfängerin des Rechnungslaufs in `rechnungen-herkunft.spec.ts` (Personen ohne PLZ/Ort/Land überspringt ein Rechnungslauf stillschweigend). Fehlt die Adresse, setzt der Test sie wieder.

**Kursart "MIRA BK"** (ID: 8, global unter `/event_kinds`): Vergibt Teilnehmenden die Qualifikation "MIRA Basiskurs". Wird in `qualifikation-kommentar.spec.ts` verwendet, weil die Qualifikationsseite eines Kurses nur bei einer qualifizierenden Kursart existiert. Sie vergibt genau eine Qualifikation und keine Verlängerungen.

### Fixtures für `api-tests/` (und `kurs-duplizieren.spec.ts`, `eventvorlagen.spec.ts`)

Permanente, manuell angelegte Events (im Gegensatz zu den UI-Tests, die ihre Events selbst erstellen/löschen – siehe `docs/api-testing.md`). "E2E API Kurs" dient zusätzlich als Quelle für `kurs-duplizieren.spec.ts` (nur gelesen; Name und Kursart GLK1 werden im Test erwartet):

| Fixture | Event-ID | Gruppe | Teilnehmer |
|---|---|---|---|
| E2E API Anlass | 1458 | E2E Jungschar (584) | E2E AL (3552) |
| E2E API Kurs | 1459 | E2E Mio (582) | Person 3550 |

## Tests

| Datei | Beschreibung |
|---|---|
| `ortsgruppe-aufbau.spec.ts` | Ortsgruppe mit Untergruppen erstellen und löschen (als Admin) |
| `gruppe-loeschen.spec.ts` | Schutz beim Gruppe-Löschen: Button erst nach Eingabe des Gruppennamens aktiv, falscher Name/Enter/Abbrechen löscht nicht (als Admin, Testgruppe unter E2E Mio) |
| `abos.spec.ts` | Mailing-List erstellen/löschen, An-/Abmeldung (als E2E AL) |
| `rechnungen.spec.ts` | Rechnungen erstellen, drucken, per Mail versenden, direkt auf Person erstellen, Zahlung erfassen, stornieren (als E2E Finanzen) |
| `quick-search.spec.ts` | Schnellsuche nach Personen über Name und ID (Personennummer); E2E Kind ist für den Admin nicht auffindbar, für E2E AL (imitiert) schon |
| `bestandesmeldung.spec.ts` | Bestandesmeldung validieren |
| `bestandesmeldung-bearbeiten.spec.ts` | Mitgliederzahlen der aktuellen Bestandesmeldung bei E2E Jungschar erfassen (Jahrgänge 2015/2016), ändern, ungültiger Wert wird nicht gespeichert, alle Zahlen wieder löschen (als Admin) |
| `spenderschutz.spec.ts` | Spender-Sichtbarkeitsschutz prüfen |
| `anlass.spec.ts` | Anlass erstellen und löschen (als E2E AL in E2E Jungschar) |
| `anlass-anmeldung.spec.ts` | Person (E2E Leiter) für Anlass anmelden und abmelden (als E2E AL) |
| `kurs.spec.ts` | Kurs erstellen und löschen (als E2E Mio Admin in E2E Mio) |
| `kurs-anmeldung.spec.ts` | Person (E2E Leiter) für Kurs anmelden und abmelden (als E2E Mio Admin) |
| `kurs-duplizieren.spec.ts` | Bestehenden Kurs (E2E API Kurs) duplizieren und Duplikat löschen (als E2E Mio Admin) |
| `eventvorlagen.spec.ts` | Eventvorlagen: Anlass-Vorlage erstellen und Anlass daraus erstellen, E2E API Anlass als Vorlage speichern (als E2E AL); E2E API Kurs als Vorlage speichern und Kurs daraus erstellen; vererbte Vorlage aus E2E Mio in E2E Jungschar verfügbar (als E2E Mio Admin / E2E AL) |
| `kontaktperson.spec.ts` | Anlass ohne Kontaktperson und mit Kontaktperson ohne E-Mail (E2E Mami) wird abgelehnt, mit E2E AL gespeichert (als E2E AL) |
| `hilfetexte.spec.ts` | Hilfetext für Person/Feld "Titel" mit "initial Anzeigen": im Personenformular (E2E Leiter) sofort sichtbar; ohne die Option versteckt und per Info-Icon einblendbar; Hilfetext wird gelöscht (als Admin) |
| `ebics.spec.ts` | Rechnungseinstellungen, Tab "Zahlungsschnittstellen": pro Bank ein Abschnitt EBICS 3.0 und einer EBICS 2.5 (nur lesend, als E2E Finanzen) |
| `rechnungen-herkunft.spec.ts` | Menüpunkt "Rechnungen" statt "Einzelrechnungen"; Einzelrechnung und Rechnungslauf (an E2E Mami) erscheinen gemeinsam in der Liste; Filter "Einzelrechnungen" / "aus Rechnungsläufen", gemerkt bei `returning=true`; Lauf löschen, Rechnung stornieren (als E2E Finanzen) |
| `rechnungsposten-export.spec.ts` | Rechnung mit zwei Posten erstellen, nur diese als CSV "Rechnungsposten" exportieren, Datei aus der Jobübersicht laden: eine Zeile pro Posten mit Name/Anzahl/Preis/Total und Rechnungstitel; Rechnung stornieren (als E2E Finanzen) |
| `qualifikation-kommentar.spec.ts` | Kurs mit Kursart MIRA BK (als E2E Mio Admin), E2E Leiter zuteilen, Qualifikation "Bestanden" mit Kommentar erfassen, Status "Qualifikationen erfasst"; E2E Leiter sieht Kommentar als Tooltip im Verlauf; Qualifikation wird beim Aufräumen zurückgenommen |
| `antwort-sichtbarkeit.spec.ts` | Sichtbarkeit von Antworten: Anlass mit einer für die Leitung freigegebenen und einer nicht freigegebenen Frage (als E2E AL), E2E Mami als Teilnehmerin; E2E Leiter sieht als Leitung nur die freigegebene Antwort, mit zusätzlicher Rolle Hauptleitung alle |
| `zusaetzliche-adressen.spec.ts` | Zusätzliche Adresse bei Person (E2E AL) und Gruppe (E2E Jungschar) erfassen, Anzeige prüfen und wieder entfernen (als Admin) |
| `kanton.spec.ts` | Kanton bei E2E AL: Feld nur bei Land Schweiz, speichern/anzeigen, bei Ausland geleert; kein Kanton bei zusätzlichen Adressen (als Admin) |
| `personennummer.spec.ts` | Personennummer von E2E AL auf der Detailseite und als erste Spalte im CSV-Export "Alle Angaben" (als Admin) |
| `kontaktangaben-kategorien.spec.ts` | Bei E2E Leiter Telefonnummer (mit Ergänzung) und weitere E-Mail mit Kategorie "Mutter" erfassen, Anzeige und Spalten im CSV-Export "Alle Angaben" prüfen, zweite Telefonnummer "Mutter" wird abgelehnt, Einträge entfernen (als Admin) |
| `ausbildung-sortierung.spec.ts` | Ausbildungs-Liste von E2E Jungschar nach Person, Qualifikationen und Geburtstag auf- und absteigend sortieren; E2E AL und E2E Finanzen bekommen dafür vorübergehend einen Geburtstag und die Qualifikation "Quali SiBe-Test" (als Admin) |
| `unsichtbar-von-oben.spec.ts` | E2E OG Admin (Administrator/-in Cevi DB in E2E Ortsgruppe, imitiert) sieht E2E Kind, das für den Admin unsichtbar ist, bearbeitet Ceviname und Rollen-Bezeichnung und kann Verwalter*innen zuweisen; Änderungen werden zurückgesetzt |
| `csv-import.spec.ts` | CSV-Import in E2E Team mit Personennummer: E2E Leiter über die ID aktualisieren, neue Person mit vorgegebener ID erstellen und löschen, Abbruch bei doppelter ID (als Admin); keine ID-Zuordnung ohne Admin-Recht (als E2E AL) |

## API-Tests

`api-tests/` testet die hitobito JSON:API (`/api/*`) per Service Token, ohne Browser/Login. Ausführen mit `tooling/docker.sh test --config=api-tests/playwright.config.api.ts`.

| Datei | Beschreibung |
|---|---|
| `groups.spec.ts` | Gruppendetails abrufen (E2E Mio) |
| `people.spec.ts` | Persondetails abrufen (E2E AL) |
| `events.spec.ts` | Anlass- und Kurs-Details abrufen |
| `participations.spec.ts` | Teilnehmer eines Anlasses und eines Kurses abrufen |
| `errors.spec.ts` | Fehlerfälle: falsches Token (401), nicht existierende ID (404) |

Benötigt einen Service Token (`HITOBITO_API_TOKEN`), erstellt in hitobito auf Layer **E2E Mio (582)** mit Permission **`layer_and_below_read`** und Scopes **`groups`, `people`, `events`, `event_participations`**. Details siehe `docs/api-testing.md`.

## Findings & Eigenheiten

Alle bekannten Selektoren, Eigenheiten und Code-Snippets stehen in **`docs/ui-testing.md`** (UI-Tests) und **`docs/api-testing.md`** (API-Tests) – für AI-Agents optimiert. Relevante Highlights:

- **Impersonation**: Benutzer imitieren erfordert danach `storageState` neu speichern (Session-ID rotiert); jeder imitierende Spec braucht ein `afterEach`, das die Imitation beendet, sonst schlagen nach einem Fehler alle Folgetests fehl
- **Anlässe/Kurse**: Kontaktperson mit E-Mail ist Pflicht – Tests setzen immer E2E AL (3552) als Kontakt (`tests/event-form.ts`)
- **Gruppe löschen**: Bestätigung über Modal mit Eingabe des Gruppennamens statt `confirm()`
- **Mailing Lists**: Erstellen/Bearbeiten erfordert `layer_full`-Rechte in der Layer der Gruppe – Dachverband-Admin hat diese für Jungschar-Layer nicht, daher Impersonation als E2E AL nötig
- **Rechnungen**: PDF-Druck ist ein direkter, synchroner Download (`…/invoices/:id.pdf`), kein async Export mehr
- **Rechnung direkt auf einer Person**: Der "Rechnung erstellen"-Button auf der Personendetailseite ist in der INTEGRATION-Umgebung als deaktivierter Link (kein `href`) gerendert, da `invoice_config.invalid?` für die Finanzgruppe zutrifft – unabhängig von den Personen-Rechten. Daher direkt auf `/groups/:id/invoices/new?invoice[recipient_id]=...&invoice[recipient_type]=Person` navigieren statt den Button zu klicken.
- **Spenderschutz**: Personen in Spender-Gruppen sind für normale Admins nicht sichtbar
- **API-Tests**: Kurs ist kein eigener Endpoint (STI-Subtyp von Event, läuft über `/api/events/:id`); Teilnehmer über `/api/event_participations?filter[event_id]=...`, gefiltert auf `active: true`
