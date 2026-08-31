"use strict";

const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const Integration = require("../models/Integration");
const provisioningLogin = require("./bridgeProvisioningLogin");
const {
  registerMatrixAccountWithSharedSecret,
  resetMatrixAccountWithSharedSecretAdmin,
} = require("./hiddenMatrixService");
let SqliteDatabase = null;

try {
  SqliteDatabase = require("better-sqlite3");
} catch {}

const SIGNAL_SYNC_CACHE = new Map();
const SIGNAL_SYNC_CACHE_TTL_MS = 10 * 1000;
const SIGNAL_LOGIN_BACKOFF = new Map();
// Tracks when we last asked the bridge for a QR (`login`) per user. The
// mautrix-signal QR-link flow auto-refreshes the QR ~5 times (over ~4 min)
// then posts "Login failed: too many QR code refreshes". That failure is NOT
// a hard error — it just means nobody scanned in time. While the user is
// still on the connect screen (i.e. /status is being polled) we treat it as
// retryable: keep the UI in "logging_in" and silently re-issue `login` so a
// fresh QR sequence appears instead of showing a scary error.
const SIGNAL_LOGIN_REQUESTED_AT = new Map();
const SIGNAL_LOGIN_RESEND_AT = new Map();
const SIGNAL_LOGIN_ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const SIGNAL_LOGIN_RESEND_THROTTLE_MS = 60 * 1000;
// Bridge messages that mean "the QR expired / nobody scanned" rather than a
// genuine failure. These are retried (fresh QR) during an active login.
const SIGNAL_RETRYABLE_LOGIN_RE =
  /\b(too many qr code refreshes|qr code(?: refresh| scan)?.*(?:timed out|expired|refreshes)|scanning qr|scan .*qr.*timed out|entering code|login timed out|timed out|timeout)\b/i;
const SIGNAL_QR_CACHE = new Map();
const SIGNAL_QR_CACHE_TTL_MS = 15 * 1000;
// Short-lived status cache to coalesce rapid polls (1.5s TTL). Without this,
// each /status call triggers Matrix sync + room hydration that takes 3–10s
// and piles up under polling pressure.
const SIGNAL_STATUS_CACHE = new Map();
const SIGNAL_STATUS_CACHE_TTL_MS = 1500;
// In-flight portal hydration tasks. Lets us fire-and-forget room joins so
// /status doesn't wait for them.
const SIGNAL_BG_HYDRATION = new Map();
const SIGNAL_PORTAL_READ_HINTS = new Map();
const SIGNAL_GHOST_RE = /^@signal_[^:]+:/i;
const SIGNAL_CONTACT_ROOM_PREFIX = "signal-contact:";
const SIGNAL_LOGIN_STATE_VALUES = new Set([
  "disconnected",
  "creating_account",
  "logging_in",
  "pending_qr",
  "connected",
  "error",
]);
const SIGNAL_RESUMABLE_LOGIN_STATES = new Set([
  "logging_in",
  "pending_qr",
]);
const BRIDGE_SUCCESS_RE =
  /\b(successfully logged in|logged in as|already logged in|login successful|connected to signal|linked successfully)\b/i;
const BRIDGE_QR_RE = /\b(qr code|scan .*qr|linked devices|link a device)\b/i;
const BRIDGE_ERROR_RE =
  /\b(error|failed|failure|timed out|timeout|unable to|could not|invalid)\b/i;
const SIGNAL_LINK_DEVICE_RE = /^sgnl:\/\/linkdevice\?/i;
const MATRIX_TO_ROOM_LINK_RE = /https:\/\/matrix\.to\/#\/(![^)\s]+:[^)\s]+)/i;
let signalBridgeDbPath = "";
let signalBridgeDb = null;

function defaultHomeserverUrl() {
  return (
    process.env.MATRIX_HOMESERVER_URL ||
    process.env.SIGNAL_MATRIX_HOMESERVER_URL ||
    "http://localhost:8008"
  );
}

function defaultMatrixServerDomain() {
  return process.env.MATRIX_SERVER_DOMAIN || "orion.local";
}

function defaultBridgeBotMxid() {
  return (
    process.env.MATRIX_SIGNAL_BOT_MXID ||
    process.env.SIGNAL_BRIDGE_BOT_MXID ||
    "@signalbot:orion.local"
  );
}

function readRegistrationAsToken(filePath = "") {
  try {
    const contents = fs.readFileSync(filePath, "utf8");
    return String(contents.match(/^as_token:\s*"?([^"\s]+)"?\s*$/m)?.[1] || "")
      .trim();
  } catch {
    return "";
  }
}

function defaultSignalAppserviceToken() {
  return (
    String(process.env.MATRIX_SIGNAL_AS_TOKEN || "").trim() ||
    readRegistrationAsToken(
      path.resolve(__dirname, "../../infra/mautrix-signal/registration.yaml")
    ) ||
    readRegistrationAsToken(
      path.resolve(
        __dirname,
        "../../infra/synapse/appservices/mautrix-signal-registration.yaml"
      )
    )
  );
}

function isSignalAppserviceToken(token = "") {
  const normalized = String(token || "").trim();
  return Boolean(normalized && normalized === defaultSignalAppserviceToken());
}

function defaultMatrixDeviceName() {
  return process.env.MATRIX_DEVICE_NAME || "OrionAI Signal";
}

function defaultSignalBridgeDbPath() {
  return (
    process.env.MAUTRIX_SIGNAL_DB_PATH ||
    process.env.SIGNAL_BRIDGE_DB_PATH ||
    path.resolve(__dirname, "../../infra/mautrix-signal/mautrix-signal.db")
  );
}

function normalizeHomeserverUrl(value = "") {
  const normalized = String(value || defaultHomeserverUrl()).trim();
  return normalized.replace(/\/+$/, "");
}

function normalizeMxid(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("@") ? raw : `@${raw}`;
}

function localpartFromMxid(mxid = "") {
  const normalized = normalizeMxid(mxid);
  if (!normalized) return "";
  return normalized.replace(/^@/, "").split(":")[0] || "";
}

function safeSignalLocalpart(userId = "") {
  const cleaned = String(userId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const suffix = cleaned || "user";
  return `orion_u_${suffix}`.slice(0, 64);
}

function buildHiddenSignalMxid(userId = "") {
  return `@${safeSignalLocalpart(userId)}:${defaultMatrixServerDomain()}`;
}

function buildHiddenSignalPassword(userId = "") {
  const secretSeed =
    process.env.ENCRYPTION_KEY ||
    process.env.MATRIX_ADMIN_ACCESS_TOKEN ||
    process.env.JWT_SECRET ||
    "orion-signal-hidden";
  return crypto
    .createHmac("sha256", secretSeed)
    .update(String(userId || ""))
    .digest("base64url");
}

function nowTs() {
  return Date.now();
}

function shouldResumeSignalProvisioningLogin(config = {}) {
  const mxid = String(config.mxid || "").trim();
  return Boolean(
    mxid && SIGNAL_RESUMABLE_LOGIN_STATES.has(String(config.loginState || ""))
  );
}

function resumeSignalProvisioningLogin(config = {}) {
  const mxid = String(config.mxid || "").trim();
  if (!mxid) return null;

  const runner = provisioningLogin.getLoginState("signal", mxid);
  if (runner) return runner;
  if (!shouldResumeSignalProvisioningLogin(config)) {
    return null;
  }

  // Runners live only in this Node process. Recover a persisted in-flight
  // login after a backend restart instead of returning a stale status forever.
  return provisioningLogin.startLogin("signal", mxid);
}

function normalizeTimestampMs(value = 0) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (numeric > 1e15) return Math.round(numeric / 1_000_000);
  if (numeric > 1e12) return Math.round(numeric);
  if (numeric > 1e9) return Math.round(numeric * 1000);
  return Math.round(numeric);
}

function buildTxnId(prefix = "signal") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSignalServiceError(message, sourceError = null, extras = {}) {
  const error = new Error(String(message || "Signal request failed."));
  if (sourceError?.response) error.response = sourceError.response;
  if (sourceError?.code) error.code = sourceError.code;
  if (sourceError?.cause) error.cause = sourceError.cause;
  Object.assign(error, extras || {});
  return error;
}

function matrixErrorStatus(error) {
  return Number(error?.response?.status || 0) || 0;
}

function getMatrixErrCode(error) {
  return String(error?.response?.data?.errcode || "").trim();
}

function getMatrixRetryAfterMs(error) {
  const directValue = Number(error?.retryAfterMs || 0);
  if (directValue > 0) return directValue;

  const responseValue = Number(error?.response?.data?.retry_after_ms || 0);
  if (responseValue > 0) return responseValue;

  const headerValue = Number(error?.response?.headers?.["retry-after"] || 0);
  if (headerValue > 0) {
    return headerValue < 1000 ? headerValue * 1000 : headerValue;
  }

  return 0;
}

function isMatrixRateLimitedError(error) {
  return (
    matrixErrorStatus(error) === 429 ||
    getMatrixErrCode(error) === "M_LIMIT_EXCEEDED" ||
    /too many requests/i.test(String(error?.message || ""))
  );
}

function isMatrixAuthFailure(error) {
  const status = matrixErrorStatus(error);
  const errcode = getMatrixErrCode(error);
  return (
    status === 401 ||
    status === 403 ||
    errcode === "M_FORBIDDEN" ||
    errcode === "M_UNKNOWN_TOKEN"
  );
}

function isMatrixNotInRoomError(error) {
  return (
    matrixErrorStatus(error) === 403 &&
    /not in room/i.test(
      String(error?.response?.data?.error || error?.message || "")
    )
  );
}

function formatSignalRateLimitMessage(error) {
  const retryAfterMs = getMatrixRetryAfterMs(error);
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return retryAfterMs
    ? `Signal is waiting for Synapse login rate limits to cool down. Try again in about ${retryAfterSeconds} seconds.`
    : "Signal is waiting for Synapse login rate limits to cool down. Please wait about a minute and try again.";
}

function getSignalLoginBackoff(userId = "") {
  const key = String(userId || "").trim();
  if (!key) return null;
  const entry = SIGNAL_LOGIN_BACKOFF.get(key);
  if (!entry) return null;
  if (entry.until <= nowTs()) {
    SIGNAL_LOGIN_BACKOFF.delete(key);
    return null;
  }
  return {
    ...entry,
    retryAfterMs: Math.max(1, entry.until - nowTs()),
  };
}

function setSignalLoginBackoff(userId = "", error = null) {
  const key = String(userId || "").trim();
  if (!key) return null;
  const retryAfterMs = Math.max(
    5_000,
    Math.min(5 * 60_000, getMatrixRetryAfterMs(error) || 60_000)
  );
  const entry = {
    until: nowTs() + retryAfterMs,
    message: formatSignalRateLimitMessage(error),
  };
  SIGNAL_LOGIN_BACKOFF.set(key, entry);
  return {
    ...entry,
    retryAfterMs,
  };
}

function clearSignalLoginBackoff(userId = "") {
  const key = String(userId || "").trim();
  if (!key) return;
  SIGNAL_LOGIN_BACKOFF.delete(key);
}

function getCachedQrImage(mxc = "") {
  const key = String(mxc || "").trim();
  if (!key) return null;
  const cached = SIGNAL_QR_CACHE.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= nowTs()) {
    SIGNAL_QR_CACHE.delete(key);
    return null;
  }
  return cached.dataUrl || null;
}

function cacheQrImage(mxc = "", dataUrl = "") {
  const key = String(mxc || "").trim();
  const value = String(dataUrl || "").trim();
  if (!key || !value) return value || null;
  SIGNAL_QR_CACHE.set(key, {
    expiresAt: nowTs() + SIGNAL_QR_CACHE_TTL_MS,
    dataUrl: value,
  });
  return value;
}

function isSignalGhostMxid(mxid = "") {
  return SIGNAL_GHOST_RE.test(String(mxid || "").trim());
}

function isBridgeInfoEvent(event = {}) {
  return event?.type === "m.bridge" || event?.type === "uk.half-shot.bridge";
}

function buildSignalMediaUrl(mxc = "") {
  const normalized = String(mxc || "").trim();
  if (!normalized) return null;
  return `/api/signal/media?mxc=${encodeURIComponent(normalized)}`;
}

function normalizePhoneNumber(value = "") {
  return String(value || "")
    .replace(/[^\d+]/g, "")
    .trim();
}

function isPhoneLikeLabel(value = "") {
  const normalized = normalizePhoneNumber(value);
  return Boolean(normalized && /^\+?\d{6,}$/.test(normalized));
}

