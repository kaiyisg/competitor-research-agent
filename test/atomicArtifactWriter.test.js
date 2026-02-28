const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { AtomicArtifactWriter } = require("../src/runner/atomicArtifactWriter");

(async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-writer-"));
  const writer = new AtomicArtifactWriter(tmp);

  const artifact = {
    run_id: "run_1",
    segment_id: "seg_1",
    step_id: "step_1",
    competitor: "acme",
    flow_name: "signup_onboarding",
    action: "goto:https://example.com",
    url: "https://example.com",
    dom_snapshot_ref: "dom.html",
    screenshot_ref: "shot.png",
    timestamp: new Date().toISOString(),
    status: "success",
    assistance_mode: "deterministic",
  };

  const ref = await writer.writeArtifact(artifact);
  const raw = await fs.readFile(ref, "utf8");
  const parsed = JSON.parse(raw);

  assert.equal(parsed.step_id, "step_1");
  assert.equal(parsed.status, "success");

  const files = await fs.readdir(path.dirname(ref));
  assert.equal(files.some((f) => f.startsWith(".tmp-")), false);

  console.log("atomicArtifactWriter.test: OK");
})();
