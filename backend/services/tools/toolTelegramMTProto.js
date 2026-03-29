// backend/services/tools/toolTelegramMTProto.js
// npm install telegram input
//
// Get API_ID and API_HASH from https://my.telegram.org → App configuration
// Set in your .env:  TELEGRAM_API_ID=12345  TELEGRAM_API_HASH=abc123...

const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram");
const jwt = require("jsonwebtoken");
const Integration = require("../../models/Integration");

const API_ID = parseInt(process.env.TELEGRAM_API_ID || "0");
const API_HASH = process.env.TELEGRAM_API_HASH || "";

// In-memory client cache per userId  { userId: TelegramClient }
const clients = {};

const INVALID_SESSION_ERRORS = [
  "AUTH_KEY_UNREGISTERED",
  "AUTH_KEY_INVALID",
  "AUTH_KEY_DUPLICATED",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
];

function getTelegramErrorMessage(error) {
  return String(error?.errorMessage || error?.message || "");
}

function isInvalidSessionError(error) {
  const message = getTelegramErrorMessage(error).toUpperCase();
  return INVALID_SESSION_ERRORS.some((code) => message.includes(code));
}

function createReconnectRequiredError(error) {
  const reconnectError = new Error(
    "Telegram session expired. Please reconnect."
  );
  reconnectError.code = 401;
  reconnectError.requiresReconnect = true;
  reconnectError.errorMessage =
    getTelegramErrorMessage(error) || "AUTH_KEY_UNREGISTERED";
  reconnectError.cause = error;
  return reconnectError;
}

function getPendingAuthSecret() {
  return process.env.JWT_SECRET || "telegram-pending-auth";
}

function createPendingAuthToken(userId, phone, phoneCodeHash) {
  return jwt.sign(
    {
      kind: "telegram_pending_auth",
      userId,
      phone,
      phoneCodeHash,
    },
    getPendingAuthSecret(),
    { expiresIn: "15m" }
  );
}

function readPendingAuthToken(token, userId) {
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, getPendingAuthSecret());
    if (
      decoded?.kind !== "telegram_pending_auth" ||
      decoded?.userId !== userId ||
      !decoded?.phone ||
      !decoded?.phoneCodeHash
    ) {
      return null;
    }

    return {
      phone: String(decoded.phone),
      phoneCodeHash: String(decoded.phoneCodeHash),
    };
  } catch {
    return null;
  }
}

async function destroyCachedClient(userId) {
  const client = clients[userId];
  if (!client) return;

  try {
    await client.destroy();
  } catch {
    try {
      await client.disconnect();
    } catch {}
  }

  delete clients[userId];
}

async function clearSessionState(userId) {
  await Integration.findOneAndUpdate(
    { userId, type: "telegram" },
    {
      $unset: {
        "telegram.sessionString": "",
        "telegram.pendingSessionString": "",
        "telegram.phoneCodeHash": "",
        "telegram.pendingPhone": "",
      },
    }
  ).catch(() => {});
}

async function invalidateSession(userId, error) {
  console.warn(`[TG] Invalid session for ${userId}: ${getTelegramErrorMessage(error)}`);
  delete pendingAuth[userId];
  await destroyCachedClient(userId);
  await clearSessionState(userId);
  throw createReconnectRequiredError(error);
}

async function rethrowIfInvalidSession(userId, error) {
  if (isInvalidSessionError(error)) {
    await invalidateSession(userId, error);
  }
  throw error;
}

// ── Load session string from DB ───────────────────────────
async function getTelegramAuthState(userId) {
  const doc = await Integration.findOne({ userId, type: "telegram" });
  return {
    sessionString: doc?.telegram?.sessionString || "",
    pendingSessionString: doc?.telegram?.pendingSessionString || "",
    phoneCodeHash: doc?.telegram?.phoneCodeHash || "",
    pendingPhone: doc?.telegram?.pendingPhone || "",
  };
}

