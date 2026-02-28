#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

function loadDotEnvIfPresent() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    const rawValue = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    if (process.env[key] !== undefined) continue;

    const quoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"));
    process.env[key] = quoted ? rawValue.slice(1, -1) : rawValue;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function decodeBase64Url(input) {
  if (!input) return "";
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function extractTextFromPayload(payload) {
  if (!payload) return "";

  const texts = [];
  const stack = [payload];
  while (stack.length > 0) {
    const part = stack.pop();
    if (!part) continue;
    if (part.body && part.body.data) {
      texts.push(decodeBase64Url(part.body.data));
    }
    if (Array.isArray(part.parts)) {
      for (const child of part.parts) {
        stack.push(child);
      }
    }
  }
  return texts.join("\n");
}

function extractSubject(headers) {
  const h = headers || [];
  const subject = h.find((x) => String(x.name).toLowerCase() === "subject");
  return subject ? String(subject.value || "") : "";
}

function extractOtp(text, digits) {
  if (!text) return "";
  const escapedDigits = String(digits).replace(/[^\d]/g, "");
  const len = escapedDigits || "6";
  const contextual = new RegExp(
    `(?:otp|kode|code|verification|verifikasi|one-time)[^\\d]{0,20}(\\d{${len}})`,
    "ig"
  );
  let match;
  while ((match = contextual.exec(text)) !== null) {
    if (match[1]) return match[1];
  }

  const generic = new RegExp(`\\b(\\d{${len}})\\b`, "g");
  let last = "";
  while ((match = generic.exec(text)) !== null) {
    if (match[1]) last = match[1];
  }
  return last;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLatestOtp({
  gmail,
  user,
  query,
  maxResults,
  lookbackMs,
  digits,
}) {
  const listRes = await gmail.users.messages.list({
    userId: user,
    q: query,
    maxResults,
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0) return null;

  let best = null;
  for (const msg of messages) {
    const detail = await gmail.users.messages.get({
      userId: user,
      id: msg.id,
      format: "full",
    });
    const data = detail.data;
    const internalDate = Number(data.internalDate || 0);
    if (internalDate < Date.now() - lookbackMs) continue;

    const subject = extractSubject(data.payload?.headers);
    const body = extractTextFromPayload(data.payload);
    const snippet = String(data.snippet || "");
    const merged = [subject, snippet, body].join("\n");
    const otp = extractOtp(merged, digits);
    if (!otp) continue;

    if (!best || internalDate > best.internalDate) {
      best = {
        otp,
        id: data.id,
        threadId: data.threadId,
        internalDate,
        subject,
      };
    }
  }

  return best;
}

async function main() {
  loadDotEnvIfPresent();

  const clientId = requireEnv("GMAIL_CLIENT_ID");
  const clientSecret = requireEnv("GMAIL_CLIENT_SECRET");
  const refreshToken = requireEnv("GMAIL_REFRESH_TOKEN");

  const user = process.env.GMAIL_USER || "me";
  const query =
    process.env.GMAIL_OTP_QUERY ||
    'from:(account@mekari.com noreply@mekari.com) newer_than:1d';
  const maxResults = toNumber(process.env.GMAIL_OTP_MAX_RESULTS, 10);
  const digits = toNumber(process.env.GMAIL_OTP_DIGITS, 6);
  const waitSeconds = toNumber(process.env.GMAIL_OTP_WAIT_SECONDS, 120);
  const pollMs = toNumber(process.env.GMAIL_OTP_POLL_MS, 5000);
  const lookbackMs = toNumber(process.env.GMAIL_OTP_LOOKBACK_MS, 30 * 60 * 1000);
  const jsonMode = process.argv.includes("--json");

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const deadline = Date.now() + waitSeconds * 1000;
  while (Date.now() <= deadline) {
    const best = await fetchLatestOtp({
      gmail,
      user,
      query,
      maxResults,
      lookbackMs,
      digits,
    });

    if (best && best.otp) {
      if (jsonMode) {
        process.stdout.write(
          JSON.stringify(
            {
              otp: best.otp,
              subject: best.subject,
              messageId: best.id,
              threadId: best.threadId,
              receivedAt: new Date(best.internalDate).toISOString(),
            },
            null,
            2
          )
        );
      } else {
        process.stdout.write(best.otp);
      }
      return;
    }

    await sleep(pollMs);
  }

  throw new Error(
    `No ${digits}-digit OTP found before timeout. Query="${query}", wait=${waitSeconds}s`
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
