/**
 * toolTelegram.js
 * LLM-safe Telegram tools (auto-healing parameters)
 */

const tg = require("./toolTelegramMTProto");
const { filterTelegramDialogs } = require("../agentMessageFilterService");
const {
  findBestCommunicationMatch,
} = require("../communicationContactMatcher");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clean(value) {
  if (!value) return null;
  if (value === "undefined") return null;
  if (value === "null") return null;
  return String(value).trim();
}

function initials(name = "") {
  const w = name.trim().split(/\s+/);
  return w.length >= 2
    ? (w[0][0] + w[1][0]).toUpperCase()
    : (name.slice(0, 2) || "?").toUpperCase();
}

function fuzzyFind(dialogs, name) {
  const query = clean(name);
  if (!query) return null;

  const match = findBestCommunicationMatch(
    query,
    dialogs.map((dialog) => ({
      record: dialog,
      fields: [
        dialog.name,
        dialog.username,
        dialog.username ? `@${dialog.username}` : null,
      ],
    }))
  );

  return match?.item?.record || null;
}

function resolveDialog(dialogs = [], contact = "", options = {}) {
  const includeGroups = Boolean(options.includeGroups);
  const preferredDialogs = filterTelegramDialogs(dialogs, { includeGroups });
  const match = fuzzyFind(preferredDialogs, contact);
  if (match) return match;
  return includeGroups ? null : fuzzyFind(dialogs, contact);
}

async function resolveTelegramContact(params = {}, ctx) {
  const contact = clean(params.contact);
  if (!contact) {
    return {
      ok: false,
      contact,
      summary: "Telegram contact name required",
    };
  }

  const dialogs = await tg.getDialogs(ctx.userId, 80);
  const dialog = resolveDialog(dialogs, contact, {
    includeGroups: Boolean(params.includeGroups),
  });

  if (!dialog) {
    return {
      ok: false,
      contact,
      summary: `No Telegram contact found for: ${contact}`,
    };
  }

  return {
    ok: true,
    contact,
    chatId: String(dialog.id),
    name: dialog.name,
    username: dialog.username || null,
    type: dialog.type || null,
    unreadCount: dialog.unreadCount || 0,
    dialog,
    summary: `${dialog.name} (${dialog.type || "chat"})`,
  };
}

