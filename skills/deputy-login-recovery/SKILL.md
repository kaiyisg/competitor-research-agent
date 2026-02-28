---
name: deputy-login-recovery
description: Recover Deputy agent-browser sessions using repository .env credentials and persisted browser state. Use when Deputy automation is stuck on login pages, unexpectedly redirects to Google auth, or fails to reach the tenant app after submit.
---

# Deputy Login Recovery

Run this recovery before continuing any Deputy exploration/automation when session state looks broken.

## Recovery Command

From repository root:

```bash
npm run deputy:recover
```

To target a different Deputy tenant:

```bash
DEPUTY_TENANT_BASE_URL="https://<tenant>.eu.deputy.com" npm run deputy:recover
```

## Preconditions

- `.env` exists with:
  - `DEPUTY_USERNAME`
  - `DEPUTY_PASSWORD`
- `agent-browser` is available (prefer `./node_modules/.bin/agent-browser`, fallback `npx agent-browser`).

## What The Recovery Script Does

1. Resets the `deputy-exp` session.
2. Opens tenant-native login URL with `noredirectonce=1` in headed mode.
3. Detects login refs from `snapshot -i --json`.
4. Fills login form from `.env`.
5. Submits login and waits for redirect.
6. Saves browser state to `.agent-browser/deputy-auth.json`.
7. Fails fast if it lands on Google auth or stays on login.

## After Recovery

Verify app access:

```bash
npx agent-browser --session deputy-exp get url
npx agent-browser --session deputy-exp snapshot -i
```
