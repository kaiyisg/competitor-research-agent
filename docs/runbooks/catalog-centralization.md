# Catalog Centralization Runbook

This project keeps raw evidence files on disk and stores a structured central index in SQLite.

## Paths

- Raw evidence:
  - `evidence/runs/`
  - `evidence/exploration/`
- Central catalog database:
  - `evidence/index/catalog.sqlite`

## Commands

- Initialize schema:
  - `npm run catalog:init`
- Backfill/import existing evidence into catalog:
  - `npm run catalog:backfill`
- View summary:
  - `npm run catalog:summary`

## Automatic Sync

- Deterministic runner artifacts are synced into catalog when `EvidenceStore.persistArtifact(...)` runs.
- Exploration classification is synced when:
  - `tag-session.js record` is called
  - `tag-session.js finalize` is called

Backfill remains useful for one-time migration or recovery.

## Notes

- Raw files remain source-of-truth; catalog is an index for search/reporting.
- Backfill is idempotent (safe to run repeatedly).
- Override default paths with:
  - `EVIDENCE_DIR=<path>`
  - `CATALOG_DB=<path-to-sqlite-file>`
