## Quick Reference

### Main Evidence Database

- Canonical SQLite catalog: `evidence/index/catalog.sqlite`
- Artifact log (JSONL): `evidence/index/artifacts.jsonl`
- Raw evidence folders:
  - `evidence/runs/`
  - `evidence/exploration/`

### Helpful Commands

- Summary counts: `npm run catalog:summary`
- Rebuild catalog from files: `npm run catalog:backfill`

### Path Overrides

- `EVIDENCE_DIR` overrides the default `evidence/` root.
- `CATALOG_DB` overrides the SQLite file path.
