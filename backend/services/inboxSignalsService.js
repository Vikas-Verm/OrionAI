"use strict";

const Integration = require("../models/Integration");
const { chatCompleteNoSystem } = require("./llmService");
const { getCommunicationNotificationSignal } = require("./communicationActionService");
const { getSignalConnectionState } = require("./integrationConnectionState");
const {
  getGmailAttentionSignal,
  getCalendarUpcomingSignal,
} = require("./workspaceSignalsService");

function toIsoTimestamp(value) {
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

async function getUnreadSignals(userId) {
  const checks = await Promise.allSettled([
    checkGmail(userId),
    checkCalendar(userId),
    checkSlack(userId),
    checkTelegram(userId),
    checkSignal(userId),
    checkWhatsApp(userId),
  ]);

  const results = {};
  const [gmail, calendar, slack, telegram, signal, whatsapp] = checks;

  if (gmail.status === "fulfilled" && gmail.value) results.gmail = gmail.value;
  if (calendar.status === "fulfilled" && calendar.value) {
    results.google_calendar = calendar.value;
  }
  if (slack.status === "fulfilled" && slack.value) results.slack = slack.value;
  if (telegram.status === "fulfilled" && telegram.value)
    results.telegram = telegram.value;
  if (signal.status === "fulfilled" && signal.value)
    results.signal = signal.value;
  if (whatsapp.status === "fulfilled" && whatsapp.value)
    results.whatsapp = whatsapp.value;

  return results;
}

async function checkGmail(userId) {
  try {
    const signal = await getCommunicationNotificationSignal(userId, "gmail");
    if (signal && Number(signal.count || 0) > 0) {
      return {
        count: signal.count,
        previews: signal.previews || [],
        summary: signal.summary,
        app: "gmail",
      };
    }
  } catch {}

  try {
    const fallbackSignal = await getGmailAttentionSignal(userId);
    if (!fallbackSignal) return null;
    return {
      count: fallbackSignal.count,
      previews: fallbackSignal.previews || [],
      summary: fallbackSignal.summary,
      app: "gmail",
    };
  } catch {
    return null;
  }
}

async function checkCalendar(userId) {
  try {
    const integration = await Integration.findOne({
      userId,
      type: "google_calendar",
      enabled: true,
    });
    if (!integration?.googleCalendar?.accessToken) return null;

    const signal = await getCalendarUpcomingSignal(userId);
    return {
      count: signal.count,
      previews: signal.previews || [],
      summary: signal.summary,
      app: "google_calendar",
    };
  } catch {
    return null;
  }
}

async function checkSlack(userId) {
  try {
    const integration = await Integration.findOne({
      userId,
      type: "slack",
      enabled: true,
    });
    if (!integration?.slack?.userToken) return null;

    const axios = require("axios");
    const token = integration.slack.userToken;

    const res = await axios.get("https://slack.com/api/conversations.list", {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        types: "im,public_channel,private_channel",
        limit: 200,
        exclude_archived: true,
      },
    });

    let count = 0;
    const previews = [];

    for (const ch of res.data.channels || []) {
      const unread = ch.unread_count || 0;
      if (unread > 0) {
        count += unread;
        let name = ch.name || ch.id;
        let latestMessageId = null;
        let latestMessageAt = null;
        let preview = "";

        if (ch.is_im && ch.user) {
          try {
            const u = await axios.get("https://slack.com/api/users.info", {
              headers: { Authorization: `Bearer ${token}` },
              params: { user: ch.user },
            });
            name =
              u.data.user?.profile?.display_name || u.data.user?.name || name;
          } catch {}
        }
        try {
          const history = await axios.get(
            "https://slack.com/api/conversations.history",
            {
              headers: { Authorization: `Bearer ${token}` },
              params: { channel: ch.id, limit: 1 },
            }
          );
          const latestMessage = history.data?.messages?.[0] || null;
          preview = String(latestMessage?.text || "").trim();
          latestMessageId =
            latestMessage?.client_msg_id || latestMessage?.ts || null;
          latestMessageAt = toIsoTimestamp(latestMessage?.ts);
        } catch {}
        if (previews.length < 3) {
          previews.push({
            id: ch.id,
            name,
            unread,
            type: ch.is_im ? "DM" : "channel",
            preview,
            latestMessageId,
            latestMessageAt,
          });
        }
      }
    }

    const summary =
      count > 0 && previews.length
        ? await aiSummarize(
            "Slack",
            count,
            previews.map(
              (p) =>
                `${p.type === "DM" ? "DM from" : "#"}${p.name}: ${
                  p.unread
                } unread`
            )
          )
        : null;

    return { count, previews, summary, app: "slack" };
  } catch {
    return null;
  }
}

