"use strict";

const mongoose = require("mongoose");
const MessagingConversationIndex = require("../../models/MessagingConversationIndex");
const {
  MESSAGING_CLASSIFICATION_STATUSES,
  MESSAGING_CLASSIFICATION_SOURCES,
  MESSAGING_CONVERSATION_TYPES,
  CURRENT_CLASSIFICATION_VERSION,
  assertMessagingProvider,
} = require("./messagingConstants");
const {
  mergeConversationMetadata,
} = require("./messagingConversationMetadata");

function normalizeUserId(userId = "") {
  return String(userId || "").trim();
}

function normalizeOptionalString(value = "") {
  return String(value || "").trim();
}

function normalizeObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return value;
}

function assertUserId(userId = "") {
  const normalized = normalizeUserId(userId);
  if (!normalized) throw new Error("userId is required.");
  return normalized;
}

function cleanConversationPatch(patch = {}) {
  const cleaned = {};
  const stringFields = [
    "matrixRoomId",
    "remoteChatId",
    "remoteConversationKey",
    "portalBridgeId",
    "type",
    "displayName",
    "displayNameSource",
    "avatarMxc",
    "avatarSource",
    "avatarState",
    "lastEventId",
    "classificationStatus",
    "classificationSource",
    "classificationReasonCode",
  ];

  for (const field of stringFields) {
    if (patch[field] !== undefined) {
      cleaned[field] = normalizeOptionalString(patch[field]);
    }
  }

  if (patch.connectionId !== undefined) {
    cleaned.connectionId = normalizeObjectId(patch.connectionId);
  }
  if (patch.classificationVersion !== undefined) {
    cleaned.classificationVersion =
      Number(patch.classificationVersion) || CURRENT_CLASSIFICATION_VERSION;
  }
  if (patch.displayNameRank !== undefined) {
    cleaned.displayNameRank = Number(patch.displayNameRank) || 0;
  }
  if (patch.avatarRank !== undefined) {
    cleaned.avatarRank = Number(patch.avatarRank) || 0;
  }
  if (patch.avatarUpdatedAt !== undefined) cleaned.avatarUpdatedAt = patch.avatarUpdatedAt;
  if (patch.lastActivityAt !== undefined) cleaned.lastActivityAt = patch.lastActivityAt;
  if (patch.firstSeenAt !== undefined) cleaned.firstSeenAt = patch.firstSeenAt;
  if (patch.lastSeenAt !== undefined) cleaned.lastSeenAt = patch.lastSeenAt;
  if (patch.staleAt !== undefined) cleaned.staleAt = patch.staleAt;

  return cleaned;
}

