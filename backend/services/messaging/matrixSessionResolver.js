"use strict";

const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Integration = require("../../models/Integration");
const connectionRepository = require("./messagingConnectionRepository");
const { decryptIntegration } = require("../tokenEncryption");
const {
  buildHiddenMxid,
  normalizeHomeserverUrl,
} = require("../hiddenMatrixService");
const {
  MATRIX_MESSAGING_PROVIDERS,
  assertMessagingProvider,
} = require("./messagingConstants");

const MATRIX_SESSION_REASON_CODES = Object.freeze({
  MATRIX_SESSION_UNAVAILABLE: "MATRIX_SESSION_UNAVAILABLE",
  WRONG_INTEGRATION: "WRONG_INTEGRATION",
  WRONG_MATRIX_USER: "WRONG_MATRIX_USER",
  IDENTITY_MISMATCH: "IDENTITY_MISMATCH",
  STALE_MATRIX_TOKEN: "STALE_MATRIX_TOKEN",
});

class MatrixSessionError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "MatrixSessionError";
    this.code = code;
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

function defaultHomeserverUrl(provider = "") {
  if (provider === MATRIX_MESSAGING_PROVIDERS.SIGNAL) {
    return (
      process.env.MATRIX_HOMESERVER_URL ||
      process.env.SIGNAL_MATRIX_HOMESERVER_URL ||
      "http://localhost:8008"
    );
  }
  return process.env.MATRIX_HOMESERVER_URL || "http://localhost:8008";
}

function defaultMxidForProvider(provider = "", userId = "") {
  if (provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP) {
    return buildHiddenMxid(`${normalizeString(userId)}_whatsapp`);
  }
  if (provider === MATRIX_MESSAGING_PROVIDERS.SIGNAL) {
    return buildHiddenMxid(userId);
  }
  return "";
}

function tokenFingerprint(accessToken = "") {
  const token = normalizeString(accessToken);
  if (!token) return "";
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 8);
}

function buildSessionFromIntegration(integration = {}, provider = "") {
  const normalizedProvider = assertMessagingProvider(provider);
  const doc = plainDoc(integration);
  const matrix = decryptIntegration("matrix", doc.matrix || {}) || {};
  const providerData =
    decryptIntegration(normalizedProvider, doc[normalizedProvider] || {}) || {};
  const userId = normalizeString(doc.userId);

  const homeserverUrl = normalizeHomeserverUrl(
    matrix.homeserverUrl ||
      providerData.homeserverUrl ||
      defaultHomeserverUrl(normalizedProvider)
  );
  const matrixUserId = normalizeString(
    matrix.mxid ||
      providerData.mxid ||
      defaultMxidForProvider(normalizedProvider, userId)
  );
  const accessToken = normalizeString(
    matrix.accessToken || providerData.accessToken
  );

  return {
    userId,
    provider: normalizedProvider,
    integrationId: idString(doc._id),
    matrixUserId,
    homeserverUrl,
    accessToken,
    managementRoomId: normalizeString(
      matrix.managementRoomId || providerData.managementRoomId
    ),
    bridgeBotMxid: normalizeString(
      matrix.bridgeBotMxid || providerData.bridgeBotMxid
    ),
    tokenFingerprint: tokenFingerprint(accessToken),
  };
}

async function findIntegrationForConnection({
  userId,
  provider,
  connection = null,
  integration = null,
  integrationModel = Integration,
}) {
  if (integration) return integration;
  const normalizedUserId = normalizeString(userId);
  const normalizedProvider = assertMessagingProvider(provider);
  const connectionDoc = plainDoc(connection);
  const integrationId = idString(connectionDoc.integrationId);
  if (integrationId && mongoose.Types.ObjectId.isValid(integrationId)) {
    return integrationModel.findOne({
      _id: connectionDoc.integrationId,
      userId: normalizedUserId,
      type: normalizedProvider,
    });
  }
  return integrationModel.findOne({
    userId: normalizedUserId,
    type: normalizedProvider,
  });
}

function validateOwnership({ userId, provider, connection = null, integration }) {
  const normalizedUserId = normalizeString(userId);
  const normalizedProvider = assertMessagingProvider(provider);
  const connectionDoc = plainDoc(connection);
  const integrationDoc = plainDoc(integration);

  if (connectionDoc.userId && normalizeString(connectionDoc.userId) !== normalizedUserId) {
    throw new MatrixSessionError(
      MATRIX_SESSION_REASON_CODES.WRONG_INTEGRATION,
      "Messaging connection is not owned by the requested user."
    );
  }
  if (connectionDoc.provider && connectionDoc.provider !== normalizedProvider) {
    throw new MatrixSessionError(
      MATRIX_SESSION_REASON_CODES.WRONG_INTEGRATION,
      "Messaging connection provider mismatch."
    );
  }
  if (normalizeString(integrationDoc.userId) !== normalizedUserId) {
    throw new MatrixSessionError(
      MATRIX_SESSION_REASON_CODES.WRONG_INTEGRATION,
      "Integration is not owned by the requested user."
    );
  }
  if (normalizeString(integrationDoc.type) !== normalizedProvider) {
    throw new MatrixSessionError(
      MATRIX_SESSION_REASON_CODES.WRONG_INTEGRATION,
      "Integration provider mismatch."
    );
  }

  const connectionIntegrationId = idString(connectionDoc.integrationId);
  if (
    connectionIntegrationId &&
    mongoose.Types.ObjectId.isValid(connectionIntegrationId) &&
    connectionIntegrationId !== idString(integrationDoc._id)
  ) {
    throw new MatrixSessionError(
      MATRIX_SESSION_REASON_CODES.WRONG_INTEGRATION,
      "Messaging connection points at a different Integration."
    );
  }
}

