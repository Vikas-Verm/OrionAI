"use strict";

const mongoose = require("mongoose");

const TYPE_VALUES = [
  "resume",
  "cover_letter",
  "job_description",
  "assignment",
  "offer_letter",
  "interview_notes",
  "other",
];
const SOURCE_APP_VALUES = ["upload", "manual", "google_docs", "google_drive", "gmail", "web", "other"];
const PROCESSING_STATUS_VALUES = ["uploaded", "processing", "ready", "failed", "archived"];

const careerDocumentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    type: { type: String, enum: TYPE_VALUES, default: "other", index: true },
    title: { type: String, required: true, trim: true },
    originalFileName: { type: String, default: "", trim: true },
    mimeType: { type: String, default: "", trim: true },
    size: { type: Number, default: 0, min: 0 },
    storageProvider: { type: String, default: "", trim: true },
    storageKey: { type: String, default: "", select: false },
    sourceApp: { type: String, enum: SOURCE_APP_VALUES, default: "manual" },
    sourceRef: { type: String, default: "", trim: true },
    sourceUrl: { type: String, default: "", trim: true },
    sourceUnavailable: { type: Boolean, default: false },
    lastSourceCheckedAt: { type: Date, default: null },
    extractedText: { type: String, default: "" },
    processingStatus: { type: String, enum: PROCESSING_STATUS_VALUES, default: "ready" },
    processingError: { type: String, default: "" },
    version: { type: Number, default: 1, min: 1 },
    isPrimary: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

careerDocumentSchema.index({ userId: 1, type: 1, processingStatus: 1, createdAt: -1 });

const CareerDocument =
  mongoose.models.CareerDocument ||
  mongoose.model("CareerDocument", careerDocumentSchema);

CareerDocument.TYPE_VALUES = TYPE_VALUES;
CareerDocument.SOURCE_APP_VALUES = SOURCE_APP_VALUES;
CareerDocument.PROCESSING_STATUS_VALUES = PROCESSING_STATUS_VALUES;

module.exports = CareerDocument;
