# V1 Tags Taxonomy

Status: Approved for M2 indexing + downstream recommendation scoring

## Goals

- Provide controlled tags for searchable evidence.
- Keep tag set fixed and auditable for V1.

## Tag Groups

## 1) Surface Area

Allowed values:
- `surface.auth`
- `surface.billing`
- `surface.navigation`
- `surface.checklist`
- `surface.tooltip`
- `surface.settings`
- `surface.people`

Nested values (2-layer surface tags):
- `surface.people.onboarding`
- `surface.people.offboarding`
- `surface.people.dismissed`
- `surface.people.collaborators`

## 2) Experience Signal

Allowed values:
- `experience.friction`
- `experience.clarity`
- `experience.speed`
- `experience.trust`
- `experience.distraction`

## Combination Rules

- At least one `surface.*` tag is required.
- Zero or more `experience.*` tags are allowed.
- Only `surface.*` and `experience.*` namespaces are valid.
- Nested surface tags must use approved domain + leaf combinations.
- For People-specific surfaces, prefer nested tags (for example `surface.people.onboarding`) over generic `surface.navigation`.

## Example Tag Sets

- Auth page with clear flow:
  - `surface.auth`, `experience.clarity`
- Tooltip interaction with friction:
  - `surface.tooltip`, `experience.friction`
- People onboarding page:
  - `surface.people.onboarding`, `experience.clarity`
