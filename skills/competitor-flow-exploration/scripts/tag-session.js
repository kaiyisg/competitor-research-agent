#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");
const { validateTags } = require("../../../src/contracts/tags");
const { syncExplorationProvisional, syncExplorationFinal } = require("../../../src/store/catalogSync");

const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);

function usage() {
  console.error(
    [
      "Usage:",
      "  node skills/competitor-flow-exploration/scripts/tag-session.js record \\",
      "    --run-dir <path> --step-id <id> --url <url> --action <action> --surface <surface.tag> \\",
      "    [--experience <experience.a,experience.b>] [--confidence high|medium|low] [--observation <text>]",
      "",
      "  node skills/competitor-flow-exploration/scripts/tag-session.js finalize --run-dir <path>",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function normalizeSurface(value) {
  if (!value) throw new Error("surface is required");
  if (value.startsWith("surface.")) return value;
  return `surface.${value}`;
}

function normalizeExperienceList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("experience.") ? s : `experience.${s}`));
}

function normalizeConfidence(value) {
  const out = String(value || "medium").toLowerCase();
  if (!CONFIDENCE_LEVELS.has(out)) {
    throw new Error(`invalid confidence: ${value}`);
  }
  return out;
}

function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    const pathname = (u.pathname || "/").replace(/\/+$/, "") || "/";
    return `${u.hostname}${pathname}`.toLowerCase();
  } catch {
    return String(raw || "").trim().toLowerCase();
  }
}

function normalizeAction(raw) {
  const full = String(raw || "").trim();
  const idx = full.indexOf(":");
  if (idx < 0) return { type: full.toLowerCase(), target: "" };
  return {
    type: full.slice(0, idx).trim().toLowerCase(),
    target: full.slice(idx + 1).trim().toLowerCase(),
  };
}

