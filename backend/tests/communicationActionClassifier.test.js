"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ACTION_STATES,
  classifyConversation,
  summarizeActionStates,
} = require("../services/communicationActionClassifier");

function buildConversation(overrides = {}) {
  return {
    sourceType: "slack",
    conversationId: "conv-1",
    conversationTitle: "Product review",
    participantLabel: "Alex",
    previewText: "",
    sourceMetadata: {
      isDirect: true,
      participantLabel: "Alex",
    },
    platformMetadata: {},
    openContext: { channelId: "C123" },
    messages: [],
    ...overrides,
  };
}

function msg({
  id,
  minutesAgo,
  text,
  direction,
  senderType = "human",
  addressedToCurrentUser = false,
  mentionedCurrentUser = false,
}) {
  return {
    id,
    timestamp: Date.now() - minutesAgo * 60 * 1000,
    text,
    direction,
    senderType,
    addressedToCurrentUser,
    mentionedCurrentUser,
  };
}

test("classifies direct inbound question as waiting on your reply", () => {
  const state = classifyConversation(
    buildConversation({
      messages: [
        msg({ id: "1", minutesAgo: 90, text: "Can you send the latest update?", direction: "inbound", addressedToCurrentUser: true }),
      ],
    })
  );

  assert.equal(state.actionState, ACTION_STATES.WAITING_ON_YOUR_REPLY);
  assert.match(state.actionReason, /waiting on your response|direct ask|you have not replied/i);
});

test("classifies approval ask as needs approval", () => {
  const state = classifyConversation(
    buildConversation({
      sourceType: "gmail",
      messages: [
        msg({ id: "1", minutesAgo: 45, text: "Please approve the leave request today.", direction: "inbound", addressedToCurrentUser: true }),
      ],
    })
  );

  assert.equal(state.actionState, ACTION_STATES.NEEDS_APPROVAL);
  assert.equal(state.hasApprovalIntent, true);
});

test("classifies leave request email as needs approval", () => {
  const state = classifyConversation(
    buildConversation({
      sourceType: "gmail",
      sourceMetadata: {
        isDirect: true,
        directRecipient: true,
        explicitlyDirectedToCurrentUser: true,
        participantLabel: "Vikas",
      },
      messages: [
        msg({
          id: "1",
          minutesAgo: 20,
          text: "Leave apply. I am writing this email pls grant my leave for tomorrow.",
          direction: "inbound",
          addressedToCurrentUser: true,
        }),
      ],
    })
  );

  assert.equal(state.actionState, ACTION_STATES.NEEDS_APPROVAL);
  assert.match(state.actionReason, /approval/i);
});

test("classifies direct automated approval ask as needs approval", () => {
  const state = classifyConversation(
    buildConversation({
      sourceType: "gmail",
      sourceMetadata: {
        isDirect: true,
        directRecipient: true,
        participantLabel: "Finance approvals",
      },
      messages: [
        msg({
          id: "1",
          minutesAgo: 15,
          text: "Urgently approve this invoice pls before EOD.",
          direction: "inbound",
          senderType: "system",
          addressedToCurrentUser: true,
        }),
      ],
    })
  );

  assert.equal(state.actionState, ACTION_STATES.NEEDS_APPROVAL);
  assert.match(state.actionReason, /approval/i);
});

test("classifies stale promise as needs follow-up", () => {
  const state = classifyConversation(
    buildConversation({
      messages: [
        msg({ id: "1", minutesAgo: 3000, text: "Can you share the pricing sheet?", direction: "inbound", addressedToCurrentUser: true }),
        msg({ id: "2", minutesAgo: 2900, text: "I'll send it tomorrow morning.", direction: "outbound" }),
      ],
    })
  );

  assert.equal(state.actionState, ACTION_STATES.NEEDS_FOLLOW_UP);
  assert.match(state.actionReason, /committed|follow-up/i);
});

test("classifies direct follow-up thread as needs follow-up after reply window", () => {
  const state = classifyConversation(
    buildConversation({
      sourceType: "telegram",
      messages: [
        msg({
          id: "1",
          minutesAgo: 60 * 36,
          text: "Following up on this. Any progress from your side?",
          direction: "inbound",
          addressedToCurrentUser: true,
        }),
      ],
    })
  );

  assert.equal(state.actionState, ACTION_STATES.NEEDS_FOLLOW_UP);
});

test("classifies replied thread as waiting on others", () => {
  const state = classifyConversation(
    buildConversation({
      messages: [
        msg({ id: "1", minutesAgo: 80, text: "Any update from your side?", direction: "inbound", addressedToCurrentUser: true }),
        msg({ id: "2", minutesAgo: 40, text: "Yes, I sent the draft a few minutes ago.", direction: "outbound" }),
      ],
    })
  );

  assert.equal(state.actionState, ACTION_STATES.WAITING_ON_OTHERS);
});

