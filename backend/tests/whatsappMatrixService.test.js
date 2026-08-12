"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { __test } = require("../services/whatsappMatrixService");

test("unfinished WhatsApp QR states can resume after a backend restart", () => {
  assert.equal(
    __test.shouldResumeWhatsAppProvisioningLogin({
      mxid: "@orion_u_test_whatsapp:orion.local",
      loginState: "logging_in",
    }),
    true
  );
  assert.equal(
    __test.shouldResumeWhatsAppProvisioningLogin({
      mxid: "@orion_u_test_whatsapp:orion.local",
      loginState: "pending_qr",
    }),
    true
  );
  assert.equal(
    __test.shouldResumeWhatsAppProvisioningLogin({
      mxid: "@orion_u_test_whatsapp:orion.local",
      loginState: "error",
    }),
    false
  );
});

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

test("buildWhatsAppBridgeSnapshot normalizes login and portal metadata", () => {
  const snapshot = __test.buildWhatsAppBridgeSnapshot(
    {
      user_mxid: "@orion_u_test_whatsapp:orion.local",
      id: "login-1",
      remote_name: "+919999999999",
      remote_profile: JSON.stringify({
        phone: "+919999999999",
        name: "POSHN",
      }),
      space_room: "!space:orion.local",
      metadata: JSON.stringify({
        logged_in_at: 1_776_337_224,
        history_sync_portals_need_creating: true,
      }),
    },
    [
      {
        portal_id: "12345@s.whatsapp.net",
        portal_receiver: "919870291255",
        room_id: "!portal:orion.local",
        name: "Ravi Kumar",
        avatar_mxc: "mxc://orion.local/avatar1",
        room_type: "dm",
        in_space: 1,
        preferred: 0,
      },
    ]
  );

  assert.equal(snapshot.connected, true);
  assert.equal(snapshot.loginId, "login-1");
  assert.equal(snapshot.phone, "+919999999999");
  assert.equal(snapshot.profileName, "POSHN");
  assert.equal(snapshot.spaceRoomId, "!space:orion.local");
  assert.equal(snapshot.needsPortalSync, true);
  assert.equal(snapshot.portalRooms.length, 1);
  assert.deepEqual(snapshot.portalRooms[0], {
    roomId: "!portal:orion.local",
    portalId: "12345@s.whatsapp.net",
    receiver: "919870291255",
    title: "Ravi Kumar",
    avatarMxc: "mxc://orion.local/avatar1",
    roomType: "dm",
    inSpace: true,
    preferred: false,
  });
});

test("mergeRoomWithBridgePortalMetadata prefers bridge labels for portal rooms", () => {
  const merged = __test.mergeRoomWithBridgePortalMetadata(
    {
      roomId: "!portal:orion.local",
      title: "+919999999999 (WA), POSHN (WA), OrionAI Signal",
      name: "+919999999999 (WA), POSHN (WA), OrionAI Signal",
      avatarUrl: "",
      avatarMxc: null,
      isDirect: false,
      isGroup: true,
    },
    {
      roomId: "!portal:orion.local",
      title: "Ravi Kumar",
      portalId: "919999999999@s.whatsapp.net",
      avatarMxc: "mxc://orion.local/avatar1",
      roomType: "dm",
    }
  );

  assert.equal(merged.title, "Ravi Kumar");
  assert.equal(merged.name, "Ravi Kumar");
  assert.equal(merged.isDirect, true);
  assert.equal(merged.isGroup, false);
  assert.equal(
    merged.avatarUrl,
    `/api/whatsapp/media?mxc=${encodeURIComponent("mxc://orion.local/avatar1")}`
  );
  assert.equal(merged.phoneNumber, "+919999999999");
  assert.equal(merged.contactJid, "919999999999@s.whatsapp.net");
  assert.equal(merged.contactMxid, "@whatsapp_919999999999:orion.local");
});

