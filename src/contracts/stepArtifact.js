const { validateTags } = require("./tags");

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
const DOC_SECTION = new Set(["shared", "templates", "bulk_downloads", "authorization"]);
const DOC_TARGET_TYPE = new Set(["internal_page", "external_pdf"]);

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

  if (artifact.tags !== undefined) {
    validateTags(artifact.tags);
  }

  if (artifact.doc_section !== undefined && !DOC_SECTION.has(artifact.doc_section)) {
    throw new Error(`invalid doc_section: ${artifact.doc_section}`);
  }
  if (artifact.doc_target_type !== undefined && !DOC_TARGET_TYPE.has(artifact.doc_target_type)) {
    throw new Error(`invalid doc_target_type: ${artifact.doc_target_type}`);
  }
  if (artifact.doc_title !== undefined && typeof artifact.doc_title !== "string") {
    throw new Error("doc_title must be a string when provided");
  }
  if (artifact.doc_target_host !== undefined && typeof artifact.doc_target_host !== "string") {
    throw new Error("doc_target_host must be a string when provided");
  }
  if (artifact.source_ref !== undefined && typeof artifact.source_ref !== "string") {
    throw new Error("source_ref must be a string when provided");
  }

  return true;
}

module.exports = {
  REQUIRED_FIELDS,
  STATUS,
  ASSISTANCE,
  DOC_SECTION,
  DOC_TARGET_TYPE,
  validateStepArtifact,
};
