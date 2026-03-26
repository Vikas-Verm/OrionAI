const { google } = require("googleapis");
const Integration = require("../models/Integration");
const { getOAuthConfig } = require("../services/googleOAuthConfig");

// ─────────────────────────────────────────────────────────────────
// Helper — build OAuth2 client from env vars
// ─────────────────────────────────────────────────────────────────
function makeOAuth2Client() {
  const oauth = getOAuthConfig("google_calendar");
  return new google.auth.OAuth2(
    oauth.clientId,
    oauth.clientSecret,
    oauth.redirectUri
  );
}

// ── GET /api/integrations/google-calendar/oauth/start ────────────
async function googleCalendarOAuthStart(req, res) {
  const oauth2 = makeOAuth2Client();
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force refresh_token on every auth
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    state: req.user?.username,
  });
  res.json({ url });
}

// ── GET /api/integrations/google-calendar/oauth/callback ─────────
async function googleCalendarOAuthCallback(req, res) {
  const { code, state: userId } = req.query;

  if (!code) {
    return res.send(`<script>
      window.opener?.postMessage({ type: 'gcal-oauth-error', error: 'No code received' }, '*')
      window.close()
    </script>`);
  }

  try {
    const oauth2 = makeOAuth2Client();
    const { tokens } = await oauth2.getToken(code);

    // Get user profile
    oauth2.setCredentials(tokens);
    const people = google.oauth2({ version: "v2", auth: oauth2 });
    const profile = await people.userinfo.get();

    const { clientId, clientSecret } = getOAuthConfig("google_calendar");

    // ── Save ALL credentials including clientId + clientSecret ──────
    await Integration.findOneAndUpdate(
      { userId, type: "google_calendar" },
      {
        $set: {
          userId,
          type: "google_calendar",
          name: "Google Calendar",
          enabled: true,
          googleCalendar: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token, // always set because prompt:'consent'
            expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            userEmail: profile.data.email,
            userName: profile.data.name,
            clientId, // ← SAVE these so refresh works without env vars
            clientSecret, // ←
          },
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    res.send(`<script>
      if (window.opener) {
        window.opener.postMessage({ type: 'gcal-oauth-success', email: '${profile.data.email}' }, '*')
        window.close()
      } else {
        window.location.href = '/?gcal=connected'
      }
    </script>`);
  } catch (err) {
    console.error("Google Calendar OAuth callback error:", err.message);
    res.send(`<script>
      window.opener?.postMessage({ type: 'gcal-oauth-error', error: '${err.message.replace(
        /'/g,
        "\\'"
      )}' }, '*')
      window.close()
    </script>`);
  }
}

module.exports = { googleCalendarOAuthStart, googleCalendarOAuthCallback };
