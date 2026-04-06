"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { __test } = require("../services/signalMatrixService");

test("parseRoomEvents keeps QR image edits from the Signal bridge", () => {
  const roomId = "!signal-bridge:orion.local";
  const currentUserId = "@orion_u_test:orion.local";
  const bridgeBotMxid = "@signalbot:orion.local";
  const qrMxc = "mxc://orion.local/qr-image";

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
            displayname: "Signal Bridge",
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
            body: "Scan the QR code on your Signal app to log in",
          },
        },
        {
          type: "m.room.message",
          event_id: "$bridge-qr-edit",
          sender: bridgeBotMxid,
          origin_server_ts: 2,
          content: {
            msgtype: "m.image",
            body: "sgnl://linkdevice?uuid=test",
            url: qrMxc,
            info: {
              mimetype: "image/png",
              w: 512,
              h: 512,
              size: 916,
            },
            "m.new_content": {
              msgtype: "m.image",
              body: "sgnl://linkdevice?uuid=test",
              url: qrMxc,
              info: {
                mimetype: "image/png",
                w: 512,
                h: 512,
                size: 916,
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
    fallbackRoomName: "Signal Bridge",
    bridgeBotMxid,
  });

  const qrMessage = messages.find((message) => message.id === "$bridge-notice");
  assert.ok(qrMessage, "expected bridge notice message to exist");
  assert.equal(qrMessage.edited, true);
  assert.equal(qrMessage.messageType, "m.image");
  assert.equal(qrMessage.media?.type, "image");
  assert.equal(
    qrMessage.media?.url,
    `/api/signal/media?mxc=${encodeURIComponent(qrMxc)}`
  );
});

test("extractBridgeRoomState recognizes Signal bridge QR messages by sender label", () => {
  const qrMxc = "mxc://orion.local/live-qr";

  const state = __test.extractBridgeRoomState(
    {
      messages: [
        {
          id: "$bridge-hello",
          sender: "@signalbot:orion.local",
          senderName: "Signal bridge bot",
          text: "Hello, I'm a Signal bridge bot.",
          previewText: "Hello, I'm a Signal bridge bot.",
          timestamp: 1,
          media: null,
        },
        {
          id: "$bridge-qr",
          sender: "@signalbot:orion.local",
          senderName: "Signal bridge bot",
          text: "sgnl://linkdevice?uuid=test",
          previewText: "sgnl://linkdevice?uuid=test",
          timestamp: 2,
          media: {
            type: "image",
            mxc: qrMxc,
            url: `/api/signal/media?mxc=${encodeURIComponent(qrMxc)}`,
          },
        },
      ],
    },
    ""
  );

  assert.equal(state.loginState, "pending_qr");
  assert.equal(state.qrImageMxc, qrMxc);
  assert.equal(
    state.qrImageUrl,
    `/api/signal/media?mxc=${encodeURIComponent(qrMxc)}`
  );
});

test("extractBridgeRoomState keeps the latest QR image even when newer notice messages arrive", () => {
  const olderQrMxc = "mxc://orion.local/older-qr";

  const state = __test.extractBridgeRoomState(
    {
      messages: [
        {
          id: "$bridge-image",
          sender: "@signalbot:orion.local",
          senderName: "Signal bridge bot",
          text: "sgnl://linkdevice?uuid=older",
          previewText: "sgnl://linkdevice?uuid=older",
          timestamp: 10,
          media: {
            type: "image",
            mxc: olderQrMxc,
            url: `/api/signal/media?mxc=${encodeURIComponent(olderQrMxc)}`,
          },
        },
        {
          id: "$bridge-refresh-notice",
          sender: "@signalbot:orion.local",
          senderName: "Signal bridge bot",
          text: "Scan the QR code on your Signal app to log in",
          previewText: "Scan the QR code on your Signal app to log in",
          timestamp: 20,
          media: null,
        },
      ],
    },
    "@signalbot:orion.local"
  );

  assert.equal(state.loginState, "pending_qr");
  assert.equal(state.qrImageMxc, olderQrMxc);
  assert.equal(
    state.qrImageUrl,
    `/api/signal/media?mxc=${encodeURIComponent(olderQrMxc)}`
  );
});

test("buildSignalQrDataUrl renders a browser-safe QR image from the bridge payload", async () => {
  const dataUrl = await __test.buildSignalQrDataUrl(
    "sgnl://linkdevice?pub_key=test&uuid=test"
  );

  assert.match(dataUrl, /^data:image\/png;base64,/);
});

