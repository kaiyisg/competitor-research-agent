# Step Artifact Schema (V1)

Status: Approved for M1/M2 implementation
Source: `docs/plans/2026-02-28-competitor-evidence-capture-design.md`, `docs/plans/2026-02-28-competitor-evidence-capture-implementation-plan.md`

## Purpose

Defines the canonical step artifact contract used by the deterministic runner, persistence layer, and search.

## Required Fields

- `run_id` (string): unique run identifier.
- `segment_id` (string): segment identifier within a run.
- `step_id` (string): deterministic step identifier.
- `competitor` (string): competitor slug.
- `flow_name` (string): flow name slug.
- `action` (string): action executed for this step.
- `url` (string): page URL after action completes or fails.
- `dom_snapshot_ref` (string): path/reference to DOM capture file.
- `screenshot_ref` (string): path/reference to screenshot file.
- `timestamp` (string, ISO-8601 UTC): step completion timestamp.
- `status` (enum): `success` | `failed_with_bundle` | `incomplete`.
- `assistance_mode` (enum): `deterministic` | `human-assisted`.

## Optional Fields

- `error_message` (string): populated for failed/incomplete steps.
- `text_content_ref` (string): path/reference to normalized text extracted from page content for full-text search.
- `failure_bundle_ref` (string): path/reference to failure bundle JSON.

## Status Semantics

- `success`:
  - All required fields must be present.
  - Files pointed by `dom_snapshot_ref` and `screenshot_ref` must exist.
- `failed_with_bundle`:
  - `failure_bundle_ref` is required.
  - Diagnostic files (trace/logs when available) are captured in bundle.
- `incomplete`:
  - Write/storage failure or interrupted execution.
  - Never treated as trusted deterministic evidence.

## Failure Bundle Structure

A failure bundle is a JSON object with:

- `run_id`, `segment_id`, `step_id`
- `timestamp`
- `url`
- `action`
- `error_message`
- `artifacts`:
  - `failure_screenshot_ref`
  - `failure_dom_snapshot_ref`
  - `console_log_ref` (optional)
  - `network_log_ref` (optional)
  - `trace_ref` (optional)

## Integrity Rules

- No silent pass: every executed step writes exactly one step artifact.
- Atomic success: success artifacts are persisted atomically; partial writes must not appear as success.
- Boundary rule: deterministic and human-assisted segments are never relabeled or mixed.

## JSON Example

```json
{
  "run_id": "run_20260228_120000",
  "segment_id": "seg_det_001",
  "step_id": "signup_01_open",
  "competitor": "acme",
  "flow_name": "signup_onboarding",
  "action": "goto:https://example.com/signup",
  "url": "https://example.com/signup",
  "dom_snapshot_ref": "evidence/runs/run_20260228_120000/dom/signup_01_open.html",
  "screenshot_ref": "evidence/runs/run_20260228_120000/screenshots/signup_01_open.png",
  "timestamp": "2026-02-28T12:00:01.123Z",
  "status": "success",
  "assistance_mode": "deterministic",
  "text_content_ref": "evidence/runs/run_20260228_120000/text/signup_01_open.txt"
}
```
