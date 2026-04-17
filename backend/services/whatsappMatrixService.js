"use strict";

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const Database = require("better-sqlite3");
const Integration = require("../models/Integration");
const {
  findBestCommunicationMatch,
  normalizeDigits,
} = require("./communicationContactMatcher");
const {
  defaultHomeserverUrl,
  defaultMatrixDeviceName,
  normalizeHomeserverUrl,
  normalizeMxid,
  localpartFromMxid,
  ensureHiddenMatrixAccount,
  loginToMatrix,
  createMatrixError,
  matrixErrorStatus,
  isMatrixAuthFailure,
  isMatrixNotInRoomError,
  buildTxnId,
} = require("./hiddenMatrixService");

const WHATSAPP_SYNC_CACHE = new Map();
const WHATSAPP_SYNC_CACHE_TTL_MS = 10 * 1000;
const WHATSAPP_QR_CACHE = new Map();
const WHATSAPP_QR_CACHE_TTL_MS = 60 * 1000;
const WHATSAPP_BRIDGE_JOIN_BATCH_SIZE = 80;
const WHATSAPP_PORTAL_REQUEST_BACKOFF_MS = 15 * 1000;
const WHATSAPP_CONTACT_ROOM_PREFIX = "wa-contact:";
const WHATSAPP_GHOST_RE = /^@whatsapp_[^:]+:/i;
const WHATSAPP_LOGIN_STATE_VALUES = new Set([
  "disconnected",
  "creating_account",
  "logging_in",
  "pending_qr",
  "connected",
  "error",
]);
const BRIDGE_SUCCESS_RE =
  /\b(successfully logged in|logged in as|login successful|connected to whatsapp|linked successfully|already logged in|session restored)\b/i;
const BRIDGE_QR_RE =
  /\b(qr code|scan .*qr|linked devices|link a device|scan this code)\b/i;
const BRIDGE_ERROR_RE =
  /\b(error|failed|failure|timed out|timeout|unable to|could not|invalid|logged out|disconnected)\b/i;
const WHATSAPP_PORTAL_REQUESTS = new Map();
let whatsappBridgeDb = null;
let whatsappBridgeDbPath = "";

function defaultBridgeBotMxid() {
  return process.env.MATRIX_WHATSAPP_BOT_MXID || "@whatsappbot:orion.local";
}

function defaultWhatsAppDeviceName() {
  return defaultMatrixDeviceName("OrionAI WhatsApp");
}

function nowTs() {
  return Date.now();
}

const SIGNAL_GHOST_RE = /^@signal_[^:]+:/i;
const SIGNAL_BOT_RE = /^@signalbot:/i;

function isSignalGhostMxid(mxid = "") {
  return SIGNAL_GHOST_RE.test(String(mxid || "").trim());
}

function isSignalBotMxid(mxid = "") {
  return SIGNAL_BOT_RE.test(String(mxid || "").trim());
}
function buildWhatsAppMatrixUserKey(userId = "") {
  return `${String(userId || "").trim()}-whatsapp`;
}
function normalizeTimestampMs(value = 0) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (numeric > 1e15) return Math.round(numeric / 1_000_000);
  if (numeric > 1e12) return Math.round(numeric);
  if (numeric > 1e9) return Math.round(numeric * 1000);
  return Math.round(numeric);
}

