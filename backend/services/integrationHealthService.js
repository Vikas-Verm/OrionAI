// ════════════════════════════════════════════════════════════════════════════
// FILE: backend/services/integrationHealthService.js
// Silently checks all integrations every hour + auto-refreshes expired tokens
// ════════════════════════════════════════════════════════════════════════════
"use strict";

const Integration = require("../models/Integration");
const { getOAuthConfig } = require("./googleOAuthConfig");
const { testDatabaseConnection } = require("./connectedDatabaseService");
const { testRazorpayConnection } = require("./tools/toolRazorpay");

// Health status cache: userId:type → { status, checkedAt, error }
const healthCache = new Map();

// ── Check if a token is expired or about to expire ────────────────────────
function isTokenExpired(expiresAt, bufferMs = 5 * 60 * 1000) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - bufferMs < Date.now();
}

// ── Resolve the DB field name for a given integration type ───────────────
// "google_calendar" is stored as "calendar" in the Integration document.
// All other types match their field name directly (gmail → gmail, etc.)
// Maps integration type → actual field name in the Integration document.
// "google_calendar" is stored as "googleCalendar" (camelCase), not "google_calendar".
function resolveField(type) {
  return type === "google_calendar" ? "googleCalendar" : type;
}

function isInvalidGrantError(err) {
  const haystack = [
    err?.response?.data?.error,
    err?.response?.data?.error_description,
    err?.errors?.[0]?.message,
    err?.message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes("invalid_grant");
}

async function markGoogleReconnectRequired(integration, type) {
  const field = resolveField(type);
  await Integration.findByIdAndUpdate(integration._id, {
    $set: {
      enabled: false,
      [`${field}.accessToken`]: "",
      [`${field}.expiresAt`]: null,
      lastTestOk: false,
      updatedAt: new Date(),
    },
  }).catch(() => {});
}

// ── Refresh Google tokens (Gmail + Calendar) ──────────────────────────────
async function refreshGoogleToken(integration, type) {
  const field = resolveField(type);
  try {
    const { google } = require("googleapis");
    const oauth = getOAuthConfig(type, integration[field] || {});
    const oauth2 = new google.auth.OAuth2(
      oauth.clientId,
      oauth.clientSecret,
      oauth.redirectUri
    );
    oauth2.setCredentials({ refresh_token: integration[field].refreshToken });

    const { credentials } = await oauth2.refreshAccessToken();

    // Always write back using the actual DB field name
    await Integration.findByIdAndUpdate(integration._id, {
      $set: {
        [`${field}.accessToken`]: credentials.access_token,
        [`${field}.expiresAt`]: new Date(credentials.expiry_date),
        updatedAt: new Date(),
      },
    });

    console.log(`🔄 Refreshed ${type} token for ${integration.userId}`);
    return { healthy: true };
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await markGoogleReconnectRequired(integration, type);
      console.warn(
        `Reconnect required for ${type}/${integration.userId}: invalid_grant`
      );
      return { healthy: false, error: "Reconnect needed" };
    }
    console.error(
      `Token refresh failed for ${type}/${integration.userId}:`,
      err.message
    );
    return { healthy: false, error: "Token refresh failed — reconnect needed" };
  }
}

