"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  reconcileConnection,
} = require("../services/messaging/messagingReconciliationService");
const {
  MATRIX_MESSAGING_PROVIDERS,
  MESSAGING_CLASSIFICATION_STATUSES,
  MESSAGING_CONVERSATION_TYPES,
  ROOM_CLASSIFICATION_RESULTS,
} = require("../services/messaging/messagingConstants");
const {
  __test: bridgeEvidenceTest,
} = require("../services/messaging/bridgePortalEvidenceSource");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function room(roomId) {
  return { roomId, stateEvents: [], summary: {} };
}

function makeIntegrationModel(integration) {
  return {
    async findOne() {
      return clone(integration);
    },
    async find() {
      return [clone(integration)];
    },
  };
}

function makeConversationRepo(seed = []) {
  const state = seed.map(clone);

  return {
    state,
    async findByMatrixRoom({ userId, provider, matrixRoomId }) {
      return (
        state.find(
          (doc) =>
            doc.userId === userId &&
            doc.provider === provider &&
            doc.matrixRoomId === matrixRoomId
        ) || null
      );
    },
    async listConversationsForConnection() {
      return state;
    },
    async listProviderConversations({ userId, provider }) {
      return state.filter((doc) => doc.userId === userId && doc.provider === provider);
    },
    async upsertConversationMapping(patch) {
      const index = state.findIndex(
        (doc) =>
          doc.userId === patch.userId &&
          doc.provider === patch.provider &&
          doc.matrixRoomId === patch.matrixRoomId
      );
      if (index === -1) {
        state.push({ _id: `conv-${state.length + 1}`, ...clone(patch) });
        return state[state.length - 1];
      }
      state[index] = { ...state[index], ...clone(patch) };
      return state[index];
    },
    async markStale({ userId, provider, matrixRoomId }) {
      const found = state.find(
        (doc) =>
          doc.userId === userId &&
          doc.provider === provider &&
          doc.matrixRoomId === matrixRoomId
      );
      if (found) found.classificationStatus = MESSAGING_CLASSIFICATION_STATUSES.STALE;
      return found || null;
    },
  };
}

function evidence(provider, portals = []) {
  return bridgeEvidenceTest.indexPortalEvidence(provider, portals);
}

function bridgeEvidence({ whatsapp = [], signal = [] } = {}) {
  return {
    whatsapp: evidence(MATRIX_MESSAGING_PROVIDERS.WHATSAPP, whatsapp),
    signal: evidence(MATRIX_MESSAGING_PROVIDERS.SIGNAL, signal),
    errors: [],
  };
}

async function matrixSessionResolver({ connection }) {
  return {
    userId: connection.userId,
    provider: connection.provider,
    matrixUserId: connection.matrixUserId,
    homeserverUrl: "http://localhost:8008",
    accessToken: "runtime-token",
    managementRoomId: "",
  };
}

test("reconciliation writes verified mapping from bridge portal evidence", async () => {
  const conversationRepo = makeConversationRepo();
  const connection = {
    _id: "64f000000000000000000001",
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    matrixUserId: "@orion_u_user_a_whatsapp:orion.local",
  };

  const summary = await reconcileConnection({
    userId: "user-a",
    connection,
    dryRun: false,
    matrixDiscovery: async () => ({
      ok: true,
      ownerMatched: true,
      rooms: [room("!wa:orion.local")],
      managementRoomId: "",
    }),
    bridgeEvidence: bridgeEvidence({
      whatsapp: [
        {
          roomId: "!wa:orion.local",
          portalId: "12345@s.whatsapp.net",
          type: MESSAGING_CONVERSATION_TYPES.DIRECT,
        },
      ],
    }),
    conversationRepo,
    matrixSessionResolver,
    integrationModel: makeIntegrationModel({
      _id: "64f000000000000000000101",
      userId: "user-a",
      type: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    }),
  });

  assert.equal(summary.verified, 1);
  assert.equal(conversationRepo.state.length, 1);
  assert.equal(
    conversationRepo.state[0].classificationStatus,
    MESSAGING_CLASSIFICATION_STATUSES.VERIFIED
  );
});

