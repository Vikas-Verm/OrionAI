"use strict";

const mongoose = require("mongoose");

const MEMORY_TYPE_VALUES = [
  "preference",
  "weak_area",
  "misconception",
  "important_note",
  "progress_summary",
  "material_fact",
  "learning_context",
];
const SOURCE_TYPE_VALUES = [
  "user",
  "material",
  "orionai_inference",
  "practice",
  "flashcard",
  "revision",
  "note",
  "pre_topic_review",
];

const studyMemorySchema = new mongoose.Schema(
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
    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudyMaterial",
      default: null,
      index: true,
    },
    memoryType: {
      type: String,
      enum: MEMORY_TYPE_VALUES,
      required: true,
      index: true,
    },
    content: { type: String, required: true, trim: true },
    sourceType: {
      type: String,
      enum: SOURCE_TYPE_VALUES,
      default: "user",
    },
    sourceRef: { type: String, default: "", trim: true },
    importance: { type: Number, default: 1, min: 1, max: 5 },
    confidence: { type: Number, default: 1, min: 0, max: 1 },
    userApproved: { type: Boolean, default: false },
    dismissed: { type: Boolean, default: false, index: true },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

studyMemorySchema.index({ userId: 1, goalId: 1, topicId: 1, dismissed: 1 });

const StudyMemory =
  mongoose.models.StudyMemory ||
  mongoose.model("StudyMemory", studyMemorySchema);

StudyMemory.MEMORY_TYPE_VALUES = MEMORY_TYPE_VALUES;
StudyMemory.SOURCE_TYPE_VALUES = SOURCE_TYPE_VALUES;

module.exports = StudyMemory;
