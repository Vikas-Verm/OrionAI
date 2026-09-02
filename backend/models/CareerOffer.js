"use strict";

const mongoose = require("mongoose");

const STATUS_VALUES = ["draft", "received", "discussing", "accepted", "declined", "expired", "archived"];

const careerOfferSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobApplication",
      default: null,
      index: true,
    },
    company: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    status: { type: String, enum: STATUS_VALUES, default: "received", index: true },
    compensationText: { type: String, default: "", trim: true },
    deadline: { type: Date, default: null, index: true },
    notes: { type: String, default: "", trim: true },
    offerDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CareerDocument",
      default: null,
      index: true,
    },
    followUpReminderAt: { type: Date, default: null },
  },
  { timestamps: true }
);

careerOfferSchema.index({ userId: 1, status: 1, deadline: 1 });

const CareerOffer =
  mongoose.models.CareerOffer ||
  mongoose.model("CareerOffer", careerOfferSchema);

CareerOffer.STATUS_VALUES = STATUS_VALUES;

module.exports = CareerOffer;
