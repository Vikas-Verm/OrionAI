"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ACTION_STATES,
} = require("../services/communicationActionService");
const {
  __test: { buildPriorityFeedFilters },
} = require("../services/priorityFeedService");

test("buildPriorityFeedFilters includes counts for each priority feed chip", () => {
  const filters = buildPriorityFeedFilters([
    {
      id: "comm-reply",
      category: "communication",
      actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY,
      priority: "High",
    },
    {
      id: "comm-approval",
      category: "communication",
      actionState: ACTION_STATES.NEEDS_APPROVAL,
      priority: "Medium",
    },
    {
      id: "meeting-1",
      category: "meetings",
      priority: "High",
    },
    {
      id: "task-1",
      category: "tasks",
      actionState: ACTION_STATES.NEEDS_FOLLOW_UP,
      priority: "Low",
    },
  ]);

  const byId = Object.fromEntries(filters.map((filter) => [filter.id, filter.count]));

  assert.deepEqual(byId, {
    all: 4,
    urgent: 2,
    communication: 2,
    waiting_on_your_reply: 1,
    needs_approval: 1,
    needs_follow_up: 1,
    meetings: 1,
    tasks: 1,
  });
});
