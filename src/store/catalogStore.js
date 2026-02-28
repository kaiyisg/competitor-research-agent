const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function nowIso() {
  return new Date().toISOString();
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];
}

class CatalogStore {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  init() {
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS flows (
        flow_id INTEGER PRIMARY KEY AUTOINCREMENT,
        competitor TEXT,
        flow_name TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('deterministic', 'exploration')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (competitor, flow_name, source_type)
      );

      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        flow_id INTEGER NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('deterministic', 'exploration')),
        run_dir TEXT,
        status TEXT,
        started_at TEXT,
        ended_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (flow_id) REFERENCES flows(flow_id)
      );

      CREATE TABLE IF NOT EXISTS steps (
        step_row_id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('deterministic', 'exploration')),
        segment_id TEXT NOT NULL DEFAULT '',
        step_id TEXT NOT NULL,
        timestamp TEXT,
        url TEXT,
        action TEXT,
        status TEXT,
        assistance_mode TEXT,
        artifact_ref TEXT,
        dom_snapshot_ref TEXT,
        screenshot_ref TEXT,
        text_content_ref TEXT,
        error_message TEXT,
        failure_bundle_ref TEXT,
        tag_confidence TEXT,
        provisional INTEGER,
        fingerprint TEXT,
        canonical_step_id TEXT,
        duplicate_of TEXT,
        needs_user_confirmation INTEGER NOT NULL DEFAULT 0,
        review_reasons_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (run_id, source_type, segment_id, step_id),
        FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS step_tags (
        step_row_id INTEGER NOT NULL,
        tag TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (step_row_id, tag),
        FOREIGN KEY (step_row_id) REFERENCES steps(step_row_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS classification_groups (
        group_row_id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        canonical_step_id TEXT,
        step_ids_json TEXT,
        duplicate_step_ids_json TEXT,
        tags_json TEXT,
        tag_confidence TEXT,
        needs_user_confirmation INTEGER NOT NULL DEFAULT 0,
        review_reasons_json TEXT,
        source_ref TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (run_id, fingerprint),
        FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE
      );
    `);
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  upsertFlow({ competitor = null, flow_name, source_type }) {
    const ts = nowIso();
    this.db
      .prepare(
        `
        INSERT INTO flows (competitor, flow_name, source_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (competitor, flow_name, source_type)
        DO UPDATE SET updated_at = excluded.updated_at
      `,
      )
      .run(competitor, flow_name, source_type, ts, ts);

    const row = this.db
      .prepare(
        `
        SELECT flow_id
        FROM flows
        WHERE competitor IS ?
          AND flow_name = ?
          AND source_type = ?
      `,
      )
      .get(competitor, flow_name, source_type);
    return row.flow_id;
  }

  upsertRun({ run_id, flow_id, source_type, run_dir = null, status = null, started_at = null, ended_at = null }) {
    const ts = nowIso();
    this.db
      .prepare(
        `
        INSERT INTO runs (run_id, flow_id, source_type, run_dir, status, started_at, ended_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (run_id)
        DO UPDATE SET
          flow_id = excluded.flow_id,
          source_type = excluded.source_type,
          run_dir = COALESCE(excluded.run_dir, runs.run_dir),
          status = COALESCE(excluded.status, runs.status),
          started_at = CASE
            WHEN runs.started_at IS NULL THEN excluded.started_at
            WHEN excluded.started_at IS NULL THEN runs.started_at
            ELSE MIN(runs.started_at, excluded.started_at)
          END,
          ended_at = CASE
            WHEN runs.ended_at IS NULL THEN excluded.ended_at
            WHEN excluded.ended_at IS NULL THEN runs.ended_at
            ELSE MAX(runs.ended_at, excluded.ended_at)
          END,
          updated_at = excluded.updated_at
      `,
      )
      .run(run_id, flow_id, source_type, run_dir, status, started_at, ended_at, ts, ts);
  }

  upsertStep(step) {
    const ts = nowIso();
    const {
      run_id,
      source_type,
      segment_id = "",
      step_id,
      timestamp = null,
      url = null,
      action = null,
      status = null,
      assistance_mode = null,
      artifact_ref = null,
      dom_snapshot_ref = null,
      screenshot_ref = null,
      text_content_ref = null,
      error_message = null,
      failure_bundle_ref = null,
      tag_confidence = null,
      provisional = null,
      fingerprint = null,
      canonical_step_id = null,
      duplicate_of = null,
      needs_user_confirmation = 0,
      review_reasons_json = null,
    } = step;

    this.db
      .prepare(
        `
        INSERT INTO steps (
          run_id, source_type, segment_id, step_id, timestamp, url, action, status, assistance_mode,
          artifact_ref, dom_snapshot_ref, screenshot_ref, text_content_ref, error_message, failure_bundle_ref,
          tag_confidence, provisional, fingerprint, canonical_step_id, duplicate_of, needs_user_confirmation,
          review_reasons_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (run_id, source_type, segment_id, step_id)
        DO UPDATE SET
          timestamp = COALESCE(excluded.timestamp, steps.timestamp),
          url = COALESCE(excluded.url, steps.url),
          action = COALESCE(excluded.action, steps.action),
          status = COALESCE(excluded.status, steps.status),
          assistance_mode = COALESCE(excluded.assistance_mode, steps.assistance_mode),
          artifact_ref = COALESCE(excluded.artifact_ref, steps.artifact_ref),
          dom_snapshot_ref = COALESCE(excluded.dom_snapshot_ref, steps.dom_snapshot_ref),
          screenshot_ref = COALESCE(excluded.screenshot_ref, steps.screenshot_ref),
          text_content_ref = COALESCE(excluded.text_content_ref, steps.text_content_ref),
          error_message = COALESCE(excluded.error_message, steps.error_message),
          failure_bundle_ref = COALESCE(excluded.failure_bundle_ref, steps.failure_bundle_ref),
          tag_confidence = COALESCE(excluded.tag_confidence, steps.tag_confidence),
          provisional = COALESCE(excluded.provisional, steps.provisional),
          fingerprint = COALESCE(excluded.fingerprint, steps.fingerprint),
          canonical_step_id = COALESCE(excluded.canonical_step_id, steps.canonical_step_id),
          duplicate_of = COALESCE(excluded.duplicate_of, steps.duplicate_of),
          needs_user_confirmation = COALESCE(excluded.needs_user_confirmation, steps.needs_user_confirmation),
          review_reasons_json = COALESCE(excluded.review_reasons_json, steps.review_reasons_json),
          updated_at = excluded.updated_at
      `,
      )
      .run(
        run_id,
        source_type,
        segment_id,
        step_id,
        timestamp,
        url,
        action,
        status,
        assistance_mode,
        artifact_ref,
        dom_snapshot_ref,
        screenshot_ref,
        text_content_ref,
        error_message,
        failure_bundle_ref,
        tag_confidence,
        provisional,
        fingerprint,
        canonical_step_id,
        duplicate_of,
        needs_user_confirmation,
        review_reasons_json,
        ts,
        ts,
      );

    const row = this.db
      .prepare(
        `
        SELECT step_row_id
        FROM steps
        WHERE run_id = ?
          AND source_type = ?
          AND segment_id = ?
          AND step_id = ?
      `,
      )
      .get(run_id, source_type, segment_id, step_id);
    return row.step_row_id;
  }

  replaceStepTags(stepRowId, tags) {
    const uniqueTags = normalizeTags(tags);
    const ts = nowIso();
    this.db.prepare("DELETE FROM step_tags WHERE step_row_id = ?").run(stepRowId);
    const insertStmt = this.db.prepare("INSERT INTO step_tags (step_row_id, tag, created_at) VALUES (?, ?, ?)");
    for (const tag of uniqueTags) {
      insertStmt.run(stepRowId, tag, ts);
    }
  }

  upsertClassificationGroup(group) {
    const ts = nowIso();
    const {
      run_id,
      fingerprint,
      canonical_step_id = null,
      step_ids_json = null,
      duplicate_step_ids_json = null,
      tags_json = null,
      tag_confidence = null,
      needs_user_confirmation = 0,
      review_reasons_json = null,
      source_ref = null,
    } = group;

    this.db
      .prepare(
        `
        INSERT INTO classification_groups (
          run_id, fingerprint, canonical_step_id, step_ids_json, duplicate_step_ids_json, tags_json, tag_confidence,
          needs_user_confirmation, review_reasons_json, source_ref, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (run_id, fingerprint)
        DO UPDATE SET
          canonical_step_id = COALESCE(excluded.canonical_step_id, classification_groups.canonical_step_id),
          step_ids_json = COALESCE(excluded.step_ids_json, classification_groups.step_ids_json),
          duplicate_step_ids_json = COALESCE(excluded.duplicate_step_ids_json, classification_groups.duplicate_step_ids_json),
          tags_json = COALESCE(excluded.tags_json, classification_groups.tags_json),
          tag_confidence = COALESCE(excluded.tag_confidence, classification_groups.tag_confidence),
          needs_user_confirmation = COALESCE(excluded.needs_user_confirmation, classification_groups.needs_user_confirmation),
          review_reasons_json = COALESCE(excluded.review_reasons_json, classification_groups.review_reasons_json),
          source_ref = COALESCE(excluded.source_ref, classification_groups.source_ref),
          updated_at = excluded.updated_at
      `,
      )
      .run(
        run_id,
        fingerprint,
        canonical_step_id,
        step_ids_json,
        duplicate_step_ids_json,
        tags_json,
        tag_confidence,
        needs_user_confirmation,
        review_reasons_json,
        source_ref,
        ts,
        ts,
      );
  }
}

module.exports = { CatalogStore };