test("deriveWhatsAppConnectionState prefers a fresh bridge login over stale QR state", () => {
  const state = __test.deriveWhatsAppConnectionState({
    fallbackConfig: {
      loginState: "pending_qr",
      connectedAt: null,
      lastError: "",
    },
    bridgeState: {
      loginState: "pending_qr",
      latestQr: { timestamp: 1_000 },
      latestError: null,
      lastErrorText: "",
    },
    bridgeSnapshot: {
      loggedInAtTs: 2_000,
      loggedInAt: "2026-04-16T11:00:24.519Z",
    },
  });

  assert.equal(state.connected, true);
  assert.equal(state.loginState, "connected");
  assert.equal(state.lastError, "");
  assert.equal(state.connectedAt, "2026-04-16T11:00:24.519Z");
});

test("deriveWhatsAppConnectionState keeps pending QR when it is newer than the last login", () => {
  const state = __test.deriveWhatsAppConnectionState({
    fallbackConfig: {
      loginState: "connected",
      connectedAt: "2026-04-16T11:00:24.519Z",
      lastError: "",
    },
    bridgeState: {
      loginState: "pending_qr",
      latestQr: { timestamp: 3_000 },
      latestError: null,
      lastErrorText: "",
    },
    bridgeSnapshot: {
      loggedInAtTs: 2_000,
      loggedInAt: "2026-04-16T11:00:24.519Z",
    },
  });

  assert.equal(state.connected, false);
  assert.equal(state.loginState, "pending_qr");
  assert.equal(state.lastError, "");
});

test("deriveWhatsAppConnectionState ignores stale QR timeout errors when the bridge snapshot is still logged in", () => {
  const state = __test.deriveWhatsAppConnectionState({
    fallbackConfig: {
      loginState: "error",
      connectedAt: null,
      lastError: "Login failed: Entering code or scanning QR timed out.",
    },
    bridgeState: {
      loginState: "error",
      latestError: {
        timestamp: 3_000,
      },
      lastErrorText: "Login failed: Entering code or scanning QR timed out.",
    },
    bridgeSnapshot: {
      connected: true,
      loggedInAtTs: 2_000,
      loggedInAt: "2026-04-16T11:00:23.000Z",
      phone: "+919870291255",
      profileName: "POSHN",
    },
  });

  assert.equal(state.connected, true);
  assert.equal(state.loginState, "connected");
  assert.equal(state.lastError, "");
  assert.equal(state.connectedAt, "2026-04-16T11:00:23.000Z");
});

test("deriveWhatsAppConnectionState treats a QR timeout as retryable during an active login (no scary error)", () => {
  const state = __test.deriveWhatsAppConnectionState({
    fallbackConfig: {
      loginState: "logging_in",
      connectedAt: null,
      lastError: "",
    },
    bridgeState: {
      loginState: "error",
      latestError: { timestamp: 3_000 },
      lastErrorText:
        "Login failed: Entering code or scanning QR timed out. Please try again.",
    },
    bridgeSnapshot: null,
    activeLoginWindow: true,
  });

  assert.equal(state.connected, false);
  assert.equal(state.loginState, "logging_in");
  assert.equal(state.lastError, "");
  assert.equal(state.retryableTimeout, true);
});

test("deriveWhatsAppConnectionState surfaces a QR timeout as an error when NOT mid-login and not connected", () => {
  const state = __test.deriveWhatsAppConnectionState({
    fallbackConfig: {
      loginState: "error",
      connectedAt: null,
      lastError: "",
    },
    bridgeState: {
      loginState: "error",
      latestError: { timestamp: 3_000 },
      lastErrorText:
        "Login failed: Entering code or scanning QR timed out. Please try again.",
    },
    bridgeSnapshot: null,
    activeLoginWindow: false,
  });

  assert.equal(state.connected, false);
  assert.equal(state.loginState, "error");
  assert.equal(state.retryableTimeout, false);
});

test("deriveWhatsAppConnectionState keeps a connected session through a transient disconnect (laptop sleep)", () => {
  const state = __test.deriveWhatsAppConnectionState({
    fallbackConfig: {
      loginState: "connected",
      connectedAt: "2026-04-16T11:00:23.000Z",
      lastError: "",
    },
    bridgeState: {
      loginState: "error",
      latestError: { timestamp: 5_000 },
      lastErrorText:
        "State update for +919773767632: TRANSIENT_DISCONNECT (wa-transient-disconnect) not resolved after waiting 3 minutes: Disconnected from WhatsApp. Trying to reconnect.",
    },
    bridgeSnapshot: null,
  });

  assert.equal(state.connected, true);
  assert.equal(state.loginState, "connected");
  assert.equal(state.lastError, "");
});

