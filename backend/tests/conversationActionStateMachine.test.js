"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  QUICK_ACTIONS,
  applyQuickAction,
  normalizeQuickAction,
  buildCanonicalConversationKey,
  parseCanonicalConversationKey,
  getQuickActionsForState,
} = require("../services/conversationActionStateMachine");

test("normalizeQuickAction maps legacy aliases to canonical verbs", () => {
  assert.equal(normalizeQuickAction("approved"), QUICK_ACTIONS.HANDLED);
  assert.equal(normalizeQuickAction("edited_approved"), QUICK_ACTIONS.HANDLED);
  assert.equal(normalizeQuickAction(" Mark Done "), QUICK_ACTIONS.HANDLED);
  assert.equal(normalizeQuickAction("DISMISS"), QUICK_ACTIONS.DISMISSED);
  assert.equal(normalizeQuickAction("snooze"), QUICK_ACTIONS.SNOOZED);
  assert.equal(normalizeQuickAction("reclassify"), QUICK_ACTIONS.RECLASSIFIED);
  assert.equal(normalizeQuickAction("nope"), null);
});

test("applyQuickAction handled moves an actionable state to resolved", () => {
  const result = applyQuickAction({
    fromState: "waiting_on_you",
    action: "handled",
  });
  assert.equal(result.action, "handled");
  assert.equal(result.fromState, "waiting_on_you");
  assert.equal(result.toState, "resolved");
  assert.equal(result.toActionState, "resolved");
  assert.match(result.reason, /handled/i);
});

test("applyQuickAction dismissed moves to no_action_needed", () => {
  const result = applyQuickAction({
    fromActionState: "needs_approval",
    action: "dismiss",
  });
  assert.equal(result.action, "dismissed");
  assert.equal(result.toState, "no_action_needed");
});

test("applyQuickAction snoozed keeps the state and produces a snoozedUntil", () => {
  const result = applyQuickAction({
    fromState: "needs_follow_up",
    action: "snooze",
    snoozeMinutes: 60,
  });
  assert.equal(result.action, "snoozed");
  assert.equal(result.toState, "needs_follow_up");
  assert.ok(result.snoozedUntil instanceof Date);
});

test("applyQuickAction reclassify requires a valid target state", () => {
  assert.throws(
    () =>
      applyQuickAction({
        fromState: "waiting_on_you",
        action: "reclassify",
      }),
    /target/i
  );

  const result = applyQuickAction({
    fromState: "waiting_on_you",
    action: "reclassify",
    targetState: "needs_approval",
    reason: "User says it actually needs sign-off.",
  });
  assert.equal(result.toState, "needs_approval");
  assert.equal(result.toActionState, "needs_approval");
  assert.match(result.reason, /sign-off/i);
});

test("applyQuickAction rejects illegal transitions", () => {
  assert.throws(
    () =>
      applyQuickAction({
        fromState: "no_action_needed",
        action: "handled",
      }),
    /not allowed/i
  );

  assert.throws(
    () =>
      applyQuickAction({
        fromState: "no_action_needed",
        action: "snooze",
      }),
    /not allowed/i
  );
});

test("applyQuickAction rejects unsupported verbs", () => {
  assert.throws(
    () =>
      applyQuickAction({
        fromState: "waiting_on_you",
        action: "explode",
      }),
    /unsupported/i
  );
});

test("buildCanonicalConversationKey and parseCanonicalConversationKey round-trip", () => {
  const key = buildCanonicalConversationKey("Gmail", "thread-123");
  assert.equal(key, "comm:gmail:thread-123");
  const parsed = parseCanonicalConversationKey(key);
  assert.deepEqual(parsed, { sourceApp: "gmail", conversationId: "thread-123" });
});

test("buildCanonicalConversationKey returns null for missing inputs", () => {
  assert.equal(buildCanonicalConversationKey("", "abc"), null);
  assert.equal(buildCanonicalConversationKey("gmail", ""), null);
});

test("parseCanonicalConversationKey rejects non-canonical ids", () => {
  assert.equal(parseCanonicalConversationKey("gmail:foo"), null);
  assert.equal(parseCanonicalConversationKey(""), null);
  assert.equal(parseCanonicalConversationKey("calendar:event-1"), null);
});

test("getQuickActionsForState returns the legal verbs for each state", () => {
  const waitingActions = getQuickActionsForState("waiting_on_you").map(
    (item) => item.action
  );
  assert.deepEqual(waitingActions.sort(), [
    "dismissed",
    "handled",
    "reclassified",
    "snoozed",
  ]);

  const resolvedActions = getQuickActionsForState("resolved").map(
    (item) => item.action
  );
  assert.deepEqual(resolvedActions.sort(), ["dismissed", "reclassified"]);

  const noActionActions = getQuickActionsForState("no_action_needed").map(
    (item) => item.action
  );
  assert.deepEqual(noActionActions, ["reclassified"]);
});
