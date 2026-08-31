"use strict";

const mongoose = require("mongoose");
const {
  MATRIX_MESSAGING_PROVIDER_VALUES,
  MESSAGING_CONVERSATION_TYPE_VALUES,
  MESSAGING_CONVERSATION_TYPES,
  MESSAGING_CLASSIFICATION_STATUS_VALUES,
  MESSAGING_CLASSIFICATION_STATUSES,
  MESSAGING_CLASSIFICATION_SOURCES,
  CURRENT_CLASSIFICATION_VERSION,
} = require("../services/messaging/messagingConstants");

// Metadata-only index. Do not add message bodies, Matrix event payloads,
// attachments, decrypted content, histories, timelines, or AI prompt context.
const messagingConversationIndexSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  provider: {
    type: String,
    required: true,
    enum: MATRIX_MESSAGING_PROVIDER_VALUES,
    index: true,
  },
  connectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MessagingConnection",
    default: null,
  },
  matrixRoomId: { type: String, default: "", index: true },
  remoteChatId: { type: String, default: "", index: true },
  remoteConversationKey: { type: String, default: "", index: true },
  portalBridgeId: { type: String, default: "" },
  type: {
    type: String,
    enum: MESSAGING_CONVERSATION_TYPE_VALUES,
    default: MESSAGING_CONVERSATION_TYPES.UNKNOWN,
  },
  displayName: { type: String, default: "" },
  displayNameSource: { type: String, default: "unknown" },
  displayNameRank: { type: Number, default: 0 },
  avatarMxc: { type: String, default: "" },
  avatarSource: { type: String, default: "unknown" },
  avatarRank: { type: Number, default: 0 },
  avatarState: { type: String, default: "unknown" },
  avatarUpdatedAt: { type: Date, default: null },
  lastActivityAt: { type: Date, default: null, index: true },
  lastEventId: { type: String, default: "" },
  classificationStatus: {
    type: String,
    enum: MESSAGING_CLASSIFICATION_STATUS_VALUES,
    default: MESSAGING_CLASSIFICATION_STATUSES.UNCLASSIFIED,
    index: true,
  },
  classificationSource: {
    type: String,
    default: MESSAGING_CLASSIFICATION_SOURCES.UNKNOWN,
  },
  classificationReasonCode: { type: String, default: "" },
  classificationVersion: {
    type: Number,
    default: CURRENT_CLASSIFICATION_VERSION,
  },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  staleAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

messagingConversationIndexSchema.index(
  { userId: 1, provider: 1, matrixRoomId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      matrixRoomId: { $type: "string", $gt: "" },
    },
  }
);
messagingConversationIndexSchema.index({
  userId: 1,
  provider: 1,
  classificationStatus: 1,
});
messagingConversationIndexSchema.index({ connectionId: 1 });
messagingConversationIndexSchema.index(
  { userId: 1, provider: 1, connectionId: 1, remoteConversationKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      remoteConversationKey: { $type: "string", $gt: "" },
    },
  }
);

messagingConversationIndexSchema.pre("save", function () {
  this.updatedAt = new Date();
});

messagingConversationIndexSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate() || {};
  const set = update.$set || {};
  set.updatedAt = new Date();
  update.$set = set;
  this.setUpdate(update);
});

module.exports =
  mongoose.models.MessagingConversationIndex ||
  mongoose.model(
    "MessagingConversationIndex",
    messagingConversationIndexSchema
  );
