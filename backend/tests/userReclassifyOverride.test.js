"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ACTION_STATES,
  __test: {
    filterSuppressedStates,
    isReactivatedSinceAction,
    applyReclassifyToState,
    applyUserReclassifications,
  },
} = require("../services/communicationActionService");

function buildState(overrides = {}) {
  return {
    id: "comm:gmail:thread-99",
    sourceType: "gmail",
    conversationId: "thread-99",
    state: "no_action_needed",
    actionState: ACTION_STATES.NO_ACTION_NEEDED,
    actionStateLabel: "No action needed",
    eligibleForInsights: false,
    eligibleForBriefing: false,
    eligibleForPriorityFeed: false,
    surfaceEligibility: {
      insights: false,
      briefing: false,
      priorityFeed: false,
    },
    surfaceEligible: false,
    actionReason: "Looks informational.",
    reason: "Looks informational.",
    latestMessageTimestamp: new Date("2026-05-01T10:00:00.000Z").getTime(),
    latestInboundTimestamp: new Date("2026-05-01T10:00:00.000Z").getTime(),
    meta: {},
    ...overrides,
  };
}

function buildAction(overrides = {}) {
  return {
    itemId: "comm:gmail:thread-99",
    sourceApp: "gmail",
    conversationId: "thread-99",
    action: "reclassified",
    toActionState: ACTION_STATES.NEEDS_APPROVAL,
    fromActionState: ACTION_STATES.NO_ACTION_NEEDED,
    reason: "User says this actually needs sign-off.",
    createdAt: new Date("2026-05-02T09:00:00.000Z"),
    ...overrides,
  };
}

test("applyReclassifyToState moves the state to the user target with eligibility flags", () => {
  const next = applyReclassifyToState(buildState(), buildAction());
  assert.equal(next.state, "needs_approval");
  assert.equal(next.actionState, ACTION_STATES.NEEDS_APPROVAL);
  assert.equal(next.actionStateLabel, "Needs approval");
  assert.equal(next.eligibleForInsights, true);
  assert.equal(next.eligibleForBriefing, true);
  assert.equal(next.eligibleForPriorityFeed, true);
  assert.deepEqual(next.surfaceEligibility, {
    insights: true,
    briefing: true,
    priorityFeed: true,
  });
  assert.equal(next.surfaceEligible, true);
  assert.match(next.reason, /sign-off/i);
  assert.equal(next.prioritySource, "user_reclassify");
  assert.equal(next.meta.reclassifiedByUser, true);
  assert.equal(next.meta.actionState, ACTION_STATES.NEEDS_APPROVAL);
});

test("applyReclassifyToState reclassifying to no_action_needed makes the item disappear from all surfaces", () => {
  const baseState = buildState({
    state: "waiting_on_you",
    actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY,
    eligibleForInsights: true,
    eligibleForBriefing: true,
    eligibleForPriorityFeed: true,
  });
  const next = applyReclassifyToState(
    baseState,
    buildAction({ toActionState: ACTION_STATES.NO_ACTION_NEEDED })
  );
  assert.equal(next.actionState, ACTION_STATES.NO_ACTION_NEEDED);
  assert.equal(next.eligibleForInsights, false);
  assert.equal(next.eligibleForBriefing, false);
  assert.equal(next.eligibleForPriorityFeed, false);
});

test("applyReclassifyToState falls back to a synthesized reason when the action has none", () => {
  const next = applyReclassifyToState(
    buildState(),
    buildAction({ reason: "" })
  );
  assert.match(next.reason, /reclassified by user as needs approval/i);
});

test("applyReclassifyToState ignores actions with no toActionState", () => {
  const original = buildState();
  const next = applyReclassifyToState(
    original,
    buildAction({ toActionState: "" })
  );
  assert.strictEqual(next, original);
});

