"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { __test } = require("../services/whatsappMatrixService");

test("parseRoomEvents keeps QR image edits from the WhatsApp bridge", () => {
  const roomId = "!whatsapp-bridge:orion.local";
  const currentUserId = "@orion_u_test:orion.local";
  const bridgeBotMxid = "@whatsappbot:orion.local";
  const qrMxc = "mxc://orion.local/wa-qr";

  const roomData = {
    state: {
      events: [
        {
          type: "m.room.member",
          state_key: currentUserId,
          content: {
            membership: "join",
            displayname: "OrionAI",
          },
        },
        {
          type: "m.room.member",
          state_key: bridgeBotMxid,
          content: {
            membership: "join",
            displayname: "WhatsApp Bridge",
          },
        },
      ],
    },
    timeline: {
      events: [
        {
          type: "m.room.message",
          event_id: "$bridge-notice",
          sender: bridgeBotMxid,
          origin_server_ts: 1,
          content: {
            msgtype: "m.notice",
            body: "Open WhatsApp on your phone and scan this QR code.",
          },
        },
        {
          type: "m.room.message",
          event_id: "$bridge-qr-edit",
          sender: bridgeBotMxid,
          origin_server_ts: 2,
          content: {
            msgtype: "m.image",
            body: "WA_QR_PAYLOAD",
            url: qrMxc,
            info: {
              mimetype: "image/png",
              w: 512,
              h: 512,
              size: 1024,
            },
            "m.new_content": {
              msgtype: "m.image",
              body: "WA_QR_PAYLOAD",
              url: qrMxc,
              info: {
                mimetype: "image/png",
                w: 512,
                h: 512,
                size: 1024,
              },
            },
            "m.relates_to": {
              rel_type: "m.replace",
              event_id: "$bridge-notice",
            },
          },
        },
      ],
    },
  };

  const messages = __test.parseRoomEvents({
    roomId,
    roomData,
    currentUserId,
    fallbackRoomName: "WhatsApp Bridge",
    bridgeBotMxid,
  });

  const qrMessage = messages.find((message) => message.id === "$bridge-notice");
  assert.ok(qrMessage, "expected bridge notice message to exist");
  assert.equal(qrMessage.edited, true);
  assert.equal(qrMessage.messageType, "m.image");
  assert.equal(qrMessage.media?.type, "image");
  assert.equal(
    qrMessage.media?.url,
    `/api/whatsapp/media?mxc=${encodeURIComponent(qrMxc)}`
  );
});

test("extractBridgeRoomState recognizes WhatsApp bridge QR image messages", () => {
  const qrMxc = "mxc://orion.local/live-wa-qr";

  const state = __test.extractBridgeRoomState(
    {
      messages: [
        {
          id: "$bridge-hello",
          sender: "@whatsappbot:orion.local",
          senderName: "WhatsApp Bridge",
          text: "Hello, I'm your WhatsApp bridge.",
          previewText: "Hello, I'm your WhatsApp bridge.",
          timestamp: 1,
          media: null,
        },
        {
          id: "$bridge-qr",
          sender: "@whatsappbot:orion.local",
          senderName: "WhatsApp Bridge",
          text: "Open WhatsApp on your phone and scan this QR code.",
          previewText: "Open WhatsApp on your phone and scan this QR code.",
          timestamp: 2,
          media: {
            type: "image",
            mxc: qrMxc,
            url: `/api/whatsapp/media?mxc=${encodeURIComponent(qrMxc)}`,
          },
        },
      ],
    },
    "@whatsappbot:orion.local"
  );

  assert.equal(state.loginState, "pending_qr");
  assert.equal(state.qrImageMxc, qrMxc);
  assert.equal(
    state.qrImageUrl,
    `/api/whatsapp/media?mxc=${encodeURIComponent(qrMxc)}`
  );
});

test("buildQrDataUrl renders a browser-safe QR image for WhatsApp payloads", async () => {
  const dataUrl = await __test.buildQrDataUrl("2@ABCD,1234567890,whatever");
  assert.match(dataUrl, /^data:image\/png;base64,/);
});

test("buildWhatsAppMediaRequestPath supports thumbnails and downloads", () => {
  const mxc = "mxc://orion.local/media123";

  assert.equal(
    __test.buildWhatsAppMediaRequestPath(mxc),
    "/_matrix/client/v1/media/download/orion.local/media123"
  );
  assert.equal(
    __test.buildWhatsAppMediaRequestPath(mxc, {
      thumbnail: true,
      width: 320,
      height: 240,
    }),
    "/_matrix/client/v1/media/thumbnail/orion.local/media123?width=320&height=240&method=scale"
  );
});