test("deriveWhatsAppConnectionState still disconnects on a real logout (BAD_CREDENTIALS)", () => {
  const state = __test.deriveWhatsAppConnectionState({
    fallbackConfig: {
      loginState: "connected",
      connectedAt: "2026-04-16T11:00:23.000Z",
      lastError: "",
    },
    bridgeState: {
      loginState: "error",
      latestError: { timestamp: 5_000 },
      lastErrorText:
        "State update for +919773767632: BAD_CREDENTIALS: 403 opening websocket, we are logged out",
    },
    bridgeSnapshot: null,
  });

  assert.equal(state.connected, false);
  assert.equal(state.loginState, "error");
  assert.match(state.lastError, /logged out|BAD_CREDENTIALS/i);
});

test("contact room helpers preserve deterministic placeholder ids", () => {
  const roomId = __test.buildWhatsAppContactRoomId("919891407729@s.whatsapp.net");

  assert.equal(roomId, "wa-contact:919891407729@s.whatsapp.net");
  assert.equal(__test.isWhatsAppContactRoomId(roomId), true);
  assert.equal(
    __test.parseWhatsAppContactRoomId(roomId),
    "919891407729@s.whatsapp.net"
  );
  assert.equal(__test.extractWhatsAppIdentifier("919891407729@s.whatsapp.net"), "919891407729");
});

test("mergeRoomWithBridgeContactMetadata upgrades portal names with contact info", () => {
  const merged = __test.mergeRoomWithBridgeContactMetadata(
    {
      roomId: "!room:orion.local",
      title: "+919891407729 (WA)",
      name: "+919891407729 (WA)",
      avatarUrl: "",
      phoneNumber: "",
    },
    {
      roomId: "!room:orion.local",
      title: "Manish Jha",
      fullName: "Manish Jha",
      phoneNumber: "+919891407729",
      contactJid: "919891407729@s.whatsapp.net",
      contactMxid: "@whatsapp_919891407729:orion.local",
      avatarMxc: "mxc://orion.local/manish",
      bridgeStatus: "portal",
    }
  );

  assert.equal(merged.title, "Manish Jha");
  assert.equal(merged.phoneNumber, "+919891407729");
  assert.equal(merged.contactJid, "919891407729@s.whatsapp.net");
  assert.equal(merged.contactMxid, "@whatsapp_919891407729:orion.local");
  assert.equal(
    merged.avatarUrl,
    `/api/whatsapp/media?mxc=${encodeURIComponent("mxc://orion.local/manish")}`
  );
});

test("buildWhatsAppBridgePortalMap indexes portals by room id and portal id", () => {
  const portal = {
    roomId: "!portal:orion.local",
    portalId: "919773767632@s.whatsapp.net",
    title: "Vikas Verma",
  };

  const portalMap = __test.buildWhatsAppBridgePortalMap({
    portalRooms: [portal],
  });

  assert.equal(portalMap.get("!portal:orion.local"), portal);
  assert.equal(portalMap.get("919773767632@s.whatsapp.net"), portal);
  assert.equal(
    __test.findWhatsAppPortalByRoomId({ portalRooms: [portal] }, "!portal:orion.local"),
    portal
  );
});

test("canonicalizeWhatsAppContactJid collapses lid contacts onto phone JIDs", () => {
  const lidMap = new Map([["179495390703666", "919773767632"]]);

  assert.equal(
    __test.canonicalizeWhatsAppContactJid("179495390703666@lid", lidMap),
    "919773767632@s.whatsapp.net"
  );
  assert.equal(
    __test.buildWhatsAppContactKey(
      { contactJid: "179495390703666@lid" },
      lidMap
    ),
    "919773767632@s.whatsapp.net"
  );
});