// get most recent chat fallback
function mostRecent(dialogs) {
  return dialogs.sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate))[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// telegram_list_chats
// ─────────────────────────────────────────────────────────────────────────────

async function toolTelegramListChats(params, ctx) {
  const { includeGroups = false } = params;
  const dialogs = await tg.getDialogs(ctx.userId, 80);
  const filteredDialogs = filterTelegramDialogs(dialogs, { includeGroups });

  const unreadCount = filteredDialogs.reduce(
    (s, d) => s + (d.unreadCount || 0),
    0
  );

  return {
    chats: filteredDialogs.slice(0, 30).map((d) => ({
      id: d.id,
      name: d.name,
      initials: initials(d.name),
      type: d.type,
      unread: d.unreadCount,
      lastMessage: d.lastMessage,
      lastDate: d.lastDate,
      status: d.status || null,
    })),
    total: filteredDialogs.length,
    unreadCount,
    summary: `${filteredDialogs.length} Telegram chat${
      filteredDialogs.length !== 1 ? "s" : ""
    } · ${unreadCount} unread`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// telegram_get_messages (AUTO FALLBACK)
// ─────────────────────────────────────────────────────────────────────────────

async function toolTelegramGetMessages(params = {}, ctx) {
  let contact = clean(params.contact);
  const includeGroups = Boolean(params.includeGroups);
  const limit = Math.min(params.limit || 20, 30);

  const dialogs = await tg.getDialogs(ctx.userId, 80);

  let dialog = contact
    ? resolveDialog(dialogs, contact, { includeGroups })
    : filterTelegramDialogs(dialogs, { includeGroups })[0] || null;

  if (!dialog) {
    return {
      ok: false,
      contact,
      messages: [],
      count: 0,
      summary: includeGroups
        ? "No Telegram chats available"
        : "No relevant direct Telegram chats available",
    };
  }

  const messages = await tg.getMessages(ctx.userId, dialog.id, limit);

  return {
    ok: true,
    chatId: String(dialog.id),
    chatName: dialog.name,
    chatUsername: dialog.username || null,
    contact: dialog.name,
    messages: messages.map((m) => ({
      ...m,
      id: typeof m.id === "bigint" ? Number(m.id) : m.id,
      fromId: m.fromId ? String(m.fromId) : null,
    })),
    count: messages.length,
    summary: `${messages.length} messages from ${dialog.name}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// telegram_send_message (SMART TARGET)
// ─────────────────────────────────────────────────────────────────────────────

async function toolTelegramSendMessage(params = {}, ctx) {
  const message = clean(params.message);
  let contact = clean(params.contact);
  const includeGroups = Boolean(params.includeGroups);

  if (!message) throw new Error("telegram_send_message: message required");

  let dialog = null;
  if (contact) {
    const resolved = await resolveTelegramContact(
      { contact, includeGroups },
      ctx
    );
    if (!resolved.ok) throw new Error(resolved.summary);
    dialog = resolved.dialog;
  } else {
    const dialogs = await tg.getDialogs(ctx.userId, 80);
    dialog = filterTelegramDialogs(dialogs, { includeGroups })[0] || null;
  }

  if (!dialog) {
    return {
      ok: false,
      contact,
      summary: includeGroups
        ? "No Telegram chats available"
        : "No relevant direct Telegram chats available",
    };
  }

  const result = await tg.sendMessage(ctx.userId, dialog.id, message);

  return {
    ok: true,
    to: dialog.name,
    chatId: dialog.id,
    message,
    messageId: result.messageId,
    summary: `Message sent to ${dialog.name}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// telegram_get_unread (HISTORY SAFE + MEDIA INCLUDED)
// ─────────────────────────────────────────────────────────────────────────────

async function toolTelegramGetUnread(params = {}, ctx) {
  const limit = params.limit || 10;
  const markRead = Boolean(params.markRead);
  const includeGroups = Boolean(params.includeGroups);

  const dialogs = await tg.getDialogs(ctx.userId, 80);
  const unreadDialogs = filterTelegramDialogs(dialogs, {
    includeGroups,
    requireUnread: true,
  }).slice(0, limit);

  const chats = await Promise.all(
    unreadDialogs.map(async (d) => {
      const msgs = await tg.getMessages(
        ctx.userId,
        d.id,
        Math.min(d.unreadCount + 2, 10)
      );

      if (markRead) {
        tg.markAsRead(ctx.userId, d.id).catch(() => {});
      }

      return {
        chatId: String(d.id),
        chatName: d.name,
        unreadCount: d.unreadCount,

        messages: msgs.slice(-d.unreadCount).map((m) => ({
          id: typeof m.id === "bigint" ? Number(m.id) : Number(m.id),
          text: m.text || "",
          fromMe: !!m.fromMe,
          fromId: m.fromId ? String(m.fromId) : null,
          // ✅ FIX: include fromName and media so attachments render in agent bubble
          fromName: m.fromName || null,
          media: m.media || null,
          date: new Date(m.date).toISOString(),
        })),
      };
    })
  );

  const totalUnread = unreadDialogs.reduce(
    (s, d) => s + (d.unreadCount || 0),
    0
  );

  return {
    ok: true,
    totalUnread,
    chatCount: chats.length,
    chats,
    summary: `${totalUnread} unread messages across ${chats.length} chats`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// telegram_search_messages (SAFE)
// ─────────────────────────────────────────────────────────────────────────────

async function toolTelegramSearchMessages(params = {}, ctx) {
  const query = clean(params.query);
  const contact = clean(params.contact);
  const includeGroups = Boolean(params.includeGroups);

  if (!query) throw new Error("telegram_search_messages: query required");

  const dialogs = await tg.getDialogs(ctx.userId, 80);

  const scope = contact
    ? [resolveDialog(dialogs, contact, { includeGroups })].filter(Boolean)
    : filterTelegramDialogs(dialogs, { includeGroups }).slice(0, 25);

  const results = [];

  for (const d of scope) {
    const msgs = await tg.getMessages(ctx.userId, d.id, 30);

    results.push(
      ...msgs
        .filter((m) => m.text?.toLowerCase().includes(query.toLowerCase()))
        .map((m) => ({
          chatId: d.id,
          chatName: d.name,
          text: m.text,
          fromMe: m.fromMe,
          date: m.date,
        }))
    );
  }

  return {
    ok: true,
    query,
    results: results.slice(0, 20),
    count: results.length,
    summary: results.length
      ? `Found ${results.length} messages containing "${query}"`
      : `No messages found`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// telegram_reply_message (AUTO TARGET)
// ─────────────────────────────────────────────────────────────────────────────

async function toolTelegramReplyMessage(params = {}, ctx) {
  const message = clean(params.message);
  let contact = clean(params.contact);
  const includeGroups = Boolean(params.includeGroups);

  if (!message) throw new Error("telegram_reply_message: message required");

  const dialogs = await tg.getDialogs(ctx.userId, 80);

  const dialog = contact
    ? resolveDialog(dialogs, contact, { includeGroups })
    : filterTelegramDialogs(dialogs, { includeGroups })[0] || null;

  if (contact && !dialog) {
    throw new Error(`No Telegram contact found for: ${contact}`);
  }

  if (!dialog) {
    return {
      ok: false,
      contact,
      summary: includeGroups
        ? "No Telegram chats available"
        : "No relevant direct Telegram chats available",
    };
  }

  const result = await tg.sendMessage(
    ctx.userId,
    dialog.id,
    message,
    params.replyToMsgId
  );

  return {
    ok: true,
    to: dialog.name,
    message,
    messageId: result.messageId,
    summary: `Replied to ${dialog.name}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// telegram_get_contact_info (SAFE)
// ─────────────────────────────────────────────────────────────────────────────

async function toolTelegramGetContactInfo(params = {}, ctx) {
  const resolved = await resolveTelegramContact(
    { contact: params.contact, includeGroups: false },
    ctx
  );

  if (!resolved.ok) return resolved;

  return {
    ok: true,
    name: resolved.name,
    username: resolved.username || null,
    unreadCount: resolved.unreadCount || 0,
    summary: resolved.summary,
  };
}

module.exports = {
  toolTelegramListChats,
  toolTelegramGetMessages,
  toolTelegramSendMessage,
  toolTelegramGetUnread,
  toolTelegramSearchMessages,
  toolTelegramReplyMessage,
  toolTelegramGetContactInfo,
  resolveTelegramContact,
};
