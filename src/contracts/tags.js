const SURFACE_TAGS = new Set([
  "surface.auth",
  "surface.billing",
  "surface.navigation",
  "surface.checklist",
  "surface.tooltip",
  "surface.settings",
  "surface.people",
]);

const SURFACE_NESTED_TAGS = new Map([
  [
    "people",
    new Set([
      "onboarding",
      "offboarding",
      "dismissed",
      "collaborators",
    ]),
  ],
]);

const EXPERIENCE_TAGS = new Set([
  "experience.friction",
  "experience.clarity",
  "experience.speed",
  "experience.trust",
  "experience.distraction",
]);

function validateTags(tags) {
  if (!Array.isArray(tags)) {
    throw new Error("tags must be an array when provided");
  }

  const unique = [...new Set(tags)];
  const surface = unique.filter((t) => t.startsWith("surface."));
  const experience = unique.filter((t) => t.startsWith("experience."));
  const unknown = unique.filter((t) => !t.startsWith("surface.") && !t.startsWith("experience."));

  for (const t of surface) {
    if (!isValidSurfaceTag(t)) throw new Error(`invalid surface tag: ${t}`);
  }
  for (const t of experience) {
    if (!EXPERIENCE_TAGS.has(t)) throw new Error(`invalid experience tag: ${t}`);
  }

  if (unknown.length > 0) {
    throw new Error(`invalid tag namespace: ${unknown[0]}`);
  }
  if (surface.length < 1) {
    throw new Error("tags require at least one surface.* tag");
  }

  return true;
}

function isValidSurfaceTag(tag) {
  if (SURFACE_TAGS.has(tag)) return true;
  const match = /^surface\.([a-z0-9-]+)\.([a-z0-9-]+)$/.exec(tag);
  if (!match) return false;
  const [, domain, leaf] = match;
  const leaves = SURFACE_NESTED_TAGS.get(domain);
  return Boolean(leaves && leaves.has(leaf));
}

module.exports = {
  SURFACE_TAGS,
  SURFACE_NESTED_TAGS,
  EXPERIENCE_TAGS,
  isValidSurfaceTag,
  validateTags,
};
