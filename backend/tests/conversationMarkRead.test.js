"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  markConversationReadAtSource,
} = require("../services/conversationMarkRead");

test("markConversationReadAtSource refuses when userId is missing", async () => {
  const result = await markConversationReadAtSource({
    userId: "",
    sourceApp: "gmail",
    openContext: { threadId: "t-1" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_args");
});

test("markConversationReadAtSource refuses when sourceApp is missing", async () => {
  const result = await markConversationReadAtSource({
    userId: "u",
    sourceApp: "",
    openContext: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_args");
});

test("markConversationReadAtSource reports unsupported_app for unknown platforms", async () => {
  const result = await markConversationReadAtSource({
    userId: "u",
    sourceApp: "discord",
    openContext: {},
  });
  assert.equal(result.app, "discord");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unsupported_app");
});

test("markConversationReadAtSource normalizes sourceApp to lowercase", async () => {
  // No openContext → underlying call should still flow into the gmail
  // branch, even though it'll bail out with no_target.
  const result = await markConversationReadAtSource({
    userId: "u",
    sourceApp: "GMAIL",
    openContext: {},
  });
  assert.equal(result.app, "gmail");
});