test("latest inbound ownership reply clears stale approval state for the original requester", () => {
  const state = classifyConversation(
    buildConversation({
      sourceType: "gmail",
      sourceMetadata: {
        isDirect: true,
        directRecipient: true,
        explicitlyDirectedToCurrentUser: true,
        participantLabel: "Vikash",
      },
      messages: [
        msg({
          id: "1",
          minutesAgo: 90,
          text: "Hii Sir, Pls Approve payment for this Invoice INV-45656",
          direction: "outbound",
        }),
        msg({
          id: "2",
          minutesAgo: 15,
          text: "Hi Vikas, Thanks for sharing the invoice. I'll review INV-45656 and process the payment approval as soon as possible. If there are any issues or additional details needed, I'll let you know.",
          direction: "inbound",
          addressedToCurrentUser: true,
        }),
      ],
    })
  );

  assert.equal(state.actionState, ACTION_STATES.WAITING_ON_OTHERS);
  assert.match(state.actionReason, /takes ownership|waiting on someone else|next step/i);
});

test("classifies newsletter-like traffic as no action needed", () => {
  const state = classifyConversation(
    buildConversation({
      sourceType: "gmail",
      sourceMetadata: {
        isDirect: true,
        excludedReason: "This looks like newsletter or marketing traffic and does not require action.",
      },
      messages: [
        msg({ id: "1", minutesAgo: 20, text: "Weekly summary: top updates from OrionAI", direction: "inbound", senderType: "system" }),
      ],
    })
  );

  assert.equal(state.actionState, ACTION_STATES.NO_ACTION_NEEDED);
});

test("new inbound after reply reactivates the conversation", () => {
  const state = classifyConversation(
    buildConversation({
      messages: [
        msg({ id: "1", minutesAgo: 180, text: "Can you confirm the release date?", direction: "inbound", addressedToCurrentUser: true }),
        msg({ id: "2", minutesAgo: 150, text: "Yes, targeting Friday.", direction: "outbound" }),
        msg({ id: "3", minutesAgo: 20, text: "Thanks. Can you also send the rollout note?", direction: "inbound", addressedToCurrentUser: true }),
      ],
    })
  );

  assert.equal(state.actionState, ACTION_STATES.WAITING_ON_YOUR_REPLY);
});

test("classifies imperative direct ask as waiting on your reply", () => {
  const state = classifyConversation(
    buildConversation({
      sourceType: "whatsapp",
      messages: [
        msg({
          id: "1",
          minutesAgo: 35,
          text: "Please share the updated deck with me today.",
          direction: "inbound",
          addressedToCurrentUser: true,
        }),
      ],
    })
  );

  assert.equal(state.actionState, ACTION_STATES.WAITING_ON_YOUR_REPLY);
});

test("avoids surfacing noisy group messages when responsibility is unclear", () => {
  const state = classifyConversation(
    buildConversation({
      sourceMetadata: {
        isDirect: false,
        isGroup: true,
        participantLabel: "#team-launch",
      },
      messages: [
        msg({ id: "1", minutesAgo: 25, text: "Can someone pick this up?", direction: "inbound" }),
      ],
    })
  );

  assert.equal(state.actionState, ACTION_STATES.NO_ACTION_NEEDED);
});

test("ignores login code and otp noise", () => {
  const state = classifyConversation(
    buildConversation({
      sourceType: "telegram",
      sourceMetadata: {
        isDirect: true,
        participantLabel: "Telegram",
      },
      messages: [
        msg({
          id: "1",
          minutesAgo: 3,
          text: "Your login code is 482931. Do not share this OTP with anyone.",
          direction: "inbound",
          senderType: "system",
          addressedToCurrentUser: true,
        }),
      ],
    })
  );

  assert.equal(state.actionState, ACTION_STATES.NO_ACTION_NEEDED);
  assert.match(state.actionReason, /login|verification/i);
});

test("ignores slack bot noise without required action", () => {
  const state = classifyConversation(
    buildConversation({
      sourceType: "slack",
      sourceMetadata: {
        isDirect: true,
        participantLabel: "Slackbot",
      },
      messages: [
        msg({
          id: "1",
          minutesAgo: 8,
          text: "Build alert: CI failed on main.",
          direction: "inbound",
          senderType: "bot",
          addressedToCurrentUser: true,
        }),
      ],
    })
  );

  assert.equal(state.actionState, ACTION_STATES.NO_ACTION_NEEDED);
});

test("summarizes action-state counts for briefing usage", () => {
  const summary = summarizeActionStates([
    { actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY },
    { actionState: ACTION_STATES.NEEDS_APPROVAL },
    { actionState: ACTION_STATES.NEEDS_FOLLOW_UP },
    { actionState: ACTION_STATES.WAITING_ON_OTHERS },
  ]);

  assert.equal(summary.actionableCount, 3);
  assert.equal(summary.replyRequiredCount, 1);
  assert.equal(summary.approvalCount, 1);
  assert.equal(summary.followUpCount, 1);
  assert.equal(summary.waitingOnOthersCount, 1);
});
