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
  try {
    const counts = {
      flows: store.db.prepare("SELECT COUNT(*) AS count FROM flows").get().count,
      runs: store.db.prepare("SELECT COUNT(*) AS count FROM runs").get().count,
      steps: store.db.prepare("SELECT COUNT(*) AS count FROM steps").get().count,
      tags: store.db.prepare("SELECT COUNT(*) AS count FROM step_tags").get().count,
      classification_groups: store.db.prepare("SELECT COUNT(*) AS count FROM classification_groups").get().count,
    };

    const flowRows = store.db
      .prepare(
        `
        SELECT
          f.competitor,
          f.flow_name,
          f.source_type,
          COUNT(DISTINCT r.run_id) AS run_count,
          COUNT(s.step_row_id) AS step_count
        FROM flows f
        LEFT JOIN runs r ON r.flow_id = f.flow_id
        LEFT JOIN steps s ON s.run_id = r.run_id
        GROUP BY f.flow_id
        ORDER BY f.source_type, f.competitor, f.flow_name
      `,
      )
      .all();

    console.log(
      JSON.stringify(
        {
          ok: true,
          db_path: dbPath,
          counts,
          flows: flowRows,
        },
        null,
        2,
      ),
    );
  } finally {
    store.close();
  }
}

main();
