const DEFAULT_ONBOARDING = Object.freeze({
  hasCompletedAppConnection: false,
  hasCompletedFirstSync: false,
  hasSeenFirstBriefing: false,
  hasSelectedFocusAreas: false,
  focusAreas: [],
  skippedFocusAreas: false,
});

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFocusAreas(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map((item) => cleanString(item))
      .filter(Boolean)
  )].slice(0, 12);
}

function toPlainObject(value) {
  if (!value || typeof value !== "object") return {};
  if (typeof value.toObject === "function") return value.toObject();
  return value;
}

function normalizeOnboarding(value = {}) {
  const source = toPlainObject(value);
  const focusAreas = normalizeFocusAreas(source.focusAreas);
  const skippedFocusAreas = source.skippedFocusAreas === true;

  return {
    hasCompletedAppConnection: source.hasCompletedAppConnection === true,
    hasCompletedFirstSync: source.hasCompletedFirstSync === true,
    hasSeenFirstBriefing: source.hasSeenFirstBriefing === true,
    hasSelectedFocusAreas:
      source.hasSelectedFocusAreas === true || focusAreas.length > 0,
    focusAreas,
    skippedFocusAreas,
  };
}

function applyOnboardingPatch(currentValue = {}, patchValue = {}) {
  const current = normalizeOnboarding(currentValue);
  const patch = toPlainObject(patchValue);
  const next = { ...current };

  if ("hasCompletedAppConnection" in patch) {
    next.hasCompletedAppConnection = patch.hasCompletedAppConnection === true;
  }
  if ("hasCompletedFirstSync" in patch) {
    next.hasCompletedFirstSync = patch.hasCompletedFirstSync === true;
  }
  if ("hasSeenFirstBriefing" in patch) {
    next.hasSeenFirstBriefing = patch.hasSeenFirstBriefing === true;
  }
  if ("hasSelectedFocusAreas" in patch) {
    next.hasSelectedFocusAreas = patch.hasSelectedFocusAreas === true;
  }
  if ("focusAreas" in patch) {
    next.focusAreas = normalizeFocusAreas(patch.focusAreas);
  }
  if ("skippedFocusAreas" in patch) {
    next.skippedFocusAreas = patch.skippedFocusAreas === true;
  }

  if (next.focusAreas.length > 0) {
    next.hasSelectedFocusAreas = true;
    next.skippedFocusAreas = false;
  } else if (next.skippedFocusAreas) {
    next.hasSelectedFocusAreas = false;
  }

  return next;
}

module.exports = {
  DEFAULT_ONBOARDING,
  normalizeOnboarding,
  applyOnboardingPatch,
  toPlainObject,
};
