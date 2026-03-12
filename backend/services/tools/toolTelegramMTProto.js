/**
 * toolTelegramMTProto.js
 * gramjs MTProto client — logs in as the real Telegram user (like Telegram Web)
 * NOT a bot. Full read/send access to the user's own account.
 *
 * SETUP:
 *   npm install telegram input
 *   .env: TELEGRAM_API_ID=12345  TELEGRAM_API_HASH=abcdef...
 *   Get keys from: https://my.telegram.org → API development tools → Create app
 */

const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram");
const Integration = require("../../models/Integration");

const API_ID = parseInt(process.env.TELEGRAM_API_ID || "0", 10);
const API_HASH = process.env.TELEGRAM_API_HASH || "";

// In-memory pool: userId → { client, phoneCodeHash, phone }
const sessions = new Map();

// ── Get or restore a TelegramClient for this user ──────────────────────────
async function getClient(userId) {
  if (sessions.has(userId)) {
    const s = sessions.get(userId);
    if (s.client) return s.client;
  }

  const int = await Integration.findOne({ userId, type: "telegram" });
  const sessionStr = int?.telegram?.sessionString || "";
  const client = new TelegramClient(
    new StringSession(sessionStr),
    API_ID,
    API_HASH,
    {
      connectionRetries: 3,
      useWSS: false,
    }
  );

  await client.connect();
  sessions.set(userId, { client, phoneCodeHash: null, phone: null });
  return client;
}

// ── AUTH STEP 1: send code to phone ────────────────────────────────────────
async function sendPhoneCode(userId, phone) {
  const client = new TelegramClient(new StringSession(""), API_ID, API_HASH, {
    connectionRetries: 3,
    useWSS: false,
  });
  await client.connect();

  const result = await client.sendCode(
    { apiId: API_ID, apiHash: API_HASH },
    phone
  );

  sessions.set(userId, { client, phoneCodeHash: result.phoneCodeHash, phone });
  return { ok: true };
}

// ── AUTH STEP 2: verify SMS/app code ──────────────────────────────────────
async function verifyPhoneCode(userId, code) {
  const sess = sessions.get(userId);
  if (!sess?.client)
    throw new Error("No pending auth. Send phone number first.");

  const { client, phone, phoneCodeHash } = sess;

  try {
    await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: phone,
        phoneCodeHash,
        phoneCode: String(code).trim(),
      })
    );
  } catch (err) {
    if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
      return { ok: true, needsPassword: true };
    }
    throw err;
  }

  return await _finalizeSession(userId, client);
}

// ── AUTH STEP 3: 2FA password (only if Step 2 returns needsPassword:true) ──
async function verifyPassword(userId, password) {
  const sess = sessions.get(userId);
  if (!sess?.client) throw new Error("No pending auth session.");

  const { client } = sess;
  const pwdInfo = await client.invoke(new Api.account.GetPassword());
  const check = await client._computeCheck(pwdInfo, password);
  await client.invoke(new Api.auth.CheckPassword({ password: check }));

  return await _finalizeSession(userId, client);
}