function normalizeSearchValue(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function getSignalBridgeDb() {
  if (!SqliteDatabase) return null;

  const nextPath = String(defaultSignalBridgeDbPath() || "").trim();
  if (!nextPath || !fs.existsSync(nextPath)) return null;

  if (!signalBridgeDb || signalBridgeDbPath !== nextPath) {
    if (signalBridgeDb?.close) {
      try {
        signalBridgeDb.close();
      } catch {}
    }
    signalBridgeDb = new SqliteDatabase(nextPath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      signalBridgeDb.pragma("busy_timeout = 2000");
    } catch {}
    signalBridgeDbPath = nextPath;
  }

  return signalBridgeDb;
}

function isSignalContactRoomId(roomId = "") {
  return String(roomId || "").startsWith(SIGNAL_CONTACT_ROOM_PREFIX);
}

function buildSignalContactRoomId(identifier = "") {
  const normalized = String(identifier || "").trim();
  if (!normalized) return "";
  return `${SIGNAL_CONTACT_ROOM_PREFIX}${encodeURIComponent(normalized)}`;
}

function parseSignalContactRoomId(roomId = "") {
  const normalized = String(roomId || "").trim();
  if (!isSignalContactRoomId(normalized)) return null;
  const encoded = normalized.slice(SIGNAL_CONTACT_ROOM_PREFIX.length);
  const identifier = decodeURIComponent(encoded || "").trim();
  if (!identifier) return null;
  return {
    identifier,
    roomId: normalized,
  };
}

function buildSignalProfileFromBridgeLogin(login = null) {
  if (!login) return null;
  const remoteProfile = login.remoteProfile || {};
  const displayName = String(
    remoteProfile.name || login.remoteName || remoteProfile.phone || ""
  ).trim();
  const avatarUrl = buildSignalMediaUrl(remoteProfile.avatar || "");
  if (!displayName && !avatarUrl) return null;
  return {
    displayName: displayName || "Signal",
    avatarUrl,
    phone: String(remoteProfile.phone || "").trim(),
  };
}

function buildBridgeContactName(contact = {}) {
  const source = contact || {};
  return String(
    source.contactName ||
      source.profileName ||
      source.ghostName ||
      source.e164Number ||
      "Signal contact"
  ).trim();
}

function buildSignalContactRoom(contact = {}) {
  const source = contact || {};
  const identifier = String(
    source.identifier ||
      source.e164Number ||
      source.aciUuid ||
      source.pniUuid ||
      ""
  ).trim();
  const roomId = buildSignalContactRoomId(identifier);
  const name = buildBridgeContactName(source);
  return {
    roomId,
    id: roomId,
    name,
    avatarMxc: source.avatarMxc || null,
    avatarUrl: buildSignalMediaUrl(source.avatarMxc || ""),
    isDirect: true,
    isGroup: false,
    memberCount: 2,
    unreadCount: 0,
    highlightCount: 0,
    lastEventId: null,
    lastMessage: "",
    lastSender: "",
    lastMessageAt: null,
    lastMessageTs: 0,
    prevBatch: null,
    bridgeStatus: "contact",
    isPlaceholder: true,
    signalIdentifier: identifier,
    phoneNumber: source.e164Number || "",
  };
}

function applySignalContactFallbackToRoom(room = null, contact = {}) {
  if (!room) return room;
  const fallback = buildSignalContactRoom(contact || {});
  const nextName = String(room.name || "").trim();
  const shouldHydrateName =
    !nextName || nextName === String(room.roomId || "").trim();

  return {
    ...room,
    name: shouldHydrateName ? fallback.name : room.name,
    avatarMxc: room.avatarMxc || fallback.avatarMxc || null,
    avatarUrl: room.avatarUrl || fallback.avatarUrl || null,
    isDirect: true,
    isGroup: false,
    memberCount: Number(room.memberCount || 0) || 2,
    bridgeStatus: "portal",
  };
}

function hydrateSignalMessagesForRoom(room = null, messages = []) {
  if (!Array.isArray(messages) || !messages.length) return [];

  const isDirect = Boolean(room?.isDirect);
  const roomName = String(room?.name || "").trim();
  const roomAvatarUrl = String(room?.avatarUrl || "").trim();

  return messages.map((message) => {
    if (!message || typeof message !== "object") return message;

    if (message.fromMe) {
      return {
        ...message,
        senderName: "You",
      };
    }

    if (!isDirect || !isSignalGhostMxid(message.sender)) {
      return message;
    }

    const senderName = String(message.senderName || "").trim();
    const shouldHydrateName =
      !senderName ||
      isPhoneLikeLabel(senderName) ||
      senderName === localpartFromMxid(message.sender);

    return {
      ...message,
      senderName: shouldHydrateName
        ? roomName || senderName || "Signal"
        : senderName,
      senderAvatarUrl: message.senderAvatarUrl || roomAvatarUrl || "",
    };
  });
}

function buildSignalPlaceholderTimeline(room = null) {
  return {
    room,
    messages: [],
    prevBatch: null,
  };
}

function isSignalBridgeLoginActive(login = null) {
  if (!login) return false;
  const profile = login.remoteProfile || {};
  return Boolean(
    String(login.loginId || "").trim() &&
      (String(profile.phone || "").trim() ||
        String(profile.name || "").trim() ||
        String(login.remoteName || "").trim() ||
        Number(login.metadata?.last_contact_sync || 0))
  );
}

function signalProvisioningLoginState(login = null) {
  return String(
    login?.state_event || login?.state?.state_event || ""
  ).toUpperCase();
}

function hasDeadSignalProvisioningLogin(accountState = null) {
  const logins = Array.isArray(accountState?.logins) ? accountState.logins : [];
  return logins.some((login) =>
    ["BAD_CREDENTIALS", "LOGGED_OUT"].includes(
      signalProvisioningLoginState(login)
    )
  );
}

function extractMatrixRoomIdFromText(text = "") {
  const match = String(text || "").match(MATRIX_TO_ROOM_LINK_RE);
  return String(match?.[1] || "").trim();
}

function stripReplyFallback(body = "", hasReplyRelation = false) {
  const text = String(body || "");
  if (!hasReplyRelation) return text.trim();
  const split = text.split(/\n\n/);
  return (split.length > 1 ? split.slice(1).join("\n\n") : text).trim();
}

function formatTimestamp(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function summarizeEventContent(content = {}) {
  const msgtype = String(content.msgtype || "");
  if (msgtype === "m.image") return "Sent an image";
  if (msgtype === "m.video") return "Sent a video";
  if (msgtype === "m.audio") return "Sent an audio message";
  if (msgtype === "m.file") return "Sent a file";
  if (msgtype === "m.location") return "Shared a location";
  return String(content.body || "").trim();
}

function buildMediaDescriptor(content = {}) {
  const msgtype = String(content.msgtype || "");
  const url = content.url || null;
  if (!url && msgtype !== "m.location" && !content.geo_uri) return null;

  let type = "file";
  if (msgtype === "m.image" || content.info?.thumbnail_url) type = "image";
  else if (msgtype === "m.video") type = "video";
  else if (msgtype === "m.audio") type = "audio";
  else if (msgtype === "m.location") type = "location";

  return {
    type,
    mxc: url,
    url: buildSignalMediaUrl(url),
    thumbnailMxc: content.info?.thumbnail_url || null,
    thumbnailUrl: buildSignalMediaUrl(content.info?.thumbnail_url || ""),
    fileName: content.filename || content.body || "Attachment",
    body: content.body || "",
    mimeType: content.info?.mimetype || "",
    size: Number(content.info?.size || 0) || 0,
    width: Number(content.info?.w || 0) || 0,
    height: Number(content.info?.h || 0) || 0,
    duration: Number(content.info?.duration || 0) || 0,
    geoUri: content.geo_uri || null,
  };
}

function resolveMessageText(content = {}) {
  const replyToEventId =
    content["m.relates_to"]?.["m.in_reply_to"]?.event_id || null;
  const body = stripReplyFallback(content.body || "", Boolean(replyToEventId));
  if (body) return body;
  return summarizeEventContent(content);
}

function collectMemberMap(roomData = {}) {
  const map = new Map();
  const events = [
    ...(roomData.state?.events || []),
    ...(roomData.timeline?.events || []),
  ];

  for (const event of events) {
    if (event?.type !== "m.room.member" || !event?.state_key) continue;
    map.set(String(event.state_key), {
      mxid: String(event.state_key),
      displayName:
        String(event.content?.displayname || "").trim() ||
        localpartFromMxid(event.state_key),
      avatarMxc: event.content?.avatar_url || null,
      membership: String(event.content?.membership || "").trim() || "join",
    });
  }

  return map;
}

function getRoomName(
  roomId,
  roomData,
  memberMap,
  currentUserId,
  bridgeBotMxid
) {
  const stateEvents = roomData.state?.events || [];
  // With lazy_load_members + incremental /sync, a recent m.room.name change can
  // land in the TIMELINE rather than the state block. Scan both and take the
  // latest, so portal renames (e.g. "Signal Note to Self") aren't missed —
  // otherwise we wrongly fall through to the other member's name.
  const timelineEvents = roomData.timeline?.events || [];
  const nameEvents = [...stateEvents, ...timelineEvents]
    .filter((event) => event?.type === "m.room.name" && event?.content?.name)
    .sort(
      (a, b) =>
        Number(a.origin_server_ts || 0) - Number(b.origin_server_ts || 0)
    );
  const explicitName = nameEvents.length
    ? nameEvents[nameEvents.length - 1].content.name
    : "";
  if (String(explicitName).trim()) return String(explicitName).trim();

  const canonicalAlias =
    stateEvents.find((event) => event.type === "m.room.canonical_alias")
      ?.content?.alias || "";
  if (String(canonicalAlias).trim()) {
    return String(canonicalAlias).replace(/^#/, "").split(":")[0];
  }

  const otherMembers = [...memberMap.values()].filter(
    (member) =>
      member.mxid !== currentUserId &&
      member.mxid !== bridgeBotMxid &&
      member.membership !== "leave"
  );

  if (otherMembers.length === 1) {
    return (
      otherMembers[0].displayName || localpartFromMxid(otherMembers[0].mxid)
    );
  }

  if (otherMembers.length > 1) {
    const names = otherMembers
      .slice(0, 3)
      .map((member) => member.displayName || localpartFromMxid(member.mxid))
      .filter(Boolean);
    return names.join(", ");
  }

  return roomId;
}

function getRoomAvatar(roomData, memberMap, currentUserId, bridgeBotMxid) {
  const explicitAvatar =
    (roomData.state?.events || []).find(
      (event) => event.type === "m.room.avatar"
    )?.content?.url || null;
  if (explicitAvatar) return explicitAvatar;

  const directMember = [...memberMap.values()].find(
    (member) =>
      member.mxid !== currentUserId &&
      member.mxid !== bridgeBotMxid &&
      member.avatarMxc
  );

  return directMember?.avatarMxc || null;
}

function getRoomMemberCount(roomData = {}, memberMap = new Map()) {
  const joinedCount =
    Number(roomData.summary?.["m.joined_member_count"] || 0) ||
    [...memberMap.values()].filter((member) => member.membership === "join")
      .length;
  const invitedCount =
    Number(roomData.summary?.["m.invited_member_count"] || 0) || 0;
  return joinedCount + invitedCount;
}

function parseRoomEvents({
  roomId,
  roomData = {},
  currentUserId = "",
  fallbackRoomName = "",
  bridgeBotMxid = "",
}) {
  const memberMap = collectMemberMap(roomData);
  const events = [
    ...(roomData.state?.events || []),
    ...(roomData.timeline?.events || []),
  ]
    .filter((event) => event && (event.event_id || event.state_key))
    .sort(
      (a, b) =>
        Number(a.origin_server_ts || 0) - Number(b.origin_server_ts || 0)
    );

  const messages = [];
  const messageMap = new Map();
  const pendingEdits = new Map();
  const pendingRedactions = new Map();
  const pendingReactions = new Map();

  const resolveSenderProfile = (sender = "") => {
    const normalizedSender = String(sender || "");
    const senderMeta = memberMap.get(normalizedSender) || null;

    if (normalizedSender === currentUserId) {
      return {
        senderName: "You",
        senderAvatarUrl: "",
      };
    }

    return {
      senderName:
        String(senderMeta?.displayName || "").trim() ||
        (normalizedSender === bridgeBotMxid
          ? "Signal Bridge"
          : localpartFromMxid(normalizedSender)) ||
        fallbackRoomName ||
        "Signal",
      senderAvatarUrl: buildSignalMediaUrl(senderMeta?.avatarMxc || ""),
    };
  };

  const applyReaction = (targetEventId, reactionEvent) => {
    if (!targetEventId || !reactionEvent) return;
    const target = messageMap.get(String(targetEventId));
    if (!target) {
      const queue = pendingReactions.get(String(targetEventId)) || [];
      queue.push(reactionEvent);
      pendingReactions.set(String(targetEventId), queue);
      return;
    }

    const key = String(reactionEvent.key || "").trim();
    if (!key) return;
    const sender = String(reactionEvent.sender || "");
    let existing = (target.reactions || []).find((entry) => entry.key === key);
    if (!existing) {
      existing = {
        key,
        count: 0,
        byMe: false,
        senders: [],
        eventIds: [],
      };
      target.reactions.push(existing);
    }
    existing.count += 1;
    if (!existing.senders.includes(sender)) existing.senders.push(sender);
    if (!existing.eventIds.includes(reactionEvent.eventId)) {
      existing.eventIds.push(reactionEvent.eventId);
    }
    if (sender === currentUserId) existing.byMe = true;
  };

  const applyEdit = (targetEventId, nextContent) => {
    if (!targetEventId) return;
    const target = messageMap.get(String(targetEventId));
    if (!target) {
      pendingEdits.set(String(targetEventId), nextContent || {});
      return;
    }
    const content =
      typeof nextContent === "string"
        ? {
            body: String(nextContent || "").trim(),
            msgtype: target.messageType || "m.text",
          }
        : nextContent || {};
    const text = resolveMessageText(content);
    const media = buildMediaDescriptor(content);
    target.text = text;
    target.previewText = text || summarizeEventContent(content);
    target.media = media;
    target.messageType = String(
      content.msgtype || target.messageType || (media ? "m.file" : "m.text")
    );
    target.edited = true;
    target.canEdit =
      target.sender === currentUserId &&
      !media &&
      String(target.messageType || "m.text") === "m.text";
  };

  const applyRedaction = (targetEventId, redactionEventId) => {
    if (!targetEventId) return;
    const target = messageMap.get(String(targetEventId));
    if (!target) {
      pendingRedactions.set(
        String(targetEventId),
        String(redactionEventId || "")
      );
      return;
    }
    target.deleted = true;
    target.text = "Message deleted";
    target.previewText = "Message deleted";
    target.media = null;
    target.redactionEventId = String(redactionEventId || "");
    target.reactions = [];
  };

  for (const event of events) {
    if (event?.type === "m.room.member" && event?.state_key) {
      memberMap.set(String(event.state_key), {
        mxid: String(event.state_key),
        displayName:
          String(event.content?.displayname || "").trim() ||
          localpartFromMxid(event.state_key),
        avatarMxc: event.content?.avatar_url || null,
        membership: String(event.content?.membership || "").trim() || "join",
      });
      continue;
    }

    if (event?.type === "m.room.redaction") {
      applyRedaction(event.redacts, event.event_id);
      continue;
    }

    if (event?.type === "m.reaction") {
      applyReaction(event.content?.["m.relates_to"]?.event_id, {
        eventId: String(event.event_id || ""),
        sender: String(event.sender || ""),
        key: event.content?.["m.relates_to"]?.key || "",
      });
      continue;
    }

    const isMessageEvent =
      event?.type === "m.room.message" || event?.type === "m.sticker";
    if (!isMessageEvent) continue;

    const relation = event.content?.["m.relates_to"] || {};
    if (relation.rel_type === "m.replace" && relation.event_id) {
      applyEdit(relation.event_id, event.content?.["m.new_content"] || {});
      continue;
    }

    const sender = String(event.sender || "");
    const content =
      event.type === "m.sticker"
        ? {
            ...event.content,
            msgtype: "m.image",
            body: event.content?.body || "Sticker",
          }
        : event.content || {};
    const text = resolveMessageText(content);
    const media = buildMediaDescriptor(content);
    const senderProfile = resolveSenderProfile(sender);
    const message = {
      id: String(event.event_id),
      eventId: String(event.event_id),
      roomId: String(roomId),
      sender,
      senderName: senderProfile.senderName,
      senderAvatarUrl: senderProfile.senderAvatarUrl,
      timestamp: Number(event.origin_server_ts || 0),
      isoTimestamp: event.origin_server_ts
        ? new Date(event.origin_server_ts).toISOString()
        : null,
      timeLabel: formatTimestamp(event.origin_server_ts),
      fromMe: sender === currentUserId,
      text,
      previewText: text || summarizeEventContent(content),
      replyToEventId: relation["m.in_reply_to"]?.event_id || null,
      reactions: [],
      edited: false,
      deleted: false,
      redactionEventId: null,
      media,
      messageType: String(content.msgtype || (media ? "m.file" : "m.text")),
      canEdit:
        sender === currentUserId &&
        !media &&
        String(content.msgtype || "m.text") === "m.text",
      canDelete: sender === currentUserId,
    };

    messages.push(message);
    messageMap.set(message.id, message);

    if (pendingEdits.has(message.id)) {
      applyEdit(message.id, pendingEdits.get(message.id));
      pendingEdits.delete(message.id);
    }
    if (pendingRedactions.has(message.id)) {
      applyRedaction(message.id, pendingRedactions.get(message.id));
      pendingRedactions.delete(message.id);
    }
    if (pendingReactions.has(message.id)) {
      const queued = pendingReactions.get(message.id) || [];
      queued.forEach((reactionEvent) =>
        applyReaction(message.id, reactionEvent)
      );
      pendingReactions.delete(message.id);
    }
  }

  for (const message of messages) {
    const senderProfile = resolveSenderProfile(message.sender);
    if (senderProfile.senderName) message.senderName = senderProfile.senderName;
    if (senderProfile.senderAvatarUrl) {
      message.senderAvatarUrl = senderProfile.senderAvatarUrl;
    }
  }

  for (const message of messages) {
    if (message.replyToEventId) {
      const target = messageMap.get(String(message.replyToEventId));
      if (target) {
        message.replyPreview = {
          eventId: target.id,
          senderName: target.senderName,
          text: target.deleted
            ? "Message deleted"
            : target.text || target.media?.body || "Attachment",
        };
      }
    }
  }

  return messages;
}

function buildRoomDescriptor({
  roomId,
  roomData = {},
  currentUserId = "",
  bridgeBotMxid = "",
  managementRoomId = "",
  directMap = new Map(),
  knownPortalRoomIds = new Set(),
}) {
  const memberMap = collectMemberMap(roomData);
  const stateEvents = roomData.state?.events || [];
  const memberIds = [...memberMap.keys()];
  const containsGhostMember = memberIds.some((mxid) => isSignalGhostMxid(mxid));
  const containsBridgeInfo = stateEvents.some(isBridgeInfoEvent);
  const isKnownPortal = knownPortalRoomIds.has(String(roomId));
  const isManagement =
    (managementRoomId && roomId === managementRoomId) ||
    (memberIds.includes(bridgeBotMxid) &&
      !containsGhostMember &&
      !containsBridgeInfo);
  const isSignalRoom =
    containsGhostMember || containsBridgeInfo || isManagement || isKnownPortal;

  const roomName = getRoomName(
    roomId,
    roomData,
    memberMap,
    currentUserId,
    bridgeBotMxid
  );
  const roomAvatar = getRoomAvatar(
    roomData,
    memberMap,
    currentUserId,
    bridgeBotMxid
  );
  const memberCount = getRoomMemberCount(roomData, memberMap);
  const isDirect =
    directMap.get(String(roomId)) === true ||
    (!isManagement &&
      memberCount <= 2 &&
      (containsGhostMember || isKnownPortal));
  const messages = parseRoomEvents({
    roomId,
    roomData,
    currentUserId,
    fallbackRoomName: roomName,
    bridgeBotMxid,
  });
  const lastMessage = [...messages]
    .reverse()
    .find((message) => !message.deleted || message.previewText);

  // Signal's self-chat portal is named "Signal Note to Self". Detect it so we
  // can (a) render a clean "Note to Self" label, (b) collapse duplicate
  // self-portals left behind by re-links, and (c) recover the user's own
  // profile (name + avatar) from its single ghost member.
  const isNoteToSelf = /note to self/i.test(String(roomName || ""));
  const selfOtherMember = isNoteToSelf
    ? [...memberMap.values()].find(
        (member) =>
          member.mxid !== currentUserId &&
          member.mxid !== bridgeBotMxid &&
          member.membership !== "leave"
      )
    : null;
  const displayName = isNoteToSelf ? "Note to Self" : roomName;

  return {
    isSignalRoom,
    isManagement,
    room: {
      roomId: String(roomId),
      id: String(roomId),
      name: displayName,
      isSelf: isNoteToSelf,
      selfProfileName: selfOtherMember?.displayName || "",
      avatarMxc: roomAvatar || null,
      avatarUrl: buildSignalMediaUrl(roomAvatar || ""),
      isDirect,
      isGroup: !isDirect && !isManagement,
      memberCount,
      unreadCount:
        Number(roomData.unread_notifications?.notification_count || 0) || 0,
      highlightCount:
        Number(roomData.unread_notifications?.highlight_count || 0) || 0,
      lastEventId: lastMessage?.eventId || null,
      lastMessage: lastMessage?.previewText || "",
      lastSender: lastMessage?.senderName || "",
      lastMessageFromMe: Boolean(lastMessage?.fromMe),
      lastMessageAt: lastMessage?.isoTimestamp || null,
      lastMessageTs: lastMessage?.timestamp || 0,
      prevBatch: roomData.timeline?.prev_batch || null,
      bridgeStatus: isManagement ? "management" : "portal",
    },
    messages,
    memberMap,
  };
}

function parseDirectMap(syncData = {}) {
  const directMap = new Map();
  const accountDataEvents = syncData.account_data?.events || [];
  const directEvent = accountDataEvents.find(
    (event) => event.type === "m.direct"
  );
  const content = directEvent?.content || {};
  for (const roomIds of Object.values(content)) {
    if (!Array.isArray(roomIds)) continue;
    roomIds.forEach((roomId) => directMap.set(String(roomId), true));
  }
  return directMap;
}

async function getSignalIntegration(userId) {
  return Integration.findOne({ userId, type: "signal" });
}

async function ensureSignalIntegration(userId) {
  const integration = await getSignalIntegration(userId);
  if (!integration) {
    throw new Error(
      "Signal is not connected yet. Go to Settings → Integrations → Signal."
    );
  }
  return integration;
}

function buildDefaultMatrixState(userId = "") {
  return {
    homeserverUrl: normalizeHomeserverUrl(defaultHomeserverUrl()),
    mxid: normalizeMxid(buildHiddenSignalMxid(userId)),
    accessToken: "",
    deviceId: "",
    managementRoomId: "",
    bridgeBotMxid: normalizeMxid(defaultBridgeBotMxid()),
    loginState: "disconnected",
    lastError: "",
    connectedAt: null,
  };
}

function normalizeSignalLoginState(value = "", fallback = "disconnected") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (SIGNAL_LOGIN_STATE_VALUES.has(normalized)) return normalized;
  return fallback;
}

function buildConfigFromIntegration(integration = {}) {
  const signal = integration.signal?.toObject
    ? integration.signal.toObject()
    : integration.signal || {};
  const matrix = integration.matrix?.toObject
    ? integration.matrix.toObject()
    : integration.matrix || {};
  const defaults = buildDefaultMatrixState(integration.userId || "");

  return {
    userId: integration.userId,
    homeserverUrl: normalizeHomeserverUrl(
      matrix.homeserverUrl || signal.homeserverUrl || defaults.homeserverUrl
    ),
    mxid: normalizeMxid(matrix.mxid || signal.mxid || defaults.mxid),
    password: buildHiddenSignalPassword(integration.userId || ""),
    accessToken: String(matrix.accessToken || signal.accessToken || "").trim(),
    deviceId: String(matrix.deviceId || signal.deviceId || "").trim(),
    deviceDisplayName: defaultMatrixDeviceName(),
    bridgeBotMxid: normalizeMxid(
      matrix.bridgeBotMxid || signal.bridgeBotMxid || defaults.bridgeBotMxid
    ),
    managementRoomId: String(
      matrix.managementRoomId || signal.managementRoomId || ""
    ).trim(),
    loginState: normalizeSignalLoginState(
      matrix.loginState,
      matrix.connectedAt || signal.connectedAt
        ? "connected"
        : defaults.loginState
    ),
    lastError: String(matrix.lastError || "").trim(),
    connectedAt: matrix.connectedAt || signal.connectedAt || null,
    transport: integration.transport || "mautrix",
  };
}

function buildSignalClientIntegration(integration = {}) {
  const config = buildConfigFromIntegration(integration);
  return {
    _id: integration?._id || undefined,
    id: integration?.id || integration?._id || undefined,
    userId: integration?.userId,
    type: "signal",
    name: integration?.name || "Signal",
    enabled: integration?.enabled !== false,
    transport: "mautrix",
    connected: config.loginState === "connected",
    matrix: {
      loginState: config.loginState,
      lastError: config.lastError,
      connectedAt: config.connectedAt || null,
    },
    lastTestedAt: integration?.lastTestedAt || null,
    lastTestOk: integration?.lastTestOk,
    createdAt: integration?.createdAt || null,
    updatedAt: integration?.updatedAt || null,
  };
}

function getSignalBridgeLogin(config = {}) {
  const db = getSignalBridgeDb();
  const mxid = normalizeMxid(config?.mxid || "");
  if (!db || !mxid) return null;

  try {
    const row = db
      .prepare(
        `
          SELECT user_mxid, id, remote_name, remote_profile, metadata
          FROM user_login
          WHERE user_mxid = ?
          ORDER BY rowid DESC
          LIMIT 1
        `
      )
      .get(mxid);
    if (!row) return null;

    return {
      userMxid: String(row.user_mxid || "").trim(),
      loginId: String(row.id || "").trim(),
      remoteName: String(row.remote_name || "").trim(),
      remoteProfile: safeJsonParse(row.remote_profile, {}) || {},
      metadata: safeJsonParse(row.metadata, {}) || {},
    };
  } catch {
    return null;
  }
}

/**
 * NUCLEAR OPTION: directly delete the bridge's user_login + user_portal rows
 * for the given mxid. The bridge's `logout` command via Matrix message has
 * been observed to NOT delete the row, leaving stale sessions that prevent
 * fresh QR generation. Opens a read-write SQLite connection, removes the
 * rows, and closes it. SQLite WAL mode handles concurrent access safely.
 */
function purgeSignalBridgeLogin(mxid = "") {
  if (!SqliteDatabase) {
    return { ok: false, reason: "no_sqlite_driver" };
  }
  const normalizedMxid = normalizeMxid(mxid);
  if (!normalizedMxid) {
    return { ok: false, reason: "no_mxid" };
  }

  const dbPath = String(defaultSignalBridgeDbPath() || "").trim();
  if (!dbPath || !fs.existsSync(dbPath)) {
    console.warn("[Signal purge] Bridge DB file not found at %s", dbPath);
    return { ok: false, reason: "db_not_found" };
  }

  // Close cached readonly connection first to avoid lock conflicts
  if (signalBridgeDb) {
    try {
      signalBridgeDb.close();
    } catch {}
    signalBridgeDb = null;
    signalBridgeDbPath = "";
  }

  let writeDb = null;
  try {
    writeDb = new SqliteDatabase(dbPath, {
      readonly: false,
      fileMustExist: true,
      timeout: 5_000,
    });
    try {
      writeDb.pragma("busy_timeout = 5000");
    } catch {}
    try {
      writeDb.pragma("journal_mode = WAL");
    } catch {}
    try {
      writeDb.pragma("foreign_keys = ON");
    } catch {}

    const txn = writeDb.transaction((targetMxid) => {
      let portalRowsDeleted = 0;
      let loginRowsDeleted = 0;
      try {
        const r1 = writeDb
          .prepare("DELETE FROM user_portal WHERE user_mxid = ?")
          .run(targetMxid);
        portalRowsDeleted = r1.changes || 0;
      } catch (e) {
        console.warn("[Signal purge] user_portal delete error:", e.message);
      }
      try {
        const r2 = writeDb
          .prepare("DELETE FROM user_login WHERE user_mxid = ?")
          .run(targetMxid);
        loginRowsDeleted = r2.changes || 0;
      } catch (e) {
        console.warn("[Signal purge] user_login delete error:", e.message);
      }
      return { portalRowsDeleted, loginRowsDeleted };
    });

    const result = txn(normalizedMxid);
    console.log(
      "[Signal purge] mxid=%s deleted login=%d portal=%d",
      normalizedMxid,
      result.loginRowsDeleted,
      result.portalRowsDeleted
    );
    return { ok: true, ...result };
  } catch (err) {
    console.error("[Signal purge] failed:", err.message);
    return { ok: false, reason: err.message };
  } finally {
    if (writeDb) {
      try {
        writeDb.close();
      } catch {}
    }
  }
}

function listSignalBridgeContacts(bridgeLogin = null) {
  const db = getSignalBridgeDb();
  const loginId = String(bridgeLogin?.loginId || "").trim();
  if (!db || !loginId) return [];

  const selfPhone = normalizePhoneNumber(
    bridgeLogin?.remoteProfile?.phone || ""
  );

  try {
    const rows = db
      .prepare(
        `
          SELECT
            recipients.aci_uuid AS aci_uuid,
            recipients.pni_uuid AS pni_uuid,
            recipients.e164_number AS e164_number,
            recipients.contact_name AS contact_name,
            recipients.profile_name AS profile_name,
            ghost.name AS ghost_name,
            ghost.avatar_mxc AS ghost_avatar_mxc
          FROM signalmeow_recipients AS recipients
          LEFT JOIN ghost
            ON ghost.id = recipients.aci_uuid
            OR ghost.id = recipients.pni_uuid
            OR ghost.id = recipients.e164_number
          WHERE recipients.account_id = ?
          ORDER BY
            lower(
              COALESCE(
                NULLIF(recipients.contact_name, ''),
                NULLIF(recipients.profile_name, ''),
                NULLIF(ghost.name, ''),
                recipients.e164_number
              )
            ) ASC
        `
      )
      .all(loginId);

    return rows
      .map((row) => {
        const e164Number = String(row.e164_number || "").trim();
        return {
          aciUuid: String(row.aci_uuid || "").trim(),
          pniUuid: String(row.pni_uuid || "").trim(),
          e164Number,
          contactName: String(row.contact_name || "").trim(),
          profileName: String(row.profile_name || "").trim(),
          ghostName: String(row.ghost_name || "").trim(),
          avatarMxc: String(row.ghost_avatar_mxc || "").trim(),
          identifier: e164Number,
        };
      })
      .filter((contact) => contact.identifier)
      .filter(
        (contact) =>
          normalizePhoneNumber(contact.e164Number) !== selfPhone &&
          contact.aciUuid !== loginId
      );
  } catch {
    return [];
  }
}

function findSignalContactByIdentifier(bridgeLogin = null, identifier = "") {
  const normalizedIdentifier = String(identifier || "").trim();
  if (!normalizedIdentifier) return null;
  return (
    listSignalBridgeContacts(bridgeLogin).find(
      (contact) =>
        String(contact.identifier || "").trim() === normalizedIdentifier
    ) || null
  );
}

function normalizePortalLookupValue(value = "") {
  return String(value || "")
    .trim()
    .replace(/^PNI:/i, "");
}

function buildSignalPortalRoom(portal = {}) {
  const source = portal || {};
  const roomId = String(source.roomId || "").trim();
  const name = String(
    source.contactName ||
      source.profileName ||
      source.ghostName ||
      source.name ||
      source.e164Number ||
      source.otherUserId ||
      roomId
  ).trim();

  return {
    roomId,
    id: roomId,
    name,
    avatarMxc: source.avatarMxc || null,
    avatarUrl: buildSignalMediaUrl(source.avatarMxc || ""),
    isDirect: true,
    isGroup: false,
    memberCount: 2,
    unreadCount: Number(source.unreadCount || 0) || 0,
    highlightCount: Number(source.highlightCount || 0) || 0,
    lastEventId: source.lastEventId || null,
    lastMessage: source.lastMessage || "",
    lastSender: source.lastSender || "",
    lastMessageFromMe: Boolean(source.lastMessageFromMe),
    lastMessageAt: source.lastMessageAt || null,
    lastMessageTs: Number(source.lastMessageTs || 0) || 0,
    prevBatch: null,
    bridgeStatus: "portal",
    isPlaceholder: false,
    signalIdentifier: source.e164Number || source.otherUserId || "",
    phoneNumber: source.e164Number || "",
    portalId: source.portalId || "",
  };
}

function applySignalPortalFallbackToRoom(room = null, portal = {}) {
  if (!room) return room;
  const fallback = buildSignalPortalRoom(portal || {});
  const nextName = String(room.name || "").trim();
  const shouldHydrateName =
    !nextName ||
    nextName === String(room.roomId || "").trim() ||
    nextName === String(fallback.phoneNumber || "").trim() ||
    nextName === String((portal || {}).otherUserId || "").trim() ||
    nextName.includes(",");

  return {
    ...room,
    name: shouldHydrateName ? fallback.name : room.name,
    avatarMxc: fallback.avatarMxc || room.avatarMxc || null,
    avatarUrl: fallback.avatarUrl || room.avatarUrl || null,
    isDirect: true,
    isGroup: false,
    memberCount: 2,
    bridgeStatus: "portal",
    signalIdentifier: room.signalIdentifier || fallback.signalIdentifier || "",
    phoneNumber: room.phoneNumber || fallback.phoneNumber || "",
  };
}

function signalPortalReadHintKey(userId = "", roomId = "") {
  return `${String(userId || "").trim()}:${String(roomId || "").trim()}`;
}

function getSignalPortalReadMarker(
  userId = "",
  roomId = "",
  fallbackValue = 0
) {
  const key = signalPortalReadHintKey(userId, roomId);
  if (SIGNAL_PORTAL_READ_HINTS.has(key)) {
    return normalizeTimestampMs(SIGNAL_PORTAL_READ_HINTS.get(key) || 0);
  }
  return normalizeTimestampMs(fallbackValue);
}

function setSignalPortalReadMarker(userId = "", roomId = "", value = 0) {
  const key = signalPortalReadHintKey(userId, roomId);
  const normalized = normalizeTimestampMs(value);
  if (!key) return;
  SIGNAL_PORTAL_READ_HINTS.set(key, normalized);
}

function applySignalPortalReadState(userId, room = null, portal = {}) {
  if (!room) return room;
  const readHintKey = signalPortalReadHintKey(userId, room.roomId);
  const hasExplicitReadMarker = SIGNAL_PORTAL_READ_HINTS.has(readHintKey);
  const readMarker = getSignalPortalReadMarker(
    userId,
    room.roomId,
    portal?.lastRead || 0
  );
  const latestMessageTs = normalizeTimestampMs(room.lastMessageTs || 0);
  const hasUnreadFallback =
    Number(room.unreadCount || 0) <= 0 &&
    !room.lastMessageFromMe &&
    latestMessageTs > 0 &&
    (!hasExplicitReadMarker || latestMessageTs > readMarker);

  return {
    ...room,
    unreadCount: hasUnreadFallback ? 1 : Number(room.unreadCount || 0) || 0,
    highlightCount: hasUnreadFallback
      ? Math.max(1, Number(room.highlightCount || 0) || 0)
      : Number(room.highlightCount || 0) || 0,
  };
}

function getSignalBridgePortals(config = {}) {
  const db = getSignalBridgeDb();
  const mxid = normalizeMxid(config?.mxid || "");
  if (!db || !mxid) return [];

  try {
    const rows = db
      .prepare(
        `
          SELECT
            portal.mxid AS room_id,
            portal.id AS portal_id,
            portal.receiver AS portal_receiver,
            portal.other_user_id AS other_user_id,
            portal.name AS portal_name,
            portal.avatar_mxc AS portal_avatar_mxc,
            user_portal.last_read AS last_read,
            recipients.e164_number AS e164_number,
            recipients.contact_name AS contact_name,
            recipients.profile_name AS profile_name,
            ghost.name AS ghost_name,
            ghost.avatar_mxc AS ghost_avatar_mxc
          FROM user_portal
          JOIN portal
            ON portal.bridge_id = user_portal.bridge_id
           AND portal.id = user_portal.portal_id
           AND portal.receiver = user_portal.portal_receiver
          LEFT JOIN signalmeow_recipients AS recipients
            ON recipients.account_id = user_portal.login_id
           AND (
                recipients.aci_uuid = portal.other_user_id
             OR recipients.aci_uuid = portal.id
             OR recipients.pni_uuid = replace(portal.id, 'PNI:', '')
             OR recipients.pni_uuid = replace(portal.other_user_id, 'PNI:', '')
             OR recipients.e164_number = portal.name
           )
          LEFT JOIN ghost
            ON ghost.id = portal.other_user_id
            OR ghost.id = portal.id
            OR ghost.id = replace(portal.id, 'PNI:', '')
          WHERE user_portal.user_mxid = ?
          ORDER BY lower(
            COALESCE(
              NULLIF(recipients.contact_name, ''),
              NULLIF(recipients.profile_name, ''),
              NULLIF(ghost.name, ''),
              NULLIF(portal.name, ''),
              portal.mxid
            )
          ) ASC
        `
      )
      .all(mxid);

    return rows
      .map((row) => ({
        roomId: String(row.room_id || "").trim(),
        portalId: String(row.portal_id || "").trim(),
        receiver: String(row.portal_receiver || "").trim(),
        otherUserId: String(row.other_user_id || "").trim(),
        name: String(row.portal_name || "").trim(),
        avatarMxc: String(
          row.portal_avatar_mxc || row.ghost_avatar_mxc || ""
        ).trim(),
        contactName: String(row.contact_name || "").trim(),
        profileName: String(row.profile_name || "").trim(),
        ghostName: String(row.ghost_name || "").trim(),
        e164Number: String(row.e164_number || "").trim(),
        lastRead: Number(row.last_read || 0) || 0,
      }))
      .filter((portal) => portal.roomId);
  } catch {
    return [];
  }
}

function findSignalPortalByRoomId(config = {}, roomId = "") {
  const targetRoomId = String(roomId || "").trim();
  if (!targetRoomId) return null;
  return (
    getSignalBridgePortals(config).find(
      (portal) => String(portal.roomId || "").trim() === targetRoomId
    ) || null
  );
}

function listSignalFallbackRooms(
  bridgeLogin = null,
  { search = "", limit = 80 } = {}
) {
  const query = normalizeSearchValue(search);
  const rooms = listSignalBridgeContacts(bridgeLogin)
    .map((contact) => buildSignalContactRoom(contact))
    .filter((room) => {
      if (!query) return true;
      return normalizeSearchValue(
        [room.name, room.phoneNumber, room.signalIdentifier]
          .filter(Boolean)
          .join(" ")
      ).includes(query);
    });

  return rooms.slice(0, Math.max(1, Math.min(200, Number(limit || 80))));
}

async function saveSignalIntegration(userId, matrixData = {}, options = {}) {
  const current = await getSignalIntegration(userId);
  const currentConfig = current
    ? buildConfigFromIntegration(current)
    : {
        userId,
        ...buildDefaultMatrixState(userId),
        password: buildHiddenSignalPassword(userId),
        deviceDisplayName: defaultMatrixDeviceName(),
        transport: "mautrix",
      };

  const nextMatrix = {
    homeserverUrl: normalizeHomeserverUrl(
      matrixData.homeserverUrl ||
        currentConfig.homeserverUrl ||
        defaultHomeserverUrl()
    ),
    mxid: normalizeMxid(
      matrixData.mxid || currentConfig.mxid || buildHiddenSignalMxid(userId)
    ),
    accessToken: String(
      matrixData.accessToken !== undefined
        ? matrixData.accessToken
        : currentConfig.accessToken || ""
    ).trim(),
    deviceId: String(
      matrixData.deviceId !== undefined
        ? matrixData.deviceId
        : currentConfig.deviceId || ""
    ).trim(),
    managementRoomId: String(
      matrixData.managementRoomId !== undefined
        ? matrixData.managementRoomId
        : currentConfig.managementRoomId || ""
    ).trim(),
    bridgeBotMxid: normalizeMxid(
      matrixData.bridgeBotMxid ||
        currentConfig.bridgeBotMxid ||
        defaultBridgeBotMxid()
    ),
    loginState: normalizeSignalLoginState(
      matrixData.loginState,
      currentConfig.loginState || "disconnected"
    ),
    lastError: String(
      matrixData.lastError !== undefined
        ? matrixData.lastError
        : currentConfig.lastError || ""
    ).trim(),
    connectedAt:
      matrixData.connectedAt !== undefined
        ? matrixData.connectedAt
        : currentConfig.connectedAt || null,
  };

  return Integration.findOneAndUpdate(
    { userId, type: "signal" },
    {
      $set: {
        userId,
        type: "signal",
        name: "Signal",
        enabled: options.enabled !== false,
        transport: "mautrix",
        matrix: nextMatrix,
        updatedAt: new Date(),
      },
      $unset: {
        signal: 1,
      },
    },
    { upsert: true, new: true }
  );
}

function getMatrixAdminAccessToken() {
  const token = String(process.env.MATRIX_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) {
    throw new Error("Signal bridge admin access is not configured.");
  }
  return token;
}

async function synapseAdminRequest(method, path, options = {}) {
  return axios({
    method,
    url: `${normalizeHomeserverUrl(defaultHomeserverUrl())}${path}`,
    params: options.params,
    data: options.data,
    timeout: options.timeout || 20_000,
    validateStatus: options.validateStatus,
    headers: {
      Authorization: `Bearer ${getMatrixAdminAccessToken()}`,
      ...(options.headers || {}),
    },
  });
}

async function ensureHiddenSignalAccount(
  userId,
  { forceResetPassword = false } = {}
) {
  const mxid = normalizeMxid(buildHiddenSignalMxid(userId));
  const password = buildHiddenSignalPassword(userId);
  const userPath = `/_synapse/admin/v2/users/${encodeURIComponent(mxid)}`;

  let lookup = null;
  try {
    lookup = await synapseAdminRequest("GET", userPath, {
      validateStatus: (status) => status === 200 || status === 404,
    });
  } catch (err) {
    if (!isMatrixAuthFailure(err)) throw err;
    await registerMatrixAccountWithSharedSecret({
      homeserverUrl: defaultHomeserverUrl(),
      mxid,
      password,
      admin: false,
    }).catch((registerErr) => {
      const errcode = String(registerErr?.response?.data?.errcode || "").trim();
      if (errcode !== "M_USER_IN_USE") throw registerErr;
      return resetMatrixAccountWithSharedSecretAdmin({
        mxid,
        password,
        displayName: "OrionAI Signal",
      });
    });
    return {
      homeserverUrl: normalizeHomeserverUrl(defaultHomeserverUrl()),
      mxid,
      password,
      bridgeBotMxid: normalizeMxid(defaultBridgeBotMxid()),
    };
  }

  if (lookup.status === 404 || forceResetPassword) {
    await synapseAdminRequest("PUT", userPath, {
      data: {
        password,
        displayname: "OrionAI Signal",
        admin: false,
        deactivated: false,
      },
      timeout: 30_000,
    });
  }

  return {
    homeserverUrl: normalizeHomeserverUrl(defaultHomeserverUrl()),
    mxid,
    password,
    bridgeBotMxid: normalizeMxid(defaultBridgeBotMxid()),
  };
}

async function loginToMatrix({
  homeserverUrl,
  mxid,
  password,
  deviceDisplayName = defaultMatrixDeviceName(),
}) {
  const normalizedMxid = normalizeMxid(mxid);
  const localpart = localpartFromMxid(normalizedMxid);
  if (!normalizedMxid || !localpart || !password) {
    throw new Error("Signal bridge session could not be created.");
  }

  const base = normalizeHomeserverUrl(homeserverUrl);
  const payloads = [
    {
      type: "m.login.password",
      identifier: { type: "m.id.user", user: localpart },
      user: localpart,
      password,
      initial_device_display_name: deviceDisplayName,
    },
    {
      type: "m.login.password",
      identifier: { type: "m.id.user", user: normalizedMxid },
      user: normalizedMxid,
      password,
      initial_device_display_name: deviceDisplayName,
    },
  ];

  let lastError = null;
  for (const payload of payloads) {
    try {
      const { data } = await axios.post(
        `${base}/_matrix/client/v3/login`,
        payload,
        { timeout: 15_000 }
      );
      return data;
    } catch (err) {
      lastError = err;
      if (isMatrixRateLimitedError(err)) {
        throw createSignalServiceError(formatSignalRateLimitMessage(err), err, {
          retryAfterMs: getMatrixRetryAfterMs(err),
          signalRateLimited: true,
        });
      }
    }
  }

  throw createSignalServiceError(
    lastError?.response?.data?.error ||
      lastError?.message ||
      "Signal bridge login failed.",
    lastError
  );
}

async function loginHiddenMatrixAccount(userId) {
  const activeBackoff = getSignalLoginBackoff(userId);
  if (activeBackoff) {
    throw createSignalServiceError(activeBackoff.message, null, {
      retryAfterMs: activeBackoff.retryAfterMs,
      signalRateLimited: true,
    });
  }

  const hiddenAccount = await ensureHiddenSignalAccount(userId);

  try {
    const login = await loginToMatrix({
      homeserverUrl: hiddenAccount.homeserverUrl,
      mxid: hiddenAccount.mxid,
      password: hiddenAccount.password,
      deviceDisplayName: defaultMatrixDeviceName(),
    });
    clearSignalLoginBackoff(userId);
    return { hiddenAccount, login };
  } catch (err) {
    if (err?.signalRateLimited || isMatrixRateLimitedError(err)) {
      const backoff = setSignalLoginBackoff(userId, err);
      throw createSignalServiceError(backoff.message, err, {
        retryAfterMs: backoff.retryAfterMs,
        signalRateLimited: true,
      });
    }
    if (!isMatrixAuthFailure(err)) {
      throw err;
    }
    const resetAccount = await ensureHiddenSignalAccount(userId, {
      forceResetPassword: true,
    });
    const login = await loginToMatrix({
      homeserverUrl: resetAccount.homeserverUrl,
      mxid: resetAccount.mxid,
      password: resetAccount.password,
      deviceDisplayName: defaultMatrixDeviceName(),
    });
    clearSignalLoginBackoff(userId);
    return { hiddenAccount: resetAccount, login };
  }
}

async function loginExistingHiddenSignalAccount(userId) {
  const defaults = buildDefaultMatrixState(userId);
  const login = await loginToMatrix({
    homeserverUrl: defaults.homeserverUrl,
    mxid: defaults.mxid,
    password: buildHiddenSignalPassword(userId),
    deviceDisplayName: defaultMatrixDeviceName(),
  }).catch((err) => {
    const asToken = defaultSignalAppserviceToken();
    if (!asToken || !isMatrixAuthFailure(err)) throw err;
    return {
      user_id: defaults.mxid,
      access_token: asToken,
      device_id: "",
    };
  });

  return {
    hiddenAccount: {
      homeserverUrl: defaults.homeserverUrl,
      mxid: defaults.mxid,
      bridgeBotMxid: defaults.bridgeBotMxid,
    },
    login,
  };
}

// Transient network errors that we should retry. Without this, a single
// ECONNRESET (common in Docker overlay networks during container churn)
// kills the whole connect flow with an opaque error.
const MATRIX_RETRIABLE_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNABORTED",
  "EAI_AGAIN",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
]);

