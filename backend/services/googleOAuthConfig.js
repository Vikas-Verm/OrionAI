"use strict";

function getOAuthConfig(type, data = {}) {
  if (type === "google_docs") {
    return {
      clientId:
        process.env.GOOGLE_DOCS_CLIENT_ID ||
        data.clientId ||
        process.env.GOOGLE_CLIENT_ID ||
        process.env.GMAIL_CLIENT_ID ||
        null,
      clientSecret:
        process.env.GOOGLE_DOCS_CLIENT_SECRET ||
        data.clientSecret ||
        process.env.GOOGLE_CLIENT_SECRET ||
        process.env.GMAIL_CLIENT_SECRET ||
        null,
      redirectUri:
        process.env.GOOGLE_DOCS_REDIRECT_URI ||
        process.env.GOOGLE_REDIRECT_URI ||
        process.env.GMAIL_REDIRECT_URI ||
        `${
          process.env.BACKEND_URL || "http://localhost:3000"
        }/api/integrations/google-docs/oauth/callback`,
    };
  }

  if (type === "google_sheets") {
    return {
      clientId:
        process.env.GOOGLE_SHEETS_CLIENT_ID ||
        data.clientId ||
        process.env.GOOGLE_CLIENT_ID ||
        process.env.GMAIL_CLIENT_ID ||
        null,
      clientSecret:
        process.env.GOOGLE_SHEETS_CLIENT_SECRET ||
        data.clientSecret ||
        process.env.GOOGLE_CLIENT_SECRET ||
        process.env.GMAIL_CLIENT_SECRET ||
        null,
      redirectUri:
        process.env.GOOGLE_SHEETS_REDIRECT_URI ||
        process.env.GOOGLE_REDIRECT_URI ||
        process.env.GMAIL_REDIRECT_URI ||
        `${
          process.env.BACKEND_URL || "http://localhost:3000"
        }/api/integrations/google-sheets/oauth/callback`,
    };
  }

  if (type === "google_calendar") {
    return {
      clientId:
        process.env.GCAL_CLIENT_ID ||
        data.clientId ||
        process.env.GOOGLE_CLIENT_ID ||
        process.env.GMAIL_CLIENT_ID ||
        null,
      clientSecret:
        process.env.GCAL_CLIENT_SECRET ||
        data.clientSecret ||
        process.env.GOOGLE_CLIENT_SECRET ||
        process.env.GMAIL_CLIENT_SECRET ||
        null,
      redirectUri:
        process.env.GCAL_REDIRECT_URI ||
        process.env.GOOGLE_REDIRECT_URI ||
        process.env.GMAIL_REDIRECT_URI ||
        `${
          process.env.BACKEND_URL || "http://localhost:3000"
        }/api/integrations/google-calendar/oauth/callback`,
    };
  }

  return {
    clientId:
      data.clientId ||
      process.env.GOOGLE_CLIENT_ID ||
      process.env.GMAIL_CLIENT_ID ||
      null,
    clientSecret:
      data.clientSecret ||
      process.env.GOOGLE_CLIENT_SECRET ||
      process.env.GMAIL_CLIENT_SECRET ||
      null,
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      process.env.GMAIL_REDIRECT_URI ||
      `${
        process.env.BACKEND_URL || "http://localhost:3000"
      }/api/integrations/gmail/oauth/callback`,
  };
}

module.exports = { getOAuthConfig };
