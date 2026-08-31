"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "1".repeat(64);

const { decrypt, encrypt } = require("../services/tokenEncryption");
const {
  recoverMatrixSession,
  diagnoseMatrixSessionRecovery,
  RECOVERY_REASON_CODES,
  formatRecoverySummary,
  matrixPasswordForProvider,
} = require("../services/messaging/matrixSessionRecoveryService");
const {
  MATRIX_MESSAGING_PROVIDERS,
} = require("../services/messaging/messagingConstants");

const USER_ID = "vikasverma";
const SIGNAL_MXID = "@orion_u_vikasverma:orion.local";
const WHATSAPP_MXID = "@orion_u_vikasverma_whatsapp:orion.local";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeIntegration(overrides = {}) {
  return {
    _id: "64f000000000000000000301",
    userId: USER_ID,
    type: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
    matrix: {
      homeserverUrl: "http://localhost:8008",
      mxid: SIGNAL_MXID,
      accessToken: encrypt("old-token"),
      deviceId: "old-device",
      managementRoomId: "!management:orion.local",
      bridgeBotMxid: "@signalbot:orion.local",
    },
    signal: {
      remoteLoginUntouched: "yes",
    },
    ...overrides,
  };
}

function makeIntegrationModel(integration = makeIntegration()) {
  const state = clone(integration);
  const updates = [];
  return {
    state,
    updates,
    async findOne(query = {}) {
      if (
        query.userId &&
        query.type &&
        query.userId === state.userId &&
        query.type === state.type
      ) {
        return clone(state);
      }
      return null;
    },
    async findOneAndUpdate(query = {}, update = {}) {
      if (
        String(query._id) !== String(state._id) ||
        query.userId !== state.userId ||
        query.type !== state.type ||
        query["matrix.mxid"] !== state.matrix.mxid
      ) {
        return null;
      }
      updates.push(clone(update));
      for (const [key, value] of Object.entries(update.$set || {})) {
        if (key === "matrix.accessToken") state.matrix.accessToken = encrypt(value);
        else if (key.startsWith("matrix.")) {
          state.matrix[key.slice("matrix.".length)] = value;
        } else {
          state[key] = value;
        }
      }
      return clone(state);
    },
  };
}

function makeConnectionRepo(connection = null) {
  return {
    async findConnection({ userId, provider }) {
      if (!connection) return null;
      return connection.userId === userId && connection.provider === provider
        ? clone(connection)
        : null;
    },
    async findConnectionById() {
      return connection ? clone(connection) : null;
    },
  };
}

