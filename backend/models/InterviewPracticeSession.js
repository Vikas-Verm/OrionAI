"use strict";

const mongoose = require("mongoose");

const TYPE_VALUES = ["hr", "technical", "system_design", "behavioral", "role_specific", "coding", "other"];
const STATUS_VALUES = ["active", "completed", "archived"];

const answerSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    userAnswer: { type: String, default: "", trim: true },
    answerSource: { type: String, enum: ["text", "audio", "video"], default: "text" },
    answerSourceRef: { type: String, default: "", trim: true },
    skipped: { type: Boolean, default: false },
    feedback: {
      good: [{ type: String, trim: true }],
      missing: [{ type: String, trim: true }],
      betterStructure: { type: String, default: "", trim: true },
      suggestedStrongerAnswer: { type: String, default: "", trim: true },
    },
    answeredAt: { type: Date, default: null },
  },
  { _id: false }
);

const interviewPracticeSessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobApplication",
      default: null,
      index: true,
    },
    interviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InterviewEvent",
      default: null,
      index: true,
    },
    company: { type: String, default: "", trim: true },
    role: { type: String, default: "", trim: true },
    type: { type: String, enum: TYPE_VALUES, default: "role_specific" },
    questions: [answerSchema],
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    summary: { type: String, default: "", trim: true },
    weakAreas: [{ type: String, trim: true }],
    status: { type: String, enum: STATUS_VALUES, default: "active", index: true },
  },
  { timestamps: true }
);

interviewPracticeSessionSchema.index({ userId: 1, interviewId: 1, updatedAt: -1 });

const InterviewPracticeSession =
  mongoose.models.InterviewPracticeSession ||
  mongoose.model("InterviewPracticeSession", interviewPracticeSessionSchema);

InterviewPracticeSession.TYPE_VALUES = TYPE_VALUES;
InterviewPracticeSession.STATUS_VALUES = STATUS_VALUES;

module.exports = InterviewPracticeSession;
