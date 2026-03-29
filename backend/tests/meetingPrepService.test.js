"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMeetingPrepPlan,
  formatMeetingPrepSections,
  isMeetingPrepRequest,
  __test: meetingPrepTest,
} = require("../services/meetingPrepService");

test("meeting prep intent detects prep phrasing over plain lookup phrasing", () => {
  assert.equal(
    isMeetingPrepRequest(
      `Prep me for the meeting "Testing OrionAI" starting in 16 min. Summarize what I should know, what I should bring, and what questions I should ask.`
    ),
    true
  );

  assert.equal(isMeetingPrepRequest(`When is my meeting "Testing OrionAI"?`), false);
});

test("meeting prep plan resolves attendee-driven requests into calendar plus prep steps", () => {
  const plan = buildMeetingPrepPlan(
    "I have a meeting with Ashirvad in 20 minutes. Help me get ready.",
    {},
    { baseDate: new Date("2026-03-29T17:00:00+05:30") }
  );

  assert.equal(plan.steps[0].tool, "calendar_get_today");
  assert.equal(plan.steps[1].tool, "meeting_prep");
  assert.equal(plan.steps[1].params.attendeeHint, "Ashirvad");
  assert.equal(plan.steps[1].params.relativeStartMinutes, 20);
});

test("meeting prep plan prefers an event-specific calendar search when the title is known", () => {
  const plan = buildMeetingPrepPlan(
    'Prep me for the meeting "GST Setting Module Handoff" starting in 1h 38m. Summarize what I should know, what I should bring, and what questions I should ask.',
    {},
    { baseDate: new Date("2026-03-29T18:40:00+05:30") }
  );

  assert.equal(plan.steps[0].tool, "calendar_get_events");
  assert.equal(plan.steps[0].params.query, "GST Setting Module Handoff");
  assert.equal(plan.steps[1].tool, "meeting_prep");
  assert.equal(plan.steps[1].params.relativeStartMinutes, 98);
});

test("meeting prep plan keeps today's meeting briefs scoped to today's calendar", () => {
  const plan = buildMeetingPrepPlan(
    "Brief me for today's OrionAI testing call.",
    {},
    { baseDate: new Date("2026-03-29T09:00:00+05:30") }
  );

  assert.equal(plan.steps[0].tool, "calendar_get_events");
  assert.equal(plan.steps[0].params.dateFrom, "2026-03-29");
  assert.equal(plan.steps[0].params.dateTo, "2026-03-29");
  assert.match(plan.steps[1].params.titleHint, /OrionAI testing/i);
});

test("meeting prep fallback formatting always returns the required sections", () => {
  const sections = meetingPrepTest.buildFallbackSections(
    {
      title: "Testing OrionAI",
      start: "2026-03-29T17:16:00+05:30",
      attendees: [{ name: "Ashirvad", email: "ashirvad@example.com" }],
      description: "",
      meet: null,
      location: null,
    },
    {
      emails: [],
      tickets: [],
      chats: [],
      conversations: [],
      missing: ["No related Gmail threads", "No related Jira tickets"],
    },
    {
      reference: {
        titleHint: "Testing OrionAI",
        relativeStartMinutes: 16,
        userQuestion:
          'Prep me for the meeting "Testing OrionAI" starting in 16 min.',
      },
      usedSyntheticEvent: false,
    }
  );

  const summary = formatMeetingPrepSections(sections);

  assert.match(summary, /Meeting summary/);
  assert.match(summary, /What you should know/);
  assert.match(summary, /What you should bring/);
  assert.match(summary, /Questions you should ask/);
  assert.match(summary, /Risks \/ open items/);
  assert.match(summary, /What I could not find/);
});
