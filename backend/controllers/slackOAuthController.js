const axios = require("axios");
const jwt = require("jsonwebtoken");
const Integration = require("../models/Integration");

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
  "search:read",
  "emoji:read",
].join(",");

// ── GET /api/integrations/slack/oauth/start ────────────────
// No authenticate middleware on this route — browser redirect
// can't send Authorization header. Token comes as query param.
async function slackOAuthStart(req, res) {
  // 1. Get JWT from query param (sent by frontend)
  const userId = req.user?.username;

  // 3. Build Slack OAuth URL
  const state = Buffer.from(
    JSON.stringify({ userId, ts: Date.now() })
  ).toString("base64url");

  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", process.env.SLACK_CLIENT_ID);
  url.searchParams.set("user_scope", SCOPES);
  url.searchParams.set("redirect_uri", process.env.SLACK_REDIRECT_URI);
  url.searchParams.set("state", state);

  console.log("Slack OAuth start → redirecting for userId:", userId);
  res.json({ url: url.toString() });
}

// ── GET /api/integrations/slack/oauth/callback ────────────
async function slackOAuthCallback(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    // Close popup with error
    return res.send(`
      <script>
        window.opener?.postMessage({ type: 'slack-oauth-error', error: '${error}' }, '*')
        window.close()
      </script>
    `);
  }

  let userId;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = decoded.userId;
  } catch {
    return res.send(`
      <script>
        window.opener?.postMessage({ type: 'slack-oauth-error', error: 'invalid_state' }, '*')
        window.close()
      </script>
    `);
  }

  try {
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

    const userToken = data.authed_user?.access_token;
    const authedUserId = data.authed_user?.id;
    if (!userToken) throw new Error("No user token returned");

    // Get profile
    const authTest = await axios.get("https://slack.com/api/auth.test", {
      headers: { Authorization: `Bearer ${userToken}` },
    });

    let displayName = authTest.data.user || "";
    let realName = authTest.data.user || "";
    try {
      const profileRes = await axios.get(
        "https://slack.com/api/users.profile.get",
        {
          headers: { Authorization: `Bearer ${userToken}` },
        }
      );
      if (profileRes.data.ok) {
        displayName = profileRes.data.profile?.display_name || displayName;
        realName = profileRes.data.profile?.real_name || realName;
      }
    } catch {}

    await Integration.findOneAndUpdate(
      { userId, type: "slack" },
      {
        $set: {
          userId,
          type: "slack",
          enabled: true,
          "slack.userToken": userToken,
          "slack.userId": authedUserId,
          "slack.userName": displayName,
          "slack.realName": realName,
          "slack.teamName": authTest.data.team || "",
          "slack.teamId": authTest.data.team_id || "",
          "slack.connectedAt": new Date(),
        },
      },
      { upsert: true, new: true }
    );

    // ✅ Send postMessage to parent window then close — same as Gmail
    res.send(`
      <script>
        window.opener?.postMessage({ type: 'slack-oauth-success' }, '*')
        window.close()
      </script>
    `);
  } catch (err) {
    console.error("Slack OAuth callback error:", err.message);
    res.send(`
      <script>
        window.opener?.postMessage({ type: 'slack-oauth-error', error: '${encodeURIComponent(
          err.message
        )}' }, '*')
        window.close()
      </script>
    `);
  }
}

module.exports = { slackOAuthStart, slackOAuthCallback };