async function saveSessionString(userId, sessionString, options = {}) {
  const { clearPending = true } = options;
  const set = {
    userId,
    type: "telegram",
    "telegram.sessionString": sessionString,
  };

  if (clearPending) {
    set["telegram.pendingSessionString"] = "";
    set["telegram.phoneCodeHash"] = "";
    set["telegram.pendingPhone"] = "";
  }

  await Integration.findOneAndUpdate(
    { userId, type: "telegram" },
    {
      $set: set,
    },
    { upsert: true }
  );
}

async function savePendingSessionState(
  userId,
  { pendingSessionString = "", pendingPhone = "", phoneCodeHash = "" } = {}
) {
  await Integration.findOneAndUpdate(
    { userId, type: "telegram" },
    {
      $set: {
        userId,
        type: "telegram",
        "telegram.pendingSessionString": pendingSessionString,
        "telegram.pendingPhone": pendingPhone,
        "telegram.phoneCodeHash": phoneCodeHash,
      },
    },
    { upsert: true }
  );
}

async function validateAuthorizedSession(userId, client) {
  try {
    await client.invoke(new Api.updates.GetState());
  } catch (error) {
    await rethrowIfInvalidSession(userId, error);
  }
}

async function withTelegramClient(userId, operation) {
  const client = await getClient(userId);
  try {
    return await operation(client);
  } catch (error) {
    await rethrowIfInvalidSession(userId, error);
  }
}

// ── Build / reuse a client ────────────────────────────────
async function getClient(userId) {
  if (clients[userId]) {
    if (!clients[userId].connected) {
      try {
        await clients[userId].connect();
      } catch (error) {
        await destroyCachedClient(userId);
        await rethrowIfInvalidSession(userId, error);
      }
    }
    return clients[userId];
  }

  const authState = await getTelegramAuthState(userId);
  const session = new StringSession(
    authState.pendingSessionString || authState.sessionString || ""
  );
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 3,
  });
  clients[userId] = client;

  try {
    await client.connect();

    const hasPendingAuth = Boolean(
      pendingAuth[userId] ||
        authState.pendingSessionString ||
        authState.phoneCodeHash ||
        authState.pendingPhone
    );
    if (authState.sessionString && !hasPendingAuth) {
      await validateAuthorizedSession(userId, client);
    }

    return client;
  } catch (error) {
    await destroyCachedClient(userId);
    await rethrowIfInvalidSession(userId, error);
  }
}

// ── Check if authorized ───────────────────────────────────
async function isAuthorized(userId) {
  try {
    const client = await getClient(userId);
    await client.invoke(new Api.updates.GetState());
    return true;
  } catch {
    return false;
  }
}

// In-memory store for pending auth state
const pendingAuth = {}; // { [userId]: { phone, phoneCodeHash } }

