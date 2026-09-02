"use strict";

const mongoose = require("mongoose");

const STATUS_VALUES = [
  "interested",
  "preparing",
  "applied",
  "hr_screening",
  "interviewing",
  "assignment",
  "offer",
  "rejected",
  "withdrawn",
  "archived",
];

const WORK_MODE_VALUES = ["", "remote", "hybrid", "onsite"];
const EMPLOYMENT_TYPE_VALUES = [
  "",
  "full_time",
  "part_time",
  "contract",
  "internship",
  "freelance",
  "temporary",
  "other",
];
const SOURCE_APP_VALUES = ["manual", "gmail", "google_calendar", "google_docs", "google_drive", "other"];

const jobApplicationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    company: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    status: { type: String, enum: STATUS_VALUES, default: "interested", index: true },
    source: { type: String, default: "", trim: true },
    sourceUrl: { type: String, default: "", trim: true },
    location: { type: String, default: "", trim: true },
    workMode: { type: String, enum: WORK_MODE_VALUES, default: "" },
    employmentType: { type: String, enum: EMPLOYMENT_TYPE_VALUES, default: "" },
    appliedAt: { type: Date, default: null },
    nextFollowUpAt: { type: Date, default: null, index: true },
    salaryText: { type: String, default: "", trim: true },
    jobDescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CareerDocument",
      default: null,
      index: true,
    },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CareerDocument",
      default: null,
      index: true,
    },
    sourceApp: { type: String, enum: SOURCE_APP_VALUES, default: "manual" },
    sourceRef: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },
    tags: [{ type: String, trim: true }],
    archivedAt: { type: Date, default: null },
    followUpHandledAt: { type: Date, default: null },
    followUpSnoozedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

jobApplicationSchema.index({ userId: 1, status: 1, updatedAt: -1 });
jobApplicationSchema.index({ userId: 1, company: 1, role: 1 });

const JobApplication =
  mongoose.models.JobApplication ||
  mongoose.model("JobApplication", jobApplicationSchema);

JobApplication.STATUS_VALUES = STATUS_VALUES;
JobApplication.WORK_MODE_VALUES = WORK_MODE_VALUES;
JobApplication.EMPLOYMENT_TYPE_VALUES = EMPLOYMENT_TYPE_VALUES;
JobApplication.SOURCE_APP_VALUES = SOURCE_APP_VALUES;

module.exports = JobApplication;
