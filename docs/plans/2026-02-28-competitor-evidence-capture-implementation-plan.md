# Competitor Evidence Capture Tool Implementation Plan

Date: 2026-02-28
Status: Draft for execution
Depends on: `docs/plans/2026-02-28-competitor-evidence-capture-design.md`

## 1) Objective

Ship a reliable v1 system that captures deterministic competitor flow evidence, supports searchable artifacts, escalates failures for diagnosis/takeover, and outputs grounded recommendations.

Primary KPI:
- Deterministic flow completion rate per run.

## 2) Scope Lock (V1)

- Flows: signup/onboarding + post-login tours.
- Evidence unit: step artifact.
- Search: metadata filters + full-text.
- Recommendations: rule-based scoring + LLM explanation.
- Miro: export-first.
- Failure handling: OpenClaw escalation + human takeover segmentation.

## 3) Workstreams and Milestones

## M0: Foundations (1-2 days)
Deliverables:
- Repo scaffolding for services/modules.
- Environment and secrets contract (test accounts, API keys, storage).
- Logging and run ID conventions.

Exit criteria:
- `make setup` (or equivalent) works on a clean machine.
- Run IDs are generated and visible in logs.

## M1: Deterministic Flow Runner + Artifact Capture (4-6 days)
Deliverables:
- Playwright runner that executes scripted steps.
- Step artifact writer with required fields.
- Atomic success semantics (no partial success).

Exit criteria:
- One competitor flow runs end-to-end and writes artifacts for every step.
- Failed step writes `failed_with_bundle` status and never appears as success.

## M2: Evidence Store + Search (3-5 days)
Deliverables:
- Evidence persistence layer for step artifacts and failure bundles.
- Metadata filtering (competitor, flow, status, assistance mode, date).
- Full-text indexing over DOM/OCR text.

Exit criteria:
- Known query test set returns expected artifacts.
- Deterministic-only default filter works.

## M3: Failure Escalation + Manual Takeover (3-5 days)
Deliverables:
- Failure bundle capture (trace, screenshot, DOM, logs).
- OpenClaw escalation payload and response handling.
- Pause/resume run lifecycle with segmented labeling.

Exit criteria:
- Injected failure triggers escalation automatically.
- Human takeover creates `human-assisted` segment without relabeling deterministic history.

## M4: Recommendation Engine (3-4 days)
Deliverables:
- Rule scorer using fixed taxonomy/rubric.
- LLM explanation layer constrained to scored evidence only.
- Recommendation record with cited step IDs.

Exit criteria:
- Each recommendation links to valid evidence IDs.
- Recommendations can be reproduced from the same run data.

## M5: Miro Export (2-3 days)
Deliverables:
- Manual/batch exporter for selected artifacts.
- Export mapping for tags and artifact links.

Exit criteria:
- Selected evidence appears correctly on target Miro board.
- Core system remains functional if Miro export is disabled/fails.

## 4) Required Spec Docs (create before M1 coding)

1. `docs/specs/step-artifact-schema.md`
- Required fields, enums, status transitions, failure bundle structure.

2. `docs/taxonomy/v1-tags.md`
- Controlled tags, definitions, allowed combinations, examples.

3. `docs/rubric/v1-recommendation-rules.md`
- Scoring rules, thresholds, priority bands, evidence requirements.

## 5) Pilot Dataset Definition

- Competitors: 2.
- Flows per competitor: 2 (signup/onboarding + post-login core tour).
- Total scripted flows in pilot: 4.
- Reliability evaluation: 10 repeat runs on at least one full flow before advancing to M3.

## 6) Test and Verification Plan

1. Reliability tests
- Repeat run stability checks and failure rate tracking.

2. Evidence integrity tests
- Validate success artifacts contain all required fields.

3. Search tests
- Fixed query suite with expected IDs.

4. Segmentation tests
- Deterministic vs human-assisted boundary validation.

5. Recommendation grounding tests
- Every recommendation cites existing step IDs.

## 7) Risks and Controls

1. UI drift breaks selectors frequently
- Control: centralized selector strategy, failure bundle diagnostics, fast patch cycle.

2. Auth/session expiry causes noisy failures
- Control: pre-run session health check and clear error classification.

3. Recommendation drift or hallucination
- Control: rule-first scoring and hard requirement for evidence citations.

## 8) Execution Order (pragmatic)

1. Write 3 spec docs.
2. Implement M1 deterministic runner and artifact capture.
3. Implement M2 storage/search and verify deterministic retrieval.
4. Run 10-run reliability baseline.
5. Implement M3 escalation/takeover.
6. Implement M4 recommendation layer.
7. Implement M5 Miro export.

## 9) Definition of Done (V1)

- Pilot flows run with deterministic completion at agreed threshold.
- Success artifacts are complete and auditable.
- Failures generate diagnostic bundles and optional takeover path.
- Search returns reproducible evidence.
- Recommendations are evidence-linked and reproducible.
