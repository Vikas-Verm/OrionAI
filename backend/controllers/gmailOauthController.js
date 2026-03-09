/**
 * gmailOAuthController.js
 *
 * Developer sets GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET once in .env
 * Every user just clicks "Sign in with Google" — no credentials needed from users
 * Each user's tokens are saved separately in their own Integration DB record
 */

const axios = require("axios");
const Integration = require("../models/Integration");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

const REDIRECT_URI =
  process.env.GMAIL_REDIRECT_URI ||
  "http://localhost:3000/api/integrations/gmail/oauth/callback";

// ── GET /api/integrations/gmail/oauth/start ───────────────
async function gmailOAuthStart(req, res) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res
      .status(500)
      .json({
        error:
          "Gmail OAuth not configured on the server. Contact your administrator.",
      });
  }

  const userId = req.user?.username;
  const state = Buffer.from(JSON.stringify({ userId })).toString("base64url");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  res.json({ url: authUrl.toString() });
}

// ── GET /api/integrations/gmail/oauth/callback ────────────
// Public route — Google redirects here after user grants permission
async function gmailOAuthCallback(req, res) {
  const { code, state, error } = req.query;

  if (error)
    return res.send(
      popupHTML({ success: false, error: `Google denied access: ${error}` })
    );
  if (!code || !state)
    return res.send(
      popupHTML({ success: false, error: "Missing code or state." })
    );

  try {
    // Decode userId from state
    let userId;
    try {
      userId = JSON.parse(Buffer.from(state, "base64url").toString()).userId;
    } catch {
      return res.send(
        popupHTML({ success: false, error: "Invalid state parameter." })
      );
    }

    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;

    // Exchange code for tokens
    const tokenRes = await axios.post("https://oauth2.googleapis.com/token", {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    });
    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Get user's Gmail address
    const profileRes = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );
    const { email, name } = profileRes.data;

    // Save tokens to this user's DB record
    await Integration.findOneAndUpdate(
      { userId, type: "gmail" },
      {
        $set: {
          userId,
          type: "gmail",
          name: "Gmail",
          enabled: true,
          gmail: {
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresAt: new Date(Date.now() + expires_in * 1000),
            userEmail: email,
            userName: name,
          },
          lastTestedAt: new Date(),
          lastTestOk: true,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    console.log(`✅ Gmail connected: ${userId} → ${email}`);
    return res.send(popupHTML({ success: true, email }));
  } catch (err) {
    const msg = err.response?.data?.error_description || err.message;
    console.error("Gmail OAuth callback error:", msg);
    return res.send(popupHTML({ success: false, error: msg }));
  }
}

function popupHTML({ success, email, error }) {
  if (success)
    return `<!DOCTYPE html><html>
<head><title>Gmail Connected</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,sans-serif;background:#0f0f1a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh}
.box{text-align:center;padding:48px 40px}
.icon{font-size:52px;margin-bottom:20px}
h2{font-size:22px;font-weight:700;color:#4ade80;margin-bottom:8px}
p{font-size:14px;color:#64748b}
.note{margin-top:14px;font-size:12px;color:#334155}
</style></head>
<body><div class="box">
  <div class="icon">✅</div>
  <h2>Gmail Connected!</h2>
  <p>${email}</p>
  <p class="note">This window will close automatically…</p>
</div>
<script>
  window.opener?.postMessage({ type: 'gmail-oauth-success', email: '${email}' }, '*')
  setTimeout(() => window.close(), 1800)
<\/script></body></html>`;

  return `<!DOCTYPE html><html>
<head><title>Connection Failed</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,sans-serif;background:#0f0f1a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh}
.box{text-align:center;padding:48px 40px;max-width:380px}
.icon{font-size:52px;margin-bottom:20px}
h2{font-size:20px;font-weight:700;color:#f87171;margin-bottom:10px}
p{font-size:13px;color:#64748b;line-height:1.5;word-break:break-word;margin-bottom:20px}
button{padding:8px 24px;background:#6366f1;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer}
</style></head>
<body><div class="box">
  <div class="icon">❌</div>
  <h2>Connection Failed</h2>
  <p>${error || "An unknown error occurred"}</p>
  <button onclick="window.close()">Close</button>
</div></body></html>`;
}

module.exports = { gmailOAuthStart, gmailOAuthCallback };
