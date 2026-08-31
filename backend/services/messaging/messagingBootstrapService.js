"use strict";

const mongoose = require("mongoose");
const Integration = require("../../models/Integration");
const connectionRepository = require("./messagingConnectionRepository");
const conversationRepository = require("./messagingConversationRepository");
const {
  MATRIX_MESSAGING_PROVIDERS,
  MESSAGING_CONNECTION_STATES,
  MESSAGING_CLASSIFICATION_STATUSES,
  MESSAGING_CLASSIFICATION_SOURCES,
  MESSAGING_CONVERSATION_TYPES,
} = require("./messagingConstants");

function createEmptySummary() {
  return {
    integrations: {
      whatsapp: 0,
      signal: 0,
    },
    messagingConnections: {
      create: 0,
      update: 0,
      unchanged: 0,
    },
    conversationCandidates: {
      found: 0,
      createAsUnclassified: 0,
      existing: 0,
      conflicts: 0,
    },
  };
}

function normalizeString(value = "") {
  return String(value || "").trim();
}

function objectIdString(value) {
  if (!value) return "";
  return String(value._id || value);
}

function deriveConnectionState(integration = {}) {
  const loginState = normalizeString(integration.matrix?.loginState).toLowerCase();
  if (loginState === "connected" || integration.whatsapp?.connected) {
    return MESSAGING_CONNECTION_STATES.CONNECTED;
  }
  if (loginState === "logging_in" || loginState === "pending_qr" || loginState === "creating_account") {
    return MESSAGING_CONNECTION_STATES.ACTION_REQUIRED;
  }
  if (loginState === "error") return MESSAGING_CONNECTION_STATES.DEGRADED;
  return MESSAGING_CONNECTION_STATES.DISCONNECTED;
}

function buildConnectionMetadata(integration = {}) {
  const provider = normalizeString(integration.type).toLowerCase();
  const matrix = integration.matrix || {};
  const providerData = integration[provider] || {};
  const state = deriveConnectionState(integration);
  const connectedAt = matrix.connectedAt || providerData.connectedAt || null;

  return {
    userId: normalizeString(integration.userId),
    provider,
    integrationId: integration._id,
    matrixUserId: normalizeString(matrix.mxid || providerData.mxid),
    bridgeAppserviceId:
      provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP
        ? "whatsapp"
        : provider === MATRIX_MESSAGING_PROVIDERS.SIGNAL
          ? "signal"
          : "",
    bridgeBotMxid: normalizeString(matrix.bridgeBotMxid || providerData.bridgeBotMxid),
    userLoginId: normalizeString(matrix.userLoginId || providerData.userLoginId),
    remoteAccountId:
      provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP
        ? normalizeString(providerData.phone)
        : normalizeString(providerData.mxid || matrix.mxid),
    remoteAccountDisplay:
      provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP
        ? normalizeString(providerData.profileName || providerData.phone)
        : normalizeString(providerData.displayName),
    state,
    rawBridgeStateCode: normalizeString(matrix.loginState),
    lastHealthyAt: state === MESSAGING_CONNECTION_STATES.CONNECTED ? connectedAt || new Date() : null,
    lastStateChangedAt: connectedAt || integration.updatedAt || new Date(),
  };
}

function sameConnectionMetadata(existing = null, next = {}) {
  if (!existing) return false;
  const fields = [
    "userId",
    "provider",
    "matrixUserId",
    "bridgeAppserviceId",
    "bridgeBotMxid",
    "userLoginId",
    "remoteAccountId",
    "remoteAccountDisplay",
    "state",
    "rawBridgeStateCode",
  ];
  return fields.every((field) => normalizeString(existing[field]) === normalizeString(next[field]));
}

