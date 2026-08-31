"use strict";

const mongoose = require("mongoose");
const Integration = require("../../models/Integration");
const connectionRepository = require("./messagingConnectionRepository");
const conversationRepository = require("./messagingConversationRepository");
const { buildConnectionMetadata } = require("./messagingBootstrapService");
const {
  collectBridgePortalEvidence,
} = require("./bridgePortalEvidenceSource");
const {
  discoverMatrixRoomsForConnection,
} = require("./matrixRoomDiscovery");
const {
  resolveMatrixSession,
  MatrixSessionError,
} = require("./matrixSessionResolver");
const {
  classifyRoom,
  summarizeClassificationSource,
  toConversationStatus,
} = require("./roomClassifier");
const {
  MATRIX_MESSAGING_PROVIDERS,
  MATRIX_MESSAGING_PROVIDER_VALUES,
  MESSAGING_CLASSIFICATION_STATUSES,
  MESSAGING_CLASSIFICATION_SOURCES,
  ROOM_CLASSIFICATION_RESULTS,
  ROOM_CLASSIFICATION_REASON_CODES,
  CURRENT_CLASSIFICATION_VERSION,
  normalizeMessagingProvider,
  assertMessagingProvider,
} = require("./messagingConstants");

function normalizeString(value = "") {
  return String(value || "").trim();
}

function plainDoc(doc = {}) {
  if (!doc) return {};
  if (typeof doc.toObject === "function") return doc.toObject();
  return doc;
}

function idString(value) {
  if (!value) return "";
  return String(value._id || value);
}

function isPersistedObjectId(value) {
  return mongoose.Types.ObjectId.isValid(idString(value));
}

function persistableConnectionId(connection = {}) {
  const value = idString(connection._id || connection.id);
  return isPersistedObjectId(value) ? value : null;
}

