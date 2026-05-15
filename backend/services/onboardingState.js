"use strict";

const Integration = require("../models/Integration");
const User = require("../models/user");
const { sanitizeUser } = require("../utils/auth");
const {
  normalizeOnboarding,
  toPlainObject,
} = require("../utils/onboarding");
const { isConnectedIntegration } = require("./integrationConnectionState");

const ONBOARDING_ROUTE_BY_STEP = Object.freeze({
  connect_apps: "/onboarding/connect-apps",
  syncing: "/onboarding/syncing",
  workspace_briefing: "/workspace-briefing",
});

const APP_LABELS = Object.freeze({
  gmail: "Gmail",
  slack: "Slack",
  telegram: "Telegram",
  signal: "Signal",
  whatsapp: "WhatsApp",
  jira: "Jira",
  google_calendar: "Google Calendar",
  google_docs: "Google Docs",
  google_sheets: "Google Sheets",
  database: "Database",
  razorpay: "Razorpay",
  notion: "Notion",
  webhook: "Webhook",
});

function hasLegacyOnboardingRecord(user = {}) {
  const raw = toPlainObject(user.onboarding);
  return Object.keys(raw).length === 0;
}

function summarizeConnectedApps(integrations = []) {
  return integrations
    .filter((integration) => integration?.enabled !== false)
    .filter((integration) => isConnectedIntegration(integration))
    .map((integration) => ({
      type: integration.type,
      label: APP_LABELS[integration.type] || integration.type,
    }));
}

function deriveOnboardingNextStep(onboarding, connectedCount) {
  if (!onboarding.hasCompletedAppConnection && connectedCount === 0) {
    return "connect_apps";
  }

  if (connectedCount > 0 && !onboarding.hasCompletedFirstSync) {
    return "syncing";
  }

  return "workspace_briefing";
}

function summarizeOnboardingState({ user, integrations = [] }) {
  let onboarding = normalizeOnboarding(user?.onboarding);
  const connectedApps = summarizeConnectedApps(integrations);

  if (hasLegacyOnboardingRecord(user) && connectedApps.length > 0) {
    onboarding = {
      ...onboarding,
      hasCompletedAppConnection: true,
      hasCompletedFirstSync: true,
      hasSeenFirstBriefing: true,
    };
  }

  if (onboarding.focusAreas.length > 0 && !onboarding.hasSelectedFocusAreas) {
    onboarding = {
      ...onboarding,
      hasSelectedFocusAreas: true,
      skippedFocusAreas: false,
    };
  }

  const nextStep = deriveOnboardingNextStep(onboarding, connectedApps.length);

  return {
    user: sanitizeUser({
      ...(toPlainObject(user) || {}),
      onboarding,
    }),
    onboarding,
    connectedApps,
    connectedCount: connectedApps.length,
    nextStep,
    redirectTo: ONBOARDING_ROUTE_BY_STEP[nextStep],
  };
}

async function buildOnboardingStatusForUser(user, options = {}) {
  const integrations =
    options.integrations || (await Integration.find({ userId: user.username }).lean());
  const status = summarizeOnboardingState({ user, integrations });
  const current = normalizeOnboarding(user?.onboarding);
  const changed =
    JSON.stringify(current) !== JSON.stringify(status.onboarding);

  if (changed && options.persist !== false && user?._id) {
    await User.findByIdAndUpdate(user._id, {
      $set: { onboarding: status.onboarding },
    });
  }

  return status;
}

module.exports = {
  ONBOARDING_ROUTE_BY_STEP,
  deriveOnboardingNextStep,
  summarizeConnectedApps,
  summarizeOnboardingState,
  buildOnboardingStatusForUser,
};
