const fs = require("node:fs/promises");
const path = require("node:path");
const { validateStepArtifact } = require("../contracts/stepArtifact");
const { syncDeterministicArtifact } = require("./catalogSync");

class EvidenceStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.indexPath = path.join(baseDir, "index", "artifacts.jsonl");
  }

  async init() {
    await fs.mkdir(path.join(this.baseDir, "index"), { recursive: true });
    try {
      await fs.access(this.indexPath);
    } catch {
      await fs.writeFile(this.indexPath, "", "utf8");
    }
  }

  async persistArtifact(artifact) {
    validateStepArtifact(artifact);
    await this.init();
    await fs.appendFile(this.indexPath, `${JSON.stringify(artifact)}\n`, "utf8");
    try {
      syncDeterministicArtifact({ artifact, evidenceDir: this.baseDir });
    } catch (error) {
      console.warn(`[catalog-sync] failed for ${artifact.run_id}/${artifact.step_id}: ${error.message || error}`);
    }
  }

  async _readAll() {
    await this.init();
    const raw = await fs.readFile(this.indexPath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  async search(query = {}) {
    const {
      competitor,
      flow_name,
      status,
      assistance_mode,
      doc_section,
      doc_target_type,
      doc_target_host,
      tags,
      from,
      to,
      text,
      deterministic_only = true,
    } = query;
    const requestedTags = Array.isArray(tags)
      ? tags
      : typeof tags === "string"
        ? tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

    const all = await this._readAll();
    const out = [];
    for (const a of all) {
      if (deterministic_only && a.assistance_mode !== "deterministic") continue;
      if (competitor && a.competitor !== competitor) continue;
      if (flow_name && a.flow_name !== flow_name) continue;
      if (status && a.status !== status) continue;
      if (assistance_mode && a.assistance_mode !== assistance_mode) continue;
      if (doc_section && a.doc_section !== doc_section) continue;
      if (doc_target_type && a.doc_target_type !== doc_target_type) continue;
      if (doc_target_host && a.doc_target_host !== doc_target_host) continue;
      if (requestedTags.length) {
        const actualTags = Array.isArray(a.tags) ? a.tags : [];
        if (!requestedTags.every((t) => actualTags.includes(t))) continue;
      }
      if (from && a.timestamp < from) continue;
      if (to && a.timestamp > to) continue;
      if (text) {
        let capturedText = "";
        if (a.text_content_ref) {
          try {
            capturedText = await fs.readFile(a.text_content_ref, "utf8");
          } catch {
            capturedText = "";
          }
        }
        const haystack = [
          a.action,
          a.url,
          a.error_message || "",
          a.step_id,
          a.flow_name,
          a.doc_title || "",
          a.doc_section || "",
          a.doc_target_type || "",
          a.doc_target_host || "",
          Array.isArray(a.tags) ? a.tags.join(" ") : "",
          capturedText,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(String(text).toLowerCase())) continue;
      }
      out.push(a);
    }
    return out;
  }
}

module.exports = { EvidenceStore };