test("applyUserReclassifications applies the override only when the action is reclassified", () => {
  const states = [
    buildState({ id: "comm:gmail:t-1" }),
    buildState({ id: "comm:gmail:t-2" }),
    buildState({ id: "comm:gmail:t-3" }),
  ];

  const map = new Map([
    ["comm:gmail:t-1", buildAction({ itemId: "comm:gmail:t-1" })],
    ["comm:gmail:t-2", buildAction({ itemId: "comm:gmail:t-2", action: "handled" })],
    ["comm:gmail:t-3", buildAction({ itemId: "comm:gmail:t-3", action: "snoozed" })],
  ]);

  const out = applyUserReclassifications(states, map);
  assert.equal(out[0].actionState, ACTION_STATES.NEEDS_APPROVAL);
  assert.equal(out[1].actionState, ACTION_STATES.NO_ACTION_NEEDED);
  assert.equal(out[2].actionState, ACTION_STATES.NO_ACTION_NEEDED);
});

test("applyUserReclassifications skips override when a newer inbound message arrived after the reclassify", () => {
  const state = buildState({
    latestMessageTimestamp: new Date("2026-05-03T11:00:00.000Z").getTime(),
    latestInboundTimestamp: new Date("2026-05-03T11:00:00.000Z").getTime(),
  });
  const map = new Map([[state.id, buildAction()]]);

  const [out] = applyUserReclassifications([state], map);
  assert.strictEqual(out, state);
});

test("applyUserReclassifications is a no-op when there are no actions", () => {
  const states = [buildState()];
  assert.strictEqual(applyUserReclassifications(states), states);
  assert.strictEqual(applyUserReclassifications(states, new Map()), states);
});

test("filterSuppressedStates passes reclassified items through (override applied later)", () => {
  const state = buildState({
    state: "waiting_on_you",
    actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY,
  });
  const map = new Map([[state.id, buildAction()]]);
  const out = filterSuppressedStates([state], map);
  assert.equal(out.length, 1);
  assert.strictEqual(out[0], state);
});

test("filterSuppressedStates suppresses handled and dismissed items unless reactivated", () => {
  const state = buildState({
    state: "waiting_on_you",
    actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY,
    latestMessageTimestamp: new Date("2026-05-01T10:00:00.000Z").getTime(),
    latestInboundTimestamp: new Date("2026-05-01T10:00:00.000Z").getTime(),
  });

  for (const action of ["handled", "dismissed", "approved"]) {
    const map = new Map([
      [
        state.id,
        buildAction({
          action,
          createdAt: new Date("2026-05-02T09:00:00.000Z"),
        }),
      ],
    ]);
    assert.equal(
      filterSuppressedStates([state], map).length,
      0,
      `expected ${action} to suppress`
    );
  }
});

test("filterSuppressedStates re-shows items after a newer message arrives", () => {
  const state = buildState({
    state: "waiting_on_you",
    latestMessageTimestamp: new Date("2026-05-03T11:00:00.000Z").getTime(),
    latestInboundTimestamp: new Date("2026-05-03T11:00:00.000Z").getTime(),
  });
  const map = new Map([
    [
      state.id,
      buildAction({
        action: "handled",
        createdAt: new Date("2026-05-02T09:00:00.000Z"),
      }),
    ],
  ]);
  assert.equal(filterSuppressedStates([state], map).length, 1);
});

test("filterSuppressedStates respects an unexpired snooze window", () => {
  const state = buildState({
    state: "waiting_on_you",
    actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY,
  });
  const future = new Date(Date.now() + 60 * 60 * 1000);
  const past = new Date(Date.now() - 60 * 60 * 1000);

  assert.equal(
    filterSuppressedStates(
      [state],
      new Map([
        [
          state.id,
          buildAction({
            action: "snoozed",
            snoozedUntil: future,
            createdAt: new Date(Date.now() - 30 * 60 * 1000),
          }),
        ],
      ])
    ).length,
    0,
    "active snooze should hide the item"
  );

  assert.equal(
    filterSuppressedStates(
      [state],
      new Map([
        [
          state.id,
          buildAction({
            action: "snoozed",
            snoozedUntil: past,
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          }),
        ],
      ])
    ).length,
    1,
    "expired snooze should re-show the item"
  );
});

test("isReactivatedSinceAction handles missing timestamps without throwing", () => {
  assert.equal(isReactivatedSinceAction({}, {}), false);
  assert.equal(
    isReactivatedSinceAction(
      { latestMessageTimestamp: null },
      { createdAt: new Date() }
    ),
    false
  );
});
