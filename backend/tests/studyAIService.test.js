"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const studyAIService = require("../services/studyAIService");

const {
  extractJson,
  normalizeSuggestedTopic,
  normalizeQuestion,
  normalizeFlashcard,
  normalizeTitleKey,
  normalizeDoubtReply,
} = studyAIService._internal;

test("extractJson parses plain JSON", () => {
  const parsed = extractJson('{"a":1,"b":"two"}');
  assert.deepEqual(parsed, { a: 1, b: "two" });
});

test("extractJson strips ```json fences", () => {
  const wrapped = '```json\n{"hello":"world"}\n```';
  assert.deepEqual(extractJson(wrapped), { hello: "world" });
});

test("extractJson finds JSON inside surrounding prose", () => {
  const messy = 'Sure! Here is the JSON:\n{"x":42}\nLet me know if you need more.';
  assert.deepEqual(extractJson(messy), { x: 42 });
});

test("extractJson throws on non-JSON content", () => {
  assert.throws(() => extractJson("definitely not json"));
});

test("normalizeSuggestedTopic clamps fields and falls back to safe defaults", () => {
  const out = normalizeSuggestedTopic({
    title: "  React Hooks ",
    subject: "Frontend",
    difficulty: "expert",
    estimatedMinutes: 9999,
    reason: " Lots of mistakes happen here ",
  });
  assert.equal(out.title, "React Hooks");
  assert.equal(out.subject, "Frontend");
  assert.equal(out.difficulty, "medium", "unknown difficulty falls back to medium");
  assert.equal(out.estimatedMinutes, 180, "minutes are capped at 180");
  assert.equal(out.reason, "Lots of mistakes happen here");
});

test("normalizeSuggestedTopic rejects entries without a title", () => {
  assert.equal(normalizeSuggestedTopic({ title: "  " }), null);
  assert.equal(normalizeSuggestedTopic(null), null);
});

test("normalizeQuestion forces sensible options per question type", () => {
  const mcq = normalizeQuestion({
    question: "Pick one",
    type: "mcq",
    options: ["A", "B", "C"],
    correctAnswer: "A",
    explanation: "because",
    difficulty: "hard",
  });
  assert.equal(mcq.type, "mcq");
  assert.deepEqual(mcq.options, ["A", "B", "C"]);

  const tf = normalizeQuestion({
    question: "Is this true?",
    type: "true_false",
    options: ["Yes", "No"],
    correctAnswer: "True",
  });
  assert.deepEqual(tf.options, ["True", "False"], "true_false always normalizes options");

  const concept = normalizeQuestion({
    question: "Explain X",
    type: "concept",
    options: ["should be dropped"],
  });
  assert.deepEqual(concept.options, [], "concept questions have no options");
});

test("normalizeTitleKey collapses casing and punctuation for dedupe", () => {
  assert.equal(normalizeTitleKey("React Hooks!"), "react hooks");
  assert.equal(normalizeTitleKey("  React   Hooks  "), "react hooks");
  assert.equal(normalizeTitleKey(""), "");
  assert.equal(normalizeTitleKey(null), "");
});

test("normalizeDoubtReply parses structured JSON from the LLM", () => {
  const raw = JSON.stringify({
    answerType: "Based on attached material",
    explanation: "Go is generally faster because...",
    usedAttachedMaterial: true,
    followupSuggestion: "Want a small Go program?",
  });
  const out = normalizeDoubtReply(raw, { hasLesson: true });
  assert.equal(out.answerType, "Based on attached material");
  assert.equal(out.explanation, "Go is generally faster because...");
  assert.equal(out.usedAttachedMaterial, true);
  assert.equal(out.followupSuggestion, "Want a small Go program?");
});

test("normalizeDoubtReply ignores usedAttachedMaterial when no lesson exists", () => {
  const raw = JSON.stringify({
    explanation: "Plain answer",
    usedAttachedMaterial: true,
    followupSuggestion: "",
  });
  const out = normalizeDoubtReply(raw, { hasLesson: false });
  assert.equal(out.usedAttachedMaterial, false);
});

test("normalizeDoubtReply falls back to plain prose when JSON parsing fails", () => {
  const out = normalizeDoubtReply(
    "Sure! Here is the answer in plain text, no JSON."
  );
  assert.equal(out.answerType, "OrionAI explanation");
  assert.equal(out.explanation, "Sure! Here is the answer in plain text, no JSON.");
  assert.equal(out.usedAttachedMaterial, false);
  assert.equal(out.followupSuggestion, "");
});

test("normalizeDoubtReply strips ```json fences when present", () => {
  const raw = '```json\n{"answerType":"OrionAI explanation","explanation":"X","usedAttachedMaterial":false,"followupSuggestion":""}\n```';
  const out = normalizeDoubtReply(raw);
  assert.equal(out.explanation, "X");
});

test("normalizeDoubtReply tolerates empty / non-string input", () => {
  const out = normalizeDoubtReply("");
  assert.equal(out.explanation, "");
  const out2 = normalizeDoubtReply(null);
  assert.equal(out2.explanation, "");
});

test("normalizeFlashcard requires front and back content", () => {
  assert.equal(normalizeFlashcard({ front: "Q", back: "" }), null);
  assert.equal(normalizeFlashcard({ front: "", back: "A" }), null);
  const card = normalizeFlashcard({ front: "What is X?", back: "An answer" });
  assert.equal(card.front, "What is X?");
  assert.equal(card.back, "An answer");
  assert.equal(card.difficulty, "medium");
});
