# E2E Tests – cevi.db Integrationssystem

Playwright-Tests gegen https://cevi.puzzle.ch (Umgebung: INTEGRATION).

## Voraussetzungen

- Docker installiert
- `.env` Datei anlegen (siehe `.env.example`):
  ```
  HITOBITO_PASSWORD=...
  HITOBITO_TOTP_SECRET=...   # nur falls 2FA aktiv
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

**E2E Finanzen** (ID: 3556): Person mit Finanz-Berechtigung in E2E Jungschar (Gruppe 584). Wird für Rechnungs-Tests imitiert.

## Tests

| Datei | Beschreibung |
|---|---|
| `ortsgruppe-aufbau.spec.ts` | Ortsgruppe mit Untergruppen erstellen und löschen (als Admin) |
| `abos.spec.ts` | Mailing-List erstellen/löschen, An-/Abmeldung (als E2E AL) |
| `rechnungen.spec.ts` | Rechnungen erstellen, drucken, stornieren (als E2E Finanzen) |
| `quick-search.spec.ts` | Schnellsuche nach Personen |
| `bestandesmeldung.spec.ts` | Bestandesmeldung validieren |
| `spenderschutz.spec.ts` | Spender-Sichtbarkeitsschutz prüfen |
| `anlass.spec.ts` | Anlass erstellen und löschen (als E2E AL in E2E Jungschar) |
| `anlass-anmeldung.spec.ts` | Person (E2E Leiter) für Anlass anmelden und abmelden (als E2E AL) |
| `kurs.spec.ts` | Kurs erstellen und löschen (als E2E Mio Admin in E2E Mio) |
| `kurs-anmeldung.spec.ts` | Person (E2E Leiter) für Kurs anmelden und abmelden (als E2E Mio Admin) |

## Findings & Eigenheiten

Alle bekannten Selektoren, Eigenheiten und Code-Snippets stehen in **CLAUDE.md** (für AI-Agents optimiert). Relevante Highlights:

- **Impersonation**: Benutzer imitieren erfordert danach `storageState` neu speichern (Session-ID rotiert)
- **Mailing Lists**: Erstellen/Bearbeiten erfordert `layer_full`-Rechte in der Layer der Gruppe – Dachverband-Admin hat diese für Jungschar-Layer nicht, daher Impersonation als E2E AL nötig
- **Rechnungen**: PDF-Druck ist async (`#file-download-spinner`), Download vor Session-Speicherung via `#cancel_async_downloads` abbrechen
- **Spenderschutz**: Personen in Spender-Gruppen sind für normale Admins nicht sichtbar