// ── Step 1: Send phone code ───────────────────────────────
async function sendPhoneCode(userId, phoneNumber) {
  if (!phoneNumber || typeof phoneNumber !== "string") {
    throw new Error("phoneNumber must be a non-empty string");
  }

  // Normalize: strip ALL spaces
  const phone = phoneNumber.replace(/\s+/g, "").trim();
  console.log(`[TG] sendPhoneCode userId=${userId} phone=${phone}`);

  // Kill any stale cached client so we always start fresh during auth
  await destroyCachedClient(userId);

  // Clear stale DB state (non-fatal)
  try {
    await Integration.findOneAndUpdate(
      { userId, type: "telegram" },
      {
        $unset: {
          "telegram.sessionString": "",
          "telegram.pendingSessionString": "",
          "telegram.phoneCodeHash": "",
          "telegram.pendingPhone": "",
        },
        $set: {
          userId,
          type: "telegram",
        },
      },
      { upsert: true }
    );
  } catch (e) {
    console.warn("[TG] DB clear warning:", e.message);
  }

  // Build a brand-new unauthenticated client
  const session = new StringSession("");
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
  });
  await client.connect();
  clients[userId] = client;

  // Actually send the code via raw MTProto
  let result;
  try {
    result = await client.sendCode(
      { apiId: API_ID, apiHash: API_HASH },
      phone
    );
  } catch (err) {
    console.error("[TG] SendCode error:", err.errorMessage || err.message);
    throw new Error(err.errorMessage || err.message || "Failed to send code");
  }

  console.log(`[TG] Code sent, hash=${result.phoneCodeHash?.slice(0, 8)}…`);

  // Store in memory first (always reliable), then DB (best-effort)
  pendingAuth[userId] = { phone, phoneCodeHash: result.phoneCodeHash };
  try {
    await savePendingSessionState(userId, {
      pendingSessionString: client.session.save(),
      phoneCodeHash: result.phoneCodeHash,
      pendingPhone: phone,
    });
  } catch (e) {
    console.warn("[TG] DB save warning:", e.message);
  }

  return {
    ok: true,
    pendingPhone: phone,
    pendingAuthToken: createPendingAuthToken(
      userId,
      phone,
      result.phoneCodeHash
    ),
  };
}

// ── Step 2: Verify SMS code ───────────────────────────────
async function verifyPhoneCode(userId, code, options = {}) {
  // In-memory is the ground truth (set in sendPhoneCode same process)
  // DB is a fallback for server restarts
  let phoneNumber, phoneCodeHash;
  const tokenState = readPendingAuthToken(options.pendingAuthToken, userId);

  if (pendingAuth[userId]) {
    phoneNumber = pendingAuth[userId].phone;
    phoneCodeHash = pendingAuth[userId].phoneCodeHash;
  } else if (tokenState) {
    phoneNumber = tokenState.phone;
    phoneCodeHash = tokenState.phoneCodeHash;
  } else if (options.phoneNumber && options.phoneCodeHash) {
    phoneNumber = String(options.phoneNumber).trim();
    phoneCodeHash = String(options.phoneCodeHash).trim();
  } else {
    const doc = await Integration.findOne({ userId, type: "telegram" });
    phoneNumber = doc?.telegram?.pendingPhone;
    phoneCodeHash = doc?.telegram?.phoneCodeHash;
  }

  console.log(
    `[TG] verifyPhoneCode phone=${phoneNumber} hashOk=${!!phoneCodeHash} code=${code}`
  );

  if (!phoneNumber)
    throw new Error("Session expired — please re-enter your phone number");
  if (!phoneCodeHash)
    throw new Error("Code hash missing — please re-enter your phone number");

  const normalizedCode = String(code).replace(/\D/g, "").trim();
  if (!normalizedCode) throw new Error("Verification code is required");

  // Reuse the same auth session and reconnect cleanly if it dropped.
  const client = await getClient(userId);

  try {
    await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: String(phoneNumber),
        phoneCodeHash: String(phoneCodeHash),
        phoneCode: normalizedCode,
      })
    );
  } catch (err) {
    console.error("[TG] SignIn error:", err.errorMessage || err.message);
    if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
      delete pendingAuth[userId];
      await savePendingSessionState(userId, {
        pendingSessionString: client.session.save(),
        pendingPhone: phoneNumber,
      });
      return { ok: true, needsPassword: true };
    }
    if (err.errorMessage === "PHONE_CODE_EXPIRED") {
      delete pendingAuth[userId];
      await destroyCachedClient(userId);
      await savePendingSessionState(userId, {
        pendingSessionString: "",
        pendingPhone: phoneNumber,
        phoneCodeHash: "",
      });
    }
    throw new Error(err.errorMessage || err.message);
  }

  await saveSessionString(userId, client.session.save());
  delete pendingAuth[userId];

  const me = await client.getMe();
  return {
    ok: true,
    id: me.id.toString(),
    firstName: me.firstName || "",
    lastName: me.lastName || "",
    username: me.username || "",
    phone: me.phone || phoneNumber,
  };
}

