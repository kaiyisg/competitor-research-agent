# Competitor Evidence Capture Tool Design

Date: 2026-02-28
Status: Approved (brainstorming phase)
Owner: Product + Research

## 1) Goal

Build a reliable evidence pipeline that captures competitor product flows as searchable, traceable artifacts and suggests prioritized next actions.

Primary success metric:
- Percentage of planned flows completed deterministically per run.

## 2) In-Scope for V1

- Flow coverage:
  - Signup + onboarding flows.
  - Post-login product tours.
- Evidence unit:
  - Step artifact with: action, URL, DOM snapshot reference, screenshot reference, timestamp.
- Search:
  - Deterministic metadata filters + full-text search (no embeddings in v1).
- Recommendations:
  - Hybrid method:
    - Rule-based scoring for priority and consistency.
    - LLM for explanation/recommendation wording from scored evidence only.
- Miro:
  - Export-first workflow (internal evidence store remains source of truth).
- Accounts:
  - Managed competitor test accounts + persisted auth/session state.
- Failure escalation:
  - Escalate failures to OpenClaw diagnostics and allow manual takeover.
  - Preserve deterministic vs human-assisted evidence boundaries.

## 3) Out-of-Scope for V1

- Vector or semantic embedding retrieval.
- Full autonomous exploration as source-of-truth evidence.
- Miro as primary storage/index.

## 4) Architecture

### 4.1 Components

1. Flow Runner (Playwright)
- Executes deterministic scripted flows using managed account/session state.

2. Artifact Collector
- Writes one step artifact per action with strict required fields.

3. Failure Escalation Service
- On failure, captures failure bundle and sends to OpenClaw.
- Supports run pause + operator takeover.

4. Evidence Store + Index
- Stores artifacts and indexes metadata + full-text.

5. Recommendation Engine
- Rule scorer computes opportunities from fixed taxonomy.
- LLM generates explanation and next-step suggestions from scorer outputs.

6. Miro Exporter
- Pushes selected artifacts/cards on demand or in batch.

### 4.2 Core Artifact Schema (minimum)

- run_id
- segment_id
- step_id
- competitor
- flow_name
- action
- url
- dom_snapshot_ref
- screenshot_ref
- timestamp
- status (success, failed_with_bundle, incomplete)
- assistance_mode (deterministic, human-assisted)

## 5) Data Flow and Lifecycle

1. Run initialization
- Select competitor, flow pack, account profile.
- Load auth state and run session health check.
- Register expected steps for completion scoring.

2. Deterministic execution
- Execute step action + wait condition.
- Save artifact atomically (all required proof fields must exist to mark success).

3. Failure boundary
- On fail, capture bundle:
  - failure screenshot
  - DOM snapshot
  - trace + console/network logs
  - selector/action metadata
- Pause run and escalate to OpenClaw.

4. Manual takeover mode
- If operator takes over, create new segment tagged human-assisted.
- Keep prior deterministic segment unchanged.

5. Index and search
- Index success and failed_with_bundle artifacts only.
- Default search scope: deterministic artifacts.
- Optional toggle to include human-assisted artifacts.

6. Recommendations
- Rules apply fixed taxonomy/rubric to evidence.
- LLM explains recommendations; every recommendation includes supporting step IDs.

## 6) Reliability and Integrity Rules

- No silent passes.
- Any success step must include complete proof package.
- Partial writes become incomplete and are excluded from trusted deterministic evidence.
- Any post-failure operator actions must be labeled human-assisted.

## 7) Error Handling Policy

- Expired login/session:
  - Stop early and classify as account/session failure.
- Selector/UI drift:
  - Capture failure bundle, escalate to OpenClaw, optionally hand over.
- Captcha/anti-bot challenge:
  - Pause run and require manual takeover.
- Storage/index write failure:
  - Mark step incomplete and prevent deterministic success marking.

## 8) Testing Strategy

1. Reliability tests
- Re-run same scripted flows to measure deterministic completion rate.

2. Evidence integrity tests
- Validate required fields for every success artifact.

3. Search verification tests
- Known metadata and keyword queries return expected artifacts.

4. Boundary tests
- Deterministic and human-assisted segments never mix labels.

5. Recommendation grounding tests
- Every recommendation must cite existing step IDs.

## 9) V1 Acceptance Gates

- Deterministic completion metric reaches target threshold.
- 100% of success steps contain complete proof fields.
- 100% of failures produce diagnostic bundles.
- Search returns reproducible results from stored artifacts.
- All recommendations link to evidence IDs.

## 10) Risks and Mitigations

1. High maintenance from competitor UI changes
- Mitigation: strict failure bundles + OpenClaw-assisted diagnosis + fast script patch loop.

2. Auth/session instability
- Mitigation: managed accounts, session health checks, session refresh procedures.

3. Recommendation quality drift
- Mitigation: keep rules as primary scorer, constrain LLM to explanation role, audit with cited evidence IDs.

## 11) Implementation Direction (next phase)

- Build Playwright deterministic runner and artifact schema first.
- Add failure escalation and takeover segmentation next.
- Add metadata/full-text indexing next.
- Add hybrid recommendation layer last.
- Integrate Miro export after core evidence reliability is stable.