function normalizeObservation(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function confidenceScore(level) {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

function buildFingerprint(entry) {
  const action = normalizeAction(entry.action);
  return [normalizeUrl(entry.url), action.type, action.target, normalizeObservation(entry.observation)].join("|");
}

async function ensureClassificationDir(runDir) {
  const classificationDir = path.join(runDir, "classification");
  const stepsDir = path.join(classificationDir, "steps");
  await fs.mkdir(stepsDir, { recursive: true });
  return { classificationDir, stepsDir };
}

async function readJsonl(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function recordEntry(args) {
  const runDir = args["run-dir"];
  const stepId = args["step-id"];
  const url = args.url;
  const action = args.action;
  const observation = args.observation || "";
  if (!runDir) throw new Error("run-dir is required");
  if (!stepId) throw new Error("step-id is required");
  if (!url) throw new Error("url is required");
  if (!action) throw new Error("action is required");

  const surfaceTag = normalizeSurface(args.surface);
  const experienceTags = normalizeExperienceList(args.experience);
  const confidence = normalizeConfidence(args.confidence);
  const tags = [surfaceTag, ...new Set(experienceTags)];
  validateTags(tags);

  const { classificationDir, stepsDir } = await ensureClassificationDir(runDir);
  const entry = {
    step_id: stepId,
    timestamp: new Date().toISOString(),
    url,
    action,
    observation,
    tags,
    tag_confidence: confidence,
    provisional: true,
  };

  const jsonlPath = path.join(classificationDir, "provisional.jsonl");
  await fs.appendFile(jsonlPath, `${JSON.stringify(entry)}\n`, "utf8");
  await fs.writeFile(path.join(stepsDir, `${stepId}.json`), JSON.stringify(entry, null, 2), "utf8");
  try {
    syncExplorationProvisional({ runDir, entry });
  } catch (error) {
    console.warn(`[catalog-sync] exploration provisional sync failed: ${error.message || error}`);
  }

  console.log(JSON.stringify({ ok: true, mode: "record", entry, jsonl_path: jsonlPath }, null, 2));
}

function chooseCanonical(entries) {
  return [...entries].sort((a, b) => {
    const scoreDiff = confidenceScore(b.tag_confidence) - confidenceScore(a.tag_confidence);
    if (scoreDiff !== 0) return scoreDiff;
    if (a.timestamp !== b.timestamp) return a.timestamp.localeCompare(b.timestamp);
    return String(a.step_id).localeCompare(String(b.step_id));
  })[0];
}

function unionTags(entries, prefix) {
  const out = new Set();
  for (const entry of entries) {
    for (const tag of entry.tags || []) {
      if (tag.startsWith(prefix)) out.add(tag);
    }
  }
  return [...out];
}

async function finalizeSession(args) {
  const runDir = args["run-dir"];
  if (!runDir) throw new Error("run-dir is required");

  const { classificationDir } = await ensureClassificationDir(runDir);
  const provisionalPath = path.join(classificationDir, "provisional.jsonl");
  const entries = await readJsonl(provisionalPath);
  if (!entries.length) {
    throw new Error(`no provisional entries found at ${provisionalPath}`);
  }

  const grouped = new Map();
  for (const entry of entries) {
    const fingerprint = buildFingerprint(entry);
    if (!grouped.has(fingerprint)) grouped.set(fingerprint, []);
    grouped.get(fingerprint).push(entry);
  }

  const finalItems = [];
  for (const [fingerprint, group] of grouped.entries()) {
    const canonical = chooseCanonical(group);
    const surfaceCandidates = unionTags(group, "surface.");
    const experienceCandidates = unionTags(group, "experience.");
    const canonicalSurface = (canonical.tags || []).find((t) => t.startsWith("surface."));
    const chosenSurface = canonicalSurface || surfaceCandidates[0];
    const finalTags = [chosenSurface, ...experienceCandidates];
    validateTags(finalTags);

    const reviewReasons = [];
    if (surfaceCandidates.length > 1) reviewReasons.push("surface_conflict");
    if (canonical.tag_confidence === "low") reviewReasons.push("low_confidence");

    finalItems.push({
      fingerprint,
      canonical_step_id: canonical.step_id,
      duplicate_step_ids: group.filter((e) => e.step_id !== canonical.step_id).map((e) => e.step_id),
      step_ids: group.map((e) => e.step_id),
      url: canonical.url,
      action: canonical.action,
      tags: finalTags,
      surface_candidates: surfaceCandidates,
      experience_candidates: experienceCandidates,
      tag_confidence: canonical.tag_confidence,
      needs_user_confirmation: reviewReasons.length > 0,
      review_reasons: reviewReasons,
    });
  }

  const reviewNeeded = finalItems.filter((item) => item.needs_user_confirmation);
  const finalReport = {
    generated_at: new Date().toISOString(),
    run_dir: runDir,
    provisional_count: entries.length,
    deduped_count: finalItems.length,
    duplicate_count: entries.length - finalItems.length,
    items: finalItems,
  };
  const reviewReport = {
    generated_at: finalReport.generated_at,
    run_dir: runDir,
    review_count: reviewNeeded.length,
    items: reviewNeeded,
  };

  const finalPath = path.join(classificationDir, "final-tags.json");
  const reviewPath = path.join(classificationDir, "review-needed.json");
  await Promise.all([
    fs.writeFile(finalPath, JSON.stringify(finalReport, null, 2), "utf8"),
    fs.writeFile(reviewPath, JSON.stringify(reviewReport, null, 2), "utf8"),
  ]);
  try {
    syncExplorationFinal({ runDir, finalPath, finalReport });
  } catch (error) {
    console.warn(`[catalog-sync] exploration final sync failed: ${error.message || error}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "finalize",
        final_path: finalPath,
        review_path: reviewPath,
        provisional_count: finalReport.provisional_count,
        deduped_count: finalReport.deduped_count,
        review_count: reviewReport.review_count,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const command = process.argv[2];
  const args = parseArgs(process.argv.slice(3));
  if (!command || command === "--help" || command === "-h") {
    usage();
    process.exit(1);
  }

  if (command === "record") {
    await recordEntry(args);
    return;
  }
  if (command === "finalize") {
    await finalizeSession(args);
    return;
  }

  usage();
  throw new Error(`unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
