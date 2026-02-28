#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/_agent-browser-env.sh"

if [[ ! -f ".env" ]]; then
  echo "Missing .env in $ROOT_DIR"
  exit 1
fi

set -a
source .env
set +a

if [[ -z "${TALENTA_USERNAME:-}" || -z "${TALENTA_PASSWORD:-}" ]]; then
  echo "TALENTA_USERNAME and TALENTA_PASSWORD must be set in .env"
  exit 1
fi

SESSION_NAME="${SESSION_NAME:-talenta-exp}"
STATE_FILE="${STATE_FILE:-.agent-browser/talenta-auth.json}"
LOGIN_URL="${TALENTA_LOGIN_URL:-https://hr.talenta.co/employee/dashboard}"
TARGET_URL="${1:-https://hr.talenta.co/employee/dashboard}"

mkdir -p "$(dirname "$STATE_FILE")"

AB_FAST_TIMEOUT_MS="${AB_FAST_TIMEOUT_MS:-2000}"

ab() {
  npx agent-browser --session "$SESSION_NAME" "$@"
}

try_ab() {
  AGENT_BROWSER_DEFAULT_TIMEOUT="$AB_FAST_TIMEOUT_MS" ab "$@" >/dev/null 2>&1
}

fill_username() {
  try_ab find label "Work Email" fill "$TALENTA_USERNAME" && return 0
  try_ab find label "Email" fill "$TALENTA_USERNAME" && return 0
  try_ab find label "Username" fill "$TALENTA_USERNAME" && return 0
  try_ab find placeholder "Work Email" fill "$TALENTA_USERNAME" && return 0
  try_ab find placeholder "Email" fill "$TALENTA_USERNAME" && return 0
  try_ab find placeholder "Username" fill "$TALENTA_USERNAME" && return 0
  return 1
}

fill_password() {
  try_ab find label "Password" fill "$TALENTA_PASSWORD" && return 0
  try_ab find placeholder "Password" fill "$TALENTA_PASSWORD" && return 0
  return 1
}

submit_login() {
  local snapshot_json submit_ref
  snapshot_json="$(ab snapshot -i --json)" || return 1
  submit_ref="$(printf '%s' "$snapshot_json" | node -e '
    const fs = require("fs");
    const payload = JSON.parse(fs.readFileSync(0, "utf8"));
    const refs = payload?.data?.refs || {};
    let best = "";
    for (const [ref, meta] of Object.entries(refs)) {
      const role = String(meta?.role || "").toLowerCase();
      const name = String(meta?.name || "").toLowerCase();
      if (role !== "button") continue;
      if (name.includes("sign in") || name.includes("signin") || name.includes("login") || name.includes("log in") || name.includes("masuk")) {
        best = "@" + ref;
        break;
      }
    }
    process.stdout.write(best);
  ')" || true

  if [[ -n "$submit_ref" ]]; then
    ab click "$submit_ref" >/dev/null 2>&1 && return 0
  fi

  try_ab press Enter && return 0
  return 1
}

ab close >/dev/null 2>&1 || true
ab --headed open "$LOGIN_URL"
ab wait 4000 || true

if ! fill_username; then
  echo "Could not find Talenta username/email input."
  exit 1
fi

if ! fill_password; then
  echo "Could not find Talenta password input."
  exit 1
fi

if ! submit_login; then
  echo "Could not find Talenta login/masuk submit control."
  exit 1
fi

ab wait 8000 || true
ab state save "$STATE_FILE"

CURRENT_URL="$(ab get url | tail -n 1)"
echo "Recovered session URL: $CURRENT_URL"

if [[ "$CURRENT_URL" == *"login"* || "$CURRENT_URL" == *"signin"* || "$CURRENT_URL" == *"sign_in"* || "$CURRENT_URL" == *"/users/sign_in"* || "$CURRENT_URL" == *"auth"* ]]; then
  echo "Still on login/auth page. Re-run headed and complete challenge manually, then re-run this script."
  exit 1
fi

ab open "$TARGET_URL"
ab wait 3000 || true
TARGET_CURRENT_URL="$(ab get url | tail -n 1)"
echo "Opened target URL: $TARGET_CURRENT_URL"
