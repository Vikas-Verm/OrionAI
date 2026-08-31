"use strict";

const mongoose = require("mongoose");

const STATUS_VALUES = ["pending", "in_progress", "completed", "skipped"];

const preTopicReviewSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudyGoal",
      required: true,
      index: true,
    },
    newTopicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudyTopic",
      required: true,
      index: true,
    },
    reviewedTopicIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "StudyTopic" },
    ],
    questions: [
      {
        questionId: { type: String, required: true },
        previousTopicId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "StudyTopic",
          default: null,
        },
        question: { type: String, required: true },
        type: { type: String, default: "short_answer" },
        options: [{ type: String }],
        correctAnswer: { type: String, default: "" },
        explanation: { type: String, default: "" },
        sourceRefs: [{ type: String }],
        userAnswer: { type: String, default: "" },
        isCorrect: { type: Boolean, default: null },
        confidence: { type: Number, default: null },
        answeredAt: { type: Date, default: null },
      },
    ],
    correctCount: { type: Number, default: 0, min: 0 },
    totalQuestions: { type: Number, default: 0, min: 0 },
    scorePercent: { type: Number, default: null },
    weakConcepts: [{ type: String }],
    status: {
      type: String,
      enum: STATUS_VALUES,
      default: "pending",
      index: true,
    },
    skippedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

preTopicReviewSchema.index({ userId: 1, newTopicId: 1, createdAt: -1 });

const PreTopicReview =
  mongoose.models.PreTopicReview ||
  mongoose.model("PreTopicReview", preTopicReviewSchema);

PreTopicReview.STATUS_VALUES = STATUS_VALUES;

module.exports = PreTopicReview;
