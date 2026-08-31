"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { classifyRoom } = require("../services/messaging/roomClassifier");
const {
  MATRIX_MESSAGING_PROVIDERS,
  ROOM_CLASSIFICATION_RESULTS,
  ROOM_CLASSIFICATION_REASON_CODES,
  MESSAGING_CONVERSATION_TYPES,
} = require("../services/messaging/messagingConstants");
const {
  __test: bridgeEvidenceTest,
} = require("../services/messaging/bridgePortalEvidenceSource");

function room(roomId, stateEvents = [], extra = {}) {
  return { roomId, stateEvents, ...extra };
}

function member(mxid, membership = "join") {
  return {
    type: "m.room.member",
    state_key: mxid,
    content: { membership },
  };
}

function name(value) {
  return { type: "m.room.name", content: { name: value } };
}

function evidence(provider, portals = []) {
  return bridgeEvidenceTest.indexPortalEvidence(provider, portals);
}

function bridgeEvidence({ whatsapp = [], signal = [] } = {}) {
  return {
    whatsapp: evidence(MATRIX_MESSAGING_PROVIDERS.WHATSAPP, whatsapp),
    signal: evidence(MATRIX_MESSAGING_PROVIDERS.SIGNAL, signal),
    errors: [],
  };
}

test("WhatsApp room with portal evidence and Matrix owner is verified", () => {
  const result = classifyRoom({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    connection: {
      matrixUserId: "@orion_u_user_a_whatsapp:orion.local",
      bridgeBotMxid: "@whatsappbot:orion.local",
    },
    matrixRoom: room("!wa:orion.local", [
      member("@orion_u_user_a_whatsapp:orion.local"),
      member("@whatsappbot:orion.local"),
    ]),
    bridgeEvidence: bridgeEvidence({
      whatsapp: [
        {
          roomId: "!wa:orion.local",
          portalId: "12345@s.whatsapp.net",
          name: "Rahul",
          type: MESSAGING_CONVERSATION_TYPES.DIRECT,
        },
      ],
    }),
    ownerMatched: true,
  });

  assert.equal(result.status, ROOM_CLASSIFICATION_RESULTS.VERIFIED);
  assert.equal(result.provider, MATRIX_MESSAGING_PROVIDERS.WHATSAPP);
  assert.equal(result.remoteChatId, "12345@s.whatsapp.net");
  assert.equal(result.reasonCode, ROOM_CLASSIFICATION_REASON_CODES.BRIDGE_PORTAL_MATCH);
});

test("Signal room with portal evidence and Matrix owner is verified", () => {
  const result = classifyRoom({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
    connection: {
      matrixUserId: "@orion_u_user_a:orion.local",
      bridgeBotMxid: "@signalbot:orion.local",
    },
    matrixRoom: room("!signal:orion.local", [
      member("@orion_u_user_a:orion.local"),
      member("@signalbot:orion.local"),
    ]),
    bridgeEvidence: bridgeEvidence({
      signal: [
        {
          roomId: "!signal:orion.local",
          portalId: "uuid-1",
          otherUserId: "aci-1",
          name: "Mira",
          type: MESSAGING_CONVERSATION_TYPES.DIRECT,
        },
      ],
    }),
    ownerMatched: true,
  });

  assert.equal(result.status, ROOM_CLASSIFICATION_RESULTS.VERIFIED);
  assert.equal(result.provider, MATRIX_MESSAGING_PROVIDERS.SIGNAL);
  assert.equal(result.remoteChatId, "aci-1");
});

test("WhatsApp room passed to Signal is not verified as Signal", () => {
  const result = classifyRoom({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
    connection: { matrixUserId: "@orion_u_user_a:orion.local" },
    matrixRoom: room("!wa:orion.local"),
    bridgeEvidence: bridgeEvidence({
      whatsapp: [{ roomId: "!wa:orion.local", portalId: "12345@s.whatsapp.net" }],
    }),
    ownerMatched: true,
  });

  assert.equal(result.status, ROOM_CLASSIFICATION_RESULTS.CONFLICT);
  assert.equal(
    result.reasonCode,
    ROOM_CLASSIFICATION_REASON_CODES.PROVIDER_EVIDENCE_CONFLICT
  );
});

