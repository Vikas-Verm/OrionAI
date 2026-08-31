"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  reconcileProvider,
} = require("../services/messaging/messagingReconciliationService");
const {
  MATRIX_MESSAGING_PROVIDERS,
  ROOM_CLASSIFICATION_RESULTS,
  MESSAGING_CONVERSATION_TYPES,
} = require("../services/messaging/messagingConstants");
const {
  __test: bridgeEvidenceTest,
} = require("../services/messaging/bridgePortalEvidenceSource");

const connections = [
  {
    _id: "64f000000000000000000011",
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    matrixUserId: "@orion_u_user_a_whatsapp:orion.local",
  },
  {
    _id: "64f000000000000000000012",
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
    matrixUserId: "@orion_u_user_a:orion.local",
  },
];

function room(roomId) {
  return { roomId, stateEvents: [], summary: {} };
}

function makeConnectionRepo() {
  return {
    async listConnections({ userId = "", provider = "" } = {}) {
      return connections.filter(
        (connection) =>
          (!userId || connection.userId === userId) &&
          (!provider || connection.provider === provider)
      );
    },
    async findConnectionById({ userId, connectionId }) {
      return connections.find(
        (connection) =>
          connection.userId === userId && String(connection._id) === String(connectionId)
      );
    },
  };
}

function makeIntegrationModel() {
  return {
    async findOne(query = {}) {
      return {
        _id:
          query.type === MATRIX_MESSAGING_PROVIDERS.WHATSAPP
            ? "64f000000000000000000111"
            : "64f000000000000000000112",
        userId: query.userId,
        type: query.type,
      };
    },
    async find(query = {}) {
      const types = query.type?.$in || [];
      return types.map((type) => ({ userId: query.userId || "user-a", type }));
    },
  };
}

function makeConversationRepo() {
  return {
    async findByMatrixRoom() {
      return null;
    },
    async listConversationsForConnection() {
      return [];
    },
    async listProviderConversations() {
      return [];
    },
    async upsertConversationMapping() {
      throw new Error("dry-run regression test should not write");
    },
    async markStale() {
      throw new Error("dry-run regression test should not mark stale");
    },
  };
}

function evidence(provider, portals = []) {
  return bridgeEvidenceTest.indexPortalEvidence(provider, portals);
}

async function runProvider(provider) {
  return reconcileProvider({
    userId: "user-a",
    provider,
    dryRun: true,
    details: true,
    connectionRepo: makeConnectionRepo(),
    conversationRepo: makeConversationRepo(),
    integrationModel: makeIntegrationModel(),
    matrixDiscovery: async () => ({
      ok: true,
      ownerMatched: true,
      rooms: [room("!wa:orion.local"), room("!signal:orion.local")],
      managementRoomId: "",
    }),
    bridgeEvidenceSource: async () => ({
      whatsapp: evidence(MATRIX_MESSAGING_PROVIDERS.WHATSAPP, [
        {
          roomId: "!wa:orion.local",
          portalId: "12345@s.whatsapp.net",
          type: MESSAGING_CONVERSATION_TYPES.DIRECT,
        },
      ]),
      signal: evidence(MATRIX_MESSAGING_PROVIDERS.SIGNAL, [
        {
          roomId: "!signal:orion.local",
          portalId: "signal-portal-id",
          otherUserId: "signal-recipient-id",
          type: MESSAGING_CONVERSATION_TYPES.DIRECT,
        },
      ]),
      errors: [],
    }),
    matrixSessionResolver: async ({ connection }) => ({
      userId: connection.userId,
      provider: connection.provider,
      matrixUserId: connection.matrixUserId,
      homeserverUrl: "http://localhost:8008",
      accessToken: "runtime-token",
      managementRoomId: "",
    }),
  });
}

test("provider isolation regression: WhatsApp verified mappings contain zero Signal rooms", async () => {
  const summary = await runProvider(MATRIX_MESSAGING_PROVIDERS.WHATSAPP);
  const verifiedRooms = summary.details
    .filter((detail) => detail.result === ROOM_CLASSIFICATION_RESULTS.VERIFIED)
    .map((detail) => detail.roomId);

  assert.deepEqual(verifiedRooms, ["!wa:orion.local"]);
  assert.equal(verifiedRooms.includes("!signal:orion.local"), false);
  assert.equal(summary.conflict, 1);
});

test("provider isolation regression: Signal verified mappings contain zero WhatsApp rooms", async () => {
  const summary = await runProvider(MATRIX_MESSAGING_PROVIDERS.SIGNAL);
  const verifiedRooms = summary.details
    .filter((detail) => detail.result === ROOM_CLASSIFICATION_RESULTS.VERIFIED)
    .map((detail) => detail.roomId);

  assert.deepEqual(verifiedRooms, ["!signal:orion.local"]);
  assert.equal(verifiedRooms.includes("!wa:orion.local"), false);
  assert.equal(summary.conflict, 1);
});