function createMessagingConversationRepository(
  model = MessagingConversationIndex
) {
  async function findVerifiedConversation({
    userId,
    provider,
    conversationId,
  }) {
    const normalizedUserId = assertUserId(userId);
    if (!conversationId) return null;
    return model.findOne({
      _id: normalizeObjectId(conversationId),
      userId: normalizedUserId,
      provider: assertMessagingProvider(provider),
      classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.VERIFIED,
    });
  }

  async function findByMatrixRoom({ userId, provider, matrixRoomId }) {
    const normalizedRoomId = normalizeOptionalString(matrixRoomId);
    if (!normalizedRoomId) return null;
    return model.findOne({
      userId: assertUserId(userId),
      provider: assertMessagingProvider(provider),
      matrixRoomId: normalizedRoomId,
    });
  }

  async function listVerifiedConversations({
    userId,
    provider,
    limit = 100,
  }) {
    return model
      .find({
        userId: assertUserId(userId),
        provider: assertMessagingProvider(provider),
        classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.VERIFIED,
      })
      .sort({ lastActivityAt: -1, lastSeenAt: -1, updatedAt: -1 })
      .limit(Math.max(1, Math.min(500, Number(limit || 100))));
  }

  async function listVerifiedConversationsForConnection({
    userId,
    provider,
    connectionId,
    limit = 100,
  }) {
    const normalizedUserId = assertUserId(userId);
    if (!connectionId) return [];
    return model
      .find({
        userId: normalizedUserId,
        provider: assertMessagingProvider(provider),
        connectionId: normalizeObjectId(connectionId),
        classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.VERIFIED,
      })
      .sort({ lastActivityAt: -1, lastSeenAt: -1, updatedAt: -1 })
      .limit(Math.max(1, Math.min(500, Number(limit || 100))));
  }

  async function listConversationsForConnection({
    userId,
    provider,
    connectionId,
  }) {
    const normalizedUserId = assertUserId(userId);
    if (!connectionId) return [];
    return model
      .find({
        userId: normalizedUserId,
        provider: assertMessagingProvider(provider),
        connectionId: normalizeObjectId(connectionId),
      })
      .sort({ lastSeenAt: -1, updatedAt: -1 });
  }

  async function listProviderConversations({
    userId,
    provider,
    limit = 1000,
  }) {
    return model
      .find({
        userId: assertUserId(userId),
        provider: assertMessagingProvider(provider),
      })
      .sort({ lastSeenAt: -1, updatedAt: -1 })
      .limit(Math.max(1, Math.min(5000, Number(limit || 1000))));
  }

  async function markConflict({
    userId,
    provider,
    matrixRoomId = "",
    conversationId = null,
    classificationSource = MESSAGING_CLASSIFICATION_SOURCES.BOOTSTRAP,
  }) {
    const normalizedUserId = assertUserId(userId);
    const query = conversationId
      ? {
          _id: normalizeObjectId(conversationId),
          userId: normalizedUserId,
        }
      : {
          userId: normalizedUserId,
          provider: assertMessagingProvider(provider),
          matrixRoomId: normalizeOptionalString(matrixRoomId),
        };

    return model.findOneAndUpdate(
      query,
      {
        $set: {
          classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.CONFLICT,
          classificationSource,
          classificationVersion: CURRENT_CLASSIFICATION_VERSION,
          lastSeenAt: new Date(),
        },
      },
      { new: true }
    );
  }

  async function markStale({
    userId,
    provider,
    matrixRoomId = "",
    conversationId = null,
    classificationSource = MESSAGING_CLASSIFICATION_SOURCES.BOOTSTRAP,
  }) {
    const normalizedUserId = assertUserId(userId);
    const now = new Date();
    const query = conversationId
      ? {
          _id: normalizeObjectId(conversationId),
          userId: normalizedUserId,
        }
      : {
          userId: normalizedUserId,
          provider: assertMessagingProvider(provider),
          matrixRoomId: normalizeOptionalString(matrixRoomId),
        };

    return model.findOneAndUpdate(
      query,
      {
        $set: {
          classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.STALE,
          classificationSource,
          classificationVersion: CURRENT_CLASSIFICATION_VERSION,
          staleAt: now,
          lastSeenAt: now,
        },
      },
      { new: true }
    );
  }

  async function upsertConversationMapping({
    userId,
    provider,
    connectionId = null,
    matrixRoomId,
    classificationStatus = MESSAGING_CLASSIFICATION_STATUSES.UNCLASSIFIED,
    classificationSource = MESSAGING_CLASSIFICATION_SOURCES.BOOTSTRAP,
    ...patch
  }) {
    const normalizedUserId = assertUserId(userId);
    const normalizedProvider = assertMessagingProvider(provider);
    const normalizedRoomId = normalizeOptionalString(matrixRoomId);
    if (!normalizedRoomId) throw new Error("matrixRoomId is required.");

    const conflicting = await model.findOne({
      userId: normalizedUserId,
      matrixRoomId: normalizedRoomId,
      provider: { $ne: normalizedProvider },
    });

    if (conflicting) {
      await model.updateOne(
        { _id: conflicting._id, userId: normalizedUserId },
        {
          $set: {
            classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.CONFLICT,
            classificationSource,
            classificationVersion: CURRENT_CLASSIFICATION_VERSION,
            lastSeenAt: new Date(),
          },
        }
      );

      const existingSameProvider = await model.findOne({
        userId: normalizedUserId,
        provider: normalizedProvider,
        matrixRoomId: normalizedRoomId,
      });

      if (existingSameProvider) {
        return markConflict({
          userId: normalizedUserId,
          provider: normalizedProvider,
          matrixRoomId: normalizedRoomId,
          classificationSource,
        });
      }

      const conflict = new model({
        userId: normalizedUserId,
        provider: normalizedProvider,
        connectionId: normalizeObjectId(connectionId),
        matrixRoomId: normalizedRoomId,
        ...cleanConversationPatch(patch),
        type: patch.type || MESSAGING_CONVERSATION_TYPES.UNKNOWN,
        classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.CONFLICT,
        classificationSource,
        classificationVersion: CURRENT_CLASSIFICATION_VERSION,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      });
      return conflict.save();
    }

    const now = new Date();
    const existing = await model.findOne({
      userId: normalizedUserId,
      provider: normalizedProvider,
      matrixRoomId: normalizedRoomId,
    });
    const metadata = mergeConversationMetadata(
      existing?.toObject ? existing.toObject() : existing || {},
      patch
    );
    return model.findOneAndUpdate(
      {
        userId: normalizedUserId,
        provider: normalizedProvider,
        matrixRoomId: normalizedRoomId,
      },
      {
        $set: {
          ...cleanConversationPatch({
            connectionId,
            matrixRoomId: normalizedRoomId,
            ...patch,
            ...metadata,
          }),
          userId: normalizedUserId,
          provider: normalizedProvider,
          matrixRoomId: normalizedRoomId,
          classificationStatus,
          classificationSource,
          classificationVersion: CURRENT_CLASSIFICATION_VERSION,
          lastSeenAt: now,
        },
        $setOnInsert: {
          firstSeenAt: now,
          createdAt: now,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );
  }


  async function updateConversationMetadata({
    userId,
    provider,
    matrixRoomId,
    ...incoming
  }) {
    const existing = await findByMatrixRoom({ userId, provider, matrixRoomId });
    if (!existing) return null;
    const metadata = mergeConversationMetadata(
      existing.toObject ? existing.toObject() : existing,
      incoming
    );
    const current = existing.toObject ? existing.toObject() : existing;
    const currentActivity = current.lastActivityAt
      ? new Date(current.lastActivityAt).getTime()
      : 0;
    const nextActivity = metadata.lastActivityAt
      ? new Date(metadata.lastActivityAt).getTime()
      : 0;
    if (
      normalizeOptionalString(current.displayName) === metadata.displayName &&
      normalizeOptionalString(current.displayNameSource) === metadata.displayNameSource &&
      Number(current.displayNameRank || 0) === Number(metadata.displayNameRank || 0) &&
      normalizeOptionalString(current.avatarMxc) === metadata.avatarMxc &&
      normalizeOptionalString(current.avatarSource) === metadata.avatarSource &&
      normalizeOptionalString(current.avatarState) === metadata.avatarState &&
      Number(current.avatarRank || 0) === Number(metadata.avatarRank || 0) &&
      currentActivity === nextActivity &&
      normalizeOptionalString(current.lastEventId) === metadata.lastEventId
    ) {
      return existing;
    }
    return model.findOneAndUpdate(
      {
        _id: existing._id,
        userId: assertUserId(userId),
        provider: assertMessagingProvider(provider),
      },
      { $set: cleanConversationPatch(metadata) },
      { new: true }
    );
  }

  return {
    findVerifiedConversation,
    findByMatrixRoom,
    listVerifiedConversations,
    listVerifiedConversationsForConnection,
    listConversationsForConnection,
    listProviderConversations,
    upsertConversationMapping,
    markConflict,
    markStale,
    updateConversationMetadata,
  };
}

module.exports = {
  createMessagingConversationRepository,
  ...createMessagingConversationRepository(),
  __test: {
    normalizeObjectId,
    cleanConversationPatch,
  },
};
