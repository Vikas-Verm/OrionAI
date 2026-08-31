"use strict";

const mongoose = require("mongoose");
const MessagingConnection = require("../../models/MessagingConnection");
const {
  MESSAGING_CONNECTION_STATES,
  assertMessagingProvider,
} = require("./messagingConstants");

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

function cleanConnectionPatch(patch = {}) {
  const cleaned = {};
  const stringFields = [
    "matrixUserId",
    "bridgeAppserviceId",
    "bridgeBotMxid",
    "userLoginId",
    "remoteAccountId",
    "remoteAccountDisplay",
    "remoteAccountAvatarMxc",
    "remoteAccountAvatarSource",
    "remoteAccountAvatarState",
    "rawBridgeStateCode",
    "syncState",
    "remoteState",
    "lastSyncErrorCode",
  ];

  for (const field of stringFields) {
    if (patch[field] !== undefined) {
      cleaned[field] = normalizeOptionalString(patch[field]);
    }
  }

  if (patch.integrationId !== undefined) {
    cleaned.integrationId = normalizeObjectId(patch.integrationId);
  }
  if (patch.state !== undefined) cleaned.state = normalizeOptionalString(patch.state);
  if (patch.lastHealthyAt !== undefined) cleaned.lastHealthyAt = patch.lastHealthyAt;
  if (patch.lastStateChangedAt !== undefined) {
    cleaned.lastStateChangedAt = patch.lastStateChangedAt;
  }
  if (patch.portalCount !== undefined) cleaned.portalCount = Number(patch.portalCount) || 0;
  if (patch.discoveredPortalCount !== undefined) {
    cleaned.discoveredPortalCount = Number(patch.discoveredPortalCount) || 0;
  }
  if (patch.eligibleConversationCount !== undefined) {
    cleaned.eligibleConversationCount = Number(patch.eligibleConversationCount) || 0;
  }
  if (patch.verifiedCount !== undefined) cleaned.verifiedCount = Number(patch.verifiedCount) || 0;
  if (patch.pendingConversationCount !== undefined) {
    cleaned.pendingConversationCount = Number(patch.pendingConversationCount) || 0;
  }
  if (patch.ignoredCount !== undefined) cleaned.ignoredCount = Number(patch.ignoredCount) || 0;
  if (patch.duplicateCount !== undefined) cleaned.duplicateCount = Number(patch.duplicateCount) || 0;
  if (patch.failedCount !== undefined) cleaned.failedCount = Number(patch.failedCount) || 0;
  if (patch.syncDiagnostics !== undefined) {
    cleaned.syncDiagnostics = Array.isArray(patch.syncDiagnostics)
      ? patch.syncDiagnostics.slice(0, 50).map((item) => ({
          portalFingerprint: normalizeOptionalString(item?.portalFingerprint),
          errorCode: normalizeOptionalString(item?.errorCode),
        }))
      : [];
  }
  if (patch.remoteAccountAvatarUpdatedAt !== undefined) {
    cleaned.remoteAccountAvatarUpdatedAt = patch.remoteAccountAvatarUpdatedAt;
  }
  if (patch.lastReconcileAt !== undefined) cleaned.lastReconcileAt = patch.lastReconcileAt;
  if (patch.syncStartedAt !== undefined) cleaned.syncStartedAt = patch.syncStartedAt;

  return cleaned;
}