// ── INTERNAL: persist session after successful auth ────────────────────────
async function _finalizeSession(userId, client) {
  const sessionString = client.session.save();
  const me = await client.getMe();

  await Integration.findOneAndUpdate(
    { userId, type: "telegram" },
    {
      $set: {
        userId,
        type: "telegram",
        enabled: true,
        "telegram.sessionString": sessionString,
        "telegram.phone": String(me.phone || ""),
        "telegram.username": String(me.username || ""),
        "telegram.firstName": String(me.firstName || ""),
        updatedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  sessions.set(userId, { client, phoneCodeHash: null, phone: null });

  return {
    ok: true,
    needsPassword: false,
    phone: me.phone,
    username: me.username,
    firstName: me.firstName,
  };
}

// ── Check if session is still valid ──────────────────────────────────────
async function isAuthorized(userId) {
  try {
    const client = await getClient(userId);
    return await client.isUserAuthorized();
  } catch (_) {
    return false;
  }
}

// ── Get logged-in user info ───────────────────────────────────────────────
async function getMe(userId) {
  const client = await getClient(userId);
  if (!(await client.isUserAuthorized()))
    throw new Error("Telegram not authorized");
  const me = await client.getMe();
  return {
    phone: me.phone,
    username: me.username,
    firstName: me.firstName,
    lastName: me.lastName,
  };
}

// ── Get all dialogs (chats, groups, channels) ─────────────────────────────
async function getDialogs(userId, limit = 80) {
  const client = await getClient(userId);
  if (!(await client.isUserAuthorized()))
    throw new Error("Telegram not authorized");

  const dialogs = await client.getDialogs({ limit });

  return dialogs.map((d) => {
    const e = d.entity;
    const isUser = e?.className === "User";
    const isGroup = e?.className === "Chat" || e?.megagroup === true;
    return {
      id: String(d.id),
      name: d.name || d.title || "Unknown",
      type: isUser ? "user" : isGroup ? "group" : "channel",
      unreadCount: d.unreadCount || 0,
      lastMessage: d.message?.message || "",
      lastDate: d.date ? new Date(d.date * 1000).toISOString() : null,
      pinned: d.pinned || false,
      phone: isUser ? e?.phone || "" : "",
      username: e?.username || "",
    };
  });
}

// ── Get messages for a dialog ─────────────────────────────────────────────
async function getMessages(userId, dialogId, limit = 30, offsetId = 0) {
  const client = await getClient(userId);
  if (!(await client.isUserAuthorized()))
    throw new Error("Telegram not authorized");

  const msgs = await client.getMessages(dialogId, {
    limit,
    offsetId: offsetId || undefined,
  });

  const me = await client.getMe();

  return msgs.reverse().map((m) => ({
    id: String(m.id),
    text: m.message || "",
    date: m.date ? new Date(m.date * 1000).toISOString() : null,
    fromMe: m.out || String(m.fromId?.userId) === String(me.id),
    fromName: m.sender?.firstName || m.sender?.title || "Unknown",
    fromId: String(m.fromId?.userId || m.fromId?.channelId || ""),
  }));
}

// ── Send a message ────────────────────────────────────────────────────────
async function sendMessage(userId, dialogId, text) {
  const client = await getClient(userId);
  if (!(await client.isUserAuthorized()))
    throw new Error("Telegram not authorized");

  const result = await client.sendMessage(dialogId, { message: text });
  return {
    ok: true,
    messageId: String(result.id),
    text,
    date: new Date(result.date * 1000).toISOString(),
  };
}

// ── Logout and wipe session ───────────────────────────────────────────────
async function logout(userId) {
  if (sessions.has(userId)) {
    try {
      await sessions.get(userId).client.invoke(new Api.auth.LogOut());
    } catch (_) {}
    sessions.delete(userId);
  }
  await Integration.deleteOne({ userId, type: "telegram" });
  return { ok: true };
}

// REPLACE your getProfilePhoto with this:
async function getProfilePhoto(userId, entityId) {
  try {
    const client = await getClient(userId);
    const resolvedId = /^-?\d+$/.test(String(entityId))
      ? parseInt(entityId)
      : entityId;
    const entity = await client.getEntity(resolvedId);
    const buffer = await client.downloadProfilePhoto(entity, { isBig: false });
    // Telegram returns a small stub (~0–500 bytes) for accounts with no photo.
    // Real photos are always > 2 KB — reject anything smaller.
    if (!buffer || buffer.length < 2000) return null;
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch (_) {
    return null;
  }
}
module.exports = {
  sendPhoneCode,
  verifyPhoneCode,
  verifyPassword,
  getMe,
  getDialogs,
  getMessages,
  sendMessage,
  logout,
  isAuthorized,
  getProfilePhoto,
};
