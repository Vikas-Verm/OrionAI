"use strict";

const mongoose = require("mongoose");

const DIFFICULTY_VALUES = ["easy", "medium", "hard"];
const STATUS_VALUES = [
  "not_started",
  "in_progress",
  "completed",
  "weak",
  "revision_due",
  "archived",
];

const studyTopicSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudyGoal",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    subject: { type: String, default: "", trim: true },
    category: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    difficulty: {
      type: String,
      enum: DIFFICULTY_VALUES,
      default: "medium",
    },
    status: {
      type: String,
      enum: STATUS_VALUES,
      default: "not_started",
      index: true,
    },
    estimatedMinutes: { type: Number, default: null, min: 0 },
    lastStudiedAt: { type: Date, default: null },
    nextRevisionAt: { type: Date, default: null },
    order: { type: Number, default: 0 },
    tags: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

studyTopicSchema.index({ userId: 1, goalId: 1, order: 1 });
studyTopicSchema.index({ userId: 1, status: 1 });

const StudyTopic =
  mongoose.models.StudyTopic || mongoose.model("StudyTopic", studyTopicSchema);

StudyTopic.DIFFICULTY_VALUES = DIFFICULTY_VALUES;
StudyTopic.STATUS_VALUES = STATUS_VALUES;

module.exports = StudyTopic;