function createMessagingConnectionRepository(model = MessagingConnection) {
  async function findConnection({ userId, provider }) {
    return model.findOne({
      userId: assertUserId(userId),
      provider: assertMessagingProvider(provider),
    });
  }

  async function findConnectionById({ userId, connectionId }) {
    const normalizedUserId = assertUserId(userId);
    if (!connectionId) return null;
    return model.findOne({
      _id: normalizeObjectId(connectionId),
      userId: normalizedUserId,
    });
  }

  async function listConnections({ userId = "", provider = "" } = {}) {
    const query = {};
    const normalizedUserId = normalizeUserId(userId);
    const normalizedProvider = provider ? assertMessagingProvider(provider) : "";
    if (normalizedUserId) query.userId = normalizedUserId;
    if (normalizedProvider) query.provider = normalizedProvider;
    return model.find(query).sort({ userId: 1, provider: 1, updatedAt: -1 });
  }

  async function upsertConnection({
    userId,
    provider,
    integrationId = null,
    ...patch
  }) {
    const normalizedUserId = assertUserId(userId);
    const normalizedProvider = assertMessagingProvider(provider);
    const normalizedIntegrationId = normalizeObjectId(integrationId);
    const now = new Date();
    const cleaned = {
      ...cleanConnectionPatch({ integrationId: normalizedIntegrationId, ...patch }),
      userId: normalizedUserId,
      provider: normalizedProvider,
    };

    if (cleaned.state && !cleaned.lastStateChangedAt) {
      cleaned.lastStateChangedAt = now;
    }

    const existingByIntegration = normalizedIntegrationId
      ? await model.findOne({
          userId: normalizedUserId,
          provider: normalizedProvider,
          integrationId: normalizedIntegrationId,
        })
      : null;
    const existingByLogin =
      !existingByIntegration && cleaned.userLoginId
        ? await model.findOne({
            userId: normalizedUserId,
            provider: normalizedProvider,
            userLoginId: cleaned.userLoginId,
          })
        : null;
    const existingFallback =
      !existingByIntegration && !existingByLogin && !cleaned.userLoginId && !normalizedIntegrationId
        ? await model.findOne({
            userId: normalizedUserId,
            provider: normalizedProvider,
          })
        : null;

    const existing = existingByIntegration || existingByLogin || existingFallback;
    const query = existing
      ? { _id: existing._id, userId: normalizedUserId }
      : cleaned.userLoginId
        ? {
            userId: normalizedUserId,
            provider: normalizedProvider,
            userLoginId: cleaned.userLoginId,
          }
        : normalizedIntegrationId
          ? {
              userId: normalizedUserId,
              provider: normalizedProvider,
              integrationId: normalizedIntegrationId,
            }
          : {
              userId: normalizedUserId,
              provider: normalizedProvider,
            };

    return model.findOneAndUpdate(
      query,
      {
        $set: cleaned,
        $setOnInsert: {
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

  async function updateConnectionState({
    userId,
    connectionId,
    provider = "",
    state,
    rawBridgeStateCode = "",
  }) {
    const normalizedUserId = assertUserId(userId);
    const query = connectionId
      ? { _id: normalizeObjectId(connectionId), userId: normalizedUserId }
      : {
          userId: normalizedUserId,
          provider: assertMessagingProvider(provider),
        };

    return model.findOneAndUpdate(
      query,
      {
        $set: {
          state,
          rawBridgeStateCode: normalizeOptionalString(rawBridgeStateCode),
          lastStateChangedAt: new Date(),
        },
      },
      { new: true }
    );
  }

  async function markConnectionHealthy({ userId, connectionId, provider = "" }) {
    const normalizedUserId = assertUserId(userId);
    const now = new Date();
    const query = connectionId
      ? { _id: normalizeObjectId(connectionId), userId: normalizedUserId }
      : {
          userId: normalizedUserId,
          provider: assertMessagingProvider(provider),
        };

    return model.findOneAndUpdate(
      query,
      {
        $set: {
          state: MESSAGING_CONNECTION_STATES.CONNECTED,
          lastHealthyAt: now,
          lastStateChangedAt: now,
        },
      },
      { new: true }
    );
  }

  async function updateConnectionSync({
    userId,
    connectionId,
    syncState,
    remoteState = "",
    portalCount = 0,
    verifiedCount = 0,
    discoveredPortalCount = portalCount,
    eligibleConversationCount = 0,
    pendingConversationCount = 0,
    ignoredCount = 0,
    duplicateCount = 0,
    failedCount = 0,
    syncDiagnostics = [],
    lastReconcileAt = null,
    syncStartedAt = null,
    lastSyncErrorCode = "",
  }) {
    return model.findOneAndUpdate(
      {
        _id: normalizeObjectId(connectionId),
        userId: assertUserId(userId),
      },
      {
        $set: cleanConnectionPatch({
          syncState,
          remoteState,
          portalCount,
          discoveredPortalCount,
          eligibleConversationCount,
          verifiedCount,
          pendingConversationCount,
          ignoredCount,
          duplicateCount,
          failedCount,
          syncDiagnostics,
          lastReconcileAt,
          syncStartedAt,
          lastSyncErrorCode,
        }),
      },
      { new: true }
    );
  }

  return {
    findConnection,
    findConnectionById,
    listConnections,
    upsertConnection,
    updateConnectionState,
    markConnectionHealthy,
    updateConnectionSync,
  };
}

module.exports = {
  createMessagingConnectionRepository,
  ...createMessagingConnectionRepository(),
  __test: {
    normalizeObjectId,
    cleanConnectionPatch,
  },
};
