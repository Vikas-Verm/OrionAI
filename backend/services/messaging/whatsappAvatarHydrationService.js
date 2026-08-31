"use strict";

const axios = require("axios");
const conversationRepository = require("./messagingConversationRepository");
const { resolveMatrixSession } = require("./matrixSessionResolver");
const {
  AVATAR_SOURCES,
  AVATAR_RANKS,
  AVATAR_STATES,
} = require("./messagingConversationMetadata");

const reachabilityCache = new Map();
const REACHABILITY_TTL_MS = 30 * 60 * 1000;
const MEDIA_MAX_BYTES = 5 * 1024 * 1024;

function normalizeString(value = "") {
  return String(value || "").trim();
}

function parseMxc(value = "") {
  const match = normalizeString(value).match(/^mxc:\/\/([^/]+)\/(.+)$/);
  return match ? { serverName: match[1], mediaId: match[2] } : null;
}

function mediaDownloadUrl(homeserverUrl = "", mxc = "") {
  const parsed = parseMxc(mxc);
  if (!parsed) return "";
  return `${normalizeString(homeserverUrl).replace(/\/+$/, "")}` +
    `/_matrix/client/v1/media/download/${encodeURIComponent(parsed.serverName)}` +
    `/${encodeURIComponent(parsed.mediaId)}`;
}

function avatarCandidate(avatarMxc = "", avatarSource = AVATAR_SOURCES.UNKNOWN) {
  const source = normalizeString(avatarSource).toLowerCase() || AVATAR_SOURCES.UNKNOWN;
  return {
    avatarMxc: normalizeString(avatarMxc),
    avatarSource: source,
    avatarRank: AVATAR_RANKS[source] || 0,
  };
}

function uniqueCandidates(candidates = []) {
  const seen = new Set();
  return candidates
    .map((candidate) => avatarCandidate(candidate?.avatarMxc, candidate?.avatarSource))
    .filter((candidate) => {
      if (!candidate.avatarMxc || seen.has(candidate.avatarMxc)) return false;
      seen.add(candidate.avatarMxc);
      return true;
    });
}

