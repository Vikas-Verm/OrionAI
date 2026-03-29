"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: { buildCommunicationStats, buildSummary },
} = require("../services/briefingService");

test("workspace briefing stats read waiting, approval, and follow-up counts from the shared communication summary", () => {
  const stats = buildCommunicationStats(
    {
      replyRequiredCount: 4,
      approvalCount: 2,
      followUpCount: 3,
    },
    new Set(["gmail", "slack", "jira"])
  );

  assert.deepEqual(stats, [
    { label: "Connected apps", value: "3" },
    { label: "Waiting on you", value: "4" },
    { label: "Approvals", value: "2" },
    { label: "Follow-ups", value: "3" },
  ]);
});

test("workspace briefing summary keeps communication counts aligned with shared engine output", () => {
  const summary = buildSummary({
    connectedCount: 3,
    totalUnread: 5,
    overdueCount: 2,
    myOverdueCount: 1,
    calendarCount: 1,
  });

  assert.match(summary, /5 conversation/);
  assert.match(summary, /1 of your Jira ticket/);
  assert.match(summary, /1 upcoming meeting/);
});
