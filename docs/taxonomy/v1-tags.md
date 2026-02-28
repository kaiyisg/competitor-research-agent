# V1 Tags Taxonomy

Status: Approved for M2 indexing + downstream recommendation scoring

## Goals

- Provide controlled tags for searchable evidence.
- Keep tag set fixed and auditable for V1.

## Tag Groups

## 1) Journey Stage

Allowed values:
- `journey.signup`
- `journey.onboarding`
- `journey.post_login_tour`

## 2) Surface Area

Allowed values:
- `surface.auth`
- `surface.billing`
- `surface.navigation`
- `surface.checklist`
- `surface.tooltip`
- `surface.settings`

## 3) UX Signal

Allowed values:
- `ux.friction`
- `ux.clarity`
- `ux.speed`
- `ux.trust`
- `ux.distraction`

## 4) Evidence Quality

Allowed values:
- `evidence.complete`
- `evidence.failed_with_bundle`
- `evidence.incomplete`

## 5) Assistance Boundary

Allowed values:
- `assist.deterministic`
- `assist.human_assisted`

## Combination Rules

- Exactly one `journey.*` tag is required.
- At least one `surface.*` tag is required.
- Zero or more `ux.*` tags are allowed.
- Exactly one `evidence.*` tag is required.
- Exactly one `assist.*` tag is required.
- `assist.deterministic` must not be used for human-assisted segments.

## Example Tag Sets

- Signup success evidence:
  - `journey.signup`, `surface.auth`, `ux.clarity`, `evidence.complete`, `assist.deterministic`
- Post-login failed step:
  - `journey.post_login_tour`, `surface.tooltip`, `ux.friction`, `evidence.failed_with_bundle`, `assist.deterministic`
