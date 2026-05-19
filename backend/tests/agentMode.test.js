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
  __test: runtimeContextTest,
} = require("../services/agentRuntimeContext");
const {
  checkNeedsConfirmation,
} = require("../services/confirmationService");
const {
  __test: jiraToolTest,
} = require("../services/tools/toolJira");
const {
  __test: whatsappToolTest,
} = require("../services/tools/toolWhatsapp");

test("meeting prep requests are upgraded from plain calendar lookup to retrieval plus synthesis", () => {
  const plan = plannerTest.normalizePlannedSteps(
    `Prep me for the meeting "Testing OrionAI" starting in 16 min. Summarize what I should know, what I should bring, and what questions I should ask.`,
    {
      isAgentTask: true,
      confidence: 0.78,
      intent: "Find the meeting",
      steps: [{ tool: "calendar_get_events", params: { query: "Testing OrionAI" } }],
    }
  );

  assert.equal(plan.isAgentTask, true);
  assert.equal(plan.steps[0].tool, "calendar_get_events");
  assert.equal(plan.steps[1].tool, "meeting_prep");
  assert.equal(plan.steps[1].params.titleHint, "Testing OrionAI");
  assert.equal(plan.steps[1].params.relativeStartMinutes, 16);
});

test("meeting timing lookups stay as calendar lookups when no prep intent exists", () => {
  const originalPlan = {
    isAgentTask: true,
    confidence: 0.9,
    intent: "Find the meeting timing",
    steps: [{ tool: "calendar_get_events", params: { query: "Testing OrionAI" } }],
  };

  const plan = plannerTest.normalizePlannedSteps(
    `When is my meeting "Testing OrionAI"?`,
    originalPlan
  );

  assert.deepEqual(plan, originalPlan);
});

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

test("jira my tickets helpers can search across all accessible projects", () => {
  const jql = jiraToolTest.buildMyTicketsJql("ENGG", {
    allProjects: true,
    overdueOnly: true,
  });

  assert.doesNotMatch(jql, /project = ENGG/);
  assert.match(jql, /assignee = currentUser\(\)/);
  assert.match(jql, /statusCategory != Done/);
  assert.match(jql, /duedate is not EMPTY/);
});

test("normalizeStepParams infers calendar details from natural language meeting requests", () => {
  const normalized = normalizeStepParams(
    { tool: "calendar_create", params: {} },
    "Schedule a meeting with vikasverma@poshn.co for testing OrionAI at today 5:30 PM",
    { baseDate: new Date("2026-03-29T08:00:00+05:30") }
  );

  assert.equal(normalized.params.title, "testing OrionAI");
  assert.equal(normalized.params.startDateTime, "2026-03-29T17:30:00+05:30");
  assert.deepEqual(normalized.params.attendees, ["vikasverma@poshn.co"]);
  assert.equal(normalized.params.addMeet, true);
});

test("normalizeStepParams recovers calendar delete title from natural language", () => {
  const normalized = normalizeStepParams(
    { tool: "calendar_delete", params: {} },
    "Cancel my standup meeting",
    { baseDate: new Date("2026-03-29T08:00:00+05:30") }
  );

  assert.equal(normalized.params.title, "standup");
  assert.equal(normalized.params.eventId, undefined);
});

test("normalizeStepParams scopes calendar delete by mentioned date", () => {
  const normalized = normalizeStepParams(
    { tool: "calendar_delete", params: {} },
    "Remove tomorrow's meeting with Rahul at 5pm",
    { baseDate: new Date("2026-03-29T08:00:00+05:30") }
  );

  assert.equal(normalized.params.title, "Rahul");
  assert.equal(normalized.params.dateFrom, "2026-03-30");
  assert.equal(normalized.params.dateTo, "2026-03-30");
});

test("normalizeStepParams replaces generic calendar delete titles", () => {
  const normalized = normalizeStepParams(
    { tool: "calendar_delete", params: { title: "meeting" } },
    "Delete the meeting about launch review tomorrow",
    { baseDate: new Date("2026-03-29T08:00:00+05:30") }
  );

  assert.equal(normalized.params.title, "launch review");
  assert.equal(normalized.params.dateFrom, "2026-03-30");
});

test("normalizeStepParams prefers the user's local today wording over a stale ISO date from the planner", () => {
  const normalized = normalizeStepParams(
    {
      tool: "calendar_create",
      params: {
        title: "testing OrionAI",
        startDateTime: "2026-03-29T02:00:00+05:30",
      },
    },
    "Schedule a meeting with vikasverma@poshn.co for testing OrionAI today at 2:00 AM",
    { baseDate: new Date("2026-03-30T00:43:00+05:30") }
  );

  assert.equal(normalized.params.startDateTime, "2026-03-30T02:00:00+05:30");
});

test("agent planner prompt uses IST-local today and tomorrow near midnight", () => {
  const prompt = plannerTest.buildPlannerPrompt({
    userMessage: "Schedule a meeting today at 2:00 AM",
    toolsText: "• calendar_create",
    now: new Date("2026-03-29T19:13:00.000Z"),
  });

  assert.match(prompt, /Current date: 2026-03-30/);
  assert.match(prompt, /"today" = 2026-03-30/);
  assert.match(prompt, /"tomorrow" = 2026-03-31/);
});

test("normalizeStepParams infers Telegram contact from agent phrasing", () => {
  const normalized = normalizeStepParams(
    { tool: "telegram_send_message", params: { message: "" } },
    "Send an acknowledgment about this meeting to Aradhangini on Telegram."
  );

  assert.equal(normalized.params.contact, "Aradhangini");
});

