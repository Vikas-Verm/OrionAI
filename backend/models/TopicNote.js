"use strict";

const mongoose = require("mongoose");

const SOURCE_VALUES = [
  "manual",
  "ai_saved",
  "mistake",
  "key_idea",
  "example",
  "other",
];

const topicNoteSchema = new mongoose.Schema(
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
    content: { type: String, required: true },
    source: { type: String, enum: SOURCE_VALUES, default: "manual" },
    sourceMaterialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudyMaterial",
      default: null,
    },
    pinned: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

topicNoteSchema.index({ userId: 1, topicId: 1, createdAt: -1 });

const TopicNote =
  mongoose.models.TopicNote || mongoose.model("TopicNote", topicNoteSchema);

TopicNote.SOURCE_VALUES = SOURCE_VALUES;

module.exports = TopicNote;
