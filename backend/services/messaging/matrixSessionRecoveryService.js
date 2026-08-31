"use strict";

const axios = require("axios");
const mongoose = require("mongoose");
const Integration = require("../../models/Integration");
const connectionRepository = require("./messagingConnectionRepository");
const {
  resolveMatrixSession,
  verifyMatrixSessionWhoami,
  tokenFingerprint,
  MATRIX_SESSION_REASON_CODES,
} = require("./matrixSessionResolver");
const {
  discoverMatrixRoomsForConnection,
} = require("./matrixRoomDiscovery");
const {
  buildConnectionMetadata,
} = require("./messagingBootstrapService");
const {
  MATRIX_MESSAGING_PROVIDERS,
  assertMessagingProvider,
} = require("./messagingConstants");
const {
  buildHiddenPassword,
  defaultMatrixDeviceName,
  localpartFromMxid,
  loginToMatrix,
  normalizeHomeserverUrl,
  synapseAdminRequest,
} = require("../hiddenMatrixService");

const RECOVERY_REASON_CODES = Object.freeze({
  MATRIX_CREDENTIAL_UNAVAILABLE: "MATRIX_CREDENTIAL_UNAVAILABLE",
  MATRIX_PASSWORD_INVALID: "MATRIX_PASSWORD_INVALID",
  MATRIX_USER_MISSING: "MATRIX_USER_MISSING",
  LOGIN_FLOW_UNAVAILABLE: "LOGIN_FLOW_UNAVAILABLE",
  IDENTITY_MISMATCH: "IDENTITY_MISMATCH",
  NEW_TOKEN_WHOAMI_FAILED: "NEW_TOKEN_WHOAMI_FAILED",
  NEW_TOKEN_SYNC_FAILED: "NEW_TOKEN_SYNC_FAILED",
  WRONG_INTEGRATION: "WRONG_INTEGRATION",
  UNSUPPORTED_PROVIDER: "UNSUPPORTED_PROVIDER",
});

class MatrixSessionRecoveryError extends Error {
  constructor(code, message = code, extras = {}) {
    super(message);
    this.name = "MatrixSessionRecoveryError";
    this.code = code;
    Object.assign(this, extras || {});
  }
}

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

function sanitizeProvider(provider = "") {
  const normalized = assertMessagingProvider(provider);
  if (
    normalized !== MATRIX_MESSAGING_PROVIDERS.SIGNAL &&
    normalized !== MATRIX_MESSAGING_PROVIDERS.WHATSAPP
  ) {
    throw new MatrixSessionRecoveryError(
      RECOVERY_REASON_CODES.UNSUPPORTED_PROVIDER,
      "Matrix session recovery is only enabled for Matrix-backed messaging providers."
    );
  }
  return normalized;
}

function matrixPasswordForProvider({ provider, userId } = {}) {
  if (provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP) {
    return buildHiddenPassword(
      `${normalizeString(userId)}-whatsapp`,
      "orion-hidden-matrix-whatsapp"
    );
  }
  if (provider !== MATRIX_MESSAGING_PROVIDERS.SIGNAL) return "";
  return buildHiddenPassword(userId, "orion-signal-hidden");
}

function deviceDisplayNameForProvider(provider = "") {
  if (provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP) {
    return defaultMatrixDeviceName("OrionAI WhatsApp");
  }
  if (provider === MATRIX_MESSAGING_PROVIDERS.SIGNAL) {
    return defaultMatrixDeviceName("OrionAI Signal");
  }
  return defaultMatrixDeviceName("OrionAI Messaging Backend");
}

async function findConnectionOrFallback({
  userId,
  provider,
  connectionId = "",
  connectionRepo = connectionRepository,
  integration,
}) {
  if (connectionId) {
    return connectionRepo.findConnectionById({ userId, connectionId });
  }
  const existing = await connectionRepo.findConnection({ userId, provider });
  if (existing) return existing;
  if (!integration) return null;
  return {
    ...buildConnectionMetadata(integration),
    _id: "",
    __integrationFallback: true,
  };
}