function isRetriableMatrixError(error) {
  if (!error) return false;
  const code = String(error.code || "").toUpperCase();
  if (MATRIX_RETRIABLE_CODES.has(code)) return true;
  const status = Number(error.response?.status || 0);
  return status === 502 || status === 503 || status === 504;
}

async function matrixRequest(config, method, path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (config.accessToken) {
    headers.Authorization = `Bearer ${config.accessToken}`;
  }
  const params = { ...(options.params || {}) };
  if (isSignalAppserviceToken(config.accessToken) && config.mxid) {
    params.user_id = normalizeMxid(config.mxid);
  }
  const maxAttempts = options.maxAttempts || 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await axios({
        method,
        url: `${config.homeserverUrl}${path}`,
        params,
        data: options.data,
        headers,
        responseType: options.responseType || "json",
        timeout: options.timeout || 20_000,
        validateStatus: options.validateStatus,
      });
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !isRetriableMatrixError(err)) {
        throw err;
      }
      const backoffMs = Math.min(500 * 2 ** (attempt - 1) + 500, 4000);
      console.warn(
        "[Signal matrix] %s %s failed (%s) attempt %d/%d, retrying in %dms",
        method,
        path,
        err.code || err.response?.status || err.message,
        attempt,
        maxAttempts,
        backoffMs
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastError;
}

