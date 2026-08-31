"use strict";

const DISPLAY_NAME_SOURCES = Object.freeze({
  CONTACT_NAME: "contact_name",
  BUSINESS_NAME: "business_name",
  ROOM_NAME: "room_name",
  PUSH_NAME: "push_name",
  GHOST_NAME: "ghost_name",
  PHONE_FALLBACK: "phone_fallback",
  LEGACY: "legacy",
  UNKNOWN: "unknown",
});

const DISPLAY_NAME_RANKS = Object.freeze({
  [DISPLAY_NAME_SOURCES.CONTACT_NAME]: 100,
  [DISPLAY_NAME_SOURCES.BUSINESS_NAME]: 95,
  [DISPLAY_NAME_SOURCES.ROOM_NAME]: 80,
  [DISPLAY_NAME_SOURCES.PUSH_NAME]: 60,
  [DISPLAY_NAME_SOURCES.GHOST_NAME]: 50,
  [DISPLAY_NAME_SOURCES.LEGACY]: 40,
  [DISPLAY_NAME_SOURCES.PHONE_FALLBACK]: 20,
  [DISPLAY_NAME_SOURCES.UNKNOWN]: 0,
});

const AVATAR_SOURCES = Object.freeze({
  PORTAL: "portal",
  ROOM: "room",
  GHOST: "ghost",
  REMOTE_PROFILE: "remote_profile",
  LEGACY: "legacy",
  NONE: "none",
  UNKNOWN: "unknown",
});

const AVATAR_RANKS = Object.freeze({
  [AVATAR_SOURCES.PORTAL]: 100,
  [AVATAR_SOURCES.ROOM]: 90,
  [AVATAR_SOURCES.GHOST]: 80,
  [AVATAR_SOURCES.REMOTE_PROFILE]: 75,
  [AVATAR_SOURCES.LEGACY]: 20,
  [AVATAR_SOURCES.NONE]: 0,
  [AVATAR_SOURCES.UNKNOWN]: 0,
});

const AVATAR_STATES = Object.freeze({
  AVAILABLE: "available",
  BROKEN: "broken",
  MISSING: "missing",
  UNKNOWN: "unknown",
});

function normalizeString(value = "") {
  return String(value || "").trim();
}

function looksLikeIdentifierFallback(value = "") {
  const normalized = normalizeString(value);
  if (!normalized) return false;
  return (
    /^\+?[\d\s().-]+$/.test(normalized) ||
    /^!?[^\s]+:(?:[^\s]+)$/.test(normalized) ||
    /@(s\.whatsapp\.net|lid|g\.us|broadcast|newsletter)$/i.test(normalized)
  );
}

function rankForDisplayNameSource(source = "", displayName = "") {
  const normalizedSource = normalizeString(source).toLowerCase();
  if (DISPLAY_NAME_RANKS[normalizedSource] !== undefined) {
    return DISPLAY_NAME_RANKS[normalizedSource];
  }
  if (!normalizeString(displayName)) return 0;
  return looksLikeIdentifierFallback(displayName)
    ? DISPLAY_NAME_RANKS[DISPLAY_NAME_SOURCES.PHONE_FALLBACK]
    : DISPLAY_NAME_RANKS[DISPLAY_NAME_SOURCES.LEGACY];
}

function normalizeMetadata(input = {}) {
  const displayName = normalizeString(input.displayName);
  const displayNameSource =
    normalizeString(input.displayNameSource).toLowerCase() ||
    (displayName
      ? looksLikeIdentifierFallback(displayName)
        ? DISPLAY_NAME_SOURCES.PHONE_FALLBACK
        : DISPLAY_NAME_SOURCES.LEGACY
      : DISPLAY_NAME_SOURCES.UNKNOWN);
  const suppliedRank = Number(input.displayNameRank);
  const displayNameRank = Number.isFinite(suppliedRank) && suppliedRank >= 0
    ? suppliedRank
    : rankForDisplayNameSource(displayNameSource, displayName);
  const avatarMxc = normalizeString(input.avatarMxc);
  const avatarSource =
    normalizeString(input.avatarSource).toLowerCase() ||
    (avatarMxc ? AVATAR_SOURCES.LEGACY : AVATAR_SOURCES.NONE);
  const suppliedAvatarRank = Number(input.avatarRank);
  const avatarRank = Number.isFinite(suppliedAvatarRank) && suppliedAvatarRank >= 0
    ? suppliedAvatarRank
    : AVATAR_RANKS[avatarSource] ??
      (avatarMxc ? AVATAR_RANKS[AVATAR_SOURCES.LEGACY] : 0);
  const avatarState =
    normalizeString(input.avatarState).toLowerCase() ||
    (avatarMxc ? AVATAR_STATES.UNKNOWN : AVATAR_STATES.MISSING);

  return {
    displayName,
    displayNameSource,
    displayNameRank,
    avatarMxc,
    avatarSource,
    avatarRank,
    avatarState,
    avatarUpdatedAt: input.avatarUpdatedAt ? new Date(input.avatarUpdatedAt) : null,
    lastActivityAt: input.lastActivityAt ? new Date(input.lastActivityAt) : null,
    lastEventId: normalizeString(input.lastEventId),
  };
}

function isValidDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function shouldUseIncomingName(existing, incoming) {
  if (!incoming.displayName) return false;
  if (!existing.displayName) return true;
  if (incoming.displayNameRank > existing.displayNameRank) return true;
  return (
    incoming.displayNameRank === existing.displayNameRank &&
    incoming.displayNameSource === existing.displayNameSource
  );
}

function mergeConversationMetadata(existingInput = {}, incomingInput = {}) {
  const existing = normalizeMetadata(existingInput);
  const incoming = normalizeMetadata(incomingInput);
  const useIncomingName = shouldUseIncomingName(existing, incoming);
  const existingActivity = isValidDate(existing.lastActivityAt)
    ? existing.lastActivityAt
    : null;
  const incomingActivity = isValidDate(incoming.lastActivityAt)
    ? incoming.lastActivityAt
    : null;
  const useIncomingActivity = Boolean(
    incomingActivity &&
      (!existingActivity || incomingActivity.getTime() >= existingActivity.getTime())
  );
  const incomingAvatarAvailable =
    Boolean(incoming.avatarMxc) && incoming.avatarState === AVATAR_STATES.AVAILABLE;
  const existingAvatarAvailable =
    Boolean(existing.avatarMxc) && existing.avatarState === AVATAR_STATES.AVAILABLE;
  const incomingAvatarCandidate =
    Boolean(incoming.avatarMxc) &&
    ![AVATAR_STATES.BROKEN, AVATAR_STATES.MISSING].includes(incoming.avatarState);
  const existingAvatarCandidate =
    Boolean(existing.avatarMxc) &&
    ![AVATAR_STATES.BROKEN, AVATAR_STATES.MISSING].includes(existing.avatarState);
  const useIncomingAvatar = Boolean(
    incomingAvatarAvailable &&
      (!existingAvatarAvailable || incoming.avatarRank >= existing.avatarRank) ||
    !existingAvatarAvailable &&
      !incomingAvatarAvailable &&
      incomingAvatarCandidate &&
      (!existingAvatarCandidate || incoming.avatarRank >= existing.avatarRank)
  );
  const authoritativeRemoval = Boolean(
    incomingInput.authoritativeAvatarRemoval === true &&
      [AVATAR_STATES.BROKEN, AVATAR_STATES.MISSING].includes(incoming.avatarState)
  );

  return {
    displayName: useIncomingName ? incoming.displayName : existing.displayName,
    displayNameSource: useIncomingName
      ? incoming.displayNameSource
      : existing.displayNameSource,
    displayNameRank: useIncomingName
      ? incoming.displayNameRank
      : existing.displayNameRank,
    avatarMxc: authoritativeRemoval
      ? ""
      : useIncomingAvatar
        ? incoming.avatarMxc
        : existing.avatarMxc,
    avatarSource: authoritativeRemoval
      ? AVATAR_SOURCES.NONE
      : useIncomingAvatar
        ? incoming.avatarSource
        : existing.avatarSource,
    avatarRank: authoritativeRemoval
      ? 0
      : useIncomingAvatar
        ? incoming.avatarRank
        : existing.avatarRank,
    avatarState: authoritativeRemoval
      ? incoming.avatarState
      : useIncomingAvatar
        ? incoming.avatarState
        : existing.avatarState,
    avatarUpdatedAt: authoritativeRemoval
      ? incoming.avatarUpdatedAt || new Date()
      : useIncomingAvatar
        ? incoming.avatarUpdatedAt || existing.avatarUpdatedAt
        : existing.avatarUpdatedAt,
    lastActivityAt: useIncomingActivity
      ? incomingActivity
      : existingActivity,
    lastEventId: useIncomingActivity
      ? incoming.lastEventId || existing.lastEventId
      : existing.lastEventId,
  };
}

function pickDisplayNameCandidate(candidates = []) {
  let selected = normalizeMetadata({});
  for (const candidate of candidates || []) {
    selected = mergeConversationMetadata(selected, candidate || {});
  }
  return selected;
}

module.exports = {
  DISPLAY_NAME_SOURCES,
  DISPLAY_NAME_RANKS,
  AVATAR_SOURCES,
  AVATAR_RANKS,
  AVATAR_STATES,
  looksLikeIdentifierFallback,
  rankForDisplayNameSource,
  normalizeMetadata,
  mergeConversationMetadata,
  pickDisplayNameCandidate,
};