async function getMatrixLoginFlows({ homeserverUrl, client = axios } = {}) {
  const response = await client.get(
    `${normalizeHomeserverUrl(homeserverUrl)}/_matrix/client/v3/login`,
    {
      timeout: 15_000,
      validateStatus: () => true,
    }
  );
  const flows = Array.isArray(response.data?.flows)
    ? response.data.flows
        .map((flow) => normalizeString(flow.type))
        .filter(Boolean)
    : [];
  return {
    status: response.status,
    flows,
    passwordSupported: flows.includes("m.login.password"),
  };
}

async function matrixUserExists({
  mxid,
  homeserverUrl,
  adminRequest = synapseAdminRequest,
  client = axios,
}) {
  const targetMxid = normalizeString(mxid);
  if (!targetMxid) return false;
  try {
    const response = await adminRequest(
      "GET",
      `/_synapse/admin/v2/users/${encodeURIComponent(targetMxid)}`,
      {
        validateStatus: (status) => status === 200 || status === 404,
        timeout: 15_000,
      }
    );
    return response.status === 200;
  } catch (err) {
    const status = Number(err?.response?.status || 0);
    if (status && status !== 401 && status !== 403) throw err;
  }

  const profile = await client.get(
    `${normalizeHomeserverUrl(homeserverUrl)}/_matrix/client/v3/profile/${encodeURIComponent(
      targetMxid
    )}`,
    {
      timeout: 15_000,
      validateStatus: () => true,
    }
  );
  return profile.status === 200;
}

async function validateNewTokenSync({
  session,
  accessToken,
  matrixDiscovery = discoverMatrixRoomsForConnection,
}) {
  const discovery = await matrixDiscovery({
    connection: { matrixUserId: session.matrixUserId },
    matrixSession: {
      ...session,
      accessToken,
    },
  });
  if (!discovery.ok) {
    throw new MatrixSessionRecoveryError(
      RECOVERY_REASON_CODES.NEW_TOKEN_SYNC_FAILED,
      "New Matrix token could not sync joined rooms.",
      { reasonCode: discovery.reasonCode }
    );
  }
  return discovery.rooms.length;
}

async function persistRecoveredToken({
  integrationModel,
  integration,
  session,
  login,
}) {
  return integrationModel.findOneAndUpdate(
    {
      _id: integration._id,
      userId: integration.userId,
      type: integration.type,
      "matrix.mxid": session.matrixUserId,
    },
    {
      $set: {
        "matrix.homeserverUrl": session.homeserverUrl,
        "matrix.mxid": session.matrixUserId,
        "matrix.accessToken": normalizeString(login.access_token),
        "matrix.deviceId": normalizeString(login.device_id),
        updatedAt: new Date(),
      },
    },
    { new: true }
  );
}

async function loadRecoveryContext({
  userId,
  provider,
  connectionId = "",
  integrationModel = Integration,
  connectionRepo = connectionRepository,
}) {
  const normalizedUserId = normalizeString(userId);
  const normalizedProvider = sanitizeProvider(provider);
  const integration = await integrationModel.findOne({
    userId: normalizedUserId,
    type: normalizedProvider,
  });
  if (!integration) {
    throw new MatrixSessionRecoveryError(
      RECOVERY_REASON_CODES.WRONG_INTEGRATION,
      "Messaging Integration was not found."
    );
  }
  const connection = await findConnectionOrFallback({
    userId: normalizedUserId,
    provider: normalizedProvider,
    connectionId,
    connectionRepo,
    integration,
  });
  if (connectionId && !connection) {
    throw new MatrixSessionRecoveryError(
      RECOVERY_REASON_CODES.WRONG_INTEGRATION,
      "MessagingConnection was not found for this user."
    );
  }
  const session = await resolveMatrixSession({
    userId: normalizedUserId,
    provider: normalizedProvider,
    connection,
    integration,
    connectionRepo,
    integrationModel,
  });
  return {
    userId: normalizedUserId,
    provider: normalizedProvider,
    integration,
    connection,
    session,
  };
}

