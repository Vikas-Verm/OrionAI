"use strict";

const mongoose = require("mongoose");

const STATUS_VALUES = ["due", "completed", "missed", "snoozed"];

const revisionItemSchema = new mongoose.Schema(
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
    dueAt: { type: Date, required: true, index: true },
    revisionLevel: { type: Number, default: 1, min: 1 },
    status: {
      type: String,
      enum: STATUS_VALUES,
      default: "due",
      index: true,
    },
    completedAt: { type: Date, default: null },
    result: {
      type: String,
      enum: ["", "known", "weak", "partial"],
      default: "",
    },
  },
  { timestamps: true }
);

revisionItemSchema.index({ userId: 1, status: 1, dueAt: 1 });
revisionItemSchema.index({ userId: 1, topicId: 1, status: 1 });

const RevisionItem =
  mongoose.models.RevisionItem ||
  mongoose.model("RevisionItem", revisionItemSchema);

RevisionItem.STATUS_VALUES = STATUS_VALUES;

// Spaced-repetition schedule in days. Index = revisionLevel - 1.
RevisionItem.SPACING_DAYS = [1, 3, 7, 15];

RevisionItem.daysForLevel = function daysForLevel(level) {
  const idx = Math.max(1, Math.floor(Number(level) || 1)) - 1;
  if (idx < this.SPACING_DAYS.length) return this.SPACING_DAYS[idx];
  return this.SPACING_DAYS[this.SPACING_DAYS.length - 1];
};

module.exports = RevisionItem;
