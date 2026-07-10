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
| └ E2E Ortsgruppe | Ortsgruppe | |
| &nbsp;&nbsp;└ E2E Jungschar (ID: 584) | Jungschar | |
| &nbsp;&nbsp;&nbsp;&nbsp;├ E2E Eltern | Untergruppe | Person: E2E Mami |
| &nbsp;&nbsp;&nbsp;&nbsp;├ E2E Fröschli | Untergruppe | Person: E2E Kind |
| &nbsp;&nbsp;&nbsp;&nbsp;├ E2E Spender (ID: 588) | Untergruppe | 1 Spender (versteckt) |
| &nbsp;&nbsp;&nbsp;&nbsp;└ E2E Team | Untergruppe | Person: E2E Leiter, E2E AL (ID: 3552) |

**E2E Admin** (e2e-cevidb@cevimail.ch): Administrator auf Ebene Cevi Schweiz (Dachverband).

**E2E Mio Admin** (ID: 3557): Administrator/-in in E2E Mio (Gruppe 582). Wird für Kurs-Tests imitiert.

**E2E Finanzen** (ID: 3556): Person mit Finanz-Berechtigung (Finanzverantwortliche/-r) sowie zusätzlich Adressverwalter/-in in E2E Jungschar (Gruppe 584). Wird für Rechnungs-Tests imitiert. Die zweite Rolle (layer_and_below_full) ist nötig, damit die Person-zu-Person-Rechnungserstellung (Empfänger-Vorausfüllung) funktioniert – die reine Finanzrolle gewährt kein Personen-Update-Recht, das dafür serverseitig verlangt wird.

### Fixtures für `api-tests/`

Permanente, manuell angelegte Events (im Gegensatz zu den UI-Tests, die ihre Events selbst erstellen/löschen – siehe `docs/api-testing.md`):

| Fixture | Event-ID | Gruppe | Teilnehmer |
|---|---|---|---|
| E2E API Anlass | 1458 | E2E Jungschar (584) | E2E AL (3552) |
| E2E API Kurs | 1459 | E2E Mio (582) | Person 3550 |

## Tests

| Datei | Beschreibung |
|---|---|
| `ortsgruppe-aufbau.spec.ts` | Ortsgruppe mit Untergruppen erstellen und löschen (als Admin) |
| `abos.spec.ts` | Mailing-List erstellen/löschen, An-/Abmeldung (als E2E AL) |
| `rechnungen.spec.ts` | Rechnungen erstellen, drucken, per Mail versenden, direkt auf Person erstellen, Zahlung erfassen, stornieren (als E2E Finanzen) |
| `quick-search.spec.ts` | Schnellsuche nach Personen |
| `bestandesmeldung.spec.ts` | Bestandesmeldung validieren |
| `spenderschutz.spec.ts` | Spender-Sichtbarkeitsschutz prüfen |
| `anlass.spec.ts` | Anlass erstellen und löschen (als E2E AL in E2E Jungschar) |
| `anlass-anmeldung.spec.ts` | Person (E2E Leiter) für Anlass anmelden und abmelden (als E2E AL) |
| `kurs.spec.ts` | Kurs erstellen und löschen (als E2E Mio Admin in E2E Mio) |
| `kurs-anmeldung.spec.ts` | Person (E2E Leiter) für Kurs anmelden und abmelden (als E2E Mio Admin) |

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

- **Impersonation**: Benutzer imitieren erfordert danach `storageState` neu speichern (Session-ID rotiert)
- **Mailing Lists**: Erstellen/Bearbeiten erfordert `layer_full`-Rechte in der Layer der Gruppe – Dachverband-Admin hat diese für Jungschar-Layer nicht, daher Impersonation als E2E AL nötig
- **Rechnungen**: PDF-Druck ist async (`#file-download-spinner`), Download vor Session-Speicherung via `#cancel_async_downloads` abbrechen
- **Rechnung direkt auf einer Person**: Der "Rechnung erstellen"-Button auf der Personendetailseite ist in der INTEGRATION-Umgebung als deaktivierter Link (kein `href`) gerendert, da `invoice_config.invalid?` für die Finanzgruppe zutrifft – unabhängig von den Personen-Rechten. Daher direkt auf `/groups/:id/invoices/new?invoice[recipient_id]=...&invoice[recipient_type]=Person` navigieren statt den Button zu klicken.
- **Spenderschutz**: Personen in Spender-Gruppen sind für normale Admins nicht sichtbar
- **API-Tests**: Kurs ist kein eigener Endpoint (STI-Subtyp von Event, läuft über `/api/events/:id`); Teilnehmer über `/api/event_participations?filter[event_id]=...`, gefiltert auf `active: true`
