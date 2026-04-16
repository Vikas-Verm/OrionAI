"use strict";

const axios = require("axios");
const crypto = require("crypto");

function defaultHomeserverUrl() {
  return process.env.MATRIX_HOMESERVER_URL || "http://localhost:8008";
}

function defaultMatrixServerDomain() {
  return process.env.MATRIX_SERVER_DOMAIN || "orion.local";
}

function defaultMatrixDeviceName(fallback = "OrionAI Bridge") {
  return process.env.MATRIX_DEVICE_NAME || fallback;
}

function normalizeHomeserverUrl(value = "") {
  return String(value || defaultHomeserverUrl())
    .trim()
    .replace(/\/+$/, "");
}

function normalizeMxid(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("@") ? raw : `@${raw}`;
}

function localpartFromMxid(mxid = "") {
  const normalized = normalizeMxid(mxid);
  if (!normalized) return "";
  return normalized.replace(/^@/, "").split(":")[0] || "";
}

function safeHiddenLocalpart(userId = "") {
  const cleaned = String(userId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `orion_u_${cleaned || "user"}`.slice(0, 64);
}

function buildHiddenMxid(userId = "") {
  return `@${safeHiddenLocalpart(userId)}:${defaultMatrixServerDomain()}`;
}

function buildHiddenPassword(userId = "", namespace = "orion-hidden-matrix-whatsapp") {
  const secretSeed =
    process.env.ENCRYPTION_KEY ||
    process.env.MATRIX_ADMIN_ACCESS_TOKEN ||
    process.env.JWT_SECRET ||
    namespace;

  return crypto
    .createHmac("sha256", secretSeed)
    .update(String(userId || ""))
    .digest("base64url");
}

function getMatrixAdminAccessToken() {
  const token = String(process.env.MATRIX_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) {
    throw new Error("Matrix admin access is not configured.");
  }
  return token;
}

async function synapseAdminRequest(method, path, options = {}) {
  return axios({
    method,
    url: `${normalizeHomeserverUrl(defaultHomeserverUrl())}${path}`,
    params: options.params,
    data: options.data,
    timeout: options.timeout || 20_000,
    validateStatus: options.validateStatus,
    headers: {
      Authorization: `Bearer ${getMatrixAdminAccessToken()}`,
      ...(options.headers || {}),
    },
  });
}

async function ensureHiddenMatrixAccount(
  userId,
  {
    displayName = "OrionAI Bridge",
    forceResetPassword = false,
    passwordNamespace = "orion-hidden-matrix",
  } = {}
) {
  const mxid = normalizeMxid(buildHiddenMxid(userId));
  const password = buildHiddenPassword(userId, passwordNamespace);
  const userPath = `/_synapse/admin/v2/users/${encodeURIComponent(mxid)}`;

  const lookup = await synapseAdminRequest("GET", userPath, {
    validateStatus: (status) => status === 200 || status === 404,
  });

  if (lookup.status === 404 || forceResetPassword) {
    await synapseAdminRequest("PUT", userPath, {
      data: {
        password,
        displayname: String(displayName || "OrionAI Bridge").trim(),
        admin: false,
        deactivated: false,
      },
      timeout: 30_000,
    });
  }

  return {
    homeserverUrl: normalizeHomeserverUrl(defaultHomeserverUrl()),
    mxid,
    password,
  };
}

async function loginToMatrix({
  homeserverUrl,
  mxid,
  password,
  deviceDisplayName = defaultMatrixDeviceName(),
}) {
  const normalizedMxid = normalizeMxid(mxid);
  const localpart = localpartFromMxid(normalizedMxid);

  if (!normalizedMxid || !localpart || !password) {
    throw new Error("Matrix bridge session could not be created.");
  }

  const base = normalizeHomeserverUrl(homeserverUrl);
  const payloads = [
    {
      type: "m.login.password",
      identifier: { type: "m.id.user", user: localpart },
      user: localpart,
      password,
      initial_device_display_name: deviceDisplayName,
    },
    {
      type: "m.login.password",
      identifier: { type: "m.id.user", user: normalizedMxid },
      user: normalizedMxid,
      password,
      initial_device_display_name: deviceDisplayName,
    },
  ];

  let lastError = null;
  for (const payload of payloads) {
    try {
      const { data } = await axios.post(
        `${base}/_matrix/client/v3/login`,
        payload,
        { timeout: 15_000 }
      );
      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    String(
      lastError?.response?.data?.error ||
        lastError?.message ||
        "Matrix bridge login failed."
    ).trim()
  );
}

function createMatrixError(message, sourceError = null, extras = {}) {
  const error = new Error(String(message || "Matrix request failed."));
  if (sourceError?.response) error.response = sourceError.response;
  if (sourceError?.code) error.code = sourceError.code;
  if (sourceError?.cause) error.cause = sourceError.cause;
  Object.assign(error, extras || {});
  return error;
}

function matrixErrorStatus(error) {
  return Number(error?.response?.status || 0) || 0;
}

function getMatrixErrCode(error) {
  return String(error?.response?.data?.errcode || "").trim();
}

function isMatrixAuthFailure(error) {
  const status = matrixErrorStatus(error);
  const errcode = getMatrixErrCode(error);
  return (
    status === 401 ||
    status === 403 ||
    errcode === "M_FORBIDDEN" ||
    errcode === "M_UNKNOWN_TOKEN"
  );
}

function isMatrixNotInRoomError(error) {
  return (
    matrixErrorStatus(error) === 403 &&
    /not in room/i.test(
      String(error?.response?.data?.error || error?.message || "")
    )
  );
}

function getMatrixRetryAfterMs(error) {
  const responseValue = Number(error?.response?.data?.retry_after_ms || 0);
  if (responseValue > 0) return responseValue;

  const headerValue = Number(error?.response?.headers?.["retry-after"] || 0);
  if (headerValue > 0) {
    return headerValue < 1000 ? headerValue * 1000 : headerValue;
  }

  return 0;
}

function isMatrixRateLimitedError(error) {
  return (
    matrixErrorStatus(error) === 429 ||
    getMatrixErrCode(error) === "M_LIMIT_EXCEEDED" ||
    /too many requests/i.test(String(error?.message || ""))
  );
}

function buildTxnId(prefix = "matrix") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = {
  defaultHomeserverUrl,
  defaultMatrixServerDomain,
  defaultMatrixDeviceName,
  normalizeHomeserverUrl,
  normalizeMxid,
  localpartFromMxid,
  safeHiddenLocalpart,
  buildHiddenMxid,
  buildHiddenPassword,
  getMatrixAdminAccessToken,
  synapseAdminRequest,
  ensureHiddenMatrixAccount,
  loginToMatrix,
  createMatrixError,
  matrixErrorStatus,
  getMatrixErrCode,
  isMatrixAuthFailure,
  isMatrixNotInRoomError,
  getMatrixRetryAfterMs,
  isMatrixRateLimitedError,
  buildTxnId,
};
