# V1 Recommendation Rules Rubric

Status: Rule-first rubric for recommendation scoring

## Purpose

Define deterministic scoring rules used before any LLM explanation layer.

## Inputs

Each recommendation candidate must map to one or more step artifacts with valid step IDs.

Required inputs per candidate:
- `candidate_id`
- `evidence_step_ids[]`
- `tags[]` from `docs/taxonomy/v1-tags.md`
- `status` summary across cited steps
- `frequency` (count across runs)

## Scoring Dimensions

Score each candidate from 0-5 per dimension:

- `impact`: expected product/user impact.
- `confidence`: confidence from evidence quality.
- `frequency`: repetition across runs/competitors.
- `effort_inverse`: easier fixes score higher.

Total score:

`total = (impact * 0.35) + (confidence * 0.30) + (frequency * 0.20) + (effort_inverse * 0.15)`

## Deterministic Rules

- Confidence cap:
  - If any cited evidence includes `evidence.incomplete`, `confidence <= 2`.
  - If all cited evidence is `evidence.complete`, `confidence >= 3`.
- Frequency floor:
  - Frequency score 0 when seen once.
  - Frequency score 3 when seen in >=3 runs.
  - Frequency score 5 when seen in >=6 runs.
- Boundary rule:
  - Default scoring scope includes deterministic evidence only.
  - Human-assisted evidence included only when explicitly requested.

## Priority Bands

- `P0`: total >= 4.2 and confidence >= 4
- `P1`: total >= 3.4 and confidence >= 3
- `P2`: total >= 2.5
- `Backlog`: total < 2.5

## Evidence Requirements

A recommendation is valid only if:
- Every cited `step_id` exists in persisted artifacts.
- All cited steps belong to the declared scope (deterministic by default).
- At least one cited artifact has complete proof fields.

## Output Contract

Recommendation record fields:
- `recommendation_id`
- `priority_band`
- `total_score`
- `dimension_scores`
- `evidence_step_ids`
- `rule_trace` (list of applied rules)
- `generated_explanation` (optional; produced later by LLM layer)
