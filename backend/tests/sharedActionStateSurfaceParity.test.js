"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyConversation,
  selectStatesForSurface,
  summarizeActionStates,
  buildSurfaceEligibility,
} = require("../services/communicationActionClassifier");
const {
  buildCanonicalConversationKey,
} = require("../services/conversationActionStateMachine");

function buildWaitingOnYouConversation() {
  return {
    sourceType: "gmail",
    conversationId: "thread-abc",
    threadId: "thread-abc",
    conversationTitle: "Q3 plan review",
    participantLabel: "Pat Lee",
    sourceMetadata: { isDirect: true, directRecipient: true, isGroup: false },
    platformMetadata: {},
    openContext: { threadId: "thread-abc" },
    messages: [
      {
        id: "m1",
        direction: "inbound",
        senderType: "human",
        timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        text: "Could you please review the attached plan and confirm by EOD?",
      },
    ],
  };
}

function buildWaitingOnOthersConversation() {
  return {
    sourceType: "slack",
    conversationId: "C-123",
    conversationTitle: "#alpha-launch",
    participantLabel: "#alpha-launch",
    sourceMetadata: { isDirect: false, isGroup: true },
    platformMetadata: { unreadCount: 0 },
    openContext: { channelId: "C-123" },
    messages: [
      {
        id: "m1",
        direction: "inbound",
        senderType: "human",
        timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
        text: "Could you take a look when you have a sec?",
        addressedToCurrentUser: true,
      },
      {
        id: "m2",
        direction: "outbound",
        senderType: "human",
        timestamp: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
        text: "Sure — looking now and will follow up shortly.",
      },
    ],
  };
}

test("same conversation has identical state, reason, and id across all three surfaces", () => {
  const conversation = buildWaitingOnYouConversation();
  const state = classifyConversation(conversation);

  // The state object is one and the same — so insights, briefing, and
  // priorityFeed reads of it must agree.
  const insights = selectStatesForSurface([state], "insights");
  const briefing = selectStatesForSurface([state], "briefing");
  const priorityFeed = selectStatesForSurface([state], "priorityFeed");

  assert.equal(insights.length, 1);
  assert.equal(briefing.length, 1);
  assert.equal(priorityFeed.length, 1);

  for (const surface of [insights[0], briefing[0], priorityFeed[0]]) {
    assert.equal(surface.id, state.id);
    assert.equal(surface.actionState, state.actionState);
    assert.equal(surface.state, state.state);
    assert.equal(surface.actionReason, state.actionReason);
    assert.equal(surface.threadId, state.threadId);
    assert.equal(
      surface.id,
      buildCanonicalConversationKey(state.sourceType, state.conversationId)
    );
  }
});

test("waiting_on_others appears in briefing only — not in insights or priority feed", () => {
  const conversation = buildWaitingOnOthersConversation();
  const state = classifyConversation(conversation);

  // Confirm the rule fired the way we expect
  assert.equal(state.actionState, "waiting_on_others");

  const insights = selectStatesForSurface([state], "insights");
  const briefing = selectStatesForSurface([state], "briefing");
  const priorityFeed = selectStatesForSurface([state], "priorityFeed");

  assert.equal(insights.length, 0);
  assert.equal(briefing.length, 1);
  assert.equal(priorityFeed.length, 0);
});

test("buildSurfaceEligibility is the single source of truth — no surface drift", () => {
  // For every canonical conversation state, eligibility on all three surfaces
  // must be a deterministic function of the state alone.
  const states = [
    "waiting_on_you",
    "needs_approval",
    "needs_follow_up",
    "waiting_on_others",
    "resolved",
    "no_action_needed",
  ];

  const expected = {
    waiting_on_you: { insights: true, briefing: true, priorityFeed: true },
    needs_approval: { insights: true, briefing: true, priorityFeed: true },
    needs_follow_up: { insights: true, briefing: true, priorityFeed: true },
    waiting_on_others: { insights: false, briefing: true, priorityFeed: false },
    resolved: { insights: false, briefing: false, priorityFeed: false },
    no_action_needed: { insights: false, briefing: false, priorityFeed: false },
  };

  for (const stateName of states) {
    assert.deepEqual(
      buildSurfaceEligibility(stateName),
      expected[stateName],
      `eligibility drift for ${stateName}`
    );
  }
});

test("summarizeActionStates surface counts agree with the underlying selectors", () => {
  const fixtures = [
    classifyConversation(buildWaitingOnYouConversation()),
    classifyConversation(buildWaitingOnOthersConversation()),
  ];

  const summary = summarizeActionStates(fixtures);

  assert.equal(
    summary.surfaceCounts.insights,
    selectStatesForSurface(fixtures, "insights").length
  );
  assert.equal(
    summary.surfaceCounts.briefing,
    selectStatesForSurface(fixtures, "briefing").length
  );
  assert.equal(
    summary.surfaceCounts.priorityFeed,
    selectStatesForSurface(fixtures, "priorityFeed").length
  );
});
