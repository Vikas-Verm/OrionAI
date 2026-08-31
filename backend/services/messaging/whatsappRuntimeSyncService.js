"use strict";

const axios = require("axios");
const Integration = require("../../models/Integration");
const provisioningLogin = require("../bridgeProvisioningLogin");
const connectionRepository = require("./messagingConnectionRepository");
const conversationRepository = require("./messagingConversationRepository");
const { buildConnectionMetadata } = require("./messagingBootstrapService");
const { readWhatsAppPortalEvidence } = require("./bridgePortalEvidenceSource");
const { reconcileConnection } = require("./messagingReconciliationService");
const {
  summarizeWhatsAppPortalInventory,
  inventoryIsReady,
} = require("./whatsappPortalInventory");
const {
  selectReachableAvatar,
  hydrateVerifiedConversationAvatars,
} = require("./whatsappAvatarHydrationService");
const { AVATAR_SOURCES } = require("./messagingConversationMetadata");
const { resolveMatrixSession } = require("./matrixSessionResolver");
const {
  MESSAGING_CONNECTION_STATES,
  MESSAGING_SYNC_STATES,
} = require("./messagingConstants");

const inFlightByUser = new Map();
const lastStartedByUser = new Map();
const DEFAULT_THROTTLE_MS = 120_000;
const PORTAL_RETRY_LIMIT = 3;
const portalAttemptState = new Map();
const historyFollowUpAttemptsByUser = new Map();
const HISTORY_FOLLOW_UP_LIMIT = 40;

function normalizeString(value = "") {
  return String(value || "").trim();
}

function plainDoc(doc = {}) {
  return doc?.toObject ? doc.toObject() : doc || {};
}

function combineInventoryWithHistory(inventory = {}, history = {}, verifiedCount = 0) {
  const remoteEligibleConversationCount = Math.max(
    Number(inventory.eligibleConversationCount || 0),
    Number(history.remoteEligibleConversationCount || 0)
  );
  const pendingConversationCount = Math.max(
    Number(inventory.pendingConversationCount || 0),
    remoteEligibleConversationCount - Number(verifiedCount || 0),
    Number(history.pendingPortalCount || 0)
  );
  return {
    ...inventory,
    eligibleConversationCount: remoteEligibleConversationCount,
    verifiedConversationCount: Number(verifiedCount || 0),
    pendingConversationCount: Math.max(0, pendingConversationCount),
    diagnostics: {
      ...(inventory.diagnostics || {}),
      historyConversationCount: Number(history.conversationCount || 0),
      historyUnprocessedCount: Number(history.unprocessedCount || 0),
      historyPendingPortalCount: Number(history.pendingPortalCount || 0),
    },
  };
}

function safeSyncStatus(connection = null, overrides = {}) {
  const doc = plainDoc(connection);
  return {
    state: normalizeString(overrides.state || doc.syncState) || MESSAGING_SYNC_STATES.CONNECTING,
    remoteState: normalizeString(overrides.remoteState || doc.remoteState) || "UNKNOWN",
    portalCount: Number(overrides.portalCount ?? doc.portalCount ?? 0) || 0,
    discoveredPortalCount:
      Number(overrides.discoveredPortalCount ?? doc.discoveredPortalCount ?? doc.portalCount ?? 0) || 0,
    eligibleConversationCount:
      Number(overrides.eligibleConversationCount ?? doc.eligibleConversationCount ?? 0) || 0,
    verifiedCount: Number(overrides.verifiedCount ?? doc.verifiedCount ?? 0) || 0,
    verifiedConversationCount:
      Number(overrides.verifiedConversationCount ?? overrides.verifiedCount ?? doc.verifiedCount ?? 0) || 0,
    pendingConversationCount:
      Number(overrides.pendingConversationCount ?? doc.pendingConversationCount ?? 0) || 0,
    ignoredCount: Number(overrides.ignoredCount ?? doc.ignoredCount ?? 0) || 0,
    duplicateCount: Number(overrides.duplicateCount ?? doc.duplicateCount ?? 0) || 0,
    failedCount: Number(overrides.failedCount ?? doc.failedCount ?? 0) || 0,
    lastReconcileAt: overrides.lastReconcileAt || doc.lastReconcileAt || null,
    errorCode: normalizeString(overrides.errorCode ?? doc.lastSyncErrorCode),
  };
}

