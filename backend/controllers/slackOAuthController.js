const axios = require("axios");
const Integration = require("../models/Integration");

// ── Scopes needed for full Slack as a user ─────────────────
// channels:read, groups:read, im:read, mpim:read  → list convos
// channels:history, groups:history, im:history    → read messages
// chat:write                                       → send messages
// users:read                                       → resolve names
// emoji:read, reactions:read                       → nice to have
const SCOPES = [
  "channels:read",
  "channels:history",
  "groups:read",
  "groups:history",
  "im:read",
  "im:history",
  "mpim:read",
  "mpim:history",
  "chat:write",
  "users:read",
  "users.profile:read",
  "emoji:read",
].join(",");

// ── GET /api/integrations/slack/oauth/start ────────────────
async function slackOAuthStart(req, res) {
  const state = Buffer.from(
    JSON.stringify({
      userId: req.user?.username,
      ts: Date.now(),
    })
  ).toString("base64url");

  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", process.env.SLACK_CLIENT_ID);
  url.searchParams.set("user_scope", SCOPES); // user_scope = act as the user
  url.searchParams.set("redirect_uri", process.env.SLACK_REDIRECT_URI);
  url.searchParams.set("state", state);

  res.redirect(url.toString());
}

// ── GET /api/integrations/slack/oauth/callback ────────────
async function slackOAuthCallback(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(
      `${process.env.FRONTEND_URL}/integrations?slack=error&msg=${error}`
    );
  }

  let userId;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = decoded.userId;
  } catch {
    return res.redirect(
      `${process.env.FRONTEND_URL}/integrations?slack=error&msg=invalid_state`
    );
  }

  try {
    // Exchange code for token
    const tokenRes = await axios.post(
      "https://slack.com/api/oauth.v2.access",
      null,
      {
        params: {
          client_id: process.env.SLACK_CLIENT_ID,
          client_secret: process.env.SLACK_CLIENT_SECRET,
          code,
          redirect_uri: process.env.SLACK_REDIRECT_URI,
        },
      }
    );

    const data = tokenRes.data;
    if (!data.ok) throw new Error(data.error || "Slack OAuth failed");

    // authed_user contains the USER token (not bot token)
    const userToken = data.authed_user?.access_token;
    const authedUser = data.authed_user?.id;
    if (!userToken)
      throw new Error("No user token returned — ensure user_scope is set");

    // Get user profile
    const profileRes = await axios.get("https://slack.com/api/users.identity", {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const profile = profileRes.data.user || {};
    const teamName = profileRes.data.team?.name || data.team?.name || "";

    // Save to Integration
    await Integration.findOneAndUpdate(
      { userId, type: "slack" },
      {
        userId,
        type: "slack",
        slack: {
          userToken,
          userId: authedUser,
          userName: profile.name || "",
          realName: profile.real_name || "",
          teamName,
          teamId: data.team?.id || "",
          connectedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    res.redirect(`${process.env.FRONTEND_URL}/integrations?slack=connected`);
  } catch (err) {
    console.error("Slack OAuth callback error:", err.message);
    res.redirect(
      `${
        process.env.FRONTEND_URL
      }/integrations?slack=error&msg=${encodeURIComponent(err.message)}`
    );
  }
}

module.exports = { slackOAuthStart, slackOAuthCallback };
