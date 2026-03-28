"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

test("computeAgentConversationExpiry defaults to a 6 hour ttl", async (t) => {
  const previous = process.env.AGENT_CONVERSATION_TTL_HOURS;
  delete process.env.AGENT_CONVERSATION_TTL_HOURS;
  delete require.cache[require.resolve("../services/conversationRetention")];
  t.after(() => {
    if (previous === undefined) delete process.env.AGENT_CONVERSATION_TTL_HOURS;
    else process.env.AGENT_CONVERSATION_TTL_HOURS = previous;
    delete require.cache[require.resolve("../services/conversationRetention")];
  });

  const {
    computeAgentConversationExpiry,
  } = require("../services/conversationRetention");

  const base = new Date("2026-03-28T10:00:00.000Z");
  const expiry = computeAgentConversationExpiry(base);

  assert.equal(expiry.toISOString(), "2026-03-28T16:00:00.000Z");
});

test("computeAgentConversationExpiry respects AGENT_CONVERSATION_TTL_HOURS", async (t) => {
  const previous = process.env.AGENT_CONVERSATION_TTL_HOURS;
  process.env.AGENT_CONVERSATION_TTL_HOURS = "3";
  delete require.cache[require.resolve("../services/conversationRetention")];
  t.after(() => {
    if (previous === undefined) delete process.env.AGENT_CONVERSATION_TTL_HOURS;
    else process.env.AGENT_CONVERSATION_TTL_HOURS = previous;
    delete require.cache[require.resolve("../services/conversationRetention")];
  });

  const {
    computeAgentConversationExpiry,
  } = require("../services/conversationRetention");

  const base = new Date("2026-03-28T10:00:00.000Z");
  const expiry = computeAgentConversationExpiry(base);

  assert.equal(expiry.toISOString(), "2026-03-28T13:00:00.000Z");
});

test("buildActiveConversationQuery excludes expired agent conversations", () => {
  const { buildActiveConversationQuery } = require("../services/conversationRetention");
  const now = new Date("2026-03-28T10:00:00.000Z");
  const query = buildActiveConversationQuery({ sessionId: "abc", userId: "vikas" }, now);

  assert.deepEqual(query, {
    sessionId: "abc",
    userId: "vikas",
    isDeleted: false,
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
  });
});