function emitSyncStatus(userId, status) {
  try {
    const { pushToUser } = require("../websocketServer");
    pushToUser(userId, { type: "whatsapp_sync_status", ...status });
  } catch {
    // Websocket infrastructure may not be initialized during scripts/tests.
  }
}

async function ensureInvitedWhatsAppPortalMemberships({
  connection,
  portals = [],
  session,
  httpClient = axios,
} = {}) {
  const expectedBridgeId = normalizeString(connection?.bridgeAppserviceId || "whatsapp");
  const eligibleByRoom = new Map(
    portals
      .filter((portal) =>
        normalizeString(portal.roomId) &&
        ["dm", "group"].includes(normalizeString(portal.remoteChatType)) &&
        !portal.duplicateAlias &&
        !portal.identityAmbiguous &&
        (!normalizeString(portal.bridgeId) || normalizeString(portal.bridgeId) === expectedBridgeId)
      )
      .map((portal) => [normalizeString(portal.roomId), portal])
  );
  if (eligibleByRoom.size === 0) return { joined: 0 };

  const filter = encodeURIComponent(JSON.stringify({ room: { timeline: { limit: 0 } } }));
  const sync = await httpClient.get(
    `${normalizeString(session?.homeserverUrl).replace(/\/+$/, "")}` +
      `/_matrix/client/v3/sync?timeout=0&filter=${filter}`,
    {
      timeout: 20_000,
      validateStatus: () => true,
      headers: { Authorization: `Bearer ${session?.accessToken}` },
    }
  );
  if (sync.status !== 200) {
    const error = new Error("Unable to inspect WhatsApp portal invitations.");
    error.code = `MATRIX_SYNC_${sync.status || 0}`;
    throw error;
  }

  let joined = 0;
  for (const roomId of Object.keys(sync.data?.rooms?.invite || {})) {
    if (!eligibleByRoom.has(roomId)) continue;
    const response = await httpClient.post(
      `${normalizeString(session.homeserverUrl).replace(/\/+$/, "")}` +
        `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`,
      {},
      {
        timeout: 20_000,
        validateStatus: () => true,
        headers: { Authorization: `Bearer ${session.accessToken}` },
      }
    );
    if (response.status !== 200) {
      const error = new Error("Unable to join a bridge-owned WhatsApp portal.");
      error.code = `MATRIX_PORTAL_JOIN_${response.status || 0}`;
      throw error;
    }
    joined += 1;
  }
  return { joined };
}

async function findWhatsAppIntegration(userId, integrationModel = Integration) {
  return integrationModel.findOne({ userId: normalizeString(userId), type: "whatsapp" });
}

