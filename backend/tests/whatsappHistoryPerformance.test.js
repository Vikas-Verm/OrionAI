"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const MessagingConversationIndex = require("../models/MessagingConversationIndex");
const whatsappService = require("../services/whatsappMatrixService");

const {
  buildJoinedMemberStateEvents,
  buildMediaDescriptor,
  cacheVerifiedWhatsAppHistoryContexts,
  clampWhatsAppHistoryLimit,
  getCachedWhatsAppHistoryContext,
  parseRoomEvents,
  whatsappHistoryEventFilter,
} = whatsappService.__test;

test("verified WhatsApp history uses a small bounded first page", () => {
  assert.equal(clampWhatsAppHistoryLimit(undefined), 25);
  assert.equal(clampWhatsAppHistoryLimit(25), 25);
  assert.equal(clampWhatsAppHistoryLimit(500), 50);
  assert.equal(clampWhatsAppHistoryLimit(0), 25);
});

test("Matrix history filter excludes room state and membership noise", () => {
  const filter = JSON.parse(whatsappHistoryEventFilter);
  assert.ok(filter.types.includes("m.room.message"));
  assert.ok(filter.types.includes("m.reaction"));
  assert.ok(filter.types.includes("m.room.redaction"));
  assert.equal(filter.types.includes("m.room.member"), false);
  assert.equal(filter.types.includes("m.room.power_levels"), false);
});

test("joined member metadata is converted once for request-scoped sender lookup", () => {
  const events = buildJoinedMemberStateEvents({
    "@one:orion.local": {
      display_name: "One",
      avatar_url: "mxc://orion.local/one",
    },
    "@two:orion.local": { display_name: "Two" },
  });
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => event.state_key).sort(),
    ["@one:orion.local", "@two:orion.local"]
  );
});

test("reply previews resolve only from the fetched page without per-reply I/O", () => {
  const roomData = {
    state: {
      events: buildJoinedMemberStateEvents({
        "@orion_u_user_whatsapp:orion.local": { display_name: "You" },
        "@whatsapp_contact:orion.local": { display_name: "Contact" },
      }),
    },
    timeline: {
      events: [
        {
          type: "m.room.message",
          event_id: "$first",
          sender: "@whatsapp_contact:orion.local",
          origin_server_ts: 1,
          content: { msgtype: "m.text", body: "Earlier" },
        },
        {
          type: "m.room.message",
          event_id: "$reply-known",
          sender: "@whatsapp_contact:orion.local",
          origin_server_ts: 2,
          content: {
            msgtype: "m.text",
            body: "Reply",
            "m.relates_to": { "m.in_reply_to": { event_id: "$first" } },
          },
        },
        {
          type: "m.room.message",
          event_id: "$reply-older",
          sender: "@whatsapp_contact:orion.local",
          origin_server_ts: 3,
          content: {
            msgtype: "m.text",
            body: "Older reply",
            "m.relates_to": { "m.in_reply_to": { event_id: "$not-in-page" } },
          },
        },
      ],
    },
  };

  const messages = parseRoomEvents({
    roomId: "!room:orion.local",
    roomData,
    currentUserId: "@orion_u_user_whatsapp:orion.local",
  });
  assert.equal(messages.length, 3);
  assert.equal(messages[1].replyPreview.text, "Earlier");
  assert.equal(messages[2].replyToEventId, "$not-in-page");
  assert.equal(messages[2].replyPreview, undefined);
});

test("media history returns proxy metadata without downloading bytes", () => {
  const media = buildMediaDescriptor({
    msgtype: "m.image",
    body: "photo.jpg",
    url: "mxc://orion.local/media",
    info: { mimetype: "image/jpeg", size: 123 },
  });
  assert.equal(media.mxc, "mxc://orion.local/media");
  assert.match(media.url, /^\/api\/whatsapp\/media\?mxc=/);
  assert.equal(Buffer.isBuffer(media.body), false);
});

test("conversation index still has no raw message-history fields", () => {
  const paths = MessagingConversationIndex.schema.paths;
  for (const field of ["message", "messages", "body", "timeline", "history"]) {
    assert.equal(paths[field], undefined);
  }
});

test("short-lived history context is user-scoped and verified-only", () => {
  cacheVerifiedWhatsAppHistoryContexts({
    userId: "history-user-a",
    connection: { _id: "connection-a", state: "connected" },
    mappings: [
      {
        matrixRoomId: "!verified:orion.local",
        classificationStatus: "verified",
      },
      {
        matrixRoomId: "!unclassified:orion.local",
        classificationStatus: "unclassified",
      },
    ],
    integration: {
      userId: "history-user-a",
      matrix: {
        mxid: "@orion_u_history-user-a_whatsapp:orion.local",
        accessToken: "test-token",
      },
      whatsapp: {},
    },
  });

  assert.ok(
    getCachedWhatsAppHistoryContext(
      "history-user-a",
      "!verified:orion.local"
    )
  );
  assert.equal(
    getCachedWhatsAppHistoryContext(
      "history-user-b",
      "!verified:orion.local"
    ),
    null
  );
  assert.equal(
    getCachedWhatsAppHistoryContext(
      "history-user-a",
      "!unclassified:orion.local"
    ),
    null
  );
  whatsappService.invalidateWhatsAppCache("history-user-a");
});
