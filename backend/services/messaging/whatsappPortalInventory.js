"use strict";

const crypto = require("crypto");

const WHATSAPP_PORTAL_TYPES = Object.freeze({
  DM: "dm",
  GROUP: "group",
  BROADCAST: "broadcast",
  NEWSLETTER: "newsletter",
  STATUS: "status",
  SYSTEM: "system",
  UNKNOWN: "unknown",
});

const WHATSAPP_PORTAL_STATES = Object.freeze({
  VERIFIED: "verified",
  PENDING: "pending",
  IGNORED: "ignored",
  DUPLICATE_ALIAS: "duplicate_alias",
  UNSUPPORTED: "unsupported",
  FAILED: "failed",
});

function normalizeString(value = "") {
  return String(value || "").trim();
}

function fingerprintPortal(portalId = "", receiver = "") {
  return crypto
    .createHash("sha256")
    .update(`${normalizeString(portalId)}|${normalizeString(receiver)}`)
    .digest("hex")
    .slice(0, 8);
}

function classifyWhatsAppPortalType(portalId = "", roomType = "") {
  const id = normalizeString(portalId).toLowerCase();
  const type = normalizeString(roomType).toLowerCase();
  if (id === "status@broadcast") return WHATSAPP_PORTAL_TYPES.STATUS;
  if (id === "0@s.whatsapp.net" || id === "0@lid") {
    return WHATSAPP_PORTAL_TYPES.SYSTEM;
  }
  if (id.endsWith("@newsletter")) return WHATSAPP_PORTAL_TYPES.NEWSLETTER;
  if (id.endsWith("@broadcast")) return WHATSAPP_PORTAL_TYPES.BROADCAST;
  if (id.endsWith("@g.us") || type.includes("group")) {
    return WHATSAPP_PORTAL_TYPES.GROUP;
  }
  if (id.endsWith("@bot") || id.includes("system")) {
    return WHATSAPP_PORTAL_TYPES.SYSTEM;
  }
  if (
    id.endsWith("@s.whatsapp.net") ||
    id.endsWith("@lid") ||
    type.includes("dm") ||
    type.includes("private")
  ) {
    return WHATSAPP_PORTAL_TYPES.DM;
  }
  return WHATSAPP_PORTAL_TYPES.UNKNOWN;
}

function canonicalizeWhatsAppRemoteIdentity({
  portalId = "",
  mappedLid = "",
  mappedPn = "",
} = {}) {
  const id = normalizeString(portalId);
  const rawLid = normalizeString(mappedLid).replace(/@lid$/i, "");
  const rawPn = normalizeString(mappedPn).replace(/@s\.whatsapp\.net$/i, "");
  const lid = rawLid ? `${rawLid}@lid` : "";
  const pn = rawPn ? `${rawPn}@s.whatsapp.net` : "";
  // A LID is a valid WhatsApp user identity on its own. Prefer the mapped PN
  // when available so later LID/PN aliases collapse, but do not block a
  // legitimate LID-only conversation while the bridge map is still absent.
  const canonicalRemoteChatKey = pn || id;
  return {
    canonicalRemoteChatKey,
    aliasRemoteChatIds: [...new Set([id, lid, pn].filter(Boolean))],
    identityAmbiguous: false,
  };
}

function markDuplicateAliases(portals = []) {
  const byCanonical = new Map();
  for (const portal of portals) {
    const key = normalizeString(portal.canonicalRemoteChatKey);
    if (!key) continue;
    const list = byCanonical.get(key) || [];
    list.push(portal);
    byCanonical.set(key, list);
  }
  const preferredByCanonical = new Map();
  for (const [key, candidates] of byCanonical.entries()) {
    if (candidates.length < 2) continue;
    const ranked = [...candidates].sort((left, right) => {
      const score = (portal) =>
        (portal.preferred ? 100 : 0) +
        (portal.roomId ? 50 : 0) +
        (normalizeString(portal.portalId).endsWith("@s.whatsapp.net") ? 20 : 0) +
        (normalizeString(portal.portalId).endsWith("@lid") ? 10 : 0);
      const delta = score(right) - score(left);
      if (delta !== 0) return delta;
      return fingerprintPortal(left.portalId, left.receiver).localeCompare(
        fingerprintPortal(right.portalId, right.receiver)
      );
    });
    preferredByCanonical.set(key, ranked[0]);
  }
  return portals.map((portal) => {
    const preferred = preferredByCanonical.get(portal.canonicalRemoteChatKey);
    return {
      ...portal,
      duplicateAlias: Boolean(preferred && preferred !== portal),
      hasRemoteAlias: Boolean(preferred),
    };
  });
}

