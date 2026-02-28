# Gusto Session Recovery (agent-browser)

Use this every time Gusto automation gets stuck (blank screenshot, Cloudflare/login loop, or login page validation issues).

## Prerequisites

- `.env` contains:
  - `GUSTO_USERNAME`
  - `GUSTO_PASSWORD`
- `agent-browser` is installed and available via `npx`.

## Recovery Command

From repo root:

```bash
npm run gusto:recover
```

This will:

1. Reset the `gusto-exp` browser session.
2. Open Gusto in headed mode.
3. Fill login from `.env`.
4. Save authenticated state to `.agent-browser/gusto-auth.json`.
5. Fail fast if still stuck on `login.gusto.com`.

## Recovery + Open Payroll Timeline

```bash
npm run gusto:recover:payroll
```

## When To Run

Run recovery first whenever you see:

- White/blank screenshots.
- Only Cloudflare/privacy links in snapshot.
- Stuck on `login.gusto.com`.
- Validation errors in the login form.
