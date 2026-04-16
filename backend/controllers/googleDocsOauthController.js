const { google } = require("googleapis");
const Integration = require("../models/Integration");

function makeOAuth2Client() {
  const clientId = process.env.GOOGLE_DOCS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DOCS_CLIENT_SECRET;
  const redirectUri =
    "http://localhost:3000/api/integrations/google-docs/oauth/callback";

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  }

  console.log("Google Docs OAuth config resolved:", {
    clientIdPreview: `${clientId.slice(0, 25)}...`,
    clientSecretPreview: `${clientSecret.slice(0, 8)}...`,
    redirectUri,
  });

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function googleDocsOAuthStart(req, res) {
  try {
    const oauth2 = makeOAuth2Client();

    const url = oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
      state: req.user?.username,
    });

    res.json({ url });
  } catch (err) {
    console.error("Google Docs OAuth start error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

async function googleDocsOAuthCallback(req, res) {
  const { code, state: userId } = req.query;

  if (!code) {
    return res.send(`<script>
      window.opener?.postMessage({ type: 'gdocs-oauth-error', error: 'No code received' }, '*');
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
      { userId, type: "google_docs" },
      {
        $set: {
          userId,
          type: "google_docs",
          name: "Google Docs",
          enabled: true,
          googleDocs: {
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
        window.opener.postMessage({ type: 'gdocs-oauth-success', email: '${profile.data.email}' }, '*');
        window.close();
      } else {
        window.location.href = '/?gdocs=connected';
      }
    </script>`);
  } catch (err) {
    console.error("Google Docs OAuth callback error:", err.message);
    res.send(`<script>
      window.opener?.postMessage({ type: 'gdocs-oauth-error', error: '${String(
        err.message || "Google Docs OAuth failed"
      ).replace(/'/g, "\\'")}' }, '*');
      window.close();
    </script>`);
  }
}

module.exports = {
  googleDocsOAuthStart,
  googleDocsOAuthCallback,
};
