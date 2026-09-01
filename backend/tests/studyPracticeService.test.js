"use strict";

const { test, mock } = require("node:test");
const assert = require("node:assert/strict");

const PracticeQuestion = require("../models/PracticeQuestion");
const {
  gradeObjectivePracticeAnswer,
  gradePracticeAnswer,
  normalizeAnswer,
} = require("../services/studyPracticeService");
const { checkPracticeQuestion } = require("../controllers/studyController");

test("normalizeAnswer ignores casing, edge punctuation, and extra spaces", () => {
  assert.equal(normalizeAnswer("  LEFT   POINTER. "), "left pointer");
  assert.equal(normalizeAnswer("\"True\""), "true");
});

test("objective answers remain deterministic", async () => {
  const correct = gradeObjectivePracticeAnswer(
    { type: "mcq", correctAnswer: "Move the left pointer" },
    " move the left pointer "
  );
  assert.equal(correct.answeredCorrectly, true);
  assert.equal(correct.grading.verdict, "correct");
  assert.equal(correct.grading.gradedBy, "deterministic");

  const wrong = await gradePracticeAnswer({
    question: { type: "true_false", correctAnswer: "true" },
    userAnswer: "false",
    aiGrader: async () => {
      throw new Error("objective grading should not call AI");
    },
  });
  assert.equal(wrong.answeredCorrectly, false);
  assert.equal(wrong.shouldCreateWeakMemory, true);
  assert.equal(wrong.grading.verdict, "incorrect");
  assert.equal(wrong.grading.gradedBy, "deterministic");
});

test("semantic equivalent answer is not marked incorrect", async () => {
  const result = await gradePracticeAnswer({
    question: {
      type: "concept",
      question: "What should you do if a two-pointer sum is too small?",
      correctAnswer: "Move the left pointer forward.",
      explanation: "Increasing the left pointer raises the sum in a sorted array.",
    },
    userAnswer: "Increase left so the pair sum can get larger.",
    aiGrader: async () => ({
      verdict: "correct",
      confidence: 0.91,
      feedback: "Correct. You captured the pointer movement and the reason.",
      missingPoints: [],
      strongPoints: ["Moves the left pointer", "Explains the sum increase"],
    }),
  });

  assert.equal(result.answeredCorrectly, true);
  assert.equal(result.shouldCreateWeakMemory, false);
  assert.equal(result.grading.verdict, "correct");
  assert.equal(result.grading.gradedBy, "orionai");
});

test("partially correct subjective answer can create a weak-concept signal", async () => {
  const result = await gradePracticeAnswer({
    question: {
      type: "scenario",
      question: "Explain both two-pointer adjustment rules.",
      correctAnswer:
        "Move left when the sum is too small and move right when it is too large.",
      explanation: "Both adjustments use sorted order to narrow the search.",
    },
    userAnswer: "If the sum is small, move left forward.",
    aiGrader: async () => ({
      verdict: "partially_correct",
      confidence: 0.86,
      feedback: "Almost there. You got the small-sum case but missed the large-sum case.",
      missingPoints: ["Move the right pointer when the sum is too large"],
      strongPoints: ["Correct small-sum adjustment"],
    }),
  });

  assert.equal(result.answeredCorrectly, null);
  assert.equal(result.shouldCreateWeakMemory, true);
  assert.equal(result.grading.verdict, "partially_correct");
});

test("clearly wrong conceptual answer is marked incorrect semantically", async () => {
  const result = await gradePracticeAnswer({
    question: {
      type: "short_answer",
      question: "How does binary search choose the next search interval?",
      correctAnswer: "It compares the middle element and discards the impossible half.",
      explanation: "The sorted order proves which half cannot contain the target.",
    },
    userAnswer: "It checks every element from left to right.",
    aiGrader: async () => ({
      verdict: "incorrect",
      confidence: 0.93,
      feedback: "Needs improvement. That describes linear search, not binary search.",
      missingPoints: ["Compare the middle element", "Discard half the range"],
      strongPoints: [],
    }),
  });

  assert.equal(result.answeredCorrectly, false);
  assert.equal(result.shouldCreateWeakMemory, true);
  assert.equal(result.grading.verdict, "incorrect");
});

test("low confidence semantic grading becomes needs_review", async () => {
  const result = await gradePracticeAnswer({
    question: {
      type: "practical",
      question: "Why use spaced repetition?",
      correctAnswer: "It reviews material over increasing intervals to strengthen recall.",
      explanation: "The schedule fights forgetting while reducing unnecessary review.",
    },
    userAnswer: "Because it helps.",
    aiGrader: async () => ({
      verdict: "partially_correct",
      confidence: 0.42,
      feedback: "The answer is too vague to grade confidently.",
      missingPoints: ["Increasing intervals", "Recall strengthening"],
      strongPoints: ["Mentions benefit"],
    }),
  });

  assert.equal(result.answeredCorrectly, null);
  assert.equal(result.shouldCreateWeakMemory, false);
  assert.equal(result.grading.verdict, "needs_review");
});

test("AI failure falls back to needs_review", async () => {
  const result = await gradePracticeAnswer({
    question: {
      type: "concept",
      question: "What is a stack?",
      correctAnswer: "A last-in, first-out data structure.",
      explanation: "The newest pushed item is popped first.",
    },
    userAnswer: "The last item added comes out first.",
    aiGrader: async () => {
      throw new Error("provider unavailable");
    },
  });

  assert.equal(result.answeredCorrectly, null);
  assert.equal(result.shouldCreateWeakMemory, false);
  assert.equal(result.grading.verdict, "needs_review");
  assert.equal(result.grading.gradedBy, "fallback");
});

test("spelling differences do not automatically fail a conceptual answer", async () => {
  const result = await gradePracticeAnswer({
    question: {
      type: "conceptual",
      question: "What is encapsulation?",
      correctAnswer: "Bundling data with methods and controlling access to internals.",
      explanation: "Encapsulation exposes a stable interface and hides implementation details.",
    },
    userAnswer: "Bundeling data and methods, hiding internel details behind public methods.",
    aiGrader: async () => ({
      verdict: "correct",
      confidence: 0.88,
      feedback: "Correct. The spelling is rough, but the concept is there.",
      missingPoints: [],
      strongPoints: ["Data and methods together", "Hides internals"],
    }),
  });

  assert.equal(result.answeredCorrectly, true);
  assert.equal(result.shouldCreateWeakMemory, false);
});

test("needs_review does not create false weak-memory signal", async () => {
  const result = await gradePracticeAnswer({
    question: {
      type: "explain",
      question: "Explain memoization.",
      correctAnswer: "Cache repeated subproblem results.",
      explanation: "Memoization avoids recomputing the same result.",
    },
    userAnswer: "Saving answers maybe?",
    aiGrader: async () => ({
      verdict: "needs_review",
      confidence: 0.71,
      feedback: "Couldn’t confidently grade this answer.",
      missingPoints: [],
      strongPoints: [],
    }),
  });

  assert.equal(result.answeredCorrectly, null);
  assert.equal(result.shouldCreateWeakMemory, false);
  assert.equal(result.grading.verdict, "needs_review");
});

test("unauthorized user cannot grade another user's question", async () => {
  const findOne = mock.method(PracticeQuestion, "findOne", async (query) => {
    assert.equal(query.userId, "intruder");
    return null;
  });
  const req = {
    user: { username: "intruder" },
    params: { questionId: "64f000000000000000000001" },
    body: { answer: "my answer" },
    query: {},
    headers: {},
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  await checkPracticeQuestion(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Question not found" });
  assert.equal(findOne.mock.callCount(), 1);
});
