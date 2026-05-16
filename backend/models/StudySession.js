"use strict";

const mongoose = require("mongoose");

const STATUS_VALUES = ["planned", "completed", "missed"];

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

module.exports = StudySession;
