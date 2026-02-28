#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { CatalogStore } = require("../src/store/catalogStore");

function getEvidenceDir() {
  return process.env.EVIDENCE_DIR || "evidence";
}

function getDbPath(evidenceDir) {
  return process.env.CATALOG_DB || path.join(evidenceDir, "index", "catalog.sqlite");
}

function safeJsonParse(text, source) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`failed to parse JSON from ${source}: ${error.message}`);
  }
}

async function readJsonl(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => safeJsonParse(line, `${filePath}:${i + 1}`));
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findFiles(rootDir, fileName) {
  const results = [];
  if (!(await pathExists(rootDir))) return results;

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === fileName) {
        results.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return results;
}

function normalizeRunMeta(runDir) {
  const base = path.basename(runDir);
  const parts = base.split("-");
  const competitor = parts.length >= 5 ? parts[3] : null;
  const flowName = parts.length >= 5 ? parts.slice(4).join("_") : base;
  return { competitor, flowName, runName: base };
}

function runStatusFromArtifacts(rows) {
  const statuses = new Set(rows.map((r) => r.status).filter(Boolean));
  if (statuses.has("failed_with_bundle")) return "failed_with_bundle";
  if (statuses.has("incomplete")) return "incomplete";
  if (statuses.has("success")) return "success";
  return null;
}

async function importDeterministic(store, evidenceDir) {
  const indexPath = path.join(evidenceDir, "index", "artifacts.jsonl");
  if (!(await pathExists(indexPath))) {
    return { artifacts: 0, runs: 0, steps: 0, tags: 0, skipped: 0 };
  }

  const rows = await readJsonl(indexPath);
  const runMap = new Map();
  let stepCount = 0;
  let tagCount = 0;

  for (const row of rows) {
    if (!row || !row.run_id || !row.step_id) continue;

    const flowId = store.upsertFlow({
      competitor: row.competitor || null,
      flow_name: row.flow_name || "unknown",
      source_type: "deterministic",
    });
    store.upsertRun({
      run_id: row.run_id,
      flow_id: flowId,
      source_type: "deterministic",
      run_dir: path.join(evidenceDir, "runs", row.run_id),
      status: row.status || null,
      started_at: row.timestamp || null,
      ended_at: row.timestamp || null,
    });

    const existingRun = runMap.get(row.run_id) || {
      flowId,
      startedAt: row.timestamp || null,
      endedAt: row.timestamp || null,
      rows: [],
    };
    existingRun.flowId = flowId;
    if (row.timestamp && (!existingRun.startedAt || row.timestamp < existingRun.startedAt)) {
      existingRun.startedAt = row.timestamp;
    }
    if (row.timestamp && (!existingRun.endedAt || row.timestamp > existingRun.endedAt)) {
      existingRun.endedAt = row.timestamp;
    }
    existingRun.rows.push(row);
    runMap.set(row.run_id, existingRun);

    const stepRowId = store.upsertStep({
      run_id: row.run_id,
      source_type: "deterministic",
      segment_id: row.segment_id || "",
      step_id: row.step_id,
      timestamp: row.timestamp || null,
      url: row.url || null,
      action: row.action || null,
      status: row.status || null,
      assistance_mode: row.assistance_mode || null,
      artifact_ref: null,
      dom_snapshot_ref: row.dom_snapshot_ref || null,
      screenshot_ref: row.screenshot_ref || null,
      text_content_ref: row.text_content_ref || null,
      error_message: row.error_message || null,
      failure_bundle_ref: row.failure_bundle_ref || null,
    });
    const tags = Array.isArray(row.tags) ? row.tags : [];
    store.replaceStepTags(stepRowId, tags);
    stepCount += 1;
    tagCount += tags.length;
  }

  for (const [runId, info] of runMap.entries()) {
    store.upsertRun({
      run_id: runId,
      flow_id: info.flowId,
      source_type: "deterministic",
      run_dir: path.join(evidenceDir, "runs", runId),
      status: runStatusFromArtifacts(info.rows),
      started_at: info.startedAt,
      ended_at: info.endedAt,
    });
  }

  return {
    artifacts: rows.length,
    runs: runMap.size,
    steps: stepCount,
    tags: tagCount,
    skipped: 0,
  };
}

