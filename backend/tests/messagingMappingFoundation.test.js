"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const MessagingConnection = require("../models/MessagingConnection");
const MessagingConversationIndex = require("../models/MessagingConversationIndex");
const {
  createMessagingConnectionRepository,
} = require("../services/messaging/messagingConnectionRepository");
const {
  createMessagingConversationRepository,
} = require("../services/messaging/messagingConversationRepository");
const {
  bootstrapMessagingMappings,
} = require("../services/messaging/messagingBootstrapService");
const {
  MATRIX_MESSAGING_PROVIDERS,
  MESSAGING_CLASSIFICATION_STATUSES,
} = require("../services/messaging/messagingConstants");

function clone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function stringifyId(value) {
  if (!value) return "";
  return String(value._id || value);
}

function matchesQuery(doc, query = {}) {
  return Object.entries(query).every(([key, expected]) => {
    const actual = doc[key];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if (Object.prototype.hasOwnProperty.call(expected, "$ne")) {
        return actual !== expected.$ne;
      }
      if (Object.prototype.hasOwnProperty.call(expected, "$in")) {
        return expected.$in.includes(actual);
      }
    }
    if (key === "_id") return stringifyId(actual) === stringifyId(expected);
    if (key.toLowerCase().endsWith("id")) {
      return stringifyId(actual) === stringifyId(expected);
    }
    return actual === expected;
  });
}

function makeQuery(items) {
  return {
    sort(sortSpec = {}) {
      const [[field, direction] = []] = Object.entries(sortSpec);
      if (field) {
        items.sort((left, right) => {
          const a = left[field] || "";
          const b = right[field] || "";
          if (a === b) return 0;
          return direction < 0 ? (a < b ? 1 : -1) : a < b ? -1 : 1;
        });
      }
      return this;
    },
    limit(count) {
      return Promise.resolve(items.slice(0, count).map(clone));
    },
    then(resolve, reject) {
      return Promise.resolve(items.map(clone)).then(resolve, reject);
    },
  };
}

function makeFakeModel(seed = []) {
  const state = seed.map((doc, index) => ({
    _id: doc._id || `doc-${index + 1}`,
    ...clone(doc),
  }));
  let nextId = state.length + 1;

  class FakeModel {
    constructor(doc = {}) {
      Object.assign(this, clone(doc));
      if (!this._id) this._id = `doc-${nextId++}`;
    }

    async save() {
      if (
        this.matrixRoomId &&
        state.some(
          (doc) =>
            doc.userId === this.userId &&
            doc.provider === this.provider &&
            doc.matrixRoomId === this.matrixRoomId &&
            stringifyId(doc._id) !== stringifyId(this._id)
        )
      ) {
        const err = new Error("duplicate key");
        err.code = 11000;
        throw err;
      }
      const index = state.findIndex((doc) => stringifyId(doc._id) === stringifyId(this._id));
      const stored = clone(this);
      if (index === -1) state.push(stored);
      else state[index] = stored;
      return clone(stored);
    }

    static async findOne(query = {}) {
      const found = state.find((doc) => matchesQuery(doc, query));
      return found ? clone(found) : null;
    }

    static find(query = {}) {
      return makeQuery(state.filter((doc) => matchesQuery(doc, query)));
    }

    static async updateOne(query = {}, update = {}) {
      const found = state.find((doc) => matchesQuery(doc, query));
      if (!found) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(found, clone(update.$set || {}));
      return { matchedCount: 1, modifiedCount: 1 };
    }

    static async findOneAndUpdate(query = {}, update = {}, options = {}) {
      let found = state.find((doc) => matchesQuery(doc, query));
      if (!found && options.upsert) {
        found = {
          _id: `doc-${nextId++}`,
          ...(update.$setOnInsert || {}),
        };
        state.push(found);
      }
      if (!found) return null;
      Object.assign(found, clone(update.$set || {}));
      return clone(found);
    }
  }

  FakeModel.state = state;
  return FakeModel;
}

function makeIntegrationModel(integrations = []) {
  return {
    async find(query = {}) {
      const types = query.type?.$in || [];
      return integrations.filter((integration) => types.includes(integration.type)).map(clone);
    },
  };
}

test("WhatsApp Matrix room cannot be returned for Signal provider", async () => {
  const model = makeFakeModel([
    {
      _id: "wa-conv",
      userId: "user-a",
      provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      matrixRoomId: "!room-x:orion.local",
      classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.VERIFIED,
    },
  ]);
  const repo = createMessagingConversationRepository(model);

  const found = await repo.findByMatrixRoom({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
    matrixRoomId: "!room-x:orion.local",
  });

  assert.equal(found, null);
});

test("Signal Matrix room cannot be returned for WhatsApp provider", async () => {
  const model = makeFakeModel([
    {
      _id: "signal-conv",
      userId: "user-a",
      provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
      matrixRoomId: "!room-y:orion.local",
      classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.VERIFIED,
    },
  ]);
  const repo = createMessagingConversationRepository(model);

  const found = await repo.findByMatrixRoom({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    matrixRoomId: "!room-y:orion.local",
  });

  assert.equal(found, null);
});

test("conversation lookup is scoped to the OrionAI user", async () => {
  const model = makeFakeModel([
    {
      _id: "user-b-conv",
      userId: "user-b",
      provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      matrixRoomId: "!room-z:orion.local",
      classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.VERIFIED,
    },
  ]);
  const repo = createMessagingConversationRepository(model);

  const found = await repo.findVerifiedConversation({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    conversationId: "user-b-conv",
  });

  assert.equal(found, null);
});

