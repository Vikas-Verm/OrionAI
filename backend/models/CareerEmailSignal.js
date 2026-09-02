"use strict";

const mongoose = require("mongoose");

const CATEGORY_VALUES = [
  "application_received",
  "recruiter_outreach",
  "hr_screening",
  "interview_invite",
  "assessment",
  "coding_assignment",
  "reschedule",
  "rejection",
  "offer",
  "hr_follow_up",
  "other",
];
const STATUS_VALUES = ["suggested", "accepted", "ignored"];

const careerEmailSignalSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    gmailMessageId: { type: String, required: true, trim: true },
    gmailThreadId: { type: String, default: "", trim: true },
    subject: { type: String, default: "", trim: true },
    from: { type: String, default: "", trim: true },
    snippet: { type: String, default: "", trim: true },
    category: { type: String, enum: CATEGORY_VALUES, default: "other" },
    confidence: { type: Number, default: 0, min: 0, max: 1 },
    evidence: [{ type: String, trim: true }],
    companyHint: { type: String, default: "", trim: true },
    roleHint: { type: String, default: "", trim: true },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobApplication",
      default: null,
      index: true,
    },
    status: { type: String, enum: STATUS_VALUES, default: "suggested", index: true },
  },
  { timestamps: true }
);

careerEmailSignalSchema.index({ userId: 1, gmailMessageId: 1 }, { unique: true });

const CareerEmailSignal =
  mongoose.models.CareerEmailSignal ||
  mongoose.model("CareerEmailSignal", careerEmailSignalSchema);

CareerEmailSignal.CATEGORY_VALUES = CATEGORY_VALUES;
CareerEmailSignal.STATUS_VALUES = STATUS_VALUES;

module.exports = CareerEmailSignal;
