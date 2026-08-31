"use strict";

const {
  MATRIX_MESSAGING_PROVIDERS,
  MESSAGING_CLASSIFICATION_STATUSES,
  MESSAGING_CLASSIFICATION_SOURCES,
  MESSAGING_CONVERSATION_TYPES,
  ROOM_CLASSIFICATION_RESULTS,
  ROOM_EVIDENCE_STRENGTHS,
  ROOM_CLASSIFICATION_REASON_CODES,
  CURRENT_CLASSIFICATION_VERSION,
  assertMessagingProvider,
} = require("./messagingConstants");

function normalizeString(value = "") {
  return String(value || "").trim();
}

function lower(value = "") {
  return normalizeString(value).toLowerCase();
}

function otherProviders(provider = "") {
  return Object.values(MATRIX_MESSAGING_PROVIDERS).filter(
    (entry) => entry !== provider
  );
}

function getStateEvents(matrixRoom = {}) {
  return Array.isArray(matrixRoom.stateEvents) ? matrixRoom.stateEvents : [];
}

function getMemberMxids(matrixRoom = {}) {
  return getStateEvents(matrixRoom)
    .filter((event) => event.type === "m.room.member" && event.state_key)
    .filter((event) => event.content?.membership !== "leave")
    .map((event) => normalizeString(event.state_key))
    .filter(Boolean);
}

function getRoomName(matrixRoom = {}) {
  return (
    getStateEvents(matrixRoom).find((event) => event.type === "m.room.name")
      ?.content?.name || ""
  );
}

function getAvatarMxc(matrixRoom = {}) {
  return (
    getStateEvents(matrixRoom).find((event) => event.type === "m.room.avatar")
      ?.content?.url || ""
  );
}

function hasBridgeInfo(matrixRoom = {}) {
  return getStateEvents(matrixRoom).some(
    (event) => event.type === "m.bridge" || event.type === "uk.half-shot.bridge"
  );
}

function hasGhostPrefix(matrixRoom = {}, provider = "") {
  const prefix =
    provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP
      ? "@whatsapp_"
      : provider === MATRIX_MESSAGING_PROVIDERS.SIGNAL
        ? "@signal_"
        : "";
  return prefix
    ? getMemberMxids(matrixRoom).some((mxid) => lower(mxid).startsWith(prefix))
    : false;
}

function addEvidence(evidence, source, strength, result) {
  evidence.push({ source, strength, result });
}

function isManagementRoom({
  connection = {},
  matrixRoom = {},
  managementRoomId = "",
  hasPortalEvidence = false,
}) {
  const roomId = normalizeString(matrixRoom.roomId);
  if (roomId && roomId === normalizeString(managementRoomId)) return true;
  if (hasPortalEvidence) return false;
  const members = getMemberMxids(matrixRoom);
  const bridgeBot = normalizeString(connection.bridgeBotMxid);
  if (!bridgeBot || !members.includes(bridgeBot)) return false;
  const hasRemoteGhost =
    hasGhostPrefix(matrixRoom, MATRIX_MESSAGING_PROVIDERS.WHATSAPP) ||
    hasGhostPrefix(matrixRoom, MATRIX_MESSAGING_PROVIDERS.SIGNAL);
  return !hasRemoteGhost && !hasBridgeInfo(matrixRoom);
}

function buildPortalFields(provider = "", portal = {}, matrixRoom = {}) {
  const type = Object.values(MESSAGING_CONVERSATION_TYPES).includes(portal.type)
    ? portal.type
    : MESSAGING_CONVERSATION_TYPES.UNKNOWN;
  return {
    remoteChatId:
      normalizeString(portal.canonicalRemoteChatKey) ||
      normalizeString(portal.otherUserId) ||
      normalizeString(portal.portalId) ||
      normalizeString(portal.receiver),
    remoteConversationKey:
      normalizeString(portal.canonicalRemoteChatKey) ||
      normalizeString(portal.otherUserId) ||
      normalizeString(portal.portalId) ||
      normalizeString(portal.receiver),
    portalBridgeId: normalizeString(portal.portalId),
    type,
    displayName: normalizeString(portal.name) || normalizeString(getRoomName(matrixRoom)),
    displayNameSource: normalizeString(portal.nameSource) || "room_name",
    displayNameRank: Number(portal.nameRank || 0),
    avatarMxc: normalizeString(portal.avatarMxc) || normalizeString(getAvatarMxc(matrixRoom)),
    avatarSource: normalizeString(portal.avatarSource) ||
      (normalizeString(getAvatarMxc(matrixRoom)) ? "room" : "none"),
    avatarState:
      normalizeString(portal.avatarMxc) || normalizeString(getAvatarMxc(matrixRoom))
        ? "unknown"
        : "missing",
    provider,
  };
}

