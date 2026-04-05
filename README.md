# E2E Tests – cevi.db Integrationssystem

Playwright-Tests gegen https://cevi.puzzle.ch (Umgebung: INTEGRATION).

## Voraussetzungen

- Docker installiert
- `.env` Datei angelegt (siehe `.env.example`):
  ```
  HITOBITO_PASSWORD=...
  HITOBITO_TOTP_SECRET=...   # nur falls 2FA aktiv
  ```

## Tests ausführen

```bash
# Alle Tests
./run.sh

# Einzelne Datei
./run.sh tests/abos.spec.ts

# Nach Testname filtern
./run.sh --grep "Abo"
./run.sh --grep "Spender"

# Mehrere Filter kombinieren (ODER)
./run.sh --grep "Abo|Bestand"
```

## Testdaten

Alle Tests basieren auf einer fixen Teststruktur auf dem Integrationssystem:

| Gruppe | Typ | Inhalt |
|---|---|---|
| E2E Mio | Mitgliederorganisation | Dachgruppe |
| └ E2E Ortsgruppe | Ortsgruppe | |
| &nbsp;&nbsp;└ E2E Jungschar (ID: 584) | Jungschar | |
| &nbsp;&nbsp;&nbsp;&nbsp;├ E2E Eltern | Untergruppe | Person: E2E Mami |
| &nbsp;&nbsp;&nbsp;&nbsp;├ E2E Fröschli | Untergruppe | Person: E2E Kind |
| &nbsp;&nbsp;&nbsp;&nbsp;├ E2E Spender (ID: 588) | Untergruppe | 1 Spender (versteckt) |
| &nbsp;&nbsp;&nbsp;&nbsp;└ E2E Team | Untergruppe | Person: E2E Leiter, E2E AL (ID: 3552) |

**E2E Admin** (e2e-cevidb@cevimail.ch): Administrator auf Ebene Cevi Schweiz (Dachverband).

## Findings & Eigenheiten der cevi.db

### Authentifizierung

- Login-Feld heisst intern `login_identity`, Label in der UI: **"Haupt-E-Mail"**
- 2FA-Seite erscheint nach dem Login auf einer eigenen Seite (URL enthält nicht `sign_in`)
- 2FA-Eingabefeld: `input[name="second_factor_code"]`, Button: "Absenden"
- Session-Typ: **`ActiveRecord::SessionStore`** (DB-basiert, kein Cookie-Store)

### Session-Rotation bei Impersonation

Wenn ein User einen anderen imitiert (`sign_in` via Devise), rotiert Rails die Session-ID serverseitig. Die alte Session in `storageState` wird damit ungültig.

**Lösung**: Der Test, der Impersonation verwendet, muss am Schluss:
1. Die Imitation beenden ("Imitation beenden"-Link)
2. Die neue gültige Session in `AUTH_FILE` speichern:
   ```typescript
   await page.getByRole('link', { name: 'Imitation beenden' }).click();
   await page.context().storageState({ path: AUTH_FILE });
   ```

Damit können nachfolgende Tests die frische Session verwenden.

### Impersonation (Benutzer imitieren)

- Nur Accounts mit der Rolle **Administrator/-in** auf Dachverband-Ebene haben die Berechtigung
- Button "Imitieren" auf der Personendetailseite (nur sichtbar für berechtigte User)
- Route: `POST /groups/{group_id}/people/{person_id}/impersonate`
- Impersonations-Banner: `.user-impersonation` (zeigt "Du bist jetzt als X angemeldet")
- Beenden: Link "Imitation beenden" im Banner

**Warum nötig**: Der E2E Admin hat `layer_and_below_full`-Rechte auf Dachverband-Ebene, aber das Erstellen von Abos (Mailing Lists) prüft `in_same_layer_if_active` — d.h. nur innerhalb der *eigenen* Layer. Da Jungschar eine eigene Layer ist, fehlt dem Dachverband-Admin die Berechtigung. Der E2E AL als Gruppenführer in der Jungschar hat `group_full`-Rechte und darf Abos erstellen.

### Berechtigungen für Mailing Lists (Abos)

Erstellen/Bearbeiten/Löschen erfordert eine dieser Berechtigungen:
- `group_full` → in derselben Gruppe
- `group_and_below_full` → in der Gruppe oder darunter
- `layer_full` / `layer_and_below_full` → innerhalb derselben Layer

### Schnellsuche

- Suchfeld: `#quicksearch`, Button: `.quicksearch-button`
- Bei **genau einem Treffer**: direkt zur Personenseite (`/groups/{id}/people/{id}`)
- Bei **mehreren Treffern**: Suchergebnisseite (`/full?q=...`)
- URL-Pattern für beide Fälle: `/full\?q=|\/people\/\d+`
- **Kinder** (Fröschli-Gruppe) sind global nicht suchbar
- **Leiter** (Team-Gruppe) sind global suchbar

### Validierungsfehler

Hitobito zeigt Formularfehler in `#error_explanation.alert.alert-danger`:
```typescript
await expect(page.locator('#error_explanation')).toContainText('bereits vergeben');
```
Nicht `.alert` allein verwenden — auf jeder Seite gibt es globale `.alert`-Elemente (Download-Banner, MailChimp-Banner).

### Flash-Meldungen

Erfolgs- und Fehlermeldungen:
```typescript
// Erfolg
await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
// Fehler
await expect(page.locator('#flash .alert-danger')).toContainText('...');
```

### Seitentitel

Die Seite hat zwei `<h1>`: einen für den Umgebungs-Banner ("Umgebung: INTEGRATION") und einen für den eigentlichen Seiteninhalt. Immer den zweiten ansprechen:
```typescript
await expect(page.locator('main h1').first()).toContainText('Mein Titel');
```

### Bestätigungs-Dialoge (Löschen)

Löschen-Links triggern einen Browser-nativen `confirm()`-Dialog:
```typescript
page.once('dialog', (dialog) => dialog.accept());
await page.getByRole('link', { name: /Löschen/i }).click();
```

### Spenderschutz

Personen in der Spender-Gruppe sind für normale Admins nicht sichtbar. Die Gruppenansicht zeigt:
> "0 Personen angezeigt. 1 weitere Person ist für dich nicht sichtbar."
