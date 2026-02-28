const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { EvidenceStore } = require("../src/store/evidenceStore");

(async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "evidence-store-"));
  const store = new EvidenceStore(tmp);

  const common = {
    run_id: "run_1",
    segment_id: "seg_1",
    competitor: "acme",
    flow_name: "signup_onboarding",
    url: "https://example.com",
    dom_snapshot_ref: "dom.html",
    screenshot_ref: "shot.png",
    assistance_mode: "deterministic",
  };

  await store.persistArtifact({
    ...common,
    step_id: "step_ok",
    action: "click:#start",
    timestamp: "2026-02-28T12:00:00.000Z",
    status: "success",
  });

  await store.persistArtifact({
    ...common,
    step_id: "step_fail",
    action: "wait_for:#missing",
    timestamp: "2026-02-28T12:00:01.000Z",
    status: "failed_with_bundle",
    failure_bundle_ref: "bundle.json",
    error_message: "selector not found",
  });

  const hits = await store.search({ text: "selector", status: "failed_with_bundle" });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].step_id, "step_fail");

  const deterministicOnly = await store.search({ deterministic_only: true });
  assert.equal(deterministicOnly.length, 2);

  console.log("evidenceStore.test: OK");
})();