// ── Step 3 (optional): 2FA password ──────────────────────
async function verifyPassword(userId, password) {
  const client = await getClient(userId);
  await client.signInWithPassword(
    { apiId: API_ID, apiHash: API_HASH },
    {
      password: async () => password,
      onError: (e) => {
        throw e;
      },
    }
  );
  await saveSessionString(userId, client.session.save());
  delete pendingAuth[userId];

  const me = await client.getMe();
  // Flat shape — frontend does: me.value = r.data
  return {
    ok: true,
    id: me.id.toString(),
    firstName: me.firstName || "",
    lastName: me.lastName || "",
    username: me.username || "",
    phone: me.phone || "",
  };
}

// ── Get current user ──────────────────────────────────────
async function getMe(userId) {
  return withTelegramClient(userId, async (client) => {
    const me = await client.getMe();
    return {
      id: me.id.toString(),
      firstName: me.firstName,
      lastName: me.lastName || "",
      username: me.username || "",
      phone: me.phone || "",
    };
  });
}

// ── Download profile photo → base64 data URL ─────────────
async function getProfilePhoto(userId, entityId) {
  try {
    return await withTelegramClient(userId, async (client) => {
      const entity = await client.getEntity(
        /^-?\d+$/.test(String(entityId)) ? parseInt(entityId) : entityId
      );
      const buffer = await client.downloadProfilePhoto(entity, {
        isBig: false,
      });
      // Telegram returns a small stub buffer (~0–500 bytes) for accounts with no photo set.
      // Real profile photos are always > 2 KB — reject anything smaller.
      if (!buffer || buffer.length < 500) return null;
      return `data:image/jpeg;base64,${buffer.toString("base64")}`;
    });
  } catch {
    return null;
  }
}

// ── Get all dialogs ───────────────────────────────────────
async function getDialogs(userId, limit = 80) {
  return withTelegramClient(userId, async (client) => {
    const dialogs = await client.getDialogs({ limit });

    return dialogs.map((d) => {
      const e = d.entity;
      let type = "user";
      if (e.className === "Chat" || e.className === "ChatForbidden")
        type = "group";
      if (e.className === "Channel") type = e.megagroup ? "group" : "channel";

      // Build a human-readable last-message preview (text or media label)
      let lastMessage = d.message?.message || "";
      if (!lastMessage && d.message?.media) {
        const cn = d.message.media.className || "";
        if (cn.includes("Photo")) lastMessage = "📷 Photo";
        else if (cn.includes("Video")) lastMessage = "📹 Video";
        else if (cn.includes("Document"))
          lastMessage =
            "📎 " +
            (d.message.media.document?.attributes?.find((a) => a.fileName)
              ?.fileName || "File");
        else if (cn.includes("Audio")) lastMessage = "🎵 Audio";
        else if (cn.includes("Voice")) lastMessage = "🎤 Voice message";
        else if (cn.includes("Sticker")) lastMessage = "🎭 Sticker";
        else if (cn.includes("Gif")) lastMessage = "🎞 GIF";
        else if (cn.includes("Poll")) lastMessage = "📊 Poll";
        else if (cn.includes("Contact")) lastMessage = "👤 Contact";
        else if (cn.includes("Geo")) lastMessage = "📍 Location";
        else if (cn.includes("WebPage")) lastMessage = "🔗 Link";
        else lastMessage = "📎 Attachment";
      }

      return {
        id: String(d.id),
        name:
          d.title ||
          `${e.firstName || ""} ${e.lastName || ""}`.trim() ||
          "Unknown",
        username: e.username || null,
        type,
        unreadCount: d.dialog.unreadCount || 0,
        lastMessage,
        lastDate: toTelegramIso(d.message?.date),
        pinned: d.dialog.pinned || false,
        status: type === "user" ? parseUserStatus(e.status) : null,
      };
    });
  });
}

