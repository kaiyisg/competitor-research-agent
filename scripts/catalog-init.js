#!/usr/bin/env node
const path = require("node:path");
const { CatalogStore } = require("../src/store/catalogStore");

function getDbPath() {
  const evidenceDir = process.env.EVIDENCE_DIR || "evidence";
  return process.env.CATALOG_DB || path.join(evidenceDir, "index", "catalog.sqlite");
}

function main() {
  const dbPath = getDbPath();
  const store = new CatalogStore(dbPath);
  store.init();
  store.close();
  console.log(JSON.stringify({ ok: true, db_path: dbPath }, null, 2));
}

main();
