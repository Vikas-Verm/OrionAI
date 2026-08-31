"use strict";

const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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

function getSharedSecretAdminMxid() {
  const localpart = String(
    process.env.MATRIX_SHARED_SECRET_ADMIN_LOCALPART || "orion_matrix_admin"
  )
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._=-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `@${localpart || "orion_matrix_admin"}:${defaultMatrixServerDomain()}`;
}

function getSharedSecretAdminPassword() {
  return buildHiddenPassword(
    getSharedSecretAdminMxid(),
    "orion-synapse-shared-secret-admin"
  );
}

function defaultRegistrationSharedSecret() {
  const envSecret = String(
    process.env.MATRIX_REGISTRATION_SHARED_SECRET ||
      process.env.SYNAPSE_REGISTRATION_SHARED_SECRET ||
      ""
  ).trim();
  if (envSecret) return envSecret;

  try {
    const contents = fs.readFileSync(
      path.resolve(__dirname, "../../infra/synapse/homeserver.yaml"),
      "utf8"
    );
    return String(
      contents.match(/^registration_shared_secret:\s*"([^"]+)"\s*$/m)?.[1] ||
        contents.match(/^registration_shared_secret:\s*([^\s#]+)\s*$/m)?.[1] ||
        ""
    ).trim();
  } catch {
    return "";
  }
}

// Transient network errors. Synapse occasionally drops connections
// (especially when Docker overlay networks are under churn) — retrying
// makes account creation/lookup resilient to one-off blips.
const ADMIN_RETRIABLE_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNABORTED",
  "EAI_AGAIN",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
]);

function isRetriableAdminError(error) {
  if (!error) return false;
  const code = String(error.code || "").toUpperCase();
  if (ADMIN_RETRIABLE_CODES.has(code)) return true;
  const status = Number(error.response?.status || 0);
  return status === 502 || status === 503 || status === 504;
}

function isAdminAuthFailure(error) {
  const status = Number(error?.response?.status || 0);
  const errcode = String(error?.response?.data?.errcode || "").trim();
  return (
    status === 401 ||
    status === 403 ||
    errcode === "M_FORBIDDEN" ||
    errcode === "M_UNKNOWN_TOKEN"
  );
}

