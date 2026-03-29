"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ACTION_STATES,
} = require("../services/communicationActionService");
const {
  __test: {
    buildPriorityFeedFilters,
    buildPrioritySummary,
    buildHeadline,
    sortByPriority,
    mapCalendarEventToPriorityItem,
    dedupePriorityItems,
    buildEffectiveCommunicationSummary,
  },
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
    urgent: 1,
    communication: 2,
    needs_approval: 1,
    needs_follow_up: 1,
    meetings: 1,
    tasks: 1,
  });
});

test("urgent filter excludes meetings even when they are high priority", () => {
  const filters = buildPriorityFeedFilters([
    {
      id: "meeting-urgent",
      category: "meetings",
      priority: "High",
    },
    {
      id: "comm-urgent",
      category: "communication",
      priority: "High",
      actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY,
    },
  ]);

  const byId = Object.fromEntries(filters.map((filter) => [filter.id, filter.count]));

  assert.equal(byId.urgent, 1);
  assert.equal(byId.meetings, 1);
});

test("priority feed communication counts can be driven directly from the shared communication summary", () => {
  const items = [
    {
      id: "meeting-1",
      category: "meetings",
      priority: "High",
    },
    {
      id: "task-1",
      category: "tasks",
      priority: "Low",
      needsAttentionSoon: true,
    },
  ];

  const communicationSummary = {
    priorityFeedCount: 5,
    replyRequiredCount: 2,
    approvalCount: 1,
    followUpCount: 2,
  };

  const summary = buildPrioritySummary(items, communicationSummary);
  const filters = buildPriorityFeedFilters(items, communicationSummary);
  const byId = Object.fromEntries(filters.map((filter) => [filter.id, filter.count]));

  assert.equal(summary.waitingOnYouCount, 2);
  assert.equal(summary.approvalCount, 1);
  assert.equal(summary.followUpCount, 2);
  assert.equal(byId.communication, 5);
  assert.equal(byId.needs_approval, 1);
  assert.equal(byId.needs_follow_up, 2);
});

test("priority feed headline keeps communication wording aligned with the shared state summary", () => {
  const headline = buildHeadline(
    [
      { id: "meeting-1", category: "meetings", priority: "High" },
      { id: "task-1", category: "tasks", priority: "Low" },
    ],
    { myOverdueCount: 1 },
    {
      priorityFeedCount: 3,
      approvalCount: 1,
      followUpCount: 1,
    }
  );

  assert.match(headline, /3 communication thread/);
  assert.match(headline, /1 approval/);
  assert.match(headline, /1 follow-up/);
});

test("priority feed sorts earlier meetings first inside the meetings lane", () => {
  const sorted = sortByPriority([
    {
      id: "meeting-later",
      title: "Later meeting",
      category: "meetings",
      priority: "High",
      priorityScore: 90,
      meta: { startsAt: "2026-03-29T18:00:00+05:30" },
    },
    {
      id: "meeting-earlier",
      title: "Earlier meeting",
      category: "meetings",
      priority: "Medium",
      priorityScore: 55,
      meta: { startsAt: "2026-03-29T17:15:00+05:30" },
    },
  ]);

  assert.equal(sorted[0].id, "meeting-earlier");
  assert.equal(sorted[1].id, "meeting-later");
});

test("calendar priority ignores per-user RSVP differences for the same meeting", () => {
  const baseEvent = {
    id: "evt-1",
    title: "testing apis",
    start: "2026-03-30T18:00:00+05:30",
    end: "2026-03-30T19:00:00+05:30",
    description: "",
    location: null,
    meet: "https://meet.google.com/abc-defg-hij",
    time: "06:00 pm",
    date: "Mon, 30 Mar 2026",
    attendees: [{ email: "a@example.com" }, { email: "b@example.com" }],
  };

  const organizerView = mapCalendarEventToPriorityItem({
    ...baseEvent,
    responseStatus: "accepted",
  });
  const attendeeView = mapCalendarEventToPriorityItem({
    ...baseEvent,
    responseStatus: "needsAction",
  });

  assert.equal(organizerView.priority, attendeeView.priority);
  assert.equal(organizerView.priorityScore, attendeeView.priorityScore);
  assert.equal(organizerView.reason, attendeeView.reason);
});

test("priority feed dedupes duplicate meeting copies with the same title and start time", () => {
  const deduped = dedupePriorityItems([
    {
      id: "calendar:event-copy-a",
      title: "testing apis",
      category: "meetings",
      priority: "Medium",
      priorityScore: 58,
      meta: { startsAt: "2026-03-29T18:00:00+05:30", endsAt: "2026-03-29T19:00:00+05:30" },
    },
    {
      id: "calendar:event-copy-b",
      title: "testing apis",
      category: "meetings",
      priority: "High",
      priorityScore: 72,
      meta: { startsAt: "2026-03-29T18:00:00+05:30", endsAt: "2026-03-29T19:00:00+05:30", attendeeCount: 4 },
    },
  ]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, "calendar:event-copy-b");
});

test("effective communication summary keeps comm counts visible when fallback items are present", () => {
  const summary = buildEffectiveCommunicationSummary(
    {
      priorityFeedCount: 0,
      replyRequiredCount: 1,
      approvalCount: 0,
      followUpCount: 0,
    },
    [
      { id: "slack:chan-1", category: "communication" },
      { id: "telegram:chat-1", category: "communication" },
    ]
  );

  assert.equal(summary.priorityFeedCount, 2);
  assert.equal(summary.replyRequiredCount, 1);
});
