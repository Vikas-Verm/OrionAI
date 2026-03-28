"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: plannerTest,
} = require("../services/agentPlanner");
const {
  normalizeStepParams,
  __test: normalizerTest,
} = require("../services/agentParamNormalizer");
const {
  __test: jiraToolTest,
} = require("../services/tools/toolJira");

test("agent planner routes latest bill lookups to connected database", () => {
  const plan = plannerTest.normalizePlannedSteps("show latest bill", {
    isAgentTask: true,
    confidence: 0.72,
    intent: "Fetch the latest bill",
    steps: [
      {
        tool: "fetch_document",
        params: { collection: "Bills", fallbackToLatest: true },
      },
    ],
  });

  assert.equal(plan.isAgentTask, true);
  assert.ok(plan.confidence >= 0.85);
  assert.deepEqual(plan.steps, [
    {
      tool: "database_query",
      params: { question: "show latest bill" },
    },
  ]);
});

test("agent planner keeps document delivery flows on fetch_document", () => {
  const originalPlan = {
    isAgentTask: true,
    confidence: 0.94,
    intent: "Send the latest invoice",
    steps: [
      {
        tool: "fetch_document",
        params: { collection: "Invoices", fallbackToLatest: true },
      },
      { tool: "generate_pdf", params: {} },
      { tool: "send_email", params: { to: "client@example.com" } },
    ],
  };

  const plan = plannerTest.normalizePlannedSteps(
    "send latest invoice to client@example.com",
    originalPlan
  );

  assert.deepEqual(plan, originalPlan);
});

test("assignee extractor handles lowercase Jira requests from agent chat", () => {
  assert.equal(
    normalizerTest.extractAssigneeFromMessage("show rahul tickets"),
    "rahul"
  );
  assert.equal(
    normalizerTest.extractAssigneeFromMessage("show my tickets"),
    null
  );
});

test("normalizeStepParams backfills jira assigneeName for ticket lookups", () => {
  const normalized = normalizeStepParams(
    { tool: "jira_my_tickets", params: {} },
    "show anshul tickets"
  );

  assert.equal(normalized.params.assigneeName, "anshul");
  assert.equal(normalized.params.assignee, "anshul");
});

test("jira my tickets helpers honor assigneeName skill output", () => {
  assert.equal(
    jiraToolTest.pickRequestedAssignee({ assigneeName: "Rahul Gandhi" }),
    "Rahul Gandhi"
  );

  const jql = jiraToolTest.buildMyTicketsJql("ENGG", {
    resolvedUser: {
      accountId: "712020:rahul-gandhi",
      displayName: "Rahul Gandhi",
    },
  });

  assert.match(jql, /project = ENGG/);
  assert.match(jql, /assignee = "712020:rahul-gandhi"/);
  assert.match(jql, /statusCategory != Done/);
});
