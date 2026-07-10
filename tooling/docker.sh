#!/usr/bin/env bash
set -euo pipefail

CMD="${1:-}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Als Host-User laufen, damit erzeugte Dateien (node_modules, screenshots,
# playwright-report, test-results, .auth) nicht root gehoeren.
CURRENT_USER="$(id -u):$(id -g)"
NODE_USER_ARGS=(--user "${CURRENT_USER}" -e HOME=/tmp)

# Playwright-Image-Tag aus der @playwright/test-Version in package.json ableiten
# (einzige Quelle der Wahrheit, von dependabot via npm aktualisiert).
PLAYWRIGHT_VERSION="$(sed -n 's/.*"@playwright\/test": *"[\^~>=< ]*\([0-9][0-9.]*\)".*/\1/p' "${PROJECT_ROOT}/package.json")"
if [[ -z "$PLAYWRIGHT_VERSION" ]]; then
  echo "Konnte @playwright/test-Version nicht aus package.json lesen." >&2
  exit 1
fi
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"

# .env laden falls vorhanden (HITOBITO_PASSWORD, HITOBITO_TOTP_SECRET, HITOBITO_API_TOKEN)
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  set -o allexport
  # shellcheck disable=SC1091
  source "${PROJECT_ROOT}/.env"
  set +o allexport
fi

case "$CMD" in
  test)
    # Verwendung:
    #   tooling/docker.sh test                                              # alle UI-Tests
    #   tooling/docker.sh test --grep "Abo"                                # nach Name filtern
    #   tooling/docker.sh test tests/abos.spec.ts                         # einzelne Datei
    #   tooling/docker.sh test --config=api-tests/playwright.config.api.ts # API-Smoke-Suite
    docker run --rm -i \
      "${NODE_USER_ARGS[@]}" \
      --network host \
      -v "${PROJECT_ROOT}:/e2e" \
      -w /e2e \
      -e HITOBITO_PASSWORD="${HITOBITO_PASSWORD:-}" \
      -e HITOBITO_TOTP_SECRET="${HITOBITO_TOTP_SECRET:-}" \
      -e HITOBITO_API_TOKEN="${HITOBITO_API_TOKEN:-}" \
      "${PLAYWRIGHT_IMAGE}" \
      bash -c "mkdir -p screenshots && npm install --silent && npx playwright test ${*:2}"
    ;;
  npm)
    # Beliebiger npm-Befehl im Container, z.B. tooling/docker.sh npm install
    docker run --rm -i \
      "${NODE_USER_ARGS[@]}" \
      -v "${PROJECT_ROOT}:/e2e" \
      -w /e2e \
      "${PLAYWRIGHT_IMAGE}" \
      npm "${@:2}"
    ;;
  *)
    echo "Usage: tooling/docker.sh <command>"
    echo "  test [playwright-args]   E2E-Tests ausfuehren (z.B. test --grep Abo)"
    echo "  npm  [npm-args]          beliebiger npm-Befehl im Container"
    exit 1
    ;;
esac
