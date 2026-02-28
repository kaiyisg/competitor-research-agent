# Talenta Gmail OTP Relay

Automate Talenta OTP by reading the latest OTP email from Gmail API and submitting it to the active Talenta OTP page.

## Required `.env`

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- Optional: `GMAIL_USER` (default `me`)

## Commands

Fetch OTP only:

```bash
npm run talenta:otp:fetch
```

Submit OTP only:

```bash
npm run talenta:otp:submit -- 123456
```

Fetch + submit:

```bash
npm run talenta:otp:relay
```

## Notes

- Default session is `talenta-exp`. Override with `SESSION_NAME=<name>`.
- If no OTP is found, tune `GMAIL_OTP_QUERY` and retry.
- If OTP is rejected, request a fresh OTP and rerun relay quickly.
