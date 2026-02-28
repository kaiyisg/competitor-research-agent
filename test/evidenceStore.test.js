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
    doc_section: "shared",
    doc_title: "Employment eligibility (Form I-9)",
    doc_target_type: "external_pdf",
    doc_target_host: "uscis.gov",
    tags: [
      "surface.navigation",
      "experience.clarity",
    ],
  });

  await store.persistArtifact({
    ...common,
    step_id: "step_fail",
    action: "wait_for:#missing",
    timestamp: "2026-02-28T12:00:01.000Z",
    status: "failed_with_bundle",
    failure_bundle_ref: "bundle.json",
    error_message: "selector not found",
    doc_section: "templates",
    doc_title: "Add template",
    doc_target_type: "internal_page",
    doc_target_host: "app.gusto.com",
    tags: [
      "surface.navigation",
      "experience.friction",
    ],
  });

  const hits = await store.search({ text: "selector", status: "failed_with_bundle" });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].step_id, "step_fail");

  const deterministicOnly = await store.search({ deterministic_only: true });
  assert.equal(deterministicOnly.length, 2);

  const byTags = await store.search({ tags: ["surface.navigation", "experience.clarity"] });
  assert.equal(byTags.length, 1);
  assert.equal(byTags[0].step_id, "step_ok");

  const byDocSection = await store.search({ doc_section: "templates" });
  assert.equal(byDocSection.length, 1);
  assert.equal(byDocSection[0].step_id, "step_fail");

  let invalidTagSetRejected = false;
  try {
    await store.persistArtifact({
      ...common,
      step_id: "step_bad",
      action: "click:#bad",
      timestamp: "2026-02-28T12:00:03.000Z",
      status: "success",
      tags: [
        "surface.navigation",
        "journey.post_login_tour",
      ],
    });
  } catch (error) {
    invalidTagSetRejected = /invalid tag namespace/.test(String(error.message || error));
  }
  assert.equal(invalidTagSetRejected, true);

  console.log("evidenceStore.test: OK");
})();
