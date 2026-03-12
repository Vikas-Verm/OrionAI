/**
 * toolTelegram.js
 * Agent-facing Telegram tools — wired into agentService.js switch cases
 */

const tg = require("./toolTelegramMTProto");

// ── fuzzy-match a dialog by name/username ──────────────────────────────────
function fuzzyFind(dialogs, name) {
  const q = (name || "").toLowerCase().trim();
  if (!q) return null;
  return (
    dialogs.find((d) => d.name.toLowerCase() === q) ||
    dialogs.find((d) => d.name.toLowerCase().startsWith(q)) ||
    dialogs.find((d) => d.name.toLowerCase().includes(q)) ||
    dialogs.find((d) => d.username?.toLowerCase() === q) ||
    null
  );
}

// ── telegram_list_chats ────────────────────────────────────────────────────
async function toolTelegramListChats(params, ctx) {
  const dialogs = await tg.getDialogs(ctx.userId, 80);
  const unreadCount = dialogs.reduce((s, d) => s + (d.unreadCount || 0), 0);

  return {
    chats: dialogs.slice(0, 30).map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      unread: d.unreadCount,
      lastMessage: d.lastMessage,
      lastDate: d.lastDate,
    })),
    total: dialogs.length,
    unreadCount,
    summary: `${dialogs.length} Telegram chats · ${unreadCount} unread`,
  };
}

// ── telegram_get_messages ──────────────────────────────────────────────────
async function toolTelegramGetMessages(params, ctx) {
  const { contact, limit = 20 } = params;

  const dialogs = await tg.getDialogs(ctx.userId, 80);
  const dialog = fuzzyFind(dialogs, contact);

  if (!dialog) {
    return {
      ok: false,
      contact,
      messages: [],
      count: 0,
      summary: `No Telegram chat found matching "${contact}"`,
    };
  }

  const messages = await tg.getMessages(ctx.userId, dialog.id, limit);

  return {
    ok: true,
    chatId: dialog.id,
    chatName: dialog.name,
    contact: dialog.name,
    messages,
    count: messages.length,
    summary: `${messages.length} messages from ${dialog.name} on Telegram`,
  };
}

// ── telegram_send_message ──────────────────────────────────────────────────
async function toolTelegramSendMessage(params, ctx) {
  const { contact, message } = params;
  if (!message)
    throw new Error("telegram_send_message: message text is required");

  const dialogs = await tg.getDialogs(ctx.userId, 80);
  const dialog = fuzzyFind(dialogs, contact);

  if (!dialog) {
    return {
      ok: false,
      contact,
      message,
      summary: `No Telegram chat found matching "${contact}"`,
    };
  }

  const result = await tg.sendMessage(ctx.userId, dialog.id, message);

  return {
    ok: true,
    to: dialog.name,
    chatId: dialog.id,
    message,
    messageId: result.messageId,
    summary: `Message sent to ${dialog.name} on Telegram`,
  };
}

module.exports = {
  toolTelegramListChats,
  toolTelegramGetMessages,
  toolTelegramSendMessage,
};
