"use strict";

const mongoose = require("mongoose");

const SOURCE_BASIS_VALUES = ["ai_generated", "user_material", "mixed"];

const topicLessonSchema = new mongoose.Schema(
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
      unique: true,
    },
    title: { type: String, default: "" },
    explanation: { type: String, default: "" },
    whyItMatters: { type: String, default: "" },
    keyPoints: [{ type: String }],
    examples: [{ type: String }],
    commonMistakes: [{ type: String }],
    revisionNotes: [{ type: String }],
    prerequisites: [{ type: String }],
    importantTerms: [
      {
        term: { type: String, default: "" },
        meaning: { type: String, default: "" },
      },
    ],
    practicalUseCases: [{ type: String }],
    sourceBasis: {
      type: String,
      enum: SOURCE_BASIS_VALUES,
      default: "ai_generated",
    },
    generatedBy: { type: String, default: "orionai" },
  },
  { timestamps: true }
);

const TopicLesson =
  mongoose.models.TopicLesson ||
  mongoose.model("TopicLesson", topicLessonSchema);

TopicLesson.SOURCE_BASIS_VALUES = SOURCE_BASIS_VALUES;

module.exports = TopicLesson;