// ── Parse user online status ─────────────────────────────
function parseUserStatus(status) {
  if (!status) return null;
  const cn = status.className;
  if (cn === "UserStatusOnline") return { type: "online" };
  if (cn === "UserStatusOffline")
    return {
      type: "offline",
      wasOnline: status.wasOnline
        ? new Date(status.wasOnline * 1000).toISOString()
        : null,
    };
  if (cn === "UserStatusRecently") return { type: "recently" };
  if (cn === "UserStatusLastWeek") return { type: "lastWeek" };
  if (cn === "UserStatusLastMonth") return { type: "lastMonth" };
  return null;
}

function toTelegramIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 1e12 ? value : value * 1000).toISOString();
  }
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return new Date(numeric > 1e12 ? numeric : numeric * 1000).toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

// ── Parse gramjs media → clean frontend object ────────────
function parseMedia(media, msgId) {
  // Ensure msgId is a plain string/number — gramjs returns BigInt which breaks JSON.stringify
  msgId = msgId != null ? String(msgId) : null;
  if (!media) return null;
  const cn = media.className || "";

  if (cn === "MessageMediaPhoto") {
    return { type: "photo", msgId };
  }
  if (cn === "MessageMediaDocument") {
    const doc = media.document;
    const attrs = doc?.attributes || [];
    const fileAttr = attrs.find(
      (a) => a.className === "DocumentAttributeFilename"
    );
    const audioAttr = attrs.find(
      (a) => a.className === "DocumentAttributeAudio"
    );
    const videoAttr = attrs.find(
      (a) => a.className === "DocumentAttributeVideo"
    );
    const stickerAttr = attrs.find(
      (a) => a.className === "DocumentAttributeSticker"
    );
    const animAttr = attrs.find(
      (a) => a.className === "DocumentAttributeAnimated"
    );

    if (stickerAttr) return { type: "sticker", emoji: stickerAttr.alt || "🎭" };
    if (animAttr) return { type: "gif" };
    if (audioAttr?.voice)
      return {
        type: "voice",
        duration: audioAttr.duration || 0,
      };
    if (audioAttr)
      return {
        type: "audio",
        fileName: fileAttr?.fileName || audioAttr.title || "Audio",
        duration: audioAttr.duration || 0,
        size: doc?.size ? Number(doc.size) : 0,
      };
    if (videoAttr)
      return {
        type: "video",
        duration: videoAttr.duration || 0,
        size: doc?.size ? Number(doc.size) : 0,
        msgId,
      };
    return {
      type: "document",
      fileName: fileAttr?.fileName || "File",
      size: doc?.size ? Number(doc.size) : 0,
      mimeType: doc?.mimeType || "",
      msgId,
    };
  }
  if (cn === "MessageMediaGeo" || cn === "MessageMediaGeoLive") {
    return { type: "location", lat: media.geo?.lat, long: media.geo?.long };
  }
  if (cn === "MessageMediaContact") {
    return {
      type: "contact",
      name: `${media.firstName || ""} ${media.lastName || ""}`.trim(),
      phone: media.phoneNumber || "",
    };
  }
  if (cn === "MessageMediaPoll") {
    return { type: "poll", question: media.poll?.question || "Poll" };
  }
  if (cn === "MessageMediaWebPage") {
    const wp = media.webpage;
    return {
      type: "webpage",
      title: wp?.title || "",
      description: wp?.description || "",
      url: wp?.url || wp?.displayUrl || "",
    };
  }
  if (cn === "MessageMediaUnsupported") {
    return { type: "unsupported" };
  }
  // fallback
  return { type: cn.replace("MessageMedia", "").toLowerCase() || "attachment" };
}