test("normalizeStepParams marks exact Telegram message text as user supplied", () => {
  const normalized = normalizeStepParams(
    { tool: "telegram_send_message", params: {} },
    "send hii message to pikuu in telegram"
  );

  assert.equal(normalized.params.contact, "pikuu");
  assert.equal(normalized.params.message, "hii");
  assert.equal(normalized.params.messageSource, "user_exact");
  assert.equal(normalized.params.skipConfirmation, true);
});

test("normalizeStepParams marks exact Slack message text as user supplied", () => {
  const normalized = normalizeStepParams(
    { tool: "slack_send_message", params: {} },
    "send hii message to rahul in slack"
  );

  assert.equal(normalized.params.channel, "rahul");
  assert.equal(normalized.params.message, "hii");
  assert.equal(normalized.params.messageSource, "user_exact");
  assert.equal(normalized.params.skipConfirmation, true);
});

test("normalizeStepParams marks exact WhatsApp message text as user supplied", () => {
  const normalized = normalizeStepParams(
    { tool: "whatsapp_send_message", params: {} },
    "send hii message to pikuu in whatsapp"
  );

  assert.equal(normalized.params.contact, "pikuu");
  assert.equal(normalized.params.to, "pikuu");
  assert.equal(normalized.params.message, "hii");
  assert.equal(normalized.params.messageSource, "user_exact");
  assert.equal(normalized.params.skipConfirmation, true);
});

test("normalizeStepParams keeps topic Telegram messages confirmable", () => {
  const normalized = normalizeStepParams(
    {
      tool: "telegram_send_message",
      params: { contact: "pikuu", message: "romantic" },
    },
    "send romantic message to pikuu in telegram"
  );

  assert.equal(normalized.params.contact, "pikuu");
  assert.equal(normalized.params.message, "romantic");
  assert.equal(normalized.params.messageSource, undefined);
  assert.equal(normalized.params.skipConfirmation, undefined);
});

test("normalizeStepParams keeps topic Slack and WhatsApp messages confirmable", () => {
  const slack = normalizeStepParams(
    {
      tool: "slack_send_message",
      params: { channel: "rahul", message: "romantic" },
    },
    "send romantic message to rahul in slack"
  );

  const whatsapp = normalizeStepParams(
    {
      tool: "whatsapp_send_message",
      params: { contact: "pikuu", to: "pikuu", message: "romantic" },
    },
    "send romantic message to pikuu in whatsapp"
  );

  assert.equal(slack.params.channel, "rahul");
  assert.equal(slack.params.message, "romantic");
  assert.equal(slack.params.messageSource, undefined);
  assert.equal(slack.params.skipConfirmation, undefined);
  assert.equal(whatsapp.params.contact, "pikuu");
  assert.equal(whatsapp.params.message, "romantic");
  assert.equal(whatsapp.params.messageSource, undefined);
  assert.equal(whatsapp.params.skipConfirmation, undefined);
});

test("messaging exact sends skip confirmation but drafted sends still require it", () => {
  assert.deepEqual(
    checkNeedsConfirmation("telegram_send_message", {
      contact: "pikuu",
      message: "hii",
      messageSource: "user_exact",
      skipConfirmation: true,
    }),
    { needsConfirm: false }
  );

  assert.deepEqual(
    checkNeedsConfirmation("slack_send_message", {
      channel: "rahul",
      message: "hii",
      messageSource: "user_exact",
      skipConfirmation: true,
    }),
    { needsConfirm: false }
  );

  assert.deepEqual(
    checkNeedsConfirmation("whatsapp_send_message", {
      contact: "pikuu",
      to: "pikuu",
      message: "hii",
      messageSource: "user_exact",
      skipConfirmation: true,
    }),
    { needsConfirm: false }
  );

  assert.equal(
    checkNeedsConfirmation("telegram_send_message", {
      contact: "pikuu",
      message: "Here is a romantic message...",
    }).needsConfirm,
    true
  );

  assert.equal(
    checkNeedsConfirmation("slack_send_message", {
      channel: "rahul",
      message: "Here is a romantic message...",
    }).needsConfirm,
    true
  );

  assert.equal(
    checkNeedsConfirmation("whatsapp_send_message", {
      contact: "pikuu",
      message: "Here is a romantic message...",
    }).needsConfirm,
    true
  );
});

test("messaging exact extractor avoids document delivery commands", () => {
  assert.equal(
    normalizerTest.extractMessagingExactMessage(
      "send latest invoice to client and notify billing on slack",
      "slack"
    ),
    null
  );
});

test("WhatsApp target matching does not treat a typo as an existing shorter contact", () => {
  const chat = whatsappToolTest.pickWhatsAppTargetChat(
    [{ title: "piku", name: "piku", roomId: "!piku:orion.local" }],
    "pikuu"
  );

  assert.equal(chat, null);
});

test("runtime context auto-fills follow-up Telegram messages from a created meeting", () => {
  const resolved = runtimeContextTest.resolveRuntimeStep(
    {
      tool: "telegram_send_message",
      params: {
        contact: "Aradhangini",
        message: "Send an acknowledgment about this meeting",
      },
    },
    [
      {
        tool: "calendar_create",
        status: "done",
        result: {
          title: "testing OrionAI",
          date: "Sun, 29 Mar 2026",
          time: "05:30 PM",
          summary: 'Created "testing OrionAI" on Sun, 29 Mar 2026 at 05:30 PM',
        },
      },
    ],
    {}
  );

  assert.match(resolved.params.message, /testing OrionAI/);
  assert.match(resolved.params.message, /05:30 PM/);
});