function normalizeSearchValue(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function formatTimestamp(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildWhatsAppMediaUrl(mxc = "") {
  const normalized = String(mxc || "").trim();
  if (!normalized) return null;
  return `/api/whatsapp/media?mxc=${encodeURIComponent(normalized)}`;
}

function normalizeWhatsAppContactIdentifier(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.includes("@")) return normalized;
  const digits = normalizeDigits(normalized);
  if (!digits) return normalized;
  return `${digits}@s.whatsapp.net`;
}

function defaultMatrixDomain() {
  return String(process.env.MATRIX_SERVER_DOMAIN || "orion.local").trim();
}

function buildWhatsAppGhostMxid(ghostId = "") {
  const normalizedGhostId = String(ghostId || "").trim();
  if (!normalizedGhostId) return "";
  return `@whatsapp_${normalizedGhostId}:${defaultMatrixDomain()}`;
}

function buildWhatsAppContactRoomId(contactJid = "") {
  const normalizedContactJid = String(contactJid || "").trim();
  return normalizedContactJid
    ? `${WHATSAPP_CONTACT_ROOM_PREFIX}${normalizedContactJid}`
    : "";
}

function isWhatsAppContactRoomId(roomId = "") {
  return String(roomId || "")
    .trim()
    .startsWith(WHATSAPP_CONTACT_ROOM_PREFIX);
}

function parseWhatsAppContactRoomId(roomId = "") {
  if (!isWhatsAppContactRoomId(roomId)) return "";
  return String(roomId || "")
    .trim()
    .slice(WHATSAPP_CONTACT_ROOM_PREFIX.length)
    .trim();
}

function extractWhatsAppIdentifier(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const withoutResource = normalized.split(":")[0];
  return withoutResource.includes("@")
    ? withoutResource.slice(0, withoutResource.indexOf("@"))
    : withoutResource;
}

function formatWhatsAppPhone(value = "") {
  const digits = normalizeDigits(value || "");
  if (digits.length < 6) return String(value || "").trim();
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function sanitizeWhatsAppDisplayLabel(value = "") {
  return String(value || "")
    .trim()
    .replace(/^~+\s*/, "")
    .replace(/\s+\(wa\)$/i, "")
    .trim();
}

function buildWhatsAppContactDisplayName(contact = {}) {
  const displayName = [
    contact.fullName,
    contact.businessName,
    contact.pushName,
    contact.ghostName,
    contact.phoneNumber,
    contact.contactId,
  ]
    .map((value) => String(value || "").trim())
    .find(Boolean);

  return sanitizeWhatsAppDisplayLabel(displayName) || "WhatsApp contact";
}

function lidToPnJid(value = "") {
  const digits = normalizeDigits(value || "");
  return digits ? `${digits}@s.whatsapp.net` : "";
}

function getWhatsAppPortalRequestKey(userId = "", identifier = "") {
  return `${String(userId || "").trim()}:${normalizeWhatsAppContactIdentifier(
    identifier
  )}`;
}

function shouldRequestWhatsAppPortal(userId = "", identifier = "") {
  const key = getWhatsAppPortalRequestKey(userId, identifier);
  if (!key || key.endsWith(":")) return false;
  const now = nowTs();
  const lastRequestedAt = Number(WHATSAPP_PORTAL_REQUESTS.get(key) || 0) || 0;
  if (
    lastRequestedAt &&
    now - lastRequestedAt < WHATSAPP_PORTAL_REQUEST_BACKOFF_MS
  ) {
    return false;
  }
  WHATSAPP_PORTAL_REQUESTS.set(key, now);
  return true;
}

function getCachedQrImage(key = "") {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return null;
  const cached = WHATSAPP_QR_CACHE.get(normalizedKey);
  if (!cached) return null;
  if (cached.expiresAt <= nowTs()) {
    WHATSAPP_QR_CACHE.delete(normalizedKey);
    return null;
  }
  return cached.dataUrl || null;
}
async function assertWhatsAppRoom(userId, roomId) {
  const descriptor = await fetchRoomDescriptorById(userId, roomId, {
    timelineLimit: 20,
  });

  if (!descriptor || descriptor.isManagement) {
    throw new Error("Invalid WhatsApp room.");
  }

  if (!descriptor.isWhatsAppRoom) {
    const integration = await ensureWhatsAppIntegration(userId).catch(
      () => null
    );
    const config = integration ? buildConfigFromIntegration(integration) : null;
    const bridgeSnapshot = config
      ? readWhatsAppBridgeSnapshot(config.mxid)
      : null;
    if (!findWhatsAppPortalByRoomId(bridgeSnapshot, roomId)) {
      throw new Error("Invalid WhatsApp room.");
    }
  }

  return descriptor.room;
}

function cacheQrImage(key = "", dataUrl = "") {
  const normalizedKey = String(key || "").trim();
  const normalizedValue = String(dataUrl || "").trim();
  if (!normalizedKey || !normalizedValue) return normalizedValue || null;
  WHATSAPP_QR_CACHE.set(normalizedKey, {
    expiresAt: nowTs() + WHATSAPP_QR_CACHE_TTL_MS,
    dataUrl: normalizedValue,
  });
  return normalizedValue;
}

function isWhatsAppGhostMxid(mxid = "") {
  return WHATSAPP_GHOST_RE.test(String(mxid || "").trim());
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

function resolveWhatsAppBridgeDbPath() {
  const explicitPath = String(
    process.env.MAUTRIX_WHATSAPP_DB_PATH ||
      process.env.MATRIX_WHATSAPP_BRIDGE_DB_PATH ||
      ""
  ).trim();
  if (explicitPath) return path.resolve(explicitPath);
  return path.resolve(
    __dirname,
    "../../infra/mautrix-whatsapp/mautrix-whatsapp.db"
  );
}

function getWhatsAppBridgeDb() {
  const nextPath = resolveWhatsAppBridgeDbPath();
  if (!nextPath || !fs.existsSync(nextPath)) return null;

  if (whatsappBridgeDb && whatsappBridgeDbPath === nextPath) {
    return whatsappBridgeDb;
  }

  if (whatsappBridgeDb) {
    try {
      whatsappBridgeDb.close();
    } catch {}
    whatsappBridgeDb = null;
    whatsappBridgeDbPath = "";
  }

  try {
    const db = new Database(nextPath, {
      readonly: true,
      fileMustExist: true,
      timeout: 2_000,
    });
    db.pragma("busy_timeout = 2000");
    whatsappBridgeDb = db;
    whatsappBridgeDbPath = nextPath;
    return whatsappBridgeDb;
  } catch {
    return null;
  }
}

function buildWhatsAppBridgeSnapshot(loginRow = null, portalRows = []) {
  if (!loginRow) return null;

  const remoteProfile = safeJsonParse(loginRow.remote_profile, {}) || {};
  const metadata = safeJsonParse(loginRow.metadata, {}) || {};
  const loggedInAtSeconds = Number(metadata.logged_in_at || 0);
  const loggedInAtTs =
    Number.isFinite(loggedInAtSeconds) && loggedInAtSeconds > 0
      ? Math.round(loggedInAtSeconds * 1000)
      : 0;

  const portalRooms = (Array.isArray(portalRows) ? portalRows : [])
    .map((row) => ({
      roomId: String(row?.room_id || "").trim(),
      portalId: String(row?.portal_id || "").trim(),
      receiver: String(row?.portal_receiver || "").trim(),
      title: String(row?.name || "").trim(),
      avatarMxc: String(row?.avatar_mxc || "").trim(),
      roomType: String(row?.room_type || "").trim(),
      inSpace: Boolean(row?.in_space),
      preferred: Boolean(row?.preferred),
    }))
    .filter((room) => room.roomId);

  return {
    loginId: String(loginRow.id || "").trim(),
    matrixMxid: String(loginRow.user_mxid || "").trim(),
    phone: String(
      remoteProfile.phone || metadata.phone || loginRow.remote_name || ""
    ).trim(),
    profileName: String(
      remoteProfile.name || metadata.name || loginRow.remote_name || ""
    ).trim(),
    spaceRoomId: String(loginRow.space_room || "").trim(),
    connected: Boolean(
      loggedInAtTs || remoteProfile.phone || remoteProfile.name
    ),
    loggedInAtTs,
    loggedInAt: loggedInAtTs ? new Date(loggedInAtTs).toISOString() : null,
    needsPortalSync: Boolean(metadata.history_sync_portals_need_creating),
    portalRooms,
  };
}

function readWhatsAppBridgeSnapshot(matrixMxid = "") {
  const normalizedMxid = normalizeMxid(matrixMxid);
  if (!normalizedMxid) return null;

  const db = getWhatsAppBridgeDb();
  if (!db) return null;

  try {
    const loginRow = db
      .prepare(
        `
          SELECT user_mxid, id, remote_name, remote_profile, space_room, metadata
          FROM user_login
          WHERE user_mxid = ?
          ORDER BY rowid DESC
          LIMIT 1
        `
      )
      .get(normalizedMxid);

    if (!loginRow) return null;

    const portalRows = db
      .prepare(
        `
          SELECT
            up.portal_id,
            up.portal_receiver,
            up.in_space,
            up.preferred,
            p.mxid AS room_id,
            p.name,
            p.avatar_mxc,
            p.room_type
          FROM user_portal up
          JOIN portal p
            ON ifnull(p.bridge_id, '') = ifnull(up.bridge_id, '')
           AND p.id = up.portal_id
           AND p.receiver = up.portal_receiver
          WHERE up.user_mxid = ?
            AND up.login_id = ?
          ORDER BY ifnull(up.preferred, 0) DESC, ifnull(p.name, ''), p.id
        `
      )
      .all(normalizedMxid, String(loginRow.id || "").trim());

    return buildWhatsAppBridgeSnapshot(loginRow, portalRows);
  } catch {
    return null;
  }
}

function buildWhatsAppBridgePortalMap(bridgeSnapshot = null) {
  const portalMap = new Map();
  const portalRooms = Array.isArray(bridgeSnapshot?.portalRooms)
    ? bridgeSnapshot.portalRooms
    : [];

  for (const portal of portalRooms) {
    const roomId = String(portal?.roomId || "").trim();
    const portalId = normalizeWhatsAppContactIdentifier(portal?.portalId);
    if (roomId) {
      portalMap.set(roomId, portal);
    }
    if (portalId) {
      portalMap.set(portalId, portal);
    }
  }

  return portalMap;
}

function findWhatsAppPortalByRoomId(bridgeSnapshot = null, roomId = "") {
  const targetRoomId = String(roomId || "").trim();
  if (!targetRoomId) return null;

  return (
    (Array.isArray(bridgeSnapshot?.portalRooms)
      ? bridgeSnapshot.portalRooms
      : []
    ).find((portal) => String(portal?.roomId || "").trim() === targetRoomId) ||
    null
  );
}

function buildWhatsAppBridgeContactMap(bridgeContacts = []) {
  const contactMap = new Map();

  for (const contact of Array.isArray(bridgeContacts) ? bridgeContacts : []) {
    const contactJid = String(contact?.contactJid || "").trim();
    const canonicalContactJid = String(
      contact?.canonicalContactJid || contactJid
    ).trim();
    const roomId = String(contact?.roomId || "").trim();

    if (contactJid) {
      contactMap.set(contactJid, contact);
    }
    if (canonicalContactJid) {
      contactMap.set(canonicalContactJid, contact);
    }
    if (roomId) {
      contactMap.set(roomId, contact);
    }
  }

  return contactMap;
}

function readWhatsAppLidMap() {
  const db = getWhatsAppBridgeDb();
  if (!db) return new Map();

  try {
    return new Map(
      db
        .prepare(
          `
            SELECT lid, pn
            FROM whatsmeow_lid_map
          `
        )
        .all()
        .map((row) => [
          String(row?.lid || "").trim(),
          String(row?.pn || "").trim(),
        ])
        .filter(([lid, pn]) => lid && pn)
    );
  } catch {
    return new Map();
  }
}

function canonicalizeWhatsAppContactJid(contactJid = "", lidMap = null) {
  const normalized = normalizeWhatsAppContactIdentifier(contactJid);
  if (!normalized.endsWith("@lid")) return normalized;

  const lid = extractWhatsAppIdentifier(normalized);
  const mappedPhone = String(
    lidMap instanceof Map ? lidMap.get(lid) : ""
  ).trim();
  return lidToPnJid(mappedPhone) || normalized;
}

function buildWhatsAppContactKey(contact = {}, lidMap = null) {
  const canonicalJid = canonicalizeWhatsAppContactJid(
    contact.canonicalContactJid || contact.contactJid || contact.roomId || "",
    lidMap
  );
  if (canonicalJid) return canonicalJid;

  const digits = normalizeDigits(contact.phoneNumber || "");
  if (digits) return digits;

  return String(contact.contactMxid || contact.roomId || "").trim();
}

function buildWhatsAppChatKey(chat = {}, lidMap = null) {
  const roomId = String(chat.roomId || chat.id || "").trim();
  if (chat.isGroup && roomId) {
    return `room:${roomId}`;
  }

  const contactKey = buildWhatsAppContactKey(chat, lidMap);
  if (contactKey) {
    return `direct:${contactKey}`;
  }

  return roomId ? `room:${roomId}` : "";
}

function pickBetterWhatsAppContact(left = null, right = null) {
  if (!left) return right || null;
  if (!right) return left || null;

  const score = (contact) => {
    let value = 0;
    if (contact.bridgeStatus === "portal") value += 8;
    if (String(contact.fullName || "").trim()) value += 4;
    if (String(contact.pushName || "").trim()) value += 3;
    if (String(contact.businessName || "").trim()) value += 3;
    if (String(contact.phoneNumber || "").trim()) value += 2;
    if (String(contact.avatarMxc || contact.avatarUrl || "").trim()) value += 2;
    if (String(contact.contactJid || "").includes("@s.whatsapp.net"))
      value += 1;
    return value;
  };

  return score(right) > score(left) ? right : left;
}

function resolveBridgeDeviceJid(loginRow = null, db = null) {
  const phoneDigits = normalizeDigits(
    loginRow?.remote_name ||
      safeJsonParse(loginRow?.remote_profile, {})?.phone ||
      ""
  );
  if (!phoneDigits || !db) return "";

  const exact = db
    .prepare(
      `
        SELECT jid
        FROM whatsmeow_device
        WHERE jid LIKE ?
        ORDER BY rowid DESC
        LIMIT 1
      `
    )
    .get(`${phoneDigits}:%`);

  return String(exact?.jid || "").trim();
}

function readWhatsAppBridgeContacts(matrixMxid = "", bridgeSnapshot = null) {
  const normalizedMxid = normalizeMxid(matrixMxid);
  if (!normalizedMxid) return [];

  const db = getWhatsAppBridgeDb();
  if (!db) return [];
  const lidMap = readWhatsAppLidMap();

  try {
    const loginRow = db
      .prepare(
        `
          SELECT user_mxid, id, remote_name, remote_profile, space_room, metadata
          FROM user_login
          WHERE user_mxid = ?
          ORDER BY rowid DESC
          LIMIT 1
        `
      )
      .get(normalizedMxid);

    if (!loginRow) return [];

    const ourJid = resolveBridgeDeviceJid(loginRow, db);
    if (!ourJid) return [];

    const portalMap = buildWhatsAppBridgePortalMap(
      bridgeSnapshot || buildWhatsAppBridgeSnapshot(loginRow, [])
    );

    const rows = db
      .prepare(
        `
          SELECT
            c.their_jid,
            c.full_name,
            c.push_name,
            c.business_name,
            c.redacted_phone,
            g.id AS ghost_id,
            g.name AS ghost_name,
            g.avatar_mxc AS ghost_avatar_mxc
          FROM whatsmeow_contacts c
          LEFT JOIN ghost g
            ON g.id = CASE
              WHEN instr(c.their_jid, '@') > 0
                THEN substr(c.their_jid, 1, instr(c.their_jid, '@') - 1)
              ELSE c.their_jid
            END
          WHERE c.our_jid = ?
          ORDER BY lower(coalesce(nullif(c.full_name, ''), nullif(c.business_name, ''), nullif(c.push_name, ''), c.their_jid))
        `
      )
      .all(ourJid);

    const contacts = rows
      .map((row) => {
        const rawContactJid = String(row?.their_jid || "").trim();
        const canonicalContactJid = canonicalizeWhatsAppContactJid(
          rawContactJid,
          lidMap
        );
        const contactJid = canonicalContactJid || rawContactJid;
        const contactId = extractWhatsAppIdentifier(contactJid);
        const phoneNumber = formatWhatsAppPhone(
          contactId || row?.redacted_phone || ""
        );
        const bridgePortal =
          portalMap.get(contactJid) || portalMap.get(rawContactJid) || null;
        const avatarMxc = String(
          row?.ghost_avatar_mxc || bridgePortal?.avatarMxc || ""
        ).trim();

        const contact = {
          contactId,
          contactJid,
          canonicalContactJid: contactJid,
          rawContactJid,
          fullName: String(row?.full_name || "").trim(),
          pushName: String(row?.push_name || "").trim(),
          businessName: String(row?.business_name || "").trim(),
          ghostId: String(row?.ghost_id || contactId).trim(),
          ghostName: String(row?.ghost_name || "").trim(),
          phoneNumber,
          avatarMxc: avatarMxc || null,
          avatarUrl: buildWhatsAppMediaUrl(avatarMxc || ""),
          roomId:
            String(bridgePortal?.roomId || "").trim() ||
            buildWhatsAppContactRoomId(contactJid),
          bridgeStatus: bridgePortal?.roomId ? "portal" : "contact",
          contactMxid: buildWhatsAppGhostMxid(
            String(row?.ghost_id || contactId || "").trim()
          ),
        };

        return {
          ...contact,
          title: buildWhatsAppContactDisplayName(contact),
          name: buildWhatsAppContactDisplayName(contact),
          isGroup: false,
          isDirect: true,
          isPlaceholder: !bridgePortal?.roomId,
          unreadCount: 0,
          highlightCount: 0,
          lastMessage: "",
          lastMessagePreview: "",
          lastMessageAt: null,
          lastMessageTs: 0,
          lastSender: "",
          memberCount: 2,
          source: "whatsapp",
          isPinned: false,
          isMuted: false,
        };
      })
      .filter((contact) => contact.contactJid && contact.title);

    const dedupedContacts = contacts.reduce((accumulator, contact) => {
      const key = buildWhatsAppContactKey(contact, lidMap);
      if (!key) return accumulator;
      const existing = accumulator.get(key) || null;
      accumulator.set(key, pickBetterWhatsAppContact(existing, contact));
      return accumulator;
    }, new Map());

    return Array.from(dedupedContacts.values());
  } catch {
    return [];
  }
}

function mergeRoomWithBridgePortalMetadata(room = {}, bridgePortal = null) {
  if (!bridgePortal) return room;

  const title =
    sanitizeWhatsAppDisplayLabel(bridgePortal.title || "") ||
    sanitizeWhatsAppDisplayLabel(room.title || room.name || room.roomId || "");
  const roomType = String(bridgePortal.roomType || "")
    .trim()
    .toLowerCase();
  const isDirect = roomType ? roomType === "dm" : Boolean(room.isDirect);
  const avatarMxc = room.avatarMxc || bridgePortal.avatarMxc || null;
  const contactJid = String(
    bridgePortal.portalId || bridgePortal.id || ""
  ).trim();
  const phoneNumber = formatWhatsAppPhone(
    extractWhatsAppIdentifier(contactJid)
  );

  return {
    ...room,
    title,
    name: title,
    avatarMxc,
    avatarUrl:
      room.avatarUrl || buildWhatsAppMediaUrl(bridgePortal.avatarMxc || ""),
    isDirect,
    isGroup: roomType ? roomType !== "dm" : Boolean(room.isGroup),
    phoneNumber: room.phoneNumber || phoneNumber || "",
    contactJid: room.contactJid || contactJid || "",
    canonicalContactJid:
      room.canonicalContactJid ||
      normalizeWhatsAppContactIdentifier(contactJid) ||
      "",
    contactMxid:
      room.contactMxid ||
      buildWhatsAppGhostMxid(extractWhatsAppIdentifier(contactJid)) ||
      "",
    bridgeStatus: "portal",
  };
}

function mergeRoomWithBridgeContactMetadata(room = {}, bridgeContact = null) {
  if (!bridgeContact) return room;

  const title =
    sanitizeWhatsAppDisplayLabel(
      bridgeContact.title || bridgeContact.name || ""
    ) ||
    sanitizeWhatsAppDisplayLabel(room.title || room.name || room.roomId || "");
  const phoneNumber =
    String(bridgeContact.phoneNumber || room.phoneNumber || "").trim() || "";
  const avatarUrl =
    room.avatarUrl ||
    buildWhatsAppMediaUrl(bridgeContact.avatarMxc || "") ||
    bridgeContact.avatarUrl ||
    "";

  return {
    ...room,
    title,
    name: title,
    avatarMxc: room.avatarMxc || bridgeContact.avatarMxc || null,
    avatarUrl,
    phoneNumber,
    contactJid: bridgeContact.contactJid || room.contactJid || "",
    canonicalContactJid:
      bridgeContact.canonicalContactJid || room.canonicalContactJid || "",
    contactMxid: bridgeContact.contactMxid || room.contactMxid || "",
    bridgeStatus: isWhatsAppContactRoomId(room.roomId)
      ? bridgeContact.bridgeStatus || "contact"
      : "portal",
    fullName: bridgeContact.fullName || room.fullName || "",
    pushName: bridgeContact.pushName || room.pushName || "",
    businessName: bridgeContact.businessName || room.businessName || "",
  };
}

function buildWhatsAppPortalRoom(portal = {}, bridgeContact = null) {
  const roomId = String(portal?.roomId || "").trim();
  if (!roomId) return null;

  const roomType = String(portal?.roomType || "")
    .trim()
    .toLowerCase();
  const isDirect = roomType
    ? roomType === "dm"
    : !Boolean(bridgeContact?.isGroup);
  const baseRoom = {
    roomId,
    id: roomId,
    title:
      sanitizeWhatsAppDisplayLabel(
        portal?.title || bridgeContact?.title || bridgeContact?.name || ""
      ) || roomId,
    name:
      sanitizeWhatsAppDisplayLabel(
        portal?.title || bridgeContact?.title || bridgeContact?.name || ""
      ) || roomId,
    avatarMxc:
      String(portal?.avatarMxc || bridgeContact?.avatarMxc || "").trim() ||
      null,
    avatarUrl: buildWhatsAppMediaUrl(
      portal?.avatarMxc || bridgeContact?.avatarMxc || ""
    ),
    isDirect,
    isGroup: roomType ? roomType !== "dm" : Boolean(bridgeContact?.isGroup),
    memberCount: isDirect ? 2 : Number(bridgeContact?.memberCount || 0) || 0,
    unreadCount: 0,
    highlightCount: 0,
    lastMessage: "",
    lastSender: "",
    lastMessageFromMe: false,
    lastMessageAt: null,
    lastMessageTs: 0,
    prevBatch: null,
    source: "whatsapp",
    isPinned: false,
    isMuted: false,
    lastMessagePreview: "",
    lastEventId: null,
    latestMessageId: null,
    typingUsers: [],
    bridgeStatus: "portal",
  };

  return mergeRoomWithBridgeContactMetadata(
    mergeRoomWithBridgePortalMetadata(baseRoom, portal),
    bridgeContact
  );
}

function mergeResolvedWhatsAppRoomMetadata(
  room = {},
  resolvedRoom = {},
  bridgeContact = null
) {
  const syntheticPortal =
    resolvedRoom?.bridgeStatus === "portal"
      ? {
          roomId: resolvedRoom.roomId || resolvedRoom.id || room.roomId || "",
          title: resolvedRoom.title || resolvedRoom.name || room.title || "",
          portalId:
            resolvedRoom.contactJid ||
            resolvedRoom.canonicalContactJid ||
            room.contactJid ||
            "",
          avatarMxc:
            resolvedRoom.avatarMxc ||
            bridgeContact?.avatarMxc ||
            room.avatarMxc,
          roomType:
            resolvedRoom.isGroup === true
              ? "group"
              : resolvedRoom.isGroup === false
              ? "dm"
              : room.isGroup
              ? "group"
              : "dm",
        }
      : null;

  return mergeRoomWithBridgeContactMetadata(
    mergeRoomWithBridgePortalMetadata(
      {
        ...room,
        phoneNumber: room.phoneNumber || resolvedRoom.phoneNumber || "",
        contactJid:
          room.contactJid ||
          resolvedRoom.contactJid ||
          resolvedRoom.canonicalContactJid ||
          "",
        canonicalContactJid:
          room.canonicalContactJid ||
          resolvedRoom.canonicalContactJid ||
          resolvedRoom.contactJid ||
          "",
        contactMxid: room.contactMxid || resolvedRoom.contactMxid || "",
      },
      syntheticPortal
    ),
    bridgeContact || resolvedRoom
  );
}

function deriveWhatsAppConnectionState({
  fallbackConfig = {},
  bridgeState = {},
  bridgeSnapshot = null,
}) {
  let loginState = normalizeLoginState(
    bridgeState.loginState,
    fallbackConfig.loginState
  );
  const latestConnectedTs = Math.max(
    normalizeTimestampMs(bridgeState.latestConnected?.timestamp || 0),
    normalizeTimestampMs(bridgeSnapshot?.loggedInAtTs || 0)
  );
  const latestQrTs = Math.max(
    normalizeTimestampMs(bridgeState.latestQr?.timestamp || 0),
    normalizeTimestampMs(bridgeState.latestQrImage?.timestamp || 0),
    normalizeTimestampMs(bridgeState.latestQrText?.timestamp || 0)
  );
  const latestErrorTs = normalizeTimestampMs(
    bridgeState.latestError?.timestamp || 0
  );
  const lastErrorText = String(bridgeState.lastErrorText || "").trim();
  const bridgeSnapshotConnected = Boolean(
    bridgeSnapshot?.connected ||
      bridgeSnapshot?.loggedInAtTs ||
      bridgeSnapshot?.phone ||
      bridgeSnapshot?.profileName
  );
  const hasRetryableLoginTimeout =
    /\b(timed out|timeout)\b/i.test(lastErrorText) &&
    /\b(login failed|entering code|scan|qr)\b/i.test(lastErrorText);
  const hasFreshError =
    latestErrorTs > 0 &&
    latestErrorTs >= latestConnectedTs &&
    latestErrorTs >= latestQrTs;
  const hasFreshQr =
    latestQrTs > 0 &&
    latestQrTs > latestConnectedTs &&
    latestQrTs >= latestErrorTs;
  const hasFreshConnection =
    latestConnectedTs > 0 &&
    latestConnectedTs >= latestQrTs &&
    latestConnectedTs >= latestErrorTs;

  let connectedAt =
    fallbackConfig.connectedAt ||
    bridgeState.latestConnectedAt ||
    bridgeSnapshot?.loggedInAt ||
    null;
  let lastError =
    loginState === "error"
      ? lastErrorText || fallbackConfig.lastError || ""
      : "";
  let connected = false;

  if (hasFreshError && !(bridgeSnapshotConnected && hasRetryableLoginTimeout)) {
    loginState = "error";
    lastError = lastErrorText || fallbackConfig.lastError || "";
    connected = false;
  } else if (
    hasFreshConnection ||
    (bridgeSnapshotConnected && !hasFreshQr) ||
    (fallbackConfig.connectedAt && !hasFreshQr && loginState !== "error")
  ) {
    connected = true;
    loginState = "connected";
    connectedAt = connectedAt || new Date(latestConnectedTs || nowTs());
    lastError = "";
  } else if (hasFreshQr && loginState !== "logging_in") {
    loginState = "pending_qr";
    lastError = "";
  }

  return {
    connected,
    loginState,
    lastError,
    connectedAt,
    latestConnectedTs,
    latestQrTs,
    latestErrorTs,
  };
}

function stripReplyFallback(body = "", hasReplyRelation = false) {
  const text = String(body || "");
  if (!hasReplyRelation) return text.trim();
  const split = text.split(/\n\n/);
  return (split.length > 1 ? split.slice(1).join("\n\n") : text).trim();
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

function isInternalWhatsAppBridgeCommandMessage(message = {}) {
  if (!message?.fromMe) return false;
  const text = String(message.text || message.previewText || "")
    .trim()
    .toLowerCase();
  if (!text) return false;
  return /^login qr$/i.test(text) || /^start-chat\s+\S+$/i.test(text);
}

function buildMediaDescriptor(content = {}) {
  const msgtype = String(content.msgtype || "");
  const url = content.url || null;
  if (!url && msgtype !== "m.location" && !content.geo_uri) return null;

  let type = "file";
  if (msgtype === "m.image" || content.info?.thumbnail_url) type = "image";
  else if (msgtype === "m.video") type = "video";
  else if (msgtype === "m.audio") type = "audio";
  else if (
    msgtype === "m.file" &&
    String(content.info?.mimetype || "")
      .trim()
      .toLowerCase()
      .startsWith("audio/")
  ) {
    type = "audio";
  } else if (msgtype === "m.location") type = "location";

  return {
    type,
    mxc: url,
    url: buildWhatsAppMediaUrl(url),
    thumbnailMxc: content.info?.thumbnail_url || null,
    thumbnailUrl: buildWhatsAppMediaUrl(content.info?.thumbnail_url || ""),
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
  const explicitName =
    stateEvents.find((event) => event.type === "m.room.name")?.content?.name ||
    "";
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
          ? "WhatsApp Bridge"
          : localpartFromMxid(normalizedSender)) ||
        fallbackRoomName ||
        "WhatsApp",
      senderAvatarUrl: buildWhatsAppMediaUrl(senderMeta?.avatarMxc || ""),
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

function extractMatrixReadReceipts(roomData = {}) {
  const latestReceipts = new Map();

  for (const event of roomData.ephemeral?.events || []) {
    if (event?.type !== "m.receipt" || !event?.content) continue;

    for (const [eventId, receiptTypes] of Object.entries(event.content || {})) {
      const readReceipts = receiptTypes?.["m.read"] || {};
      for (const [userId, data] of Object.entries(readReceipts)) {
        const timestamp = normalizeTimestampMs(data?.ts || 0);
        const existing = latestReceipts.get(String(userId)) || null;
        if (!existing || timestamp >= existing.timestamp) {
          latestReceipts.set(String(userId), {
            eventId: String(eventId || "").trim(),
            timestamp,
          });
        }
      }
    }
  }

  return latestReceipts;
}

function applyDeliveryStateToMessages(
  messages = [],
  roomData = {},
  currentUserId = "",
  bridgeBotMxid = ""
) {
  if (!Array.isArray(messages) || !messages.length) return [];

  const latestReceipts = extractMatrixReadReceipts(roomData);
  if (!latestReceipts.size) {
    return messages.map((message) =>
      message?.fromMe
        ? {
            ...message,
            deliveryState: "sent",
            deliveryLabel: "Sent",
            readByCount: 0,
          }
        : message
    );
  }

  const indexByEventId = new Map(
    messages
      .filter((message) => message?.id)
      .map((message, index) => [String(message.id), index])
  );
  const receiptIndexes = [...latestReceipts.entries()]
    .filter(
      ([userId]) =>
        userId &&
        userId !== String(currentUserId || "") &&
        userId !== String(bridgeBotMxid || "")
    )
    .map(([userId, receipt]) => ({
      userId,
      index: indexByEventId.get(String(receipt?.eventId || "")),
    }))
    .filter((receipt) => Number.isInteger(receipt.index));

  if (!receiptIndexes.length) {
    return messages.map((message) =>
      message?.fromMe
        ? {
            ...message,
            deliveryState: "sent",
            deliveryLabel: "Sent",
            readByCount: 0,
          }
        : message
    );
  }

  return messages.map((message, index) => {
    if (!message?.fromMe) return message;
    const readByCount = receiptIndexes.filter(
      (receipt) => receipt.index >= index
    ).length;
    return {
      ...message,
      deliveryState: readByCount > 0 ? "read" : "sent",
      deliveryLabel:
        readByCount > 1
          ? `Read by ${readByCount}`
          : readByCount
          ? "Read"
          : "Sent",
      readByCount,
    };
  });
}

function extractTypingUsers(
  roomData = {},
  memberMap = new Map(),
  currentUserId = "",
  bridgeBotMxid = ""
) {
  const typingUsers = new Set();

  for (const event of roomData.ephemeral?.events || []) {
    if (event?.type !== "m.typing") continue;
    for (const userId of event?.content?.user_ids || []) {
      const normalizedUserId = String(userId || "").trim();
      if (
        !normalizedUserId ||
        normalizedUserId === String(currentUserId || "") ||
        normalizedUserId === String(bridgeBotMxid || "")
      ) {
        continue;
      }
      typingUsers.add(normalizedUserId);
    }
  }

  return [...typingUsers].map((userId) => {
    const senderMeta = memberMap.get(userId) || null;
    return {
      mxid: userId,
      displayName:
        String(senderMeta?.displayName || "").trim() ||
        localpartFromMxid(userId),
    };
  });
}

function buildRoomDescriptor({
  roomId,
  roomData = {},
  currentUserId = "",
  bridgeBotMxid = "",
  managementRoomId = "",
  directMap = new Map(),
}) {
  const memberMap = collectMemberMap(roomData);
  const memberIds = [...memberMap.keys()];

  const roomName = getRoomName(
    roomId,
    roomData,
    memberMap,
    currentUserId,
    bridgeBotMxid
  );
  const roomNameLower = String(roomName || "").toLowerCase();

  const containsWhatsAppGhost = memberIds.some((mxid) =>
    isWhatsAppGhostMxid(mxid)
  );
  const containsSignalGhost = memberIds.some((mxid) => isSignalGhostMxid(mxid));
  const containsWhatsAppBot = memberIds.includes(bridgeBotMxid);
  const containsSignalBot = memberIds.some((mxid) => isSignalBotMxid(mxid));
  const memberCount = getRoomMemberCount(roomData, memberMap);

  const isForeignBridgeRoom =
    containsSignalGhost ||
    containsSignalBot ||
    roomNameLower.includes("signal bridge bot");

  const isManagement =
    !isForeignBridgeRoom &&
    containsWhatsAppBot &&
    !containsWhatsAppGhost &&
    !containsSignalGhost &&
    (roomNameLower.includes("whatsapp bridge") || memberCount <= 2);

  const isWhatsAppPortalRoom = containsWhatsAppGhost;

  const isWhatsAppRoom =
    !isForeignBridgeRoom && (isWhatsAppPortalRoom || isManagement);

  const roomAvatar = getRoomAvatar(
    roomData,
    memberMap,
    currentUserId,
    bridgeBotMxid
  );

  const isDirect =
    directMap.get(String(roomId)) === true ||
    (!isManagement && memberCount <= 2 && containsWhatsAppGhost);

  const messages = applyDeliveryStateToMessages(
    parseRoomEvents({
      roomId,
      roomData,
      currentUserId,
      fallbackRoomName: roomName,
      bridgeBotMxid,
    }),
    roomData,
    currentUserId,
    bridgeBotMxid
  ).filter((message) => !isInternalWhatsAppBridgeCommandMessage(message));
  const typingUsers = extractTypingUsers(
    roomData,
    memberMap,
    currentUserId,
    bridgeBotMxid
  );

  const lastMessage = [...messages]
    .reverse()
    .find((message) => !message.deleted || message.previewText);

  return {
    isWhatsAppRoom,
    isManagement,
    room: {
      roomId: String(roomId),
      id: String(roomId),
      title: roomName,
      name: roomName,
      avatarMxc: roomAvatar || null,
      avatarUrl: buildWhatsAppMediaUrl(roomAvatar || ""),
      isDirect,
      isGroup: !isDirect && !isManagement,
      memberCount,
      unreadCount:
        Number(roomData.unread_notifications?.notification_count || 0) || 0,
      highlightCount:
        Number(roomData.unread_notifications?.highlight_count || 0) || 0,
      lastMessage: lastMessage?.previewText || "",
      lastSender: lastMessage?.senderName || "",
      lastMessageFromMe: Boolean(lastMessage?.fromMe),
      lastMessageAt: lastMessage?.isoTimestamp || null,
      lastMessageTs: lastMessage?.timestamp || 0,
      prevBatch: roomData.timeline?.prev_batch || null,
      source: "whatsapp",
      isPinned: false,
      isMuted: false,
      lastMessagePreview: lastMessage?.previewText || "",
      lastEventId: lastMessage?.eventId || null,
      latestMessageId: lastMessage?.eventId || null,
      typingUsers,
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

async function getWhatsAppIntegration(userId) {
  return Integration.findOne({ userId, type: "whatsapp" });
}

async function ensureWhatsAppIntegration(userId) {
  const integration = await getWhatsAppIntegration(userId);
  if (!integration) {
    throw new Error(
      "WhatsApp is not connected yet. Go to Settings → Integrations → WhatsApp."
    );
  }
  return integration;
}

function buildDefaultMatrixState(userId = "") {
  const matrixUserKey = buildWhatsAppMatrixUserKey(userId);

  return {
    homeserverUrl: normalizeHomeserverUrl(defaultHomeserverUrl()),
    mxid: normalizeMxid(
      require("./hiddenMatrixService").buildHiddenMxid(matrixUserKey)
    ),
    accessToken: "",
    deviceId: "",
    managementRoomId: "",
    bridgeBotMxid: normalizeMxid(defaultBridgeBotMxid()),
    loginState: "disconnected",
    lastError: "",
    connectedAt: null,
  };
}

function normalizeLoginState(value = "", fallback = "disconnected") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (WHATSAPP_LOGIN_STATE_VALUES.has(normalized)) return normalized;
  return fallback;
}

function buildConfigFromIntegration(integration = {}) {
  const matrix = integration.matrix?.toObject
    ? integration.matrix.toObject()
    : integration.matrix || {};
  const whatsapp = integration.whatsapp?.toObject
    ? integration.whatsapp.toObject()
    : integration.whatsapp || {};
  const defaults = buildDefaultMatrixState(integration.userId || "");

  return {
    userId: integration.userId,
    homeserverUrl: normalizeHomeserverUrl(
      matrix.homeserverUrl || defaults.homeserverUrl
    ),
    mxid: normalizeMxid(matrix.mxid || defaults.mxid),
    password: require("./hiddenMatrixService").buildHiddenPassword(
      buildWhatsAppMatrixUserKey(integration.userId || ""),
      "orion-hidden-matrix-whatsapp"
    ),
    accessToken: String(matrix.accessToken || "").trim(),
    deviceId: String(matrix.deviceId || "").trim(),
    deviceDisplayName: defaultWhatsAppDeviceName(),
    bridgeBotMxid: normalizeMxid(
      matrix.bridgeBotMxid || defaults.bridgeBotMxid
    ),
    managementRoomId: String(matrix.managementRoomId || "").trim(),
    loginState: normalizeLoginState(
      matrix.loginState,
      matrix.connectedAt || whatsapp.connected
        ? "connected"
        : defaults.loginState
    ),
    lastError: String(matrix.lastError || "").trim(),
    connectedAt: matrix.connectedAt || null,
    transport: integration.transport || "mautrix",
    connected: Boolean(whatsapp.connected),
    phone: String(whatsapp.phone || "").trim(),
    profileName: String(whatsapp.profileName || "").trim(),
    avatarUrl: String(whatsapp.avatarUrl || "").trim(),
  };
}

function buildWhatsAppClientIntegration(integration = {}) {
  const config = buildConfigFromIntegration(integration);
  return {
    _id: integration?._id || undefined,
    id: integration?.id || integration?._id || undefined,
    userId: integration?.userId,
    type: "whatsapp",
    name: integration?.name || "WhatsApp",
    enabled: integration?.enabled !== false,
    transport: "mautrix",
    connected: config.loginState === "connected",
    matrix: {
      loginState: config.loginState,
      lastError: config.lastError,
      connectedAt: config.connectedAt || null,
    },
    whatsapp: {
      connected: config.loginState === "connected",
      phone: config.phone || "",
      profileName: config.profileName || "",
      avatarUrl: config.avatarUrl || "",
    },
    lastTestedAt: integration?.lastTestedAt || null,
    lastTestOk: integration?.lastTestOk,
    createdAt: integration?.createdAt || null,
    updatedAt: integration?.updatedAt || null,
  };
}

async function saveWhatsAppIntegration(
  userId,
  matrixData = {},
  whatsappData = {},
  options = {}
) {
  const current = await getWhatsAppIntegration(userId);
  const currentConfig = current
    ? buildConfigFromIntegration(current)
    : {
        userId,
        ...buildDefaultMatrixState(userId),
        password: require("./hiddenMatrixService").buildHiddenPassword(
          buildWhatsAppMatrixUserKey(userId),
          "orion-hidden-matrix-whatsapp"
        ),
        deviceDisplayName: defaultWhatsAppDeviceName(),
        transport: "mautrix",
        connected: false,
        phone: "",
        profileName: "",
        avatarUrl: "",
      };

  const nextMatrix = {
    homeserverUrl: normalizeHomeserverUrl(
      matrixData.homeserverUrl ||
        currentConfig.homeserverUrl ||
        defaultHomeserverUrl()
    ),
    mxid: normalizeMxid(
      matrixData.mxid ||
        currentConfig.mxid ||
        buildDefaultMatrixState(userId).mxid
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
    loginState: normalizeLoginState(
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

  const nextWhatsApp = {
    connected:
      whatsappData.connected !== undefined
        ? Boolean(whatsappData.connected)
        : Boolean(currentConfig.connected),
    phone: String(
      whatsappData.phone !== undefined
        ? whatsappData.phone
        : currentConfig.phone || ""
    ).trim(),
    profileName: String(
      whatsappData.profileName !== undefined
        ? whatsappData.profileName
        : currentConfig.profileName || ""
    ).trim(),
    avatarUrl: String(
      whatsappData.avatarUrl !== undefined
        ? whatsappData.avatarUrl
        : currentConfig.avatarUrl || ""
    ).trim(),
  };

  return Integration.findOneAndUpdate(
    { userId, type: "whatsapp" },
    {
      $set: {
        userId,
        type: "whatsapp",
        name: "WhatsApp",
        enabled: options.enabled !== false,
        transport: "mautrix",
        matrix: nextMatrix,
        whatsapp: nextWhatsApp,
        updatedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
}

async function ensureHiddenWhatsAppAccount(
  userId,
  { forceResetPassword = false } = {}
) {
  const matrixUserKey = buildWhatsAppMatrixUserKey(userId);

  const account = await ensureHiddenMatrixAccount(matrixUserKey, {
    displayName: "OrionAI WhatsApp",
    forceResetPassword,
    passwordNamespace: "orion-hidden-matrix-whatsapp",
  });

  return {
    ...account,
    bridgeBotMxid: normalizeMxid(defaultBridgeBotMxid()),
  };
}

async function loginHiddenMatrixAccount(userId) {
  const hiddenAccount = await ensureHiddenWhatsAppAccount(userId);

  try {
    const login = await loginToMatrix({
      homeserverUrl: hiddenAccount.homeserverUrl,
      mxid: hiddenAccount.mxid,
      password: hiddenAccount.password,
      deviceDisplayName: defaultWhatsAppDeviceName(),
    });
    return { hiddenAccount, login };
  } catch (error) {
    if (!isMatrixAuthFailure(error)) {
      throw error;
    }

    const resetAccount = await ensureHiddenWhatsAppAccount(userId, {
      forceResetPassword: true,
    });
    const login = await loginToMatrix({
      homeserverUrl: resetAccount.homeserverUrl,
      mxid: resetAccount.mxid,
      password: resetAccount.password,
      deviceDisplayName: defaultWhatsAppDeviceName(),
    });
    return { hiddenAccount: resetAccount, login };
  }
}

async function matrixRequest(config, method, path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (config.accessToken) {
    headers.Authorization = `Bearer ${config.accessToken}`;
  }
  return axios({
    method,
    url: `${config.homeserverUrl}${path}`,
    params: options.params,
    data: options.data,
    headers,
    responseType: options.responseType || "json",
    timeout: options.timeout || 20_000,
    validateStatus: options.validateStatus,
  });
}

async function ensureWhatsAppAccess(userId, { forceLogin = false } = {}) {
  const integration = await ensureWhatsAppIntegration(userId);
  let config = buildConfigFromIntegration(integration);
  if (!forceLogin && config.accessToken) {
    return { integration, config };
  }

  const { hiddenAccount, login } = await loginHiddenMatrixAccount(userId);
  const saved = await saveWhatsAppIntegration(
    userId,
    {
      homeserverUrl: hiddenAccount.homeserverUrl,
      mxid: normalizeMxid(login.user_id || hiddenAccount.mxid),
      accessToken: String(login.access_token || "").trim(),
      deviceId: String(login.device_id || "").trim(),
      bridgeBotMxid: hiddenAccount.bridgeBotMxid || config.bridgeBotMxid,
      managementRoomId: config.managementRoomId || "",
      loginState: normalizeLoginState(config.loginState, "logging_in"),
      lastError: "",
      connectedAt: config.connectedAt || null,
    },
    {
      connected: config.connected,
      phone: config.phone,
      profileName: config.profileName,
      avatarUrl: config.avatarUrl,
    }
  );
  config = buildConfigFromIntegration(saved);
  invalidateWhatsAppCache(userId);
  return { integration: saved, config };
}

async function matrixRequestWithRefresh(userId, method, path, options = {}) {
  const { config } = await ensureWhatsAppAccess(userId, { forceLogin: false });

  try {
    return await matrixRequest(config, method, path, options);
  } catch (error) {
    if (matrixErrorStatus(error) === 401 && config.password) {
      const refreshed = await ensureWhatsAppAccess(userId, {
        forceLogin: true,
      });
      return matrixRequest(refreshed.config, method, path, options);
    }
    throw error;
  }
}

function invalidateWhatsAppCache(userId) {
  for (const key of [...WHATSAPP_SYNC_CACHE.keys()]) {
    if (key.startsWith(`${userId}:`)) WHATSAPP_SYNC_CACHE.delete(key);
  }
}

async function fetchSyncSnapshot(
  userId,
  { timelineLimit = 30, force = false } = {}
) {
  const cacheKey = `${userId}:${timelineLimit}`;
  const cached = WHATSAPP_SYNC_CACHE.get(cacheKey);
  if (!force && cached && cached.expiresAt > nowTs()) {
    return cached.value;
  }

  const { integration, config } = await ensureWhatsAppAccess(userId);
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
  WHATSAPP_SYNC_CACHE.set(cacheKey, {
    expiresAt: nowTs() + WHATSAPP_SYNC_CACHE_TTL_MS,
    value: snapshot,
  });
  return snapshot;
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
    const storedRoomId = String(snapshot.config.managementRoomId).trim();
    const storedDescriptor = await fetchRoomDescriptorById(
      userId,
      storedRoomId,
      {
        timelineLimit: 20,
        snapshot,
      }
    ).catch(() => null);

    if (storedDescriptor?.isManagement) {
      return storedRoomId;
    }

    await saveWhatsAppIntegration(
      userId,
      {
        managementRoomId: "",
        loginState: snapshot.config.loginState,
        lastError: snapshot.config.lastError,
        connectedAt: snapshot.config.connectedAt || null,
      },
      {
        connected: snapshot.config.connected,
        phone: snapshot.config.phone,
        profileName: snapshot.config.profileName,
        avatarUrl: snapshot.config.avatarUrl,
      }
    ).catch(() => null);
    invalidateWhatsAppCache(userId);
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
        name: "WhatsApp Bridge",
      },
    }
  );

  const roomId = String(response.data?.room_id || "").trim();
  if (roomId) {
    await saveWhatsAppIntegration(
      userId,
      {
        homeserverUrl: config.homeserverUrl,
        mxid: config.mxid,
        accessToken: config.accessToken,
        deviceId: config.deviceId,
        bridgeBotMxid: config.bridgeBotMxid,
        managementRoomId: roomId,
        loginState: config.loginState,
        lastError: config.lastError,
        connectedAt: config.connectedAt || null,
      },
      {
        connected: config.connected,
        phone: config.phone,
        profileName: config.profileName,
        avatarUrl: config.avatarUrl,
      }
    );
    invalidateWhatsAppCache(userId);
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
      ephemeral: syncRoomData?.ephemeral || { events: [] },
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
  } catch (error) {
    if (!isMatrixNotInRoomError(error)) {
      return null;
    }

    try {
      await ensureJoinedRoom(userId, targetRoomId);
      return await loadDescriptor();
    } catch {
      return null;
    }
  }
}

async function ensureJoinedRoom(userId, roomId = "") {
  const targetRoomId = String(roomId || "").trim();
  if (!targetRoomId) return null;

  try {
    const response = await matrixRequestWithRefresh(
      userId,
      "POST",
      `/_matrix/client/v3/rooms/${encodeURIComponent(targetRoomId)}/join`,
      { data: {}, timeout: 20_000 }
    );
    invalidateWhatsAppCache(userId);
    return response.data || { room_id: targetRoomId };
  } catch (error) {
    const message = String(
      error?.response?.data?.error || error?.message || ""
    ).trim();
    if (
      matrixErrorStatus(error) === 403 &&
      /already in room|is already joined/i.test(message)
    ) {
      return { room_id: targetRoomId };
    }
    throw error;
  }
}

async function getManagementRoomDescriptor(
  userId,
  { force = false, timelineLimit = 60 } = {}
) {
  const snapshot = await fetchSyncSnapshot(userId, {
    timelineLimit,
    force,
  });
  let roomId = snapshot.config.managementRoomId;
  let descriptor = roomId
    ? await fetchRoomDescriptorById(userId, roomId, {
        timelineLimit,
        snapshot,
      })
    : null;

  if (descriptor && !descriptor.isManagement) {
    descriptor = null;
    roomId = "";
    if (snapshot.config.managementRoomId) {
      await saveWhatsAppIntegration(
        userId,
        {
          managementRoomId: "",
          loginState: snapshot.config.loginState,
          lastError: snapshot.config.lastError,
          connectedAt: snapshot.config.connectedAt || null,
        },
        {
          connected: snapshot.config.connected,
          phone: snapshot.config.phone,
          profileName: snapshot.config.profileName,
          avatarUrl: snapshot.config.avatarUrl,
        }
      ).catch(() => null);
      invalidateWhatsAppCache(userId);
    }
  }

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
        await saveWhatsAppIntegration(
          userId,
          {
            managementRoomId: roomId,
            loginState: snapshot.config.loginState,
            lastError: snapshot.config.lastError,
            connectedAt: snapshot.config.connectedAt || null,
          },
          {
            connected: snapshot.config.connected,
            phone: snapshot.config.phone,
            profileName: snapshot.config.profileName,
            avatarUrl: snapshot.config.avatarUrl,
          }
        );
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
    /^whatsapp bridge(?: bot)?$/i.test(senderName) ||
    /whatsapp bridge/i.test(senderName)
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

async function buildQrDataUrl(payload = "") {
  return QRCode.toDataURL(String(payload || "").trim(), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
}

async function resolveQrImageUrl(userId, bridgeState = {}) {
  const directUrl = String(bridgeState?.qrImageUrl || "").trim();
  if (directUrl.startsWith("data:")) return directUrl;

  const mxc = String(bridgeState?.qrImageMxc || "").trim();
  if (mxc) {
    const cached = getCachedQrImage(mxc);
    if (cached) return cached;

    try {
      const media = await fetchWhatsAppMedia(userId, mxc);
      const contentType = String(media?.contentType || "")
        .trim()
        .toLowerCase();
      if (contentType.startsWith("image/")) {
        const body = Buffer.isBuffer(media?.body)
          ? media.body
          : Buffer.from(media?.body || "");
        if (body.length) {
          return cacheQrImage(
            mxc,
            `data:${media?.contentType || "image/png"};base64,${body.toString(
              "base64"
            )}`
          );
        }
      }
    } catch {}

    return buildWhatsAppMediaUrl(mxc);
  }

  const qrPayload = String(bridgeState?.qrPayload || "").trim();
  if (qrPayload && !/^scan/i.test(qrPayload)) {
    const payloadCacheKey = `payload:${qrPayload}`;
    const cachedPayload = getCachedQrImage(payloadCacheKey);
    if (cachedPayload) return cachedPayload;

    try {
      return cacheQrImage(payloadCacheKey, await buildQrDataUrl(qrPayload));
    } catch {
      return directUrl || null;
    }
  }

  return directUrl || null;
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

  const timeline = await getWhatsAppRoomTimeline(userId, roomId, {
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

async function sendBridgeTextCommand(userId, command) {
  const roomId = await ensureManagementRoom(userId);
  const content = {
    msgtype: "m.text",
    body: String(command || "").trim(),
  };
  if (!content.body) throw new Error("Bridge command is required.");

  try {
    const response = await matrixRequestWithRefresh(
      userId,
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(
        roomId
      )}/send/m.room.message/${buildTxnId("whatsapp-bridge")}`,
      { data: content }
    );
    invalidateWhatsAppCache(userId);
    return {
      ok: true,
      roomId,
      eventId: response.data?.event_id || null,
    };
  } catch (error) {
    if (!isMatrixNotInRoomError(error)) throw error;

    await saveWhatsAppIntegration(userId, {
      managementRoomId: "",
    }).catch(() => null);
    invalidateWhatsAppCache(userId);
    return sendBridgeTextCommand(userId, command);
  }
}

async function waitForLoginState(
  userId,
  { timeoutMs = 20_000, intervalMs = 1_500 } = {}
) {
  const startedAt = nowTs();
  let latestStatus = await getWhatsAppStatus(userId, { forceRefresh: true });

  while (nowTs() - startedAt < timeoutMs) {
    if (
      ["pending_qr", "connected", "error"].includes(
        String(latestStatus?.loginState || "")
      )
    ) {
      return latestStatus;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    latestStatus = await getWhatsAppStatus(userId, { forceRefresh: true });
  }

  return latestStatus;
}

async function ensureBridgePortalRoomsJoined(
  userId,
  {
    config = {},
    joinedRoomIds = new Set(),
    bridgeSnapshot = null,
    maxRooms = WHATSAPP_BRIDGE_JOIN_BATCH_SIZE,
  } = {}
) {
  const snapshot =
    bridgeSnapshot || readWhatsAppBridgeSnapshot(config?.mxid || "");
  if (!snapshot) {
    return {
      bridgeSnapshot: null,
      joinedRoomIds: [],
      failedRoomIds: [],
    };
  }

  const joinedSet = new Set(
    [...(joinedRoomIds instanceof Set ? joinedRoomIds : joinedRoomIds || [])]
      .map((roomId) => String(roomId || "").trim())
      .filter(Boolean)
  );
  const targets = [];

  if (snapshot.spaceRoomId) targets.push(String(snapshot.spaceRoomId));
  for (const portalRoom of snapshot.portalRooms || []) {
    if (portalRoom?.roomId) targets.push(String(portalRoom.roomId));
  }

  const pendingRoomIds = [...new Set(targets)]
    .filter((roomId) => roomId && !joinedSet.has(roomId))
    .slice(0, Math.max(1, Number(maxRooms || WHATSAPP_BRIDGE_JOIN_BATCH_SIZE)));

  const successful = [];
  const failed = [];

  for (const roomId of pendingRoomIds) {
    try {
      await ensureJoinedRoom(userId, roomId);
      successful.push(roomId);
      joinedSet.add(roomId);
    } catch {
      failed.push(roomId);
    }
  }

  if (successful.length) {
    invalidateWhatsAppCache(userId);
  }

  return {
    bridgeSnapshot: snapshot,
    joinedRoomIds: successful,
    failedRoomIds: failed,
  };
}

async function connectWhatsAppIntegration(userId, payload = {}) {
  const forceReconnect = Boolean(
    payload?.reconnect || payload?.force || payload?.relogin
  );
  const existingIntegration = await getWhatsAppIntegration(userId);
  const existingConfig = existingIntegration
    ? buildConfigFromIntegration(existingIntegration)
    : null;
  const canReadCurrentStatus = Boolean(existingConfig?.accessToken);
  const currentStatus = canReadCurrentStatus
    ? await getWhatsAppStatus(userId, {
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
    const latest = await ensureWhatsAppIntegration(userId);
    return {
      integration: buildWhatsAppClientIntegration(latest),
      clientIntegration: buildWhatsAppClientIntegration(latest),
      status: currentStatus,
    };
  }

  const hiddenAccount = await ensureHiddenWhatsAppAccount(userId);

  await saveWhatsAppIntegration(
    userId,
    {
      homeserverUrl: hiddenAccount.homeserverUrl,
      mxid: hiddenAccount.mxid,
      bridgeBotMxid: hiddenAccount.bridgeBotMxid,
      loginState: "creating_account",
      lastError: "",
      connectedAt: forceReconnect
        ? null
        : existingConfig?.connectedAt || undefined,
    },
    {
      connected: false,
    }
  );

  try {
    const { integration } = await ensureWhatsAppAccess(userId, {
      forceLogin: forceReconnect || !existingConfig?.accessToken,
    });
    const config = buildConfigFromIntegration(integration);

    await saveWhatsAppIntegration(
      userId,
      {
        homeserverUrl: hiddenAccount.homeserverUrl,
        mxid: hiddenAccount.mxid,
        accessToken: config.accessToken,
        deviceId: config.deviceId,
        bridgeBotMxid: hiddenAccount.bridgeBotMxid,
        loginState: "logging_in",
        lastError: "",
        connectedAt: forceReconnect ? null : config.connectedAt || null,
      },
      {
        connected: false,
        phone: config.phone,
        profileName: config.profileName,
        avatarUrl: config.avatarUrl,
      }
    );

    const roomId = await ensureManagementRoom(userId);
    await saveWhatsAppIntegration(
      userId,
      {
        managementRoomId: roomId || "",
        loginState: "logging_in",
        lastError: "",
        connectedAt: forceReconnect ? null : config.connectedAt || null,
      },
      {
        connected: false,
        phone: config.phone,
        profileName: config.profileName,
        avatarUrl: config.avatarUrl,
      }
    );

    const shouldSendLogin = forceReconnect || !currentStatus || !hasActiveQr;

    if (shouldSendLogin) {
      await sendBridgeTextCommand(userId, "login qr");
    }

    const status = await waitForLoginState(userId);
    const latestIntegration = await ensureWhatsAppIntegration(userId);

    return {
      integration: buildWhatsAppClientIntegration(latestIntegration),
      clientIntegration: buildWhatsAppClientIntegration(latestIntegration),
      status: status || {
        connected: false,
        loginState: hasActiveQr ? "pending_qr" : "logging_in",
        lastError: "",
        error: "",
        qrImageUrl: currentStatus?.qrImageUrl || null,
        roomCount: 0,
        unreadCount: 0,
        profile: null,
        connectedAt: null,
      },
    };
  } catch (error) {
    const errorText = String(
      error?.message ||
        error?.response?.data?.error ||
        "WhatsApp connect failed."
    ).trim();
    await saveWhatsAppIntegration(
      userId,
      {
        loginState: "error",
        lastError: errorText,
        connectedAt: null,
      },
      {
        connected: false,
      }
    ).catch(() => null);
    throw error;
  }
}

function disconnectedStatus(overrides = {}) {
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

async function listMatrixWhatsAppRooms(
  userId,
  { search = "", limit = 80, force = false, bridgeSnapshot = null } = {}
) {
  let snapshot = await fetchSyncSnapshot(userId, {
    timelineLimit: 20,
    force,
  });
  let bridgeSnapshotData =
    bridgeSnapshot || readWhatsAppBridgeSnapshot(snapshot.config.mxid);
  const hydration = await ensureBridgePortalRoomsJoined(userId, {
    config: snapshot.config,
    joinedRoomIds: new Set(Object.keys(snapshot.data?.rooms?.join || {})),
    bridgeSnapshot: bridgeSnapshotData,
  });

  bridgeSnapshotData = hydration.bridgeSnapshot || bridgeSnapshotData;
  if (hydration.joinedRoomIds.length) {
    snapshot = await fetchSyncSnapshot(userId, {
      timelineLimit: 20,
      force: true,
    });
  }

  const directMap = parseDirectMap(snapshot.data);
  const rooms = snapshot.data.rooms?.join || {};
  const bridgePortalMap = buildWhatsAppBridgePortalMap(bridgeSnapshotData);

  const descriptors = Object.entries(rooms)
    .map(([roomId, roomData]) => {
      const descriptor = buildRoomDescriptor({
        roomId,
        roomData,
        currentUserId: snapshot.config.mxid,
        bridgeBotMxid: snapshot.config.bridgeBotMxid,
        managementRoomId: snapshot.config.managementRoomId,
        directMap,
      });
      const bridgePortal =
        bridgePortalMap.get(String(roomId || "").trim()) || null;

      if (!descriptor.isWhatsAppRoom && bridgePortal?.roomId) {
        descriptor.isWhatsAppRoom = true;
      }

      return {
        descriptor,
        bridgePortal,
      };
    })
    .filter(
      ({ descriptor, bridgePortal }) =>
        (descriptor.isWhatsAppRoom || bridgePortal?.roomId) &&
        !descriptor.isManagement
    )
    .map(({ descriptor, bridgePortal }) =>
      mergeRoomWithBridgePortalMetadata(
        descriptor.room,
        bridgePortal ||
          bridgePortalMap.get(String(descriptor.room?.roomId || ""))
      )
    )
    .sort((a, b) => {
      const unreadDelta =
        Number(b.unreadCount || 0) - Number(a.unreadCount || 0);
      if (unreadDelta !== 0) return unreadDelta;
      return Number(b.lastMessageTs || 0) - Number(a.lastMessageTs || 0);
    });

  const query = normalizeSearchValue(search);
  const filtered = query
    ? descriptors.filter((room) => {
        const haystack = normalizeSearchValue(
          [room.title, room.lastMessage, room.lastSender]
            .filter(Boolean)
            .join(" ")
        );
        return haystack.includes(query);
      })
    : descriptors;

  return filtered.slice(0, Math.max(1, Math.min(200, Number(limit || 80))));
}

function buildStatusProfile({
  matrixProfile = {},
  whoami = {},
  config = {},
  bridgeSnapshot = null,
}) {
  const bridgeDisplayName =
    String(bridgeSnapshot?.profileName || "").trim() ||
    String(bridgeSnapshot?.phone || "").trim();
  const avatarMxc = String(matrixProfile.avatar_url || "").trim();

  return {
    displayName:
      sanitizeWhatsAppDisplayLabel(bridgeDisplayName) ||
      sanitizeWhatsAppDisplayLabel(matrixProfile.displayname || "") ||
      localpartFromMxid(whoami.user_id || config.mxid),
    avatarUrl: buildWhatsAppMediaUrl(avatarMxc || ""),
    avatarMxc: avatarMxc || null,
    phone:
      String(bridgeSnapshot?.phone || "").trim() ||
      String(config.phone || "").trim(),
    profileName: String(
      bridgeSnapshot?.profileName || config.profileName || ""
    ).trim(),
  };
}

async function getWhatsAppStatus(userId, { forceRefresh = false } = {}) {
  const integration = await getWhatsAppIntegration(userId);
  if (!integration) {
    return disconnectedStatus();
  }

  const fallbackConfig = buildConfigFromIntegration(integration);

  try {
    const { config } = await ensureWhatsAppAccess(userId, {
      forceLogin: false,
    });
    const bridgeSnapshot = readWhatsAppBridgeSnapshot(config.mxid);

    let managementRoomId = config.managementRoomId || "";

    if (!managementRoomId) {
      managementRoomId = await ensureManagementRoom(userId).catch(() => "");
    }

    const bridgeState = await resolveBridgeState(userId, {
      managementRoomId,
      bridgeBotMxid: config.bridgeBotMxid,
      force: forceRefresh,
      timelineLimit: 12,
    });
    const connectionState = deriveWhatsAppConnectionState({
      fallbackConfig,
      bridgeState,
      bridgeSnapshot,
    });

    let { loginState, lastError, connectedAt, connected } = connectionState;

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

    if (Object.keys(patch).length || connected !== fallbackConfig.connected) {
      await saveWhatsAppIntegration(userId, patch, {
        connected,
        phone: fallbackConfig.phone,
        profileName: fallbackConfig.profileName,
        avatarUrl: fallbackConfig.avatarUrl,
      });
    }

    const qrImageUrl =
      loginState === "pending_qr"
        ? await resolveQrImageUrl(userId, bridgeState)
        : null;

    // IMPORTANT: keep pending_qr / logging_in fast
    if (!connected) {
      return {
        connected: false,
        loginState,
        lastError,
        error: lastError,
        qrImageUrl,
        roomCount: 0,
        unreadCount: 0,
        profile: null,
        connectedAt: null,
      };
    }

    const connectedSnapshot = await fetchSyncSnapshot(userId, {
      timelineLimit: 20,
      force: forceRefresh,
    }).catch(() => null);
    const joinedRoomIds = new Set(
      Object.keys(connectedSnapshot?.data?.rooms?.join || {})
    );
    const hydration = await ensureBridgePortalRoomsJoined(userId, {
      config,
      joinedRoomIds,
      bridgeSnapshot,
      maxRooms: forceRefresh
        ? WHATSAPP_BRIDGE_JOIN_BATCH_SIZE * 2
        : WHATSAPP_BRIDGE_JOIN_BATCH_SIZE,
    });

    // Only do the heavier work once actually connected
    const whoami = await getWhoAmI(userId);
    const profile = await getProfile(
      userId,
      whoami.user_id || config.mxid
    ).catch(() => ({}));
    const rooms = await listWhatsAppChats(userId, {
      limit: 120,
      force: forceRefresh || Boolean(hydration.joinedRoomIds.length),
      bridgeSnapshot: hydration.bridgeSnapshot || bridgeSnapshot,
    }).catch(() => []);

    return {
      connected: true,
      loginState: "connected",
      lastError: "",
      error: "",
      qrImageUrl: null,
      roomCount: rooms.length,
      unreadCount: rooms.reduce(
        (sum, room) => sum + Number(room.unreadCount || 0),
        0
      ),
      profile: buildStatusProfile({
        matrixProfile: profile,
        whoami,
        config,
        bridgeSnapshot: hydration.bridgeSnapshot || bridgeSnapshot,
      }),
      connectedAt: connectedAt ? new Date(connectedAt).toISOString() : null,
    };
  } catch (error) {
    const errorText = String(
      error?.message ||
        error?.response?.data?.error ||
        fallbackConfig.lastError ||
        "WhatsApp is unavailable right now."
    ).trim();

    await saveWhatsAppIntegration(
      userId,
      {
        loginState: fallbackConfig.loginState || "error",
        lastError: errorText,
      },
      {
        connected: fallbackConfig.connected,
        phone: fallbackConfig.phone,
        profileName: fallbackConfig.profileName,
        avatarUrl: fallbackConfig.avatarUrl,
      }
    ).catch(() => null);

    return disconnectedStatus({
      loginState:
        fallbackConfig.loginState && fallbackConfig.loginState !== "connected"
          ? fallbackConfig.loginState
          : "error",
      lastError: errorText,
      connectedAt: fallbackConfig.connectedAt
        ? new Date(fallbackConfig.connectedAt).toISOString()
        : null,
    });
  }
}

function buildChatCandidates(chats = []) {
  return chats.map((chat) => ({
    record: chat,
    fields: [
      chat.title,
      chat.name,
      chat.roomId,
      chat.phoneNumber,
      chat.contactJid,
      chat.fullName,
      chat.pushName,
      chat.businessName,
      chat.lastSender,
      chat.lastMessagePreview,
    ],
  }));
}

function resolveChatFromList(chats = [], target = "") {
  const normalizedTarget = String(target || "").trim();
  if (!normalizedTarget) return null;
  const rankChat = (chat) =>
    (chat?.bridgeStatus === "portal" ? 100 : 0) +
    (Number(chat?.lastMessageTs || 0) > 0 ? 10 : 0) +
    (Number(chat?.unreadCount || 0) || 0);

  const exact = chats.find(
    (chat) =>
      String(chat.roomId || "").trim() === normalizedTarget ||
      String(chat.id || "").trim() === normalizedTarget
  );
  if (exact) return exact;

  const digits = normalizeDigits(normalizedTarget);
  if (digits.length >= 6) {
    const digitMatch = [...chats]
      .filter((chat) => {
        const chatDigits = normalizeDigits(
          chat.phoneNumber || chat.title || ""
        );
        return chatDigits === digits || chatDigits.endsWith(digits);
      })
      .sort((left, right) => rankChat(right) - rankChat(left))[0];
    if (digitMatch) return digitMatch;
  }

  return (
    findBestCommunicationMatch(normalizedTarget, buildChatCandidates(chats))
      ?.item?.record || null
  );
}

function buildWhatsAppPlaceholderTimeline(room = {}) {
  const placeholderRoom = {
    roomId: room.roomId,
    id: room.id || room.roomId,
    title: room.title || room.name || room.phoneNumber || "WhatsApp contact",
    name: room.name || room.title || room.phoneNumber || "WhatsApp contact",
    avatarUrl: room.avatarUrl || "",
    avatarMxc: room.avatarMxc || null,
    isDirect: true,
    isGroup: false,
    memberCount: Number(room.memberCount || 2) || 2,
    unreadCount: 0,
    highlightCount: 0,
    lastMessage: room.lastMessage || "",
    lastSender: room.lastSender || "",
    lastMessageFromMe: false,
    lastMessageAt: room.lastMessageAt || null,
    lastMessageTs: Number(room.lastMessageTs || 0) || 0,
    lastEventId: room.lastEventId || null,
    latestMessageId: room.lastEventId || room.latestMessageId || null,
    prevBatch: null,
    source: "whatsapp",
    isPinned: Boolean(room.isPinned),
    isMuted: Boolean(room.isMuted),
    lastMessagePreview: room.lastMessagePreview || "",
    phoneNumber: room.phoneNumber || "",
    contactJid: room.contactJid || "",
    contactMxid: room.contactMxid || "",
    bridgeStatus: room.bridgeStatus || "contact",
    fullName: room.fullName || "",
    pushName: room.pushName || "",
    businessName: room.businessName || "",
    typingUsers: Array.isArray(room.typingUsers) ? room.typingUsers : [],
  };

  return {
    room: placeholderRoom,
    messages: [],
    prevBatch: null,
  };
}

function findWhatsAppRoomByContact(matrixRooms = [], contact = {}) {
  const targetKey = buildWhatsAppContactKey(contact);
  const targetPhone = normalizeDigits(contact.phoneNumber || "");
  const targetJid = normalizeWhatsAppContactIdentifier(
    contact.canonicalContactJid || contact.contactJid || ""
  );
  const targetName = normalizeSearchValue(
    [
      contact.title,
      contact.name,
      contact.fullName,
      contact.pushName,
      contact.businessName,
    ]
      .filter(Boolean)
      .join(" ")
  );

  return (
    matrixRooms.find((room) => {
      const roomKey = buildWhatsAppContactKey(room);
      if (targetKey && roomKey && roomKey === targetKey) return true;

      const roomPhone = normalizeDigits(room.phoneNumber || "");
      if (targetPhone && roomPhone && roomPhone === targetPhone) return true;

      const roomJid = normalizeWhatsAppContactIdentifier(
        room.canonicalContactJid || room.contactJid || ""
      );
      if (targetJid && roomJid && roomJid === targetJid) return true;

      const roomName = normalizeSearchValue(
        [room.title, room.name, room.fullName, room.pushName, room.businessName]
          .filter(Boolean)
          .join(" ")
      );
      return Boolean(targetName && roomName && roomName === targetName);
    }) || null
  );
}

function getPreferredWhatsAppContactIdentifier(contact = {}) {
  const digits = normalizeDigits(contact.phoneNumber || "");
  return (
    String(contact.canonicalContactJid || "").trim() ||
    String(contact.contactJid || "").trim() ||
    String(contact.rawContactJid || "").trim() ||
    (digits ? `${digits}@s.whatsapp.net` : "") ||
    digits ||
    String(contact.phoneNumber || "").trim()
  );
}

function buildWhatsAppPortalRequestCandidates(contact = {}) {
  const digits = normalizeDigits(
    contact.phoneNumber ||
      extractWhatsAppIdentifier(
        contact.canonicalContactJid ||
          contact.contactJid ||
          contact.rawContactJid ||
          ""
      )
  );

  return [
    ...new Set(
      [
        String(contact.canonicalContactJid || "").trim(),
        String(contact.contactJid || "").trim(),
        String(contact.rawContactJid || "").trim(),
        digits ? `${digits}@s.whatsapp.net` : "",
        digits,
        digits ? `+${digits}` : "",
      ].filter(Boolean)
    ),
  ];
}

async function createWhatsAppPortalRoom(userId, contact = {}) {
  const fallbackGhostId = extractWhatsAppIdentifier(
    contact.canonicalContactJid ||
      contact.contactJid ||
      contact.rawContactJid ||
      contact.phoneNumber ||
      ""
  );
  const contactMxid = normalizeMxid(
    contact.contactMxid || buildWhatsAppGhostMxid(fallbackGhostId)
  );
  if (!contactMxid) return null;

  const roomName = sanitizeWhatsAppDisplayLabel(
    contact.title ||
      contact.name ||
      contact.fullName ||
      contact.pushName ||
      contact.phoneNumber ||
      "WhatsApp"
  );
  const response = await matrixRequestWithRefresh(
    userId,
    "POST",
    "/_matrix/client/v3/createRoom",
    {
      data: {
        is_direct: true,
        invite: [contactMxid],
        preset: "trusted_private_chat",
        ...(roomName ? { name: roomName } : {}),
      },
      timeout: 20_000,
    }
  );

  invalidateWhatsAppCache(userId);
  return String(response.data?.room_id || "").trim() || null;
}

async function requestWhatsAppPortalCreation(userId, contact = {}) {
  const candidates = buildWhatsAppPortalRequestCandidates(contact);
  let attempted = false;

  const createdRoomId = await createWhatsAppPortalRoom(userId, contact).catch(
    () => ""
  );
  if (createdRoomId) {
    attempted = true;
  }

  for (const candidate of candidates) {
    if (!shouldRequestWhatsAppPortal(userId, candidate)) continue;
    attempted = true;
    await sendBridgeTextCommand(userId, `start-chat ${candidate}`).catch(
      () => null
    );
  }

  return attempted;
}

async function waitForWhatsAppContactRoom(
  userId,
  contact = {},
  { timeoutMs = 16_000, intervalMs = 1_000 } = {}
) {
  const startedAt = nowTs();

  while (nowTs() - startedAt < timeoutMs) {
    invalidateWhatsAppCache(userId);
    const rooms = await listWhatsAppChats(userId, {
      limit: 200,
      force: true,
    }).catch(() => []);
    const match = findWhatsAppRoomByContact(rooms, contact);
    if (match?.roomId && !isWhatsAppContactRoomId(match.roomId)) {
      return match;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return null;
}

async function listWhatsAppChats(
  userId,
  { search = "", limit = 80, force = false, bridgeSnapshot = null } = {}
) {
  const integration = await ensureWhatsAppIntegration(userId);
  const config = buildConfigFromIntegration(integration);
  const bridgeSnapshotData =
    bridgeSnapshot || readWhatsAppBridgeSnapshot(config.mxid);
  const rooms = await listMatrixWhatsAppRooms(userId, {
    search,
    limit: Math.max(120, Number(limit || 80)),
    force,
    bridgeSnapshot: bridgeSnapshotData,
  });
  const contacts = readWhatsAppBridgeContacts(config.mxid, bridgeSnapshotData);

  const bridgeContactMap = buildWhatsAppBridgeContactMap(contacts);
  const roomsById = new Map(
    rooms
      .filter((room) => room?.roomId || room?.id)
      .map((room) => [String(room.roomId || room.id).trim(), room])
  );
  const chatMap = new Map();
  const registerChat = (chat = null) => {
    if (!chat) return;
    const chatKey = buildWhatsAppChatKey(chat);
    if (!chatKey) return;
    chatMap.set(
      chatKey,
      pickBetterWhatsAppContact(chatMap.get(chatKey) || null, chat)
    );
  };

  for (const room of rooms) {
    const bridgeContact =
      bridgeContactMap.get(String(room.roomId || "").trim()) ||
      bridgeContactMap.get(String(room.contactJid || "").trim()) ||
      null;
    registerChat(mergeRoomWithBridgeContactMetadata(room, bridgeContact));
  }

  const hydratedPortalRooms = await Promise.all(
    (Array.isArray(bridgeSnapshotData?.portalRooms)
      ? bridgeSnapshotData.portalRooms
      : []
    ).map(async (portal) => {
      const portalRoomId = String(portal?.roomId || "").trim();
      if (!portalRoomId) return null;

      const bridgeContact =
        bridgeContactMap.get(portalRoomId) ||
        bridgeContactMap.get(
          normalizeWhatsAppContactIdentifier(portal?.portalId || "")
        ) ||
        bridgeContactMap.get(String(portal?.portalId || "").trim()) ||
        null;
      const existingRoom = roomsById.get(portalRoomId) || null;

      if (existingRoom) {
        return mergeRoomWithBridgeContactMetadata(
          mergeRoomWithBridgePortalMetadata(existingRoom, portal),
          bridgeContact
        );
      }

      const descriptor = await fetchRoomDescriptorById(userId, portalRoomId, {
        timelineLimit: 40,
      }).catch(() => null);

      if (descriptor?.room && !descriptor.isManagement) {
        return mergeRoomWithBridgeContactMetadata(
          mergeRoomWithBridgePortalMetadata(descriptor.room, portal),
          bridgeContact
        );
      }

      return buildWhatsAppPortalRoom(portal, bridgeContact);
    })
  );

  hydratedPortalRooms.forEach(registerChat);

  for (const contact of contacts) {
    registerChat(contact);
  }

  const query = normalizeSearchValue(search);

  return [...chatMap.values()]
    .filter((room) => {
      if (!query) return true;
      const haystack = normalizeSearchValue(
        [
          room.title,
          room.name,
          room.lastMessage,
          room.lastSender,
          room.phoneNumber,
          room.fullName,
          room.pushName,
          room.businessName,
        ]
          .filter(Boolean)
          .join(" ")
      );
      return haystack.includes(query);
    })
    .sort((left, right) => {
      const unreadDelta =
        Number(right.unreadCount || 0) - Number(left.unreadCount || 0);
      if (unreadDelta !== 0) return unreadDelta;

      const timestampDelta =
        Number(right.lastMessageTs || 0) - Number(left.lastMessageTs || 0);
      if (timestampDelta !== 0) return timestampDelta;

      return String(left.title || left.name || "").localeCompare(
        String(right.title || right.name || ""),
        "en",
        { sensitivity: "base" }
      );
    })
    .slice(0, Math.max(1, Math.min(200, Number(limit || 80))))
    .map((room) => ({
      roomId: room.roomId,
      id: room.roomId,
      title: room.title,
      name: room.name,
      avatarUrl: room.avatarUrl,
      lastMessagePreview: room.lastMessage || "",
      lastMessageAt: room.lastMessageAt,
      unreadCount: Number(room.unreadCount || 0),
      source: "whatsapp",
      isGroup: Boolean(room.isGroup),
      isPinned: Boolean(room.isPinned),
      isMuted: Boolean(room.isMuted),
      lastSender: room.lastSender || "",
      memberCount: Number(room.memberCount || 0),
      phoneNumber: room.phoneNumber || "",
      contactJid: room.contactJid || "",
      canonicalContactJid: room.canonicalContactJid || room.contactJid || "",
      contactMxid: room.contactMxid || "",
      bridgeStatus: room.bridgeStatus || "portal",
      fullName: room.fullName || "",
      pushName: room.pushName || "",
      businessName: room.businessName || "",
      lastEventId: room.lastEventId || room.latestMessageId || null,
      latestMessageId: room.lastEventId || room.latestMessageId || null,
      typingUsers: Array.isArray(room.typingUsers) ? room.typingUsers : [],
      canOpenTimeline: !isWhatsAppContactRoomId(room.roomId),
    }));
}

async function resolveRoomReference(
  userId,
  roomRef = "",
  { createIfMissing = false, portalWaitMs = 16_000 } = {}
) {
  const normalizedRoomRef = String(roomRef || "").trim();
  const rooms = await listWhatsAppChats(userId, { limit: 200 });
  const match = resolveChatFromList(rooms, normalizedRoomRef);

  if (!match?.roomId) {
    const descriptor = normalizedRoomRef.startsWith("!")
      ? await fetchRoomDescriptorById(userId, normalizedRoomRef, {
          timelineLimit: 40,
        }).catch(() => null)
      : null;

    if (descriptor?.room && !descriptor.isManagement) {
      const integration = await ensureWhatsAppIntegration(userId).catch(
        () => null
      );
      const config = integration
        ? buildConfigFromIntegration(integration)
        : null;
      const bridgeSnapshot = config
        ? readWhatsAppBridgeSnapshot(config.mxid)
        : null;
      const bridgePortal = findWhatsAppPortalByRoomId(
        bridgeSnapshot,
        normalizedRoomRef
      );
      if (descriptor.isWhatsAppRoom || bridgePortal?.roomId) {
        const bridgeContactMap = buildWhatsAppBridgeContactMap(
          config ? readWhatsAppBridgeContacts(config.mxid, bridgeSnapshot) : []
        );
        const hydratedRoom = mergeRoomWithBridgeContactMetadata(
          mergeRoomWithBridgePortalMetadata(descriptor.room, bridgePortal),
          bridgeContactMap.get(normalizedRoomRef) ||
            bridgeContactMap.get(
              String(descriptor.room?.contactJid || "").trim()
            ) ||
            null
        );
        return {
          ...hydratedRoom,
          placeholder: false,
          roomId: String(hydratedRoom.roomId || normalizedRoomRef),
        };
      }
    }

    throw new Error(`No WhatsApp chat found for: ${normalizedRoomRef}`);
  }

  if (isWhatsAppContactRoomId(match.roomId)) {
    if (createIfMissing) {
      await requestWhatsAppPortalCreation(userId, match).catch(() => null);

      const createdRoom = await waitForWhatsAppContactRoom(userId, match, {
        timeoutMs: portalWaitMs,
      }).catch(() => null);
      if (createdRoom?.roomId && !isWhatsAppContactRoomId(createdRoom.roomId)) {
        await assertWhatsAppRoom(userId, createdRoom.roomId);
        return {
          ...createdRoom,
          placeholder: false,
          roomId: String(createdRoom.roomId),
        };
      }
    }

    return {
      ...match,
      placeholder: true,
      roomId: String(match.roomId),
    };
  }

  await assertWhatsAppRoom(userId, match.roomId);
  return {
    ...match,
    placeholder: false,
    roomId: String(match.roomId),
  };
}

function normalizeMessageForClient(message = {}) {
  const attachment = message.media
    ? {
        type: message.media.type,
        url: message.media.url,
        thumbnailUrl: message.media.thumbnailUrl || "",
        fileName: message.media.fileName || message.media.body || "Attachment",
        mimeType: message.media.mimeType || "",
        size: Number(message.media.size || 0) || 0,
        duration: Number(message.media.duration || 0) || 0,
      }
    : null;

  return {
    id: message.id,
    eventId: message.eventId,
    roomId: message.roomId || "",
    senderId: message.sender,
    senderName: message.senderName,
    senderAvatarUrl: message.senderAvatarUrl || "",
    direction: message.fromMe ? "outbound" : "inbound",
    text: message.text || "",
    timestamp: message.isoTimestamp,
    timeLabel: message.timeLabel,
    attachments: attachment ? [attachment] : [],
    media: message.media || null,
    isVoice: attachment?.type === "audio",
    reactions: message.reactions || [],
    replyPreview: message.replyPreview || null,
    deleted: Boolean(message.deleted),
    fromMe: Boolean(message.fromMe),
    deliveryState: message.deliveryState || null,
    deliveryLabel: message.deliveryLabel || null,
    readByCount: Number(message.readByCount || 0) || 0,
  };
}

async function getWhatsAppRoomTimeline(userId, roomId, { limit = 50 } = {}) {
  const resolvedRoom = await resolveRoomReference(userId, roomId, {
    createIfMissing: true,
    portalWaitMs: 8_000,
  });
  if (resolvedRoom.placeholder) {
    return buildWhatsAppPlaceholderTimeline(resolvedRoom);
  }

  await assertWhatsAppRoom(userId, resolvedRoom.roomId);

  const snapshot = await fetchSyncSnapshot(userId, {
    timelineLimit: Math.max(limit, 50),
    force: true,
  });

  const roomData = snapshot.data.rooms?.join?.[resolvedRoom.roomId];

  if (!roomData) {
    const descriptor = await fetchRoomDescriptorById(
      userId,
      resolvedRoom.roomId,
      {
        timelineLimit: Math.max(limit, 50),
        snapshot,
      }
    );

    if (
      !descriptor ||
      descriptor.isManagement ||
      (!descriptor.isWhatsAppRoom && resolvedRoom.bridgeStatus !== "portal")
    ) {
      throw new Error("WhatsApp conversation not found.");
    }

    const contactMap = buildWhatsAppBridgeContactMap(
      readWhatsAppBridgeContacts(snapshot.config.mxid)
    );
    const room = mergeResolvedWhatsAppRoomMetadata(
      descriptor.room,
      resolvedRoom,
      contactMap.get(String(descriptor.room?.roomId || "")) ||
        contactMap.get(String(descriptor.room?.contactJid || "")) ||
        null
    );

    return {
      room,
      messages: descriptor.messages
        .slice(-Math.max(1, Number(limit || 50)))
        .map(normalizeMessageForClient),
      prevBatch: descriptor.room.prevBatch || null,
    };
  }

  const directMap = parseDirectMap(snapshot.data);

  const descriptor = buildRoomDescriptor({
    roomId: resolvedRoom.roomId,
    roomData,
    currentUserId: snapshot.config.mxid,
    bridgeBotMxid: snapshot.config.bridgeBotMxid,
    managementRoomId: snapshot.config.managementRoomId,
    directMap,
  });

  if (
    descriptor.isManagement ||
    (!descriptor.isWhatsAppRoom && resolvedRoom.bridgeStatus !== "portal")
  ) {
    throw new Error("Invalid WhatsApp room.");
  }

  const contactMap = buildWhatsAppBridgeContactMap(
    readWhatsAppBridgeContacts(snapshot.config.mxid)
  );
  const room = mergeResolvedWhatsAppRoomMetadata(
    descriptor.room,
    resolvedRoom,
    contactMap.get(String(descriptor.room?.roomId || "")) ||
      contactMap.get(String(descriptor.room?.contactJid || "")) ||
      null
  );

  return {
    room,
    messages: descriptor.messages
      .slice(-Math.max(1, Number(limit || 50)))
      .map(normalizeMessageForClient),
    prevBatch: descriptor.room.prevBatch || null,
  };
}

async function getWhatsAppRoomHistory(
  userId,
  roomId,
  { from = "", limit = 50 } = {}
) {
  const resolvedRoom = await resolveRoomReference(userId, roomId, {
    createIfMissing: false,
  });
  if (resolvedRoom.placeholder) {
    return buildWhatsAppPlaceholderTimeline(resolvedRoom);
  }

  if (!String(from || "").trim()) {
    return getWhatsAppRoomTimeline(userId, resolvedRoom.roomId, { limit });
  }

  const snapshot = await fetchSyncSnapshot(userId, {
    timelineLimit: 1,
    force: false,
  });
  const roomData = snapshot.data.rooms?.join?.[resolvedRoom.roomId] || null;

  const response = await matrixRequestWithRefresh(
    userId,
    "GET",
    `/_matrix/client/v3/rooms/${encodeURIComponent(
      resolvedRoom.roomId
    )}/messages`,
    {
      params: {
        dir: "b",
        from,
        limit: Math.max(1, Math.min(100, Number(limit || 50))),
      },
      timeout: 20_000,
    }
  );

  const fallbackStateEvents = !roomData
    ? await matrixRequestWithRefresh(
        userId,
        "GET",
        `/_matrix/client/v3/rooms/${encodeURIComponent(
          resolvedRoom.roomId
        )}/state`,
        {
          timeout: 20_000,
        }
      )
        .then((result) => (Array.isArray(result?.data) ? result.data : []))
        .catch(() => [])
    : [];

  const syntheticRoomData = {
    state: roomData?.state || { events: fallbackStateEvents },
    timeline: {
      events: [...(response.data?.chunk || [])].reverse(),
      prev_batch: response.data?.end || null,
    },
    summary: roomData?.summary || {},
    unread_notifications: roomData?.unread_notifications || {},
    ephemeral: roomData?.ephemeral || { events: [] },
  };

  const directMap = parseDirectMap(snapshot.data);
  const descriptor = buildRoomDescriptor({
    roomId: resolvedRoom.roomId,
    roomData: syntheticRoomData,
    currentUserId: snapshot.config.mxid,
    bridgeBotMxid: snapshot.config.bridgeBotMxid,
    managementRoomId: snapshot.config.managementRoomId,
    directMap,
  });

  if (
    descriptor.isManagement ||
    (!descriptor.isWhatsAppRoom && resolvedRoom.bridgeStatus !== "portal")
  ) {
    throw new Error("WhatsApp conversation not found.");
  }

  const contactMap = buildWhatsAppBridgeContactMap(
    readWhatsAppBridgeContacts(snapshot.config.mxid)
  );
  const room = mergeResolvedWhatsAppRoomMetadata(
    descriptor.room,
    resolvedRoom,
    contactMap.get(String(descriptor.room?.roomId || "")) ||
      contactMap.get(String(descriptor.room?.contactJid || "")) ||
      null
  );

  return {
    room,
    messages: descriptor.messages.map(normalizeMessageForClient),
    prevBatch: response.data?.end || null,
  };
}
async function sendWhatsAppMessage(
  userId,
  roomId,
  text,
  { replyToEventId = null } = {}
) {
  const resolvedRoom = await resolveRoomReference(userId, roomId, {
    createIfMissing: true,
    portalWaitMs: 25_000,
  });
  if (resolvedRoom.placeholder) {
    throw new Error(
      "This WhatsApp chat is known to the bridge, but its live Matrix room has not been created yet. Reconnect WhatsApp or wait for the bridge to finish syncing that chat."
    );
  }

  await assertWhatsAppRoom(userId, resolvedRoom.roomId);
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
      resolvedRoom.roomId
    )}/send/m.room.message/${buildTxnId("whatsapp-text")}`,
    { data: content }
  );

  invalidateWhatsAppCache(userId);
  return {
    ok: true,
    eventId: response.data?.event_id || null,
    roomId: resolvedRoom.roomId,
  };
}

async function uploadWhatsAppMedia(
  userId,
  roomId,
  buffer,
  fileName,
  mimeType,
  { caption = "", replyToEventId = null } = {}
) {
  const resolvedRoom = await resolveRoomReference(userId, roomId, {
    createIfMissing: true,
    portalWaitMs: 25_000,
  });
  if (resolvedRoom.placeholder) {
    throw new Error(
      "This WhatsApp chat is known to the bridge, but its live Matrix room has not been created yet. Reconnect WhatsApp or wait for the bridge to finish syncing that chat."
    );
  }

  await assertWhatsAppRoom(userId, resolvedRoom.roomId);
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
  if (!contentUri) throw new Error("WhatsApp upload failed.");

  let msgtype = "m.file";
  if (normalizedMime.startsWith("image/")) msgtype = "m.image";
  else if (normalizedMime.startsWith("video/")) msgtype = "m.video";
  else if (normalizedMime.startsWith("audio/")) {
    msgtype = /^audio\/webm(?:;|$)/i.test(normalizedMime)
      ? "m.file"
      : "m.audio";
  }

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
      resolvedRoom.roomId
    )}/send/m.room.message/${buildTxnId("whatsapp-media")}`,
    { data: content, timeout: 60_000 }
  );

  let captionEventId = null;
  if (String(caption || "").trim()) {
    const captionResult = await sendWhatsAppMessage(
      userId,
      resolvedRoom.roomId,
      String(caption).trim(),
      {
        replyToEventId,
      }
    );
    captionEventId = captionResult.eventId || null;
  }

  invalidateWhatsAppCache(userId);
  return {
    ok: true,
    eventId: sendResponse.data?.event_id || null,
    captionEventId,
    contentUri,
    roomId: resolvedRoom.roomId,
  };
}

async function markWhatsAppRoomAsRead(userId, roomId, eventId = "") {
  const resolvedRoom = await resolveRoomReference(userId, roomId, {
    createIfMissing: false,
  });
  if (resolvedRoom.placeholder) return { ok: true };
  await assertWhatsAppRoom(userId, resolvedRoom.roomId);
  let targetEventId = String(eventId || "").trim();
  if (!targetEventId) {
    const timeline = await getWhatsAppRoomTimeline(
      userId,
      resolvedRoom.roomId,
      {
        limit: 30,
      }
    );
    const latestMessage =
      [...(timeline.messages || [])].reverse().find((message) => message?.id) ||
      null;
    targetEventId = latestMessage?.id || "";
  }
  if (!targetEventId) return { ok: true };

  await matrixRequestWithRefresh(
    userId,
    "POST",
    `/_matrix/client/v3/rooms/${encodeURIComponent(
      resolvedRoom.roomId
    )}/receipt/m.read/${encodeURIComponent(targetEventId)}`,
    { data: {} }
  );

  invalidateWhatsAppCache(userId);
  return { ok: true };
}

function parseMxc(mxc = "") {
  const normalized = String(mxc || "").trim();
  if (!normalized.startsWith("mxc://")) {
    throw new Error("Invalid WhatsApp media URI.");
  }
  const remainder = normalized.replace(/^mxc:\/\//, "");
  const [serverName, mediaId] = remainder.split("/");
  if (!serverName || !mediaId) {
    throw new Error("Invalid WhatsApp media URI.");
  }
  return { serverName, mediaId };
}

function buildWhatsAppMediaRequestPath(
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

async function fetchWhatsAppMedia(userId, mxc, { thumbnail = false } = {}) {
  const path = buildWhatsAppMediaRequestPath(mxc, { thumbnail });

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

async function getWhatsAppUnreadSummary(userId) {
  const chats = await listWhatsAppChats(userId, { limit: 120 });
  const unreadChats = chats
    .filter((chat) => Number(chat.unreadCount || 0) > 0)
    .sort((a, b) => {
      const unreadDelta =
        Number(b.unreadCount || 0) - Number(a.unreadCount || 0);
      if (unreadDelta !== 0) return unreadDelta;
      return (
        normalizeTimestampMs(b.lastMessageAt || 0) -
        normalizeTimestampMs(a.lastMessageAt || 0)
      );
    });

  const count = unreadChats.reduce(
    (sum, chat) => sum + Number(chat.unreadCount || 0),
    0
  );

  return {
    app: "whatsapp",
    count,
    previews: unreadChats.slice(0, 3).map((chat) => ({
      id: chat.roomId,
      chatId: chat.roomId,
      name: chat.title,
      unread: chat.unreadCount,
      preview: chat.lastMessagePreview || "",
      latestMessageId: chat.lastEventId || chat.latestMessageId || null,
      latestMessageAt: chat.lastMessageAt || null,
      isDirect: !chat.isGroup,
    })),
    chats: unreadChats.map((chat) => ({
      chatId: chat.roomId,
      chatName: chat.title,
      unreadCount: chat.unreadCount,
      isGroup: chat.isGroup,
      lastMessage: chat.lastMessagePreview || "",
      latestMessageId: chat.lastEventId || chat.latestMessageId || null,
      latestMessageAt: chat.lastMessageAt || null,
    })),
    summary:
      count > 0
        ? `${unreadChats.length} WhatsApp chat${
            unreadChats.length === 1 ? "" : "s"
          } waiting`
        : null,
  };
}

module.exports = {
  defaultBridgeBotMxid,
  buildWhatsAppMediaUrl,
  getWhatsAppIntegration,
  ensureWhatsAppIntegration,
  connectWhatsAppIntegration,
  getWhatsAppStatus,
  buildWhatsAppClientIntegration,
  listWhatsAppChats,
  getWhatsAppRoomTimeline,
  getWhatsAppRoomHistory,
  sendWhatsAppMessage,
  uploadWhatsAppMedia,
  markWhatsAppRoomAsRead,
  fetchWhatsAppMedia,
  getWhatsAppUnreadSummary,
  getWhatsAppUnreadSignal: getWhatsAppUnreadSummary,
  sendBridgeCommand: sendBridgeTextCommand,
  invalidateWhatsAppCache,
  __test: {
    stripReplyFallback,
    resolveMessageText,
    buildMediaDescriptor,
    buildWhatsAppMediaRequestPath,
    buildWhatsAppBridgeSnapshot,
    buildWhatsAppBridgePortalMap,
    buildWhatsAppBridgeContactMap,
    findWhatsAppPortalByRoomId,
    mergeRoomWithBridgePortalMetadata,
    mergeRoomWithBridgeContactMetadata,
    buildWhatsAppPortalRoom,
    deriveWhatsAppConnectionState,
    collectMemberMap,
    parseRoomEvents,
    buildRoomDescriptor,
    parseDirectMap,
    isBridgeBotMessage,
    extractBridgeRoomState,
    buildQrDataUrl,
    buildWhatsAppContactRoomId,
    isWhatsAppContactRoomId,
    parseWhatsAppContactRoomId,
    extractWhatsAppIdentifier,
    buildWhatsAppContactDisplayName,
    buildWhatsAppGhostMxid,
    buildWhatsAppPlaceholderTimeline,
    canonicalizeWhatsAppContactJid,
    buildWhatsAppContactKey,
    buildWhatsAppChatKey,
    pickBetterWhatsAppContact,
    applyDeliveryStateToMessages,
    extractMatrixReadReceipts,
  },
};
