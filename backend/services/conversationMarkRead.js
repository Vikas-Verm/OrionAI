"use strict";

/**
 * Unified mark-as-read dispatch. Called from the shared action layer when a
 * user clicks "handled" on a Priority Feed card so the source platform also
 * stops showing the thread as unread.
 *
 * Each branch is best-effort: a failure here must NOT block the caller from
 * persisting the action. We catch and log, never throw.
 */

const Integration = require("../models/Integration");

async function markGmailThreadRead(userId, threadId, latestMessageId = "") {
  if (!threadId && !latestMessageId) return { ok: false, reason: "no_target" };
  try {
    const { getGmailClient } = require("./workspaceSignalsService");
    const client = await getGmailClient(userId);
    if (!client?.gmail) return { ok: false, reason: "no_client" };

    if (threadId) {
      await client.gmail.users.threads
        .modify({
          userId: "me",
          id: String(threadId),
          requestBody: { removeLabelIds: ["UNREAD"] },
        })
        .catch((err) => {
          if (process.env.NODE_ENV !== "production") {
            console.debug("[mark-read][gmail] thread modify failed:", err.message);
          }
        });
      return { ok: true, target: "thread", id: threadId };
    }

    if (latestMessageId) {
      await client.gmail.users.messages
        .modify({
          userId: "me",
          id: String(latestMessageId),
          requestBody: { removeLabelIds: ["UNREAD"] },
        })
        .catch((err) => {
          if (process.env.NODE_ENV !== "production") {
            console.debug(
              "[mark-read][gmail] message modify failed:",
              err.message
            );
          }
        });
      return { ok: true, target: "message", id: latestMessageId };
    }

    return { ok: false, reason: "no_target" };
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[mark-read][gmail] fatal:", err.message);
    }
    return { ok: false, reason: "fatal" };
  }
}

async function markSlackChannelRead(userId, channelId, ts = "") {
  if (!channelId) return { ok: false, reason: "no_channel" };
  try {
    const integration = await Integration.findOne({
      userId,
      type: "slack",
      enabled: true,
    });
    const token = integration?.slack?.userToken;
    if (!token) return { ok: false, reason: "no_token" };

    const axios = require("axios");
    const params = { channel: String(channelId) };
    if (ts) params.ts = String(ts);

    const res = await axios.post(
      "https://slack.com/api/conversations.mark",
      null,
      {
        headers: { Authorization: `Bearer ${token}` },
        params,
      }
    );
    if (!res.data?.ok && process.env.NODE_ENV !== "production") {
      console.debug("[mark-read][slack] error:", res.data?.error || "unknown");
    }
    return { ok: Boolean(res.data?.ok) };
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[mark-read][slack] fatal:", err.message);
    }
    return { ok: false, reason: "fatal" };
  }
}

async function markTelegramDialogRead(userId, dialogId) {
  if (!dialogId) return { ok: false, reason: "no_dialog" };
  try {
    const tg = require("./tools/toolTelegramMTProto");
    if (typeof tg.markAsRead !== "function") {
      return { ok: false, reason: "unsupported" };
    }
    return await tg.markAsRead(userId, dialogId);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[mark-read][telegram] fatal:", err.message);
    }
    return { ok: false, reason: "fatal" };
  }
}

async function markWhatsAppRoomRead(userId, roomId, eventId = "") {
  if (!roomId) return { ok: false, reason: "no_room" };
  try {
    const { markWhatsAppRoomAsRead } = require("./whatsappMatrixService");
    return await markWhatsAppRoomAsRead(userId, roomId, eventId);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[mark-read][whatsapp] fatal:", err.message);
    }
    return { ok: false, reason: "fatal" };
  }
}

async function markSignalRoomRead(userId, roomId, eventId = "") {
  if (!roomId) return { ok: false, reason: "no_room" };
  try {
    const { markSignalRoomAsRead } = require("./signalMatrixService");
    return await markSignalRoomAsRead(userId, roomId, eventId);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[mark-read][signal] fatal:", err.message);
    }
    return { ok: false, reason: "fatal" };
  }
}

/**
 * Dispatch the correct mark-read call based on sourceApp + openContext fields.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.sourceApp     — gmail | slack | telegram | whatsapp | signal
 * @param {Object} [params.openContext] — { threadId, channelId, dialogId, roomId, chatId, threadTs }
 * @param {string} [params.latestMessageId]
 * @returns {Promise<{app: string, ok: boolean, reason?: string}>}
 */
async function markConversationReadAtSource({
  userId,
  sourceApp = "",
  openContext = {},
  latestMessageId = "",
} = {}) {
  const app = String(sourceApp || "").trim().toLowerCase();
  if (!userId || !app) return { app, ok: false, reason: "missing_args" };

  const ctx = openContext || {};

  try {
    if (app === "gmail") {
      const result = await markGmailThreadRead(
        userId,
        ctx.threadId || "",
        latestMessageId || ""
      );
      return { app, ...result };
    }

    if (app === "slack") {
      const result = await markSlackChannelRead(
        userId,
        ctx.channelId || "",
        ctx.threadTs || latestMessageId || ""
      );
      return { app, ...result };
    }

    if (app === "telegram") {
      const result = await markTelegramDialogRead(
        userId,
        ctx.dialogId || ctx.chatId || ""
      );
      return { app, ...result };
    }

    if (app === "whatsapp") {
      const result = await markWhatsAppRoomRead(
        userId,
        ctx.chatId || ctx.roomId || "",
        latestMessageId || ""
      );
      return { app, ...result };
    }

    if (app === "signal") {
      const result = await markSignalRoomRead(
        userId,
        ctx.roomId || ctx.chatId || "",
        latestMessageId || ""
      );
      return { app, ...result };
    }

    return { app, ok: false, reason: "unsupported_app" };
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[mark-read] dispatch fatal:", err.message);
    }
    return { app, ok: false, reason: "fatal" };
  }
}

module.exports = {
  markConversationReadAtSource,
  markGmailThreadRead,
  markSlackChannelRead,
  markTelegramDialogRead,
  markWhatsAppRoomRead,
  markSignalRoomRead,
};
