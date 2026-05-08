"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ACTION_STATES,
  __test: { isHighSignalState },
} = require("../services/communicationActionService");
const {
  __test: { buildGmailThreadHaystack },
} = require("../services/communicationActionService");

function gmailMessage({ subject = "Hi", from = "yara@volopayly.com <yara@volopayly.com>", body = "" } = {}) {
  // Mimic the Gmail API payload shape: a top-level message with payload.headers
  // and a single text/plain part carrying the base64-encoded body.
  const bodyB64 = Buffer.from(body, "utf-8").toString("base64");
  return {
    id: "m1",
    snippet: "Hey Vikas, Noticed the growing demand for your offerings",
    payload: {
      headers: [
        { name: "Subject", value: subject },
        { name: "From", value: from },
        { name: "To", value: "vikas@example.com" },
      ],
      mimeType: "text/plain",
      body: { data: bodyB64 },
    },
  };
}

test("Gmail haystack now includes the message body so 'Unsubscribe from future emails' is detected", () => {
  const thread = {
    id: "t-1",
    snippet: "Hey Vikas, Noticed the growing demand for your offerings in India and the operational momentum",
    messages: [
      gmailMessage({
        body: [
          "Hey Vikas,",
          "",
          "Noticed the growing demand for your offerings in India and the operational momentum you're building there.",
          "",
          "As you scale regional resources, managing localized spend often becomes a headache.",
          "",
          "Worth a quick look at how this could simplify your India ops?",
          "",
          "Unsubscribe from future emails",
        ].join("\n"),
      }),
    ],
  };

  const haystack = buildGmailThreadHaystack(thread);
  assert.match(
    haystack,
    /unsubscribe/,
    "haystack must include 'unsubscribe' from the message body, not just the snippet"
  );
});

test("Gmail haystack still gracefully handles threads with empty messages", () => {
  const haystack = buildGmailThreadHaystack({ id: "empty", snippet: "", messages: [] });
  assert.equal(typeof haystack, "string");
});

test("isHighSignalState fires for a recent direct DM with urgency keywords", () => {
  const state = {
    actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY,
    confidenceBand: "high",
    sourceMetadata: { isDirect: true },
    hasDirectQuestion: false,
    hasApprovalIntent: false,
    hasMentionOfCurrentUser: false,
    latestInboundTimestamp: Date.now() - 5 * 60 * 1000,
    latestMessageTimestamp: Date.now() - 5 * 60 * 1000,
    debug: { intentSignals: ["urgency", "request"] },
  };
  assert.equal(isHighSignalState(state), true);
});

test("isHighSignalState fires for a high-confidence direct ask", () => {
  const state = {
    actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY,
    confidenceBand: "high",
    sourceMetadata: { isDirect: true },
    hasDirectQuestion: true,
    hasMentionOfCurrentUser: false,
    latestInboundTimestamp: Date.now() - 30 * 60 * 1000,
    latestMessageTimestamp: Date.now() - 30 * 60 * 1000,
    debug: { intentSignals: ["request", "question"] },
  };
  assert.equal(isHighSignalState(state), true);
});

test("isHighSignalState fires when the current user is @-mentioned", () => {
  const state = {
    actionState: ACTION_STATES.NEEDS_APPROVAL,
    confidenceBand: "medium",
    sourceMetadata: { isDirect: false },
    hasMentionOfCurrentUser: true,
    latestInboundTimestamp: Date.now() - 10 * 60 * 1000,
    debug: { intentSignals: ["approval"] },
  };
  assert.equal(isHighSignalState(state), true);
});

test("isHighSignalState does NOT fire for stale messages (older than 60 minutes)", () => {
  const state = {
    actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY,
    confidenceBand: "high",
    sourceMetadata: { isDirect: true },
    hasMentionOfCurrentUser: true,
    latestInboundTimestamp: Date.now() - 90 * 60 * 1000,
    debug: { intentSignals: ["urgency"] },
  };
  assert.equal(isHighSignalState(state), false);
});

test("isHighSignalState does NOT fire for non-actionable states", () => {
  const state = {
    actionState: ACTION_STATES.RESOLVED,
    confidenceBand: "high",
    sourceMetadata: { isDirect: true },
    hasMentionOfCurrentUser: true,
    latestInboundTimestamp: Date.now() - 5 * 60 * 1000,
    debug: { intentSignals: ["urgency"] },
  };
  assert.equal(isHighSignalState(state), false);
});

test("isHighSignalState does NOT fire for ambient group chatter without urgency or mention", () => {
  const state = {
    actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY,
    confidenceBand: "low",
    sourceMetadata: { isDirect: false },
    hasMentionOfCurrentUser: false,
    hasDirectQuestion: false,
    latestInboundTimestamp: Date.now() - 5 * 60 * 1000,
    debug: { intentSignals: [] },
  };
  assert.equal(isHighSignalState(state), false);
});

test("workspace decisions never downgrade a high-signal state to resolved or no_action_needed", async () => {
  const {
    __test: { applyWorkspaceDecisions },
  } = require("../services/communicationActionService");

  const highSignalState = {
    id: "comm:telegram:1362890878",
    sourceType: "telegram",
    state: "waiting_on_you",
    actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY,
    actionStateLabel: "Waiting on your reply",
    eligibleForInsights: true,
    eligibleForBriefing: true,
    eligibleForPriorityFeed: true,
    surfaceEligibility: { insights: true, briefing: true, priorityFeed: true },
    confidenceBand: "high",
    confidence: 0.86,
    actionReason: "This conversation is waiting on your reply.",
    sourceMetadata: { isDirect: true, unreadCount: 2 },
    platformMetadata: { unreadCount: 2 },
    hasMentionOfCurrentUser: false,
    hasDirectQuestion: true,
    hasApprovalIntent: false,
    latestInboundTimestamp: Date.now() - 5 * 60 * 1000,
    latestMessageTimestamp: Date.now() - 5 * 60 * 1000,
    debug: { intentSignals: ["urgency", "request"] },
    workspaceDecisionContext: {
      recentMessages: [
        {
          direction: "inbound",
          timestamp: Date.now() - 5 * 60 * 1000,
          text: "Pls join the meeting its urgent",
        },
      ],
      latestInboundText: "Pls join the meeting its urgent",
    },
    previewText: "Pls join the meeting its urgent",
    priority: "High",
    priorityScore: 80,
  };

  // Stub interpreter that would maliciously downgrade the urgent message.
  const stubInterpreter = async (candidates) =>
    candidates.map((c) => ({
      id: c.id,
      actionState: "resolved",
      priority: "Low",
      priorityScore: 10,
      reason: "LLM mistakenly thinks this is resolved",
      decisionSource: "workspace_llm",
    }));

  const result = await applyWorkspaceDecisions(
    [highSignalState],
    {
      enableWorkspaceLLM: true,
      workspaceInterpreter: stubInterpreter,
    }
  );

  // The high-signal item must keep its rules-based verdict.
  assert.equal(result.length, 1);
  assert.equal(result[0].actionState, ACTION_STATES.WAITING_ON_YOUR_REPLY);
  assert.equal(result[0].state, "waiting_on_you");
  assert.equal(result[0].eligibleForInsights, true);
  assert.equal(result[0].eligibleForPriorityFeed, true);
});