test("duplicate userId provider matrixRoomId mappings are prevented", async () => {
  const indexes = MessagingConversationIndex.schema.indexes();
  assert.ok(
    indexes.some(
      ([fields, options]) =>
        fields.userId === 1 &&
        fields.provider === 1 &&
        fields.matrixRoomId === 1 &&
        options?.unique === true
    )
  );

  const model = makeFakeModel();
  const repo = createMessagingConversationRepository(model);

  await repo.upsertConversationMapping({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    matrixRoomId: "!same:orion.local",
  });
  await repo.upsertConversationMapping({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    matrixRoomId: "!same:orion.local",
    displayName: "Updated",
  });

  assert.equal(model.state.length, 1);
  assert.equal(model.state[0].displayName, "Updated");
});

test("same Matrix room under WhatsApp and Signal is marked conflict", async () => {
  const model = makeFakeModel();
  const repo = createMessagingConversationRepository(model);

  await repo.upsertConversationMapping({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    matrixRoomId: "!mixed:orion.local",
  });
  const signalResult = await repo.upsertConversationMapping({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
    matrixRoomId: "!mixed:orion.local",
  });

  assert.equal(signalResult.classificationStatus, MESSAGING_CLASSIFICATION_STATUSES.CONFLICT);
  assert.equal(model.state.length, 2);
  assert.ok(
    model.state.every(
      (doc) => doc.classificationStatus === MESSAGING_CLASSIFICATION_STATUSES.CONFLICT
    )
  );
});

test("connection repository rejects cross-user connection access", async () => {
  const model = makeFakeModel([
    {
      _id: "connection-b",
      userId: "user-b",
      provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
    },
  ]);
  const repo = createMessagingConnectionRepository(model);

  const found = await repo.findConnectionById({
    userId: "user-a",
    connectionId: "connection-b",
  });

  assert.equal(found, null);
});

test("verified list excludes unclassified conflict and stale mappings", async () => {
  const model = makeFakeModel([
    {
      _id: "verified",
      userId: "user-a",
      provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      matrixRoomId: "!verified:orion.local",
      classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.VERIFIED,
    },
    {
      _id: "unclassified",
      userId: "user-a",
      provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      matrixRoomId: "!unclassified:orion.local",
      classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.UNCLASSIFIED,
    },
    {
      _id: "conflict",
      userId: "user-a",
      provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      matrixRoomId: "!conflict:orion.local",
      classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.CONFLICT,
    },
    {
      _id: "stale",
      userId: "user-a",
      provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      matrixRoomId: "!stale:orion.local",
      classificationStatus: MESSAGING_CLASSIFICATION_STATUSES.STALE,
    },
  ]);
  const repo = createMessagingConversationRepository(model);

  const conversations = await repo.listVerifiedConversations({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
  });

  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].matrixRoomId, "!verified:orion.local");
});

test("connection repository can list scoped metadata connections", async () => {
  const model = makeFakeModel([
    {
      _id: "wa-a",
      userId: "user-a",
      provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    },
    {
      _id: "signal-a",
      userId: "user-a",
      provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
    },
    {
      _id: "wa-b",
      userId: "user-b",
      provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    },
  ]);
  const repo = createMessagingConnectionRepository(model);

  const userWhatsApp = await repo.listConnections({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
  });

  assert.equal(userWhatsApp.length, 1);
  assert.equal(userWhatsApp[0]._id, "wa-a");
});

test("connection upsert updates the same Integration row when userLoginId appears later", async () => {
  const integrationId = new mongoose.Types.ObjectId();
  const model = makeFakeModel();
  const repo = createMessagingConnectionRepository(model);

  await repo.upsertConnection({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    integrationId,
    matrixUserId: "@orion_u_user_a_whatsapp:orion.local",
  });
  await repo.upsertConnection({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    integrationId,
    matrixUserId: "@orion_u_user_a_whatsapp:orion.local",
    userLoginId: "wa-login-1",
  });

  assert.equal(model.state.length, 1);
  assert.equal(model.state[0].userLoginId, "wa-login-1");
});

test("bootstrap is idempotent for existing Integration records", async () => {
  const integrationId = new mongoose.Types.ObjectId();
  const integrationModel = makeIntegrationModel([
    {
      _id: integrationId,
      userId: "user-a",
      type: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      matrix: {
        mxid: "@orion_u_user_a_whatsapp:orion.local",
        bridgeBotMxid: "@whatsappbot:orion.local",
        loginState: "connected",
        connectedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      whatsapp: {
        connected: true,
        phone: "+10000000000",
        profileName: "User A",
      },
    },
  ]);
  const connectionModel = makeFakeModel();
  const connectionRepo = createMessagingConnectionRepository(connectionModel);
  const conversationRepo = createMessagingConversationRepository(makeFakeModel());

  await bootstrapMessagingMappings({
    dryRun: false,
    integrationModel,
    connectionRepo,
    conversationRepo,
  });
  await bootstrapMessagingMappings({
    dryRun: false,
    integrationModel,
    connectionRepo,
    conversationRepo,
  });

  assert.equal(connectionModel.state.length, 1);
  assert.equal(connectionModel.state[0].userId, "user-a");
  assert.equal(connectionModel.state[0].provider, MATRIX_MESSAGING_PROVIDERS.WHATSAPP);
});

test("new messaging schemas do not contain message content fields", () => {
  const bannedNames = new Set([
    "message",
    "messages",
    "content",
    "body",
    "formattedbody",
    "history",
    "events",
    "timeline",
  ]);

  for (const model of [MessagingConnection, MessagingConversationIndex]) {
    const schemaPathNames = Object.keys(model.schema.paths).map((name) =>
      name.toLowerCase()
    );
    for (const pathName of schemaPathNames) {
      assert.equal(
        bannedNames.has(pathName),
        false,
        `${model.modelName} must not include content field ${pathName}`
      );
    }
  }
});
