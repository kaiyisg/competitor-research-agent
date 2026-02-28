---
name: gusto-login-recovery
description: Recover Gusto agent-browser sessions using repository .env credentials and persisted browser state. Use when Gusto automation is stuck on Cloudflare, login.gusto.com, blank/white screenshots, invalid login form state, or when snapshots only show minimal links instead of app content.
---

# Gusto Login Recovery

Run this recovery before continuing any Gusto exploration/automation when session state looks broken.

## Execution Mode (Required)

Always run this skill outside sandbox / with escalated permissions when executing commands.

Reason:

- Headed browser launch is blocked in sandboxed environments.
- Session runtime and browser daemon artifacts require filesystem access outside strict sandbox paths.
- Some environments require network access for tooling bootstrap.

## Recovery Command

From repository root:

```bash
npm run gusto:recover
```

For payroll timeline recovery and direct navigation:

```bash
npm run gusto:recover:payroll
```

## Preconditions

- `.env` exists with:
  - `GUSTO_USERNAME`
  - `GUSTO_PASSWORD`
- `agent-browser` is available via `npx`.

## What The Recovery Script Does

1. Resets the `gusto-exp` session.
2. Opens Gusto in headed mode.
3. Fills login form from `.env`.
4. Submits login and waits for redirect.
5. Saves browser state to `.agent-browser/gusto-auth.json`.
6. Fails fast if still on `login.gusto.com`.

## After Recovery

Verify app access:

```bash
./node_modules/.bin/agent-browser --session gusto-exp get url
./node_modules/.bin/agent-browser --session gusto-exp snapshot -i
```
