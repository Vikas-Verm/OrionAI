"use strict";

const mongoose = require("mongoose");

const TYPE_VALUES = [
  "concept",
  "mcq",
  "true_false",
  "fill_blank",
  "short_answer",
  "scenario",
  "practical",
  "problem_solving",
  "coding",
  "other",
];
const DIFFICULTY_VALUES = ["easy", "medium", "hard"];
const SOURCE_VALUES = ["generated", "material"];

const practiceQuestionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudyGoal",
      required: true,
      index: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudyTopic",
      required: true,
      index: true,
    },
    question: { type: String, required: true },
    type: { type: String, enum: TYPE_VALUES, default: "concept" },
    options: [{ type: String }],
    correctAnswer: { type: String, default: "" },
    explanation: { type: String, default: "" },
    difficulty: {
      type: String,
      enum: DIFFICULTY_VALUES,
      default: "medium",
    },
    source: { type: String, enum: SOURCE_VALUES, default: "generated" },
    sourceType: { type: String, default: "general" },
    sourceRefs: [{ type: String }],
    userAnswer: { type: String, default: "" },
    userMarkedWeak: { type: Boolean, default: false },
    answeredCorrectly: { type: Boolean, default: null },
  },
  { timestamps: true }
);

practiceQuestionSchema.index({ userId: 1, topicId: 1, createdAt: -1 });

const PracticeQuestion =
  mongoose.models.PracticeQuestion ||
  mongoose.model("PracticeQuestion", practiceQuestionSchema);

PracticeQuestion.TYPE_VALUES = TYPE_VALUES;
PracticeQuestion.DIFFICULTY_VALUES = DIFFICULTY_VALUES;
PracticeQuestion.SOURCE_VALUES = SOURCE_VALUES;

module.exports = PracticeQuestion;