async function importExploration(store, evidenceDir) {
  const explorationRoot = path.join(evidenceDir, "exploration");
  const provisionalFiles = await findFiles(explorationRoot, "provisional.jsonl");
  const finalFiles = await findFiles(explorationRoot, "final-tags.json");

  let runs = 0;
  let steps = 0;
  let tags = 0;
  let groups = 0;
  let reviewGroups = 0;

  for (const provisionalPath of provisionalFiles) {
    const classificationDir = path.dirname(provisionalPath);
    const runDir = path.dirname(classificationDir);
    const { competitor, flowName, runName } = normalizeRunMeta(runDir);
    const runId = `exploration:${runName}`;

    const flowId = store.upsertFlow({
      competitor,
      flow_name: flowName,
      source_type: "exploration",
    });
    store.upsertRun({
      run_id: runId,
      flow_id: flowId,
      source_type: "exploration",
      run_dir: runDir,
      status: "captured",
      started_at: null,
      ended_at: null,
    });

    const rows = await readJsonl(provisionalPath);
    let startedAt = null;
    let endedAt = null;
    for (const row of rows) {
      if (!row || !row.step_id) continue;
      if (row.timestamp && (!startedAt || row.timestamp < startedAt)) startedAt = row.timestamp;
      if (row.timestamp && (!endedAt || row.timestamp > endedAt)) endedAt = row.timestamp;
      const stepRowId = store.upsertStep({
        run_id: runId,
        source_type: "exploration",
        segment_id: "",
        step_id: row.step_id,
        timestamp: row.timestamp || null,
        url: row.url || null,
        action: row.action || null,
        status: null,
        assistance_mode: null,
        artifact_ref: path.join(classificationDir, "steps", `${row.step_id}.json`),
        tag_confidence: row.tag_confidence || null,
        provisional: row.provisional === false ? 0 : 1,
      });
      const rowTags = Array.isArray(row.tags) ? row.tags : [];
      store.replaceStepTags(stepRowId, rowTags);
      steps += 1;
      tags += rowTags.length;
    }

    store.upsertRun({
      run_id: runId,
      flow_id: flowId,
      source_type: "exploration",
      run_dir: runDir,
      status: "captured",
      started_at: startedAt,
      ended_at: endedAt,
    });
    runs += 1;
  }

  for (const finalPath of finalFiles) {
    const classificationDir = path.dirname(finalPath);
    const runDir = path.dirname(classificationDir);
    const { competitor, flowName, runName } = normalizeRunMeta(runDir);
    const runId = `exploration:${runName}`;
    const flowId = store.upsertFlow({
      competitor,
      flow_name: flowName,
      source_type: "exploration",
    });
    store.upsertRun({
      run_id: runId,
      flow_id: flowId,
      source_type: "exploration",
      run_dir: runDir,
      status: "classified",
    });
    const finalJson = safeJsonParse(await fs.readFile(finalPath, "utf8"), finalPath);
    const items = Array.isArray(finalJson.items) ? finalJson.items : [];

    for (const item of items) {
      store.upsertClassificationGroup({
        run_id: runId,
        fingerprint: item.fingerprint,
        canonical_step_id: item.canonical_step_id || null,
        step_ids_json: JSON.stringify(item.step_ids || []),
        duplicate_step_ids_json: JSON.stringify(item.duplicate_step_ids || []),
        tags_json: JSON.stringify(item.tags || []),
        tag_confidence: item.tag_confidence || null,
        needs_user_confirmation: item.needs_user_confirmation ? 1 : 0,
        review_reasons_json: JSON.stringify(item.review_reasons || []),
        source_ref: finalPath,
      });
      groups += 1;
      if (item.needs_user_confirmation) reviewGroups += 1;

      const stepIds = Array.isArray(item.step_ids) ? item.step_ids : [];
      for (const stepId of stepIds) {
        const isCanonical = stepId === item.canonical_step_id;
        store.upsertStep({
          run_id: runId,
          source_type: "exploration",
          segment_id: "",
          step_id: stepId,
          fingerprint: item.fingerprint || null,
          canonical_step_id: item.canonical_step_id || null,
          duplicate_of: isCanonical ? null : item.canonical_step_id || null,
          needs_user_confirmation: item.needs_user_confirmation ? 1 : 0,
          review_reasons_json: JSON.stringify(item.review_reasons || []),
          provisional: 0,
          tag_confidence: item.tag_confidence || null,
        });
      }
    }
  }

  return {
    provisional_files: provisionalFiles.length,
    final_files: finalFiles.length,
    runs,
    steps,
    tags,
    groups,
    review_groups: reviewGroups,
  };
}

function readCatalogCounts(store) {
  const one = (sql) => store.db.prepare(sql).get().count;
  return {
    flows: one("SELECT COUNT(*) AS count FROM flows"),
    runs: one("SELECT COUNT(*) AS count FROM runs"),
    steps: one("SELECT COUNT(*) AS count FROM steps"),
    step_tags: one("SELECT COUNT(*) AS count FROM step_tags"),
    classification_groups: one("SELECT COUNT(*) AS count FROM classification_groups"),
  };
}

async function main() {
  const evidenceDir = getEvidenceDir();
  const dbPath = getDbPath(evidenceDir);
  const store = new CatalogStore(dbPath);
  store.init();

  try {
    const deterministic = await importDeterministic(store, evidenceDir);
    const exploration = await importExploration(store, evidenceDir);
    const counts = readCatalogCounts(store);
    console.log(
      JSON.stringify(
        {
          ok: true,
          evidence_dir: evidenceDir,
          db_path: dbPath,
          imported: { deterministic, exploration },
          catalog_counts: counts,
        },
        null,
        2,
      ),
    );
  } finally {
    store.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
