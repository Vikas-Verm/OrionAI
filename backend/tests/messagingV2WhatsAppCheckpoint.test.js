"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CHECKPOINT_SEND_STATUSES,
  createPendingSend,
  recordCheckpoint,
  normalizePayload,
  getPendingCount,
  resetForTests,
} = require("../services/messaging/matrixSendCheckpointStore");
const internalMessagingRoutes = require("../routes/internalMessagingRoutes");

test.afterEach(() => {
  resetForTests();
});

test("checkpoint payload normalization extracts only metadata needed for correlation", () => {
  const normalized = normalizePayload({
    event_id: "$event",
    room_id: "!room:orion.local",
    step: "REMOTE",
    status: "SUCCESS",
    body: "must not be stored",
  });

  assert.equal(normalized.eventId, "$event");
  assert.equal(normalized.roomId, "!room:orion.local");
  assert.equal(normalized.step, "REMOTE");
  assert.equal(normalized.success, true);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "body"), false);
});

test("remote success resolves only the exact pending WhatsApp event and room", async () => {
  const pending = createPendingSend({
    provider: "whatsapp",
    userId: "user-a",
    connectionId: "conn-a",
    roomId: "!wa:orion.local",
    eventId: "$event",
    ttlMs: 1000,
  });

  const spoof = recordCheckpoint({
    event_id: "$event",
    room_id: "!other:orion.local",
    step: "REMOTE",
    status: "SUCCESS",
  });
  assert.equal(spoof.accepted, false);
  assert.equal(getPendingCount(), 1);

  const recorded = recordCheckpoint({
    event_id: "$event",
    room_id: "!wa:orion.local",
    step: "REMOTE",
    status: "SUCCESS",
  });
  assert.equal(recorded.accepted, true);

  const result = await pending.promise;
  assert.equal(result.status, CHECKPOINT_SEND_STATUSES.REMOTE_SENT);
  assert.equal(result.remoteSent, true);
  assert.equal(getPendingCount(), 0);
});

test("installed bridge checkpoint envelope is unpacked before correlation", async () => {
  const pending = createPendingSend({
    provider: "whatsapp",
    userId: "user-a",
    roomId: "!wa:orion.local",
    eventId: "$wrapped",
    ttlMs: 1000,
  });
  const results = internalMessagingRoutes.__test.processCheckpointEnvelope({
    checkpoints: [
      {
        event_id: "$wrapped",
        room_id: "!wa:orion.local",
        step: "REMOTE",
        status: "DELIVERED",
      },
    ],
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].accepted, true);
  assert.equal(results[0].userId, "user-a");
  assert.equal((await pending.promise).status, CHECKPOINT_SEND_STATUSES.REMOTE_SENT);
});

test("installed delivery failure statuses are terminal remote failures", async () => {
  const pending = createPendingSend({
    provider: "whatsapp",
    userId: "user-a",
    roomId: "!wa:orion.local",
    eventId: "$delivery-failed",
    ttlMs: 1000,
  });
  recordCheckpoint({
    event_id: "$delivery-failed",
    room_id: "!wa:orion.local",
    step: "REMOTE",
    status: "DELIVERY_FAILED",
  });
  const result = await pending.promise;
  assert.equal(result.status, CHECKPOINT_SEND_STATUSES.REMOTE_FAILED);
  assert.equal(result.remoteSent, false);
});

test("remote failure resolves without retrying or reporting remote success", async () => {
  const pending = createPendingSend({
    provider: "whatsapp",
    userId: "user-a",
    roomId: "!wa:orion.local",
    eventId: "$failure",
    ttlMs: 1000,
  });

  recordCheckpoint({
    event_id: "$failure",
    room_id: "!wa:orion.local",
    step: "REMOTE",
    status: "PERM_FAILURE",
    error: "safe category",
  });

  const result = await pending.promise;
  assert.equal(result.status, CHECKPOINT_SEND_STATUSES.REMOTE_FAILED);
  assert.equal(result.remoteSent, false);
});

test("missing remote checkpoint times out without claiming WhatsApp delivery", async () => {
  const pending = createPendingSend({
    provider: "whatsapp",
    userId: "user-a",
    roomId: "!wa:orion.local",
    eventId: "$timeout",
    ttlMs: 20,
  });

  const result = await pending.promise;
  assert.equal(result.status, CHECKPOINT_SEND_STATUSES.REMOTE_TIMEOUT);
  assert.equal(result.matrixAccepted, true);
  assert.equal(result.remoteSent, false);
});

test("malformed and unknown checkpoints do not resolve pending sends", () => {
  const malformed = recordCheckpoint({ event_id: "$missing-room" });
  assert.equal(malformed.accepted, false);
  assert.equal(malformed.reason, "malformed_checkpoint");

  const unknown = recordCheckpoint({
    event_id: "$unknown",
    room_id: "!wa:orion.local",
    step: "REMOTE",
    status: "SUCCESS",
  });
  assert.equal(unknown.accepted, false);
  assert.equal(unknown.reason, "unknown_event");
});

test("checkpoint auth helpers accept bearer tokens and use secure exact matching", () => {
  const { extractBearerToken, secureTokenEqual } = internalMessagingRoutes.__test;
  const req = {
    get(name) {
      return name === "authorization" ? "Bearer token-a" : "";
    },
    query: {},
    body: {},
  };

  assert.equal(extractBearerToken(req), "token-a");
  assert.equal(secureTokenEqual("token-a", "token-a"), true);
  assert.equal(secureTokenEqual("token-a", "token-b"), false);
  assert.equal(secureTokenEqual("", ""), false);
});
