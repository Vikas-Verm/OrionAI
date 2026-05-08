"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CONVERSATION_STATES,
  ACTION_STATES,
  classifyConversation,
  selectStatesForSurface,
  summarizeActionStates,
  buildSurfaceEligibility,
} = require("../services/communicationActionClassifier");
const {
  buildCanonicalConversationKey,
  getQuickActionsForState,
} = require("../services/conversationActionStateMachine");

const SOURCE_FIXTURES = [
  {
    sourceType: "gmail",
    conversationId: "thread-9001",
    conversationTitle: "Q3 plan review",
    participantLabel: "Pat Lee",
    sourceMetadata: { isDirect: true, directRecipient: true, isGroup: false },
    platformMetadata: {},
    openContext: { threadId: "thread-9001" },
    threadId: "thread-9001",
    inboundText:
      "Could you please review the attached plan and confirm by EOD?",
  },
  {
    sourceType: "slack",
    conversationId: "D-12345",
    conversationTitle: "Pat Lee",
    participantLabel: "Pat Lee",
    sourceMetadata: {
      isDirect: true,
      isGroup: false,
      participantLabel: "Pat Lee",
      recentMentionOfCurrentUser: true,
    },
    platformMetadata: { channelType: "dm", unreadCount: 1 },
    openContext: { channelId: "D-12345", threadTs: null },
    threadId: null,
    inboundText: "Can you confirm the rollout date today?",
  },
  {
    sourceType: "telegram",
    conversationId: "1362890878",
    conversationTitle: "Pat Lee",
    participantLabel: "Pat Lee",
    sourceMetadata: {
      isDirect: true,
      participantLabel: "Pat Lee",
    },
    platformMetadata: { unreadCount: 1 },
    openContext: { dialogId: "1362890878" },
    threadId: null,
    inboundText: "Urgently need your help pls reply me",
  },
  {
    sourceType: "signal",
    conversationId: "!room:signal.bridge",
    conversationTitle: "Pat Lee",
    participantLabel: "Pat Lee",
    sourceMetadata: {
      isDirect: true,
      participantLabel: "Pat Lee",
    },
    platformMetadata: { unreadCount: 1 },
    openContext: { roomId: "!room:signal.bridge" },
    threadId: null,
    inboundText: "Please share the report when you can",
  },
  {
    sourceType: "whatsapp",
    conversationId: "55512345@c.us",
    conversationTitle: "Pat Lee",
    participantLabel: "Pat Lee",
    sourceMetadata: {
      isDirect: true,
      participantLabel: "Pat Lee",
    },
    platformMetadata: { unreadCount: 1 },
    openContext: { chatId: "55512345@c.us" },
    threadId: null,
    inboundText: "Need your help please reply today",
  },
];

function buildWaitingOnYou(fixture) {
  return {
    sourceType: fixture.sourceType,
    conversationId: fixture.conversationId,
    conversationTitle: fixture.conversationTitle,
    participantLabel: fixture.participantLabel,
    sourceMetadata: fixture.sourceMetadata,
    platformMetadata: fixture.platformMetadata,
    openContext: fixture.openContext,
    threadId: fixture.threadId,
    messages: [
      {
        id: "m1",
        direction: "inbound",
        senderType: "human",
        timestamp: Date.now() - 30 * 60 * 1000,
        text: fixture.inboundText,
        addressedToCurrentUser: true,
      },
    ],
  };
}

