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

if [[ -z "${DEPUTY_USERNAME:-}" || -z "${DEPUTY_PASSWORD:-}" ]]; then
  echo "DEPUTY_USERNAME and DEPUTY_PASSWORD must be set in .env"
  exit 1
fi

SESSION_NAME="${SESSION_NAME:-deputy-exp}"
STATE_FILE="${STATE_FILE:-.agent-browser/deputy-auth.json}"
TENANT_BASE_URL="${DEPUTY_TENANT_BASE_URL:-https://03777028065223.eu.deputy.com}"
LOGIN_URL="${DEPUTY_LOGIN_URL:-${TENANT_BASE_URL}/login?noredirectonce=1}"
TARGET_URL="${1:-${TENANT_BASE_URL}/#/}"

mkdir -p "$(dirname "$STATE_FILE")"

npx agent-browser --session "$SESSION_NAME" close >/dev/null 2>&1 || true
npx agent-browser --session "$SESSION_NAME" --headed open "$LOGIN_URL"
npx agent-browser --session "$SESSION_NAME" wait 3000
SNAPSHOT_JSON="$(npx agent-browser --session "$SESSION_NAME" snapshot -i --json)"
read -r USER_REF PASS_REF SUBMIT_REF <<<"$(printf '%s' "$SNAPSHOT_JSON" | node -e '
  const fs = require("fs");
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  const refs = payload?.data?.refs || {};
  let user = "", pass = "", submit = "";
  for (const [ref, meta] of Object.entries(refs)) {
    const role = String(meta?.role || "").toLowerCase();
    const name = String(meta?.name || "").toLowerCase();
    if (!user && role === "textbox" && (name.includes("username") || name.includes("email"))) user = `@${ref}`;
    if (!pass && role === "textbox" && name.includes("password")) pass = `@${ref}`;
    if (!submit && role === "button" && (name.includes("log in") || name.includes("login"))) submit = `@${ref}`;
  }
  if (!user) user = "@e2";
  if (!pass) pass = "@e4";
  if (!submit) submit = "@e5";
  process.stdout.write(`${user} ${pass} ${submit}`);
')"

echo "Using refs: user=$USER_REF password=$PASS_REF submit=$SUBMIT_REF"
npx agent-browser --session "$SESSION_NAME" fill "$USER_REF" "$DEPUTY_USERNAME"
npx agent-browser --session "$SESSION_NAME" fill "$PASS_REF" "$DEPUTY_PASSWORD"
npx agent-browser --session "$SESSION_NAME" click "$SUBMIT_REF"
npx agent-browser --session "$SESSION_NAME" wait 8000
npx agent-browser --session "$SESSION_NAME" state save "$STATE_FILE"

CURRENT_URL="$(npx agent-browser --session "$SESSION_NAME" get url | tail -n 1)"
echo "Recovered session URL: $CURRENT_URL"

if [[ "$CURRENT_URL" == *"accounts.google.com"* ]]; then
  echo "Redirected to Google auth. Use tenant login URL with noredirectonce=1 to stay on password login."
  exit 1
fi

if [[ "$CURRENT_URL" == *"/my/login"* || "$CURRENT_URL" == *"/login?noredirectonce=1"* ]]; then
  echo "Still on Deputy login page. Credentials, captcha, or account state likely blocked login."
  exit 1
fi

if [[ -n "$TARGET_URL" ]]; then
  npx agent-browser --session "$SESSION_NAME" open "$TARGET_URL"
  npx agent-browser --session "$SESSION_NAME" wait 3000
  TARGET_CURRENT_URL="$(npx agent-browser --session "$SESSION_NAME" get url | tail -n 1)"
  echo "Opened target URL: $TARGET_CURRENT_URL"
fi