async function syncMessagingConnectionsFromIntegrations({
  dryRun = true,
  integrationModel = Integration,
  connectionRepo = connectionRepository,
} = {}) {
  const summary = createEmptySummary();
  const integrations = await integrationModel.find({
    type: {
      $in: [
        MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
        MATRIX_MESSAGING_PROVIDERS.SIGNAL,
      ],
    },
  });

  const syncedConnections = [];

  for (const integration of integrations) {
    const provider = normalizeString(integration.type).toLowerCase();
    if (provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP) summary.integrations.whatsapp += 1;
    if (provider === MATRIX_MESSAGING_PROVIDERS.SIGNAL) summary.integrations.signal += 1;

    const metadata = buildConnectionMetadata(integration);
    if (!metadata.userId || !metadata.provider) continue;

    const existing = await connectionRepo.findConnection({
      userId: metadata.userId,
      provider: metadata.provider,
    });

    if (!existing) {
      summary.messagingConnections.create += 1;
      if (!dryRun) {
        const connection = await connectionRepo.upsertConnection(metadata);
        syncedConnections.push(connection);
      }
      continue;
    }

    syncedConnections.push(existing);
    if (sameConnectionMetadata(existing, metadata)) {
      summary.messagingConnections.unchanged += 1;
      continue;
    }

    summary.messagingConnections.update += 1;
    if (!dryRun) {
      await connectionRepo.upsertConnection(metadata);
    }
  }

  return { summary, connections: syncedConnections };
}

async function syncConversationCandidates({
  dryRun = true,
  candidates = [],
  conversationRepo = conversationRepository,
} = {}) {
  const summary = createEmptySummary().conversationCandidates;

  for (const candidate of candidates) {
    const userId = normalizeString(candidate.userId);
    const provider = normalizeString(candidate.provider).toLowerCase();
    const matrixRoomId = normalizeString(candidate.matrixRoomId);
    if (!userId || !provider || !matrixRoomId) continue;

    summary.found += 1;
    const existing = await conversationRepo.findByMatrixRoom({
      userId,
      provider,
      matrixRoomId,
    });

    if (existing) {
      summary.existing += 1;
      continue;
    }

    if (dryRun) {
      summary.createAsUnclassified += 1;
      continue;
    }

    const created = await conversationRepo.upsertConversationMapping({
      userId,
      provider,
      connectionId: candidate.connectionId || null,
      matrixRoomId,
      remoteChatId: candidate.remoteChatId || "",
      portalBridgeId: candidate.portalBridgeId || "",
      type: candidate.type || MESSAGING_CONVERSATION_TYPES.UNKNOWN,
      displayName: candidate.displayName || "",
      avatarMxc: candidate.avatarMxc || "",
      classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.UNCLASSIFIED,
      classificationSource: MESSAGING_CLASSIFICATION_SOURCES.BOOTSTRAP,
    });

    if (created?.classificationStatus === MESSAGING_CLASSIFICATION_STATUSES.CONFLICT) {
      summary.conflicts += 1;
    } else {
      summary.createAsUnclassified += 1;
    }
  }

  return summary;
}

async function bootstrapMessagingMappings(options = {}) {
  const {
    dryRun = true,
    includeCandidates = false,
    candidates = [],
    integrationModel = Integration,
    connectionRepo = connectionRepository,
    conversationRepo = conversationRepository,
  } = options;

  const result = await syncMessagingConnectionsFromIntegrations({
    dryRun,
    integrationModel,
    connectionRepo,
  });

  const summary = result.summary;
  if (includeCandidates || candidates.length) {
    summary.conversationCandidates = await syncConversationCandidates({
      dryRun,
      candidates,
      conversationRepo,
    });
  }

  return summary;
}

function formatBootstrapSummary(summary = createEmptySummary()) {
  return [
    `WhatsApp integrations found: ${summary.integrations?.whatsapp || 0}`,
    `Signal integrations found: ${summary.integrations?.signal || 0}`,
    "",
    "MessagingConnections:",
    `create: ${summary.messagingConnections?.create || 0}`,
    `update: ${summary.messagingConnections?.update || 0}`,
    `unchanged: ${summary.messagingConnections?.unchanged || 0}`,
    "",
    "Conversation candidates:",
    `found: ${summary.conversationCandidates?.found || 0}`,
    `create as unclassified: ${summary.conversationCandidates?.createAsUnclassified || 0}`,
    `existing: ${summary.conversationCandidates?.existing || 0}`,
    `conflicts: ${summary.conversationCandidates?.conflicts || 0}`,
  ].join("\n");
}

async function connectMongoFromEnv() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required for messaging bootstrap.");
  }
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(uri);
}

module.exports = {
  bootstrapMessagingMappings,
  syncMessagingConnectionsFromIntegrations,
  syncConversationCandidates,
  buildConnectionMetadata,
  deriveConnectionState,
  formatBootstrapSummary,
  connectMongoFromEnv,
  __test: {
    createEmptySummary,
    sameConnectionMetadata,
    objectIdString,
  },
};
