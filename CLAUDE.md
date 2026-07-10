* Neu erstellte Tests jeweils ausführen um sicherzustellen, dass diese funktionieren
* Der globale Playwright-Timeout ist 60s (`timeout` in `playwright.config.ts`). Das deckt auch mehrphasige Tests (Erstellen → externe Anmeldung → Cleanup) ab; ein eigenes `test.setTimeout()` ist normalerweise nicht nötig. Nur wenn ein einzelner Test deutlich länger braucht, gezielt mit `test.setTimeout(...)` erhöhen.
* Neue Testpersonen/Testdaten die bereits existieren müssen und nicht selber angelegt werden im README.md beschreiben
* An sinnvollen Stellen (nach wichtigen Assertions) Screenshots erstellen: `await page.screenshot({ path: 'screenshots/name.png' })`. Benennung: `{spec}_{schritt}.png`, z.B. `rechnungen_erstellt.png`. Screenshots gehen nach `e2e/screenshots/` und werden bei jedem Lauf überschrieben (immer aktueller Stand). Zweck: manuelle visuelle Prüfung nach automatischer Ausführung. Gilt nur für die UI-Suite (`tests/`), nicht für `api-tests/`.
* Für Playwright-UI-Test-Eigenheiten (Selektoren, hitobito-Quirks im Web-Frontend) **immer zuerst `docs/ui-testing.md` lesen**, bevor an `tests/` gearbeitet wird. Neue Erkenntnisse dort ergänzen.
* Für API-Test-Eigenheiten (JSON:API, Service-Token-Berechtigungen, Endpoints) **immer zuerst `docs/api-testing.md` lesen**, bevor an `api-tests/` gearbeitet wird. Neue Erkenntnisse dort ergänzen.
* Es wird direkt auf `main` gearbeitet (kein Feature-Branch / PR-Workflow). Commits direkt auf `main` und pushen.
* Der Code von hitobito ist unter /home/patrick/Data/SourceCode/GitHub/hitobito/development/app abgelegt (falls diese als Referenz sinnvoll anzuschauen ist)

## Tooling

Alle Runtime-Befehle laufen über `tooling/docker.sh` – nie `npm`/`node`/`npx` direkt aufrufen. Das Skript läuft im offiziellen Playwright-Container als Host-User (`--user`, `HOME=/tmp`), damit erzeugte Dateien (`node_modules`, `screenshots`, `playwright-report`, `test-results`, `.auth`) **nicht root gehören**. Der Image-Tag wird aus der `@playwright/test`-Version in `package.json` abgeleitet (einzige Quelle der Wahrheit, von dependabot aktualisiert).

Verfügbare Befehle:
- `tooling/docker.sh test` — alle UI-E2E-Tests ausführen (`tests/`)
- `tooling/docker.sh test --grep "Abo"` — Tests nach Name filtern
- `tooling/docker.sh test tests/abos.spec.ts` — einzelne Datei
- `tooling/docker.sh test --config=api-tests/playwright.config.api.ts` — API-Smoke-Test-Suite ausführen (`api-tests/`)
- `tooling/docker.sh npm install` — beliebiger npm-Befehl im Container
