import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./CareerInterviewsPage.vue", import.meta.url), "utf8");

test("Resume Match is a dedicated top-level workspace", () => {
  assert.match(source, /\{ id: "resume-match", label: "Resume Match" \}/);
  assert.match(source, /activeTab === 'resume-match'/);
  assert.doesNotMatch(source, /<section v-if="activeTab === 'documents'"[^>]*>\s*<div[^>]*>\s*<div>\s*<h2>Resume Match<\/h2>/s);
});

test("Resume Match renders structured evidence and collapsible sections", () => {
  assert.match(source, /Match summary/);
  assert.match(source, /Strong Matches/);
  assert.match(source, /Partial Matches/);
  assert.match(source, /Missing Evidence/);
  assert.match(source, /source-badge--jd/);
  assert.match(source, /source-badge--resume/);
  assert.match(source, /source-badge--orion/);
  assert.match(source, /visibleMatchItems\('strongMatches'\)/);
  assert.match(source, /Show all/);
});

test("Prepare selection and generation are separate actions", () => {
  const selectStart = source.indexOf("function prepareInterview(interview)");
  const generateStart = source.indexOf("async function generateInterviewPrep()");
  const practiceStart = source.indexOf("async function startPractice(interview)");
  const selectBody = source.slice(selectStart, generateStart);
  const generateBody = source.slice(generateStart, practiceStart);

  assert.ok(selectStart >= 0 && generateStart > selectStart);
  assert.doesNotMatch(selectBody, /careerAPI\.prepareInterview/);
  assert.match(selectBody, /interview\.prepPlan/);
  assert.match(selectBody, /interview\.prepMeta/);
  assert.match(generateBody, /careerAPI\.prepareInterview/);
  assert.match(generateBody, /careerAPI\.prepareApplication/);
  assert.match(source, /Refresh preparation/);
  assert.match(source, /Preparation may be outdated/);
});

test("Practice advances one question at a time with persisted feedback", () => {
  assert.match(source, /practiceQuestionIndex/);
  assert.match(source, /Submit Answer/);
  assert.match(source, />Skip</);
  assert.match(source, /Next Question/);
  assert.match(source, /v-if="hasPracticeFeedback" class="feedback-box"/);
  assert.match(source, /currentPracticeQuestion\.value\?\.feedback/);
});

test("Career layouts share section, card, and action spacing tokens", () => {
  assert.match(source, /--career-section-gap: 28px/);
  assert.match(source, /--career-card-gap: 14px/);
  assert.match(source, /--career-action-gap: 10px/);
  assert.match(source, /gap: var\(--career-section-gap\)/);
  assert.match(source, /@media \(max-width: 640px\)/);
});