async function defaultReachabilityCheck({ homeserverUrl, accessToken, mxc }) {
  const url = mediaDownloadUrl(homeserverUrl, mxc);
  if (!url) return { reachable: false, status: 0 };
  const cached = reachabilityCache.get(mxc);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const response = await axios.get(url, {
    timeout: 15_000,
    responseType: "arraybuffer",
    maxContentLength: MEDIA_MAX_BYTES,
    maxBodyLength: MEDIA_MAX_BYTES,
    validateStatus: () => true,
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch((error) => ({ status: Number(error?.response?.status || 0) }));
  const value = {
    reachable: response.status === 200,
    status: Number(response.status || 0),
  };
  reachabilityCache.set(mxc, {
    expiresAt: Date.now() + REACHABILITY_TTL_MS,
    value,
  });
  return value;
}

async function selectReachableAvatar({
  homeserverUrl,
  accessToken,
  candidates = [],
  reachabilityCheck = defaultReachabilityCheck,
} = {}) {
  for (const candidate of uniqueCandidates(candidates)) {
    const result = await reachabilityCheck({
      homeserverUrl,
      accessToken,
      mxc: candidate.avatarMxc,
    });
    if (result?.reachable) {
      return {
        ...candidate,
        avatarState: AVATAR_STATES.AVAILABLE,
        avatarUpdatedAt: new Date(),
        httpStatus: Number(result.status || 200),
      };
    }
  }
  return {
    avatarMxc: "",
    avatarSource: AVATAR_SOURCES.NONE,
    avatarRank: 0,
    avatarState: candidates.length ? AVATAR_STATES.BROKEN : AVATAR_STATES.MISSING,
    avatarUpdatedAt: new Date(),
    httpStatus: 0,
  };
}

async function fetchRoomAvatarCandidate({ homeserverUrl, accessToken, roomId }) {
  if (!normalizeString(roomId)) return null;
  const response = await axios.get(
    `${normalizeString(homeserverUrl).replace(/\/+$/, "")}` +
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state`,
    {
      timeout: 10_000,
      validateStatus: () => true,
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  ).catch(() => null);
  const avatarMxc = normalizeString(
    Array.isArray(response?.data)
      ? response.data.find((item) =>
          item?.type === "m.room.avatar" && normalizeString(item?.state_key) === ""
        )?.content?.url
      : ""
  );
  return avatarMxc ? avatarCandidate(avatarMxc, AVATAR_SOURCES.ROOM) : null;
}

function whatsappGhostMxidsForPortal(portal = {}, matrixUserId = "") {
  const domain = normalizeString(matrixUserId).split(":").slice(1).join(":");
  if (!domain || normalizeString(portal.remoteChatType) !== "dm") return [];
  const remoteIds = [
    portal.otherUserId,
    portal.portalId,
    ...(portal.aliasRemoteChatIds || []),
  ];
  const localparts = new Set();
  for (const rawValue of remoteIds) {
    const value = normalizeString(rawValue).toLowerCase();
    if (!value) continue;
    if (/^lid-[^@]+$/.test(value) || /^bot-[^@]+$/.test(value) || /^\d+$/.test(value)) {
      localparts.add(value);
      continue;
    }
    const match = value.match(/^([^@]+)@(s\.whatsapp\.net|lid|bot)$/);
    if (!match) continue;
    const [, user, server] = match;
    localparts.add(server === "lid" ? `lid-${user}` : server === "bot" ? `bot-${user}` : user);
  }
  return [...localparts].map((localpart) => `@whatsapp_${localpart}:${domain}`);
}

function whatsappGhostMxidsFromJoinedMembers(
  joinedMembers = {},
  { matrixUserId = "", ownGhostMxid = "" } = {}
) {
  const domain = normalizeString(matrixUserId).split(":").slice(1).join(":");
  if (!domain) return [];
  const pattern = new RegExp(`^@whatsapp_.+:${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  return Object.keys(joinedMembers || {}).filter((mxid) =>
    pattern.test(mxid) && mxid !== ownGhostMxid
  );
}

function whatsappGhostMxidsFromRoomState(
  roomState = [],
  options = {}
) {
  const joined = {};
  for (const event of roomState || []) {
    if (
      event?.type === "m.room.member" &&
      event?.content?.membership === "join" &&
      normalizeString(event?.state_key)
    ) {
      joined[event.state_key] = {};
    }
  }
  return whatsappGhostMxidsFromJoinedMembers(joined, options);
}

async function fetchGhostAvatarCandidates({
  homeserverUrl,
  accessToken,
  portal,
  matrixUserId,
}) {
  if (normalizeString(portal?.remoteChatType) !== "dm") return [];
  const expectedGhostMxids = whatsappGhostMxidsForPortal(portal, matrixUserId);
  const domain = normalizeString(matrixUserId).split(":").slice(1).join(":");
  const ownGhostMxid = normalizeString(portal.loginId) && domain
    ? `@whatsapp_${normalizeString(portal.loginId)}:${domain}`
    : "";
  const isSelfPortal = expectedGhostMxids.includes(ownGhostMxid);
  const roomStateResponse = await axios.get(
    `${normalizeString(homeserverUrl).replace(/\/+$/, "")}` +
      `/_matrix/client/v3/rooms/${encodeURIComponent(portal.roomId)}/state`,
    {
      timeout: 10_000,
      validateStatus: () => true,
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  ).catch(() => null);
  const joinedGhostMxids = roomStateResponse?.status === 200
    ? whatsappGhostMxidsFromRoomState(roomStateResponse.data, {
        matrixUserId,
        ownGhostMxid: isSelfPortal ? "" : ownGhostMxid,
      })
    : [];
  const candidates = [];
  for (const ghostMxid of [...new Set([...expectedGhostMxids, ...joinedGhostMxids])]) {
    const response = await axios.get(
      `${normalizeString(homeserverUrl).replace(/\/+$/, "")}` +
        `/_matrix/client/v3/profile/${encodeURIComponent(ghostMxid)}`,
      {
        timeout: 10_000,
        validateStatus: () => true,
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    ).catch(() => null);
    const avatarMxc = normalizeString(response?.data?.avatar_url);
    if (response?.status === 200 && avatarMxc) {
      candidates.push(avatarCandidate(avatarMxc, AVATAR_SOURCES.GHOST));
    }
  }
  return candidates;
}

async function hydrateVerifiedConversationAvatars({
  userId,
  connection,
  portals = [],
  mappings = [],
  repository = conversationRepository,
  sessionResolver = resolveMatrixSession,
  roomAvatarLoader = fetchRoomAvatarCandidate,
  ghostAvatarLoader = fetchGhostAvatarCandidates,
  reachabilityCheck = defaultReachabilityCheck,
} = {}) {
  const session = await sessionResolver({ userId, provider: "whatsapp", connection });
  const portalByRoom = new Map(
    portals
      .filter((portal) => normalizeString(portal.roomId))
      .map((portal) => [normalizeString(portal.roomId), portal])
  );
  const summary = { available: 0, missing: 0, broken: 0, updated: 0 };

  for (const mapping of mappings) {
    const doc = mapping?.toObject ? mapping.toObject() : mapping || {};
    const roomId = normalizeString(doc.matrixRoomId);
    const portal = portalByRoom.get(roomId) || {};
    const roomCandidate = await roomAvatarLoader({
      homeserverUrl: session.homeserverUrl,
      accessToken: session.accessToken,
      roomId,
    }).catch(() => null);
    const ghostCandidates = await ghostAvatarLoader({
      homeserverUrl: session.homeserverUrl,
      accessToken: session.accessToken,
      portal,
      matrixUserId: connection.matrixUserId,
    }).catch(() => []);
    const existingAvatarIsValidForType = !(
      normalizeString(portal.remoteChatType) !== "dm" &&
      normalizeString(doc.avatarSource) === AVATAR_SOURCES.GHOST
    );
    const candidates = [
      ...(portal.avatarCandidates || []),
      roomCandidate,
      ...(ghostCandidates || []),
      existingAvatarIsValidForType && normalizeString(doc.avatarMxc)
        ? avatarCandidate(doc.avatarMxc, doc.avatarSource || AVATAR_SOURCES.LEGACY)
        : null,
    ].filter(Boolean);
    const selected = await selectReachableAvatar({
      homeserverUrl: session.homeserverUrl,
      accessToken: session.accessToken,
      candidates,
      reachabilityCheck,
    });
    summary[selected.avatarState] = Number(summary[selected.avatarState] || 0) + 1;
    await repository.updateConversationMetadata({
      userId,
      provider: "whatsapp",
      matrixRoomId: roomId,
      ...selected,
      authoritativeAvatarRemoval:
        !selected.avatarMxc &&
        (doc.avatarState !== AVATAR_STATES.AVAILABLE || !existingAvatarIsValidForType),
    });
    summary.updated += 1;
  }
  return summary;
}

function resetAvatarReachabilityCache() {
  reachabilityCache.clear();
}

module.exports = {
  mediaDownloadUrl,
  selectReachableAvatar,
  hydrateVerifiedConversationAvatars,
  __test: {
    parseMxc,
    avatarCandidate,
    uniqueCandidates,
    fetchRoomAvatarCandidate,
    whatsappGhostMxidsForPortal,
    whatsappGhostMxidsFromJoinedMembers,
    whatsappGhostMxidsFromRoomState,
    fetchGhostAvatarCandidates,
    resetAvatarReachabilityCache,
  },
};