// ── Get messages from a dialog ────────────────────────────
async function getMessages(userId, dialogId, limit = 50, offsetId = 0) {
  return withTelegramClient(userId, async (client) => {
    const me = await client.getMe();
    const myId = me.id.toString();

    const entity = await client.getEntity(
      /^-?\d+$/.test(dialogId) ? parseInt(dialogId) : dialogId
    );
    const msgs = await client.getMessages(entity, {
      limit,
      offsetId: offsetId || 0,
    });

    return msgs.reverse().map((m) => {
      const fromId = m.senderId?.toString() || null;
      return {
        id: typeof m.id === "bigint" ? Number(m.id) : m.id,
        text: m.message || "",
        fromId,
        fromMe: fromId === myId,
        fromName: m.sender
          ? `${m.sender.firstName || ""} ${m.sender.lastName || ""}`.trim() ||
            m.sender.username ||
            "User"
          : "",
        fromUsername: m.sender?.username || null,
        date: toTelegramIso(m.date),
        replyTo: m.replyTo?.replyToMsgId || null,
        views: m.views || null,
        media: parseMedia(m.media, m.id),
      };
    });
  });
}

// ── Send a message ────────────────────────────────────────
async function sendMessage(userId, dialogId, text, replyToMsgId) {
  return withTelegramClient(userId, async (client) => {
    const entity = await client.getEntity(
      /^-?\d+$/.test(dialogId) ? parseInt(dialogId) : dialogId
    );
    const opts = { message: text };
    if (replyToMsgId) opts.replyTo = parseInt(replyToMsgId);
    const result = await client.sendMessage(entity, opts);
    return { ok: true, messageId: result.id };
  });
}

// ── Send a file (photo / video / document) ───────────────
// buffer: Buffer, fileName: string, mimeType: string, caption: string
async function sendFile(userId, dialogId, buffer, fileName, mimeType, caption) {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");

  // Write buffer to a temp file — gramjs file-path API is most reliable
  const tmpPath = path.join(os.tmpdir(), `tg_upload_${Date.now()}_${fileName}`);
  fs.writeFileSync(tmpPath, buffer);

  try {
    return await withTelegramClient(userId, async (client) => {
      const entity = await client.getEntity(
        /^-?\d+$/.test(dialogId) ? parseInt(dialogId) : dialogId
      );
      const isMedia = /^(image|video)\//i.test(mimeType || "");
      const result = await client.sendFile(entity, {
        file: tmpPath,
        caption: caption || "",
        forceDocument: !isMedia, // photos/videos show inline; docs as file
        workers: 1,
      });
      return {
        ok: true,
        messageId:
          typeof result?.id === "bigint" ? Number(result.id) : result?.id,
      };
    });
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {} // always clean up temp file
  }
}

// ── Get contacts ──────────────────────────────────────────
async function getContacts(userId) {
  return withTelegramClient(userId, async (client) => {
    await validateAuthorizedSession(userId, client);
    const result = await client.invoke(
      new Api.contacts.GetContacts({ hash: BigInt(0) })
    );
    return (result.users || []).map((u) => ({
      id: u.id.toString(),
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      phone: u.phone || "",
      username: u.username || "",
      isBot: u.bot || false,
    }));
  });
}

// ── Get saved messages (self-chat) ────────────────────────
async function getSavedMessages(userId, limit = 50) {
  return withTelegramClient(userId, async (client) => {
    await validateAuthorizedSession(userId, client);
    // "me" as entity = Saved Messages
    const msgs = await client.getMessages("me", { limit });
    return msgs.reverse().map((m) => ({
      id: String(typeof m.id === "bigint" ? Number(m.id) : m.id),
      text: m.message || "",
      date: toTelegramIso(m.date),
      fromMe: true,
      media: m.media ? m.media.className : null,
    }));
  });
}