async function ensureSignalAccess(userId, { forceLogin = false } = {}) {
  const integration = await ensureSignalIntegration(userId);
  let config = buildConfigFromIntegration(integration);
  if (!forceLogin && config.accessToken) {
    return { integration, config };
  }

  const { hiddenAccount, login } = await loginHiddenMatrixAccount(userId).catch(
    (err) => {
      if (!isMatrixAuthFailure(err)) throw err;
      return loginExistingHiddenSignalAccount(userId);
    }
  );
  const saved = await saveSignalIntegration(userId, {
    homeserverUrl: hiddenAccount.homeserverUrl,
    mxid: normalizeMxid(login.user_id || hiddenAccount.mxid),
    accessToken: String(login.access_token || "").trim(),
    deviceId: String(login.device_id || "").trim(),
    bridgeBotMxid: hiddenAccount.bridgeBotMxid || config.bridgeBotMxid,
    managementRoomId: config.managementRoomId || "",
    loginState: normalizeSignalLoginState(config.loginState, "logging_in"),
    lastError: "",
    connectedAt: config.connectedAt || null,
  });
  config = buildConfigFromIntegration(saved);
  invalidateSignalCache(userId);
  return { integration: saved, config };
}

async function matrixRequestWithRefresh(userId, method, path, options = {}) {
  const { integration, config } = await ensureSignalAccess(userId, {
    forceLogin: false,
  });

  try {
    return await matrixRequest(config, method, path, options);
  } catch (err) {
    if (err?.response?.status === 401 && config.password) {
      const refreshed = await ensureSignalAccess(userId, { forceLogin: true });
      return matrixRequest(refreshed.config, method, path, options);
    }
    throw err;
  }
}

async function ensureJoinedSignalRoom(userId, roomId = "") {
  const targetRoomId = String(roomId || "").trim();
  if (!targetRoomId) return null;
  const { config } = await ensureSignalAccess(userId, { forceLogin: false });
  const portal = findSignalPortalByRoomId(config, targetRoomId);
  const existingReadMarker = normalizeTimestampMs(portal?.lastRead || 0);
  const readHintKey = signalPortalReadHintKey(userId, targetRoomId);

  try {
    if (!SIGNAL_PORTAL_READ_HINTS.has(readHintKey)) {
      setSignalPortalReadMarker(userId, targetRoomId, existingReadMarker);
    }
    const response = await matrixRequestWithRefresh(
      userId,
      "POST",
      `/_matrix/client/v3/rooms/${encodeURIComponent(targetRoomId)}/join`,
      { data: {}, timeout: 20_000 }
    );
    invalidateSignalCache(userId);
    return response.data || { room_id: targetRoomId };
  } catch (err) {
    const message = String(
      err?.response?.data?.error || err?.message || ""
    ).trim();
    if (
      matrixErrorStatus(err) === 403 &&
      /already in room|is already joined/i.test(message)
    ) {
      return { room_id: targetRoomId };
    }
    throw err;
  }
}

/**
 * Pull pending Matrix invites from /sync and return the room IDs that look
 * like they came from the Signal bridge (inviter is the bridge bot or a
 * Signal ghost). This is the Matrix-native way to discover newly-created
 * portal rooms — works regardless of whether the bridge is on SQLite or
 * Postgres, because it goes through the Matrix protocol, not the bridge DB.
 *
 * WHY THIS EXISTS: the Signal bridge (bridgev2/megabridge, running on
 * Postgres) creates a portal room per chat and *invites* the user puppet
 * (@orion_u_<user>:orion.local). Until that invite is accepted (joined),
 * Matrix /sync returns the room under `rooms.invite`, NOT `rooms.join` — and
 * our chat list only reads `rooms.join`. That left the Signal chat list empty
 * forever ("Syncing your Signal chats…"). Beeper auto-accepts these invites;
 * this mirrors that. (WhatsApp already does the same via
 * discoverPendingBridgeInvites/ensureBridgePortalRoomsJoined.)
 */
async function discoverPendingSignalBridgeInvites(
  userId,
  { bridgeBotMxid = "" } = {}
) {
  try {
    const syncSnapshot = await fetchSyncSnapshot(userId, {
      timelineLimit: 5,
      force: false,
    });
    const invites = syncSnapshot?.data?.rooms?.invite || {};
    const targetMxid = String(bridgeBotMxid || "").trim();
    const matches = [];
    for (const [roomId, roomData] of Object.entries(invites)) {
      const events = roomData?.invite_state?.events || [];
      const inviter =
        events.find(
          (ev) =>
            ev?.type === "m.room.member" &&
            ev?.content?.membership === "invite"
        )?.sender || "";
      // Accept invites from the bridge bot OR any Signal ghost user.
      if (
        (targetMxid && inviter === targetMxid) ||
        isSignalGhostMxid(inviter)
      ) {
        matches.push(roomId);
      }
    }
    return matches;
  } catch {
    return [];
  }
}

/**
 * Accept (join) any pending Signal portal-room invites so they surface in the
 * chat list. Best-effort and idempotent; only joins invites coming from the
 * Signal bridge bot / ghosts. Returns the list of room IDs successfully joined.
 */
async function ensureSignalPortalRoomsJoined(
  userId,
  { config = {}, joinedRoomIds = new Set(), maxRooms = 50 } = {}
) {
  const joinedSet = new Set(
    [...(joinedRoomIds instanceof Set ? joinedRoomIds : joinedRoomIds || [])]
      .map((roomId) => String(roomId || "").trim())
      .filter(Boolean)
  );

  const pendingInvites = await discoverPendingSignalBridgeInvites(userId, {
    bridgeBotMxid: config?.bridgeBotMxid,
  });

  const pendingRoomIds = [...new Set(pendingInvites)]
    .filter((roomId) => roomId && !joinedSet.has(roomId))
    .slice(0, Math.max(1, Number(maxRooms || 50)));

  const successful = [];
  for (const roomId of pendingRoomIds) {
    try {
      await ensureJoinedSignalRoom(userId, roomId);
      successful.push(roomId);
      joinedSet.add(roomId);
    } catch {
      // best-effort: a single failed join must not block the rest
    }
  }

  if (successful.length) {
    invalidateSignalCache(userId);
  }
  return successful;
}

function invalidateSignalCache(userId) {
  for (const key of [...SIGNAL_SYNC_CACHE.keys()]) {
    if (key.startsWith(`${userId}:`)) SIGNAL_SYNC_CACHE.delete(key);
  }
  SIGNAL_STATUS_CACHE.delete(userId);
}

/**
 * Full reset for disconnect / logout flows. Also drops the active-login
 * bookkeeping so the next connect cycle starts a clean QR window.
 */
function invalidateSignalCacheForReconnect(userId) {
  invalidateSignalCache(userId);
  SIGNAL_LOGIN_REQUESTED_AT.delete(userId);
  SIGNAL_LOGIN_RESEND_AT.delete(userId);
}

async function fetchSyncSnapshot(
  userId,
  { timelineLimit = 30, force = false } = {}
) {
  const cacheKey = `${userId}:${timelineLimit}`;
  const cached = SIGNAL_SYNC_CACHE.get(cacheKey);
  if (!force && cached && cached.expiresAt > nowTs()) {
    return cached.value;
  }

  const { integration, config } = await ensureSignalAccess(userId);
  const filter = JSON.stringify({
    presence: { types: [] },
    room: {
      timeline: {
        limit: Math.max(1, Math.min(100, Number(timelineLimit || 30))),
      },
      state: { lazy_load_members: true },
      account_data: { types: ["m.tag", "m.fully_read"] },
      ephemeral: { types: ["m.receipt", "m.typing"] },
    },
  });

  const response = await matrixRequestWithRefresh(
    userId,
    "GET",
    "/_matrix/client/v3/sync",
    {
      params: { timeout: 0, filter },
      timeout: 20_000,
    }
  );

  const snapshot = {
    integration,
    config,
    data: response.data || {},
  };
  SIGNAL_SYNC_CACHE.set(cacheKey, {
    expiresAt: nowTs() + SIGNAL_SYNC_CACHE_TTL_MS,
    value: snapshot,
  });
  return snapshot;
}