async function runWhatsAppRuntimeSync(userId, deps = {}) {
  const ownerId = normalizeString(userId);
  if (!ownerId) throw new Error("userId is required.");
  if (inFlightByUser.has(ownerId)) return inFlightByUser.get(ownerId);

  const promise = (async () => {
    const integrationModel = deps.integrationModel || Integration;
    const connectionRepo = deps.connectionRepo || connectionRepository;
    const conversationRepo = deps.conversationRepo || conversationRepository;
    const accountStateLoader = deps.accountStateLoader || provisioningLogin.getBridgeAccountState;
    const portalEvidenceLoader = deps.portalEvidenceLoader || readWhatsAppPortalEvidence;
    const reconcile = deps.reconcile || reconcileConnection;
    const sessionResolver = deps.sessionResolver || resolveMatrixSession;
    const membershipEnsurer =
      deps.membershipEnsurer || ensureInvitedWhatsAppPortalMemberships;
    const avatarSelector = deps.avatarSelector || selectReachableAvatar;
    const avatarHydrator = deps.avatarHydrator || hydrateVerifiedConversationAvatars;
    const portalCreator = deps.portalCreator || (async (targetUserId, portal) => {
      const { requestBridgeOwnedPortalCreation } = require("../whatsappMatrixService");
      return requestBridgeOwnedPortalCreation(targetUserId, portal);
    });
    const integration = await findWhatsAppIntegration(ownerId, integrationModel);
    const matrixUserId = normalizeString(integration?.matrix?.mxid);
    if (!integration || !matrixUserId) {
      return safeSyncStatus(null, {
        state: MESSAGING_SYNC_STATES.ACTION_REQUIRED,
        remoteState: "DISCONNECTED",
        errorCode: "WHATSAPP_INTEGRATION_MISSING",
      });
    }

    const accountState = await accountStateLoader("whatsapp", matrixUserId);
    const remoteState = normalizeString(
      accountState?.login?.state_event || accountState?.login?.state?.state_event
    ).toUpperCase() || (accountState?.connected ? "CONNECTED" : "DISCONNECTED");
    const metadata = buildConnectionMetadata(integration);
    let connection = await connectionRepo.upsertConnection({
      ...metadata,
      userLoginId: normalizeString(accountState?.userLoginId || metadata.userLoginId),
      remoteAccountId: normalizeString(accountState?.phone || metadata.remoteAccountId),
      remoteAccountDisplay: normalizeString(accountState?.name || metadata.remoteAccountDisplay),
      state: accountState?.connected
        ? MESSAGING_CONNECTION_STATES.CONNECTED
        : MESSAGING_CONNECTION_STATES.ACTION_REQUIRED,
      rawBridgeStateCode: remoteState,
      syncState: accountState?.connected
        ? MESSAGING_SYNC_STATES.CONNECTED_SYNCING
        : MESSAGING_SYNC_STATES.ACTION_REQUIRED,
      remoteState,
      syncStartedAt: new Date(),
      lastSyncErrorCode: "",
    });

    if (!accountState?.connected) {
      const status = safeSyncStatus(connection, {
        state: MESSAGING_SYNC_STATES.ACTION_REQUIRED,
        remoteState,
        errorCode: "REMOTE_LOGIN_NOT_CONNECTED",
      });
      emitSyncStatus(ownerId, status);
      return status;
    }

    emitSyncStatus(ownerId, safeSyncStatus(connection, {
      state: MESSAGING_SYNC_STATES.CONNECTED_SYNCING,
      remoteState,
    }));

    let portalCount = 0;
    try {
      const evidence = await portalEvidenceLoader(plainDoc(connection));
      portalCount = (evidence?.portals || []).length;
      const session = await sessionResolver({
        userId: ownerId,
        provider: "whatsapp",
        connection,
      });
      await membershipEnsurer({
        connection: plainDoc(connection),
        portals: evidence?.portals || [],
        session,
      });
      let createRequests = 0;
      for (const portal of evidence?.portals || []) {
        if (portal.roomId || !["dm", "group"].includes(portal.remoteChatType)) continue;
        if (portal.duplicateAlias || portal.identityAmbiguous) continue;
        const attemptKey = `${ownerId}:${portal.portalFingerprint}`;
        const attempt = portalAttemptState.get(attemptKey) || { attempts: 0 };
        if (attempt.attempts >= PORTAL_RETRY_LIMIT) continue;
        try {
          const creation = await portalCreator(ownerId, portal);
          if (creation?.attempted) {
            portalAttemptState.set(attemptKey, {
              attempts: attempt.attempts + 1,
              lastAttemptAt: Date.now(),
              errorCode: "",
            });
            createRequests += 1;
          }
        } catch (error) {
          portalAttemptState.set(attemptKey, {
            attempts: attempt.attempts + 1,
            lastAttemptAt: Date.now(),
            errorCode: normalizeString(error?.code) || "PORTAL_ROOM_CREATION_FAILED",
          });
        }
      }
      const summary = await reconcile({
        userId: ownerId,
        connection,
        dryRun: false,
        details: false,
        connectionRepo,
        conversationRepo,
        integrationModel,
      });
      if ((summary.errors || []).length > 0 || Number(summary.conflict || 0) > 0) {
        const error = new Error("WhatsApp reconciliation did not complete cleanly.");
        error.code = Number(summary.conflict || 0) > 0
          ? "WHATSAPP_RECONCILIATION_CONFLICT"
          : normalizeString(summary.errors?.[0]?.code) || "WHATSAPP_RECONCILIATION_FAILED";
        throw error;
      }

      const verified = await conversationRepo.listVerifiedConversationsForConnection({
        userId: ownerId,
        provider: "whatsapp",
        connectionId: connection._id,
        limit: 500,
      });
      const verifiedRoomIds = new Set(
        verified.map((item) => normalizeString(item.matrixRoomId)).filter(Boolean)
      );
      const failureByFingerprint = new Map();
      for (const portal of evidence?.portals || []) {
        const attempt = portalAttemptState.get(`${ownerId}:${portal.portalFingerprint}`);
        if (attempt?.attempts >= PORTAL_RETRY_LIMIT) {
          failureByFingerprint.set(
            portal.portalFingerprint,
            attempt.errorCode || "PORTAL_ROOM_CREATION_FAILED"
          );
        }
      }
      const portalInventory = summarizeWhatsAppPortalInventory({
        portals: evidence?.portals || [],
        verifiedRoomIds,
        joinedRoomIds: verifiedRoomIds,
        failureByFingerprint,
      });
      const inventory = combineInventoryWithHistory(
        portalInventory,
        evidence?.history,
        verified.length
      );
      const accountAvatar = await avatarSelector({
        homeserverUrl: session.homeserverUrl,
        accessToken: session.accessToken,
        candidates: accountState?.avatar
          ? [{
              avatarMxc: accountState.avatar,
              avatarSource: AVATAR_SOURCES.REMOTE_PROFILE,
            }]
          : [],
      });
      connection = await connectionRepo.upsertConnection({
        ...plainDoc(connection),
        userId: ownerId,
        provider: "whatsapp",
        integrationId: connection.integrationId,
        remoteAccountAvatarMxc: accountAvatar.avatarMxc,
        remoteAccountAvatarSource: accountAvatar.avatarSource,
        remoteAccountAvatarState: accountAvatar.avatarState,
        remoteAccountAvatarUpdatedAt: accountAvatar.avatarUpdatedAt,
      });
      await avatarHydrator({
        userId: ownerId,
        connection,
        portals: evidence?.portals || [],
        mappings: verified,
        repository: conversationRepo,
        sessionResolver,
      }).catch((error) => {
        console.info("[WhatsApp Sync] avatar hydration deferred:", normalizeString(error?.code || error?.message));
      });
      const now = new Date();
      const ready = inventoryIsReady(inventory);
      connection = await connectionRepo.updateConnectionSync({
        userId: ownerId,
        connectionId: connection._id,
        syncState: ready
          ? MESSAGING_SYNC_STATES.READY
          : inventory.failedCount > 0
            ? MESSAGING_SYNC_STATES.SYNC_FAILED
            : MESSAGING_SYNC_STATES.CONNECTED_SYNCING,
        remoteState,
        portalCount,
        discoveredPortalCount: inventory.discoveredPortalCount,
        eligibleConversationCount: inventory.eligibleConversationCount,
        verifiedCount: verified.length,
        pendingConversationCount: inventory.pendingConversationCount,
        ignoredCount: inventory.ignoredCount,
        duplicateCount: inventory.duplicateCount,
        failedCount: inventory.failedCount,
        syncDiagnostics: inventory.diagnostics,
        lastReconcileAt: now,
        syncStartedAt: connection.syncStartedAt || now,
        lastSyncErrorCode: "",
      });
      const status = safeSyncStatus(connection);
      emitSyncStatus(ownerId, status);
      if (ready) {
        historyFollowUpAttemptsByUser.delete(ownerId);
      }
      const historyFollowUpAttempts = Number(historyFollowUpAttemptsByUser.get(ownerId) || 0);
      if (
        createRequests > 0 ||
        (!ready && inventory.pendingConversationCount > 0 && historyFollowUpAttempts < HISTORY_FOLLOW_UP_LIMIT)
      ) {
        historyFollowUpAttemptsByUser.set(ownerId, historyFollowUpAttempts + 1);
        const followUp = setTimeout(
          () => scheduleWhatsAppRuntimeSync(ownerId, { force: true }),
          15_000
        );
        followUp.unref?.();
      }
      return status;
    } catch (err) {
      const errorCode = normalizeString(err?.code) || "WHATSAPP_RECONCILIATION_FAILED";
      const verified = await conversationRepo.listVerifiedConversationsForConnection({
        userId: ownerId,
        provider: "whatsapp",
        connectionId: connection._id,
        limit: 500,
      }).catch(() => []);
      connection = await connectionRepo.updateConnectionSync({
        userId: ownerId,
        connectionId: connection._id,
        syncState: MESSAGING_SYNC_STATES.SYNC_FAILED,
        remoteState,
        portalCount,
        verifiedCount: verified.length,
        lastReconcileAt: connection.lastReconcileAt || null,
        syncStartedAt: connection.syncStartedAt || new Date(),
        lastSyncErrorCode: errorCode,
      });
      const status = safeSyncStatus(connection);
      emitSyncStatus(ownerId, status);
      return status;
    }
  })().finally(() => {
    inFlightByUser.delete(ownerId);
  });

  inFlightByUser.set(ownerId, promise);
  lastStartedByUser.set(ownerId, Date.now());
  return promise;
}

