"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CONVERSATION_STATES,
  ACTION_STATES,
  classifyConversationWithSemantics,
} = require("../services/conversationStateEngine");

function buildConversation(overrides = {}) {
  return {
    sourceType: "slack",
    conversationId: "semantic-1",
    conversationTitle: "Launch review",
    participantLabel: "Alex",
    sourceMetadata: {
      isDirect: true,
      participantLabel: "Alex",
    },
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
}) {
  return {
    id,
    timestamp: Date.now() - minutesAgo * 60 * 1000,
    text,
    direction,
    senderType,
    addressedToCurrentUser,
  };
}

test("shared semantic interpreter can resolve an otherwise ambiguous reply without surface-specific logic", async () => {
  const state = await classifyConversationWithSemantics(
    buildConversation({
      messages: [
        msg({
          id: "1",
          minutesAgo: 20,
          text: "Can you approve this rollout?",
          direction: "outbound",
        }),
        msg({
          id: "2",
          minutesAgo: 2,
          text: "Yep.",
          direction: "inbound",
          addressedToCurrentUser: true,
        }),
      ],
    }),
    {
      semanticInterpreter: async (message) => {
        if (message.id === "2") {
          return {
            semanticRole: "approval",
            isApprovalDecision: true,
            isResolved: true,
            confidence: 0.93,
          };
        }
        return null;
      },
      includeDebug: true,
    }
  );

  assert.equal(state.state, CONVERSATION_STATES.RESOLVED);
  assert.equal(state.actionState, ACTION_STATES.RESOLVED);
  assert.equal(state.currentActor, "nobody");
  assert.equal(state.debug.semanticSource, "llm");
});
