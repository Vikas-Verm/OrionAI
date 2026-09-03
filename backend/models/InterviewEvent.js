"use strict";

const mongoose = require("mongoose");

const ROUND_TYPE_VALUES = [
  "hr",
  "recruiter",
  "technical",
  "coding",
  "system_design",
  "managerial",
  "behavioral",
  "assignment_review",
  "final",
  "other",
  "",
];
const STATUS_VALUES = ["scheduled", "completed", "cancelled", "rescheduled", "archived"];
const PREP_STATUS_VALUES = ["not_started", "in_progress", "ready"];
const SOURCE_APP_VALUES = ["manual", "gmail", "google_calendar", "other"];

const interviewEventSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobApplication",
      default: null,
      index: true,
    },
    company: { type: String, required: true, trim: true },
    role: { type: String, default: "", trim: true },
    scheduledAt: { type: Date, required: true, index: true },
    timezone: { type: String, default: "UTC", trim: true },
    durationMinutes: { type: Number, default: 60, min: 1, max: 24 * 60 },
    roundType: { type: String, enum: ROUND_TYPE_VALUES, default: "" },
    interviewerNames: [{ type: String, trim: true }],
    meetingUrl: { type: String, default: "", trim: true },
    location: { type: String, default: "", trim: true },
    sourceApp: { type: String, enum: SOURCE_APP_VALUES, default: "manual" },
    sourceRef: { type: String, default: "", trim: true },
    prepStatus: { type: String, enum: PREP_STATUS_VALUES, default: "not_started" },
    notes: { type: String, default: "", trim: true },
    status: { type: String, enum: STATUS_VALUES, default: "scheduled", index: true },
    prepPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    prepMeta: { type: mongoose.Schema.Types.Mixed, default: null },
    prepGeneratedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

interviewEventSchema.index(
  { userId: 1, sourceApp: 1, sourceRef: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceApp: { $in: ["gmail", "google_calendar"] },
      sourceRef: { $type: "string", $gt: "" },
    },
  }
);
interviewEventSchema.index({ userId: 1, scheduledAt: 1, status: 1 });

const InterviewEvent =
  mongoose.models.InterviewEvent ||
  mongoose.model("InterviewEvent", interviewEventSchema);

InterviewEvent.ROUND_TYPE_VALUES = ROUND_TYPE_VALUES;
InterviewEvent.STATUS_VALUES = STATUS_VALUES;
InterviewEvent.PREP_STATUS_VALUES = PREP_STATUS_VALUES;
InterviewEvent.SOURCE_APP_VALUES = SOURCE_APP_VALUES;

module.exports = InterviewEvent;
