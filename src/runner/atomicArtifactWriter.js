const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { validateStepArtifact } = require("../contracts/stepArtifact");

class AtomicArtifactWriter {
  constructor(baseDir) {
    this.baseDir = baseDir;
  }

  async writeArtifact(artifact) {
    validateStepArtifact(artifact);

    const runDir = path.join(this.baseDir, "runs", artifact.run_id, "artifacts");
    await fs.mkdir(runDir, { recursive: true });

    const finalPath = path.join(runDir, `${artifact.segment_id}__${artifact.step_id}.json`);
    const tempName = `.tmp-${Date.now()}-${crypto.randomUUID()}.json`;
    const tempPath = path.join(runDir, tempName);

    await fs.writeFile(tempPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, finalPath);
    return finalPath;
  }

  async writeFailureBundle(runId, segmentId, stepId, bundle) {
    const bundleDir = path.join(this.baseDir, "runs", runId, "failure_bundles");
    await fs.mkdir(bundleDir, { recursive: true });
    const finalPath = path.join(bundleDir, `${segmentId}__${stepId}.json`);
    const tempPath = path.join(bundleDir, `.tmp-${Date.now()}-${crypto.randomUUID()}.json`);

    await fs.writeFile(tempPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, finalPath);
    return finalPath;
  }
}

module.exports = { AtomicArtifactWriter };
