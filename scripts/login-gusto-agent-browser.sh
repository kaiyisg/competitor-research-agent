#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/_agent-browser-env.sh"

if [[ -x "$ROOT_DIR/node_modules/.bin/agent-browser" ]]; then
  AGENT_BROWSER_CMD=("$ROOT_DIR/node_modules/.bin/agent-browser")
else
  AGENT_BROWSER_CMD=(npx agent-browser)
fi

if [[ ! -f ".env" ]]; then
  echo "Missing .env in $ROOT_DIR"
  exit 1
fi

set -a
source .env
set +a

if [[ -z "${GUSTO_USERNAME:-}" || -z "${GUSTO_PASSWORD:-}" ]]; then
  echo "GUSTO_USERNAME and GUSTO_PASSWORD must be set in .env"
  exit 1
fi

SESSION_NAME="${SESSION_NAME:-gusto-exp}"
STATE_FILE="${STATE_FILE:-.agent-browser/gusto-auth.json}"
TARGET_URL="${1:-}"

mkdir -p "$(dirname "$STATE_FILE")"

"${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" close >/dev/null 2>&1 || true
"${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" --headed open https://app.gusto.com/
"${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" wait 3000
"${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" snapshot -i >/dev/null
"${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" click @e18 >/dev/null 2>&1 || true
"${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" fill @e2 "$GUSTO_USERNAME"
"${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" fill @e4 "$GUSTO_PASSWORD"
"${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" click @e6
"${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" wait 6000
"${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" state save "$STATE_FILE"

CURRENT_URL="$("${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" get url | tail -n 1)"
echo "Recovered session URL: $CURRENT_URL"

if [[ "$CURRENT_URL" == *"login.gusto.com"* ]]; then
  echo "Still on login page. Run in headed mode and complete challenge, then re-run this script."
  exit 1
fi

if [[ -n "$TARGET_URL" ]]; then
  "${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" open "$TARGET_URL"
  "${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" wait 3000
  TARGET_CURRENT_URL="$("${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" get url | tail -n 1)"
  echo "Opened target URL: $TARGET_CURRENT_URL"
fi