for (const fixture of SOURCE_FIXTURES) {
  test(`${fixture.sourceType}: same conversation has identical state, reason, id, and threadId across all three surfaces`, () => {
    const state = classifyConversation(buildWaitingOnYou(fixture));

    assert.equal(
      state.actionState,
      ACTION_STATES.WAITING_ON_YOUR_REPLY,
      `${fixture.sourceType} fixture should classify as waiting_on_you`
    );
    assert.equal(state.state, CONVERSATION_STATES.WAITING_ON_YOU);
    assert.equal(
      state.id,
      buildCanonicalConversationKey(fixture.sourceType, fixture.conversationId)
    );

    const insights = selectStatesForSurface([state], "insights");
    const briefing = selectStatesForSurface([state], "briefing");
    const priorityFeed = selectStatesForSurface([state], "priorityFeed");

    assert.equal(insights.length, 1, "insights surface should include the item");
    assert.equal(briefing.length, 1, "briefing surface should include the item");
    assert.equal(
      priorityFeed.length,
      1,
      "priority feed surface should include the item"
    );

    for (const surface of [insights[0], briefing[0], priorityFeed[0]]) {
      assert.equal(surface.id, state.id, `${fixture.sourceType} id drift`);
      assert.equal(
        surface.actionState,
        state.actionState,
        `${fixture.sourceType} actionState drift`
      );
      assert.equal(
        surface.state,
        state.state,
        `${fixture.sourceType} state drift`
      );
      assert.equal(
        surface.actionReason,
        state.actionReason,
        `${fixture.sourceType} reason drift`
      );
      assert.equal(
        surface.threadId,
        state.threadId,
        `${fixture.sourceType} threadId drift`
      );
      assert.deepEqual(
        surface.openContext,
        state.openContext,
        `${fixture.sourceType} openContext drift`
      );
    }
  });

  test(`${fixture.sourceType}: surface eligibility flags match the deterministic table`, () => {
    const state = classifyConversation(buildWaitingOnYou(fixture));
    assert.deepEqual(
      buildSurfaceEligibility(state.state),
      {
        insights: true,
        briefing: true,
        priorityFeed: true,
      },
      `${fixture.sourceType} eligibility`
    );
    assert.equal(state.eligibleForInsights, true);
    assert.equal(state.eligibleForBriefing, true);
    assert.equal(state.eligibleForPriorityFeed, true);
  });

  test(`${fixture.sourceType}: openContext carries a deep-link identifier the module can use`, () => {
    const state = classifyConversation(buildWaitingOnYou(fixture));
    const ctx = state.openContext || {};
    const identifiers = [
      ctx.threadId,
      ctx.channelId,
      ctx.dialogId,
      ctx.roomId,
      ctx.chatId,
    ].filter(Boolean);
    assert.ok(
      identifiers.length > 0,
      `${fixture.sourceType} openContext should carry at least one deep-link id, got ${JSON.stringify(ctx)}`
    );
  });

  test(`${fixture.sourceType}: quick-actions are the canonical four for an actionable state`, () => {
    const state = classifyConversation(buildWaitingOnYou(fixture));
    const verbs = getQuickActionsForState(state.state)
      .map((entry) => entry.action)
      .sort();
    assert.deepEqual(verbs, ["dismissed", "handled", "reclassified", "snoozed"]);
  });
}

test("counts produced by summarizeActionStates agree across all five sources at once", () => {
  const states = SOURCE_FIXTURES.map((fixture) =>
    classifyConversation(buildWaitingOnYou(fixture))
  );

  const summary = summarizeActionStates(states);

  // Every fixture is waiting_on_you, so every count slot should match.
  assert.equal(summary.replyRequiredCount, SOURCE_FIXTURES.length);
  assert.equal(summary.approvalCount, 0);
  assert.equal(summary.followUpCount, 0);
  assert.equal(summary.waitingOnOthersCount, 0);
  assert.equal(summary.surfaceCounts.insights, SOURCE_FIXTURES.length);
  assert.equal(summary.surfaceCounts.briefing, SOURCE_FIXTURES.length);
  assert.equal(summary.surfaceCounts.priorityFeed, SOURCE_FIXTURES.length);
});

test("a shared-logic fix in Gmail does not change Slack/Telegram/Signal/WhatsApp semantics", () => {
  // Sanity: classify the same payload across all five sources and confirm
  // the engine returns identical state and reason — a regression here would
  // mean source-specific drift snuck back in.
  const reasons = SOURCE_FIXTURES.map((fixture) => {
    const state = classifyConversation(buildWaitingOnYou(fixture));
    return {
      source: fixture.sourceType,
      state: state.state,
      actionState: state.actionState,
      reasonShape: state.actionReason.replace(/[a-zA-Z']+/g, "X"),
    };
  });

  const head = reasons[0];
  for (const row of reasons) {
    assert.equal(row.state, head.state, `${row.source} state drift`);
    assert.equal(
      row.actionState,
      head.actionState,
      `${row.source} actionState drift`
    );
  }
});
