/**
 * notificationController.js
 * 📁 backend/controllers/notificationController.js
 *
 * GET /api/notifications/unread
 * Returns unread counts + AI-summarized previews for all connected apps.
 * Called by the frontend every 60 seconds via useNotifications.js
 */

"use strict";

const Integration = require("../models/Integration");
const { chatCompleteNoSystem } = require("../services/llmService");

// ── GET /api/notifications/unread ─────────────────────────────────────────
async function getUnread(req, res) {
//   console.log("Received request for unread notifications for user:", req);
  const userId = req.user?.username;
  const results = {};

  // Run all checks in parallel
  const checks = await Promise.allSettled([
    checkGmail(userId),
    checkSlack(userId),
    checkTelegram(userId),
  ]);

  if (checks[0].status === "fulfilled") results.gmail = checks[0].value;
  if (checks[1].status === "fulfilled") results.slack = checks[1].value;
  if (checks[2].status === "fulfilled") results.telegram = checks[2].value;

  // Total unread across all apps
  const total = Object.values(results).reduce(
    (sum, r) => sum + (r?.count || 0),
    0
  );

  res.json({ total, apps: results });
}

// ── Gmail ──────────────────────────────────────────────────────────────────
async function checkGmail(userId) {
  try {
    const integration = await Integration.findOne({
      userId,
      type: "gmail",
      enabled: true,
    });
    if (!integration?.gmail?.accessToken) return null;

    const { google } = require("googleapis");
    const oauth2Client = new google.auth.OAuth2(
      integration.gmail.clientId || process.env.GOOGLE_CLIENT_ID,
      integration.gmail.clientSecret || process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({
      access_token: integration.gmail.accessToken,
      refresh_token: integration.gmail.refreshToken,
      expiry_date: integration.gmail.expiresAt
        ? new Date(integration.gmail.expiresAt).getTime()
        : undefined,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // ── FIX: use same primary-only query for BOTH count and previews ──
    // gmail.users.labels.get returns ALL categories (Primary + Promotions + Social + Updates)
    // which was inflating the count. Now both use category:primary filter.
    const [countRes, listRes] = await Promise.all([
      gmail.users.messages.list({
        userId: "me",
        maxResults: 1,
        q: "is:unread in:inbox category:primary",
        fields: "resultSizeEstimate",
      }),
      gmail.users.messages.list({
        userId: "me",
        maxResults: 3,
        q: "is:unread in:inbox category:primary",
      }),
    ]);

    const count = Math.min(countRes.data.resultSizeEstimate || 0, 999);
    const previews = [];

    if (listRes.data.messages?.length) {
      for (const m of listRes.data.messages.slice(0, 3)) {
        const msg = await gmail.users.messages.get({
          userId: "me",
          id: m.id,
          format: "metadata",
          metadataHeaders: ["Subject", "From"],
        });
        const headers = msg.data.payload?.headers || [];
        const subject =
          headers.find((h) => h.name === "Subject")?.value || "(no subject)";
        const from = headers.find((h) => h.name === "From")?.value || "Unknown";
        previews.push({ subject, from });
      }
    }

    // AI summary
    const summary =
      count > 0 && previews.length
        ? await aiSummarize(
            "Gmail",
            count,
            previews.map((p) => `From: ${p.from} — ${p.subject}`)
          )
        : null;

    return { count, previews, summary, app: "gmail" };
  } catch {
    return null;
  }
}

// ── Slack ──────────────────────────────────────────────────────────────────
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
        // Get channel name for DMs
        let name = ch.name || ch.id;
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
        if (previews.length < 3)
          previews.push({ name, unread, type: ch.is_im ? "DM" : "channel" });
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

// ── Telegram ──────────────────────────────────────────────────────────────
async function checkTelegram(userId) {
  try {
    const integration = await Integration.findOne({
      userId,
      type: "telegram",
      enabled: true,
    });
    if (!integration?.telegram?.sessionString) return null;

    // Use your existing toolTelegramGetUnread
    const { toolTelegramGetUnread } = require("../services/tools/toolTelegram");
    const result = await toolTelegramGetUnread({ limit: 20 }, { userId });

    const count = result.totalUnread || 0;
    const chats = result.chats || result.telegramChats || [];
    const previews = chats.slice(0, 3).map((c) => ({
      name: c.chatName || c.name,
      unread: c.unreadCount || c.unread || 0,
    }));

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

// ── AI Summarizer ──────────────────────────────────────────────────────────
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

module.exports = { getUnread };
