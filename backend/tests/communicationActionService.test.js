"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ACTION_STATES,
  mapActionStateToPriorityItem,
  __test: {
    filterSurfaceStates,
    filterBriefingStates,
    filterPriorityFeedStates,
    getNormalizedGmailMessageText,
    normalizeGmailThread,
    buildGmailThreadHaystack,
    normalizeSlackMessages,
    pickSlackConversationMessages,
  },
} = require("../services/communicationActionService");

test("filterSurfaceStates keeps only current-user action items for active AI surfaces", () => {
  const filtered = filterSurfaceStates([
    { id: "reply", actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY, surfaceEligible: true },
    { id: "approval", actionState: ACTION_STATES.NEEDS_APPROVAL, surfaceEligible: true },
    { id: "waiting", actionState: ACTION_STATES.WAITING_ON_OTHERS, surfaceEligible: false },
    { id: "quiet", actionState: ACTION_STATES.NO_ACTION_NEEDED, surfaceEligible: false },
  ]);

  assert.deepEqual(
    filtered.map((state) => state.id),
    ["reply", "approval"]
  );
});

test("surface filters keep waiting-on-others in briefing but not in insight or priority feed surfaces", () => {
  const states = [
    { id: "reply", actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY, eligibleForInsights: true, eligibleForBriefing: true, eligibleForPriorityFeed: true },
    { id: "approval", actionState: ACTION_STATES.NEEDS_APPROVAL, eligibleForInsights: true, eligibleForBriefing: true, eligibleForPriorityFeed: true },
    { id: "waiting", actionState: ACTION_STATES.WAITING_ON_OTHERS, eligibleForInsights: false, eligibleForBriefing: true, eligibleForPriorityFeed: false },
    { id: "resolved", actionState: ACTION_STATES.RESOLVED, eligibleForInsights: false, eligibleForBriefing: false, eligibleForPriorityFeed: false },
  ];

  assert.deepEqual(
    filterSurfaceStates(states).map((state) => state.id),
    ["reply", "approval"]
  );
  assert.deepEqual(
    filterBriefingStates(states).map((state) => state.id),
    ["reply", "approval", "waiting"]
  );
  assert.deepEqual(
    filterPriorityFeedStates(states).map((state) => state.id),
    ["reply", "approval"]
  );
});

test("pickSlackConversationMessages prefers the relevant thread over unrelated channel chatter", () => {
  const channel = {
    id: "C123",
    is_channel: true,
    is_group: false,
    is_im: false,
    is_mpim: false,
  };
  const currentUser = {
    id: "U123",
    handles: ["alex", "Alex"],
  };
  const historyMessages = [
    { ts: "1710000000.000100", user: "U999", text: "General release update", reply_count: 0 },
    { ts: "1710000100.000100", user: "U777", text: "Root thread", reply_count: 2 },
    { ts: "1710000200.000100", user: "U999", text: "Random channel chatter", reply_count: 0 },
  ];
  const threadMessagesByRoot = new Map([
    [
      "1710000100.000100",
      [
        { ts: "1710000100.000100", user: "U777", text: "<@U123> can you review this before launch?" },
        { ts: "1710000150.000100", user: "U456", text: "I'll handle it and update the thread." },
      ],
    ],
  ]);

  const selected = pickSlackConversationMessages({
    channel,
    historyMessages,
    threadMessagesByRoot,
    currentUser,
  });

  assert.equal(selected.scope, "thread");
  assert.equal(selected.threadTs, "1710000100.000100");
  assert.equal(selected.messages.length, 2);
  assert.equal(selected.messages[1].text, "I'll handle it and update the thread.");
});

test("normalizeSlackMessages marks replies to the current user inside a thread", () => {
  const channel = {
    is_im: false,
  };
  const currentUser = {
    id: "U123",
    handles: ["alex", "Alex"],
  };

  const messages = normalizeSlackMessages(
    [
      { ts: "1710000100.000100", user: "U123", text: "Can someone take this?" },
      { ts: "1710000150.000100", user: "U456", text: "I'll handle it." },
    ],
    channel,
    currentUser
  );

  assert.equal(messages[1].inReplyToCurrentUser, true);
  assert.equal(messages[1].addressedToCurrentUser, true);
});

test("communication priority draft actions stay in chat mode and include the latest message context", () => {
  const item = mapActionStateToPriorityItem({
    id: "comm:telegram:123",
    sourceType: "telegram",
    sourceLabel: "Telegram",
    conversationId: "123",
    conversationTitle: "Ardhangini ♥️♥️",
    participantLabel: "Ardhangini ♥️♥️",
    previewText: "Urgently need your help pls reply me",
    actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY,
    actionStateLabel: "Waiting on your reply",
    actionReason: "This conversation is waiting on your reply.",
    confidence: 0.91,
    confidenceBand: "high",
    priorityBoost: 18,
    latestMessageTimestamp: "2026-03-27T17:38:00.000Z",
    latestInboundTimestamp: "2026-03-27T17:38:00.000Z",
    latestOutboundTimestamp: "2026-03-27T17:31:00.000Z",
    openContext: { dialogId: "123" },
  });

  assert.equal(item.action.kind, "prompt");
  assert.equal(item.action.mode, "chat");
  assert.match(item.action.prompt, /Latest message: "Urgently need your help pls reply me"\./);
  assert.match(item.action.prompt, /Return ONLY the reply text\./);
  assert.match(item.action.prompt, /Do NOT send the message or call any tools\./);
});

