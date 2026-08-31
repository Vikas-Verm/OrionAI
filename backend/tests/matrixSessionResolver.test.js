"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "0".repeat(64);

const { encrypt } = require("../services/tokenEncryption");
const {
  resolveMatrixSession,
  verifyMatrixSessionWhoami,
  MATRIX_SESSION_REASON_CODES,
} = require("../services/messaging/matrixSessionResolver");
const {
  discoverMatrixRoomsForConnection,
  buildMatrixAuthHeaders,
} = require("../services/messaging/matrixRoomDiscovery");
const {
  MATRIX_MESSAGING_PROVIDERS,
} = require("../services/messaging/messagingConstants");

function makeIntegration(overrides = {}) {
  return {
    _id: "64f000000000000000000201",
    userId: "user-a",
    type: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    matrix: {
      homeserverUrl: "http://localhost:8008",
      mxid: "@orion_u_user_a_whatsapp:orion.local",
      accessToken: "plain-token",
      managementRoomId: "!management:orion.local",
      bridgeBotMxid: "@whatsappbot:orion.local",
    },
    ...overrides,
  };
}

function integrationModelReturning(integration) {
  return {
    async findOne() {
      return integration;
    },
  };
}

test("encrypted Matrix token is decrypted for runtime session only", async () => {
  const encrypted = encrypt("runtime-token");
  const session = await resolveMatrixSession({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    connection: {
      userId: "user-a",
      provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      matrixUserId: "@orion_u_user_a_whatsapp:orion.local",
    },
    integrationModel: integrationModelReturning(
      makeIntegration({
        matrix: {
          homeserverUrl: "http://localhost:8008",
          mxid: "@orion_u_user_a_whatsapp:orion.local",
          accessToken: encrypted,
        },
      })
    ),
  });

  assert.equal(session.accessToken, "runtime-token");
  assert.notEqual(session.accessToken, encrypted);
});

test("WhatsApp connection cannot resolve a Signal Integration", async () => {
  await assert.rejects(
    resolveMatrixSession({
      userId: "user-a",
      provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      connection: {
        userId: "user-a",
        provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      },
      integrationModel: integrationModelReturning(
        makeIntegration({
          type: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
          matrix: {
            mxid: "@orion_u_user_a:orion.local",
            accessToken: "signal-token",
          },
        })
      ),
    }),
    (err) => err.code === MATRIX_SESSION_REASON_CODES.WRONG_INTEGRATION
  );
});

test("cross-user Matrix session resolution is rejected", async () => {
  await assert.rejects(
    resolveMatrixSession({
      userId: "user-b",
      provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      connection: {
        userId: "user-a",
        provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      },
      integrationModel: integrationModelReturning(makeIntegration()),
    }),
    (err) => err.code === MATRIX_SESSION_REASON_CODES.WRONG_INTEGRATION
  );
});

test("whoami identity mismatch fails before sync", async () => {
  let syncCalled = false;
  const result = await discoverMatrixRoomsForConnection({
    connection: {
      matrixUserId: "@orion_u_user_a_whatsapp:orion.local",
    },
    matrixSession: {
      homeserverUrl: "http://localhost:8008",
      matrixUserId: "@orion_u_user_a_whatsapp:orion.local",
      accessToken: "runtime-token",
      managementRoomId: "",
    },
    client: async ({ path }) => {
      if (path.includes("/sync")) syncCalled = true;
      return {
        data: {
          user_id: "@orion_u_other_whatsapp:orion.local",
        },
      };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, MATRIX_SESSION_REASON_CODES.IDENTITY_MISMATCH);
  assert.equal(syncCalled, false);
});

test("safe whoami verification result does not include access token", async () => {
  const token = "super-secret-runtime-token";
  const result = await verifyMatrixSessionWhoami({
    session: {
      matrixUserId: "@orion_u_user_a:orion.local",
      homeserverUrl: "http://localhost:8008",
      accessToken: token,
    },
    client: {
      async get() {
        return {
          status: 401,
          data: { errcode: "M_UNKNOWN_TOKEN" },
        };
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, MATRIX_SESSION_REASON_CODES.STALE_MATRIX_TOKEN);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("Matrix discovery uses Bearer auth headers", () => {
  assert.deepEqual(buildMatrixAuthHeaders("abc123"), {
    Authorization: "Bearer abc123",
  });
  assert.deepEqual(buildMatrixAuthHeaders(""), {});
});

test("missing Matrix token fails with MATRIX_SESSION_UNAVAILABLE", async () => {
  await assert.rejects(
    resolveMatrixSession({
      userId: "user-a",
      provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      connection: {
        userId: "user-a",
        provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      },
      integrationModel: integrationModelReturning(
        makeIntegration({
          matrix: {
            homeserverUrl: "http://localhost:8008",
            mxid: "@orion_u_user_a_whatsapp:orion.local",
            accessToken: "",
          },
        })
      ),
    }),
    (err) => err.code === MATRIX_SESSION_REASON_CODES.MATRIX_SESSION_UNAVAILABLE
  );
});
