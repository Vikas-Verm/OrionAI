"use strict";

const { WebSocketServer, WebSocket } = require("ws");
const jwt = require("jsonwebtoken");
const Integration = require("../models/Integration");
const { chatCompleteNoSystem } = require("./llmService");
const { getCommunicationNotificationSignal } = require("./communicationActionService");
const { getSignalConnectionState } = require("./integrationConnectionState");
const {
  getGmailClient,
  getGmailAttentionFromClient,
  getCalendarUpcomingSignal,
} = require("./workspaceSignalsService");

const connections = new Map();
const pollers = new Map();
const lastCounts = new Map();
const lastGmailMsgIds = new Map();
const lastTelegramCount = new Map();
const lastSignalCount = new Map();
const lastSlackCount = new Map();
const lastCalendarEventIds = new Map();
const telegramListeners = new Map();

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

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────
function init(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");

    let userId;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.username;
    } catch {
      ws.close(1008, "Unauthorized");
      return;
    }

    if (!connections.has(userId)) connections.set(userId, new Set());
    connections.get(userId).add(ws);
    console.log(
      `✅ WS connected: ${userId} (${connections.get(userId).size} tabs)`
    );

    send(ws, { type: "connected", userId, timestamp: Date.now() });

    // First poll — populate badges immediately on connect
    pollUser(userId, true);

    // Start Telegram real-time listener
    startTelegramListener(userId);

    // Poll every 15s
    if (!pollers.has(userId)) {
      const interval = setInterval(() => pollUser(userId, false), 15_000);
      pollers.set(userId, interval);
    }

    ws.on("message", async (raw) => {
      try {
        await handleClientMessage(userId, ws, JSON.parse(raw.toString()));
      } catch (err) {
        console.error("WS message error:", err.message);
      }
    });

    ws.on("close", () => {
      connections.get(userId)?.delete(ws);
      if (connections.get(userId)?.size === 0) {
        connections.delete(userId);
        clearInterval(pollers.get(userId));
        pollers.delete(userId);
        console.log(`🔌 WS disconnected: ${userId}`);
      }
    });

    ws.on("error", (err) =>
      console.error(`WS error (${userId}):`, err.message)
    );
  });

  try {
    const { startCronScheduler } = require("./automationEngine");
    startCronScheduler();
  } catch (e) {
    console.warn("automationEngine:", e.message);
  }

  console.log("✅ WebSocket server initialized at /ws");
  return wss;
}

// ─────────────────────────────────────────────────────────────────────────────
// POLL USER
// ─────────────────────────────────────────────────────────────────────────────
async function pollUser(userId, isFirstRun = false) {
  if (!connections.has(userId)) return;

  const [gmailRes, calendarRes, telegramRes, signalRes, slackRes, whatsappRes] =
    await Promise.allSettled([
      checkGmail(userId, isFirstRun),
      checkCalendar(userId, isFirstRun),
      checkTelegram(userId, isFirstRun),
      checkSignal(userId, isFirstRun),
      checkSlack(userId, isFirstRun),
      checkWhatsApp(userId),
    ]);

  const checks = {
    gmail: gmailRes.status === "fulfilled" ? gmailRes.value : null,
    google_calendar:
      calendarRes.status === "fulfilled" ? calendarRes.value : null,
    telegram: telegramRes.status === "fulfilled" ? telegramRes.value : null,
    signal: signalRes.status === "fulfilled" ? signalRes.value : null,
    slack: slackRes.status === "fulfilled" ? slackRes.value : null,
    whatsapp: whatsappRes.status === "fulfilled" ? whatsappRes.value : null,
  };

  const updates = [];
  const prevCounts = lastCounts.get(userId) || {};
  const currCounts = {};

  for (const [app, result] of Object.entries(checks)) {
    if (!result) continue;

    currCounts[app] = result.count;

    const isNew = !isFirstRun && result._isNew === true;
    const newCount = isNew ? result._newCount || 1 : 0;

    const ai =
      result.allowAi === false
        ? null
        : (isNew || isFirstRun) && result.items?.length
        ? await aiProcess(app, result.items).catch(() => null)
        : null;

    updates.push({
      app,
      count: result.count,
      items: result.items?.slice(0, 3) || [],
      summary: result.summary || null,
      ai,
      isNew,
      newCount,
      highSignalCount: result.highSignalCount || 0,
      isFirst: isFirstRun,
    });

    if (isNew && newCount > 0) {
      try {
        const { triggerEvent } = require("./automationEngine");
        for (const item of result.items || []) {
          triggerEvent(userId, {
            app,
            event: app === "gmail" ? "new_email" : "new_message",
            data: {
              from: item.from || item.name || "",
              subject: item.subject || "",
              message: item.preview || item.lastMessage || "",
              body: item.body || "",
            },
          }).catch(() => {});
        }
      } catch {}
    }
  }

  lastCounts.set(userId, { ...prevCounts, ...currCounts });

  if (updates.length > 0) {
    broadcast(userId, {
      type: "notification_update",
      updates,
      timestamp: Date.now(),
    });
  }
}