async function diagnoseMatrixSessionRecovery({
  userId,
  provider,
  connectionId = "",
  integrationModel = Integration,
  connectionRepo = connectionRepository,
  adminRequest = synapseAdminRequest,
  client = axios,
  credentialResolver = matrixPasswordForProvider,
} = {}) {
  const context = await loadRecoveryContext({
    userId,
    provider,
    connectionId,
    integrationModel,
    connectionRepo,
  });
  const password = credentialResolver(context);
  const currentWhoami = await verifyMatrixSessionWhoami({
    session: context.session,
    client,
  });
  const [userExists, loginFlows] = await Promise.all([
    matrixUserExists({
      mxid: context.session.matrixUserId,
      homeserverUrl: context.session.homeserverUrl,
      adminRequest,
      client,
    }),
    getMatrixLoginFlows({ homeserverUrl: context.session.homeserverUrl, client }),
  ]);

  const credentialAvailable = Boolean(password);
  const recoveryPossible = Boolean(
    userExists &&
      credentialAvailable &&
      loginFlows.passwordSupported &&
      context.session.matrixUserId
  );

  return {
    provider: context.provider,
    userId: context.userId,
    integrationId: idString(context.integration._id),
    matrixUserId: context.session.matrixUserId,
    homeserverUrl: context.session.homeserverUrl,
    currentTokenFingerprint: context.session.tokenFingerprint,
    currentTokenStatus: currentWhoami.ok
      ? "valid"
      : currentWhoami.reasonCode || MATRIX_SESSION_REASON_CODES.STALE_MATRIX_TOKEN,
    matrixUserExists: userExists,
    credentialAvailable,
    loginFlows: loginFlows.flows,
    passwordLoginSupported: loginFlows.passwordSupported,
    recoveryPossible,
  };
}

async function recoverMatrixSession({
  userId,
  provider,
  connectionId = "",
  dryRun = true,
  integrationModel = Integration,
  connectionRepo = connectionRepository,
  adminRequest = synapseAdminRequest,
  client = axios,
  loginFn = loginToMatrix,
  matrixDiscovery = discoverMatrixRoomsForConnection,
  credentialResolver = matrixPasswordForProvider,
} = {}) {
  const diagnosis = await diagnoseMatrixSessionRecovery({
    userId,
    provider,
    connectionId,
    integrationModel,
    connectionRepo,
    adminRequest,
    client,
    credentialResolver,
  });

  if (dryRun) return { applied: false, ...diagnosis };
  if (!diagnosis.matrixUserExists) {
    throw new MatrixSessionRecoveryError(
      RECOVERY_REASON_CODES.MATRIX_USER_MISSING,
      "Matrix user is missing."
    );
  }
  if (!diagnosis.credentialAvailable) {
    throw new MatrixSessionRecoveryError(
      RECOVERY_REASON_CODES.MATRIX_CREDENTIAL_UNAVAILABLE,
      "Matrix credential is unavailable."
    );
  }
  if (!diagnosis.passwordLoginSupported) {
    throw new MatrixSessionRecoveryError(
      RECOVERY_REASON_CODES.LOGIN_FLOW_UNAVAILABLE,
      "Password login is not available on the homeserver."
    );
  }

  const context = await loadRecoveryContext({
    userId,
    provider,
    connectionId,
    integrationModel,
    connectionRepo,
  });
  const password = credentialResolver(context);
  if (!password) {
    throw new MatrixSessionRecoveryError(
      RECOVERY_REASON_CODES.MATRIX_CREDENTIAL_UNAVAILABLE,
      "Matrix credential is unavailable."
    );
  }

  let login;
  try {
    login = await loginFn({
      homeserverUrl: context.session.homeserverUrl,
      mxid: context.session.matrixUserId,
      password,
      deviceDisplayName: deviceDisplayNameForProvider(context.provider),
    });
  } catch (err) {
    throw new MatrixSessionRecoveryError(
      RECOVERY_REASON_CODES.MATRIX_PASSWORD_INVALID,
      "Matrix password login failed.",
      { status: err.response?.status || 0 }
    );
  }

  const returnedUserId = normalizeString(login.user_id);
  const newToken = normalizeString(login.access_token);
  if (!newToken || returnedUserId !== context.session.matrixUserId) {
    throw new MatrixSessionRecoveryError(
      RECOVERY_REASON_CODES.IDENTITY_MISMATCH,
      "Matrix login returned a different user."
    );
  }

  const newSession = {
    ...context.session,
    accessToken: newToken,
    tokenFingerprint: tokenFingerprint(newToken),
  };
  const newWhoami = await verifyMatrixSessionWhoami({
    session: newSession,
    client,
  });
  if (!newWhoami.ok) {
    throw new MatrixSessionRecoveryError(
      RECOVERY_REASON_CODES.NEW_TOKEN_WHOAMI_FAILED,
      "New Matrix token did not pass whoami.",
      { reasonCode: newWhoami.reasonCode }
    );
  }

  const joinedRoomCount = await validateNewTokenSync({
    session: context.session,
    accessToken: newToken,
    matrixDiscovery,
  });

  const saved = await persistRecoveredToken({
    integrationModel,
    integration: plainDoc(context.integration),
    session: context.session,
    login,
  });
  if (!saved) {
    throw new MatrixSessionRecoveryError(
      RECOVERY_REASON_CODES.WRONG_INTEGRATION,
      "Messaging Integration token update was rejected."
    );
  }

  return {
    applied: true,
    ...diagnosis,
    oldTokenFingerprint: diagnosis.currentTokenFingerprint,
    newTokenFingerprint: tokenFingerprint(newToken),
    whoami: {
      status: newWhoami.status,
      expectedUserId: newWhoami.expectedUserId,
      returnedUserId: newWhoami.returnedUserId,
      identityMatch: true,
    },
    sync: {
      ok: true,
      joinedRoomCount,
    },
  };
}

