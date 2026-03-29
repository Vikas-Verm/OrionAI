/**
 * slackModuleController.js
 * Complete controller — all Slack API calls use the USER token
 * so everything acts as the logged-in Slack user, not a bot.
 */

const axios = require("axios");
const Integration = require("../models/Integration");

// ── Get saved user token ───────────────────────────────────
async function getUserToken(userId) {
  const integration = await Integration.findOne({ userId, type: "slack" });
  if (!integration?.slack?.userToken) {
    throw new Error(
      "Slack not connected. Please connect Slack in Integrations."
    );
  }
  return integration.slack.userToken;
}

// ── Slack API GET wrapper ──────────────────────────────────
async function slackAPI(token, method, params = {}) {
  const res = await axios.get(`https://slack.com/api/${method}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });
  if (!res.data.ok) {
    throw new Error(`Slack API [${method}]: ${res.data.error}`);
  }
  return res.data;
}

// ── Slack API POST wrapper ─────────────────────────────────
async function slackPOST(token, method, body = {}) {
  const res = await axios.post(`https://slack.com/api/${method}`, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.data.ok) {
    throw new Error(`Slack API [${method}]: ${res.data.error}`);
  }
  return res.data;
}

// ── Resolve user ID → display name (in-memory cache) ──────
const _nameCache = {};
async function resolveUserName(token, userId) {
  if (!userId) return "Unknown";
  if (_nameCache[userId]) return _nameCache[userId];
  try {
    const data = await slackAPI(token, "users.info", { user: userId });
    const name =
      data.user?.profile?.display_name ||
      data.user?.profile?.real_name ||
      data.user?.name ||
      userId;
    _nameCache[userId] = name;
    return name;
  } catch {
    return userId;
  }
}

// ── Format file size ───────────────────────────────────────
function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + "B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + "KB";
  return (bytes / 1048576).toFixed(1) + "MB";
}

// ═══════════════════════════════════════════════════════════
// GET /api/slack/emojis
// Returns all custom emojis for the workspace
// Standard Unicode emojis are hardcoded in the frontend
// ═══════════════════════════════════════════════════════════
async function getCustomEmojis(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const data = await slackAPI(token, "emoji.list");
    // Returns { emoji: { 'name': 'url' | 'alias:other-name' } }
    // Filter out aliases (values starting with 'alias:')
    const emojis = {};
    for (const [name, value] of Object.entries(data.emoji || {})) {
      if (!value.startsWith("alias:")) {
        emojis[name] = value; // direct image URL
      }
    }
    res.json({ emojis });
  } catch (err) {
    // Non-fatal — return empty if scope not granted
    console.warn("Slack getCustomEmojis:", err.message);
    res.json({ emojis: {} });
  }
}