async function refreshUserSignals(userId) {
  if (!userId) return false;
  await pollUser(userId, false);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// GMAIL — message ID tracking with full debug logging
// ─────────────────────────────────────────────────────────────────────────────
async function checkGmail(userId, isFirstRun) {
  try {
    let attention = null;
    try {
      const communicationSignal = await getCommunicationNotificationSignal(
        userId,
        "gmail"
      );
      if (communicationSignal && Number(communicationSignal.count || 0) > 0) {
        attention = communicationSignal;
      }
    } catch {}

    if (!attention) {
      const client = await getGmailClient(userId);
      if (!client) return null;
      attention = await getGmailAttentionFromClient(client.gmail, client.integration, {
        previewLimit: 5,
      });
    }

    if (!attention) return null;
    const currentItems = (attention?.items || attention?.previews || []).slice(0, 5);
    const currentIds = new Set(
      currentItems
        .map((thread) => thread.latestMessageId || thread.id)
        .filter(Boolean)
    );
    const prevIds = lastGmailMsgIds.get(userId) || new Set();
    const newIds = [...currentIds].filter((id) => !prevIds.has(id));

    lastGmailMsgIds.set(userId, currentIds);

    if (!isFirstRun) {
      console.log(
        `[Gmail] ${userId} — active reply-worthy: ${currentItems.length}, new: ${newIds.length}`
      );
    }

    const newEligibleThreads = currentItems.filter((thread) =>
      newIds.includes(thread.latestMessageId || thread.id)
    );

    const items = currentItems.slice(0, 3).map((thread) => ({
      id: thread.id,
      latestMessageId: thread.latestMessageId,
      latestMessageAt: thread.latestMessageAt || null,
      subject: thread.subject,
      from: thread.from,
      unread: thread.unread,
      highConfidence: thread.highConfidence,
    }));

    const hasNew = !isFirstRun && newEligibleThreads.length > 0;
    if (hasNew) {
      console.log(
        `📧 Gmail NEW for ${userId}: ${newEligibleThreads.length} — ${newEligibleThreads
          .map((i) => i.subject)
          .join(" | ")}`
      );
    }

    return {
      count: attention.count,
      summary: attention.summary,
      items,
      _isNew: hasNew,
      _newCount: newEligibleThreads.length,
      highSignalCount: newEligibleThreads.filter((item) => item.highConfidence).length,
    };
  } catch (err) {
    if (err?.code === "GMAIL_RECONNECT_REQUIRED") {
      console.warn(`[Gmail] reconnect required for ${userId}`);
      return null;
    }
    console.error(`[Gmail] error for ${userId}:`, err.message);
    return null;
  }
}

async function checkCalendar(userId, isFirstRun) {
  try {
    const integration = await Integration.findOne({
      userId,
      type: "google_calendar",
      enabled: true,
    });
    if (!integration?.googleCalendar?.accessToken) return null;

    const signal = await getCalendarUpcomingSignal(userId);
    const items = signal.items || [];
    const prevIds = lastCalendarEventIds.get(userId) || new Set();
    const nextIds = new Set(items.map((item) => item.id).filter(Boolean));
    const newItems = !isFirstRun
      ? items.filter((item) => item.id && !prevIds.has(item.id))
      : [];
    lastCalendarEventIds.set(userId, nextIds);

    return {
      count: signal.count,
      items,
      summary: signal.summary,
      allowAi: false,
      _isNew: !isFirstRun && newItems.length > 0,
      _newCount: newItems.length,
      highSignalCount: newItems.length,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM CHECKER
// ─────────────────────────────────────────────────────────────────────────────
async function checkTelegram(userId, isFirstRun) {
  try {
    const integration = await Integration.findOne({
      userId,
      type: "telegram",
      enabled: true,
    });
    if (!integration?.telegram?.sessionString) return null;

    const { toolTelegramGetUnread } = require("./tools/toolTelegram");
    const result = await toolTelegramGetUnread({ limit: 20 }, { userId });
    const chats = result.chats || result.telegramChats || [];
    const count = result.totalUnread || 0;

    const prevCount = lastTelegramCount.get(userId);
    const isNew = !isFirstRun && prevCount !== undefined && count > prevCount;
    lastTelegramCount.set(userId, count);

    return {
      count,
      items: chats.slice(0, 5).map((chat) => {
        const latestMessage = Array.isArray(chat.messages)
          ? chat.messages[chat.messages.length - 1] || null
          : null;

        return {
          id: chat.chatId || chat.id || chat.username || chat.chatName || chat.name,
          chatId: chat.chatId || chat.id || null,
          senderKey: chat.chatId || chat.id || chat.username || chat.chatName || chat.name,
          name: chat.chatName || chat.name,
          unread: chat.unreadCount || chat.unread || 0,
          preview: latestMessage?.text || chat.lastMessage || "",
          latestMessageId:
            latestMessage?.id !== undefined && latestMessage?.id !== null
              ? String(latestMessage.id)
              : null,
          latestMessageAt: toIsoTimestamp(latestMessage?.date),
        };
      }),
      _isNew: isNew,
      _newCount: isNew ? count - (prevCount || 0) : 0,
    };
  } catch {
    return null;
  }
}

async function checkSignal(userId, isFirstRun) {
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
          rooms: communicationSignal.previews || [],
          summary: communicationSignal.summary || null,
        };
      }
    } catch {}

    if (!result) {
      const { getSignalUnreadSignal } = require("./signalMatrixService");
      result = await getSignalUnreadSignal(userId);
    }
    const rooms = result?.rooms || [];
    const count = Number(result?.count || 0) || 0;

    const prevCount = lastSignalCount.get(userId);
    const isNew = !isFirstRun && prevCount !== undefined && count > prevCount;
    lastSignalCount.set(userId, count);

    return {
      count,
      items: rooms.slice(0, 5).map((room) => ({
        id: room.roomId,
        chatId: room.roomId || room.chatId || room.id,
        senderKey: room.roomId || room.chatId || room.id,
        name: room.name,
        unread: room.unreadCount ?? room.unread ?? 0,
        preview: room.lastMessage || room.preview || "",
        latestMessageId: room.lastEventId || room.latestMessageId || null,
        latestMessageAt: room.lastMessageAt || room.latestMessageAt || null,
        highlight: room.highlightCount || 0,
      })),
      summary: result?.summary || null,
      _isNew: isNew,
      _newCount: isNew ? count - (prevCount || 0) : 0,
      highSignalCount: rooms.filter((room) => Number(room.highlightCount || 0) > 0).length,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SLACK CHECKER
// ─────────────────────────────────────────────────────────────────────────────
async function checkSlack(userId, isFirstRun) {
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
    const items = [];
    for (const ch of res.data.channels || []) {
      const u = ch.unread_count || 0;
      if (u > 0) {
        count += u;
        let name = ch.name || ch.id;
        let preview = "";
        let latestMessageId = null;
        let latestMessageAt = null;
        if (ch.is_im && ch.user) {
          try {
            const u2 = await axios.get("https://slack.com/api/users.info", {
              headers: { Authorization: `Bearer ${token}` },
              params: { user: ch.user },
            });
            name =
              u2.data.user?.profile?.display_name || u2.data.user?.name || name;
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
        if (items.length < 5) {
          items.push({
            id: ch.id,
            chatId: ch.id,
            name,
            unread: u,
            type: ch.is_im ? "DM" : "channel",
            preview,
            latestMessageId,
            latestMessageAt,
          });
        }
      }
    }

    const prevCount = lastSlackCount.get(userId);
    const isNew = !isFirstRun && prevCount !== undefined && count > prevCount;
    lastSlackCount.set(userId, count);

    return {
      count,
      items,
      _isNew: isNew,
      _newCount: isNew ? count - (prevCount || 0) : 0,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP CHECKER
// ─────────────────────────────────────────────────────────────────────────────
async function checkWhatsApp(userId) {
  try {
    const { whatsappGetUnread } = require("./tools/toolWhatsapp");
    const result = await whatsappGetUnread({}, { userId });
    if (!result) return null;
    return {
      count: result.totalUnread || 0,
      items: (result.chats || []).slice(0, 5).map((c) => ({
        id: c.chatId,
        chatId: c.chatId,
        name: c.chatName,
        unread: c.unreadCount,
        preview: c.lastMessage || "",
        isGroup: c.isGroup,
        latestMessageId: c.latestMessageId || null,
        latestMessageAt: c.latestMessageAt || null,
      })),
      _isNew: false,
      _newCount: 0,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM REAL-TIME LISTENER
// ─────────────────────────────────────────────────────────────────────────────
async function startTelegramListener(userId) {
  let client = null;

  try {
    const { getClient } = require("./tools/toolTelegramMTProto");
    client = await getClient(userId);
    if (!client) {
      telegramListeners.delete(userId);
      return;
    }

    const existingListener = telegramListeners.get(userId);
    if (
      existingListener?.client === client &&
      (existingListener.status === "starting" ||
        existingListener.status === "active")
    ) {
      return;
    }

    telegramListeners.set(userId, { status: "starting", client });

    const authorized = await client.isUserAuthorized().catch(() => false);
    if (!authorized) {
      if (telegramListeners.get(userId)?.client === client) {
        telegramListeners.delete(userId);
      }
      return;
    }

    const { NewMessage } = require("telegram/events");

    client.addEventHandler(async (event) => {
      try {
        const message = event.message;
        if (!message || message.out) return;

        const sender = await message.getSender().catch(() => null);
        const from =
          sender?.firstName || sender?.title || sender?.username || "Unknown";
        const senderKey = String(
          sender?.id || sender?.username || sender?.phone || sender?.title || from
        );
        const text = (message.text || "").trim();
        const preview = text || "Sent a media message";
        const realtimeSummary = `${from}: ${preview}`.slice(0, 160);

        const aiResult = await aiProcess("telegram", [
          { name: from, preview: text.slice(0, 80) },
        ]).catch(() => null);
        const ai = {
          ...(aiResult || {}),
          summary: realtimeSummary,
          action: aiResult?.action || "Open",
        };

        const prev = lastCounts.get(userId)?.telegram || 0;
        const next = prev + 1;
        lastCounts.set(userId, {
          ...(lastCounts.get(userId) || {}),
          telegram: next,
        });
        lastTelegramCount.set(userId, next);

        broadcast(userId, {
          type: "notification_update",
          updates: [
            {
              app: "telegram",
              count: next,
              items: [{ id: senderKey, senderKey, name: from, preview, unread: 1 }],
              summary: realtimeSummary,
              ai,
              isNew: true,
              newCount: 1,
              isFirst: false,
            },
          ],
          timestamp: Date.now(),
        });

        console.log(`✈️ Telegram real-time: ${from} → ${userId}`);
      } catch {}
    }, new NewMessage({}));

    telegramListeners.set(userId, { status: "active", client });
    console.log(`✅ Telegram real-time listener active for ${userId}`);
  } catch (err) {
    if (!client || telegramListeners.get(userId)?.client === client) {
      telegramListeners.delete(userId);
    }
    console.warn(`[Telegram] Listener failed for ${userId}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GMAIL WEBHOOK — triggered by Google Pub/Sub (optional, makes it instant)
// Register in app.js: app.post('/api/webhooks/gmail', handleGmailWebhook)
// ─────────────────────────────────────────────────────────────────────────────
async function handleGmailWebhook(req, res) {
  res.sendStatus(200); // ACK immediately — must be fast

  try {
    const data = req.body?.message?.data;
    if (!data) {
      console.log("[Gmail Webhook] No data in request body");
      return;
    }

    const decoded = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
    console.log("[Gmail Webhook] Received for email:", decoded.emailAddress);

    // ── FIX: Search by multiple possible field paths ──────────────────────
    // userEmail might be stored differently depending on your OAuth controller
    const email = decoded.emailAddress;
    let integration = await Integration.findOne({
      "gmail.userEmail": email,
      type: "gmail",
      enabled: true,
    });

    // Fallback: search all Gmail integrations and match by fetching profile
    if (!integration) {
      console.log(
        `[Gmail Webhook] Not found by userEmail — scanning all Gmail integrations`
      );
      const allGmail = await Integration.find({ type: "gmail", enabled: true });
      for (const intg of allGmail) {
        try {
          const { google } = require("googleapis");
          const oauth2 = new google.auth.OAuth2(
            intg.gmail.clientId || process.env.GOOGLE_CLIENT_ID,
            intg.gmail.clientSecret || process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
          );
          oauth2.setCredentials({
            access_token: intg.gmail.accessToken,
            refresh_token: intg.gmail.refreshToken,
          });
          const gmail = google.gmail({ version: "v1", auth: oauth2 });
          const profile = await gmail.users.getProfile({ userId: "me" });
          if (profile.data.emailAddress === email) {
            integration = intg;
            // Save email for future lookups
            await Integration.findByIdAndUpdate(intg._id, {
              $set: { "gmail.userEmail": email },
            });
            console.log(
              `[Gmail Webhook] Found integration by profile scan — saved email for future`
            );
            break;
          }
        } catch {}
      }
    }

    if (!integration) {
      console.log(`[Gmail Webhook] No integration found for ${email}`);
      return;
    }

    const userId = integration.userId;
    console.log(
      `[Gmail Webhook] Matched userId: ${userId}, connected: ${connections.has(
        userId
      )}`
    );

    if (!connections.has(userId)) {
      console.log(`[Gmail Webhook] User ${userId} not connected via WebSocket`);
      return;
    }

    // Trigger immediate poll — this will compare message IDs and fire notification
    console.log(`[Gmail Webhook] Triggering immediate poll for ${userId}`);
    await pollUser(userId, false);
  } catch (err) {
    console.error("[Gmail Webhook] Error:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SLACK WEBHOOK
// Register in app.js: app.post('/api/webhooks/slack', handleSlackWebhook)
// ─────────────────────────────────────────────────────────────────────────────
async function handleSlackWebhook(req, res) {
  const body = req.body;
  if (body?.type === "url_verification")
    return res.json({ challenge: body.challenge });
  res.sendStatus(200);

  try {
    const event = body?.event;
    if (!event || event.type !== "message" || event.subtype || event.bot_id)
      return;

    const integration = await Integration.findOne({
      "slack.teamId": body.team_id,
      type: "slack",
      enabled: true,
    });
    if (!integration || !connections.has(integration.userId)) return;

    await pollUser(integration.userId, false);
    console.log(
      `[Slack Webhook] Triggered immediate poll for ${integration.userId}`
    );
  } catch (err) {
    console.error("[Slack Webhook] Error:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function broadcast(userId, data) {
  const userConns = connections.get(userId);
  if (!userConns) return;
  const msg = JSON.stringify(data);
  for (const ws of userConns) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function pushToUser(userId, data) {
  broadcast(userId, data);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT → SERVER MESSAGES
// ─────────────────────────────────────────────────────────────────────────────
async function handleClientMessage(userId, ws, msg) {
  switch (msg.type) {
    case "ping":
      send(ws, { type: "pong", timestamp: Date.now() });
      break;

    case "send_telegram": {
      try {
        const { toolTelegramSendMessage } = require("./tools/toolTelegram");
        const result = await toolTelegramSendMessage(
          { contact: msg.contact, message: msg.message },
          { userId }
        );
        send(ws, {
          type: "telegram_sent",
          ok: result.ok,
          contact: msg.contact,
          message: msg.message,
          reqId: msg.reqId,
        });
      } catch (err) {
        send(ws, { type: "error", reqId: msg.reqId, error: err.message });
      }
      break;
    }

    case "send_slack": {
      try {
        const { toolSlack } = require("./tools/toolSlack");
        await toolSlack(
          { action: "send", channel: msg.channel, message: msg.message },
          { userId }
        );
        send(ws, {
          type: "slack_sent",
          ok: true,
          channel: msg.channel,
          message: msg.message,
          reqId: msg.reqId,
        });
      } catch (err) {
        send(ws, { type: "error", reqId: msg.reqId, error: err.message });
      }
      break;
    }

    case "mark_seen":
      send(ws, { type: "seen_ack", app: msg.app });
      break;

    case "subscribe":
      ws.subscriptions = ws.subscriptions || new Set();
      (msg.apps || []).forEach((a) => ws.subscriptions.add(a));
      send(ws, { type: "subscribed", apps: [...ws.subscriptions] });
      break;

    default:
      console.warn("Unknown WS message type:", msg.type);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI PROCESSING
// ─────────────────────────────────────────────────────────────────────────────
async function aiProcess(app, items) {
  if (!items?.length) return null;
  const itemsText = items
    .slice(0, 5)
    .map((i) => {
      if (app === "gmail") return `Email from ${i.from}: "${i.subject}"`;
      if (app === "telegram")
        return `Message from ${i.name}: "${
          i.preview || i.unread + " messages"
        }"`;
      if (app === "signal")
        return `Signal from ${i.name}: "${
          i.preview || i.unread + " messages"
        }"`;
      if (app === "slack")
        return `Slack ${i.type || "channel"} ${i.name}: ${i.unread} unread`;
      if (app === "whatsapp")
        return `WhatsApp from ${i.name}: "${
          i.preview || i.unread + " messages"
        }"`;
      return JSON.stringify(i);
    })
    .join("\n");
  try {
    const raw = await chatCompleteNoSystem(
      `Analyze these ${app} notifications. Reply ONLY with JSON:\n{"summary":"max 10 words","priority":"urgent|normal|info","action":"Reply|Open|View|Join|null"}\n\nNotifications:\n${itemsText}`,
      100,
      0.2
    );
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return {
      summary: `${items.length} new in ${app}`,
      priority: "normal",
      action: "Open",
    };
  }
}

module.exports = {
  init,
  pushToUser,
  broadcast,
  refreshUserSignals,
  handleGmailWebhook,
  handleSlackWebhook,
};