test("buildRoomDescriptor annotates outbound messages with read receipts", () => {
  const currentUserId = "@orion_u_test_whatsapp:orion.local";
  const ghostMxid = "@whatsapp_919773767632:orion.local";
  const roomId = "!portal:orion.local";

  const descriptor = __test.buildRoomDescriptor({
    roomId,
    currentUserId,
    bridgeBotMxid: "@whatsappbot:orion.local",
    roomData: {
      state: {
        events: [
          {
            type: "m.room.member",
            state_key: currentUserId,
            content: { membership: "join", displayname: "OrionAI" },
          },
          {
            type: "m.room.member",
            state_key: ghostMxid,
            content: { membership: "join", displayname: "Vikas Verma" },
          },
        ],
      },
      timeline: {
        events: [
          {
            type: "m.room.message",
            event_id: "$m1",
            sender: currentUserId,
            origin_server_ts: 1_000,
            content: { msgtype: "m.text", body: "Hello" },
          },
          {
            type: "m.room.message",
            event_id: "$m2",
            sender: currentUserId,
            origin_server_ts: 2_000,
            content: { msgtype: "m.text", body: "How are you?" },
          },
          {
            type: "m.room.message",
            event_id: "$m3",
            sender: ghostMxid,
            origin_server_ts: 3_000,
            content: { msgtype: "m.text", body: "Doing well" },
          },
        ],
      },
      ephemeral: {
        events: [
          {
            type: "m.receipt",
            content: {
              $m2: {
                "m.read": {
                  [ghostMxid]: { ts: 3_500 },
                },
              },
            },
          },
        ],
      },
      unread_notifications: {},
      summary: {},
    },
    directMap: new Map([[roomId, true]]),
  });

  const outboundMessages = descriptor.messages.filter((message) => message.fromMe);
  assert.equal(outboundMessages.length, 2);
  assert.equal(outboundMessages[0].deliveryState, "read");
  assert.equal(outboundMessages[0].deliveryLabel, "Read");
  assert.equal(outboundMessages[1].deliveryState, "read");
  assert.equal(outboundMessages[1].readByCount, 1);
});

test("buildRoomDescriptor does not hide a portal room when a stale management room id points at it", () => {
  const currentUserId = "@orion_u_test_whatsapp:orion.local";
  const bridgeBotMxid = "@whatsappbot:orion.local";
  const ghostMxid = "@whatsapp_919773767632:orion.local";
  const roomId = "!portal:orion.local";

  const descriptor = __test.buildRoomDescriptor({
    roomId,
    currentUserId,
    bridgeBotMxid,
    managementRoomId: roomId,
    roomData: {
      state: {
        events: [
          {
            type: "m.room.member",
            state_key: currentUserId,
            content: { membership: "join", displayname: "OrionAI" },
          },
          {
            type: "m.room.member",
            state_key: bridgeBotMxid,
            content: { membership: "join", displayname: "WhatsApp Bridge" },
          },
          {
            type: "m.room.member",
            state_key: ghostMxid,
            content: { membership: "join", displayname: "Vikas Verma" },
          },
          {
            type: "m.room.name",
            state_key: "",
            content: { name: "Vikas Verma" },
          },
        ],
      },
      timeline: {
        events: [],
      },
      summary: {
        "m.joined_member_count": 3,
      },
      unread_notifications: {},
    },
    directMap: new Map([[roomId, true]]),
  });

  assert.equal(descriptor.isManagement, false);
  assert.equal(descriptor.isWhatsAppRoom, true);
});