test("Signal room passed to WhatsApp is not verified as WhatsApp", () => {
  const result = classifyRoom({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    connection: { matrixUserId: "@orion_u_user_a_whatsapp:orion.local" },
    matrixRoom: room("!signal:orion.local"),
    bridgeEvidence: bridgeEvidence({
      signal: [{ roomId: "!signal:orion.local", portalId: "uuid-1" }],
    }),
    ownerMatched: true,
  });

  assert.equal(result.status, ROOM_CLASSIFICATION_RESULTS.CONFLICT);
});

test("strong WhatsApp and Signal evidence for same room is conflict", () => {
  const result = classifyRoom({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    connection: { matrixUserId: "@orion_u_user_a_whatsapp:orion.local" },
    matrixRoom: room("!mixed:orion.local"),
    bridgeEvidence: bridgeEvidence({
      whatsapp: [{ roomId: "!mixed:orion.local", portalId: "12345@s.whatsapp.net" }],
      signal: [{ roomId: "!mixed:orion.local", portalId: "uuid-1" }],
    }),
    ownerMatched: true,
  });

  assert.equal(result.status, ROOM_CLASSIFICATION_RESULTS.CONFLICT);
  assert.equal(
    result.reasonCode,
    ROOM_CLASSIFICATION_REASON_CODES.PROVIDER_EVIDENCE_CONFLICT
  );
});

test("misleading WhatsApp room name does not override Signal bridge evidence", () => {
  const result = classifyRoom({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
    connection: { matrixUserId: "@orion_u_user_a:orion.local" },
    matrixRoom: room("!signal:orion.local", [name("WhatsApp Rahul")]),
    bridgeEvidence: bridgeEvidence({
      signal: [{ roomId: "!signal:orion.local", portalId: "uuid-1" }],
    }),
    ownerMatched: true,
  });

  assert.equal(result.status, ROOM_CLASSIFICATION_RESULTS.VERIFIED);
  assert.equal(result.provider, MATRIX_MESSAGING_PROVIDERS.SIGNAL);
});

test("m.direct-like hints do not verify a room without bridge portal evidence", () => {
  const result = classifyRoom({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    connection: { matrixUserId: "@orion_u_user_a_whatsapp:orion.local" },
    matrixRoom: room("!direct:orion.local", [], { directProviderHint: "whatsapp" }),
    bridgeEvidence: bridgeEvidence(),
    ownerMatched: true,
  });

  assert.equal(result.status, ROOM_CLASSIFICATION_RESULTS.UNCLASSIFIED);
  assert.equal(result.reasonCode, ROOM_CLASSIFICATION_REASON_CODES.INSUFFICIENT_EVIDENCE);
});

test("ghost prefix alone is weak evidence and cannot verify a room", () => {
  const result = classifyRoom({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    connection: { matrixUserId: "@orion_u_user_a_whatsapp:orion.local" },
    matrixRoom: room("!ghost:orion.local", [member("@whatsapp_12345:orion.local")]),
    bridgeEvidence: bridgeEvidence(),
    ownerMatched: true,
  });

  assert.equal(result.status, ROOM_CLASSIFICATION_RESULTS.UNCLASSIFIED);
});

test("management room is ignored", () => {
  const result = classifyRoom({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    connection: {
      matrixUserId: "@orion_u_user_a_whatsapp:orion.local",
      bridgeBotMxid: "@whatsappbot:orion.local",
    },
    matrixRoom: room("!management:orion.local", [member("@whatsappbot:orion.local")]),
    bridgeEvidence: bridgeEvidence(),
    ownerMatched: true,
    managementRoomId: "!management:orion.local",
  });

  assert.equal(result.status, ROOM_CLASSIFICATION_RESULTS.IGNORED);
  assert.equal(result.reasonCode, ROOM_CLASSIFICATION_REASON_CODES.MANAGEMENT_ROOM);
});

test("raw Matrix room ID alone is insufficient for verified ownership", () => {
  const result = classifyRoom({
    userId: "user-a",
    provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
    connection: { matrixUserId: "@orion_u_user_a:orion.local" },
    matrixRoom: room("!raw:orion.local"),
    bridgeEvidence: bridgeEvidence(),
    ownerMatched: true,
  });

  assert.equal(result.status, ROOM_CLASSIFICATION_RESULTS.UNCLASSIFIED);
});
