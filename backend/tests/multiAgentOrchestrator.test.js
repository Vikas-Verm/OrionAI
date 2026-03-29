"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: orchestratorTest,
} = require("../services/multiAgentOrchestrator");

test("orchestrator stays off for dependent multi-app write workflows", () => {
  assert.equal(
    orchestratorTest.shouldUseOrchestrator(
      "Schedule a meeting with vikasverma@poshn.co for testing OrionAI at 5:30 PM, and send an acknowledgment about this meeting to Aradhangini on Telegram."
    ),
    false
  );
});

test("orchestrator stays on for broad cross-app digest workflows", () => {
  assert.equal(
    orchestratorTest.shouldUseOrchestrator(
      "Check my unread Slack, Gmail, Telegram, and Calendar updates today and summarize everything across all my apps."
    ),
    true
  );
});

test("resolveAgentContext injects prior summaries into later dependent steps", () => {
  const resolved = orchestratorTest.resolveAgentContext(
    [
      {
        tool: "telegram_send_message",
        params: { message: "{{calendar_agent_summary}}" },
      },
    ],
    {
      calendar_agent: {
        ok: true,
        results: [
          {
            tool: "calendar_create",
            status: "done",
            result: { summary: "Meeting created for 5:30 PM" },
          },
        ],
      },
    }
  );

  assert.equal(resolved[0].params.message, "Meeting created for 5:30 PM");
});