function maskIdentifier(value = "") {
  const text = normalizeString(value);
  if (!text) return "";
  if (text.length <= 8) return "***";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function sanitizeErrorMessage(message = "") {
  return normalizeString(message)
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
}

function createProviderSummary(provider = "") {
  return {
    provider,
    connections: 0,
    roomsInspected: 0,
    verified: 0,
    unclassified: 0,
    conflict: 0,
    ignored: 0,
    stale: 0,
    wouldCreate: 0,
    wouldUpdate: 0,
    wouldConflict: 0,
    errors: [],
    details: [],
    metrics: {
      messaging_reconcile_rooms_total: 0,
      messaging_reconcile_verified_total: 0,
      messaging_reconcile_conflict_total: 0,
      messaging_reconcile_unclassified_total: 0,
      messaging_reconcile_stale_total: 0,
    },
  };
}

function createEmptySummary() {
  return {
    dryRun: true,
    apply: false,
    providers: {
      [MATRIX_MESSAGING_PROVIDERS.WHATSAPP]: createProviderSummary(
        MATRIX_MESSAGING_PROVIDERS.WHATSAPP
      ),
      [MATRIX_MESSAGING_PROVIDERS.SIGNAL]: createProviderSummary(
        MATRIX_MESSAGING_PROVIDERS.SIGNAL
      ),
    },
  };
}

function providerLabel(provider = "") {
  return provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP
    ? "WhatsApp"
    : provider === MATRIX_MESSAGING_PROVIDERS.SIGNAL
      ? "Signal"
      : provider;
}

function summarizeEvidence(result = {}) {
  return (result.evidence || [])
    .map((entry) => `${entry.source}:${entry.strength}:${entry.result}`)
    .join(",");
}

function resultCounter(status = "") {
  if (status === ROOM_CLASSIFICATION_RESULTS.VERIFIED) return "verified";
  if (status === ROOM_CLASSIFICATION_RESULTS.CONFLICT) return "conflict";
  if (status === ROOM_CLASSIFICATION_RESULTS.IGNORED) return "ignored";
  if (status === ROOM_CLASSIFICATION_RESULTS.STALE) return "stale";
  return "unclassified";
}

function updateMetrics(providerSummary) {
  providerSummary.metrics.messaging_reconcile_rooms_total =
    providerSummary.roomsInspected;
  providerSummary.metrics.messaging_reconcile_verified_total =
    providerSummary.verified;
  providerSummary.metrics.messaging_reconcile_conflict_total =
    providerSummary.conflict;
  providerSummary.metrics.messaging_reconcile_unclassified_total =
    providerSummary.unclassified;
  providerSummary.metrics.messaging_reconcile_stale_total =
    providerSummary.stale;
}

function classificationPatch({
  userId,
  provider,
  connection,
  result,
}) {
  return {
    userId,
    provider,
    connectionId: persistableConnectionId(connection),
    matrixRoomId: result.matrixRoomId,
    remoteChatId: result.remoteChatId || "",
    remoteConversationKey: result.remoteConversationKey || result.remoteChatId || "",
    portalBridgeId: result.portalBridgeId || "",
    type: result.type || "unknown",
    displayName: result.displayName || "",
    displayNameSource: result.displayNameSource || "",
    displayNameRank: Number(result.displayNameRank || 0),
    avatarMxc: result.avatarMxc || "",
    avatarSource: result.avatarSource || "",
    avatarState: result.avatarState || "unknown",
    classificationStatus: toConversationStatus(result.status),
    classificationSource: summarizeClassificationSource(result),
    classificationReasonCode: result.reasonCode || "",
    classificationVersion:
      result.classificationVersion || CURRENT_CLASSIFICATION_VERSION,
  };
}

function hasMeaningfulChange(existing = null, patch = {}) {
  if (!existing) return false;
  const doc = plainDoc(existing);
  const fields = [
    "connectionId",
    "remoteChatId",
    "remoteConversationKey",
    "portalBridgeId",
    "type",
    "displayName",
    "displayNameSource",
    "displayNameRank",
    "avatarMxc",
    "avatarSource",
    "avatarState",
    "classificationStatus",
    "classificationSource",
    "classificationReasonCode",
    "classificationVersion",
  ];
  return fields.some((field) => {
    const existingValue =
      field === "connectionId" ? idString(doc[field]) : normalizeString(doc[field]);
    const nextValue =
      field === "connectionId" ? idString(patch[field]) : normalizeString(patch[field]);
    return existingValue !== nextValue;
  });
}

async function loadIntegrationForConnection({
  connection,
  integrationModel = Integration,
}) {
  const doc = plainDoc(connection);
  const userId = normalizeString(doc.userId);
  const provider = normalizeMessagingProvider(doc.provider);
  if (!userId || !provider) return null;

  const byId =
    doc.integrationId && mongoose.Types.ObjectId.isValid(idString(doc.integrationId))
      ? await integrationModel.findOne({
          _id: doc.integrationId,
          userId,
          type: provider,
        })
      : null;
  if (byId) return byId;

  return integrationModel.findOne({
    userId,
    type: provider,
  });
}

async function listIntegrationConnectionCandidates({
  userId = "",
  provider = "",
  integrationModel = Integration,
}) {
  const query = {
    type: {
      $in: provider
        ? [assertMessagingProvider(provider)]
        : [
            MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
            MATRIX_MESSAGING_PROVIDERS.SIGNAL,
          ],
    },
  };
  if (userId) query.userId = normalizeString(userId);

  const integrations = await integrationModel.find(query);
  return (integrations || [])
    .map((integration) => {
      const metadata = buildConnectionMetadata(integration);
      if (!metadata.userId || !normalizeMessagingProvider(metadata.provider)) {
        return null;
      }
      return {
        ...metadata,
        _id: `dryrun:${metadata.provider}:${idString(integration._id)}`,
        __dryRunOnly: true,
      };
    })
    .filter(Boolean);
}

async function loadConnections({
  userId = "",
  provider = "",
  dryRun = true,
  includeIntegrationFallback = true,
  connectionRepo = connectionRepository,
  integrationModel = Integration,
} = {}) {
  const persisted = await connectionRepo.listConnections({ userId, provider });
  const byKey = new Map();
  for (const connection of persisted || []) {
    const doc = plainDoc(connection);
    byKey.set(`${doc.userId}:${doc.provider}`, doc);
  }

  if (dryRun && includeIntegrationFallback) {
    const candidates = await listIntegrationConnectionCandidates({
      userId,
      provider,
      integrationModel,
    });
    for (const candidate of candidates) {
      const key = `${candidate.userId}:${candidate.provider}`;
      if (!byKey.has(key)) byKey.set(key, candidate);
    }
  }

  return [...byKey.values()].filter((connection) => {
    if (userId && normalizeString(connection.userId) !== normalizeString(userId)) {
      return false;
    }
    if (provider && connection.provider !== assertMessagingProvider(provider)) {
      return false;
    }
    return true;
  });
}

async function loadUserEvidence({
  userId,
  dryRun,
  connections,
  connectionRepo = connectionRepository,
  integrationModel = Integration,
  bridgeEvidenceSource = collectBridgePortalEvidence,
}) {
  const userConnections =
    connections ||
    (await loadConnections({
      userId,
      dryRun,
      includeIntegrationFallback: true,
      connectionRepo,
      integrationModel,
    }));
  return bridgeEvidenceSource(userConnections);
}

async function applyOrPreviewClassification({
  dryRun,
  userId,
  provider,
  connection,
  result,
  providerSummary,
  conversationRepo = conversationRepository,
}) {
  if (result.status === ROOM_CLASSIFICATION_RESULTS.IGNORED) return null;

  const patch = classificationPatch({ userId, provider, connection, result });
  const existing = await conversationRepo.findByMatrixRoom({
    userId,
    provider,
    matrixRoomId: result.matrixRoomId,
  });

  if (!existing) providerSummary.wouldCreate += 1;
  else if (hasMeaningfulChange(existing, patch)) providerSummary.wouldUpdate += 1;

  if (result.status === ROOM_CLASSIFICATION_RESULTS.CONFLICT) {
    providerSummary.wouldConflict += 1;
  }

  if (dryRun) return null;
  return conversationRepo.upsertConversationMapping(patch);
}

async function handleStaleMappings({
  dryRun,
  userId,
  provider,
  connection,
  seenRoomIds,
  providerSummary,
  conversationRepo = conversationRepository,
}) {
  const existing =
    persistableConnectionId(connection)
      ? await conversationRepo.listConversationsForConnection({
          userId,
          provider,
          connectionId: persistableConnectionId(connection),
        })
      : await conversationRepo.listProviderConversations({ userId, provider });

  for (const conversation of existing || []) {
    const doc = plainDoc(conversation);
    if (
      doc.classificationStatus !== MESSAGING_CLASSIFICATION_STATUSES.VERIFIED ||
      seenRoomIds.has(normalizeString(doc.matrixRoomId))
    ) {
      continue;
    }

    providerSummary.stale += 1;
    providerSummary.details.push({
      roomId: normalizeString(doc.matrixRoomId),
      provider,
      result: ROOM_CLASSIFICATION_RESULTS.STALE,
      reasonCode: ROOM_CLASSIFICATION_REASON_CODES.STALE_PORTAL,
      remoteChatId: maskIdentifier(doc.remoteChatId),
      evidence: "",
    });

    if (!dryRun) {
      await conversationRepo.markStale({
        userId,
        provider,
        matrixRoomId: doc.matrixRoomId,
        classificationSource: MESSAGING_CLASSIFICATION_SOURCES.BRIDGE_RECONCILER,
      });
    }
  }
}

async function reconcileConnection({
  userId,
  connectionId = "",
  connection = null,
  dryRun = true,
  details = false,
  matrixDiscovery = discoverMatrixRoomsForConnection,
  bridgeEvidence = null,
  bridgeEvidenceSource = collectBridgePortalEvidence,
  matrixSessionResolver = resolveMatrixSession,
  connectionRepo = connectionRepository,
  conversationRepo = conversationRepository,
  integrationModel = Integration,
} = {}) {
  const targetConnection =
    connection ||
    (await connectionRepo.findConnectionById({ userId, connectionId }));
  if (!targetConnection) {
    throw new Error("MessagingConnection not found.");
  }

  const normalizedConnection = plainDoc(targetConnection);
  const provider = assertMessagingProvider(normalizedConnection.provider);
  const normalizedUserId = normalizeString(normalizedConnection.userId);
  if (userId && normalizedUserId !== normalizeString(userId)) {
    throw new Error("MessagingConnection not found.");
  }

  const providerSummary = createProviderSummary(provider);
  providerSummary.connections = 1;

  const integration = await loadIntegrationForConnection({
    connection: normalizedConnection,
    integrationModel,
  });
  if (!integration) {
    providerSummary.errors.push({
      provider,
      code: "INTEGRATION_NOT_FOUND",
    });
    return providerSummary;
  }

  let matrixSession = null;
  try {
    matrixSession = await matrixSessionResolver({
      userId: normalizedUserId,
      provider,
      connection: normalizedConnection,
      integration,
      connectionRepo,
      integrationModel,
    });
  } catch (err) {
    providerSummary.errors.push({
      provider,
      code: err instanceof MatrixSessionError ? err.code : "MATRIX_SESSION_UNAVAILABLE",
      message: err.message,
    });
    return providerSummary;
  }

  const evidence =
    bridgeEvidence ||
    (await loadUserEvidence({
      userId: normalizedUserId,
      dryRun,
      connectionRepo,
      integrationModel,
      bridgeEvidenceSource,
    }));
  for (const error of evidence.errors || []) {
    providerSummary.errors.push(error);
  }

  let discovery;
  try {
    discovery = await matrixDiscovery({
      connection: normalizedConnection,
      integration,
      matrixSession,
    });
  } catch (err) {
    providerSummary.errors.push({
      provider,
      code: "MATRIX_DISCOVERY_FAILED",
      message: err.message,
    });
    return providerSummary;
  }

  if (!discovery.ok) {
    providerSummary.errors.push({
      provider,
      code: discovery.reasonCode || "MATRIX_DISCOVERY_FAILED",
    });
    return providerSummary;
  }

  const seenRoomIds = new Set();
  for (const matrixRoom of discovery.rooms || []) {
    const matrixRoomId = normalizeString(matrixRoom.roomId);
    if (!matrixRoomId) continue;
    seenRoomIds.add(matrixRoomId);
    providerSummary.roomsInspected += 1;

    const result = classifyRoom({
      userId: normalizedUserId,
      provider,
      connection: normalizedConnection,
      matrixRoom,
      bridgeEvidence: evidence,
      ownerMatched: discovery.ownerMatched,
      managementRoomId: discovery.managementRoomId,
    });

    const counter = resultCounter(result.status);
    providerSummary[counter] += 1;
    if (details) {
      providerSummary.details.push({
        roomId: result.matrixRoomId,
        provider,
        result: result.status,
        reasonCode: result.reasonCode,
        remoteChatId: maskIdentifier(result.remoteChatId),
        portalBridgeId: maskIdentifier(result.portalBridgeId),
        evidence: summarizeEvidence(result),
      });
    }

    await applyOrPreviewClassification({
      dryRun,
      userId: normalizedUserId,
      provider,
      connection: normalizedConnection,
      result,
      providerSummary,
      conversationRepo,
    });
  }

  await handleStaleMappings({
    dryRun,
    userId: normalizedUserId,
    provider,
    connection: normalizedConnection,
    seenRoomIds,
    providerSummary,
    conversationRepo,
  });

  updateMetrics(providerSummary);
  return providerSummary;
}

function mergeProviderSummary(target, source) {
  target.connections += source.connections || 0;
  target.roomsInspected += source.roomsInspected || 0;
  target.verified += source.verified || 0;
  target.unclassified += source.unclassified || 0;
  target.conflict += source.conflict || 0;
  target.ignored += source.ignored || 0;
  target.stale += source.stale || 0;
  target.wouldCreate += source.wouldCreate || 0;
  target.wouldUpdate += source.wouldUpdate || 0;
  target.wouldConflict += source.wouldConflict || 0;
  target.errors.push(...(source.errors || []));
  target.details.push(...(source.details || []));
  updateMetrics(target);
}

async function reconcileProvider({
  userId = "",
  provider,
  dryRun = true,
  details = false,
  matrixDiscovery = discoverMatrixRoomsForConnection,
  bridgeEvidenceSource = collectBridgePortalEvidence,
  matrixSessionResolver = resolveMatrixSession,
  connectionRepo = connectionRepository,
  conversationRepo = conversationRepository,
  integrationModel = Integration,
} = {}) {
  const normalizedProvider = assertMessagingProvider(provider);
  const summary = createProviderSummary(normalizedProvider);
  const connections = await loadConnections({
    userId,
    provider: normalizedProvider,
    dryRun,
    includeIntegrationFallback: true,
    connectionRepo,
    integrationModel,
  });

  const userIds = [...new Set(connections.map((entry) => normalizeString(entry.userId)))];
  const evidenceByUser = new Map();
  for (const ownerId of userIds) {
    const userConnections = await loadConnections({
      userId: ownerId,
      dryRun,
      includeIntegrationFallback: true,
      connectionRepo,
      integrationModel,
    });
    evidenceByUser.set(
      ownerId,
      await bridgeEvidenceSource(userConnections)
    );
  }

  for (const connection of connections) {
    const connectionSummary = await reconcileConnection({
      userId: normalizeString(connection.userId),
      connection,
      dryRun,
      details,
      matrixDiscovery,
      bridgeEvidence: evidenceByUser.get(normalizeString(connection.userId)),
      bridgeEvidenceSource,
      matrixSessionResolver,
      connectionRepo,
      conversationRepo,
      integrationModel,
    });
    mergeProviderSummary(summary, connectionSummary);
  }

  return summary;
}

async function reconcileAll({
  userId = "",
  provider = "",
  dryRun = true,
  details = false,
  matrixDiscovery = discoverMatrixRoomsForConnection,
  bridgeEvidenceSource = collectBridgePortalEvidence,
  matrixSessionResolver = resolveMatrixSession,
  connectionRepo = connectionRepository,
  conversationRepo = conversationRepository,
  integrationModel = Integration,
} = {}) {
  const summary = createEmptySummary();
  summary.dryRun = dryRun;
  summary.apply = !dryRun;
  const providers = provider
    ? [assertMessagingProvider(provider)]
    : MATRIX_MESSAGING_PROVIDER_VALUES;

  for (const entry of providers) {
    summary.providers[entry] = await reconcileProvider({
      userId,
      provider: entry,
      dryRun,
      details,
      matrixDiscovery,
      bridgeEvidenceSource,
      matrixSessionResolver,
      connectionRepo,
      conversationRepo,
      integrationModel,
    });
  }

  return summary;
}

function formatProviderSummary(providerSummary = createProviderSummary("")) {
  const label = providerLabel(providerSummary.provider);
  const lines = [
    `Provider: ${label}`,
    "",
    `Connections: ${providerSummary.connections}`,
    `Matrix rooms inspected: ${providerSummary.roomsInspected}`,
    "",
    `Management ignored: ${providerSummary.ignored}`,
    "",
    `Verified candidates: ${providerSummary.verified}`,
    `Unclassified: ${providerSummary.unclassified}`,
    `Conflicts: ${providerSummary.conflict}`,
    `Stale: ${providerSummary.stale}`,
    "",
    `Would create: ${providerSummary.wouldCreate}`,
    `Would update: ${providerSummary.wouldUpdate}`,
    `Would conflict: ${providerSummary.wouldConflict}`,
  ];

  if (providerSummary.errors?.length) {
    lines.push("", "Errors:");
    for (const error of providerSummary.errors) {
      const message = sanitizeErrorMessage(error.message || "");
      lines.push(
        `- ${error.provider || providerSummary.provider}: ${error.code || "ERROR"}${
          message ? ` (${message})` : ""
        }`
      );
    }
  }

  if (providerSummary.details?.length) {
    lines.push("", "Details:");
    for (const detail of providerSummary.details) {
      lines.push(`roomId: ${detail.roomId}`);
      lines.push(`provider candidate: ${detail.provider}`);
      lines.push(`result: ${detail.result}`);
      lines.push(`reason: ${detail.reasonCode}`);
      if (detail.remoteChatId) lines.push(`remote id: ${detail.remoteChatId}`);
      if (detail.portalBridgeId) lines.push(`portal id: ${detail.portalBridgeId}`);
      if (detail.evidence) lines.push(`evidence: ${detail.evidence}`);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}

function formatReconciliationSummary(summary = createEmptySummary()) {
  const lines = [`Mode: ${summary.dryRun ? "dry-run" : "apply"}`];
  for (const provider of MATRIX_MESSAGING_PROVIDER_VALUES) {
    lines.push("", formatProviderSummary(summary.providers[provider]));
  }
  return lines.join("\n");
}

module.exports = {
  reconcileAll,
  reconcileProvider,
  reconcileConnection,
  formatReconciliationSummary,
  formatProviderSummary,
  maskIdentifier,
  __test: {
    classificationPatch,
    createProviderSummary,
    hasMeaningfulChange,
    loadConnections,
    loadIntegrationForConnection,
    resultCounter,
    sanitizeErrorMessage,
  },
};
