#!/usr/bin/env node
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function usage() {
  const msg = [
    "Miro auth helper",
    "",
    "Usage:",
    "  node skills/miro-visualization-export/scripts/miro-auth.js auth-url \\",
    "    --client-id <id> --redirect-uri <uri> [--scope boards:read,boards:write] [--state <value>]",
    "",
    "  node skills/miro-visualization-export/scripts/miro-auth.js exchange \\",
    "    --client-id <id> --client-secret <secret> --redirect-uri <uri> --code <auth-code> [--out <file>]",
    "",
    "  node skills/miro-visualization-export/scripts/miro-auth.js refresh \\",
    "    --client-id <id> --client-secret <secret> --refresh-token <token> [--out <file>]",
    "",
    "Env fallbacks: MIRO_CLIENT_ID, MIRO_CLIENT_SECRET, MIRO_REDIRECT_URI",
  ];
  console.error(msg.join("\n"));
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function pick(options, key, envKey) {
  return options[key] || process.env[envKey] || "";
}

function requireValue(value, label) {
  if (!value) {
    throw new Error(`missing required value: ${label}`);
  }
  return value;
}

async function requestToken(params) {
  const url = new URL("https://api.miro.com/v1/oauth/token");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json" },
  });

  const raw = await response.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw };
  }

  if (!response.ok) {
    const detail = typeof body === "object" ? JSON.stringify(body) : String(body);
    throw new Error(`token request failed (${response.status}): ${detail}`);
  }
  return body;
}

async function maybeWrite(outPath, payload) {
  if (!outPath) return;
  const absolute = path.resolve(process.cwd(), outPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.error(`wrote token payload to ${absolute}`);
}

function renderAuthUrl(clientId, redirectUri, scope, state) {
  const url = new URL("https://miro.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  return url.toString();
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseArgs(rest);

  if (!command || options.help || options.h) {
    usage();
    process.exit(command ? 0 : 1);
  }

  if (command === "auth-url") {
    const clientId = requireValue(pick(options, "client-id", "MIRO_CLIENT_ID"), "client-id");
    const redirectUri = requireValue(pick(options, "redirect-uri", "MIRO_REDIRECT_URI"), "redirect-uri");
    const scope = options.scope || "boards:read,boards:write";
    const state = options.state || randomUUID();
    const url = renderAuthUrl(clientId, redirectUri, scope, state);
    console.log(JSON.stringify({ url, state }, null, 2));
    return;
  }

  if (command === "exchange") {
    const clientId = requireValue(pick(options, "client-id", "MIRO_CLIENT_ID"), "client-id");
    const clientSecret = requireValue(pick(options, "client-secret", "MIRO_CLIENT_SECRET"), "client-secret");
    const redirectUri = requireValue(pick(options, "redirect-uri", "MIRO_REDIRECT_URI"), "redirect-uri");
    const code = requireValue(options.code, "code");
    const payload = await requestToken({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });
    await maybeWrite(options.out, payload);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (command === "refresh") {
    const clientId = requireValue(pick(options, "client-id", "MIRO_CLIENT_ID"), "client-id");
    const clientSecret = requireValue(pick(options, "client-secret", "MIRO_CLIENT_SECRET"), "client-secret");
    const refreshToken = requireValue(options["refresh-token"], "refresh-token");
    const payload = await requestToken({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });
    await maybeWrite(options.out, payload);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  throw new Error(`unsupported command: ${command}`);
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