function makeClient({
  currentWhoamiStatus = 401,
  currentWhoamiUser = "",
  newAccessToken = "new-token",
  newWhoamiStatus = 200,
  newWhoamiUser = SIGNAL_MXID,
  loginFlows = ["m.login.password"],
} = {}) {
  return {
    async get(url, options = {}) {
      if (url.includes("/_matrix/client/v3/login")) {
        return {
          status: 200,
          data: { flows: loginFlows.map((type) => ({ type })) },
        };
      }
      if (url.includes("/account/whoami")) {
        const auth = options.headers?.Authorization || "";
        const isNew = auth === `Bearer ${newAccessToken}`;
        return {
          status: isNew ? newWhoamiStatus : currentWhoamiStatus,
          data: {
            user_id: isNew ? newWhoamiUser : currentWhoamiUser,
            errcode:
              (isNew ? newWhoamiStatus : currentWhoamiStatus) === 401
                ? "M_UNKNOWN_TOKEN"
                : "",
          },
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    },
  };
}

async function adminRequest(method, path, options = {}) {
  assert.equal(method, "GET");
  assert.ok(path.includes("/_synapse/admin/v2/users/"));
  return { status: options.missingUser ? 404 : 200, data: {} };
}

async function matrixDiscoveryOk() {
  return {
    ok: true,
    ownerMatched: true,
    rooms: [{ roomId: "!signal:orion.local", stateEvents: [] }],
    managementRoomId: "",
  };
}

function baseOptions(overrides = {}) {
  return {
    userId: USER_ID,
    provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
    integrationModel: makeIntegrationModel(),
    connectionRepo: makeConnectionRepo(),
    adminRequest,
    client: makeClient(),
    credentialResolver: () => "matrix-password",
    loginFn: async () => ({
      user_id: SIGNAL_MXID,
      access_token: "new-token",
      device_id: "new-device",
    }),
    matrixDiscovery: matrixDiscoveryOk,
    ...overrides,
  };
}

test("stale token with valid credential logs in and saves encrypted new token", async () => {
  const integrationModel = makeIntegrationModel();
  const result = await recoverMatrixSession(
    baseOptions({ dryRun: false, integrationModel })
  );

  assert.equal(result.applied, true);
  assert.equal(result.whoami.identityMatch, true);
  assert.equal(result.sync.joinedRoomCount, 1);
  assert.equal(decrypt(integrationModel.state.matrix.accessToken), "new-token");
  assert.notEqual(integrationModel.state.matrix.accessToken, "new-token");
  assert.equal(integrationModel.state.signal.remoteLoginUntouched, "yes");
});

test("WhatsApp stale token recovery uses the WhatsApp Matrix credential", async () => {
  const integrationModel = makeIntegrationModel(
    makeIntegration({
      type: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      matrix: {
        homeserverUrl: "http://localhost:8008",
        mxid: WHATSAPP_MXID,
        accessToken: encrypt("old-whatsapp-token"),
        deviceId: "old-whatsapp-device",
        managementRoomId: "!whatsapp-management:orion.local",
        bridgeBotMxid: "@whatsappbot:orion.local",
      },
      whatsapp: {
        remoteLoginUntouched: "yes",
      },
    })
  );
  let observedPassword = "";

  const result = await recoverMatrixSession(
    baseOptions({
      dryRun: false,
      provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      integrationModel,
      client: makeClient({
        newAccessToken: "new-whatsapp-token",
        newWhoamiUser: WHATSAPP_MXID,
      }),
      credentialResolver: (context) => {
        observedPassword = matrixPasswordForProvider(context);
        return observedPassword;
      },
      loginFn: async ({ password }) => {
        assert.equal(password, observedPassword);
        return {
          user_id: WHATSAPP_MXID,
          access_token: "new-whatsapp-token",
          device_id: "new-whatsapp-device",
        };
      },
    })
  );

  assert.equal(result.applied, true);
  assert.equal(result.whoami.returnedUserId, WHATSAPP_MXID);
  assert.equal(Boolean(observedPassword), true);
  assert.equal(decrypt(integrationModel.state.matrix.accessToken), "new-whatsapp-token");
  assert.notEqual(integrationModel.state.matrix.accessToken, "new-whatsapp-token");
  assert.equal(integrationModel.state.whatsapp.remoteLoginUntouched, "yes");
});

test("login returning a different MXID is rejected and does not save token", async () => {
  const integrationModel = makeIntegrationModel();
  await assert.rejects(
    recoverMatrixSession(
      baseOptions({
        dryRun: false,
        integrationModel,
        loginFn: async () => ({
          user_id: "@orion_u_other:orion.local",
          access_token: "new-token",
        }),
      })
    ),
    (err) => err.code === RECOVERY_REASON_CODES.IDENTITY_MISMATCH
  );

  assert.equal(integrationModel.updates.length, 0);
});

test("cross-user recovery is rejected", async () => {
  await assert.rejects(
    recoverMatrixSession(
      baseOptions({
        userId: "other-user",
        connectionRepo: makeConnectionRepo({
          userId: USER_ID,
          provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
        }),
      })
    ),
    (err) => err.code === RECOVERY_REASON_CODES.WRONG_INTEGRATION
  );
});

test("wrong provider Integration is rejected", async () => {
  await assert.rejects(
    recoverMatrixSession(
      baseOptions({
        integrationModel: makeIntegrationModel(
          makeIntegration({ type: MATRIX_MESSAGING_PROVIDERS.WHATSAPP })
        ),
      })
    ),
    (err) => err.code === RECOVERY_REASON_CODES.WRONG_INTEGRATION
  );
});

test("credential unavailable blocks recovery without mutation", async () => {
  const integrationModel = makeIntegrationModel();
  const diagnosis = await diagnoseMatrixSessionRecovery(
    baseOptions({
      integrationModel,
      credentialResolver: () => "",
    })
  );
  assert.equal(diagnosis.credentialAvailable, false);
  assert.equal(diagnosis.recoveryPossible, false);

  await assert.rejects(
    recoverMatrixSession(
      baseOptions({
        dryRun: false,
        integrationModel,
        credentialResolver: () => "",
      })
    ),
    (err) => err.code === RECOVERY_REASON_CODES.MATRIX_CREDENTIAL_UNAVAILABLE
  );
  assert.equal(integrationModel.updates.length, 0);
});

test("invalid Matrix password blocks recovery without mutation", async () => {
  const integrationModel = makeIntegrationModel();
  await assert.rejects(
    recoverMatrixSession(
      baseOptions({
        dryRun: false,
        integrationModel,
        loginFn: async () => {
          const err = new Error("Invalid username or password");
          err.response = { status: 403 };
          throw err;
        },
      })
    ),
    (err) => err.code === RECOVERY_REASON_CODES.MATRIX_PASSWORD_INVALID
  );
  assert.equal(integrationModel.updates.length, 0);
});

test("new token whoami failure blocks persistence", async () => {
  const integrationModel = makeIntegrationModel();
  await assert.rejects(
    recoverMatrixSession(
      baseOptions({
        dryRun: false,
        integrationModel,
        client: makeClient({ newWhoamiStatus: 401, newWhoamiUser: "" }),
      })
    ),
    (err) => err.code === RECOVERY_REASON_CODES.NEW_TOKEN_WHOAMI_FAILED
  );
  assert.equal(integrationModel.updates.length, 0);
});

test("new token sync failure blocks persistence", async () => {
  const integrationModel = makeIntegrationModel();
  await assert.rejects(
    recoverMatrixSession(
      baseOptions({
        dryRun: false,
        integrationModel,
        matrixDiscovery: async () => ({
          ok: false,
          reasonCode: "SYNC_FAILED",
          rooms: [],
        }),
      })
    ),
    (err) => err.code === RECOVERY_REASON_CODES.NEW_TOKEN_SYNC_FAILED
  );
  assert.equal(integrationModel.updates.length, 0);
});

test("recovery summaries never contain access tokens", async () => {
  const result = await recoverMatrixSession(baseOptions({ dryRun: true }));
  const summary = formatRecoverySummary({
    ...result,
    oldTokenFingerprint: "old12345",
    newTokenFingerprint: "new12345",
  });

  assert.equal(summary.includes("old-token"), false);
  assert.equal(summary.includes("new-token"), false);
  assert.equal(summary.includes("matrix-password"), false);
});

test("recovery update is limited to Matrix token session metadata", async () => {
  const integrationModel = makeIntegrationModel();
  await recoverMatrixSession(baseOptions({ dryRun: false, integrationModel }));
  const updateKeys = Object.keys(integrationModel.updates[0].$set || {}).sort();

  assert.deepEqual(updateKeys, [
    "matrix.accessToken",
    "matrix.deviceId",
    "matrix.homeserverUrl",
    "matrix.mxid",
    "updatedAt",
  ]);
});
