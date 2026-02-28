---
name: gmail-otp-relay
description: Retrieve Mekari/Talenta OTP from Gmail via Gmail API and submit it into the active Talenta session. Use when Talenta sign-in prompts for OTP, or when users ask to fetch OTP automatically from Gmail and continue login without manual copy/paste.
---

# Gmail OTP Relay

Use this skill to complete Talenta OTP verification from Gmail automatically.

## Preconditions

- Talenta sign-in page is already open and waiting for OTP in `talenta-exp` session.
- `.env` contains Gmail API OAuth credentials:
  - `GMAIL_CLIENT_ID`
  - `GMAIL_CLIENT_SECRET`
  - `GMAIL_REFRESH_TOKEN`
- `node_modules` is installed (includes `googleapis` and `agent-browser`).

## Commands

Fetch latest OTP only:

```bash
npm run talenta:otp:fetch
```

Submit OTP manually:

```bash
npm run talenta:otp:submit -- 123456
```

Fetch from Gmail and submit in one command:

```bash
npm run talenta:otp:relay
```

## Configurable Environment Variables

- `GMAIL_USER` (default: `me`)
- `GMAIL_OTP_QUERY` (default: `from:(account@mekari.com noreply@mekari.com) newer_than:1d`)
- `GMAIL_OTP_WAIT_SECONDS` (default: `120`)
- `GMAIL_OTP_POLL_MS` (default: `5000`)
- `GMAIL_OTP_LOOKBACK_MS` (default: `1800000`)
- `SESSION_NAME` (default: `talenta-exp`)

## Expected Behavior

1. Query Gmail for recent Mekari/Talenta OTP email.
2. Extract latest 6-digit OTP from subject/snippet/body.
3. Fill six OTP input boxes in Talenta OTP screen.
4. Click `Verifikasi` (or press Enter fallback).
5. Fail fast if OTP is invalid or sign-in page remains.
