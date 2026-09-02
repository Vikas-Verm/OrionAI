"use strict";

const mongoose = require("mongoose");

const MEMORY_TYPE_VALUES = [
  "weak_area",
  "interview_feedback",
  "behavioral_story",
  "preparation_note",
  "jd_gap",
  "user_preference",
  "progress_summary",
];

const SOURCE_TYPE_VALUES = [
  "practice",
  "interview_prep",
  "resume_match",
  "user_note",
  "application",
  "other",
];

const careerMemorySchema = new mongoose.Schema(
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
    memoryType: {
      type: String,
      enum: MEMORY_TYPE_VALUES,
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    content: { type: String, default: "", trim: true },
    sourceType: { type: String, enum: SOURCE_TYPE_VALUES, default: "other" },
    sourceRef: { type: String, default: "", trim: true },
    confidence: { type: Number, default: 0.8, min: 0, max: 1 },
    userApproved: { type: Boolean, default: false },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

careerMemorySchema.index({ userId: 1, applicationId: 1, updatedAt: -1 });
careerMemorySchema.index({ userId: 1, interviewId: 1, updatedAt: -1 });

const CareerMemory =
  mongoose.models.CareerMemory ||
  mongoose.model("CareerMemory", careerMemorySchema);

CareerMemory.MEMORY_TYPE_VALUES = MEMORY_TYPE_VALUES;
CareerMemory.SOURCE_TYPE_VALUES = SOURCE_TYPE_VALUES;

module.exports = CareerMemory;
