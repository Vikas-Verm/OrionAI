/**
 * toolSlack.js  (updated — uses user OAuth token, not webhook)
 *
 * Agent tool: read_slack / send_slack
 *
 * Supported params:
 *   action        — "read" | "send" | "list_channels" | "unread"
 *   channel       — channel name or ID (for send / read)
 *   message       — message text (for send)
 *   limit         — number of messages to fetch (default 10)
 *
 * ctx:
 *   userId        — passed through runAgent context
 */

const axios = require("axios");
const Integration = require("../../models/Integration");

async function getToken(userId) {
  const integration = await Integration.findOne({ userId, type: "slack" });
  if (!integration?.slack?.userToken) {
    throw new Error(
      "Slack not connected. Go to Integrations → Slack → Sign in with Slack."
    );
  }
  return integration.slack.userToken;
}

async function slackAPI(token, method, params = {}) {
  const res = await axios.get(`https://slack.com/api/${method}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });
  if (!res.data.ok) throw new Error(`Slack API [${method}]: ${res.data.error}`);
  return res.data;
}

async function slackPOST(token, method, body = {}) {
  const res = await axios.post(`https://slack.com/api/${method}`, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.data.ok) throw new Error(`Slack API [${method}]: ${res.data.error}`);
  return res.data;
}

async function resolveChannelId(token, channelName) {
  const clean = channelName.replace(/^#/, "").toLowerCase();

  // Try all types
  for (const types of ["public_channel,private_channel", "im,mpim"]) {
    const data = await slackAPI(token, "conversations.list", {
      types,
      limit: 200,
      exclude_archived: true,
    }).catch(() => ({ channels: [] }));

    const found = (data.channels || []).find(
      (ch) =>
        ch.name?.toLowerCase() === clean ||
        ch.id?.toLowerCase() === clean.toLowerCase()
    );
    if (found) return found.id;
  }

  // fallback: if it looks like a channel ID already (starts with C, D, G)
  if (/^[CDGW]/i.test(channelName)) return channelName;

  throw new Error(`Slack channel not found: "${channelName}"`);
}

async function resolveUserName(token, userId) {
  if (!userId) return "Unknown";
  try {
    const data = await slackAPI(token, "users.info", { user: userId });
    return (
      data.user?.profile?.display_name ||
      data.user?.profile?.real_name ||
      data.user?.name ||
      userId
    );
  } catch {
    return userId;
  }
}

// ── Main tool function ─────────────────────────────────────
async function toolSlack(params, ctx) {
  const { action = "read", channel, message, limit = 10 } = params;
  const token = await getToken(ctx.userId);

  // ── LIST CHANNELS ─────────────────────────
  if (action === "list_channels") {
    const data = await slackAPI(token, "conversations.list", {
      types: "im,public_channel,private_channel,mpim",
      limit: 100,
      exclude_archived: true,
    });

    const channels = (data.channels || []).filter(
      (ch) => ch.is_member || ch.is_im
    );

    return {
      summary: `Found ${channels.length} Slack conversations`,
      richSlackChannels: channels.map((ch) => ({
        id: ch.id,
        name: ch.name || ch.id,
        type: ch.is_im ? "dm" : ch.is_private ? "private" : "channel",
        unread: ch.unread_count || 0,
      })),
    };
  }

  // ── UNREAD ───────────────────────────────
  if (action === "unread") {
    const data = await slackAPI(token, "conversations.list", {
      types: "im,public_channel,private_channel,mpim",
      limit: 200,
      exclude_archived: true,
    });

    const authData = await slackAPI(token, "auth.test");
    const myId = authData.user_id;

    let totalUnread = 0;
    const unreadChannels = [];

    for (const ch of data.channels || []) {
      const unread = ch.unread_count || 0;
      if (unread > 0) {
        totalUnread += unread;
        let name = ch.name || ch.id;
        if (ch.is_im) {
          name = await resolveUserName(token, ch.user);
        }
        unreadChannels.push({
          id: ch.id,
          name,
          unread,
          type: ch.is_im ? "dm" : "channel",
        });
      }
    }

    return {
      summary: `${totalUnread} unread messages across ${unreadChannels.length} channels`,
      richSlackUnread: unreadChannels,
      totalUnread,
    };
  }

  // ── READ MESSAGES ────────────────────────
  if (action === "read") {
    if (!channel) throw new Error("channel param required for read action");

    const channelId = await resolveChannelId(token, channel);
    const authData = await slackAPI(token, "auth.test");
    const myId = authData.user_id;

    const hist = await slackAPI(token, "conversations.history", {
      channel: channelId,
      limit: Math.min(limit, 50),
    });

    const messages = await Promise.all(
      (hist.messages || []).reverse().map(async (msg) => ({
        id: msg.ts,
        text: msg.text || "",
        date: new Date(parseFloat(msg.ts) * 1000).toISOString(),
        fromMe: msg.user === myId,
        fromName: await resolveUserName(token, msg.user || msg.bot_id),
      }))
    );

    return {
      summary: `Last ${messages.length} messages in ${channel}`,
      richSlackMessages: messages,
      slackChannel: channel,
      slackChannelId: channelId,
    };
  }

  // ── SEND MESSAGE ─────────────────────────
  if (action === "send") {
    if (!channel) throw new Error("channel param required for send action");
    if (!message?.trim())
      throw new Error("message param required for send action");

    const channelId = await resolveChannelId(token, channel);

    await slackPOST(token, "chat.postMessage", {
      channel: channelId,
      text: message.trim(),
      as_user: true,
    });

    return {
      summary: `Message sent to ${channel}`,
      slackSent: true,
      slackChannel: channel,
      slackMessage: message.trim(),
    };
  }

  throw new Error(
    `Unknown Slack action: "${action}". Use read, send, list_channels, or unread.`
  );
}

module.exports = { toolSlack };
