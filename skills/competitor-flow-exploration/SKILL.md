---
name: competitor-flow-exploration
description: Iteratively explore competitor product workflows with agent-browser. Recover login first, capture evidence, apply provisional surface/experience tags during exploration, then run deterministic end-of-session dedupe and confirmation.
---

# Competitor Flow Exploration

## Overview

Use this skill to run a user-guided exploration loop on a live web app flow with integrated classification.
Always establish login first, capture baseline evidence, tag each explored step with provisional `surface.*` / `experience.*`, then finalize with deterministic dedupe and a small user confirmation pass for ambiguous cases.

## Required Inputs

- Target product/app (for example Gusto, Deputy, Talenta).
- Credentials available through repo `.env` or an existing persisted auth state.
- Optional starting flow URL.
- Optional session name. Prefer product-specific session names (for example `gusto-exp`).
- Exploration run directory (required for tagging pipeline): `evidence/exploration/<date>-<site>-<flow>/`.

## Workflow

### 1) Session Bootstrap (Mandatory)

Before exploration, recover login/session state:

1. Run the product login recovery command.
2. Confirm the browser is on an authenticated app URL.
3. If recovery fails, stop and ask one focused question.

In this repository, use:
- Gusto: `npm run gusto:recover`
- Deputy: `npm run deputy:recover`
- Talenta: `npm run talenta:recover`

### 2) App Baseline and First Check-In

1. On the authenticated app page, capture:
- Full-page screenshot.
- Interactive snapshot (`snapshot -i`).
- Current URL and title.
2. Save artifacts under `evidence/exploration/<date>-<site>-<flow>/` and treat this as `<RUN_DIR>`.
3. Ask the user:
`You are logged in. This is the <page title> page. What do you want to explore?`

### 3) Flow Selection Gate (Mandatory)

1. Check whether the user provided a specific flow URL.
2. If missing and the request is ambiguous, ask:
`Which exact page or flow URL should I start from? I won't assume one.`
3. Do not open default pages (for example `/benefits`) unless the user explicitly asked for them.
4. Once flow is clear, open it and capture a new baseline screenshot + snapshot.

### 4) Objective Framing

1. Convert the user reply into:
- Objective statement (what to verify).
- Success signal (what evidence proves it).
- Next 1-3 actions.
2. Echo the plan in one short message before interacting.

### 5) Exploration Loop (Repeat Until Confident)

For each loop cycle:

1. Run one bounded action set (navigate/click/fill/wait).
2. Re-capture evidence:
- `snapshot -i`
- Screenshot at meaningful state change
- URL/title if changed
3. Record provisional tags for this step:
- Assign one `surface.*` tag.
- Assign zero or more `experience.*` tags.
- Set `tag_confidence` (`high`, `medium`, `low`).
- Append the step record:

```bash
node skills/competitor-flow-exploration/scripts/tag-session.js record \
  --run-dir "<RUN_DIR>" \
  --step-id "<STEP_ID>" \
  --url "<CURRENT_URL>" \
  --action "<ACTION>" \
  --surface "<SURFACE_TAG>" \
  --experience "<EXPERIENCE_TAG_CSV>" \
  --confidence "<high|medium|low>" \
  --observation "<ONE_LINE_OBSERVATION>"
```

4. Summarize:
- What was observed
- What remains uncertain
- Confidence level (`high`, `medium`, `low`)
5. If confidence is not `high`, ask a focused follow-up and continue.

Stop only when:
- Confidence is `high` and the user confirms the explored objective is correct, or
- The user says to stop.

### 6) Session Finalization (Mandatory)

After the exploration loop ends, finalize and dedupe tags:

```bash
node skills/competitor-flow-exploration/scripts/tag-session.js finalize --run-dir "<RUN_DIR>"
```

This writes:
- `classification/final-tags.json`: canonical deduped classifications.
- `classification/review-needed.json`: only low-confidence or conflicting groups requiring user confirmation.

Review gate:
- If `review-needed.json` has items, ask the user only about those ambiguous/conflicting groups.
- If `review-needed.json` is empty, accept final tags without extra confirmation.

### 7) Confidence Gate (Mandatory)

Set confidence to `high` only when all are true:
- The observed UI state matches the requested objective.
- Evidence exists (screenshots + snapshot facts) for the key claim.
- No unresolved branch remains that could change the conclusion.

If any condition is missing, confidence is `medium`/`low` and you must ask the user what to explore next.

## Tagging Rules

- Allowed namespaces: `surface.*`, `experience.*` only.
- `surface.*` is required for every provisional step tag record.
- `experience.*` is optional.
- If unsure, choose a best-effort surface tag and set `tag_confidence=low` so it is queued for confirmation in finalization.

## User Interview Prompts

Use these exact patterns to keep the loop deterministic:

- Post-login initial prompt:
`You are logged in. This is the <page title> page. What do you want to explore?`
- Missing flow prompt:
`Which exact page or flow URL should I start from? I won't assume one.`
- Uncertainty prompt:
`I found <fact>. I am still unsure about <uncertainty>. Should I explore <option A> or <option B> next?`
- Tag confirmation prompt:
`I found an ambiguous classification for <step/group>. Should this be tagged as <option A> or <option B>?`
- Completion check:
`I am now confident I explored <objective>. Do you want me to explore anything else in this flow?`

## Command Pattern (agent-browser)

Use `npx agent-browser` commands with a stable session name.
Re-run `snapshot -i` after every page transition or major DOM change.

```bash
# Login bootstrap (Gusto example)
npm run gusto:recover

# App baseline after login
npx agent-browser --session gusto-exp get url
npx agent-browser --session gusto-exp get title
npx agent-browser --session gusto-exp screenshot "evidence/exploration/<run>/00-app-baseline.png" --full
npx agent-browser --session gusto-exp snapshot -i

# Flow baseline (only after user-specified flow)
npx agent-browser --session gusto-exp open "<FLOW_URL>"
npx agent-browser --session gusto-exp wait --load networkidle
npx agent-browser --session gusto-exp screenshot "evidence/exploration/<run>/00-baseline.png" --full
npx agent-browser --session gusto-exp snapshot -i
npx agent-browser --session gusto-exp get url
npx agent-browser --session gusto-exp get title

# Iterate (example)
npx agent-browser --session gusto-exp click @e12
npx agent-browser --session gusto-exp wait --load networkidle
npx agent-browser --session gusto-exp screenshot "evidence/exploration/<run>/01-after-click.png" --full
npx agent-browser --session gusto-exp snapshot -i

# Record provisional tags for the captured step
node skills/competitor-flow-exploration/scripts/tag-session.js record \
  --run-dir "evidence/exploration/<run>" \
  --step-id "01-after-click" \
  --url "<CURRENT_URL>" \
  --action "click:@e12" \
  --surface "surface.navigation" \
  --experience "experience.friction" \
  --confidence "medium" \
  --observation "User reached modal but close action not obvious"

# Finalize + dedupe at end of session
node skills/competitor-flow-exploration/scripts/tag-session.js finalize \
  --run-dir "evidence/exploration/<run>"
```

## Output Contract

On each user check-in, provide:

- Current objective.
- Key observations with artifact paths.
- Current confidence (`high`/`medium`/`low`) and why.
- Provisional tags for the latest step (`surface.*`, optional `experience.*`) with `tag_confidence`.
- One focused next-question if confidence is not `high`.

On completion, also provide:

- `classification/final-tags.json` path.
- `classification/review-needed.json` path.
- Count of deduped groups and count of groups requiring confirmation.
