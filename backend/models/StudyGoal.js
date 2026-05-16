"use strict";

const mongoose = require("mongoose");

const PURPOSE_VALUES = [
  "exam_preparation",
  "interview_preparation",
  "work_upskilling",
  "certification",
  "school_college",
  "language_learning",
  "personal_learning",
  "creative_learning",
  "business_learning",
  "technical_learning",
  "other",
];

const LEVEL_VALUES = ["beginner", "intermediate", "advanced"];
const STATUS_VALUES = ["active", "paused", "completed"];
const LEARNING_STYLE_VALUES = [
  "simple_explanation",
  "deep_explanation",
  "practice_first",
  "notes_first",
  "visual_learning",
  "flashcards",
  "mixed",
];

const studyGoalSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    purpose: {
      type: String,
      enum: PURPOSE_VALUES,
      default: "personal_learning",
    },
    targetDate: { type: Date, default: null },
    dailyTimeMinutes: { type: Number, default: null, min: 0, max: 24 * 60 },
    level: {
      type: String,
      enum: LEVEL_VALUES,
      default: "beginner",
    },
    preferredStudyTime: { type: String, default: "" },
    preferredLearningStyle: {
      type: String,
      enum: ["", ...LEARNING_STYLE_VALUES],
      default: "",
    },
    status: {
      type: String,
      enum: STATUS_VALUES,
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

studyGoalSchema.index({ userId: 1, status: 1, updatedAt: -1 });

const StudyGoal =
  mongoose.models.StudyGoal || mongoose.model("StudyGoal", studyGoalSchema);

StudyGoal.PURPOSE_VALUES = PURPOSE_VALUES;
StudyGoal.LEVEL_VALUES = LEVEL_VALUES;
StudyGoal.STATUS_VALUES = STATUS_VALUES;
StudyGoal.LEARNING_STYLE_VALUES = LEARNING_STYLE_VALUES;

module.exports = StudyGoal;
