"use strict";

const axios = require("axios");
const {
  MATRIX_SESSION_REASON_CODES,
} = require("./matrixSessionResolver");

const SAFE_STATE_EVENT_TYPES = new Set([
  "m.room.member",
  "m.room.name",
  "m.room.avatar",
  "m.room.topic",
  "m.bridge",
  "uk.half-shot.bridge",
  "m.room.canonical_alias",
]);

function normalizeString(value = "") {
  return String(value || "").trim();
}

function normalizeHomeserverUrl(value = "") {
  return normalizeString(value || "http://localhost:8008").replace(/\/+$/, "");
}

function defaultHomeserverUrl(provider = "") {
  if (provider === "signal") {
    return (
      process.env.MATRIX_HOMESERVER_URL ||
      process.env.SIGNAL_MATRIX_HOMESERVER_URL ||
      "http://localhost:8008"
    );
  }
  return process.env.MATRIX_HOMESERVER_URL || "http://localhost:8008";
}

function getIntegrationMatrix(integration = {}) {
  const matrix = integration?.matrix || {};
  const providerData = integration?.[integration?.type] || {};
  const provider = normalizeString(integration?.type).toLowerCase();
  return {
    homeserverUrl: normalizeHomeserverUrl(
      matrix.homeserverUrl || providerData.homeserverUrl || defaultHomeserverUrl(provider)
    ),
    accessToken: normalizeString(matrix.accessToken || providerData.accessToken),
    mxid: normalizeString(matrix.mxid || providerData.mxid),
    managementRoomId: normalizeString(
      matrix.managementRoomId || providerData.managementRoomId
    ),
  };
}

function sanitizeEvent(event = {}) {
  const type = normalizeString(event.type);
  if (!SAFE_STATE_EVENT_TYPES.has(type)) return null;
  const safe = {
    type,
    state_key: event.state_key,
    sender: event.sender,
    content: {},
  };
  const content = event.content || {};
  if (type === "m.room.member") {
    safe.content = {
      membership: normalizeString(content.membership),
      displayname: normalizeString(content.displayname),
      avatar_url: normalizeString(content.avatar_url),
    };
  } else if (type === "m.room.name") {
    safe.content = { name: normalizeString(content.name) };
  } else if (type === "m.room.avatar") {
    safe.content = { url: normalizeString(content.url) };
  } else if (type === "m.room.topic") {
    safe.content = { topic: normalizeString(content.topic) };
  } else if (type === "m.room.canonical_alias") {
    safe.content = { alias: normalizeString(content.alias) };
  } else if (type === "m.bridge" || type === "uk.half-shot.bridge") {
    safe.content = {
      bridgebot: normalizeString(content.bridgebot),
      protocol: normalizeString(content.protocol?.id || content.protocol),
      network: normalizeString(content.network?.id || content.network),
      channel: normalizeString(content.channel?.id || content.channel),
    };
  }
  return safe;
}

function sanitizeRoomData(roomId = "", roomData = {}) {
  const stateEvents = [
    ...(roomData.state?.events || []),
    ...(roomData.timeline?.events || []).filter((event) =>
      SAFE_STATE_EVENT_TYPES.has(event?.type)
    ),
  ]
    .map(sanitizeEvent)
    .filter(Boolean);

  return {
    roomId: normalizeString(roomId),
    stateEvents,
    summary: {
      joinedMemberCount:
        Number(roomData.summary?.["m.joined_member_count"] || 0) || 0,
      invitedMemberCount:
        Number(roomData.summary?.["m.invited_member_count"] || 0) || 0,
    },
  };
}

async function matrixGet({ homeserverUrl, accessToken, path, params = {} }) {
  return axios.get(`${normalizeHomeserverUrl(homeserverUrl)}${path}`, {
    params,
    timeout: 20_000,
    headers: buildMatrixAuthHeaders(accessToken),
  });
}

function buildMatrixAuthHeaders(accessToken = "") {
  const token = normalizeString(accessToken);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function discoverMatrixRoomsForConnection({
  connection,
  integration,
  matrixSession = null,
  client = matrixGet,
}) {
  const matrix =
    matrixSession || getIntegrationMatrix(integration);
  const expectedMxid = normalizeString(
    connection?.matrixUserId || matrix.matrixUserId || matrix.mxid
  );
  if (!matrix.accessToken || !matrix.homeserverUrl || !expectedMxid) {
    return {
      ok: false,
      reasonCode: MATRIX_SESSION_REASON_CODES.MATRIX_SESSION_UNAVAILABLE,
      ownerMatched: false,
      rooms: [],
      managementRoomId: matrix.managementRoomId,
    };
  }

  const whoami = await client({
    homeserverUrl: matrix.homeserverUrl,
    accessToken: matrix.accessToken,
    path: "/_matrix/client/v3/account/whoami",
  });
  const actualMxid = normalizeString(whoami.data?.user_id);
  if (actualMxid !== expectedMxid) {
    return {
      ok: false,
      reasonCode: MATRIX_SESSION_REASON_CODES.IDENTITY_MISMATCH,
      ownerMatched: false,
      actualMxid,
      expectedMxid,
      rooms: [],
      managementRoomId: matrix.managementRoomId,
    };
  }

  const filter = JSON.stringify({
    room: {
      timeline: { limit: 0 },
      state: { lazy_load_members: false },
      ephemeral: { limit: 0 },
      account_data: { limit: 0 },
    },
    presence: { limit: 0 },
  });
  const sync = await client({
    homeserverUrl: matrix.homeserverUrl,
    accessToken: matrix.accessToken,
    path: "/_matrix/client/v3/sync",
    params: {
      timeout: 0,
      filter,
    },
  });

  const joined = sync.data?.rooms?.join || {};
  const rooms = Object.entries(joined).map(([roomId, roomData]) =>
    sanitizeRoomData(roomId, roomData)
  );

  return {
    ok: true,
    ownerMatched: true,
    actualMxid,
    expectedMxid,
    rooms,
    managementRoomId: matrix.managementRoomId,
  };
}

module.exports = {
  discoverMatrixRoomsForConnection,
  sanitizeRoomData,
  sanitizeEvent,
  getIntegrationMatrix,
  matrixGet,
  buildMatrixAuthHeaders,
  __test: {
    SAFE_STATE_EVENT_TYPES,
    defaultHomeserverUrl,
  },
};