// ── Download media from a message → base64 data URL ──────
async function downloadMedia(userId, dialogId, msgId) {
  return withTelegramClient(userId, async (client) => {
    const entity = await client.getEntity(
      /^-?\d+$/.test(dialogId) ? parseInt(dialogId) : dialogId
    );
    const [msg] = await client.getMessages(entity, { ids: [parseInt(msgId)] });
    if (!msg?.media) throw new Error("No media in message");

    const buffer = await client.downloadMedia(msg, { workers: 1 });
    if (!buffer || !buffer.length) throw new Error("Empty media download");

    // Detect mime type from className
    const cn = msg.media.className || "";
    let mime = "application/octet-stream";
    if (cn === "MessageMediaPhoto") mime = "image/jpeg";
    else if (cn === "MessageMediaDocument") {
      mime = msg.media.document?.mimeType || "application/octet-stream";
    }

    return {
      data: `data:${mime};base64,${buffer.toString("base64")}`,
      mime,
      fileName:
        msg.media.document?.attributes?.find(
          (a) => a.className === "DocumentAttributeFilename"
        )?.fileName || `file_${msgId}`,
    };
  });
}

// ── Edit a message ────────────────────────────────────────────────────
async function editMessage(userId, dialogId, msgId, text) {
  return withTelegramClient(userId, async (client) => {
    const entity = await client.getEntity(
      /^-?\d+$/.test(dialogId) ? parseInt(dialogId) : dialogId
    );
    await client.invoke(
      new Api.messages.EditMessage({
        peer: entity,
        id: parseInt(msgId),
        message: text,
      })
    );
    return { ok: true };
  });
}

// ── Delete a message ──────────────────────────────────────
async function deleteMessage(userId, dialogId, msgId) {
  return withTelegramClient(userId, async (client) => {
    const entity = await client.getEntity(
      /^-?\d+$/.test(dialogId) ? parseInt(dialogId) : dialogId
    );
    await client.deleteMessages(entity, [parseInt(msgId)], { revoke: true });
    return { ok: true };
  });
}

// ── Send emoji reaction ───────────────────────────────────
async function sendReaction(userId, dialogId, msgId, emoticon) {
  return withTelegramClient(userId, async (client) => {
    const entity = await client.getEntity(
      /^-?\d+$/.test(dialogId) ? parseInt(dialogId) : dialogId
    );
    await client.invoke(
      new Api.messages.SendReaction({
        peer: entity,
        msgId: parseInt(msgId),
        reaction: emoticon ? [new Api.ReactionEmoji({ emoticon })] : [],
      })
    );
    return { ok: true };
  });
}

// ── Mark dialog messages as read ──────────────────────────────
async function markAsRead(userId, dialogId) {
  try {
    return await withTelegramClient(userId, async (client) => {
      const entity = await client.getEntity(
        /^-?\d+$/.test(dialogId) ? parseInt(dialogId) : dialogId
      );
      await client.invoke(
        new Api.messages.ReadHistory({ peer: entity, maxId: 0 })
      );
      return { ok: true };
    });
  } catch (e) {
    // Non-fatal — log but don't throw
    console.warn("markAsRead failed:", e.message);
    return { ok: false };
  }
}

// ── Logout ────────────────────────────────────────────────
async function logout(userId) {
  try {
    await withTelegramClient(userId, async (client) => {
      await client.invoke(new Api.auth.LogOut());
    });
  } catch {}
  delete pendingAuth[userId];
  await destroyCachedClient(userId);
  await clearSessionState(userId);
}

module.exports = {
  isAuthorized,
  sendPhoneCode,
  verifyPhoneCode,
  verifyPassword,
  getMe,
  getProfilePhoto,
  getDialogs,
  getMessages,
  sendMessage,
  sendFile,
  getContacts,
  getSavedMessages,
  downloadMedia,
  editMessage,
  deleteMessage,
  sendReaction,
  markAsRead,
  logout,
  getClient,
  __test: {
    isInvalidSessionError,
    createReconnectRequiredError,
    createPendingAuthToken,
    readPendingAuthToken,
    toTelegramIso,
  },
};
