const path = require("node:path");
const { CatalogStore } = require("./catalogStore");

function defaultEvidenceDir() {
  return process.env.EVIDENCE_DIR || "evidence";
}

function defaultCatalogDbPath(evidenceDir) {
  return process.env.CATALOG_DB || path.join(evidenceDir, "index", "catalog.sqlite");
}

function normalizeRunMeta(runDir) {
  const base = path.basename(runDir);
  const parts = base.split("-");
  const competitor = parts.length >= 5 ? parts[3] : null;
  const flowName = parts.length >= 5 ? parts.slice(4).join("_") : base;
  return { competitor, flowName, runName: base };
}

function withCatalog(evidenceDir, fn) {
  const dbPath = defaultCatalogDbPath(evidenceDir);
  const store = new CatalogStore(dbPath);
  store.init();
  try {
    return fn(store);
  } finally {
    store.close();
  }
}

function syncDeterministicArtifact({ artifact, evidenceDir = defaultEvidenceDir() }) {
  if (!artifact || !artifact.run_id || !artifact.step_id) return;
  withCatalog(evidenceDir, (store) => {
    const flowId = store.upsertFlow({
      competitor: artifact.competitor || null,
      flow_name: artifact.flow_name || "unknown",
      source_type: "deterministic",
    });

    store.upsertRun({
      run_id: artifact.run_id,
      flow_id: flowId,
      source_type: "deterministic",
      run_dir: path.join(evidenceDir, "runs", artifact.run_id),
      status: artifact.status || null,
      started_at: artifact.timestamp || null,
      ended_at: artifact.timestamp || null,
    });

    const stepRowId = store.upsertStep({
      run_id: artifact.run_id,
      source_type: "deterministic",
      segment_id: artifact.segment_id || "",
      step_id: artifact.step_id,
      timestamp: artifact.timestamp || null,
      url: artifact.url || null,
      action: artifact.action || null,
      status: artifact.status || null,
      assistance_mode: artifact.assistance_mode || null,
      artifact_ref: null,
      dom_snapshot_ref: artifact.dom_snapshot_ref || null,
      screenshot_ref: artifact.screenshot_ref || null,
      text_content_ref: artifact.text_content_ref || null,
      error_message: artifact.error_message || null,
      failure_bundle_ref: artifact.failure_bundle_ref || null,
    });

    store.replaceStepTags(stepRowId, Array.isArray(artifact.tags) ? artifact.tags : []);
  });
}

function syncExplorationProvisional({ runDir, entry, evidenceDir = defaultEvidenceDir() }) {
  if (!runDir || !entry || !entry.step_id) return;
  const { competitor, flowName, runName } = normalizeRunMeta(runDir);
  const runId = `exploration:${runName}`;

  withCatalog(evidenceDir, (store) => {
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
      started_at: entry.timestamp || null,
      ended_at: entry.timestamp || null,
    });

    const stepRowId = store.upsertStep({
      run_id: runId,
      source_type: "exploration",
      step_id: entry.step_id,
      timestamp: entry.timestamp || null,
      url: entry.url || null,
      action: entry.action || null,
      artifact_ref: path.join(runDir, "classification", "steps", `${entry.step_id}.json`),
      tag_confidence: entry.tag_confidence || null,
      provisional: entry.provisional === false ? 0 : 1,
    });
    store.replaceStepTags(stepRowId, Array.isArray(entry.tags) ? entry.tags : []);
  });
}

function syncExplorationFinal({ runDir, finalPath, finalReport, evidenceDir = defaultEvidenceDir() }) {
  if (!runDir || !finalReport || !Array.isArray(finalReport.items)) return;
  const { competitor, flowName, runName } = normalizeRunMeta(runDir);
  const runId = `exploration:${runName}`;

  withCatalog(evidenceDir, (store) => {
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
      ended_at: finalReport.generated_at || null,
    });

    for (const item of finalReport.items) {
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
        source_ref: finalPath || null,
      });

      for (const stepId of item.step_ids || []) {
        const isCanonical = stepId === item.canonical_step_id;
        store.upsertStep({
          run_id: runId,
          source_type: "exploration",
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
  });
}

module.exports = {
  defaultEvidenceDir,
  defaultCatalogDbPath,
  syncDeterministicArtifact,
  syncExplorationProvisional,
  syncExplorationFinal,
};
