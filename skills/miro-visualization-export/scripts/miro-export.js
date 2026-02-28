#!/usr/bin/env node
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

function usage() {
  const msg = [
    "Miro export helper",
    "",
    "Usage:",
    "  node skills/miro-visualization-export/scripts/miro-export.js \\",
    "    --board-id <id> [--access-token <token>] [--artifacts evidence/index/artifacts.jsonl] \\",
    "    [--run-id <run_id>] [--limit <n>] [--out <manifest.json>] [--apply]",
    "",
    "Modes:",
    "  default: dry-run plan only (no API calls)",
    "  --apply: execute upload + tag operations via Miro API",
    "",
    "Env fallbacks:",
    "  MIRO_ACCESS_TOKEN, MIRO_BOARD_ID",
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

function requireValue(value, label) {
  if (!value) throw new Error(`missing required value: ${label}`);
  return value;
}

function toInt(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`invalid integer: ${value}`);
  return Math.floor(n);
}

function inferMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadArtifacts(jsonlPath) {
  const raw = await fs.readFile(jsonlPath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`invalid JSON at line ${i + 1}: ${error.message}`);
      }
    });
}

function defaultManifestPath(baseDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(baseDir, "evidence", "exports", `miro-export-${stamp}.json`);
}

class MiroClient {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.tagCache = new Map();
  }

  async request(method, resourcePath, options = {}) {
    const url = new URL(`https://api.miro.com${resourcePath}`);
    const query = options.query || {};
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }

    const headers = {
      accept: "application/json",
      Authorization: `Bearer ${this.accessToken}`,
      ...(options.headers || {}),
    };

    const init = { method, headers };
    if (options.body !== undefined) {
      if (options.body instanceof FormData) {
        init.body = options.body;
      } else if (typeof options.body === "string") {
        init.body = options.body;
      } else {
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
        init.body = JSON.stringify(options.body);
      }
    }

    const response = await fetch(url, init);
    const expected = options.expectedStatuses || [200];
    const raw = await response.text();

    let parsed = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { raw };
      }
    }

    if (!expected.includes(response.status)) {
      const detail = typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed);
      throw new Error(`${method} ${url.pathname} failed (${response.status}): ${detail}`);
    }
    return parsed;
  }

  async hydrateTags(boardId) {
    let offset = 0;
    const limit = 50;
    while (true) {
      const payload = await this.request("GET", `/v2/boards/${boardId}/tags`, {
        query: { limit, offset },
      });
      const rows = Array.isArray(payload.data) ? payload.data : [];
      for (const row of rows) {
        if (row && row.title && row.id) this.tagCache.set(row.title, row.id);
      }
      if (rows.length < limit) break;
      offset += rows.length;
    }
  }

  async ensureTag(boardId, title, fillColor = "blue") {
    if (this.tagCache.has(title)) {
      return this.tagCache.get(title);
    }
    const created = await this.request("POST", `/v2/boards/${boardId}/tags`, {
      body: { title, fillColor },
      expectedStatuses: [201],
    });
    if (!created.id) throw new Error(`tag create response missing id for title=${title}`);
    this.tagCache.set(title, created.id);
    return created.id;
  }

  async uploadImage(boardId, screenshotPath, payloadData) {
    const bytes = await fs.readFile(screenshotPath);
    const form = new FormData();
    form.append("data", JSON.stringify(payloadData));
    form.append("resource", new Blob([bytes], { type: inferMime(screenshotPath) }), path.basename(screenshotPath));
    const created = await this.request("POST", `/v2/boards/${boardId}/images`, {
      body: form,
      expectedStatuses: [201],
    });
    if (!created.id) throw new Error(`image create response missing id for path=${screenshotPath}`);
    return created;
  }

  async attachTag(boardId, itemId, tagId) {
    await this.request("POST", `/v2/boards/${boardId}/items/${itemId}`, {
      query: { tag_id: tagId },
      expectedStatuses: [204],
    });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || options.h) {
    usage();
    return;
  }

  const baseDir = process.cwd();
  const boardId = options["board-id"] || process.env.MIRO_BOARD_ID;
  requireValue(boardId, "board-id");

  const artifactsPath = path.resolve(baseDir, options.artifacts || "evidence/index/artifacts.jsonl");
  const outPath = path.resolve(baseDir, options.out || defaultManifestPath(baseDir));
  const runIdFilter = options["run-id"];
  const limit = toInt(options.limit, Number.MAX_SAFE_INTEGER);
  const xStart = toInt(options["x-start"], 0);
  const yStart = toInt(options["y-start"], 0);
  const apply = Boolean(options.apply);

  const rows = await loadArtifacts(artifactsPath);
  const candidates = [];
  for (const row of rows) {
    if (runIdFilter && row.run_id !== runIdFilter) continue;
    if (!row.screenshot_ref) continue;
    const screenshotPath = path.isAbsolute(row.screenshot_ref)
      ? row.screenshot_ref
      : path.resolve(baseDir, row.screenshot_ref);
    const exists = await fileExists(screenshotPath);
    candidates.push({
      artifact: row,
      screenshotPath,
      exists,
    });
    if (candidates.length >= limit) break;
  }

  let client = null;
  if (apply) {
    const accessToken = options["access-token"] || process.env.MIRO_ACCESS_TOKEN;
    requireValue(accessToken, "access-token (or MIRO_ACCESS_TOKEN)");
    client = new MiroClient(accessToken);
    await client.hydrateTags(boardId);
  }

  const report = {
    mode: apply ? "apply" : "dry-run",
    board_id: boardId,
    artifacts_path: artifactsPath,
    run_id_filter: runIdFilter || null,
    total_input_rows: rows.length,
    selected_rows: candidates.length,
    exported: [],
    skipped: [],
    failures: [],
  };

  for (let i = 0; i < candidates.length; i += 1) {
    const item = candidates[i];
    const a = item.artifact;
    const tags = Array.isArray(a.tags) ? [...new Set(a.tags)] : [];
    const x = xStart + (i % 4) * 900;
    const y = yStart + Math.floor(i / 4) * 700;

    if (!item.exists) {
      report.skipped.push({
        step_id: a.step_id,
        screenshot_ref: a.screenshot_ref,
        reason: "missing_screenshot",
      });
      continue;
    }

    if (!apply) {
      report.exported.push({
        step_id: a.step_id,
        run_id: a.run_id,
        screenshot_ref: a.screenshot_ref,
        screenshot_path: item.screenshotPath,
        tags,
        planned_position: { x, y },
      });
      continue;
    }

    try {
      const created = await client.uploadImage(boardId, item.screenshotPath, {
        title: `${a.competitor || "unknown"}:${a.step_id || "step"}`,
        altText: `Evidence screenshot for ${a.competitor || "unknown"} ${a.flow_name || "flow"} ${a.step_id || "step"}`,
        position: { x, y, origin: "center" },
      });

      const tagIds = [];
      for (const tag of tags) {
        const tagId = await client.ensureTag(boardId, tag);
        await client.attachTag(boardId, created.id, tagId);
        tagIds.push({ title: tag, id: tagId });
      }

      report.exported.push({
        step_id: a.step_id,
        run_id: a.run_id,
        screenshot_ref: a.screenshot_ref,
        screenshot_path: item.screenshotPath,
        item_id: created.id,
        tags: tagIds,
      });
    } catch (error) {
      report.failures.push({
        step_id: a.step_id,
        run_id: a.run_id,
        screenshot_ref: a.screenshot_ref,
        error: error.message,
      });
    }
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const summary = {
    mode: report.mode,
    board_id: report.board_id,
    selected_rows: report.selected_rows,
    exported: report.exported.length,
    skipped: report.skipped.length,
    failures: report.failures.length,
    manifest: outPath,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (report.failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