test("buildRoomDescriptor filters internal start-chat bridge commands from portal timelines", () => {
  const currentUserId = "@orion_u_test_whatsapp:orion.local";
  const bridgeBotMxid = "@whatsappbot:orion.local";
  const ghostMxid = "@whatsapp_919773767632:orion.local";
  const roomId = "!portal:orion.local";

  const descriptor = __test.buildRoomDescriptor({
    roomId,
    currentUserId,
    bridgeBotMxid,
    roomData: {
      state: {
        events: [
          {
            type: "m.room.member",
            state_key: currentUserId,
            content: { membership: "join", displayname: "OrionAI" },
          },
          {
            type: "m.room.member",
            state_key: bridgeBotMxid,
            content: { membership: "join", displayname: "WhatsApp Bridge" },
          },
          {
            type: "m.room.member",
            state_key: ghostMxid,
            content: { membership: "join", displayname: "Vikas Verma" },
          },
        ],
      },
      timeline: {
        events: [
          {
            type: "m.room.message",
            event_id: "$cmd",
            sender: currentUserId,
            origin_server_ts: 1_000,
            content: {
              msgtype: "m.text",
              body: "start-chat 919773767632@s.whatsapp.net",
            },
          },
          {
            type: "m.room.message",
            event_id: "$reply",
            sender: ghostMxid,
            origin_server_ts: 2_000,
            content: { msgtype: "m.text", body: "Hello from WhatsApp" },
          },
        ],
      },
      unread_notifications: {},
      summary: {
        "m.joined_member_count": 3,
      },
    },
    directMap: new Map([[roomId, true]]),
  });

  assert.equal(descriptor.messages.length, 1);
  assert.equal(descriptor.messages[0].id, "$reply");
  assert.equal(descriptor.room.lastMessage, "Hello from WhatsApp");
});

test("buildRoomDescriptor treats the linked user's WhatsApp ghost as self", () => {
  const currentUserId = "@orion_u_test_whatsapp:orion.local";
  const bridgeBotMxid = "@whatsappbot:orion.local";
  const selfGhostMxid = __test.buildWhatsAppGhostMxid("919773767632");
  const remoteGhostMxid = "@whatsapp_919870291255:orion.local";
  const selfAvatar = "mxc://orion.local/self-avatar";
  const remoteAvatar = "mxc://orion.local/remote-avatar";
  const roomId = "!portal:orion.local";

  const descriptor = __test.buildRoomDescriptor({
    roomId,
    currentUserId,
    bridgeBotMxid,
    selfGhostMxid,
    selfPhoneDigits: "919773767632",
    roomData: {
      state: {
        events: [
          {
            type: "m.room.member",
            state_key: currentUserId,
            content: { membership: "join", displayname: "OrionAI WhatsApp" },
          },
          {
            type: "m.room.member",
            state_key: bridgeBotMxid,
            content: { membership: "join", displayname: "WhatsApp Bridge" },
          },
          {
            type: "m.room.member",
            state_key: selfGhostMxid,
            content: {
              membership: "join",
              displayname: "+919773767632 (WA)",
              avatar_url: selfAvatar,
            },
          },
          {
            type: "m.room.member",
            state_key: remoteGhostMxid,
            content: {
              membership: "join",
              displayname: "Ashirvad",
              avatar_url: remoteAvatar,
            },
          },
          {
            type: "m.room.name",
            state_key: "",
            content: { name: "Ashirvad, +919773767632 (WA)" },
          },
          {
            type: "m.room.avatar",
            state_key: "",
            content: { url: selfAvatar },
          },
        ],
      },
      timeline: {
        events: [
          {
            type: "m.room.message",
            event_id: "$from-mobile",
            sender: selfGhostMxid,
            origin_server_ts: 1_000,
            content: { msgtype: "m.text", body: "Okay sir" },
          },
          {
            type: "m.room.message",
            event_id: "$from-contact",
            sender: remoteGhostMxid,
            origin_server_ts: 2_000,
            content: { msgtype: "m.text", body: "okay" },
          },
        ],
      },
      summary: {
        "m.joined_member_count": 4,
      },
      unread_notifications: {},
    },
    directMap: new Map(),
  });

  assert.equal(descriptor.room.title, "Ashirvad");
  assert.equal(descriptor.room.isDirect, true);
  assert.equal(descriptor.room.isGroup, false);
  assert.equal(
    descriptor.room.avatarUrl,
    `/api/whatsapp/media?mxc=${encodeURIComponent(remoteAvatar)}`
  );
  assert.equal(descriptor.messages[0].fromMe, true);
  assert.equal(descriptor.messages[0].senderName, "You");
  assert.equal(descriptor.messages[1].fromMe, false);
});