async function resolveMatrixSession({
  userId,
  provider,
  connectionId = "",
  connection = null,
  integration = null,
  connectionRepo = connectionRepository,
  integrationModel = Integration,
} = {}) {
  const normalizedUserId = normalizeString(userId);
  const normalizedProvider = assertMessagingProvider(provider);
  if (!normalizedUserId) {
    throw new MatrixSessionError(
      MATRIX_SESSION_REASON_CODES.MATRIX_SESSION_UNAVAILABLE,
      "userId is required."
    );
  }

  let connectionDoc = connection ? plainDoc(connection) : null;
  if (!connectionDoc && connectionId) {
    connectionDoc = await connectionRepo.findConnectionById({
      userId: normalizedUserId,
      connectionId,
    });
  }

  if (connectionDoc) {
    validateOwnership({
      userId: normalizedUserId,
      provider: normalizedProvider,
      connection: connectionDoc,
      integration: {
        userId: normalizedUserId,
        type: normalizedProvider,
        _id: connectionDoc.integrationId || undefined,
      },
    });
  }

  const integrationDoc = await findIntegrationForConnection({
    userId: normalizedUserId,
    provider: normalizedProvider,
    connection: connectionDoc,
    integration,
    integrationModel,
  });
  if (!integrationDoc) {
    throw new MatrixSessionError(
      MATRIX_SESSION_REASON_CODES.MATRIX_SESSION_UNAVAILABLE,
      "Matrix Integration session is unavailable."
    );
  }

  validateOwnership({
    userId: normalizedUserId,
    provider: normalizedProvider,
    connection: connectionDoc,
    integration: integrationDoc,
  });

  const session = buildSessionFromIntegration(integrationDoc, normalizedProvider);
  const expectedConnectionMxid = normalizeString(connectionDoc?.matrixUserId);
  if (expectedConnectionMxid && expectedConnectionMxid !== session.matrixUserId) {
    throw new MatrixSessionError(
      MATRIX_SESSION_REASON_CODES.WRONG_MATRIX_USER,
      "Messaging connection Matrix user does not match Integration Matrix user."
    );
  }
  if (!session.matrixUserId || !session.homeserverUrl || !session.accessToken) {
    throw new MatrixSessionError(
      MATRIX_SESSION_REASON_CODES.MATRIX_SESSION_UNAVAILABLE,
      "Matrix access token is unavailable."
    );
  }

  return session;
}

async function verifyMatrixSessionWhoami({ session, client = axios } = {}) {
  if (!session?.accessToken || !session?.homeserverUrl || !session?.matrixUserId) {
    return {
      ok: false,
      reasonCode: MATRIX_SESSION_REASON_CODES.MATRIX_SESSION_UNAVAILABLE,
      status: 0,
      expectedUserId: session?.matrixUserId || "",
      returnedUserId: "",
    };
  }

  const response = await client.get(
    `${normalizeHomeserverUrl(session.homeserverUrl)}/_matrix/client/v3/account/whoami`,
    {
      timeout: 15_000,
      validateStatus: () => true,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    }
  );
  const returnedUserId = normalizeString(response.data?.user_id);
  if (response.status === 200 && returnedUserId === session.matrixUserId) {
    return {
      ok: true,
      reasonCode: "",
      status: response.status,
      expectedUserId: session.matrixUserId,
      returnedUserId,
    };
  }
  if (response.status === 200) {
    return {
      ok: false,
      reasonCode: MATRIX_SESSION_REASON_CODES.IDENTITY_MISMATCH,
      status: response.status,
      expectedUserId: session.matrixUserId,
      returnedUserId,
    };
  }
  return {
    ok: false,
    reasonCode:
      response.status === 401
        ? MATRIX_SESSION_REASON_CODES.STALE_MATRIX_TOKEN
        : MATRIX_SESSION_REASON_CODES.MATRIX_SESSION_UNAVAILABLE,
    status: response.status,
    errcode: normalizeString(response.data?.errcode),
    expectedUserId: session.matrixUserId,
    returnedUserId,
  };
}

module.exports = {
  MATRIX_SESSION_REASON_CODES,
  MatrixSessionError,
  resolveMatrixSession,
  verifyMatrixSessionWhoami,
  buildSessionFromIntegration,
  tokenFingerprint,
  __test: {
    defaultMxidForProvider,
    defaultHomeserverUrl,
    validateOwnership,
  },
};
