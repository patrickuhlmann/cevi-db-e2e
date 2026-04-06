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

docker run --rm \
  --network host \
  -v "$SCRIPT_DIR:/e2e" \
  -w /e2e \
  -e HITOBITO_PASSWORD="${HITOBITO_PASSWORD:-}" \
  -e HITOBITO_TOTP_SECRET="${HITOBITO_TOTP_SECRET:-}" \
  "mcr.microsoft.com/playwright:v1.58.2-noble" \
  bash -c "mkdir -p screenshots && npm install --silent && npx playwright test $*"
