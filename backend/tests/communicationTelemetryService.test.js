"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: { resolveConversationContext, normalizeString, safeJsonMeta },
} = require("../services/communicationTelemetryService");

test("resolveConversationContext extracts source and conversation from canonical itemId", () => {
  const ctx = resolveConversationContext({
    itemId: "comm:gmail:thread-99",
  });
  assert.deepEqual(ctx, {
    itemId: "comm:gmail:thread-99",
    sourceApp: "gmail",
    conversationId: "thread-99",
  });
});

test("resolveConversationContext prefers explicit sourceApp/conversationId when provided", () => {
  const ctx = resolveConversationContext({
    itemId: "comm:slack:C123",
    sourceApp: "Slack",
    conversationId: "C123",
  });
  assert.equal(ctx.sourceApp, "slack");
  assert.equal(ctx.conversationId, "C123");
  assert.equal(ctx.itemId, "comm:slack:C123");
});

test("resolveConversationContext synthesizes a canonical itemId from sourceApp + conversationId", () => {
  const ctx = resolveConversationContext({
    sourceApp: "telegram",
    conversationId: "dialog-1",
  });
  assert.equal(ctx.itemId, "comm:telegram:dialog-1");
});

test("normalizeString trims and clamps", () => {
  assert.equal(normalizeString("  hello  "), "hello");
  assert.equal(normalizeString(null), "");
  assert.equal(normalizeString("a".repeat(500), 5), "aaaaa");
});

test("safeJsonMeta drops circular structures without throwing", () => {
  const obj = { foo: "bar" };
  obj.self = obj;
  assert.deepEqual(safeJsonMeta(obj), {});
});
