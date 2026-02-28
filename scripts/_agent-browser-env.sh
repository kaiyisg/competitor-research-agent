#!/usr/bin/env zsh
set -euo pipefail

# Keep agent-browser daemon artifacts inside the repo so sandboxed runs do not
# need write access to ~/.agent-browser.
export AGENT_BROWSER_SOCKET_DIR="${AGENT_BROWSER_SOCKET_DIR:-$ROOT_DIR/.agent-browser/runtime}"
mkdir -p "$AGENT_BROWSER_SOCKET_DIR"
chmod 700 "$AGENT_BROWSER_SOCKET_DIR" 2>/dev/null || true
