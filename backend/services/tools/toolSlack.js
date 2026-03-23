/**
 * toolSlack.js
 * 📁 backend/services/tools/toolSlack.js
 *
 * Fix: resolveChannelId now searches DMs by user display name / real name,
 * so "Adi", "Rahul", etc. correctly resolve to the DM channel.
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

/**
 * Resolve a channel name / person name / channel ID → Slack channel ID.
 *
 * Search order:
 *   1. Public + private channels by name
 *   2. DMs by channel name (user ID)
 *   3. ✅ NEW: DMs by user display_name / real_name (fixes "Adi", "Rahul" etc.)
 *   4. Fallback: treat as raw channel ID if it starts with C/D/G/W
 */
async function resolveChannelId(token, channelName) {
  const clean = channelName.replace(/^#/, "").toLowerCase().trim();

  // ── Step 1: Search public + private channels by name ──────────────────────
  try {
    const data = await slackAPI(token, "conversations.list", {
      types: "public_channel,private_channel",
      limit: 200,
      exclude_archived: true,
    });
    const found = (data.channels || []).find(
      (ch) => ch.name?.toLowerCase() === clean || ch.id?.toLowerCase() === clean
    );
    if (found) return found.id;
  } catch {}

  // ── Step 2: Search DMs by userId match ────────────────────────────────────
  let dmChannels = [];
  try {
    const data = await slackAPI(token, "conversations.list", {
      types: "im",
      limit: 200,
      exclude_archived: true,
    });
    dmChannels = data.channels || [];

    const foundDM = dmChannels.find(
      (ch) => ch.id?.toLowerCase() === clean || ch.user?.toLowerCase() === clean
    );
    if (foundDM) return foundDM.id;
  } catch {}

  // ── Step 3: ✅ Search DMs by user display_name / real_name ───────────────
  // This is what fixes "Send Hi to Adi" — look up each DM user's profile
  if (dmChannels.length) {
    // Fetch all workspace users once
    try {
      const usersData = await slackAPI(token, "users.list", { limit: 500 });
      const users = usersData.members || [];

      // Find user whose name matches the input
      const matchedUser = users.find((u) => {
        if (u.deleted || u.is_bot) return false;
        const displayName = (u.profile?.display_name || "")
          .toLowerCase()
          .trim();
        const realName = (u.profile?.real_name || "").toLowerCase().trim();
        const name = (u.name || "").toLowerCase().trim();
        return (
          displayName === clean ||
          realName === clean ||
          name === clean ||
          displayName.startsWith(clean) ||
          realName.startsWith(clean) ||
          // Handle "Adi" matching "Adity" or "Aditya"
          displayName.split(" ").some((part) => part === clean) ||
          realName.split(" ").some((part) => part === clean)
        );
      });

      if (matchedUser) {
        // Find the DM channel with this user
        const dmWithUser = dmChannels.find((ch) => ch.user === matchedUser.id);
        if (dmWithUser) return dmWithUser.id;

        // No existing DM open — open one
        const opened = await slackPOST(token, "conversations.open", {
          users: matchedUser.id,
        });
        if (opened.channel?.id) return opened.channel.id;
      }
    } catch (err) {
      console.warn("Slack user search failed:", err.message);
    }
  }

  // ── Step 4: Treat as raw channel ID ───────────────────────────────────────
  if (/^[CDGW]/i.test(channelName)) return channelName;

  throw new Error(
    `Slack channel/user not found: "${channelName}". ` +
      `Make sure the name matches a channel or person in your Slack workspace.`
  );
}

// ── Main tool function ─────────────────────────────────────────────────────
async function toolSlack(params, ctx) {
  const { action = "read", channel, message, limit = 10 } = params;
  const token = await getToken(ctx.userId);

  // ── LIST CHANNELS ─────────────────────────────────────────────────────────
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

  // ── UNREAD ────────────────────────────────────────────────────────────────
  if (action === "unread") {
    const data = await slackAPI(token, "conversations.list", {
      types: "im,public_channel,private_channel,mpim",
      limit: 200,
      exclude_archived: true,
    });

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

  // ── READ MESSAGES ─────────────────────────────────────────────────────────
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

  // ── SEND MESSAGE ──────────────────────────────────────────────────────────
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

// Keep backward compat — old code calls toolSendSlack
async function toolSendSlack(params, ctx) {
  return toolSlack({ action: "send", ...params }, ctx);
}

module.exports = { toolSlack, toolSendSlack };