test("buildSignalProfileFromBridgeLogin prefers the real Signal profile", () => {
  const profile = __test.buildSignalProfileFromBridgeLogin({
    loginId: "signal-login",
    remoteName: "+919900000000",
    remoteProfile: {
      phone: "+919900000000",
      name: "Vikas Verma",
      avatar: "mxc://orion.local/avatar",
    },
  });

  assert.deepEqual(profile, {
    displayName: "Vikas Verma",
    avatarUrl: `/api/signal/media?mxc=${encodeURIComponent("mxc://orion.local/avatar")}`,
    phone: "+919900000000",
  });
});

test("buildSignalContactRoom creates a stable placeholder room for synced contacts", () => {
  const room = __test.buildSignalContactRoom({
    identifier: "+917870470216",
    e164Number: "+917870470216",
    contactName: "Anuj Kajra",
  });

  assert.equal(room.roomId, "signal-contact:%2B917870470216");
  assert.equal(room.name, "Anuj Kajra");
  assert.equal(room.bridgeStatus, "contact");
  assert.equal(room.isPlaceholder, true);
  assert.equal(room.lastMessage, "");
});

test("buildSignalPortalRoom prefers the saved Signal contact name over phone-style portal names", () => {
  const room = __test.buildSignalPortalRoom({
    roomId: "!signal-room:orion.local",
    name: "+917870470216",
    contactName: "Anuj Kajra",
    e164Number: "+917870470216",
  });

  assert.equal(room.name, "Anuj Kajra");
});

test("parseRoomEvents rehydrates sender details from later membership updates", () => {
  const ghostMxid = "@signal_ghost:orion.local";
  const roomData = {
    state: {
      events: [
        {
          type: "m.room.member",
          state_key: ghostMxid,
          content: {
            membership: "join",
            displayname: "+917061511690",
          },
        },
      ],
    },
    timeline: {
      events: [
        {
          type: "m.room.message",
          event_id: "$early-message",
          sender: ghostMxid,
          origin_server_ts: 1,
          content: {
            msgtype: "m.text",
            body: "Hloo",
          },
        },
        {
          type: "m.room.member",
          state_key: ghostMxid,
          origin_server_ts: 2,
          content: {
            membership: "join",
            displayname: "aaru verma",
            avatar_url: "mxc://orion.local/avatar",
          },
        },
      ],
    },
  };

  const messages = __test.parseRoomEvents({
    roomId: "!signal-room:orion.local",
    roomData,
    currentUserId: "@orion_u_test:orion.local",
    fallbackRoomName: "Ardhangini",
    bridgeBotMxid: "@signalbot:orion.local",
  });

  assert.equal(messages[0].senderName, "aaru verma");
  assert.equal(
    messages[0].senderAvatarUrl,
    `/api/signal/media?mxc=${encodeURIComponent("mxc://orion.local/avatar")}`
  );
});

test("hydrateSignalMessagesForRoom hides phone-style direct labels behind the room identity", () => {
  const messages = __test.hydrateSignalMessagesForRoom(
    {
      isDirect: true,
      name: "Ardhangini ♥️♥️",
      avatarUrl: "/api/signal/media?mxc=test",
    },
    [
      {
        id: "$incoming",
        sender: "@signal_ghost:orion.local",
        senderName: "+917061511690",
        senderAvatarUrl: "",
        fromMe: false,
      },
      {
        id: "$mine",
        sender: "@orion_u_test:orion.local",
        senderName: "OrionAI Signal",
        senderAvatarUrl: "",
        fromMe: true,
      },
    ]
  );

  assert.equal(messages[0].senderName, "Ardhangini ♥️♥️");
  assert.equal(messages[0].senderAvatarUrl, "/api/signal/media?mxc=test");
  assert.equal(messages[1].senderName, "You");
});

test("buildSignalMediaRequestPath uses the Synapse client media API for downloads", () => {
  assert.equal(
    __test.buildSignalMediaRequestPath("mxc://orion.local/CpQmmblIZAGIrAMmIhHeYGaW"),
    "/_matrix/client/v1/media/download/orion.local/CpQmmblIZAGIrAMmIhHeYGaW"
  );
});

test("extractMatrixRoomIdFromText parses Matrix room links from bridge replies", () => {
  const roomId = __test.extractMatrixRoomIdFromText(
    "Created chat with `user` / +917870470216: https://matrix.to/#/!OMKpFXvbtVibBnpLDp:orion.local"
  );

  assert.equal(roomId, "!OMKpFXvbtVibBnpLDp:orion.local");
});