// Real-time push: a single Matrix /sync long-poll that resolves as soon as the
// homeserver reports new Signal activity (an incoming message in any joined
// portal room, or a brand-new portal invite). Mirrors the WhatsApp listener so
// Signal notifications arrive instantly instead of waiting on the 15s poll.
async function waitForSignalActivity(
  userId,
  { since = "", timeoutMs = 25000 } = {}
) {
  const { config } = await ensureSignalAccess(userId);
  const selfMxid = String(config?.mxid || "");
  const filter = JSON.stringify({
    presence: { types: [] },
    account_data: { types: [] },
    room: {
      timeline: { limit: 1 },
      state: { types: [], lazy_load_members: true },
      ephemeral: { types: [] },
      account_data: { types: [] },
    },
  });

  const params = { timeout: Math.max(0, Number(timeoutMs) || 0), filter };
  if (since) params.since = since;

  const response = await matrixRequestWithRefresh(
    userId,
    "GET",
    "/_matrix/client/v3/sync",
    {
      params,
      // Give axios headroom over the Matrix long-poll timeout so the HTTP layer
      // doesn't abort the request before the homeserver responds.
      timeout: (Number(timeoutMs) || 0) + 20000,
    }
  );

  const data = response.data || {};
  const nextBatch = data.next_batch || since || "";

  let hasNewActivity = false;
  const joined = data.rooms?.join || {};
  for (const room of Object.values(joined)) {
    const events = room?.timeline?.events || [];
    for (const ev of events) {
      if (
        ev?.type === "m.room.message" &&
        ev?.sender &&
        String(ev.sender) !== selfMxid
      ) {
        hasNewActivity = true;
        break;
      }
    }
    if (hasNewActivity) break;
  }

  // New portal-room invites (a brand new Signal chat) also count as activity.
  const inviteCount = data.rooms?.invite
    ? Object.keys(data.rooms.invite).length
    : 0;

  return { nextBatch, hasNewActivity: hasNewActivity || inviteCount > 0 };
}

async function getWhoAmI(userId) {
  const response = await matrixRequestWithRefresh(
    userId,
    "GET",
    "/_matrix/client/v3/account/whoami"
  );
  return response.data || {};
}

async function getProfile(userId, mxid = "") {
  const targetMxid = normalizeMxid(mxid);
  if (!targetMxid) return {};
  const response = await matrixRequestWithRefresh(
    userId,
    "GET",
    `/_matrix/client/v3/profile/${encodeURIComponent(targetMxid)}`
  );
  return response.data || {};
}

async function findManagementRoom(userId, snapshot = null) {
  const currentSnapshot =
    snapshot ||
    (await fetchSyncSnapshot(userId, { timelineLimit: 5, force: false }));
  const directMap = parseDirectMap(currentSnapshot.data);
  const rooms = currentSnapshot.data.rooms?.join || {};

  for (const [roomId, roomData] of Object.entries(rooms)) {
    const descriptor = buildRoomDescriptor({
      roomId,
      roomData,
      currentUserId: currentSnapshot.config.mxid,
      bridgeBotMxid: currentSnapshot.config.bridgeBotMxid,
      managementRoomId: currentSnapshot.config.managementRoomId,
      directMap,
    });
    if (descriptor.isManagement) return descriptor.room;
  }

  return null;
}

async function ensureManagementRoom(userId) {
  const snapshot = await fetchSyncSnapshot(userId, {
    timelineLimit: 5,
    force: true,
  });
  if (snapshot.config.managementRoomId) {
    return String(snapshot.config.managementRoomId);
  }

  const existing = await findManagementRoom(userId, snapshot);
  if (existing?.roomId) return existing.roomId;

  const { config } = snapshot;
  const response = await matrixRequestWithRefresh(
    userId,
    "POST",
    "/_matrix/client/v3/createRoom",
    {
      data: {
        is_direct: true,
        invite: [config.bridgeBotMxid],
        preset: "trusted_private_chat",
        name: "Signal Bridge",
      },
    }
  );

  const roomId = String(response.data?.room_id || "").trim();
  if (roomId) {
    await saveSignalIntegration(userId, {
      homeserverUrl: config.homeserverUrl,
      mxid: config.mxid,
      accessToken: config.accessToken,
      deviceId: config.deviceId,
      bridgeBotMxid: config.bridgeBotMxid,
      managementRoomId: roomId,
      loginState: config.loginState,
      lastError: config.lastError,
      connectedAt: config.connectedAt || null,
    });
    invalidateSignalCache(userId);
  }

  return roomId;
}

async function fetchRoomDescriptorById(
  userId,
  roomId,
  { timelineLimit = 40, snapshot = null } = {}
) {
  const targetRoomId = String(roomId || "").trim();
  if (!targetRoomId) return null;

  const currentSnapshot =
    snapshot ||
    (await fetchSyncSnapshot(userId, {
      timelineLimit: Math.max(5, timelineLimit),
      force: true,
    }).catch(() => null));
  if (!currentSnapshot?.config) return null;

  const directMap = parseDirectMap(currentSnapshot.data || {});
  const syncRoomData =
    currentSnapshot.data?.rooms?.join?.[targetRoomId] || null;
  if (syncRoomData) {
    return buildRoomDescriptor({
      roomId: targetRoomId,
      roomData: syncRoomData,
      currentUserId: currentSnapshot.config.mxid,
      bridgeBotMxid: currentSnapshot.config.bridgeBotMxid,
      managementRoomId: currentSnapshot.config.managementRoomId || targetRoomId,
      directMap,
    });
  }

  const loadDescriptor = async () => {
    const [stateResponse, messagesResponse] = await Promise.all([
      matrixRequestWithRefresh(
        userId,
        "GET",
        `/_matrix/client/v3/rooms/${encodeURIComponent(targetRoomId)}/state`,
        { timeout: 20_000 }
      ),
      matrixRequestWithRefresh(
        userId,
        "GET",
        `/_matrix/client/v3/rooms/${encodeURIComponent(targetRoomId)}/messages`,
        {
          params: {
            dir: "b",
            limit: Math.max(5, Math.min(100, Number(timelineLimit || 40))),
          },
          timeout: 20_000,
        }
      ),
    ]);

    const syntheticRoomData = {
      state: {
        events: Array.isArray(stateResponse.data) ? stateResponse.data : [],
      },
      timeline: {
        events: [...(messagesResponse.data?.chunk || [])].reverse(),
        prev_batch: messagesResponse.data?.end || null,
      },
      summary: syncRoomData?.summary || {},
      unread_notifications: syncRoomData?.unread_notifications || {},
    };

    return buildRoomDescriptor({
      roomId: targetRoomId,
      roomData: syntheticRoomData,
      currentUserId: currentSnapshot.config.mxid,
      bridgeBotMxid: currentSnapshot.config.bridgeBotMxid,
      managementRoomId: currentSnapshot.config.managementRoomId || targetRoomId,
      directMap,
    });
  };

  try {
    return await loadDescriptor();
  } catch (err) {
    if (!isMatrixNotInRoomError(err)) {
      return null;
    }

    try {
      await ensureJoinedSignalRoom(userId, targetRoomId);
      return await loadDescriptor();
    } catch {
      return null;
    }
  }
}

