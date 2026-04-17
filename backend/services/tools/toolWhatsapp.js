"use strict";

const Integration = require("../../models/Integration");
const {
  connectWhatsAppIntegration,
  getWhatsAppStatus,
  listWhatsAppChats,
  getWhatsAppRoomTimeline,
  sendWhatsAppMessage,
  getWhatsAppUnreadSummary,
  invalidateWhatsAppCache,
} = require("../whatsappMatrixService");

function summarizeMessage(message = {}) {
  if (message.deleted) return "Message deleted";
  if (message.text) return message.text;
  if (message.isVoice) return "Voice message";
  const attachment = Array.isArray(message.attachments) ? message.attachments[0] : null;
  if (!attachment) return "";
  if (attachment.type === "image") return "Image";
  if (attachment.type === "video") return "Video";
  if (attachment.type === "audio") return "Audio";
  return attachment.fileName || "Attachment";
}

function formatChatForTool(chat = {}) {
  return {
    id: chat.roomId || chat.id,
    roomId: chat.roomId || chat.id,
    name: chat.title || chat.name || "WhatsApp",
    title: chat.title || chat.name || "WhatsApp",
    isGroup: Boolean(chat.isGroup),
    unread: Number(chat.unreadCount || 0),
    unreadCount: Number(chat.unreadCount || 0),
    lastMessage: chat.lastMessagePreview || "",
    lastMessagePreview: chat.lastMessagePreview || "",
    lastMessageAt: chat.lastMessageAt || null,
    pinned: Boolean(chat.isPinned),
    muted: Boolean(chat.isMuted),
    avatarUrl: chat.avatarUrl || "",
  };
}

function formatMessageForTool(message = {}) {
  return {
    id: message.id,
    from: message.direction === "outbound" ? "You" : message.senderName || "WhatsApp",
    senderName: message.senderName || "WhatsApp",
    senderId: message.senderId || "",
    message: summarizeMessage(message),
    text: message.text || "",
    timestamp:
      message.timeLabel ||
      (message.timestamp
        ? new Date(message.timestamp).toLocaleString("en-IN")
        : ""),
    isoTimestamp: message.timestamp || null,
    fromMe: message.direction === "outbound" || Boolean(message.fromMe),
    type: message.isVoice
      ? "audio"
      : Array.isArray(message.attachments) && message.attachments[0]?.type
        ? message.attachments[0].type
        : "chat",
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    reactions: Array.isArray(message.reactions) ? message.reactions : [],
  };
}

async function whatsappConnect(params, ctx) {
  const { userId } = ctx;
  const result = await connectWhatsAppIntegration(userId, params || {});
  const status = result?.status || null;

  return {
    ok: true,
    status: status?.connected ? "connected" : status?.loginState || "disconnected",
    connected: Boolean(status?.connected),
    qrImage: status?.qrImageUrl || null,
    integration: result?.clientIntegration || result?.integration || null,
    message: status?.connected
      ? "WhatsApp already connected"
      : "WhatsApp is preparing a QR code inside OrionAI.",
  };
}

async function whatsappDisconnect(params, ctx) {
  const { userId } = ctx;
  await Integration.findOneAndDelete({ userId, type: "whatsapp" });
  invalidateWhatsAppCache(userId);
  return { ok: true };
}

async function whatsappSend(params, ctx) {
  const { userId } = ctx;
  const target = String(params?.to || params?.contact || "").trim();
  const message = String(params?.message || params?.text || "").trim();

  if (!target || !message) {
    throw new Error("to/contact and message are required");
  }

  const sendResult = await sendWhatsAppMessage(
    userId,
    target,
    message,
    {
      replyToEventId: params?.replyToEventId || null,
    }
  );

  const chats = await listWhatsAppChats(userId, { limit: 200 }).catch(() => []);
  const chat =
    chats.find(
      (entry) => String(entry.roomId || entry.id) === String(sendResult.roomId || "")
    ) || null;

  return {
    ok: true,
    to: chat?.title || chat?.name || target,
    chatId: sendResult.roomId || target,
    roomId: sendResult.roomId || target,
    message,
    msgId: sendResult.eventId || null,
    summary: `WhatsApp sent to ${chat?.title || chat?.name || target}`,
  };
}

async function whatsappGetMessages(params, ctx) {
  const { userId } = ctx;
  const target = String(params?.contact || params?.chatId || params?.roomId || "").trim();
  const limit = Number(params?.limit || 20) || 20;

  const timeline = await getWhatsAppRoomTimeline(userId, target, { limit });
  const messages = (timeline.messages || []).map(formatMessageForTool);

  return {
    ok: true,
    chatId: timeline.room?.roomId || target,
    roomId: timeline.room?.roomId || target,
    chatName: timeline.room?.title || timeline.room?.name || target,
    count: messages.length,
    messages,
    summary: `${messages.length} messages from ${timeline.room?.title || timeline.room?.name || "WhatsApp"}`,
  };
}

async function whatsappGetUnread(params, ctx) {
  const { userId } = ctx;
  const result = await getWhatsAppUnreadSummary(userId);
  if (!result) return null;

  return {
    ok: true,
    totalUnread: Number(result.count || 0),
    chatCount: Array.isArray(result.chats) ? result.chats.length : 0,
    chats: Array.isArray(result.chats) ? result.chats : [],
    summary: result.summary || null,
  };
}

async function whatsappListChats(params, ctx) {
  const { userId } = ctx;
  const chats = await listWhatsAppChats(userId, {
    limit: Number(params?.limit || 30) || 30,
    search: String(params?.search || "").trim(),
  });

  return {
    ok: true,
    total: chats.length,
    chats: chats.map(formatChatForTool),
    summary: `${chats.length} WhatsApp chats`,
  };
}

async function whatsappStatus(params, ctx) {
  const { userId } = ctx;
  const status = await getWhatsAppStatus(userId);
  return {
    ok: true,
    connected: Boolean(status?.connected),
    status: status?.connected ? "connected" : status?.loginState || "disconnected",
    loginState: status?.loginState || "disconnected",
    qrImage: status?.qrImageUrl || null,
    ...status,
  };
}

async function toolWhatsApp(params, ctx) {
  const action = String(params?.action || "").trim();

  switch (action) {
    case "connect":
      return whatsappConnect(params, ctx);
    case "disconnect":
      return whatsappDisconnect(params, ctx);
    case "send":
      return whatsappSend(params, ctx);
    case "get_messages":
      return whatsappGetMessages(params, ctx);
    case "get_unread":
      return whatsappGetUnread(params, ctx);
    case "list_chats":
      return whatsappListChats(params, ctx);
    case "status":
      return whatsappStatus(params, ctx);
    default:
      throw new Error(`Unknown WhatsApp action: ${action}`);
  }
}

async function getOrCreateClient() {
  return null;
}

module.exports = {
  toolWhatsApp,
  whatsappGetUnread,
  getOrCreateClient,
};