function summarizeClassificationSource(result = {}) {
  if (result.status === ROOM_CLASSIFICATION_RESULTS.CONFLICT) {
    return MESSAGING_CLASSIFICATION_SOURCES.PROVIDER_CONFLICT;
  }
  if (result.status === ROOM_CLASSIFICATION_RESULTS.VERIFIED) {
    return MESSAGING_CLASSIFICATION_SOURCES.BRIDGE_PORTAL_MATRIX_OWNER;
  }
  return MESSAGING_CLASSIFICATION_SOURCES.BRIDGE_RECONCILER;
}

function toConversationStatus(resultStatus = "") {
  if (resultStatus === ROOM_CLASSIFICATION_RESULTS.VERIFIED) {
    return MESSAGING_CLASSIFICATION_STATUSES.VERIFIED;
  }
  if (resultStatus === ROOM_CLASSIFICATION_RESULTS.CONFLICT) {
    return MESSAGING_CLASSIFICATION_STATUSES.CONFLICT;
  }
  if (resultStatus === ROOM_CLASSIFICATION_RESULTS.STALE) {
    return MESSAGING_CLASSIFICATION_STATUSES.STALE;
  }
  return MESSAGING_CLASSIFICATION_STATUSES.UNCLASSIFIED;
}

function classifyRoom({
  userId,
  provider,
  connection = {},
  matrixRoom = {},
  bridgeEvidence = {},
  ownerMatched = true,
  managementRoomId = "",
} = {}) {
  const normalizedProvider = assertMessagingProvider(provider);
  const matrixRoomId = normalizeString(matrixRoom.roomId);
  const evidence = [];
  const providerEvidence = bridgeEvidence[normalizedProvider] || {};
  const providerPortal = providerEvidence.byRoomId?.get(matrixRoomId) || null;
  const conflictingProviders = otherProviders(normalizedProvider).filter((entry) =>
    Boolean(bridgeEvidence[entry]?.byRoomId?.get(matrixRoomId))
  );

  if (ownerMatched) {
    addEvidence(
      evidence,
      "matrix_owner",
      ROOM_EVIDENCE_STRENGTHS.STRONG,
      ROOM_CLASSIFICATION_REASON_CODES.MATRIX_OWNER_MATCH
    );
  } else {
    addEvidence(
      evidence,
      "matrix_owner",
      ROOM_EVIDENCE_STRENGTHS.STRONG,
      ROOM_CLASSIFICATION_REASON_CODES.CONNECTION_MISMATCH
    );
  }

  if (
    isManagementRoom({
      connection,
      matrixRoom,
      managementRoomId,
      hasPortalEvidence: Boolean(providerPortal),
    })
  ) {
    return {
      status: ROOM_CLASSIFICATION_RESULTS.IGNORED,
      provider: normalizedProvider,
      matrixRoomId,
      evidence,
      reasonCode: ROOM_CLASSIFICATION_REASON_CODES.MANAGEMENT_ROOM,
      classificationVersion: CURRENT_CLASSIFICATION_VERSION,
    };
  }

  if (providerPortal) {
    addEvidence(
      evidence,
      "bridge_portal",
      ROOM_EVIDENCE_STRENGTHS.STRONG,
      ROOM_CLASSIFICATION_REASON_CODES.BRIDGE_PORTAL_MATCH
    );
  }

  for (const conflictingProvider of conflictingProviders) {
    addEvidence(
      evidence,
      `${conflictingProvider}_bridge_portal`,
      ROOM_EVIDENCE_STRENGTHS.STRONG,
      ROOM_CLASSIFICATION_REASON_CODES.PROVIDER_EVIDENCE_CONFLICT
    );
  }

  const members = getMemberMxids(matrixRoom);
  if (connection.bridgeBotMxid && members.includes(connection.bridgeBotMxid)) {
    addEvidence(
      evidence,
      "bridge_bot",
      ROOM_EVIDENCE_STRENGTHS.MEDIUM,
      ROOM_CLASSIFICATION_REASON_CODES.BRIDGE_BOT_MATCH
    );
  }
  if (hasBridgeInfo(matrixRoom)) {
    addEvidence(
      evidence,
      "matrix_bridge_state",
      ROOM_EVIDENCE_STRENGTHS.MEDIUM,
      ROOM_CLASSIFICATION_REASON_CODES.BRIDGE_STATE_EVENT
    );
  }
  if (hasGhostPrefix(matrixRoom, normalizedProvider)) {
    addEvidence(
      evidence,
      "ghost_prefix",
      ROOM_EVIDENCE_STRENGTHS.WEAK,
      ROOM_CLASSIFICATION_REASON_CODES.GHOST_PREFIX
    );
  }
  if (/whatsapp|signal/i.test(getRoomName(matrixRoom))) {
    addEvidence(
      evidence,
      "room_name",
      ROOM_EVIDENCE_STRENGTHS.WEAK,
      ROOM_CLASSIFICATION_REASON_CODES.ROOM_NAME_HINT
    );
  }

  if (!ownerMatched) {
    return {
      status: ROOM_CLASSIFICATION_RESULTS.CONFLICT,
      provider: normalizedProvider,
      matrixRoomId,
      evidence,
      reasonCode: ROOM_CLASSIFICATION_REASON_CODES.CONNECTION_MISMATCH,
      classificationVersion: CURRENT_CLASSIFICATION_VERSION,
    };
  }

  if (providerPortal && conflictingProviders.length) {
    return {
      status: ROOM_CLASSIFICATION_RESULTS.CONFLICT,
      provider: normalizedProvider,
      matrixRoomId,
      ...buildPortalFields(normalizedProvider, providerPortal, matrixRoom),
      evidence,
      reasonCode: ROOM_CLASSIFICATION_REASON_CODES.PROVIDER_EVIDENCE_CONFLICT,
      classificationVersion: CURRENT_CLASSIFICATION_VERSION,
    };
  }

  if (!providerPortal && conflictingProviders.length) {
    return {
      status: ROOM_CLASSIFICATION_RESULTS.CONFLICT,
      provider: normalizedProvider,
      matrixRoomId,
      evidence,
      reasonCode: ROOM_CLASSIFICATION_REASON_CODES.PROVIDER_EVIDENCE_CONFLICT,
      classificationVersion: CURRENT_CLASSIFICATION_VERSION,
    };
  }

  if (providerPortal) {
    return {
      status: ROOM_CLASSIFICATION_RESULTS.VERIFIED,
      provider: normalizedProvider,
      matrixRoomId,
      ...buildPortalFields(normalizedProvider, providerPortal, matrixRoom),
      evidence,
      reasonCode: ROOM_CLASSIFICATION_REASON_CODES.BRIDGE_PORTAL_MATCH,
      classificationVersion: CURRENT_CLASSIFICATION_VERSION,
    };
  }

  return {
    status: ROOM_CLASSIFICATION_RESULTS.UNCLASSIFIED,
    provider: normalizedProvider,
    matrixRoomId,
    type: MESSAGING_CONVERSATION_TYPES.UNKNOWN,
    displayName: "",
    avatarMxc: "",
    evidence,
    reasonCode: ROOM_CLASSIFICATION_REASON_CODES.INSUFFICIENT_EVIDENCE,
    classificationVersion: CURRENT_CLASSIFICATION_VERSION,
  };
}

module.exports = {
  classifyRoom,
  toConversationStatus,
  summarizeClassificationSource,
  __test: {
    getMemberMxids,
    getRoomName,
    hasGhostPrefix,
    isManagementRoom,
    buildPortalFields,
  },
};
