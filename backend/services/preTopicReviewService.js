"use strict";

const crypto = require("crypto");

const PreTopicReview = require("../models/PreTopicReview");
const StudyTopic = require("../models/StudyTopic");
const TopicLesson = require("../models/TopicLesson");
const TopicNote = require("../models/TopicNote");
const PracticeQuestion = require("../models/PracticeQuestion");
const Flashcard = require("../models/Flashcard");
const StudyMemory = require("../models/StudyMemory");

const RECENT_REVIEW_MS = 1000 * 60 * 60 * 18;

function sameText(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function isCorrectAnswer(userAnswer, correctAnswer) {
  if (!correctAnswer) return null;
  return sameText(userAnswer, correctAnswer);
}

async function selectPreviousTopics({ userId, goalId, newTopic } = {}) {
  const previous = await StudyTopic.find({
    userId,
    goalId,
    _id: { $ne: newTopic._id },
    status: { $in: ["completed", "in_progress", "weak", "revision_due"] },
  })
    .sort({ order: 1, lastStudiedAt: -1, updatedAt: -1 })
    .limit(25);

  return previous
    .map((topic) => {
      let score = 0;
      if (topic.status === "weak") score += 4;
      if (topic.status === "revision_due") score += 3;
      if (topic.category && sameText(topic.category, newTopic.category)) score += 3;
      if (topic.subject && sameText(topic.subject, newTopic.subject)) score += 2;
      if (Number.isFinite(topic.order) && Number.isFinite(newTopic.order)) {
        if (topic.order < newTopic.order) score += 2;
        score += Math.max(0, 3 - Math.abs(newTopic.order - topic.order));
      }
      if (topic.status === "completed") score += 1;
      return { topic, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.topic);
}

async function getReviewRecommendation({ userId, topicId } = {}) {
  const newTopic = await StudyTopic.findOne({ _id: topicId, userId });
  if (!newTopic) return null;

  const recentReview = await PreTopicReview.findOne({
    userId,
    newTopicId: newTopic._id,
    status: { $in: ["completed", "skipped"] },
    updatedAt: { $gte: new Date(Date.now() - RECENT_REVIEW_MS) },
  }).lean();
  if (recentReview) {
    return {
      required: false,
      recommended: false,
      reason: "A quick review was already handled recently.",
      previousTopics: [],
      existingReview: recentReview,
      topic: newTopic,
    };
  }

  if (newTopic.status === "in_progress" || newTopic.status === "completed") {
    return {
      required: false,
      recommended: false,
      reason: "This topic is already in progress.",
      previousTopics: [],
      existingReview: null,
      topic: newTopic,
    };
  }

  const previousTopics = await selectPreviousTopics({
    userId,
    goalId: newTopic.goalId,
    newTopic,
  });

  return {
    required: false,
    recommended: previousTopics.length > 0,
    reason: previousTopics.length
      ? `${previousTopics.length} related topic${previousTopics.length === 1 ? "" : "s"} were studied earlier.`
      : "No previous related study data exists yet.",
    previousTopics: previousTopics.map((topic) => ({
      _id: topic._id,
      title: topic.title,
      subject: topic.subject,
      category: topic.category,
      status: topic.status,
    })),
    existingReview: null,
    topic: newTopic,
  };
}

function questionFromSource(topic, source = {}) {
  const questionText =
    source.question ||
    source.front ||
    (source.note
      ? `In one sentence, what should you remember from "${topic.title}"?`
      : `What is one key idea from "${topic.title}"?`);
  const answerText =
    source.correctAnswer ||
    source.back ||
    source.answer ||
    source.note ||
    `Review the key ideas from ${topic.title}.`;
  return {
    questionId: crypto.randomUUID(),
    previousTopicId: topic._id,
    question: String(questionText).slice(0, 600),
    type: source.options?.length ? "mcq" : "short_answer",
    options: Array.isArray(source.options) ? source.options.slice(0, 4) : [],
    correctAnswer: String(answerText).slice(0, 600),
    explanation: String(source.explanation || answerText).slice(0, 800),
    sourceRefs: [String(topic._id)],
  };
}

async function buildQuestionsForTopics({ userId, topics, maxQuestions = 5 } = {}) {
  const questions = [];
  for (const topic of topics) {
    const [lesson, notes, practice, flashcards] = await Promise.all([
      TopicLesson.findOne({ userId, topicId: topic._id }).lean(),
      TopicNote.find({ userId, topicId: topic._id }).sort({ pinned: -1, createdAt: -1 }).limit(2).lean(),
      PracticeQuestion.find({ userId, topicId: topic._id }).sort({ createdAt: -1 }).limit(2).lean(),
      Flashcard.find({ userId, topicId: topic._id }).sort({ updatedAt: -1 }).limit(2).lean(),
    ]);

    if (flashcards[0]) questions.push(questionFromSource(topic, flashcards[0]));
    if (practice[0]) questions.push(questionFromSource(topic, practice[0]));
    if (lesson?.revisionNotes?.[0]) {
      questions.push(
        questionFromSource(topic, {
          question: `Quick recall from "${topic.title}": ${lesson.revisionNotes[0]}`,
          answer: lesson.revisionNotes[0],
        })
      );
    }
    if (notes[0]) {
      questions.push(questionFromSource(topic, { note: notes[0].content }));
    }
    if (questions.length >= maxQuestions) break;
  }

  return questions.slice(0, Math.max(1, Math.min(5, Number(maxQuestions) || 5)));
}

async function generateReview({ userId, topicId, maxQuestions = 5 } = {}) {
  const recommendation = await getReviewRecommendation({ userId, topicId });
  if (!recommendation?.topic) return null;
  if (!recommendation.recommended) return { recommendation, review: null };

  const previousTopics = await StudyTopic.find({
    userId,
    _id: { $in: recommendation.previousTopics.map((t) => t._id) },
  });
  const questions = await buildQuestionsForTopics({
    userId,
    topics: previousTopics,
    maxQuestions,
  });
  if (!questions.length) return { recommendation, review: null };

  const review = await PreTopicReview.create({
    userId,
    goalId: recommendation.topic.goalId,
    newTopicId: recommendation.topic._id,
    reviewedTopicIds: previousTopics.map((topic) => topic._id),
    questions,
    totalQuestions: questions.length,
    status: "pending",
  });
  return { recommendation, review };
}

async function answerReviewQuestion({ userId, reviewId, questionId, userAnswer } = {}) {
  const review = await PreTopicReview.findOne({ _id: reviewId, userId });
  if (!review) return null;
  const question = review.questions.find((q) => q.questionId === questionId);
  if (!question) return review;
  question.userAnswer = String(userAnswer || "").slice(0, 1000);
  question.isCorrect = isCorrectAnswer(question.userAnswer, question.correctAnswer);
  question.confidence = question.isCorrect === true ? 1 : question.isCorrect === false ? 0.35 : null;
  question.answeredAt = new Date();
  review.status = "in_progress";
  review.correctCount = review.questions.filter((q) => q.isCorrect === true).length;
  const answered = review.questions.filter((q) => q.answeredAt).length;
  review.scorePercent =
    answered > 0 ? Math.round((review.correctCount / answered) * 100) : null;
  if (question.isCorrect === false) {
    const topic = await StudyTopic.findOne({ _id: question.previousTopicId, userId });
    const weak = topic?.title || "Previous concept";
    if (!review.weakConcepts.includes(weak)) review.weakConcepts.push(weak);
    if (topic) {
      await StudyMemory.create({
        userId,
        goalId: review.goalId,
        topicId: topic._id,
        memoryType: "weak_area",
        content: `Needs a quick refresh: ${weak}`,
        sourceType: "pre_topic_review",
        sourceRef: String(review._id),
        importance: 2,
        confidence: 0.45,
        userApproved: false,
      });
    }
  }
  await review.save();
  return review;
}

async function completeReview({ userId, reviewId } = {}) {
  const review = await PreTopicReview.findOne({ _id: reviewId, userId });
  if (!review) return null;
  review.status = "completed";
  review.completedAt = new Date();
  review.correctCount = review.questions.filter((q) => q.isCorrect === true).length;
  review.totalQuestions = review.questions.length;
  review.scorePercent =
    review.totalQuestions > 0
      ? Math.round((review.correctCount / review.totalQuestions) * 100)
      : null;
  await review.save();
  return review;
}

async function skipReview({ userId, reviewId } = {}) {
  const review = await PreTopicReview.findOne({ _id: reviewId, userId });
  if (!review) return null;
  review.status = "skipped";
  review.skippedAt = new Date();
  await review.save();
  return review;
}

module.exports = {
  getReviewRecommendation,
  generateReview,
  answerReviewQuestion,
  completeReview,
  skipReview,
  selectPreviousTopics,
};
