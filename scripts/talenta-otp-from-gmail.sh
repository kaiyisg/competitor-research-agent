#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

OTP="$(node "$ROOT_DIR/scripts/gmail-fetch-otp.js")"
echo "Fetched OTP from Gmail."

"$ROOT_DIR/scripts/talenta-submit-otp.sh" "$OTP"
