#!/usr/bin/env node
const { EvidenceStore } = require("../src/store/evidenceStore");

async function main() {
  const evidenceDir = process.env.EVIDENCE_DIR || "evidence";
  const text = process.argv[2] || "";
  const store = new EvidenceStore(evidenceDir);
  const rows = await store.search({ text, deterministic_only: true });
  console.log(JSON.stringify({ count: rows.length, rows }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
