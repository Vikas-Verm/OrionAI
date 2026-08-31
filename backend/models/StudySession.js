"use strict";

const mongoose = require("mongoose");

const STATUS_VALUES = ["planned", "in_progress", "completed", "missed"];
const ITEM_TYPE_VALUES = ["learn", "practice", "revise", "flashcards"];
const ITEM_STATUS_VALUES = [
  "planned",
  "started",
  "completed",
  "skipped",
  "moved",
];

const studySessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudyGoal",
      default: null,
      index: true,
    },
    date: { type: Date, required: true, index: true },
    plannedTopicIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "StudyTopic" },
    ],
    completedTopicIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "StudyTopic" },
    ],
    plannedItems: [
      {
        topicId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "StudyTopic",
          required: true,
        },
        plannedMinutes: { type: Number, default: 0, min: 0 },
        order: { type: Number, default: 0 },
        type: {
          type: String,
          enum: ITEM_TYPE_VALUES,
          default: "learn",
        },
        status: {
          type: String,
          enum: ITEM_STATUS_VALUES,
          default: "planned",
        },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
      },
    ],
    minutesPlanned: { type: Number, default: 0 },
    minutesCompleted: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    status: {
      type: String,
      enum: STATUS_VALUES,
      default: "planned",
    },
  },
  { timestamps: true }
);

studySessionSchema.index({ userId: 1, date: -1 });

const StudySession =
  mongoose.models.StudySession ||
  mongoose.model("StudySession", studySessionSchema);

StudySession.STATUS_VALUES = STATUS_VALUES;
StudySession.ITEM_TYPE_VALUES = ITEM_TYPE_VALUES;
StudySession.ITEM_STATUS_VALUES = ITEM_STATUS_VALUES;

module.exports = StudySession;