function formatRecoverySummary(result = {}) {
  const lines = [
    `Provider: ${result.provider || ""}`,
    `User: ${result.userId || ""}`,
    `Integration found: ${result.integrationId ? "YES" : "NO"}`,
    `Matrix user: ${result.matrixUserId || ""}`,
    `Matrix user exists: ${result.matrixUserExists ? "YES" : "NO"}`,
    `Credential available: ${result.credentialAvailable ? "YES" : "NO"}`,
    `Login flows: ${(result.loginFlows || []).join(", ") || "none"}`,
    `Password login supported: ${result.passwordLoginSupported ? "YES" : "NO"}`,
    `Current token status: ${result.currentTokenStatus || ""}`,
    `Current token fingerprint: ${result.currentTokenFingerprint || ""}`,
    `Recovery possible: ${result.recoveryPossible ? "YES" : "NO"}`,
    `Applied: ${result.applied ? "YES" : "NO"}`,
  ];
  if (result.applied) {
    lines.push(`Old token fingerprint: ${result.oldTokenFingerprint || ""}`);
    lines.push(`New token fingerprint: ${result.newTokenFingerprint || ""}`);
    lines.push(`whoami HTTP: ${result.whoami?.status || 0}`);
    lines.push(`whoami returned user: ${result.whoami?.returnedUserId || ""}`);
    lines.push(`sync joined rooms: ${result.sync?.joinedRoomCount ?? 0}`);
  }
  return lines.join("\n");
}

module.exports = {
  RECOVERY_REASON_CODES,
  MatrixSessionRecoveryError,
  diagnoseMatrixSessionRecovery,
  recoverMatrixSession,
  formatRecoverySummary,
  matrixPasswordForProvider,
  getMatrixLoginFlows,
  matrixUserExists,
  __test: {
    deviceDisplayNameForProvider,
    loadRecoveryContext,
    persistRecoveredToken,
    validateNewTokenSync,
  },
};
