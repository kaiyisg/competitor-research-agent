# Talenta Session Recovery (agent-browser)

Use this when Talenta automation is stuck on login/auth pages or session has expired.

## Prerequisites

- `.env` contains:
  - `TALENTA_USERNAME`
  - `TALENTA_PASSWORD`
- `agent-browser` is installed and available via `npx`.

## Recovery Command

From repo root:

```bash
npm run talenta:recover
```

This will:

1. Reset the `talenta-exp` browser session.
2. Open Talenta in headed mode (`https://hr.talenta.co/employee/dashboard`).
3. Fill login from `.env` (best-effort selector matching).
4. Save authenticated state to `.agent-browser/talenta-auth.json`.
5. Fail fast if still on login/sign-in/auth URL.

## Recovery + Open Dashboard

```bash
npm run talenta:recover:dashboard
```

## When To Run

Run recovery first whenever you see:

- Stuck on Talenta login/sign-in page.
- Session timeout loops.
- Redirects to auth pages during flow execution.