// ── Check single integration health ───────────────────────────────────────
async function checkIntegration(integration) {
  const { type, userId } = integration;
  const cacheKey = `${userId}:${type}`;

  try {
    switch (type) {
      case "gmail":
      case "google_calendar": {
        // "google_calendar" tokens live under integration.calendar in the DB
        const field = resolveField(type);
        const data = integration[field];
        if (!data?.refreshToken)
          return { healthy: false, error: "Not connected" };

        // Auto-refresh if expired
        if (isTokenExpired(data.expiresAt)) {
          return await refreshGoogleToken(integration, type);
        }

        // Quick validation — fetch profile
        const { google } = require("googleapis");
        const oauth = getOAuthConfig(type, data || {});
        const oauth2 = new google.auth.OAuth2(
          oauth.clientId,
          oauth.clientSecret,
          oauth.redirectUri
        );
        oauth2.setCredentials({
          access_token: data.accessToken,
          refresh_token: data.refreshToken,
        });

        if (type === "gmail") {
          const gmail = google.gmail({ version: "v1", auth: oauth2 });
          await gmail.users.getProfile({
            userId: "me",
            fields: "emailAddress",
          });
        } else {
          const cal = google.calendar({ version: "v3", auth: oauth2 });
          await cal.calendarList.list({ maxResults: 1 });
        }
        return { healthy: true };
      }

      case "slack": {
        const data = integration.slack;
        if (!data?.userToken) return { healthy: false, error: "Not connected" };
        const axios = require("axios");
        const res = await axios.get("https://slack.com/api/auth.test", {
          headers: { Authorization: `Bearer ${data.userToken}` },
          timeout: 5000,
        });
        if (!res.data.ok)
          return {
            healthy: false,
            error: res.data.error || "Slack token invalid",
          };
        return { healthy: true };
      }

      case "telegram": {
        const data = integration.telegram;
        if (!data?.sessionString)
          return { healthy: false, error: "Not connected" };
        // Telegram session is valid as long as it exists
        // Real validation happens when the gramjs client connects
        return { healthy: true };
      }

      case "jira": {
        const data = integration.jira;
        if (!data?.apiToken || !data?.domain)
          return { healthy: false, error: "Not connected" };
        const axios = require("axios");
        await axios.get(`https://${data.domain}/rest/api/3/myself`, {
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${data.email}:${data.apiToken}`
            ).toString("base64")}`,
            "Content-Type": "application/json",
          },
          timeout: 5000,
        });
        return { healthy: true };
      }

      case "database": {
        await testDatabaseConnection(integration.database || {});
        return { healthy: true };
      }

      case "razorpay": {
        await testRazorpayConnection(integration.razorpay || {});
        return { healthy: true };
      }

      default:
        return { healthy: true }; // Unknown types assumed healthy
    }
  } catch (err) {
    // If 401 on Google, try to refresh
    if ((type === "gmail" || type === "google_calendar") && err.code === 401) {
      return await refreshGoogleToken(integration, type);
    }
    return { healthy: false, error: err.message };
  }
}

// ── Run health check for a user ───────────────────────────────────────────
async function checkUserIntegrations(userId) {
  try {
    const integrations = await Integration.find({ userId, enabled: true });
    const results = {};

    for (const intg of integrations) {
      const result = await checkIntegration(intg).catch((err) => ({
        healthy: false,
        error: err.message,
      }));

      const cacheKey = `${userId}:${intg.type}`;
      healthCache.set(cacheKey, { ...result, checkedAt: Date.now() });
      results[intg.type] = result;
    }
    return results;
  } catch (err) {
    console.error("checkUserIntegrations error:", err.message);
    return {};
  }
}

// ── Get cached health status ───────────────────────────────────────────────
function getHealthStatus(userId, type) {
  const key = `${userId}:${type}`;
  const cached = healthCache.get(key);
  if (!cached) return { healthy: null, checkedAt: null }; // never checked
  return cached;
}

// ── Get all health statuses for a user ────────────────────────────────────
async function getAllHealthStatuses(userId) {
  const integrations = await Integration.find({ userId, enabled: true }).lean();
  const statuses = {};

  for (const intg of integrations) {
    const cached = getHealthStatus(userId, intg.type);
    // If checked in last 30 mins, use cache
    if (cached.checkedAt && Date.now() - cached.checkedAt < 30 * 60 * 1000) {
      statuses[intg.type] = cached;
    } else {
      // Re-check
      const result = await checkIntegration(intg).catch(() => ({
        healthy: false,
        error: "Check failed",
      }));
      healthCache.set(`${userId}:${intg.type}`, {
        ...result,
        checkedAt: Date.now(),
      });
      statuses[intg.type] = result;
    }
  }

  return statuses;
}

module.exports = {
  checkUserIntegrations,
  getHealthStatus,
  getAllHealthStatuses,
  refreshGoogleToken,
};
