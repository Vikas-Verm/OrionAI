"use strict";

const mongoose = require("mongoose");

const studyActivitySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    dateKey: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    timezone: { type: String, default: "Asia/Kolkata" },
    totalMinutes: { type: Number, default: 0, min: 0 },
    topicIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "StudyTopic" }],
    lessonCount: { type: Number, default: 0, min: 0 },
    practiceQuestionCount: { type: Number, default: 0, min: 0 },
    flashcardReviewCount: { type: Number, default: 0, min: 0 },
    revisionCount: { type: Number, default: 0, min: 0 },
    completedPlanItemCount: { type: Number, default: 0, min: 0 },
    noteCount: { type: Number, default: 0, min: 0 },
    activityScore: { type: Number, default: 0, min: 0 },
    activityKeys: [{ type: String }],
  },
  { timestamps: true }
);

studyActivitySchema.index({ userId: 1, dateKey: 1 }, { unique: true });

const StudyActivity =
  mongoose.models.StudyActivity ||
  mongoose.model("StudyActivity", studyActivitySchema);

module.exports = StudyActivity;
