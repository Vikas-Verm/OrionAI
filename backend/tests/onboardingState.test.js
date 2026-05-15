"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  summarizeOnboardingState,
} = require("../services/onboardingState");

test("new user with no connected apps is routed to connect apps", () => {
  const result = summarizeOnboardingState({
    user: {
      _id: "user-1",
      username: "newuser",
      email: "new@example.com",
      fullName: "New User",
    },
    integrations: [],
  });

  assert.equal(result.connectedCount, 0);
  assert.equal(result.nextStep, "connect_apps");
  assert.equal(result.redirectTo, "/onboarding/connect-apps");
  assert.equal(result.onboarding.hasCompletedAppConnection, false);
  assert.equal(result.onboarding.hasCompletedFirstSync, false);
});

test("connected apps without first sync are routed to syncing", () => {
  const result = summarizeOnboardingState({
    user: {
      _id: "user-2",
      username: "connecteduser",
      email: "connected@example.com",
      onboarding: {
        hasCompletedAppConnection: true,
      },
    },
    integrations: [
      {
        type: "gmail",
        enabled: true,
        gmail: { refreshToken: "refresh-token" },
      },
    ],
  });

  assert.equal(result.connectedCount, 1);
  assert.equal(result.nextStep, "syncing");
  assert.equal(result.redirectTo, "/onboarding/syncing");
});

test("skip for now without connected apps lands in workspace briefing", () => {
  const result = summarizeOnboardingState({
    user: {
      _id: "user-3",
      username: "skipuser",
      email: "skip@example.com",
      onboarding: {
        hasCompletedAppConnection: true,
      },
    },
    integrations: [],
  });

  assert.equal(result.connectedCount, 0);
  assert.equal(result.nextStep, "workspace_briefing");
  assert.equal(result.redirectTo, "/workspace-briefing");
});

test("legacy users with connected apps are treated as completed", () => {
  const result = summarizeOnboardingState({
    user: {
      _id: "user-4",
      username: "legacyuser",
      email: "legacy@example.com",
    },
    integrations: [
      {
        type: "slack",
        enabled: true,
        slack: { userToken: "xoxp-token" },
      },
    ],
  });

  assert.equal(result.connectedCount, 1);
  assert.equal(result.nextStep, "workspace_briefing");
  assert.equal(result.onboarding.hasCompletedAppConnection, true);
  assert.equal(result.onboarding.hasCompletedFirstSync, true);
  assert.equal(result.onboarding.hasSeenFirstBriefing, true);
});