function scheduleWhatsAppRuntimeSync(userId, { force = false, throttleMs = DEFAULT_THROTTLE_MS } = {}) {
  const ownerId = normalizeString(userId);
  if (!ownerId) return null;
  if (inFlightByUser.has(ownerId)) return inFlightByUser.get(ownerId);
  const lastStartedAt = Number(lastStartedByUser.get(ownerId) || 0);
  if (!force && Date.now() - lastStartedAt < Math.max(1_000, Number(throttleMs || 0))) {
    return null;
  }
  const pending = runWhatsAppRuntimeSync(ownerId);
  pending.catch((err) => {
    console.warn("[WhatsApp Sync] background reconcile failed:", normalizeString(err?.code || err?.message));
  });
  return pending;
}

async function getWhatsAppRuntimeSyncStatus(userId, { trigger = true } = {}) {
  const ownerId = normalizeString(userId);
  let connection = await connectionRepository.findConnection({
    userId: ownerId,
    provider: "whatsapp",
  });
  if (trigger && (!connection || connection.syncState !== MESSAGING_SYNC_STATES.READY)) {
    scheduleWhatsAppRuntimeSync(ownerId, { force: !connection });
  }
  if (!connection) {
    const integration = await findWhatsAppIntegration(ownerId);
    const connected = Boolean(integration?.whatsapp?.connected || integration?.matrix?.loginState === "connected");
    return safeSyncStatus(null, {
      state: connected ? MESSAGING_SYNC_STATES.CONNECTED_SYNCING : MESSAGING_SYNC_STATES.CONNECTING,
      remoteState: connected ? "CONNECTED" : "DISCONNECTED",
    });
  }
  return safeSyncStatus(connection);
}

function resetRuntimeSyncStateForTests() {
  inFlightByUser.clear();
  lastStartedByUser.clear();
  portalAttemptState.clear();
  historyFollowUpAttemptsByUser.clear();
}

module.exports = {
  runWhatsAppRuntimeSync,
  scheduleWhatsAppRuntimeSync,
  getWhatsAppRuntimeSyncStatus,
  __test: {
    safeSyncStatus,
    ensureInvitedWhatsAppPortalMemberships,
    combineInventoryWithHistory,
    resetRuntimeSyncStateForTests,
  },
};
