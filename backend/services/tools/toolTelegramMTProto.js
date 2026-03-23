// backend/services/tools/toolTelegramMTProto.js
// npm install telegram input
//
// Get API_ID and API_HASH from https://my.telegram.org → App configuration
// Set in your .env:  TELEGRAM_API_ID=12345  TELEGRAM_API_HASH=abc123...

const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram");
const Integration = require("../../models/Integration");

const API_ID = parseInt(process.env.TELEGRAM_API_ID || "0");
const API_HASH = process.env.TELEGRAM_API_HASH || "";

// In-memory client cache per userId  { userId: TelegramClient }
const clients = {};

// ── Load session string from DB ───────────────────────────
async function getSessionString(userId) {
  const doc = await Integration.findOne({ userId });
  return doc?.telegram?.sessionString || "";
}

async function saveSessionString(userId, sessionString) {
  await Integration.findOneAndUpdate(
    { userId },
    { $set: { "telegram.sessionString": sessionString } },
    { upsert: true }
  );
}

// ── Build / reuse a client ────────────────────────────────
async function getClient(userId) {
  if (clients[userId]?.connected) return clients[userId];
  const sessionString = await getSessionString(userId);
  const session = new StringSession(sessionString || "");
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 3,
  });
  await client.connect();
  clients[userId] = client;
  return client;
}

// ── Check if authorized ───────────────────────────────────
async function isAuthorized(userId) {
  try {
    const client = await getClient(userId);
    return await client.isUserAuthorized();
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
  if (clients[userId]) {
    try {
      await clients[userId].disconnect();
    } catch {}
    delete clients[userId];
  }

  // Clear stale DB state (non-fatal)
  try {
    await Integration.findOneAndUpdate(
      { userId },
      {
        $unset: {
          "telegram.sessionString": "",
          "telegram.phoneCodeHash": "",
          "telegram.pendingPhone": "",
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
    result = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId: API_ID,
        apiHash: API_HASH,
        settings: new Api.CodeSettings({}),
      })
    );
  } catch (err) {
    console.error("[TG] SendCode error:", err.errorMessage || err.message);
    throw new Error(err.errorMessage || err.message || "Failed to send code");
  }

  console.log(`[TG] Code sent, hash=${result.phoneCodeHash?.slice(0, 8)}…`);

  // Store in memory first (always reliable), then DB (best-effort)
  pendingAuth[userId] = { phone, phoneCodeHash: result.phoneCodeHash };
  try {
    await Integration.findOneAndUpdate(
      { userId },
      {
        $set: {
          "telegram.sessionString": client.session.save(),
          "telegram.phoneCodeHash": result.phoneCodeHash,
          "telegram.pendingPhone": phone,
        },
      },
      { upsert: true }
    );
  } catch (e) {
    console.warn("[TG] DB save warning:", e.message);
  }

  return { ok: true };
}

// ── Step 2: Verify SMS code ───────────────────────────────
async function verifyPhoneCode(userId, code) {
  // In-memory is the ground truth (set in sendPhoneCode same process)
  // DB is a fallback for server restarts
  let phoneNumber, phoneCodeHash;

  if (pendingAuth[userId]) {
    phoneNumber = pendingAuth[userId].phone;
    phoneCodeHash = pendingAuth[userId].phoneCodeHash;
  } else {
    const doc = await Integration.findOne({ userId });
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

  // Reuse the same client that sent the code (MUST be the same connection for gramjs)
  const client = clients[userId] || (await getClient(userId));

  try {
    await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: String(phoneNumber),
        phoneCodeHash: String(phoneCodeHash),
        phoneCode: String(code).trim(),
      })
    );
  } catch (err) {
    console.error("[TG] SignIn error:", err.errorMessage || err.message);
    if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
      await saveSessionString(userId, client.session.save());
      return { ok: true, needsPassword: true };
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
  delete pendingPhones[userId];

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
  const client = await getClient(userId);
  const me = await client.getMe();
  return {
    id: me.id.toString(),
    firstName: me.firstName,
    lastName: me.lastName || "",
    username: me.username || "",
    phone: me.phone || "",
  };
}

