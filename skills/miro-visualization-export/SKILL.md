---
name: miro-visualization-export
description: Export local evidence screenshots and controlled tags to Miro boards using OAuth-backed API calls. Use when users ask to push evidence to Miro, sync screenshot artifacts, or mirror `tags[]` for visualization while keeping the local evidence store as source of truth.
---

# Miro Visualization Export

## Overview

Use this skill to authenticate with Miro and export evidence artifacts (screenshots + tags) onto a board.
Treat Miro as visualization only: local `evidence/` artifacts remain the canonical record.

## Required Inputs

- Miro app credentials:
  - `MIRO_CLIENT_ID`
  - `MIRO_CLIENT_SECRET`
  - `MIRO_REDIRECT_URI`
- Target board ID: `MIRO_BOARD_ID`
- Evidence index path (default): `evidence/index/artifacts.jsonl`

## Workflow

### 1) Create OAuth authorization URL

```bash
node skills/miro-visualization-export/scripts/miro-auth.js auth-url \
  --client-id "$MIRO_CLIENT_ID" \
  --redirect-uri "$MIRO_REDIRECT_URI"
```

Open the URL, authorize, and copy the `code` query parameter from the callback URL.

### 2) Exchange code for tokens

```bash
node skills/miro-visualization-export/scripts/miro-auth.js exchange \
  --client-id "$MIRO_CLIENT_ID" \
  --client-secret "$MIRO_CLIENT_SECRET" \
  --redirect-uri "$MIRO_REDIRECT_URI" \
  --code "<AUTH_CODE>"
```

Save `access_token` and `refresh_token` into your local secret store.

### 3) Refresh access token when expired

```bash
node skills/miro-visualization-export/scripts/miro-auth.js refresh \
  --client-id "$MIRO_CLIENT_ID" \
  --client-secret "$MIRO_CLIENT_SECRET" \
  --refresh-token "<REFRESH_TOKEN>"
```

### 4) Dry-run export plan (recommended first)

```bash
node skills/miro-visualization-export/scripts/miro-export.js \
  --board-id "$MIRO_BOARD_ID" \
  --artifacts evidence/index/artifacts.jsonl
```

This mode does not call the API. It validates artifact rows and screenshot files, then writes an export plan.

### 5) Apply export to Miro

```bash
node skills/miro-visualization-export/scripts/miro-export.js \
  --board-id "$MIRO_BOARD_ID" \
  --access-token "$MIRO_ACCESS_TOKEN" \
  --artifacts evidence/index/artifacts.jsonl \
  --apply
```

Behavior in apply mode:
- Upload each `screenshot_ref` as an image item.
- Ensure each artifact tag exists on the board (create if missing).
- Attach tags to the created item.
- Write a manifest under `evidence/exports/`.

## Safety Rules

- Default to dry-run before `--apply`.
- Never treat Miro IDs as canonical evidence IDs.
- Keep local artifact paths and IDs unchanged; only export projections.
- Skip missing screenshot files and report them in the manifest.

## Resource Files

- API reference: `references/miro-api.md`
- Auth helper: `scripts/miro-auth.js`
- Export helper: `scripts/miro-export.js`

## Output Contract

At completion, report:
- Board ID used.
- Number of artifacts planned/exported.
- Number of skipped rows (with reasons).
- Manifest path written in `evidence/exports/`.
