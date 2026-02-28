#!/usr/bin/env node
const { chromium } = require("playwright");
const { runDeterministicFlow } = require("../src/runner/deterministicRunner");
const { EvidenceStore } = require("../src/store/evidenceStore");

async function main() {
  const evidenceDir = process.env.EVIDENCE_DIR || "evidence";
  const runId = `run_${Date.now()}`;

  const flow = {
    run_id: runId,
    segment_id: "seg_det_001",
    competitor: "example",
    flow_name: "signup_onboarding",
    steps: [
      { step_id: "step_01_open", type: "goto", url: "https://example.com" },
      { step_id: "step_02_wait", type: "wait_for", selector: "h1" },
    ],
  };

  const browser = await chromium.launch({ headless: true });
  const result = await runDeterministicFlow({ browser, flow, evidenceDir });
  await browser.close();

  const store = new EvidenceStore(evidenceDir);
  for (const r of result.results) {
    if (r.ref) {
      const artifact = require(`../${r.ref}`);
      await store.persistArtifact(artifact);
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
