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

SESSION_NAME="${SESSION_NAME:-talenta-exp}"
OTP="${1:-${TALENTA_OTP:-}}"

if [[ -z "$OTP" ]]; then
  echo "OTP is required. Pass as first argument or TALENTA_OTP."
  exit 1
fi

if [[ ! "$OTP" =~ ^[0-9]{6}$ ]]; then
  echo "OTP must be exactly 6 digits."
  exit 1
fi

SNAPSHOT_JSON="$("${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" snapshot -i --json)"
PARSED="$(
  printf '%s' "$SNAPSHOT_JSON" | node -e '
    const fs = require("fs");
    const payload = JSON.parse(fs.readFileSync(0, "utf8"));
    const refs = payload?.data?.refs || {};

    const textboxRefs = [];
    let verifyRef = "";

    for (const [ref, meta] of Object.entries(refs)) {
      const role = String(meta?.role || "").toLowerCase();
      const name = String(meta?.name || "").toLowerCase();
      const refNum = Number(ref);
      if (role === "textbox") {
        textboxRefs.push({ ref: `@${ref}`, order: Number.isFinite(refNum) ? refNum : 99999 });
      }
      if (!verifyRef && role === "button" && (name.includes("verifikasi") || name.includes("verify"))) {
        verifyRef = `@${ref}`;
      }
    }

    textboxRefs.sort((a, b) => a.order - b.order);
    const firstSix = textboxRefs.slice(0, 6).map((x) => x.ref);
    process.stdout.write(`${firstSix.join(",")}|${verifyRef}`);
  '
)"

OTP_REFS="${PARSED%%|*}"
VERIFY_REF="${PARSED##*|}"

IFS=',' read -rA OTP_REF_ARR <<< "$OTP_REFS"
if (( ${#OTP_REF_ARR[@]} < 6 )); then
  echo "Could not detect six OTP input boxes on current page."
  exit 1
fi

for i in {1..6}; do
  digit="${OTP:$((i-1)):1}"
  ref="${OTP_REF_ARR[$i]}"
  "${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" fill "$ref" "$digit" >/dev/null
done

if [[ -n "$VERIFY_REF" ]]; then
  "${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" click "$VERIFY_REF" >/dev/null
else
  "${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" press Enter >/dev/null
fi

"${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" wait 6000 >/dev/null || true
CURRENT_URL="$("${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" get url | tail -n 1)"
BODY_TEXT="$("${AGENT_BROWSER_CMD[@]}" --session "$SESSION_NAME" get text body)"

echo "Current URL after OTP submit: $CURRENT_URL"

if [[ "$BODY_TEXT" == *"Kode OTP yang anda masukkan tidak valid"* ]]; then
  echo "OTP rejected by Mekari/Talenta."
  exit 1
fi

if [[ "$CURRENT_URL" == *"sign_in"* || "$CURRENT_URL" == *"/users/sign_in"* ]]; then
  echo "Still on sign-in flow after OTP."
  exit 1
fi

echo "OTP accepted; session moved past sign-in."