async function synapseAdminRequest(method, path, options = {}) {
  const maxAttempts = options.maxAttempts || 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await axios({
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
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !isRetriableAdminError(err)) throw err;
      const backoffMs = Math.min(500 * 2 ** (attempt - 1) + 500, 4000);
      console.warn(
        "[Synapse admin] %s %s failed (%s) attempt %d/%d, retrying in %dms",
        method,
        path,
        err.code || err.response?.status || err.message,
        attempt,
        maxAttempts,
        backoffMs
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastError;
}

async function getSharedSecretAdminAccessToken() {
  const mxid = getSharedSecretAdminMxid();
  const password = getSharedSecretAdminPassword();

  await registerMatrixAccountWithSharedSecret({
    homeserverUrl: defaultHomeserverUrl(),
    mxid,
    password,
    admin: true,
  }).catch((err) => {
    const errcode = String(err?.response?.data?.errcode || "").trim();
    if (errcode !== "M_USER_IN_USE") throw err;
  });

  const login = await loginToMatrix({
    homeserverUrl: defaultHomeserverUrl(),
    mxid,
    password,
    deviceDisplayName: "OrionAI Synapse Admin",
  });

  return String(login.access_token || "").trim();
}

async function synapseAdminRequestWithToken(token, method, path, options = {}) {
  return axios({
    method,
    url: `${normalizeHomeserverUrl(defaultHomeserverUrl())}${path}`,
    params: options.params,
    data: options.data,
    timeout: options.timeout || 20_000,
    validateStatus: options.validateStatus,
    headers: {
      Authorization: `Bearer ${String(token || "").trim()}`,
      ...(options.headers || {}),
    },
  });
}

async function resetMatrixAccountWithSharedSecretAdmin({
  mxid,
  password,
  displayName = "OrionAI Bridge",
} = {}) {
  const normalizedMxid = normalizeMxid(mxid);
  if (!normalizedMxid || !password) {
    throw new Error("Matrix account reset needs a user and password.");
  }
  const token = await getSharedSecretAdminAccessToken();
  const userPath = `/_synapse/admin/v2/users/${encodeURIComponent(
    normalizedMxid
  )}`;
  await synapseAdminRequestWithToken(token, "PUT", userPath, {
    data: {
      password,
      displayname: String(displayName || "OrionAI Bridge").trim(),
      admin: false,
      deactivated: false,
    },
    timeout: 30_000,
  });
  return {
    homeserverUrl: normalizeHomeserverUrl(defaultHomeserverUrl()),
    mxid: normalizedMxid,
    password,
  };
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

  let lookup = null;
  try {
    lookup = await synapseAdminRequest("GET", userPath, {
      validateStatus: (status) => status === 200 || status === 404,
    });
  } catch (err) {
    if (!isAdminAuthFailure(err)) throw err;

    await registerMatrixAccountWithSharedSecret({
      homeserverUrl: defaultHomeserverUrl(),
      mxid,
      password,
      admin: false,
    }).catch((registerErr) => {
      const errcode = String(registerErr?.response?.data?.errcode || "").trim();
      if (errcode !== "M_USER_IN_USE") throw registerErr;
      return resetMatrixAccountWithSharedSecretAdmin({
        mxid,
        password,
        displayName,
      });
    });
    return {
      homeserverUrl: normalizeHomeserverUrl(defaultHomeserverUrl()),
      mxid,
      password,
    };
  }

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

async function registerMatrixAccountWithSharedSecret({
  homeserverUrl = defaultHomeserverUrl(),
  mxid,
  password,
  admin = false,
} = {}) {
  const secret = defaultRegistrationSharedSecret();
  const normalizedMxid = normalizeMxid(mxid);
  const username = localpartFromMxid(normalizedMxid);
  if (!secret || !username || !password) {
    throw new Error("Matrix shared-secret registration is not configured.");
  }

  const base = normalizeHomeserverUrl(homeserverUrl);
  const nonceResponse = await axios.get(`${base}/_synapse/admin/v1/register`, {
    timeout: 15_000,
  });
  const nonce = String(nonceResponse.data?.nonce || "").trim();
  if (!nonce) {
    throw new Error("Matrix shared-secret registration did not return a nonce.");
  }

  const adminText = admin ? "admin" : "notadmin";
  const mac = crypto
    .createHmac("sha1", secret)
    .update(nonce)
    .update("\0")
    .update(username)
    .update("\0")
    .update(password)
    .update("\0")
    .update(adminText)
    .digest("hex");

  await axios.post(
    `${base}/_synapse/admin/v1/register`,
    {
      nonce,
      username,
      password,
      admin: Boolean(admin),
      mac,
    },
    { timeout: 20_000 }
  );

  return {
    homeserverUrl: base,
    mxid: normalizedMxid,
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

  // Retry transient network errors per payload — login is a critical path
  // and ECONNRESET / 502 here aborts the whole connect flow with an opaque
  // error. 3 attempts with exponential backoff covers transient blips.
  async function tryLogin(payload) {
    const maxAttempts = 3;
    let attemptErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const { data } = await axios.post(
          `${base}/_matrix/client/v3/login`,
          payload,
          { timeout: 15_000 }
        );
        return { data };
      } catch (err) {
        attemptErr = err;
        if (attempt >= maxAttempts || !isRetriableAdminError(err)) {
          return { error: err };
        }
        const backoffMs = Math.min(500 * 2 ** (attempt - 1) + 500, 4000);
        console.warn(
          "[Matrix login] %s attempt %d/%d failed (%s), retrying in %dms",
          localpart,
          attempt,
          maxAttempts,
          err.code || err.response?.status || err.message,
          backoffMs
        );
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    return { error: attemptErr };
  }

  let lastError = null;
  for (const payload of payloads) {
    const { data, error } = await tryLogin(payload);
    if (data) return data;
    lastError = error;
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
  defaultRegistrationSharedSecret,
  registerMatrixAccountWithSharedSecret,
  getSharedSecretAdminAccessToken,
  resetMatrixAccountWithSharedSecretAdmin,
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