test("getNormalizedGmailMessageText keeps only the fresh reply above quoted history", () => {
  const text = "Approved\n\nOn Thu, Mar 28, 2026 at 10:00 AM Vikas wrote:\nHii Pls approve my tomorrow leave";
  const payload = {
    mimeType: "text/plain",
    body: {
      data: Buffer.from(text, "utf-8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_"),
    },
  };

  assert.equal(
    getNormalizedGmailMessageText({ payload, snippet: "Approved On Thu, Mar 28..." }),
    "Approved"
  );
});

test("normalizeGmailThread uses the latest resolved Gmail reply instead of the stale thread ask", () => {
  const latestText = "Approved\n\nOn Thu, Mar 28, 2026 at 10:00 AM Vikas wrote:\nHii Pls approve my tomorrow leave";
  const latestPayload = {
    headers: [
      { name: "Subject", value: "Leave approval" },
      { name: "From", value: "Manager <manager@example.com>" },
      { name: "To", value: "vikas@example.com" },
      { name: "Date", value: "Fri, 28 Mar 2026 10:05:00 +0530" },
    ],
    mimeType: "text/plain",
    body: {
      data: Buffer.from(latestText, "utf-8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_"),
    },
  };
  const firstPayload = {
    headers: [
      { name: "Subject", value: "Leave approval" },
      { name: "From", value: "Vikas <vikas@example.com>" },
      { name: "To", value: "manager@example.com" },
      { name: "Date", value: "Fri, 28 Mar 2026 09:55:00 +0530" },
    ],
    mimeType: "text/plain",
    body: {
      data: Buffer.from("Hii Pls approve my tomorrow leave", "utf-8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_"),
    },
  };

  const conversation = normalizeGmailThread(
    {
      id: "thread-1",
      snippet: "Approved On Thu, Mar 28, 2026 at 10:00 AM Vikas wrote: Hii Pls approve my tomorrow leave",
      messages: [
        { id: "m1", internalDate: String(Date.parse("2026-03-28T09:55:00+05:30")), payload: firstPayload },
        { id: "m2", internalDate: String(Date.parse("2026-03-28T10:05:00+05:30")), payload: latestPayload },
      ],
    },
    "vikas@example.com"
  );

  assert.equal(conversation.previewText, "Approved");
  assert.equal(conversation.messages[1].text, "Approved");
});

test("normalizeGmailThread excludes calendar invitation and cancelled event threads from active communication states", () => {
  const invitePayload = {
    headers: [
      { name: "Subject", value: "Invitation: N8N-MongoDb-Workflow-Discussion-Rca @ Wed 25 Mar 2026 1:30pm - 2pm (IST)" },
      { name: "From", value: "Google Calendar <calendar-notification@google.com>" },
      { name: "To", value: "vikas@example.com" },
      { name: "Content-Class", value: "urn:content-classes:calendarmessage" },
    ],
    mimeType: "multipart/mixed",
    parts: [
      { mimeType: "text/plain", body: { data: "" } },
      { mimeType: "text/calendar", filename: "invite.ics", body: { attachmentId: "att-1" } },
    ],
  };
  const cancelledPayload = {
    headers: [
      { name: "Subject", value: "Cancelled event: OrionAI Testing @ Mon 23 Mar 2026 10am - 10:30am (IST)" },
      { name: "From", value: "Google Calendar <calendar-notification@google.com>" },
      { name: "To", value: "vikas@example.com" },
    ],
    mimeType: "text/plain",
    body: {
      data: Buffer.from("This event was cancelled.", "utf-8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_"),
    },
  };

  const inviteHaystack = buildGmailThreadHaystack({
    snippet: "Invitation: N8N-MongoDb-Workflow-Discussion-Rca",
    messages: [{ id: "m1", internalDate: "1", payload: invitePayload }],
  });
  assert.match(inviteHaystack, /invitation:|text\/calendar|calendarmessage/);

  const conversation = normalizeGmailThread(
    {
      id: "thread-calendar",
      snippet: "Cancelled event: OrionAI Testing",
      messages: [
        { id: "m1", internalDate: "1", payload: invitePayload },
        { id: "m2", internalDate: "2", payload: cancelledPayload },
      ],
    },
    "vikas@example.com"
  );

  assert.match(conversation.sourceMetadata.excludedReason, /calendar invite/i);
});
