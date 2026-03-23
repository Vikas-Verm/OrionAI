/**
 * toolWhatsApp.js
 * 📁 backend/services/tools/toolWhatsApp.js
 *
 * WhatsApp integration using whatsapp-web.js (no Meta approval needed)
 * Works by scanning a QR code once — stays logged in via session.
 *
 * Install: npm install whatsapp-web.js qrcode
 */

"use strict";

const path        = require("path");
const Integration = require("../../models/Integration");

// ── Per-user WhatsApp client instances ───────────────────────────────────────
// Map: userId → { client, status, qr }
const clients = new Map();

// ── Initialize WhatsApp client for a user ────────────────────────────────────
async function getOrCreateClient(userId) {
  if (clients.has(userId)) return clients.get(userId);

  const { Client, LocalAuth } = require("whatsapp-web.js");

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: `orionai_${userId}`,
      dataPath: path.join(process.cwd(), ".wwebjs_auth"),
    }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  const entry = { client, status: "initializing", qr: null };
  clients.set(userId, entry);

  client.on("qr", (qr) => {
    entry.status = "qr_ready";
    entry.qr = qr;
    console.log(`📱 WhatsApp QR ready for ${userId}`);
    // Push QR to frontend via WebSocket
    try {
      const { pushToUser } = require("../websocketServer");
      pushToUser(userId, { type: "whatsapp_qr", qr });
    } catch {}
  });

  client.on("ready", async () => {
    entry.status = "connected";
    entry.qr = null;
    console.log(`✅ WhatsApp connected for ${userId}`);

    // Save connected status to Integration
    await Integration.findOneAndUpdate(
      { userId, type: "whatsapp" },
      {
        $set: {
          userId,
          type:    "whatsapp",
          name:    "WhatsApp",
          enabled: true,
          whatsapp: {
            status:    "connected",
            phone:     client.info?.wid?.user || "",
            connectedAt: new Date(),
          },
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    try {
      const { pushToUser } = require("../websocketServer");
      pushToUser(userId, {
        type:   "whatsapp_connected",
        phone:  client.info?.wid?.user || "",
      });
    } catch {}
  });

  client.on("disconnected", async (reason) => {
    entry.status = "disconnected";
    console.log(`WhatsApp disconnected for ${userId}:`, reason);
    clients.delete(userId);

    await Integration.findOneAndUpdate(
      { userId, type: "whatsapp" },
      { $set: { "whatsapp.status": "disconnected", updatedAt: new Date() } }
    );

    try {
      const { pushToUser } = require("../websocketServer");
      pushToUser(userId, { type: "whatsapp_disconnected", reason });
    } catch {}
  });

  // New message received — push to frontend via WS
  client.on("message", async (msg) => {
    if (msg.fromMe) return; // ignore sent messages

    const contact = await msg.getContact();
    const chat    = await msg.getChat();

    try {
      const { pushToUser } = require("../websocketServer");
      pushToUser(userId, {
        type:      "whatsapp_message",
        from:      contact.pushname || contact.number,
        phone:     contact.number,
        message:   msg.body,
        chatId:    chat.id._serialized,
        chatName:  chat.name,
        isGroup:   chat.isGroup,
        timestamp: msg.timestamp,
        msgId:     msg.id._serialized,
      });
    } catch {}
  });

  await client.initialize();
  return entry;
}

// ── START / CONNECT ───────────────────────────────────────────────────────────
async function whatsappConnect(params, ctx) {
  const { userId } = ctx;
  try {
    const entry = await getOrCreateClient(userId);
    return {
      ok:     true,
      status: entry.status,
      message: entry.status === "connected"
        ? "WhatsApp already connected"
        : "WhatsApp initializing — scan the QR code",
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── DISCONNECT ────────────────────────────────────────────────────────────────
async function whatsappDisconnect(params, ctx) {
  const { userId } = ctx;
  const entry = clients.get(userId);
  if (entry?.client) {
    await entry.client.destroy();
    clients.delete(userId);
  }
  await Integration.findOneAndDelete({ userId, type: "whatsapp" });
  return { ok: true };
}

// ── SEND MESSAGE ──────────────────────────────────────────────────────────────
async function whatsappSend(params, ctx) {
  const { userId } = ctx;
  const { to, message, isGroup } = params;

  if (!to || !message) throw new Error("to and message are required");

  const entry = clients.get(userId);
  if (!entry || entry.status !== "connected") {
    throw new Error("WhatsApp not connected. Please connect first.");
  }

  // Format phone number → WhatsApp chat ID
  // Individual: 919999999999@c.us
  // Group: use group ID directly
  let chatId = to;
  if (!to.includes("@")) {
    const phone = to.replace(/[^0-9]/g, ""); // strip non-digits
    chatId = isGroup ? to : `${phone}@c.us`;
  }

  const sentMsg = await entry.client.sendMessage(chatId, message);
  return {
    ok:      true,
    to,
    message,
    msgId:   sentMsg.id._serialized,
    summary: `WhatsApp sent to ${to}`,
  };
}

// ── GET MESSAGES from a chat ──────────────────────────────────────────────────
async function whatsappGetMessages(params, ctx) {
  const { userId } = ctx;
  const { contact, limit = 20 } = params;

  const entry = clients.get(userId);
  if (!entry || entry.status !== "connected") {
    throw new Error("WhatsApp not connected");
  }

  // Find chat by contact name or number
  const chats = await entry.client.getChats();
  const chat  = chats.find(c =>
    c.name?.toLowerCase().includes(contact?.toLowerCase()) ||
    c.id?.user === contact?.replace(/[^0-9]/g, "")
  );

  if (!chat) throw new Error(`No WhatsApp chat found for: ${contact}`);

  const messages = await chat.fetchMessages({ limit });
  const formatted = messages.map(m => ({
    id:        m.id._serialized,
    from:      m.fromMe ? "You" : (m._data?.notifyName || m.from),
    message:   m.body,
    timestamp: new Date(m.timestamp * 1000).toLocaleString("en-IN"),
    fromMe:    m.fromMe,
    type:      m.type,
  }));

  return {
    ok:       true,
    chatName: chat.name,
    count:    formatted.length,
    messages: formatted,
    summary:  `${formatted.length} messages from ${chat.name}`,
  };
}

// ── GET UNREAD ────────────────────────────────────────────────────────────────
async function whatsappGetUnread(params, ctx) {
  const { userId } = ctx;
  const { limit = 20 } = params;

  const entry = clients.get(userId);
  if (!entry || entry.status !== "connected") return null;

  const chats       = await entry.client.getChats();
  const unreadChats = chats
    .filter(c => c.unreadCount > 0)
    .slice(0, limit)
    .map(c => ({
      chatId:      c.id._serialized,
      chatName:    c.name,
      unreadCount: c.unreadCount,
      isGroup:     c.isGroup,
      lastMessage: c.lastMessage?.body?.slice(0, 80) || "",
    }));

  const totalUnread = unreadChats.reduce((s, c) => s + c.unreadCount, 0);

  return {
    ok:           true,
    totalUnread,
    chatCount:    unreadChats.length,
    chats:        unreadChats,
    summary:      totalUnread > 0
      ? `${totalUnread} unread across ${unreadChats.length} chats`
      : "No unread WhatsApp messages",
  };
}

// ── LIST CHATS ────────────────────────────────────────────────────────────────
async function whatsappListChats(params, ctx) {
  const { userId } = ctx;
  const { limit = 30 } = params;

  const entry = clients.get(userId);
  if (!entry || entry.status !== "connected") {
    throw new Error("WhatsApp not connected");
  }

  const chats = (await entry.client.getChats()).slice(0, limit);
  return {
    ok:    true,
    total: chats.length,
    chats: chats.map(c => ({
      id:          c.id._serialized,
      name:        c.name,
      isGroup:     c.isGroup,
      unread:      c.unreadCount,
      lastMessage: c.lastMessage?.body?.slice(0, 60) || "",
      pinned:      c.pinned,
    })),
    summary: `${chats.length} WhatsApp chats`,
  };
}

// ── GET STATUS ────────────────────────────────────────────────────────────────
function whatsappStatus(params, ctx) {
  const { userId } = ctx;
  const entry = clients.get(userId);
  return {
    ok:     true,
    status: entry?.status || "not_initialized",
    qr:     entry?.qr || null,
  };
}

// ── MAIN TOOL DISPATCHER ──────────────────────────────────────────────────────
async function toolWhatsApp(params, ctx) {
  const { action } = params;
  switch (action) {
    case "connect":      return whatsappConnect(params, ctx);
    case "disconnect":   return whatsappDisconnect(params, ctx);
    case "send":         return whatsappSend(params, ctx);
    case "get_messages": return whatsappGetMessages(params, ctx);
    case "get_unread":   return whatsappGetUnread(params, ctx);
    case "list_chats":   return whatsappListChats(params, ctx);
    case "status":       return whatsappStatus(params, ctx);
    default:             throw new Error(`Unknown WhatsApp action: ${action}`);
  }
}

module.exports = { toolWhatsApp, whatsappGetUnread, getOrCreateClient };