test("previously verified mapping becomes stale when portal is no longer seen", async () => {
  const conversationRepo = makeConversationRepo([
    {
      _id: "conv-1",
      userId: "user-a",
      provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
      matrixRoomId: "!old:orion.local",
      classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.VERIFIED,
    },
  ]);

  const summary = await reconcileConnection({
    userId: "user-a",
    connection: {
      _id: "64f000000000000000000002",
      userId: "user-a",
      provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
      matrixUserId: "@orion_u_user_a:orion.local",
    },
    dryRun: false,
    matrixDiscovery: async () => ({
      ok: true,
      ownerMatched: true,
      rooms: [],
      managementRoomId: "",
    }),
    bridgeEvidence: bridgeEvidence(),
    conversationRepo,
    matrixSessionResolver,
    integrationModel: makeIntegrationModel({
      userId: "user-a",
      type: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
    }),
  });

  assert.equal(summary.stale, 1);
  assert.equal(
    conversationRepo.state[0].classificationStatus,
    MESSAGING_CLASSIFICATION_STATUSES.STALE
  );
});

test("reconciliation is idempotent against identical evidence", async () => {
  const conversationRepo = makeConversationRepo();
  const options = {
    userId: "user-a",
    connection: {
      _id: "64f000000000000000000003",
      userId: "user-a",
      provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      matrixUserId: "@orion_u_user_a_whatsapp:orion.local",
    },
    dryRun: false,
    matrixDiscovery: async () => ({
      ok: true,
      ownerMatched: true,
      rooms: [room("!wa:orion.local")],
      managementRoomId: "",
    }),
    bridgeEvidence: bridgeEvidence({
      whatsapp: [{ roomId: "!wa:orion.local", portalId: "12345@s.whatsapp.net" }],
    }),
    conversationRepo,
    matrixSessionResolver,
    integrationModel: makeIntegrationModel({
      userId: "user-a",
      type: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    }),
  };

  const first = await reconcileConnection(options);
  const second = await reconcileConnection(options);

  assert.equal(first.verified, 1);
  assert.equal(second.verified, 1);
  assert.equal(conversationRepo.state.length, 1);
  assert.equal(second.wouldCreate, 0);
  assert.equal(second.wouldUpdate, 0);
});

test("cross-user connection access fails closed", async () => {
  await assert.rejects(
    reconcileConnection({
      userId: "user-b",
      connection: {
        _id: "64f000000000000000000004",
        userId: "user-a",
        provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
      },
      integrationModel: makeIntegrationModel({
        userId: "user-a",
        type: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
      }),
    }),
    /MessagingConnection not found/
  );
});

test("dry-run conflict does not write mappings", async () => {
  const conversationRepo = makeConversationRepo();
  const summary = await reconcileConnection({
    userId: "user-a",
    connection: {
      _id: "64f000000000000000000005",
      userId: "user-a",
      provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
      matrixUserId: "@orion_u_user_a:orion.local",
    },
    dryRun: true,
    matrixDiscovery: async () => ({
      ok: true,
      ownerMatched: true,
      rooms: [room("!wa:orion.local")],
      managementRoomId: "",
    }),
    bridgeEvidence: bridgeEvidence({
      whatsapp: [{ roomId: "!wa:orion.local", portalId: "12345@s.whatsapp.net" }],
    }),
    conversationRepo,
    matrixSessionResolver,
    integrationModel: makeIntegrationModel({
      userId: "user-a",
      type: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
    }),
    details: true,
  });

  assert.equal(summary.conflict, 1);
  assert.equal(summary.details[0].result, ROOM_CLASSIFICATION_RESULTS.CONFLICT);
  assert.equal(conversationRepo.state.length, 0);
});