// ── Download profile photo → base64 data URL ─────────────
async function getProfilePhoto(userId, entityId) {
  try {
    const client = await getClient(userId);
    const entity = await client.getEntity(
      /^-?\d+$/.test(String(entityId)) ? parseInt(entityId) : entityId
    );
    const buffer = await client.downloadProfilePhoto(entity, { isBig: false });
    // Telegram returns a small stub buffer (~0–500 bytes) for accounts with no photo set.
    // Real profile photos are always > 2 KB — reject anything smaller.
    if (!buffer || buffer.length < 500) return null;
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

// ── Get all dialogs ───────────────────────────────────────
async function getDialogs(userId, limit = 80) {
  const client = await getClient(userId);
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
      lastDate: d.message?.date
        ? new Date(d.message.date * 1000).toISOString()
        : null,
      pinned: d.dialog.pinned || false,
      status: type === "user" ? parseUserStatus(e.status) : null,
    };
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
  const client = await getClient(userId);
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
      date: m.date ? new Date(m.date * 1000).toISOString() : null,
      replyTo: m.replyTo?.replyToMsgId || null,
      views: m.views || null,
      media: parseMedia(m.media, m.id),
    };
  });
}

// ── Send a message ────────────────────────────────────────
async function sendMessage(userId, dialogId, text, replyToMsgId) {
  const client = await getClient(userId);
  const entity = await client.getEntity(
    /^-?\d+$/.test(dialogId) ? parseInt(dialogId) : dialogId
  );
  const opts = { message: text };
  if (replyToMsgId) opts.replyTo = parseInt(replyToMsgId);
  const result = await client.sendMessage(entity, opts);
  return { ok: true, messageId: result.id };
}

// ── Send a file (photo / video / document) ───────────────
// buffer: Buffer, fileName: string, mimeType: string, caption: string
async function sendFile(userId, dialogId, buffer, fileName, mimeType, caption) {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const client = await getClient(userId);
  const entity = await client.getEntity(
    /^-?\d+$/.test(dialogId) ? parseInt(dialogId) : dialogId
  );

  // Write buffer to a temp file — gramjs file-path API is most reliable
  const tmpPath = path.join(os.tmpdir(), `tg_upload_${Date.now()}_${fileName}`);
  fs.writeFileSync(tmpPath, buffer);

  try {
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
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {} // always clean up temp file
  }
}

// ── Get contacts ──────────────────────────────────────────
async function getContacts(userId) {
  const client = await getClient(userId);
  if (!(await client.isUserAuthorized())) throw new Error("Not authorized");
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
}

// ── Get saved messages (self-chat) ────────────────────────
async function getSavedMessages(userId, limit = 50) {
  const client = await getClient(userId);
  if (!(await client.isUserAuthorized())) throw new Error("Not authorized");
  const me = await client.getMe();
  // "me" as entity = Saved Messages
  const msgs = await client.getMessages("me", { limit });
  return msgs.reverse().map((m) => ({
    id: String(typeof m.id === "bigint" ? Number(m.id) : m.id),
    text: m.message || "",
    date: m.date ? new Date(m.date * 1000).toISOString() : null,
    fromMe: true,
    media: m.media ? m.media.className : null,
  }));
}

// ── Download media from a message → base64 data URL ──────
async function downloadMedia(userId, dialogId, msgId) {
  const client = await getClient(userId);
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
}

// ── Edit a message ────────────────────────────────────────────────────
async function editMessage(userId, dialogId, msgId, text) {
  const client = await getClient(userId);
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
}

// ── Delete a message ──────────────────────────────────────
async function deleteMessage(userId, dialogId, msgId) {
  const client = await getClient(userId);
  const entity = await client.getEntity(
    /^-?\d+$/.test(dialogId) ? parseInt(dialogId) : dialogId
  );
  await client.deleteMessages(entity, [parseInt(msgId)], { revoke: true });
  return { ok: true };
}

// ── Send emoji reaction ───────────────────────────────────
async function sendReaction(userId, dialogId, msgId, emoticon) {
  const client = await getClient(userId);
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
}

// ── Mark dialog messages as read ──────────────────────────────
async function markAsRead(userId, dialogId) {
  try {
    const client = await getClient(userId);
    const entity = await client.getEntity(
      /^-?\d+$/.test(dialogId) ? parseInt(dialogId) : dialogId
    );
    await client.invoke(
      new Api.messages.ReadHistory({ peer: entity, maxId: 0 })
    );
    return { ok: true };
  } catch (e) {
    // Non-fatal — log but don't throw
    console.warn("markAsRead failed:", e.message);
    return { ok: false };
  }
}

// ── Logout ────────────────────────────────────────────────
async function logout(userId) {
  try {
    const client = await getClient(userId);
    await client.invoke(new Api.auth.LogOut());
    await client.disconnect();
    delete clients[userId];
  } catch {}
  await Integration.findOneAndUpdate({ userId }, { $unset: { telegram: "" } });
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
};
