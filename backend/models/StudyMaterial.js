"use strict";

const mongoose = require("mongoose");

const TYPE_VALUES = [
  "pdf",
  "doc",
  "docx",
  "txt",
  "markdown",
  "csv",
  "xlsx",
  "note",
  "link",
  "video",
  "generated_note",
  "image",
  "other",
];
const SOURCE_APP_VALUES = [
  "upload",
  "drive",
  "docs",
  "manual",
  "web",
  "youtube",
  "orionai",
  "other",
];
const EXTRACTION_STATUS_VALUES = ["pending", "processing", "ready", "failed", "not_applicable"];
const PROCESSING_STATUS_VALUES = ["uploaded", "processing", "ready", "failed", "archived"];
const STATUS_VALUES = ["active", "uploaded", "processing", "ready", "failed", "archived"];

const studyMaterialSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudyGoal",
      default: null,
      index: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudyTopic",
      default: null,
      index: true,
    },
    type: { type: String, enum: TYPE_VALUES, default: "note" },
    title: { type: String, default: "", trim: true },
    originalFileName: { type: String, default: "", trim: true },
    mimeType: { type: String, default: "", trim: true },
    size: { type: Number, default: 0, min: 0 },
    storageProvider: { type: String, default: "", trim: true },
    storageKey: { type: String, default: "", select: false },
    url: { type: String, default: "", trim: true },
    sourceApp: {
      type: String,
      enum: SOURCE_APP_VALUES,
      default: "manual",
    },
    sourceRef: { type: String, default: "" },
    contentText: { type: String, default: "" },
    extractedText: { type: String, default: "" },
    extractionStatus: {
      type: String,
      enum: EXTRACTION_STATUS_VALUES,
      default: "not_applicable",
    },
    processingStatus: {
      type: String,
      enum: PROCESSING_STATUS_VALUES,
      default: "ready",
    },
    processingError: { type: String, default: "" },
    summary: { type: String, default: "" },
    tags: [{ type: String, trim: true }],
    pageCount: { type: Number, default: null },
    visibility: { type: String, enum: ["private"], default: "private" },
    status: { type: String, enum: STATUS_VALUES, default: "ready" },
  },
  { timestamps: true }
);

studyMaterialSchema.index({ userId: 1, topicId: 1, status: 1, createdAt: -1 });

const StudyMaterial =
  mongoose.models.StudyMaterial ||
  mongoose.model("StudyMaterial", studyMaterialSchema);

StudyMaterial.TYPE_VALUES = TYPE_VALUES;
StudyMaterial.SOURCE_APP_VALUES = SOURCE_APP_VALUES;
StudyMaterial.STATUS_VALUES = STATUS_VALUES;
StudyMaterial.EXTRACTION_STATUS_VALUES = EXTRACTION_STATUS_VALUES;
StudyMaterial.PROCESSING_STATUS_VALUES = PROCESSING_STATUS_VALUES;

module.exports = StudyMaterial;
