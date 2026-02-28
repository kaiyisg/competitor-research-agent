const REQUIRED_FIELDS = [
  "run_id",
  "segment_id",
  "step_id",
  "competitor",
  "flow_name",
  "action",
  "url",
  "dom_snapshot_ref",
  "screenshot_ref",
  "timestamp",
  "status",
  "assistance_mode",
];

const STATUS = new Set(["success", "failed_with_bundle", "incomplete"]);
const ASSISTANCE = new Set(["deterministic", "human-assisted"]);

function validateStepArtifact(artifact) {
  const missing = REQUIRED_FIELDS.filter((k) => !artifact || artifact[k] === undefined || artifact[k] === "");
  if (missing.length) {
    throw new Error(`artifact missing required fields: ${missing.join(", ")}`);
  }

  if (!STATUS.has(artifact.status)) {
    throw new Error(`invalid status: ${artifact.status}`);
  }

  if (!ASSISTANCE.has(artifact.assistance_mode)) {
    throw new Error(`invalid assistance_mode: ${artifact.assistance_mode}`);
  }

  if (artifact.status === "failed_with_bundle" && !artifact.failure_bundle_ref) {
    throw new Error("failed_with_bundle requires failure_bundle_ref");
  }

  return true;
}

module.exports = {
  REQUIRED_FIELDS,
  STATUS,
  ASSISTANCE,
  validateStepArtifact,
};
