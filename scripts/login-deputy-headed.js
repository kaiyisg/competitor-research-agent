#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");
const { chromium } = require("playwright");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

async function maybeWaitForManualLogin(page) {
  const autoSubmit = process.env.AUTO_SUBMIT === "1";
  const isTty = process.stdin.isTTY && process.stdout.isTTY;

  if (autoSubmit || !isTty) {
    await page.click("#btnLoginSubmit");
    await page.waitForTimeout(10000);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  console.log("Credentials filled in browser. Complete login manually if prompted.");
  await rl.question("Press Enter after login finishes in the browser...");
  rl.close();
  await page.waitForTimeout(3000);
}

async function main() {
  const username = requireEnv("DEPUTY_USERNAME");
  const password = requireEnv("DEPUTY_PASSWORD");

  const loginUrl =
    process.env.DEPUTY_LOGIN_URL ||
    "https://once.deputy.com/my/login?redirect_url=https%3A%2F%2Fonce.deputy.com%2Fmy%2F";
  const stateFile = process.env.STATE_FILE || ".agent-browser/deputy-auth.json";
  const evidenceDir = process.env.EVIDENCE_DIR || "evidence/agent-browser/deputy";

  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.mkdirSync(evidenceDir, { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 75 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
  const page = await context.newPage();

  try {
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#login-email", { timeout: 60000 });
    await page.fill("#login-email", username);
    await page.fill("#login-password", password);

    await page.screenshot({ path: path.join(evidenceDir, "deputy-before-submit.png") });
    await maybeWaitForManualLogin(page);

    const url = page.url();
    const title = await page.title();
    const body = ((await page.textContent("body")) || "").replace(/\s+/g, " ").trim();

    await page.screenshot({ path: path.join(evidenceDir, "deputy-after-login-headed.png") });
    await page.screenshot({
      path: path.join(evidenceDir, "deputy-after-login-headed-full.png"),
      fullPage: true,
    });
    fs.writeFileSync(
      path.join(evidenceDir, "deputy-after-login-headed.txt"),
      ["URL: " + url, "TITLE: " + title, "", "BODY:", body].join("\n")
    );

    await context.storageState({ path: stateFile });
    console.log(JSON.stringify({ url, title, stateFile }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
