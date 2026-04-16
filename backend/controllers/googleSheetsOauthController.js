const { google } = require("googleapis");
const Integration = require("../models/Integration");
const { getOAuthConfig } = require("../services/googleOAuthConfig");

function makeOAuth2Client() {
  const oauth = getOAuthConfig("google_sheets");
  if (!oauth.clientId || !oauth.clientSecret || !oauth.redirectUri) {
    throw new Error("Missing Google Sheets OAuth configuration");
  }
  console.log(oauth, "Google Sheets OAuth config resolved:");
  return new google.auth.OAuth2(
    oauth.clientId,
    oauth.clientSecret,
    oauth.redirectUri
  );
}

async function googleSheetsOAuthStart(req, res) {
  try {
    const oauth2 = makeOAuth2Client();
    const url = oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
      state: req.user?.username,
    });

    res.json({ url });
  } catch (err) {
    console.error("Google Sheets OAuth start error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

async function googleSheetsOAuthCallback(req, res) {
  const { code, state: userId } = req.query;

  if (!code) {
    return res.send(`<script>
      window.opener?.postMessage({ type: 'gsheets-oauth-error', error: 'No code received' }, '*');
      window.close();
    </script>`);
  }

  try {
    const oauth2 = makeOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    const people = google.oauth2({ version: "v2", auth: oauth2 });
    const profile = await people.userinfo.get();

    await Integration.findOneAndUpdate(
      { userId, type: "google_sheets" },
      {
        $set: {
          userId,
          type: "google_sheets",
          name: "Google Sheets",
          enabled: true,
          googleSheets: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            userEmail: profile.data.email,
            userName: profile.data.name,
          },
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    res.send(`<script>
      if (window.opener) {
        window.opener.postMessage({ type: 'gsheets-oauth-success', email: '${profile.data.email}' }, '*');
        window.close();
      } else {
        window.location.href = '/?gsheets=connected';
      }
    </script>`);
  } catch (err) {
    console.error("Google Sheets OAuth callback error:", err.message);
    res.send(`<script>
      window.opener?.postMessage({ type: 'gsheets-oauth-error', error: '${String(
        err.message || "Google Sheets OAuth failed"
      ).replace(/'/g, "\\'")}' }, '*');
      window.close();
    </script>`);
  }
}

module.exports = {
  googleSheetsOAuthCallback,
  googleSheetsOAuthStart,
};