// ═══════════════════════════════════════════════════════════
// GET /api/slack/me
// ═══════════════════════════════════════════════════════════
async function getMe(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const authData = await slackAPI(token, "auth.test");

    let displayName = authData.user || "";
    let realName = authData.user || "";
    let email = "";
    let avatar = null;

    try {
      const profileRes = await slackAPI(token, "users.profile.get");
      if (profileRes.profile) {
        displayName = profileRes.profile.display_name || displayName;
        realName = profileRes.profile.real_name || realName;
        email = profileRes.profile.email || "";
        avatar = profileRes.profile.image_72 || null;
      }
    } catch {
      // profile fetch optional
    }

    res.json({
      userId: authData.user_id,
      userName: authData.user,
      teamName: authData.team,
      teamId: authData.team_id,
      displayName,
      realName,
      email,
      avatar,
    });
  } catch (err) {
    console.error("Slack getMe error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// GET /api/slack/channels
// ═══════════════════════════════════════════════════════════
async function listChannels(req, res) {
  try {
    const token = await getUserToken(req.user.username);

    const [imsData, channelsData, groupsData] = await Promise.all([
      slackAPI(token, "conversations.list", {
        types: "im",
        limit: 50,
        exclude_archived: true,
      }).catch(() => ({ channels: [] })),
      slackAPI(token, "conversations.list", {
        types: "public_channel,private_channel",
        limit: 100,
        exclude_archived: true,
      }).catch(() => ({ channels: [] })),
      slackAPI(token, "conversations.list", {
        types: "mpim",
        limit: 50,
        exclude_archived: true,
      }).catch(() => ({ channels: [] })),
    ]);

    const allConversations = [
      ...(imsData.channels || []),
      ...(channelsData.channels || []).filter((c) => c.is_member),
      ...(groupsData.channels || []),
    ];

    const channels = await Promise.all(
      allConversations.map(async (ch) => {
        let name = ch.name || "";
        let type = "channel";
        let lastMessage = "";
        let avatarUrl = null;

        if (ch.is_im) {
          type = "dm";
          name = await resolveUserName(token, ch.user);
          // Try to get avatar
          try {
            const userInfo = await slackAPI(token, "users.info", {
              user: ch.user,
            });
            avatarUrl = userInfo.user?.profile?.image_48 || null;
          } catch {}
        } else if (ch.is_mpim) {
          type = "group";
          name = ch.name
            .replace(/^mpdm-/, "")
            .replace(/-\d+$/, "")
            .replace(/--/g, ", ");
        } else if (ch.is_channel) {
          type = ch.is_private ? "private" : "public";
          name = `#${ch.name}`;
        }

        // Get last message preview
        try {
          const hist = await slackAPI(token, "conversations.history", {
            channel: ch.id,
            limit: 1,
          });
          const msg = hist.messages?.[0];
          if (msg) lastMessage = (msg.text || "").slice(0, 60);
        } catch {}

        return {
          id: ch.id,
          name,
          type,
          lastMessage,
          unread: ch.unread_count || 0,
          avatarUrl,
          isArchived: ch.is_archived || false,
        };
      })
    );

    channels.sort(
      (a, b) => b.unread - a.unread || a.name.localeCompare(b.name)
    );
    res.json({ channels });
  } catch (err) {
    console.error("Slack listChannels error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// GET /api/slack/channels/:id/messages
// ═══════════════════════════════════════════════════════════
async function getMessages(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const oldest = req.query.oldest || undefined; // for polling

    const params = { channel: id, limit };
    if (oldest) params.oldest = oldest;

    const data = await slackAPI(token, "conversations.history", params);
    const authData = await slackAPI(token, "auth.test");
    const myId = authData.user_id;

    const messages = await Promise.all(
      (data.messages || []).reverse().map(async (msg) => {
        const fromName = await resolveUserName(token, msg.user || msg.bot_id);

        // Get avatar
        let avatarUrl = null;
        try {
          if (msg.user) {
            const ui = await slackAPI(token, "users.info", { user: msg.user });
            avatarUrl = ui.user?.profile?.image_48 || null;
          }
        } catch {}

        return {
          id: msg.ts,
          text: msg.text || "",
          date: new Date(parseFloat(msg.ts) * 1000).toISOString(),
          fromMe: (msg.user || msg.bot_id) === myId,
          fromName,
          avatarUrl,
          reactions: msg.reactions || [],
          threadCount: msg.reply_count || 0,
          isPinned: false,
          file: msg.files?.[0]
            ? {
                id: msg.files[0].id,
                name: msg.files[0].name,
                size: formatSize(msg.files[0].size),
                url:
                  msg.files[0].url_private_download || msg.files[0].permalink,
              }
            : null,
        };
      })
    );

    // Mark channel as read
    if (data.messages?.length > 0) {
      await slackPOST(token, "conversations.mark", {
        channel: id,
        ts: data.messages[0].ts,
      }).catch(() => {});
      const { refreshUsersSignals } = require("../services/liveSignalRefresh");
      refreshUsersSignals([req.user?.username]).catch(() => {});
    }

    res.json({ messages });
  } catch (err) {
    console.error("Slack getMessages error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// POST /api/slack/channels/:id/send
// ═══════════════════════════════════════════════════════════
async function sendMessage(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { id } = req.params;
    const { message, replyTo } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }

    const body = {
      channel: id,
      text: message.trim(),
      as_user: true,
    };

    // If replying to a message, add thread_ts
    if (replyTo?.id) {
      body.thread_ts = replyTo.id;
      body.reply_broadcast = false;
    }

    const postRes = await slackPOST(token, "chat.postMessage", body);

    const authData = await slackAPI(token, "auth.test");
    const myName = await resolveUserName(token, authData.user_id);

    res.json({
      success: true,
      message: {
        id: postRes.ts,
        text: message.trim(),
        date: new Date().toISOString(),
        fromMe: true,
        fromName: myName,
      },
    });
  } catch (err) {
    console.error("Slack sendMessage error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// GET /api/slack/unread
// ═══════════════════════════════════════════════════════════
async function getUnread(req, res) {
  try {
    const token = await getUserToken(req.user.username);
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
        unreadChannels.push({
          id: ch.id,
          name: ch.name || ch.id,
          unread,
          type: ch.is_im ? "dm" : "channel",
        });
      }
    }

    res.json({ totalUnread, unreadChannels });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// GET /api/slack/search
// ═══════════════════════════════════════════════════════════
async function searchMessages(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { q } = req.query;

    if (!q?.trim()) return res.json({ messages: [] });

    const data = await slackAPI(token, "search.messages", {
      query: q.trim(),
      count: 20,
    });

    const messages = (data.messages?.matches || []).map((m) => ({
      id: m.ts,
      text: m.text || "",
      date: new Date(parseFloat(m.ts) * 1000).toISOString(),
      channelName: m.channel?.name || "unknown",
      channelId: m.channel?.id,
      fromName: m.username || "Unknown",
      permalink: m.permalink,
    }));

    res.json({ messages });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// POST /api/slack/channels/create
// ═══════════════════════════════════════════════════════════
async function createChannel(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { name, description = "", isPrivate = false } = req.body;

    if (!name?.trim())
      return res.status(400).json({ error: "Channel name required" });

    const cleanName = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "");

    const data = await slackPOST(token, "conversations.create", {
      name: cleanName,
      is_private: isPrivate,
    });

    if (description.trim()) {
      await slackPOST(token, "conversations.setPurpose", {
        channel: data.channel.id,
        purpose: description,
      }).catch(() => {});
    }

    res.json({
      success: true,
      channel: {
        id: data.channel.id,
        name: cleanName,
        type: isPrivate ? "private" : "public",
      },
    });
  } catch (err) {
    console.error("Slack createChannel error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// POST /api/slack/dm/open
// ═══════════════════════════════════════════════════════════
async function openDM(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { username } = req.body;

    if (!username?.trim())
      return res.status(400).json({ error: "Username required" });

    // Find user by username
    const usersRes = await slackAPI(token, "users.list", { limit: 200 });
    const clean = username.replace(/^@/, "").toLowerCase();
    const user = (usersRes.members || []).find(
      (u) =>
        u.name?.toLowerCase() === clean ||
        u.profile?.display_name?.toLowerCase() === clean
    );

    if (!user) {
      return res
        .status(404)
        .json({ error: `User @${clean} not found in workspace` });
    }

    const data = await slackPOST(token, "conversations.open", {
      users: user.id,
    });

    res.json({ success: true, channelId: data.channel.id });
  } catch (err) {
    console.error("Slack openDM error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// POST /api/slack/messages/:ts/react
// ═══════════════════════════════════════════════════════════
async function addReaction(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { ts } = req.params;
    const { emoji, channelId } = req.body;

    if (!emoji || !channelId) {
      return res.status(400).json({ error: "emoji and channelId required" });
    }

    await slackPOST(token, "reactions.add", {
      channel: channelId,
      timestamp: ts,
      name: emoji,
    }).catch((err) => {
      // already_reacted is not an error we care about
      if (!err.message.includes("already_reacted")) throw err;
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Slack addReaction error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// POST /api/slack/channels/:id/pin
// ═══════════════════════════════════════════════════════════
async function pinMessage(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { id: channel } = req.params;
    const { ts } = req.body;

    await slackPOST(token, "pins.add", { channel, timestamp: ts }).catch(
      (err) => {
        if (!err.message.includes("already_pinned")) throw err;
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Slack pinMessage error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// POST /api/slack/channels/:id/unpin
// ═══════════════════════════════════════════════════════════
async function unpinMessage(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { id: channel } = req.params;
    const { ts } = req.body;

    await slackPOST(token, "pins.remove", { channel, timestamp: ts }).catch(
      (err) => {
        if (!err.message.includes("no_pin")) throw err;
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Slack unpinMessage error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// GET /api/slack/channels/:id/threads/:ts
// ═══════════════════════════════════════════════════════════
async function getThreadReplies(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { id: channel, ts } = req.params;

    const data = await slackAPI(token, "conversations.replies", {
      channel,
      ts,
      limit: 50,
    });

    const authData = await slackAPI(token, "auth.test");
    const myId = authData.user_id;

    // First message is parent, rest are replies
    const replies = await Promise.all(
      (data.messages || []).slice(1).map(async (msg) => ({
        id: msg.ts,
        text: msg.text || "",
        date: new Date(parseFloat(msg.ts) * 1000).toISOString(),
        fromMe: msg.user === myId,
        fromName: await resolveUserName(token, msg.user || msg.bot_id),
      }))
    );

    res.json({ replies });
  } catch (err) {
    console.error("Slack getThreadReplies error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// POST /api/slack/channels/:id/threads/:ts/reply
// ═══════════════════════════════════════════════════════════
async function sendThreadReply(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { id: channel, ts: thread_ts } = req.params;
    const { message } = req.body;

    if (!message?.trim())
      return res.status(400).json({ error: "Message required" });

    const data = await slackPOST(token, "chat.postMessage", {
      channel,
      text: message.trim(),
      thread_ts,
      as_user: true,
    });

    const authData = await slackAPI(token, "auth.test");
    const myName = await resolveUserName(token, authData.user_id);

    res.json({
      success: true,
      reply: {
        id: data.ts,
        text: message.trim(),
        date: new Date().toISOString(),
        fromMe: true,
        fromName: myName,
      },
    });
  } catch (err) {
    console.error("Slack sendThreadReply error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// GET /api/slack/channels/:id/files
// ═══════════════════════════════════════════════════════════
async function getChannelFiles(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { id: channel } = req.params;

    const data = await slackAPI(token, "files.list", { channel, count: 20 });

    const files = (data.files || []).map((f) => ({
      id: f.id,
      name: f.name || "Untitled",
      size: formatSize(f.size),
      url: f.url_private_download || f.permalink || "#",
      date: new Date(f.timestamp * 1000).toISOString(),
      type: f.filetype,
    }));

    res.json({ files });
  } catch (err) {
    console.error("Slack getChannelFiles error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// GET /api/slack/files
// ═══════════════════════════════════════════════════════════
async function getWorkspaceFiles(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const data = await slackAPI(token, "files.list", { count: 30 });

    const files = (data.files || []).map((f) => ({
      id: f.id,
      name: f.name || "Untitled",
      size: formatSize(f.size),
      url: f.url_private_download || f.permalink || "#",
      date: new Date(f.timestamp * 1000).toISOString(),
      channelName: f.channels?.[0] || "Direct message",
      type: f.filetype,
    }));

    res.json({ files });
  } catch (err) {
    console.error("Slack getWorkspaceFiles error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// POST /api/slack/channels/:id/upload
// ═══════════════════════════════════════════════════════════
async function uploadFile(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { id: channel } = req.params;
    const { message = "" } = req.body;

    if (!req.file) return res.status(400).json({ error: "No file provided" });

    const FormData = require("form-data");
    const form = new FormData();
    form.append("token", token);
    form.append("channels", channel);
    form.append("filename", req.file.originalname);
    form.append("filetype", "auto");
    if (message) form.append("initial_comment", message);
    form.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const uploadRes = await axios.post(
      "https://slack.com/api/files.upload",
      form,
      { headers: { ...form.getHeaders() } }
    );

    if (!uploadRes.data.ok) throw new Error(uploadRes.data.error);

    res.json({
      success: true,
      file: {
        id: uploadRes.data.file.id,
        name: uploadRes.data.file.name,
        size: formatSize(uploadRes.data.file.size),
        url: uploadRes.data.file.permalink,
      },
    });
  } catch (err) {
    console.error("Slack uploadFile error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// POST /api/slack/huddle/start
// ═══════════════════════════════════════════════════════════
async function startHuddle(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { channelId } = req.body;

    const authData = await slackAPI(token, "auth.test");

    // Slack has no public API to programmatically start huddles
    // Return the web URL and deep link — frontend opens it
    const huddleUrl = `slack://channel?team=${authData.team_id}&id=${channelId}`;
    const webUrl = `https://app.slack.com/huddle/${authData.team_id}/${channelId}`;

    res.json({ success: true, huddleUrl, webUrl });
  } catch (err) {
    console.error("Slack startHuddle error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// POST /api/slack/huddle/invite
// ═══════════════════════════════════════════════════════════
async function inviteToHuddle(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { channelId, userId } = req.body;

    const authData = await slackAPI(token, "auth.test");
    const huddleLink = `https://app.slack.com/huddle/${authData.team_id}/${channelId}`;

    await slackPOST(token, "chat.postMessage", {
      channel: userId,
      text: `Join my huddle 🎧 ${huddleLink}`,
      as_user: true,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Slack inviteToHuddle error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// POST /api/slack/status/update
// ═══════════════════════════════════════════════════════════
async function updateStatus(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { emoji = "", text = "" } = req.body;

    await slackPOST(token, "users.profile.set", {
      profile: {
        status_text: text,
        status_emoji: emoji,
        status_expiration: 0,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Slack updateStatus error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// POST /api/slack/status/away
// ═══════════════════════════════════════════════════════════
async function setAwayStatus(req, res) {
  try {
    const token = await getUserToken(req.user.username);
    const { away = true } = req.body;

    await slackPOST(token, "users.setPresence", {
      presence: away ? "away" : "auto",
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Slack setAwayStatus error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

module.exports = {
  getMe,
  getCustomEmojis,
  listChannels,
  getMessages,
  sendMessage,
  getUnread,
  searchMessages,
  createChannel,
  openDM,
  addReaction,
  pinMessage,
  unpinMessage,
  getThreadReplies,
  sendThreadReply,
  getChannelFiles,
  getWorkspaceFiles,
  uploadFile,
  startHuddle,
  inviteToHuddle,
  updateStatus,
  setAwayStatus,
};
