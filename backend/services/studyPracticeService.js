"use strict";

const studyAIService = require("./studyAIService");

const OBJECTIVE_TYPES = new Set(["mcq", "true_false", "fill_blank"]);
const SUBJECTIVE_TYPES = new Set([
  "concept",
  "conceptual",
  "explain",
  "short_answer",
  "scenario",
  "practical",
  "problem_solving",
  "coding",
  "other",
]);
const LOW_CONFIDENCE_THRESHOLD = 0.65;
const WEAK_MEMORY_CONFIDENCE_THRESHOLD = 0.75;

function normalizeAnswer(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s"'`.,;:!?()[\]{}]+|[\s"'`.,;:!?()[\]{}]+$/g, "");
}

function cleanList(value, max = 6) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalizeConfidence(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num > 1 && num <= 100) return Math.max(0, Math.min(1, num / 100));
  return Math.max(0, Math.min(1, num));
}

function isObjectiveQuestion(question = {}) {
  return OBJECTIVE_TYPES.has(normalizeAnswer(question.type));
}

function isSubjectiveQuestion(question = {}) {
  const type = normalizeAnswer(question.type) || "concept";
  return SUBJECTIVE_TYPES.has(type) || !isObjectiveQuestion(question);
}

function buildGrade({
  verdict = "needs_review",
  confidence = 0,
  feedback = "",
  missingPoints = [],
  strongPoints = [],
  gradedBy = "fallback",
  error = "",
} = {}) {
  const normalizedVerdict = [
    "correct",
    "partially_correct",
    "incorrect",
    "needs_review",
  ].includes(verdict)
    ? verdict
    : "needs_review";
  const normalizedConfidence = normalizeConfidence(confidence);
  let answeredCorrectly = null;
  if (normalizedVerdict === "correct") answeredCorrectly = true;
  if (normalizedVerdict === "incorrect") answeredCorrectly = false;
  const shouldCreateWeakMemory =
    (normalizedVerdict === "incorrect" ||
      normalizedVerdict === "partially_correct") &&
    normalizedConfidence >= WEAK_MEMORY_CONFIDENCE_THRESHOLD;

  return {
    answeredCorrectly,
    shouldCreateWeakMemory,
    grading: {
      verdict: normalizedVerdict,
      confidence: normalizedConfidence,
      feedback: String(feedback || "").trim().slice(0, 900),
      missingPoints: cleanList(missingPoints),
      strongPoints: cleanList(strongPoints),
      gradedBy,
      gradedAt: new Date(),
      error: String(error || "").trim().slice(0, 300),
    },
  };
}

function gradeObjectivePracticeAnswer(question = {}, userAnswer = "") {
  const expected = normalizeAnswer(question.correctAnswer);
  const actual = normalizeAnswer(userAnswer);

  if (!actual) {
    return buildGrade({
      verdict: "needs_review",
      feedback: "Add an answer before checking this question.",
      gradedBy: "deterministic",
    });
  }

  if (!expected) {
    return buildGrade({
      verdict: "needs_review",
      feedback: "This question does not have an answer key to grade against.",
      gradedBy: "deterministic",
    });
  }

  if (actual === expected) {
    return buildGrade({
      verdict: "correct",
      confidence: 1,
      feedback: "Correct.",
      strongPoints: ["Matched the expected answer."],
      gradedBy: "deterministic",
    });
  }

  return buildGrade({
    verdict: "incorrect",
    confidence: 1,
    feedback: "Not quite. Review the explanation and try again.",
    missingPoints: ["The selected answer did not match the answer key."],
    gradedBy: "deterministic",
  });
}

function coerceSemanticGrade(aiGrade = {}) {
  const confidence = normalizeConfidence(aiGrade.confidence);
  let verdict = String(aiGrade.verdict || "needs_review")
    .trim()
    .toLowerCase();
  if (
    !["correct", "partially_correct", "incorrect", "needs_review"].includes(
      verdict
    )
  ) {
    verdict = "needs_review";
  }
  if (confidence < LOW_CONFIDENCE_THRESHOLD) {
    verdict = "needs_review";
  }
  const feedback =
    verdict === "needs_review" && !aiGrade.feedback
      ? "Couldn’t confidently grade this answer."
      : aiGrade.feedback;

  return buildGrade({
    verdict,
    confidence,
    feedback,
    missingPoints: aiGrade.missingPoints,
    strongPoints: aiGrade.strongPoints,
    gradedBy: "orionai",
  });
}

async function gradeSubjectivePracticeAnswer({
  question = {},
  userAnswer = "",
  goal = null,
  topic = null,
  aiGrader = studyAIService.gradeSubjectivePracticeAnswer,
} = {}) {
  const actual = normalizeAnswer(userAnswer);
  if (!actual) {
    return buildGrade({
      verdict: "needs_review",
      feedback: "Add an answer before checking this question.",
      gradedBy: "fallback",
    });
  }
  if (!question.correctAnswer && !question.explanation) {
    return buildGrade({
      verdict: "needs_review",
      feedback: "This question needs review because no answer guidance is saved.",
      gradedBy: "fallback",
    });
  }

  try {
    const aiGrade = await aiGrader({ goal, topic, question, userAnswer });
    return coerceSemanticGrade(aiGrade);
  } catch (err) {
    return buildGrade({
      verdict: "needs_review",
      confidence: 0,
      feedback: "Couldn’t confidently grade this answer.",
      gradedBy: "fallback",
      error: err?.message || "AI grading failed",
    });
  }
}

async function gradePracticeAnswer({
  question = {},
  userAnswer = "",
  goal = null,
  topic = null,
  aiGrader,
} = {}) {
  if (isObjectiveQuestion(question)) {
    return gradeObjectivePracticeAnswer(question, userAnswer);
  }
  return gradeSubjectivePracticeAnswer({
    question,
    userAnswer,
    goal,
    topic,
    aiGrader,
  });
}

module.exports = {
  OBJECTIVE_TYPES,
  SUBJECTIVE_TYPES,
  LOW_CONFIDENCE_THRESHOLD,
  WEAK_MEMORY_CONFIDENCE_THRESHOLD,
  buildGrade,
  coerceSemanticGrade,
  gradePracticeAnswer,
  gradeObjectivePracticeAnswer,
  gradeSubjectivePracticeAnswer,
  isObjectiveQuestion,
  isSubjectiveQuestion,
  normalizeAnswer,
};
