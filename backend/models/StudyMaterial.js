"use strict";

const mongoose = require("mongoose");

const TYPE_VALUES = [
  "pdf",
  "doc",
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
const STATUS_VALUES = ["active", "archived"];

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
    url: { type: String, default: "", trim: true },
    sourceApp: {
      type: String,
      enum: SOURCE_APP_VALUES,
      default: "manual",
    },
    sourceRef: { type: String, default: "" },
    contentText: { type: String, default: "" },
    summary: { type: String, default: "" },
    status: { type: String, enum: STATUS_VALUES, default: "active" },
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

module.exports = StudyMaterial;
