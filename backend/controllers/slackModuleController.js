const { WebClient } = require("@slack/web-api");
const Integration = require("../models/Integration");

async function getSlackClient(userId) {
  const integ = await Integration.findOne({ userId, type: "slack" });
  const token = integ?.slack?.userToken;
  if (!token)
    throw new Error("Slack not connected — click Connect in Integrations");
  return {
    client: new WebClient(token),
    myUserId: integ.slack.userId,
    myName: integ.slack.realName || integ.slack.userName || "You",
  };
}

const userCache = {};
async function resolveUser(client, uid) {
  if (!uid) return "Unknown";
  if (userCache[uid]) return userCache[uid];
  try {
    const u = await client.users.info({ user: uid });
    userCache[uid] =
      u.user?.real_name || u.user?.profile?.display_name || u.user?.name || uid;
  } catch {
    userCache[uid] = uid;
  }
  return userCache[uid];
}

function formatTs(ts) {
  if (!ts) return "";
  return new Date(parseFloat(ts) * 1000).toISOString();
}

exports.getChannels = async (req, res) => {
  try {
    const userId = req.user?.username;
    const { client } = await getSlackClient(userId);

    const [imRes, chRes, mpRes] = await Promise.all([
      client.conversations
        .list({ types: "im", limit: 50 })
        .catch(() => ({ channels: [] })),
      client.conversations
        .list({
          types: "public_channel,private_channel",
          exclude_archived: true,
          limit: 50,
        })
        .catch(() => ({ channels: [] })),
      client.conversations
        .list({ types: "mpim", limit: 20 })
        .catch(() => ({ channels: [] })),
    ]);

    const dms = await Promise.all(
      (imRes.channels || [])
        .filter((c) => c.user)
        .map(async (c) => {
          const name = await resolveUser(client, c.user);
          let lastMessage = "";
          try {
            const h = await client.conversations.history({
              channel: c.id,
              limit: 1,
            });
            lastMessage = h.messages?.[0]?.text?.slice(0, 60) || "";
          } catch {}
          return {
            id: c.id,
            name,
            type: "dm",
            lastMessage,
            unread: c.unread_count || 0,
          };
        })
    );

    const channels = (chRes.channels || [])
      .filter((c) => c.is_member)
      .map((c) => ({
        id: c.id,
        name: `# ${c.name}`,
        type: "channel",
        lastMessage: c.topic?.value || "",
        unread: c.unread_count || 0,
      }));

    const groups = (mpRes.channels || []).map((c) => ({
      id: c.id,
      name: c.name || "Group",
      type: "group",
      lastMessage: "",
      unread: c.unread_count || 0,
    }));

    res.json({ channels: [...dms, ...channels, ...groups] });
  } catch (err) {
    console.error("Slack channels error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const userId = req.user?.username;
    const { client, myUserId } = await getSlackClient(userId);
    const { channelId } = req.params;

    const histRes = await client.conversations.history({
      channel: channelId,
      limit: parseInt(req.query.limit) || 50,
    });

    const msgs = await Promise.all(
      (histRes.messages || []).reverse().map(async (m) => ({
        id: m.ts,
        text: m.text || "",
        date: formatTs(m.ts),
        fromMe: m.user === myUserId,
        fromName:
          m.user === myUserId ? "You" : await resolveUser(client, m.user),
        reactions: (m.reactions || []).map((r) => ({
          emoji: r.name,
          count: r.count,
        })),
      }))
    );

    res.json({ messages: msgs });
  } catch (err) {
    console.error("Slack messages error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const userId = req.user?.username;
    const { client } = await getSlackClient(userId);
    const { channelId } = req.params;
    const { message } = req.body;

    const r = await client.chat.postMessage({
      channel: channelId,
      text: message,
      as_user: true,
    });
    res.json({ success: true, ts: r.ts });
  } catch (err) {
    console.error("Slack send error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
