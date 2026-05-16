"use strict";

const mongoose = require("mongoose");

const STATUS_VALUES = ["learning", "known", "weak"];
const DIFFICULTY_VALUES = ["easy", "medium", "hard"];

const flashcardSchema = new mongoose.Schema(
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
    front: { type: String, required: true },
    back: { type: String, required: true },
    difficulty: {
      type: String,
      enum: DIFFICULTY_VALUES,
      default: "medium",
    },
    status: {
      type: String,
      enum: STATUS_VALUES,
      default: "learning",
    },
    nextReviewAt: { type: Date, default: null },
    reviewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

flashcardSchema.index({ userId: 1, topicId: 1, status: 1 });

const Flashcard =
  mongoose.models.Flashcard || mongoose.model("Flashcard", flashcardSchema);

Flashcard.STATUS_VALUES = STATUS_VALUES;
Flashcard.DIFFICULTY_VALUES = DIFFICULTY_VALUES;

module.exports = Flashcard;
