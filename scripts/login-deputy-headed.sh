#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f ".env" ]]; then
  echo "Missing .env in $ROOT_DIR"
  exit 1
fi

set -a
source .env
set +a

if [[ -z "${DEPUTY_USERNAME:-}" || -z "${DEPUTY_PASSWORD:-}" ]]; then
  echo "DEPUTY_USERNAME and DEPUTY_PASSWORD must be set in .env"
  exit 1
fi

STATE_FILE="${STATE_FILE:-.agent-browser/deputy-auth.json}"
EVIDENCE_DIR="${EVIDENCE_DIR:-evidence/agent-browser/deputy}"
AUTO_SUBMIT="${AUTO_SUBMIT:-1}"

export STATE_FILE EVIDENCE_DIR AUTO_SUBMIT
node scripts/login-deputy-headed.js