async function waitForManagementRoomReady(
  userId,
  { roomId = "", timeoutMs = 12_000, intervalMs = 1_000 } = {}
) {
  const targetRoomId = String(roomId || "").trim();
  const startedAt = nowTs();

  while (nowTs() - startedAt < timeoutMs) {
    const snapshot = await fetchSyncSnapshot(userId, {
      timelineLimit: 20,
      force: true,
    }).catch(() => null);
    const currentRoomId =
      targetRoomId || String(snapshot?.config?.managementRoomId || "").trim();
    const descriptor = currentRoomId
      ? await fetchRoomDescriptorById(userId, currentRoomId, {
          timelineLimit: 20,
          snapshot,
        })
      : null;

    if (descriptor) {
      const bridgeJoined =
        descriptor.memberMap.get(String(snapshot.config.bridgeBotMxid))
          ?.membership === "join";
      const bridgeSpoke = (descriptor.messages || []).some((message) =>
        isBridgeBotMessage(message, snapshot.config.bridgeBotMxid)
      );
      if (bridgeJoined || bridgeSpoke) {
        return descriptor;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return getManagementRoomDescriptor(userId, {
    force: true,
    timelineLimit: 40,
  }).catch(() => null);
}

async function getManagementRoomDescriptor(
  userId,
  { force = false, timelineLimit = 60 } = {}
) {
  const snapshot = await fetchSyncSnapshot(userId, {
    timelineLimit,
    force,
  });
  const directMap = parseDirectMap(snapshot.data);
  let roomId = snapshot.config.managementRoomId;
  let descriptor = roomId
    ? await fetchRoomDescriptorById(userId, roomId, {
        timelineLimit,
        snapshot,
      })
    : null;

  if (!descriptor) {
    const existing = await findManagementRoom(userId, snapshot).catch(
      () => null
    );
    if (existing?.roomId) {
      roomId = existing.roomId;
      descriptor = await fetchRoomDescriptorById(userId, roomId, {
        timelineLimit,
        snapshot,
      });
      if (roomId && roomId !== snapshot.config.managementRoomId) {
        await saveSignalIntegration(userId, {
          managementRoomId: roomId,
          loginState: snapshot.config.loginState,
          lastError: snapshot.config.lastError,
          connectedAt: snapshot.config.connectedAt || null,
        });
      }
    }
  }

  if (!roomId || !descriptor) return null;

  return descriptor;
}

function isBridgeBotMessage(message = {}, bridgeBotMxid = "") {
  const sender = String(message.sender || "").trim();
  const senderName = String(message.senderName || "").trim();
  return (
    sender === String(bridgeBotMxid || "").trim() ||
    sender === normalizeMxid(defaultBridgeBotMxid()) ||
    /^signal bridge(?: bot)?$/i.test(senderName) ||
    /signal bridge/i.test(senderName)
  );
}

function pickLatestManagementSignal(entries = []) {
  return (
    [...entries]
      .filter((entry) => entry?.message && entry?.state)
      .sort(
        (left, right) =>
          Number(right.message?.timestamp || 0) -
          Number(left.message?.timestamp || 0)
      )[0] || null
  );
}

function prefersPrefixedBridgeCommands(descriptor = null, bridgeBotMxid = "") {
  return (descriptor?.messages || []).some((message) => {
    if (!isBridgeBotMessage(message, bridgeBotMxid)) return false;
    const text = String(message.text || message.previewText || "").trim();
    return /!signal\s+help/i.test(text);
  });
}

function normalizeBridgeCommandText(
  command,
  { descriptor = null, bridgeBotMxid = "" } = {}
) {
  const text = String(command || "").trim();
  if (!text) return "";
  if (text.startsWith("!")) return text;
  if (prefersPrefixedBridgeCommands(descriptor, bridgeBotMxid)) {
    return `!signal ${text}`;
  }
  return text;
}

function extractBridgeRoomState(descriptor = null, bridgeBotMxid = "") {
  const botMessages = (descriptor?.messages || []).filter((message) =>
    isBridgeBotMessage(message, bridgeBotMxid)
  );

  const latestConnected = [...botMessages]
    .reverse()
    .find((message) =>
      BRIDGE_SUCCESS_RE.test(String(message.text || message.previewText || ""))
    );
  const latestQrImage = [...botMessages]
    .reverse()
    .find((message) => message.media?.type === "image");
  const latestQrText = [...botMessages]
    .reverse()
    .find((message) =>
      BRIDGE_QR_RE.test(
        String(message.text || message.previewText || "").trim()
      )
    );
  const latestQr = latestQrImage || latestQrText || null;
  const latestError = [...botMessages].reverse().find((message) => {
    const text = String(message.text || message.previewText || "").trim();
    if (!text) return false;
    return BRIDGE_ERROR_RE.test(text) && !BRIDGE_SUCCESS_RE.test(text);
  });

  const latestSignal = pickLatestManagementSignal([
    { state: "connected", message: latestConnected },
    { state: "pending_qr", message: latestQrText || latestQrImage },
    { state: "error", message: latestError },
  ]);

  return {
    latestConnected,
    latestQr,
    latestQrImage,
    latestQrText,
    latestError,
    loginState: latestSignal?.state || (latestQr ? "pending_qr" : null),
    qrPayload: String(
      latestQrImage?.text ||
        latestQrImage?.previewText ||
        latestQrText?.text ||
        latestQrText?.previewText ||
        ""
    ).trim(),
    qrImageMxc:
      latestQrImage?.media?.mxc ||
      latestQrImage?.media?.thumbnailMxc ||
      latestQr?.media?.mxc ||
      latestQr?.media?.thumbnailMxc ||
      null,
    qrImageUrl:
      latestSignal?.state === "pending_qr"
        ? latestQrImage?.media?.url ||
          latestQrImage?.media?.thumbnailUrl ||
          latestQr?.media?.url ||
          latestQr?.media?.thumbnailUrl ||
          null
        : latestQrImage?.media?.url ||
          latestQrImage?.media?.thumbnailUrl ||
          latestQr?.media?.url ||
          latestQr?.media?.thumbnailUrl ||
          null,
    lastErrorText:
      latestError?.text ||
      latestError?.previewText ||
      latestError?.media?.body ||
      "",
    latestConnectedAt:
      latestConnected?.isoTimestamp ||
      (latestConnected?.timestamp
        ? new Date(latestConnected.timestamp).toISOString()
        : null),
  };
}

async function resolveQrImageUrl(userId, bridgeState = {}) {
  const qrPayload = String(bridgeState?.qrPayload || "").trim();
  if (SIGNAL_LINK_DEVICE_RE.test(qrPayload)) {
    const payloadCacheKey = `payload:${qrPayload}`;
    const cachedPayload = getCachedQrImage(payloadCacheKey);
    if (cachedPayload) return cachedPayload;
    try {
      return cacheQrImage(
        payloadCacheKey,
        await buildSignalQrDataUrl(qrPayload)
      );
    } catch {}
  }

  const mxc = String(bridgeState?.qrImageMxc || "").trim();
  if (!mxc) {
    return bridgeState?.qrImageUrl || null;
  }

  const cached = getCachedQrImage(mxc);
  if (cached) return cached;

  try {
    const media = await fetchSignalMedia(userId, mxc);
    const contentType = String(media?.contentType || "")
      .trim()
      .toLowerCase();
    if (!contentType.startsWith("image/")) {
      return bridgeState?.qrImageUrl || null;
    }
    const buffer = Buffer.isBuffer(media?.body)
      ? media.body
      : Buffer.from(media?.body || "");
    if (!buffer.length) return bridgeState?.qrImageUrl || null;
    return cacheQrImage(
      mxc,
      `data:${media?.contentType || "image/png"};base64,${buffer.toString(
        "base64"
      )}`
    );
  } catch {
    return bridgeState?.qrImageUrl || null;
  }
}

async function buildSignalQrDataUrl(payload = "") {
  return QRCode.toDataURL(String(payload || "").trim(), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
}

async function resolveBridgeState(
  userId,
  {
    managementRoomId = "",
    bridgeBotMxid = "",
    force = false,
    timelineLimit = 60,
  } = {}
) {
  const roomId = String(managementRoomId || "").trim();
  const descriptor = await getManagementRoomDescriptor(userId, {
    force,
    timelineLimit,
  }).catch(() => null);

  let bridgeState = extractBridgeRoomState(descriptor, bridgeBotMxid);
  if (bridgeState.loginState || !roomId) {
    return bridgeState;
  }

  const timeline = await getSignalRoomTimeline(userId, roomId, {
    limit: Math.max(20, Math.min(120, Number(timelineLimit || 60))),
  }).catch(() => null);

  if (timeline?.messages?.length) {
    const timelineState = extractBridgeRoomState(
      { messages: timeline.messages },
      bridgeBotMxid
    );
    if (
      timelineState.loginState ||
      timelineState.qrImageMxc ||
      timelineState.lastErrorText
    ) {
      bridgeState = timelineState;
    }
  }

  return bridgeState;
}

/**
 * Extract the Signal loginId (Signal ACI/UUID) from the bridge bot's
 * "Successfully logged in as ..." message. Matrix-protocol fallback for
 * when the SQLite snapshot is empty (e.g. bridge is on Postgres).
 *
 * Signal's mautrix bridge identifies logins by ACI UUID rather than phone
 * number. The bot's message looks like:
 *   "Successfully logged in as +1 234 567 8900 (ACI: 775e7dce-bfc1-4edb-...)"
 * So we look for a UUID pattern first, falling back to phone digits.
 */
async function findSignalLoginIdFromBridgeBotMessages(
  userId,
  { managementRoomId = "", bridgeBotMxid = "" } = {}
) {
  const roomId = String(managementRoomId || "").trim();
  if (!roomId) return "";
  try {
    const descriptor = await getManagementRoomDescriptor(userId, {
      force: false,
      timelineLimit: 80,
    }).catch(() => null);
    const botMessages = (descriptor?.messages || []).filter((m) =>
      isBridgeBotMessage(m, bridgeBotMxid)
    );
    for (let i = botMessages.length - 1; i >= 0; i -= 1) {
      const text = String(
        botMessages[i]?.text || botMessages[i]?.previewText || ""
      );
      const uuidMatch = text.match(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i
      );
      if (uuidMatch) return uuidMatch[0].toLowerCase();
      const phoneMatch = text.match(/logged in as\s*\+?([\d\s\-()]{6,})/i);
      if (phoneMatch) {
        const digits = phoneMatch[1].replace(/\D/g, "");
        if (digits.length >= 6) return digits;
      }
    }
  } catch {}
  return "";
}

async function sendBridgeTextCommand(userId, command) {
  const requestedText = String(command || "").trim();
  if (!requestedText) throw new Error("Bridge command is required.");

  const sendCommand = async () => {
    const roomId = await ensureManagementRoom(userId);
    if (!roomId) {
      throw new Error("Could not find or create the Signal bridge room.");
    }

    const descriptor = await waitForManagementRoomReady(userId, { roomId });
    const { config } = await ensureSignalAccess(userId);
    const normalizedText = normalizeBridgeCommandText(requestedText, {
      descriptor,
      bridgeBotMxid: config.bridgeBotMxid,
    });
    const result = await sendSignalMessage(userId, roomId, normalizedText);
    return {
      ok: true,
      roomId,
      eventId: result.eventId || null,
      command: normalizedText,
    };
  };

  try {
    return await sendCommand();
  } catch (err) {
    const status = Number(err?.response?.status || 0);
    if (![403, 404].includes(status)) throw err;

    await saveSignalIntegration(userId, {
      managementRoomId: "",
    }).catch(() => null);
    invalidateSignalCache(userId);
    return sendCommand();
  }
}

async function waitForSignalLoginState(
  userId,
  { timeoutMs = 8_000, intervalMs = 800 } = {}
) {
  const startedAt = nowTs();
  let latestStatus = await getSignalStatus(userId, { forceRefresh: true });

  while (nowTs() - startedAt < timeoutMs) {
    if (
      ["pending_qr", "connected", "error"].includes(
        String(latestStatus?.loginState || "")
      )
    ) {
      return latestStatus;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    // Use cached path during polling — short status cache (1.5s) keeps us
    // responsive without redundant heavy work each iteration.
    latestStatus = await getSignalStatus(userId, { forceRefresh: false });
  }

  return latestStatus;
}

async function connectSignalIntegration(userId, payload = {}) {
  const forceReconnect = Boolean(
    payload?.reconnect || payload?.force || payload?.relogin
  );
  const existingIntegration = await getSignalIntegration(userId);
  const existingConfig = existingIntegration
    ? buildConfigFromIntegration(existingIntegration)
    : null;
  const canReadCurrentStatus = Boolean(existingConfig?.accessToken);
  const currentStatus = canReadCurrentStatus
    ? await getSignalStatus(userId, {
        forceRefresh: true,
      }).catch(() => null)
    : null;
  const hasActiveQr =
    currentStatus?.loginState === "pending_qr" &&
    Boolean(currentStatus?.qrImageUrl);

  if (
    !forceReconnect &&
    currentStatus &&
    (currentStatus.connected || hasActiveQr)
  ) {
    const latest = await ensureSignalIntegration(userId);
    return {
      integration: buildSignalClientIntegration(latest),
      clientIntegration: buildSignalClientIntegration(latest),
      status: currentStatus,
    };
  }

  const hiddenAccount = await ensureHiddenSignalAccount(userId);

  await saveSignalIntegration(userId, {
    homeserverUrl: hiddenAccount.homeserverUrl,
    mxid: hiddenAccount.mxid,
    bridgeBotMxid: hiddenAccount.bridgeBotMxid,
    loginState: "creating_account",
    lastError: "",
    connectedAt: forceReconnect
      ? null
      : existingConfig?.connectedAt || undefined,
  });

  try {
    const { integration } = await ensureSignalAccess(userId, {
      forceLogin: !existingConfig?.accessToken,
    });
    const config = buildConfigFromIntegration(integration);

    await saveSignalIntegration(userId, {
      homeserverUrl: hiddenAccount.homeserverUrl,
      mxid: hiddenAccount.mxid,
      accessToken: config.accessToken,
      deviceId: config.deviceId,
      bridgeBotMxid: hiddenAccount.bridgeBotMxid,
      loginState: "logging_in",
      lastError: "",
      connectedAt: forceReconnect ? null : config.connectedAt || null,
    });

    const roomId = await ensureManagementRoom(userId);
    await saveSignalIntegration(userId, {
      managementRoomId: roomId || "",
      loginState: "logging_in",
      lastError: "",
      connectedAt: forceReconnect ? null : config.connectedAt || null,
    });

    // Clear any stale bridge session so the bridge generates a fresh QR.
    // SAFETY: only purge on fresh connect (no existing Integration) or
    // explicit force-reconnect. Otherwise we risk destroying a fresh
    // user_login row that the bridge just wrote from a successful QR scan
    // (e.g. user double-clicked Connect).
    const isFreshConnect = !existingIntegration;
    if (isFreshConnect || forceReconnect) {
      const logoutResult = await provisioningLogin.logoutAllLogins(
        "signal",
        config.mxid
      );
      if (!logoutResult.ok) {
        throw new Error(
          "Signal is still linked to the previous account. Disconnect it completely before connecting another account."
        );
      }
    }
    const staleBridgeLogin = getSignalBridgeLogin({ mxid: hiddenAccount.mxid });
    if (
      staleBridgeLogin &&
      staleBridgeLogin.loginId &&
      (isFreshConnect || forceReconnect)
    ) {
      console.log(
        "[Signal connect] Existing bridge session found (loginId=%s), sending logout to bridge before fresh login",
        staleBridgeLogin.loginId
      );
      try {
        await sendBridgeTextCommand(
          userId,
          `logout ${staleBridgeLogin.loginId}`
        );
        // Give the bridge ~3s to process the logout asynchronously and clear
        // its own state. Then we'll send `login` for a fresh QR.
        await new Promise((r) => setTimeout(r, 3000));
      } catch (logoutErr) {
        console.warn(
          "[Signal connect] Bridge logout command failed (continuing anyway):",
          logoutErr.message
        );
      }
    }

    const shouldSendLogin = forceReconnect || !currentStatus || !hasActiveQr;

    if (shouldSendLogin) {
      // Drive the bridge's Provisioning API directly (Beeper parity): the
      // background runner long-polls the bridge and always exposes the live,
      // currently-scannable QR — no more stale Matrix-room QR copies that the
      // phone rejects with "Network error". The runner self-restarts each QR
      // cycle so the user always has a fresh code.
      provisioningLogin.stopLogin("signal", config.mxid);
      provisioningLogin.startLogin("signal", config.mxid, {
        force: forceReconnect || isFreshConnect,
      });
      // Open the "active login window" so status polls keep treating this as
      // an in-progress login.
      SIGNAL_LOGIN_REQUESTED_AT.set(userId, nowTs());
      SIGNAL_LOGIN_RESEND_AT.set(userId, nowTs());
    }

    // Wait briefly (up to 8s) for QR to surface. If not yet ready, return
    // immediately so the UI can render "Generating QR…". The frontend polls
    // /status every 1.5s and picks up the QR within ~2s of it being produced.
    const status = await waitForSignalLoginState(userId, {
      timeoutMs: 8_000,
      intervalMs: 800,
    });
    const latestIntegration = await ensureSignalIntegration(userId);

    return {
      integration: buildSignalClientIntegration(latestIntegration),
      clientIntegration: buildSignalClientIntegration(latestIntegration),
      status,
    };
  } catch (err) {
    const errorText = String(
      err?.message || err?.response?.data?.error || "Signal connect failed."
    ).trim();
    await saveSignalIntegration(userId, {
      loginState: "error",
      lastError: errorText,
      connectedAt: null,
    }).catch(() => null);
    throw err;
  }
}

function disconnectedSignalStatus(overrides = {}) {
  const lastError = String(
    overrides.lastError !== undefined
      ? overrides.lastError
      : overrides.error || ""
  ).trim();
  return {
    connected: false,
    loginState: "disconnected",
    lastError,
    error: lastError,
    qrImageUrl: null,
    roomCount: 0,
    unreadCount: 0,
    profile: null,
    connectedAt: null,
    ...overrides,
  };
}

async function adoptConnectedSignalIntegration(userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return null;

  const defaults = buildDefaultMatrixState(normalizedUserId);
  const acctState = await provisioningLogin
    .getBridgeAccountState("signal", defaults.mxid)
    .catch(() => null);
  if (!acctState?.connected) return null;

  const connectedAt = acctState.login?.state?.timestamp
    ? new Date(Number(acctState.login.state.timestamp) * 1000)
    : new Date();
  const matrixSession = await loginHiddenMatrixAccount(normalizedUserId).catch(
    (err) => {
      console.warn(
        "[Signal] connected bridge adoption could not refresh Matrix token:",
        err?.message || err
      );
      return null;
    }
  );
  const matrixLogin = matrixSession?.login || null;
  const hiddenAccount = matrixSession?.hiddenAccount || defaults;

  return saveSignalIntegration(normalizedUserId, {
    homeserverUrl: hiddenAccount.homeserverUrl || defaults.homeserverUrl,
    mxid: normalizeMxid(
      matrixLogin?.user_id || hiddenAccount.mxid || defaults.mxid
    ),
    accessToken: matrixLogin?.access_token || "",
    deviceId: matrixLogin?.device_id || "",
    bridgeBotMxid: hiddenAccount.bridgeBotMxid || defaults.bridgeBotMxid,
    loginState: "connected",
    lastError: "",
    connectedAt,
  });
}

async function listMatrixSignalRooms(
  userId,
  {
    search = "",
    limit = 80,
    force = false,
    knownPortalRoomIds = new Set(),
  } = {}
) {
  const snapshot = await fetchSyncSnapshot(userId, {
    timelineLimit: 20,
    force,
  });
  const directMap = parseDirectMap(snapshot.data);
  const rooms = snapshot.data.rooms?.join || {};

  const descriptors = Object.entries(rooms)
    .map(([roomId, roomData]) =>
      buildRoomDescriptor({
        roomId,
        roomData,
        currentUserId: snapshot.config.mxid,
        bridgeBotMxid: snapshot.config.bridgeBotMxid,
        managementRoomId: snapshot.config.managementRoomId,
        directMap,
        knownPortalRoomIds,
      })
    )
    .filter((descriptor) => descriptor.isSignalRoom && !descriptor.isManagement)
    .map((descriptor) => descriptor.room)
    .sort(
      (a, b) => Number(b.lastMessageTs || 0) - Number(a.lastMessageTs || 0)
    );

  const query = normalizeSearchValue(search);
  const filtered = query
    ? descriptors.filter((room) => {
        const haystack = normalizeSearchValue(
          [room.name, room.lastMessage, room.lastSender]
            .filter(Boolean)
            .join(" ")
        );
        return haystack.includes(query);
      })
    : descriptors;

  return filtered.slice(0, Math.max(1, Math.min(200, Number(limit || 80))));
}

function buildSignalStatusProfile({
  matrixProfile = {},
  whoami = {},
  config = {},
  bridgeLogin = null,
  selfProfileHint = null,
}) {
  const bridgeProfile = buildSignalProfileFromBridgeLogin(bridgeLogin);
  if (bridgeProfile) return bridgeProfile;

  const matrixName = String(matrixProfile.displayname || "").trim();
  const matrixAvatar = buildSignalMediaUrl(matrixProfile.avatar_url || "");

  // The appservice homeserver account carries only a generic display name
  // ("OrionAI Signal") and no avatar — that's why "my profile" looked empty.
  // When it's generic, fall back to the user's own Signal identity recovered
  // from the Note to Self chat (its single ghost member is *you*).
  const looksGeneric = !matrixName || /orion ?ai/i.test(matrixName);
  const hintName = String(selfProfileHint?.displayName || "").trim();
  const hintAvatar = String(selfProfileHint?.avatarUrl || "").trim();

  return {
    displayName:
      looksGeneric && hintName
        ? hintName
        : matrixName || localpartFromMxid(whoami.user_id || config.mxid),
    avatarUrl: matrixAvatar || hintAvatar || null,
  };
}

async function getSignalStatus(userId, { forceRefresh = false } = {}) {
  // Fast-path: rapid polls (1.5s window) return cached. Keeps the UI snappy
  // under 1.5–8s polling cadences.
  if (!forceRefresh && userId) {
    const cached = SIGNAL_STATUS_CACHE.get(userId);
    if (cached && cached.expiresAt > nowTs()) {
      return cached.value;
    }
  }

  let integration = await getSignalIntegration(userId);
  if (!integration) {
    integration = await adoptConnectedSignalIntegration(userId);
  }
  if (!integration) {
    return disconnectedSignalStatus();
  }

  let fallbackConfig = buildConfigFromIntegration(integration);

  // ---- Real-time Provisioning-API login short-circuit (Beeper parity) ----
  // While a provisioning login runner is active for this user we expose ITS
  // live QR directly. signalmeow rotates the provisioning QR every ~46s with a
  // brand-new keypair; the runner long-polls the bridge so the QR we serve is
  // always the current, scannable one (sub-second lag) instead of a stale
  // Matrix-room copy. When there is no active runner we fall through to the
  // existing Matrix status path untouched.
  if (fallbackConfig.mxid) {
    const runner = resumeSignalProvisioningLogin(fallbackConfig);
    if (runner) {
      if (runner.phase === "qr" || runner.phase === "starting") {
        const qrImageUrl =
          runner.phase === "qr" && runner.qrData
            ? await buildSignalQrDataUrl(runner.qrData).catch(() => null)
            : null;
        return {
          connected: false,
          loginState: qrImageUrl ? "pending_qr" : "logging_in",
          lastError: "",
          error: "",
          qrImageUrl,
          roomCount: 0,
          unreadCount: 0,
          profile: buildSignalStatusProfile({
            matrixProfile: {},
            whoami: {},
            config: fallbackConfig,
            bridgeLogin: null,
          }),
          connectedAt: null,
        };
      }
      if (runner.phase === "error" || runner.phase === "timeout") {
        provisioningLogin.stopLogin("signal", fallbackConfig.mxid);
        const expiredMsg =
          runner.error || "QR code expired. Please click Connect again.";
        return {
          connected: false,
          loginState: "error",
          lastError: expiredMsg,
          error: expiredMsg,
          qrImageUrl: null,
          roomCount: 0,
          unreadCount: 0,
          profile: buildSignalStatusProfile({
            matrixProfile: {},
            whoami: {},
            config: fallbackConfig,
            bridgeLogin: null,
          }),
          connectedAt: null,
        };
      }
      if (runner.phase === "connected") {
        // Scan succeeded. Persist connected state, stop the runner, then fall
        // through to the normal path which reads the bridge's user_login row.
        provisioningLogin.stopLogin("signal", fallbackConfig.mxid);
        SIGNAL_LOGIN_REQUESTED_AT.delete(userId);
        SIGNAL_LOGIN_RESEND_AT.delete(userId);
        await saveSignalIntegration(userId, {
          loginState: "connected",
          lastError: "",
          connectedAt: fallbackConfig.connectedAt || new Date(),
        }).catch(() => {});
        fallbackConfig = buildConfigFromIntegration(
          await getSignalIntegration(userId)
        );
      }
    }
  }

  try {
    const { config } = await ensureSignalAccess(userId, { forceLogin: false });
    // whoami + profile only needed for connected display — defer fetching
    // them until we know we're connected so pending/QR responses are fast.
    const bridgeLogin = getSignalBridgeLogin(config);
    let managementRoomId = config.managementRoomId || "";

    if (!managementRoomId) {
      managementRoomId = await ensureManagementRoom(userId).catch(() => "");
    }

    const bridgeState = await resolveBridgeState(userId, {
      managementRoomId,
      bridgeBotMxid: config.bridgeBotMxid,
      force: forceRefresh,
      timelineLimit: 60,
    });

    let loginState = normalizeSignalLoginState(
      bridgeState.loginState,
      fallbackConfig.loginState
    );
    let lastError =
      loginState === "error"
        ? bridgeState.lastErrorText || fallbackConfig.lastError || ""
        : "";
    let connectedAt = fallbackConfig.connectedAt || null;
    let rooms = [];
    let connected = false;
    // Source of truth: the bridge's own Provisioning whoami. The local SQLite
    // copy is stale (the Signal bridge runs on Postgres now), so trust the
    // bridge's live login state first and fall back to the legacy DB check.
    const acctState = await provisioningLogin
      .getBridgeAccountState("signal", config.mxid)
      .catch(() => null);
    const whoamiConnected = Boolean(acctState && acctState.connected);
    const whoamiDead = hasDeadSignalProvisioningLogin(acctState);
    const bridgeConnected =
      whoamiConnected ||
      (!whoamiDead && isSignalBridgeLoginActive(bridgeLogin));
    if (whoamiDead && !whoamiConnected) {
      loginState = "error";
      lastError =
        acctState?.login?.state?.message ||
        acctState?.logins?.find((login) =>
          ["BAD_CREDENTIALS", "LOGGED_OUT"].includes(
            signalProvisioningLoginState(login)
          )
        )?.state?.message ||
        "Signal is logged out. Reconnect Signal to generate a fresh QR.";
    }

    // Is the user mid-connect and still watching the QR screen?
    const loginRequestedAt = Number(
      SIGNAL_LOGIN_REQUESTED_AT.get(userId) || 0
    );
    const activeLoginWindow =
      loginRequestedAt > 0 &&
      nowTs() - loginRequestedAt < SIGNAL_LOGIN_ACTIVE_WINDOW_MS;
    // The bridge reported a soft QR failure ("too many QR code refreshes" /
    // timeout) rather than a real error. During an active connect we treat it
    // as retryable: hold the UI in "logging_in" and silently re-issue `login`.
    const retryableTimeout =
      loginState === "error" &&
      !bridgeConnected &&
      activeLoginWindow &&
      SIGNAL_RETRYABLE_LOGIN_RE.test(String(bridgeState.lastErrorText || ""));

    if (retryableTimeout) {
      loginState = "logging_in";
      lastError = "";
      const lastResend = Number(SIGNAL_LOGIN_RESEND_AT.get(userId) || 0);
      if (nowTs() - lastResend > SIGNAL_LOGIN_RESEND_THROTTLE_MS) {
        SIGNAL_LOGIN_RESEND_AT.set(userId, nowTs());
        sendBridgeTextCommand(userId, "login").catch((err) => {
          console.info(
            "[Signal] auto QR refresh deferred:",
            String(err?.message || err || "")
          );
        });
      }
    }

    if (
      bridgeConnected ||
      loginState === "connected" ||
      (fallbackConfig.connectedAt &&
        !["pending_qr", "logging_in", "error"].includes(
          String(loginState || "")
        ))
    ) {
      connected = true;
      loginState = "connected";
      connectedAt = connectedAt || bridgeState.latestConnectedAt || new Date();
      rooms = await listSignalRooms(userId, { limit: 80 }).catch(() => []);
      lastError = "";
    }

    // Drop active-login bookkeeping once connected so we stop re-issuing QR.
    if (connected) {
      SIGNAL_LOGIN_REQUESTED_AT.delete(userId);
      SIGNAL_LOGIN_RESEND_AT.delete(userId);
    }

    const patch = {};
    if (
      managementRoomId &&
      managementRoomId !== fallbackConfig.managementRoomId
    ) {
      patch.managementRoomId = managementRoomId;
    }
    if (loginState !== fallbackConfig.loginState) {
      patch.loginState = loginState;
    }
    if (lastError !== fallbackConfig.lastError) {
      patch.lastError = lastError;
    }
    const nextConnectedAtIso = connectedAt
      ? new Date(connectedAt).toISOString()
      : null;
    const currentConnectedAtIso = fallbackConfig.connectedAt
      ? new Date(fallbackConfig.connectedAt).toISOString()
      : null;
    if (nextConnectedAtIso !== currentConnectedAtIso) {
      patch.connectedAt = connectedAt;
    }
    if (Object.keys(patch).length) {
      await saveSignalIntegration(userId, patch);
    }

    const qrImageUrl =
      loginState === "pending_qr"
        ? await resolveQrImageUrl(userId, bridgeState)
        : null;

    // Only fetch profile info when actually connected (saves 2 API calls
    // per status poll while pending/QR).
    let whoami = {};
    let profile = {};
    if (connected) {
      whoami = await getWhoAmI(userId).catch(() => ({}));
      profile = await getProfile(userId, whoami.user_id || config.mxid).catch(
        () => ({})
      );
    }

    const result = {
      connected,
      loginState,
      lastError,
      error: lastError,
      qrImageUrl,
      roomCount: rooms.length,
      unreadCount: rooms.reduce(
        (sum, room) => sum + Number(room.unreadCount || 0),
        0
      ),
      profile: buildSignalStatusProfile({
        matrixProfile: profile,
        whoami,
        config,
        bridgeLogin,
        selfProfileHint: (() => {
          const selfRoom = rooms.find((room) => room && room.isSelf);
          if (!selfRoom) return null;
          return {
            displayName: selfRoom.selfProfileName || "",
            avatarUrl: selfRoom.avatarUrl || "",
          };
        })(),
      }),
      connectedAt: connectedAt ? new Date(connectedAt).toISOString() : null,
    };

    if (userId) {
      SIGNAL_STATUS_CACHE.set(userId, {
        expiresAt: nowTs() + SIGNAL_STATUS_CACHE_TTL_MS,
        value: result,
      });
    }
    return result;
  } catch (err) {
    const rateLimited =
      Boolean(err?.signalRateLimited) || isMatrixRateLimitedError(err);
    const errorText = rateLimited
      ? formatSignalRateLimitMessage(err)
      : err.response?.data?.error || err.message || "Signal connection failed.";
    const nextLoginState = rateLimited
      ? "error"
      : fallbackConfig.loginState &&
        !["connected", "disconnected"].includes(fallbackConfig.loginState)
      ? fallbackConfig.loginState
      : "error";

    if (
      nextLoginState !== fallbackConfig.loginState ||
      errorText !== fallbackConfig.lastError
    ) {
      await saveSignalIntegration(userId, {
        loginState: nextLoginState,
        lastError: errorText,
      }).catch(() => null);
    }

    return disconnectedSignalStatus({
      loginState: nextLoginState,
      lastError: errorText,
      connectedAt: fallbackConfig.connectedAt
        ? new Date(fallbackConfig.connectedAt).toISOString()
        : null,
    });
  }
}

// A stable per-contact identity for a direct Signal room. The bridge can leave
// behind a stale/abandoned portal room for the same contact (e.g. after a
// re-link), so the same person can appear twice — one live room and one dead
// room rendering "Attachment no longer available". We collapse those by phone /
// signal id, falling back to the normalized display name for matrix-only rooms
// that carry no explicit identifier. Group rooms are never collapsed (distinct
// roomId), since different groups can legitimately share a name.
function signalRoomIdentityKey(room = {}) {
  if (!room) return "";
  // The self-chat has exactly one logical identity no matter how many duplicate
  // portal rooms the bridge left behind.
  if (room.isSelf) return "self:note-to-self";

  const phone = normalizePhoneNumber(
    room.phoneNumber || room.signalIdentifier || ""
  );
  if (phone) return `phone:${phone}`;

  const name = normalizeSearchValue(room.name || "");
  // Genuine 1:1 chats collapse by display name.
  if (room.isDirect && name) return `name:${name}`;

  // For groups / ambiguous rooms, only collapse rooms that are byte-identical
  // duplicates (same name + same last activity). This removes orphaned portal
  // rooms from a re-link without ever merging two *distinct* group chats (e.g.
  // "aaru verma" vs "aaru verma, Vikas Verma", which differ in last message).
  if (name) {
    return `dup:${name}|${room.lastMessageTs || 0}|${normalizeSearchValue(
      room.lastMessage || ""
    )}`;
  }
  return `room:${String(room.roomId || "")}`;
}

// "Note to Self" — Signal's own self-chat. The bridge names that portal exactly
// "Note to Self"; flag it so the UI can render it distinctly (and so it is never
// mistaken for a duplicate contact chat).
function isSignalNoteToSelfRoom(room = {}) {
  if (room?.isSelf) return true;
  const name = String(room?.name || "")
    .trim()
    .toLowerCase();
  return name === "note to self" || name.includes("note to self");
}

// Pick the "better" of two rooms that resolve to the same contact identity.
// Prefer the one with the most recent real activity; break ties toward a room
// that actually has message content / unread badges and isn't a placeholder.
function pickBetterSignalRoom(a, b) {
  if (!a) return b;
  if (!b) return a;
  const tsA = Number(a.lastMessageTs || 0);
  const tsB = Number(b.lastMessageTs || 0);
  if (tsA !== tsB) return tsA > tsB ? a : b;

  const contentA = a.lastMessage ? 1 : 0;
  const contentB = b.lastMessage ? 1 : 0;
  if (contentA !== contentB) return contentA > contentB ? a : b;

  const placeholderA = a.isPlaceholder ? 1 : 0;
  const placeholderB = b.isPlaceholder ? 1 : 0;
  if (placeholderA !== placeholderB) return placeholderA < placeholderB ? a : b;

  const unreadA = Number(a.unreadCount || 0);
  const unreadB = Number(b.unreadCount || 0);
  if (unreadA !== unreadB) return unreadA > unreadB ? a : b;

  return a;
}

function dedupeSignalRooms(rooms = []) {
  const byIdentity = new Map();
  for (const room of rooms) {
    if (!room) continue;
    const key = signalRoomIdentityKey(room);
    const existing = byIdentity.get(key);
    byIdentity.set(key, existing ? pickBetterSignalRoom(existing, room) : room);
  }
  return [...byIdentity.values()];
}

async function listSignalRooms(userId, { search = "", limit = 80 } = {}) {
  const { config } = await ensureSignalAccess(userId, { forceLogin: false });

  // Beeper-parity: the Signal bridge (on Postgres) creates a portal room per
  // chat and *invites* our user puppet. Until we accept those invites, the
  // rooms sit in /sync `rooms.invite` and never appear in the chat list
  // (this was the "Syncing your Signal chats…" hang). Auto-accept them, but
  // only when the bridge reports a healthy login so we don't join orphan
  // invites from a stale/old session.
  try {
    const acctState = await provisioningLogin
      .getBridgeAccountState("signal", config.mxid)
      .catch(() => null);
    if (acctState && acctState.connected) {
      await ensureSignalPortalRoomsJoined(userId, { config });
    }
  } catch {
    // best-effort: never let auto-join failures break the chat list
  }

  const bridgeLogin = getSignalBridgeLogin(config);
  const bridgePortals = getSignalBridgePortals(config);
  const knownPortalRoomIds = new Set(
    bridgePortals
      .map((portal) => String(portal.roomId || "").trim())
      .filter(Boolean)
  );

  const matrixRooms = await listMatrixSignalRooms(userId, {
    search,
    limit: Math.max(limit, 120),
    force: false,
    knownPortalRoomIds,
  }).catch(() => []);

  const roomsById = new Map(
    matrixRooms.map((room) => [String(room.roomId), room])
  );

  const portalRooms = await Promise.all(
    bridgePortals.map(async (portal) => {
      const existing = roomsById.get(String(portal.roomId));
      if (existing) {
        return applySignalPortalReadState(
          userId,
          applySignalPortalFallbackToRoom(existing, portal),
          portal
        );
      }

      const descriptor = await fetchRoomDescriptorById(userId, portal.roomId, {
        timelineLimit: 20,
      }).catch(() => null);

      if (descriptor?.room) {
        return applySignalPortalReadState(
          userId,
          applySignalPortalFallbackToRoom(descriptor.room, portal),
          portal
        );
      }

      return applySignalPortalReadState(
        userId,
        buildSignalPortalRoom(portal),
        portal
      );
    })
  );

  portalRooms.forEach((room) => {
    if (room?.roomId) roomsById.set(String(room.roomId), room);
  });

  const portalIdentifiers = new Set(
    bridgePortals
      .map((portal) =>
        normalizePhoneNumber(
          portal.e164Number || portal.otherUserId || portal.name || ""
        )
      )
      .filter(Boolean)
  );

  const placeholderRooms = listSignalFallbackRooms(bridgeLogin, {
    search,
    limit: Math.max(limit, 120),
  }).filter((room) => {
    const identifier = normalizePhoneNumber(
      room.phoneNumber || room.signalIdentifier || room.name || ""
    );
    return identifier ? !portalIdentifiers.has(identifier) : true;
  });

  placeholderRooms.forEach((room) => {
    if (room?.roomId && !roomsById.has(String(room.roomId))) {
      roomsById.set(String(room.roomId), room);
    }
  });

  const query = normalizeSearchValue(search);
  // Tag the self-chat before de-duping so identity collapse never folds it into
  // a contact chat, and the UI can style it.
  const taggedRooms = [...roomsById.values()].map((room) =>
    room && isSignalNoteToSelfRoom(room) && !room.isSelf
      ? { ...room, isSelf: true }
      : room
  );
  return dedupeSignalRooms(taggedRooms)
    .filter((room) => {
      if (!query) return true;
      return normalizeSearchValue(
        [
          room.name,
          room.lastMessage,
          room.lastSender,
          room.phoneNumber,
          room.signalIdentifier,
        ]
          .filter(Boolean)
          .join(" ")
      ).includes(query);
    })
    .sort((a, b) => Number(b.lastMessageTs || 0) - Number(a.lastMessageTs || 0))
    .slice(0, Math.max(1, Math.min(200, Number(limit || 80))));
}

function findSignalRoomByContact(matrixRooms = [], contact = {}) {
  const source = contact || {};
  const targetName = normalizeSearchValue(buildBridgeContactName(source));
  const targetPhone = normalizePhoneNumber(
    source.e164Number || source.identifier || ""
  );

  return (
    matrixRooms.find((room) => {
      const roomName = normalizeSearchValue(room.name || "");
      const roomLastSender = normalizeSearchValue(room.lastSender || "");
      const roomNamePhone = normalizePhoneNumber(room.name || "");
      return (
        (targetName &&
          (roomName === targetName || roomLastSender === targetName)) ||
        (targetPhone && roomNamePhone === targetPhone)
      );
    }) || null
  );
}

async function waitForSignalContactRoom(
  userId,
  contact = {},
  { timeoutMs = 12_000, intervalMs = 1_200 } = {}
) {
  const startedAt = nowTs();
  const source = contact || {};
  const targetIdentifier = String(
    source.identifier || source.e164Number || ""
  ).trim();
  const targetName = buildBridgeContactName(source);

  while (nowTs() - startedAt < timeoutMs) {
    const managementDescriptor = await getManagementRoomDescriptor(userId, {
      force: true,
      timelineLimit: 40,
    }).catch(() => null);
    const managementMatch = (managementDescriptor?.messages || [])
      .slice()
      .reverse()
      .find((message) => {
        if (!isBridgeBotMessage(message, "")) return false;
        const text = String(message.text || message.previewText || "").trim();
        if (!text || !MATRIX_TO_ROOM_LINK_RE.test(text)) return false;
        if (targetIdentifier && text.includes(targetIdentifier)) return true;
        return targetName ? text.includes(targetName) : false;
      });
    const managementRoomId = extractMatrixRoomIdFromText(
      managementMatch?.text || managementMatch?.previewText || ""
    );
    if (managementRoomId) {
      const descriptor = await fetchRoomDescriptorById(
        userId,
        managementRoomId,
        {
          timelineLimit: 40,
        }
      ).catch(() => null);
      if (descriptor?.room?.roomId) {
        return applySignalContactFallbackToRoom(descriptor.room, source);
      }
      return {
        ...buildSignalContactRoom(source),
        roomId: managementRoomId,
        id: managementRoomId,
        bridgeStatus: "portal",
      };
    }

    invalidateSignalCache(userId);
    const rooms = await listMatrixSignalRooms(userId, {
      limit: 200,
      force: true,
    }).catch(() => []);
    const match = findSignalRoomByContact(rooms, source);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return null;
}

async function resolveSignalRoomReference(
  userId,
  roomId,
  { createIfMissing = false } = {}
) {
  const normalizedRoomId = String(roomId || "").trim();
  if (!normalizedRoomId) {
    throw new Error("Signal conversation not found.");
  }

  if (!isSignalContactRoomId(normalizedRoomId)) {
    const { config } = await ensureSignalAccess(userId, { forceLogin: false });
    return {
      roomId: normalizedRoomId,
      room: null,
      placeholder: false,
      contact: null,
      portal: findSignalPortalByRoomId(config, normalizedRoomId),
    };
  }

  const contactRef = parseSignalContactRoomId(normalizedRoomId);
  const { config } = await ensureSignalAccess(userId, { forceLogin: false });
  const bridgeLogin = getSignalBridgeLogin(config);
  const contact = findSignalContactByIdentifier(
    bridgeLogin,
    contactRef?.identifier || ""
  );

  if (!contact) {
    return {
      roomId: normalizedRoomId,
      room: buildSignalContactRoom({
        identifier: contactRef?.identifier || "",
        e164Number: contactRef?.identifier || "",
      }),
      placeholder: true,
      contact: null,
    };
  }

  const existingRoom = await listMatrixSignalRooms(userId, {
    limit: 200,
    force: true,
  })
    .then((rooms) => findSignalRoomByContact(rooms, contact))
    .catch(() => null);
  if (existingRoom) {
    return {
      roomId: existingRoom.roomId,
      room: existingRoom,
      placeholder: false,
      contact,
      portal: findSignalPortalByRoomId(config, existingRoom.roomId),
    };
  }

  if (!createIfMissing) {
    return {
      roomId: normalizedRoomId,
      room: buildSignalContactRoom(contact),
      placeholder: true,
      contact,
    };
  }

  await sendBridgeTextCommand(userId, `start-chat ${contact.identifier}`).catch(
    () => null
  );
  const createdRoom = await waitForSignalContactRoom(userId, contact).catch(
    () => null
  );
  if (createdRoom?.roomId) {
    return {
      roomId: createdRoom.roomId,
      room: createdRoom,
      placeholder: false,
      contact,
      portal: findSignalPortalByRoomId(config, createdRoom.roomId),
    };
  }

  return {
    roomId: normalizedRoomId,
    room: buildSignalContactRoom(contact),
    placeholder: true,
    contact,
    portal: null,
  };
}

async function getSignalRoomTimeline(userId, roomId, { limit = 50 } = {}) {
  const resolved = await resolveSignalRoomReference(userId, roomId, {
    createIfMissing: isSignalContactRoomId(roomId),
  });
  if (resolved.placeholder) {
    return buildSignalPlaceholderTimeline(resolved.room);
  }

  const snapshot = await fetchSyncSnapshot(userId, {
    timelineLimit: Math.max(limit, 50),
    force: true,
  });
  const roomData = snapshot.data.rooms?.join?.[resolved.roomId];
  if (!roomData) {
    const descriptor = await fetchRoomDescriptorById(userId, resolved.roomId, {
      timelineLimit: Math.max(limit, 50),
      snapshot,
    });
    if (!descriptor) {
      throw new Error("Signal conversation not found.");
    }
    const room = resolved.contact
      ? applySignalContactFallbackToRoom(descriptor.room, resolved.contact)
      : applySignalPortalReadState(
          userId,
          applySignalPortalFallbackToRoom(descriptor.room, resolved.portal),
          resolved.portal
        );
    return {
      room,
      messages: hydrateSignalMessagesForRoom(
        room,
        descriptor.messages.slice(-Math.max(1, Number(limit || 50)))
      ),
      prevBatch: descriptor.room.prevBatch || null,
    };
  }

  const directMap = parseDirectMap(snapshot.data);
  const descriptor = buildRoomDescriptor({
    roomId: resolved.roomId,
    roomData,
    currentUserId: snapshot.config.mxid,
    bridgeBotMxid: snapshot.config.bridgeBotMxid,
    managementRoomId: snapshot.config.managementRoomId,
    directMap,
  });

  const room = resolved.contact
    ? applySignalContactFallbackToRoom(descriptor.room, resolved.contact)
    : applySignalPortalReadState(
        userId,
        applySignalPortalFallbackToRoom(descriptor.room, resolved.portal),
        resolved.portal
      );

  return {
    room,
    messages: hydrateSignalMessagesForRoom(
      room,
      descriptor.messages.slice(-Math.max(1, Number(limit || 50)))
    ),
    prevBatch: descriptor.room.prevBatch || null,
  };
}

async function getSignalRoomHistory(
  userId,
  roomId,
  { from = "", limit = 50 } = {}
) {
  const resolved = await resolveSignalRoomReference(userId, roomId, {
    createIfMissing: false,
  });
  if (resolved.placeholder) {
    return buildSignalPlaceholderTimeline(resolved.room);
  }

  if (!from) {
    return getSignalRoomTimeline(userId, resolved.roomId, { limit });
  }

  const snapshot = await fetchSyncSnapshot(userId, {
    timelineLimit: 1,
    force: false,
  });
  const roomData = snapshot.data.rooms?.join?.[resolved.roomId];
  if (!roomData) {
    throw new Error("Signal conversation not found.");
  }

  const response = await matrixRequestWithRefresh(
    userId,
    "GET",
    `/_matrix/client/v3/rooms/${encodeURIComponent(resolved.roomId)}/messages`,
    {
      params: {
        dir: "b",
        from,
        limit: Math.max(1, Math.min(100, Number(limit || 50))),
      },
      timeout: 20_000,
    }
  );

  const syntheticRoomData = {
    state: roomData.state || { events: [] },
    timeline: {
      events: [...(response.data?.chunk || [])].reverse(),
      prev_batch: response.data?.end || null,
    },
    summary: roomData.summary || {},
    unread_notifications: roomData.unread_notifications || {},
  };

  const directMap = parseDirectMap(snapshot.data);
  const descriptor = buildRoomDescriptor({
    roomId: resolved.roomId,
    roomData: syntheticRoomData,
    currentUserId: snapshot.config.mxid,
    bridgeBotMxid: snapshot.config.bridgeBotMxid,
    managementRoomId: snapshot.config.managementRoomId,
    directMap,
  });

  const room = resolved.contact
    ? applySignalContactFallbackToRoom(descriptor.room, resolved.contact)
    : applySignalPortalReadState(
        userId,
        applySignalPortalFallbackToRoom(descriptor.room, resolved.portal),
        resolved.portal
      );

  return {
    room,
    messages: hydrateSignalMessagesForRoom(room, descriptor.messages),
    prevBatch: response.data?.end || null,
  };
}

async function sendSignalMessage(
  userId,
  roomId,
  text,
  { replyToEventId = null } = {}
) {
  const resolved = await resolveSignalRoomReference(userId, roomId, {
    createIfMissing: true,
  });
  if (resolved.placeholder) {
    throw new Error(
      "Signal is still preparing that chat. Please wait a moment and try again."
    );
  }
  const body = String(text || "").trim();
  if (!body) throw new Error("Message text is required.");

  const content = {
    msgtype: "m.text",
    body,
  };

  if (replyToEventId) {
    content["m.relates_to"] = {
      "m.in_reply_to": {
        event_id: String(replyToEventId),
      },
    };
  }

  const response = await matrixRequestWithRefresh(
    userId,
    "PUT",
    `/_matrix/client/v3/rooms/${encodeURIComponent(
      resolved.roomId
    )}/send/m.room.message/${buildTxnId("signal-text")}`,
    { data: content }
  );

  // Sending a message implies you've read the conversation. Advance the local
  // read marker so the synthetic unread fallback in applySignalPortalReadState
  // doesn't resurrect the prior inbound message as "unread" right after you
  // send (before the bridge echoes your own message back into the timeline).
  setSignalPortalReadMarker(userId, resolved.roomId, nowTs());

  invalidateSignalCache(userId);
  return {
    ok: true,
    eventId: response.data?.event_id || null,
    roomId: resolved.roomId,
  };
}

async function uploadSignalMedia(
  userId,
  roomId,
  buffer,
  fileName,
  mimeType,
  { caption = "", replyToEventId = null } = {}
) {
  const resolved = await resolveSignalRoomReference(userId, roomId, {
    createIfMissing: true,
  });
  if (resolved.placeholder) {
    throw new Error(
      "Signal is still preparing that chat. Please wait a moment and try again."
    );
  }
  if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error("File content is required.");
  }
  const normalizedName =
    String(fileName || "attachment").trim() || "attachment";
  const normalizedMime = String(mimeType || "application/octet-stream").trim();

  const uploadResponse = await matrixRequestWithRefresh(
    userId,
    "POST",
    "/_matrix/media/v3/upload",
    {
      params: { filename: normalizedName },
      data: buffer,
      headers: { "Content-Type": normalizedMime },
      timeout: 60_000,
    }
  );

  const contentUri = uploadResponse.data?.content_uri;
  if (!contentUri) throw new Error("Signal upload failed.");

  let msgtype = "m.file";
  if (normalizedMime.startsWith("image/")) msgtype = "m.image";
  else if (normalizedMime.startsWith("video/")) msgtype = "m.video";
  else if (normalizedMime.startsWith("audio/")) msgtype = "m.audio";

  const content = {
    msgtype,
    body: normalizedName,
    filename: normalizedName,
    url: contentUri,
    info: {
      mimetype: normalizedMime,
      size: buffer.length,
    },
  };

  if (replyToEventId) {
    content["m.relates_to"] = {
      "m.in_reply_to": {
        event_id: String(replyToEventId),
      },
    };
  }

  const sendResponse = await matrixRequestWithRefresh(
    userId,
    "PUT",
    `/_matrix/client/v3/rooms/${encodeURIComponent(
      resolved.roomId
    )}/send/m.room.message/${buildTxnId("signal-media")}`,
    { data: content, timeout: 60_000 }
  );

  let captionEventId = null;
  if (String(caption || "").trim()) {
    const captionResult = await sendSignalMessage(
      userId,
      resolved.roomId,
      String(caption).trim(),
      {
        replyToEventId,
      }
    );
    captionEventId = captionResult.eventId || null;
  }

  // Sending implies reading — advance the read marker so our own upload doesn't
  // surface as a synthetic unread on the next room fetch.
  setSignalPortalReadMarker(userId, resolved.roomId, nowTs());

  invalidateSignalCache(userId);
  return {
    ok: true,
    eventId: sendResponse.data?.event_id || null,
    captionEventId,
    contentUri,
    roomId: resolved.roomId,
  };
}

async function editSignalMessage(userId, roomId, targetEventId, text) {
  const resolved = await resolveSignalRoomReference(userId, roomId, {
    createIfMissing: false,
  });
  if (resolved.placeholder) {
    throw new Error("Signal conversation not found.");
  }
  const body = String(text || "").trim();
  if (!body) throw new Error("Updated message text is required.");

  const content = {
    msgtype: "m.text",
    body: `* ${body}`,
    "m.new_content": {
      msgtype: "m.text",
      body,
    },
    "m.relates_to": {
      rel_type: "m.replace",
      event_id: String(targetEventId),
    },
  };

  const response = await matrixRequestWithRefresh(
    userId,
    "PUT",
    `/_matrix/client/v3/rooms/${encodeURIComponent(
      resolved.roomId
    )}/send/m.room.message/${buildTxnId("signal-edit")}`,
    { data: content }
  );

  invalidateSignalCache(userId);
  return {
    ok: true,
    eventId: response.data?.event_id || null,
  };
}

async function deleteSignalMessage(userId, roomId, targetEventId) {
  const resolved = await resolveSignalRoomReference(userId, roomId, {
    createIfMissing: false,
  });
  if (resolved.placeholder) {
    return {
      ok: true,
    };
  }
  const response = await matrixRequestWithRefresh(
    userId,
    "PUT",
    `/_matrix/client/v3/rooms/${encodeURIComponent(
      resolved.roomId
    )}/redact/${encodeURIComponent(targetEventId)}/${buildTxnId(
      "signal-redact"
    )}`,
    { data: { reason: "Deleted from OrionAI Signal" } }
  );

  invalidateSignalCache(userId);
  return {
    ok: true,
    eventId: response.data?.event_id || null,
  };
}

async function findOwnReactionEvent(userId, roomId, targetEventId, key) {
  const { messages } = await getSignalRoomTimeline(userId, roomId, {
    limit: 120,
  });
  const target = messages.find(
    (message) => message.id === String(targetEventId)
  );
  const match = target?.reactions?.find(
    (reaction) => reaction.key === String(key || "").trim() && reaction.byMe
  );
  return match?.eventIds?.[0] || null;
}

async function toggleSignalReaction(userId, roomId, targetEventId, key) {
  const resolved = await resolveSignalRoomReference(userId, roomId, {
    createIfMissing: false,
  });
  if (resolved.placeholder) {
    throw new Error("Signal conversation not found.");
  }
  const reactionKey = String(key || "").trim();
  if (!reactionKey) throw new Error("Reaction key is required.");

  const existingEventId = await findOwnReactionEvent(
    userId,
    resolved.roomId,
    targetEventId,
    reactionKey
  ).catch(() => null);

  if (existingEventId) {
    return deleteSignalMessage(userId, roomId, existingEventId);
  }

  const response = await matrixRequestWithRefresh(
    userId,
    "PUT",
    `/_matrix/client/v3/rooms/${encodeURIComponent(
      resolved.roomId
    )}/send/m.reaction/${buildTxnId("signal-reaction")}`,
    {
      data: {
        "m.relates_to": {
          rel_type: "m.annotation",
          event_id: String(targetEventId),
          key: reactionKey,
        },
      },
    }
  );

  invalidateSignalCache(userId);
  return {
    ok: true,
    eventId: response.data?.event_id || null,
  };
}

async function markSignalRoomAsRead(userId, roomId, eventId = "") {
  const resolved = await resolveSignalRoomReference(userId, roomId, {
    createIfMissing: false,
  });
  if (resolved.placeholder) return { ok: true };

  let targetEventId = String(eventId || "").trim();
  let targetTimestamp = 0;
  if (!targetEventId) {
    const timeline = await getSignalRoomTimeline(userId, resolved.roomId, {
      limit: 30,
    });
    const latestMessage =
      [...(timeline.messages || [])].reverse().find((message) => message?.id) ||
      null;
    targetEventId = latestMessage?.id || "";
    targetTimestamp = normalizeTimestampMs(latestMessage?.timestamp || 0);
  }
  if (!targetEventId) return { ok: true };

  await matrixRequestWithRefresh(
    userId,
    "POST",
    `/_matrix/client/v3/rooms/${encodeURIComponent(
      resolved.roomId
    )}/receipt/m.read/${encodeURIComponent(targetEventId)}`,
    { data: {} }
  );

  invalidateSignalCache(userId);
  setSignalPortalReadMarker(
    userId,
    resolved.roomId,
    targetTimestamp || nowTs()
  );
  return { ok: true };
}

async function sendBridgeCommand(userId, command) {
  return sendBridgeTextCommand(userId, command);
}

function parseMxc(mxc = "") {
  const normalized = String(mxc || "").trim();
  if (!normalized.startsWith("mxc://")) {
    throw new Error("Invalid Signal media URI.");
  }
  const remainder = normalized.replace(/^mxc:\/\//, "");
  const [serverName, mediaId] = remainder.split("/");
  if (!serverName || !mediaId) {
    throw new Error("Invalid Signal media URI.");
  }
  return { serverName, mediaId };
}

function buildSignalMediaRequestPath(
  mxc,
  { thumbnail = false, width = 640, height = 640 } = {}
) {
  const { serverName, mediaId } = parseMxc(mxc);
  if (!thumbnail) {
    return `/_matrix/client/v1/media/download/${encodeURIComponent(
      serverName
    )}/${encodeURIComponent(mediaId)}`;
  }

  const safeWidth = Math.max(1, Number(width || 640) || 640);
  const safeHeight = Math.max(1, Number(height || 640) || 640);
  return `/_matrix/client/v1/media/thumbnail/${encodeURIComponent(
    serverName
  )}/${encodeURIComponent(
    mediaId
  )}?width=${safeWidth}&height=${safeHeight}&method=scale`;
}

async function fetchSignalMedia(userId, mxc, { thumbnail = false } = {}) {
  const path = buildSignalMediaRequestPath(mxc, { thumbnail });

  const response = await matrixRequestWithRefresh(userId, "GET", path, {
    responseType: "arraybuffer",
    timeout: 60_000,
  });

  return {
    body: Buffer.from(response.data),
    contentType: response.headers["content-type"] || "application/octet-stream",
    contentDisposition: response.headers["content-disposition"] || "",
  };
}

async function getSignalUnreadSignal(userId) {
  const rooms = await listSignalRooms(userId, { limit: 80 });
  const unreadRooms = rooms
    .filter((room) => Number(room.unreadCount || 0) > 0)
    .sort((a, b) => {
      const highlightDelta =
        Number(b.highlightCount || 0) - Number(a.highlightCount || 0);
      if (highlightDelta !== 0) return highlightDelta;
      return Number(b.lastMessageTs || 0) - Number(a.lastMessageTs || 0);
    });

  const count = unreadRooms.reduce(
    (sum, room) => sum + Number(room.unreadCount || 0),
    0
  );

  return {
    app: "signal",
    count,
    previews: unreadRooms.slice(0, 3).map((room) => ({
      id: room.roomId,
      chatId: room.roomId,
      name: room.name,
      unread: room.unreadCount,
      preview: room.lastMessage || "",
      latestMessageId: room.lastEventId || null,
      latestMessageAt: room.lastMessageAt || null,
      highlight: room.highlightCount || 0,
      isDirect: room.isDirect,
    })),
    rooms: unreadRooms,
    summary:
      count > 0
        ? `${unreadRooms.length} Signal chat${
            unreadRooms.length === 1 ? "" : "s"
          } waiting`
        : null,
  };
}

module.exports = {
  defaultHomeserverUrl,
  defaultBridgeBotMxid,
  normalizeHomeserverUrl,
  normalizeMxid,
  localpartFromMxid,
  isSignalGhostMxid,
  buildSignalMediaUrl,
  getSignalIntegration,
  ensureSignalIntegration,
  ensureSignalAccess,
  connectSignalIntegration,
  getSignalStatus,
  buildSignalClientIntegration,
  listSignalRooms,
  getSignalRoomTimeline,
  getSignalRoomHistory,
  sendSignalMessage,
  uploadSignalMedia,
  editSignalMessage,
  deleteSignalMessage,
  toggleSignalReaction,
  markSignalRoomAsRead,
  sendBridgeCommand,
  getSignalBridgeLogin,
  purgeSignalBridgeLogin,
  findSignalLoginIdFromBridgeBotMessages,
  fetchSignalMedia,
  getSignalUnreadSignal,
  getWhoAmI,
  getProfile,
  findManagementRoom,
  ensureManagementRoom,
  fetchSyncSnapshot,
  waitForSignalActivity,
  invalidateSignalCache,
  invalidateSignalCacheForReconnect,
  __test: {
    stripReplyFallback,
    resolveMessageText,
    buildMediaDescriptor,
    buildSignalMediaRequestPath,
    buildSignalProfileFromBridgeLogin,
    buildSignalContactRoom,
    buildSignalPortalRoom,
    hydrateSignalMessagesForRoom,
    extractMatrixRoomIdFromText,
    collectMemberMap,
    parseRoomEvents,
    buildRoomDescriptor,
    parseDirectMap,
    isBridgeBotMessage,
    extractBridgeRoomState,
    buildSignalQrDataUrl,
    hasDeadSignalProvisioningLogin,
    shouldResumeSignalProvisioningLogin,
    resumeSignalProvisioningLogin,
  },
};
