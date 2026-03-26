const { google } = require("googleapis");
const Integration = require("../models/Integration");
const { clearCachedAccessToken } = require("./gmailModuleController");

// ─────────────────────────────────────────────────────────────────
// Helper — build OAuth2 client, with DB fallback if env vars missing
// ─────────────────────────────────────────────────────────────────
function makeOAuth2Client(clientId, clientSecret) {
  const id =
    clientId || process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID;
  const secret =
    clientSecret ||
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.GMAIL_CLIENT_SECRET;
  const redirect =
    process.env.GOOGLE_REDIRECT_URI ||
    process.env.GMAIL_REDIRECT_URI ||
    `${
      process.env.BACKEND_URL || "http://localhost:3000"
    }/api/integrations/gmail/oauth/callback`;

  if (!id || !secret) {
    throw new Error(
      `Google OAuth credentials missing. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file.`
    );
  }

  return new google.auth.OAuth2(id, secret, redirect);
}

// Try to read clientId/clientSecret from DB for a given user (fallback if env missing)
async function getClientCreds(userId) {
  try {
    const doc = await Integration.findOne({ userId, type: "gmail" });
    if (doc?.gmail?.clientId && doc?.gmail?.clientSecret) {
      return {
        clientId: doc.gmail.clientId,
        clientSecret: doc.gmail.clientSecret,
      };
    }
  } catch {}
  return { clientId: null, clientSecret: null };
}

// ── GET /api/integrations/gmail/oauth/start ───────────────────────
async function gmailOAuthStart(req, res) {
  try {
    // Try env vars first, fall back to DB-stored creds from previous auth
    const dbCreds = await getClientCreds(req.user?.username);
    const oauth2 = makeOAuth2Client(dbCreds.clientId, dbCreds.clientSecret);

    const url = oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent", // force refresh_token on every auth
      scope: [
        "https://mail.google.com/", // IMAP + SMTP (required for imapflow)
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/contacts.readonly", // contact photos
      ],
      state: req.user?.username,
    });
    res.json({ url });
  } catch (err) {
    console.error("Gmail OAuth start error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/integrations/gmail/oauth/callback ────────────────────
async function gmailOAuthCallback(req, res) {
  const { code, state: userId } = req.query;

  if (!code) {
    return res.send(`<script>
      window.opener?.postMessage({ type: 'gmail-oauth-error', error: 'No code received' }, '*')
      window.close()
    </script>`);
  }

  try {
    const dbCreds = await getClientCreds(userId);
    const oauth2 = makeOAuth2Client(dbCreds.clientId, dbCreds.clientSecret);
    const { tokens } = await oauth2.getToken(code);

    // ── DEBUG: Log exactly which scopes Google granted ──────────────
    console.log(`[Gmail OAuth] Scopes granted for ${userId}:`, tokens.scope);
    const hasImapScope = (tokens.scope || "").includes(
      "https://mail.google.com/"
    );
    if (!hasImapScope) {
      console.error(
        `[Gmail OAuth] ⚠️  MISSING IMAP scope! Granted: ${tokens.scope}`
      );
      console.error(
        `[Gmail OAuth] Fix: Add https://mail.google.com/ to OAuth consent screen scopes in Google Cloud Console`
      );
    } else {
      console.log(`[Gmail OAuth] ✅ IMAP scope present — IMAP sync will work`);
    }
    // ── Kill old IMAP manager so it reconnects with new token ───────
    try {
      const syncSvc = require("./gmailSyncService");
      syncSvc.destroyManager(userId);
      console.log(`[Gmail OAuth] Destroyed old IMAP manager for ${userId}`);
    } catch {}

    oauth2.setCredentials(tokens);
    const people = google.oauth2({ version: "v2", auth: oauth2 });
    const profile = await people.userinfo.get();

    // Always save the clientId/clientSecret that was actually used
    const clientId =
      oauth2._clientId || process.env.GOOGLE_CLIENT_ID || dbCreds.clientId;
    const clientSecret =
      oauth2._clientSecret ||
      process.env.GOOGLE_CLIENT_SECRET ||
      dbCreds.clientSecret;

    await Integration.findOneAndUpdate(
      { userId, type: "gmail" },
      {
        $set: {
          userId,
          type: "gmail",
          name: "Gmail",
          enabled: true,
          gmail: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            userEmail: profile.data.email,
            userName: profile.data.name,
            clientId,
            clientSecret,
          },
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    clearCachedAccessToken(userId);

    res.send(`<script>
      if (window.opener) {
        window.opener.postMessage({ type: 'gmail-oauth-success', email: '${profile.data.email}' }, '*')
        window.close()
      } else {
        window.location.href = '/?gmail=connected'
      }
    </script>`);
  } catch (err) {
    console.error("Gmail OAuth callback error:", err.message);
    res.send(`<script>
      window.opener?.postMessage({ type: 'gmail-oauth-error', error: '${err.message.replace(
        /'/g,
        "\\'"
      )}' }, '*')
      window.close()
    </script>`);
  }
}

module.exports = { gmailOAuthStart, gmailOAuthCallback };
