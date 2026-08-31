"use strict";

const mongoose = require("mongoose");
const {
  MATRIX_MESSAGING_PROVIDER_VALUES,
  MESSAGING_CONNECTION_STATE_VALUES,
  MESSAGING_CONNECTION_STATES,
  MESSAGING_SYNC_STATE_VALUES,
  MESSAGING_SYNC_STATES,
} = require("../services/messaging/messagingConstants");

const messagingConnectionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  provider: {
    type: String,
    required: true,
    enum: MATRIX_MESSAGING_PROVIDER_VALUES,
    index: true,
  },
  integrationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Integration",
    default: null,
    index: true,
  },
  matrixUserId: { type: String, default: "", index: true },
  bridgeAppserviceId: { type: String, default: "" },
  bridgeBotMxid: { type: String, default: "" },
  userLoginId: { type: String, default: "" },
  remoteAccountId: { type: String, default: "" },
  remoteAccountDisplay: { type: String, default: "" },
  remoteAccountAvatarMxc: { type: String, default: "" },
  remoteAccountAvatarSource: { type: String, default: "" },
  remoteAccountAvatarState: { type: String, default: "unknown" },
  remoteAccountAvatarUpdatedAt: { type: Date, default: null },
  state: {
    type: String,
    enum: MESSAGING_CONNECTION_STATE_VALUES,
    default: MESSAGING_CONNECTION_STATES.DISCONNECTED,
    index: true,
  },
  rawBridgeStateCode: { type: String, default: "" },
  syncState: {
    type: String,
    enum: MESSAGING_SYNC_STATE_VALUES,
    default: MESSAGING_SYNC_STATES.CONNECTING,
    index: true,
  },
  remoteState: { type: String, default: "UNKNOWN" },
  portalCount: { type: Number, default: 0 },
  discoveredPortalCount: { type: Number, default: 0 },
  eligibleConversationCount: { type: Number, default: 0 },
  verifiedCount: { type: Number, default: 0 },
  pendingConversationCount: { type: Number, default: 0 },
  ignoredCount: { type: Number, default: 0 },
  duplicateCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  syncDiagnostics: {
    type: [{ portalFingerprint: String, errorCode: String }],
    default: [],
  },
  lastReconcileAt: { type: Date, default: null },
  syncStartedAt: { type: Date, default: null },
  lastSyncErrorCode: { type: String, default: "" },
  lastHealthyAt: { type: Date, default: null },
  lastStateChangedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

messagingConnectionSchema.index({ userId: 1, provider: 1 });
messagingConnectionSchema.index(
  { userId: 1, provider: 1, integrationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      integrationId: { $exists: true, $ne: null },
    },
  }
);
messagingConnectionSchema.index(
  { userId: 1, provider: 1, userLoginId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      userLoginId: { $type: "string", $gt: "" },
    },
  }
);

messagingConnectionSchema.pre("save", function () {
  this.updatedAt = new Date();
});

messagingConnectionSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate() || {};
  const set = update.$set || {};
  set.updatedAt = new Date();
  update.$set = set;
  this.setUpdate(update);
});

module.exports =
  mongoose.models.MessagingConnection ||
  mongoose.model("MessagingConnection", messagingConnectionSchema);
