#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# .env laden falls vorhanden
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -o allexport
  source "$SCRIPT_DIR/.env"
  set +o allexport
fi

# Verwendung:
#   ./run.sh                          # alle Tests
#   ./run.sh --grep "Abo"             # Tests nach Name filtern
#   ./run.sh tests/abos.spec.ts       # einzelne Datei
#   ./run.sh --headed                 # sichtbarer Browser (nur lokal, nicht in Docker sinnvoll)

# Playwright-Image-Tag aus der @playwright/test-Version in package.json ableiten,
# damit es nur EINE Quelle der Wahrheit gibt (von dependabot via npm aktualisiert).
PLAYWRIGHT_VERSION="$(sed -n 's/.*"@playwright\/test": *"[\^~>=< ]*\([0-9][0-9.]*\)".*/\1/p' "$SCRIPT_DIR/package.json")"
if [[ -z "$PLAYWRIGHT_VERSION" ]]; then
  echo "Konnte @playwright/test-Version nicht aus package.json lesen." >&2
  exit 1
fi
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"

docker run --rm \
  --network host \
  -v "$SCRIPT_DIR:/e2e" \
  -w /e2e \
  -e HITOBITO_PASSWORD="${HITOBITO_PASSWORD:-}" \
  -e HITOBITO_TOTP_SECRET="${HITOBITO_TOTP_SECRET:-}" \
  "$PLAYWRIGHT_IMAGE" \
  bash -c "mkdir -p screenshots && npm install --silent && npx playwright test $*"
