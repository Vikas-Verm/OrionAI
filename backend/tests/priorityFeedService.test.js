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
    mapMessageSourceToItems,
    isItemReactivatedSinceAction,
    filterActiveItems,
    buildCommunicationConversationKey,
    resolveCommunicationFallbackSources,
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

test("priority feed summary can still use the shared communication summary while chips follow visible cards", () => {
  const items = [
    {
      id: "comm-reply",
      category: "communication",
      actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY,
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
  assert.equal(byId.communication, 1);
  assert.equal(byId.needs_approval, 0);
  assert.equal(byId.needs_follow_up, 0);
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
  const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const baseEvent = {
    id: "evt-1",
    title: "testing apis",
    start: start.toISOString(),
    end: end.toISOString(),
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

test("fallback sources stay disabled when the shared communication engine already inspected that app", () => {
  const plan = resolveCommunicationFallbackSources({
    allStates: [
      {
        id: "comm:gmail:thread-1",
        sourceType: "gmail",
        actionState: ACTION_STATES.RESOLVED,
      },
      {
        id: "comm:telegram:chat-1",
        sourceType: "telegram",
        actionState: ACTION_STATES.NO_ACTION_NEEDED,
      },
    ],
  });

  assert.equal(plan.includeGmailFallback, false);
  assert.deepEqual(plan.messagingSources, ["slack", "signal", "whatsapp"]);
});

test("fallback messaging items include the latest message fingerprint in their identity", () => {
  const [item] = mapMessageSourceToItems("telegram", [
    {
      id: "chat-1",
      name: "Aarav",
      unread: 2,
      preview: "Can you share the update?",
      latestMessageId: "msg-2",
      latestMessageAt: "2026-03-29T09:15:00.000Z",
    },
  ]);

  assert.equal(item.meta.conversationId, "chat-1");
  assert.equal(item.meta.latestMessageId, "msg-2");
  assert.equal(item.meta.latestMessageAt, "2026-03-29T09:15:00.000Z");
  assert.match(item.id, /^telegram:chat-1:msg-2$/);
});

test("priority feed items reactivate once a newer fallback message arrives after an action", () => {
  const latestAction = {
    createdAt: "2026-03-29T09:00:00.000Z",
  };

  assert.equal(
    isItemReactivatedSinceAction(
      {
        meta: {
          latestMessageAt: "2026-03-29T09:15:00.000Z",
        },
      },
      latestAction
    ),
    true
  );

  assert.equal(
    isItemReactivatedSinceAction(
      {
        meta: {
          latestMessageAt: "2026-03-29T08:45:00.000Z",
        },
      },
      latestAction
    ),
    false
  );
});

test("priority feed suppresses fallback chat cards when the same conversation was already marked done", () => {
  const [item] = mapMessageSourceToItems("telegram", [
    {
      id: "chat-1",
      name: "Arti",
      unread: 1,
      preview: "My name is arti and your?",
      latestMessageId: "msg-2",
      latestMessageAt: "2026-03-29T09:00:00.000Z",
    },
  ]);

  const visible = filterActiveItems([item], {
    latestByItem: new Map(),
    latestByConversation: new Map([
      [
        buildCommunicationConversationKey("telegram", "chat-1"),
        {
          itemId: "comm:telegram:chat-1",
          action: "approved",
          createdAt: "2026-03-29T09:05:00.000Z",
        },
      ],
    ]),
  });

  assert.equal(visible.length, 0);
});

test("priority feed reactivates a fallback chat card only after a newer message arrives", () => {
  const [item] = mapMessageSourceToItems("telegram", [
    {
      id: "chat-1",
      name: "Arti",
      unread: 2,
      preview: "Can you help me with this too?",
      latestMessageId: "msg-3",
      latestMessageAt: "2026-03-29T09:15:00.000Z",
    },
  ]);

  const visible = filterActiveItems([item], {
    latestByItem: new Map(),
    latestByConversation: new Map([
      [
        buildCommunicationConversationKey("telegram", "chat-1"),
        {
          itemId: "comm:telegram:chat-1",
          action: "approved",
          createdAt: "2026-03-29T09:05:00.000Z",
        },
      ],
    ]),
  });

  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, item.id);
});

test("priority feed filter chips do not show communication counts when no communication cards are visible", () => {
  const filters = buildPriorityFeedFilters(
    [
      {
        id: "meeting-1",
        category: "meetings",
        priority: "Medium",
      },
    ],
    {
      priorityFeedCount: 2,
      replyRequiredCount: 2,
      approvalCount: 0,
      followUpCount: 0,
    }
  );

  const byId = Object.fromEntries(filters.map((filter) => [filter.id, filter.count]));

  assert.equal(byId.communication, 0);
  assert.equal(byId.needs_approval, 0);
  assert.equal(byId.needs_follow_up, 0);
});