async function checkTelegram(userId) {
  try {
    const integration = await Integration.findOne({
      userId,
      type: "telegram",
      enabled: true,
    });
    if (!integration?.telegram?.sessionString) return null;

    const { toolTelegramGetUnread } = require("./tools/toolTelegram");
    const result = await toolTelegramGetUnread({ limit: 20 }, { userId });

    const count = result.totalUnread || 0;
    const chats = result.chats || result.telegramChats || [];
    const previews = chats.slice(0, 3).map((chat) => {
      const latestMessage = Array.isArray(chat.messages)
        ? chat.messages[chat.messages.length - 1] || null
        : null;

      return {
        id: chat.chatId || chat.id || chat.username || chat.chatName || chat.name,
        name: chat.chatName || chat.name,
        unread: chat.unreadCount || chat.unread || 0,
        preview: latestMessage?.text || chat.lastMessage || "",
        latestMessageId:
          latestMessage?.id !== undefined && latestMessage?.id !== null
            ? String(latestMessage.id)
            : null,
        latestMessageAt: toIsoTimestamp(latestMessage?.date),
      };
    });

    const summary =
      count > 0 && previews.length
        ? await aiSummarize(
            "Telegram",
            count,
            previews.map((p) => `${p.name}: ${p.unread} unread`)
          )
        : null;

    return { count, previews, summary, app: "telegram" };
  } catch {
    return null;
  }
}

async function checkWhatsApp(userId) {
  try {
    const integration = await Integration.findOne({
      userId,
      type: "whatsapp",
      enabled: true,
    });
    if (!integration?.whatsapp?.connected) return null;

    const { whatsappGetUnread } = require("./tools/toolWhatsapp");
    const result = await whatsappGetUnread({}, { userId });
    const chats = result?.chats || [];
    const count = result?.totalUnread || 0;
    const previews = chats.slice(0, 3).map((c) => ({
      id: c.chatId || c.id || c.chatName || c.name,
      name: c.chatName,
      unread: c.unreadCount,
      preview: c.lastMessage || "",
      latestMessageId: c.latestMessageId || null,
      latestMessageAt: c.latestMessageAt || null,
    }));

    const summary =
      count > 0 && previews.length
        ? await aiSummarize(
            "WhatsApp",
            count,
            previews.map((p) => `${p.name}: ${p.unread} unread`)
          )
        : null;

    return { count, previews, summary, app: "whatsapp" };
  } catch {
    return null;
  }
}

async function checkSignal(userId) {
  try {
    const integration = await Integration.findOne({
      userId,
      type: "signal",
      enabled: true,
    });
    if (!getSignalConnectionState(integration).isConnected) return null;

    let result = null;
    try {
      const communicationSignal = await getCommunicationNotificationSignal(
        userId,
        "signal"
      );
      if (communicationSignal && Number(communicationSignal.count || 0) > 0) {
        result = {
          count: Number(communicationSignal.count || 0) || 0,
          previews: communicationSignal.previews || [],
          summary: communicationSignal.summary || null,
        };
      }
    } catch {}

    if (!result) {
      const { getSignalUnreadSignal } = require("./signalMatrixService");
      result = await getSignalUnreadSignal(userId);
    }
    const previews = (result?.previews || []).slice(0, 3);
    const count = Number(result?.count || 0) || 0;

    const summary =
      count > 0 && previews.length
        ? await aiSummarize(
            "Signal",
            count,
            previews.map((preview) => `${preview.name}: ${preview.unread} unread`)
          )
        : null;

    return {
      count,
      previews,
      summary,
      app: "signal",
    };
  } catch {
    return null;
  }
}

async function aiSummarize(app, count, items) {
  try {
    const prompt =
      `Summarize these ${app} notifications in one short friendly sentence (max 12 words):\n` +
      items.join("\n");
    const text = await chatCompleteNoSystem(prompt, 60, 0.4);
    return text.trim();
  } catch {
    return `${count} unread in ${app}`;
  }
}

module.exports = {
  getUnreadSignals,
  checkGmail,
  checkCalendar,
  checkSlack,
  checkTelegram,
  checkSignal,
  checkWhatsApp,
};