function summarizeWhatsAppPortalInventory({
  portals = [],
  verifiedRoomIds = new Set(),
  joinedRoomIds = new Set(),
  failureByFingerprint = new Map(),
} = {}) {
  const records = markDuplicateAliases(portals).map((portal) => {
    const type =
      portal.remoteChatType ||
      classifyWhatsAppPortalType(portal.portalId, portal.roomType);
    const portalFingerprint =
      portal.portalFingerprint ||
      fingerprintPortal(portal.portalId, portal.receiver);
    let state = WHATSAPP_PORTAL_STATES.PENDING;
    let reasonCode = "PORTAL_ROOM_PENDING";

    if ([WHATSAPP_PORTAL_TYPES.STATUS, WHATSAPP_PORTAL_TYPES.SYSTEM].includes(type)) {
      state = WHATSAPP_PORTAL_STATES.IGNORED;
      reasonCode = type === WHATSAPP_PORTAL_TYPES.STATUS
        ? "STATUS_PORTAL"
        : "SYSTEM_PORTAL";
    } else if (
      [WHATSAPP_PORTAL_TYPES.BROADCAST, WHATSAPP_PORTAL_TYPES.NEWSLETTER].includes(type)
    ) {
      state = WHATSAPP_PORTAL_STATES.UNSUPPORTED;
      reasonCode = "UNSUPPORTED_REMOTE_CHAT_TYPE";
    } else if (portal.duplicateAlias) {
      state = WHATSAPP_PORTAL_STATES.DUPLICATE_ALIAS;
      reasonCode = "DUPLICATE_LID_JID_ALIAS";
    } else if (portal.identityAmbiguous || !portal.canonicalRemoteChatKey) {
      state = WHATSAPP_PORTAL_STATES.FAILED;
      reasonCode = "REMOTE_IDENTITY_AMBIGUOUS";
    } else if (failureByFingerprint.has(portalFingerprint)) {
      state = WHATSAPP_PORTAL_STATES.FAILED;
      reasonCode = normalizeString(failureByFingerprint.get(portalFingerprint)) ||
        "PORTAL_SYNC_FAILED";
    } else if (verifiedRoomIds.has(normalizeString(portal.roomId))) {
      state = WHATSAPP_PORTAL_STATES.VERIFIED;
      reasonCode = "BRIDGE_PORTAL_MATCH";
    } else if (!portal.roomId) {
      reasonCode = "PORTAL_ROOM_NOT_CREATED";
    } else if (!joinedRoomIds.has(normalizeString(portal.roomId))) {
      reasonCode = "MATRIX_USER_NOT_JOINED";
    } else {
      reasonCode = "BRIDGE_EVIDENCE_MISSING";
    }

    return { ...portal, portalFingerprint, remoteChatType: type, state, reasonCode };
  });

  const count = (state) => records.filter((record) => record.state === state).length;
  const ignoredCount =
    count(WHATSAPP_PORTAL_STATES.IGNORED) +
    count(WHATSAPP_PORTAL_STATES.UNSUPPORTED);
  const eligibleConversationCount = records.filter((record) =>
    [WHATSAPP_PORTAL_TYPES.DM, WHATSAPP_PORTAL_TYPES.GROUP].includes(
      record.remoteChatType
    ) && record.state !== WHATSAPP_PORTAL_STATES.DUPLICATE_ALIAS
  ).length;

  return {
    records,
    discoveredPortalCount: records.length,
    eligibleConversationCount,
    verifiedConversationCount: count(WHATSAPP_PORTAL_STATES.VERIFIED),
    pendingConversationCount: count(WHATSAPP_PORTAL_STATES.PENDING),
    ignoredCount,
    duplicateCount: count(WHATSAPP_PORTAL_STATES.DUPLICATE_ALIAS),
    failedCount: count(WHATSAPP_PORTAL_STATES.FAILED),
    diagnostics: records
      .filter((record) => record.state === WHATSAPP_PORTAL_STATES.FAILED)
      .map((record) => ({
        portalFingerprint: record.portalFingerprint,
        errorCode: record.reasonCode,
      })),
  };
}

function inventoryIsReady(summary = {}) {
  return (
    Number(summary.pendingConversationCount || 0) === 0 &&
    Number(summary.failedCount || 0) === 0 &&
    Number(summary.verifiedConversationCount || 0) ===
      Number(summary.eligibleConversationCount || 0)
  );
}

module.exports = {
  WHATSAPP_PORTAL_TYPES,
  WHATSAPP_PORTAL_STATES,
  fingerprintPortal,
  classifyWhatsAppPortalType,
  canonicalizeWhatsAppRemoteIdentity,
  markDuplicateAliases,
  summarizeWhatsAppPortalInventory,
  inventoryIsReady,
};
