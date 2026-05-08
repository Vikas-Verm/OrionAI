"use strict";

const mongoose = require("mongoose");

const TELEMETRY_TTL_DAYS = 30;

const TELEMETRY_KINDS = ["open", "action", "state_change"];

const communicationTelemetryEventSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  kind: { type: String, enum: TELEMETRY_KINDS, required: true, index: true },
  itemId: { type: String, default: "", index: true },
  sourceApp: { type: String, default: "" },
  conversationId: { type: String, default: "" },
  threadId: { type: String, default: "" },
  fromState: { type: String, default: "" },
  toState: { type: String, default: "" },
  action: { type: String, default: "" },
  reason: { type: String, default: "" },
  origin: { type: String, default: "" },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: {
    type: Date,
    default: Date.now,
    index: { expires: `${TELEMETRY_TTL_DAYS}d` },
  },
});

communicationTelemetryEventSchema.index({ userId: 1, kind: 1, createdAt: -1 });
communicationTelemetryEventSchema.index({ userId: 1, itemId: 1, createdAt: -1 });

module.exports =
  mongoose.models.CommunicationTelemetryEvent ||
  mongoose.model(
    "CommunicationTelemetryEvent",
    communicationTelemetryEventSchema
  );

module.exports.TELEMETRY_KINDS = TELEMETRY_KINDS;
