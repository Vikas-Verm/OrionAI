"use strict";

function hasGoogleConnection(data = {}) {
  return Boolean(data?.refreshToken || data?.accessToken || data?.userEmail);
}

function isConnectedIntegration(integration = {}) {
  const type = integration?.type;
  if (!type) return false;

  if (type === "gmail") {
    return hasGoogleConnection(integration.gmail);
  }

  if (type === "google_calendar") {
    return hasGoogleConnection(integration.googleCalendar);
  }

  if (type === "slack") {
    return Boolean(integration.slack?.userToken || integration.slack?.webhookUrl);
  }

  if (type === "telegram") {
    return Boolean(integration.telegram?.sessionString);
  }

  if (type === "whatsapp") {
    return Boolean(integration.whatsapp?.connected);
  }

  if (type === "jira") {
    return Boolean(
      integration.jira?.domain && integration.jira?.email && integration.jira?.apiToken
    );
  }

  if (type === "database") {
    return Boolean(integration.database?.connectionString || integration.database?.filePath);
  }

  if (type === "notion") {
    return Boolean(integration.notion?.apiToken);
  }

  if (type === "razorpay") {
    return Boolean(integration.razorpay?.keyId && integration.razorpay?.keySecret);
  }

  if (type === "webhook") {
    return Boolean(integration.webhook?.url);
  }

  return integration.enabled !== false;
}

module.exports = {
  isConnectedIntegration,
};
