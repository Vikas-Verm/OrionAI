"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  envFlagEnabled,
  isWhatsAppV2ReadEnabled,
  isWhatsAppV2HistoryEnabled,
  isWhatsAppV2SendEnabled,
} = require("../services/messaging/messagingFeatureFlags");
const {
  assertVerifiedProviderRoom,
  MessagingAuthorizationError,
} = require("../services/messaging/messagingProviderAuthorization");
const whatsappService = require("../services/whatsappMatrixService");

test("WhatsApp V2 read flag defaults off and accepts explicit true values", () => {
  const previous = process.env.MESSAGING_V2_WHATSAPP_READ_ENABLED;
  delete process.env.MESSAGING_V2_WHATSAPP_READ_ENABLED;
  assert.equal(isWhatsAppV2ReadEnabled(), false);
  process.env.MESSAGING_V2_WHATSAPP_READ_ENABLED = "true";
  assert.equal(isWhatsAppV2ReadEnabled(), true);
  process.env.MESSAGING_V2_WHATSAPP_READ_ENABLED = "0";
  assert.equal(isWhatsAppV2ReadEnabled(), false);
  if (previous === undefined) delete process.env.MESSAGING_V2_WHATSAPP_READ_ENABLED;
  else process.env.MESSAGING_V2_WHATSAPP_READ_ENABLED = previous;
});

test("envFlagEnabled recognizes only explicit enabled values", () => {
  process.env.TEST_MESSAGING_FLAG = "yes";
  assert.equal(envFlagEnabled("TEST_MESSAGING_FLAG"), true);
  process.env.TEST_MESSAGING_FLAG = "false";
  assert.equal(envFlagEnabled("TEST_MESSAGING_FLAG"), false);
  delete process.env.TEST_MESSAGING_FLAG;
});

test("WhatsApp V2 history and send flags are independent rollback switches", () => {
  const previousHistory = process.env.MESSAGING_V2_WHATSAPP_HISTORY_ENABLED;
  const previousSend = process.env.MESSAGING_V2_WHATSAPP_SEND_ENABLED;

  delete process.env.MESSAGING_V2_WHATSAPP_HISTORY_ENABLED;
  delete process.env.MESSAGING_V2_WHATSAPP_SEND_ENABLED;
  assert.equal(isWhatsAppV2HistoryEnabled(), false);
  assert.equal(isWhatsAppV2SendEnabled(), false);

  process.env.MESSAGING_V2_WHATSAPP_HISTORY_ENABLED = "true";
  process.env.MESSAGING_V2_WHATSAPP_SEND_ENABLED = "false";
  assert.equal(isWhatsAppV2HistoryEnabled(), true);
  assert.equal(isWhatsAppV2SendEnabled(), false);

  process.env.MESSAGING_V2_WHATSAPP_HISTORY_ENABLED = "0";
  process.env.MESSAGING_V2_WHATSAPP_SEND_ENABLED = "yes";
  assert.equal(isWhatsAppV2HistoryEnabled(), false);
  assert.equal(isWhatsAppV2SendEnabled(), true);

  if (previousHistory === undefined) delete process.env.MESSAGING_V2_WHATSAPP_HISTORY_ENABLED;
  else process.env.MESSAGING_V2_WHATSAPP_HISTORY_ENABLED = previousHistory;
  if (previousSend === undefined) delete process.env.MESSAGING_V2_WHATSAPP_SEND_ENABLED;
  else process.env.MESSAGING_V2_WHATSAPP_SEND_ENABLED = previousSend;
});

test("verified WhatsApp chat formatter preserves frontend contract fields", () => {
  const chat = whatsappService.__test.buildVerifiedWhatsAppChat(
    {
      matrixRoomId: "!room:orion.local",
      remoteChatId: "remote@example",
      displayName: "Customer",
      avatarMxc: "mxc://orion.local/avatar",
      type: "group",
      classificationStatus: "verified",
      classificationSource: "bridge_portal+matrix_owner",
    },
    { mutedRoomSet: new Set(["!room:orion.local"]) }
  );

  assert.equal(chat.roomId, "!room:orion.local");
  assert.equal(chat.id, "!room:orion.local");
  assert.equal(chat.title, "Customer");
  assert.equal(chat.name, "Customer");
  assert.equal(chat.source, "whatsapp");
  assert.equal(chat.provider, "whatsapp");
  assert.equal(chat.isGroup, true);
  assert.equal(chat.isMuted, true);
  assert.equal(chat.canOpenTimeline, true);
  assert.equal(chat.unreadCount, 0);
  assert.equal(chat.lastMessagePreview, "");
});

test("assertVerifiedProviderRoom allows only the current user's verified provider room", async () => {
  const connection = { _id: "conn-a", userId: "user-a", provider: "whatsapp" };
  const conversation = {
    _id: "conv-a",
    userId: "user-a",
    provider: "whatsapp",
    connectionId: "conn-a",
    matrixRoomId: "!wa:orion.local",
    classificationStatus: "verified",
  };
  const connectionRepo = {
    async findConnection({ userId, provider }) {
      return userId === "user-a" && provider === "whatsapp" ? connection : null;
    },
  };
  const conversationRepo = {
    async findByMatrixRoom({ userId, provider, matrixRoomId }) {
      return userId === "user-a" &&
        provider === "whatsapp" &&
        matrixRoomId === "!wa:orion.local"
        ? conversation
        : null;
    },
  };

  const result = await assertVerifiedProviderRoom({
    userId: "user-a",
    provider: "whatsapp",
    roomId: "!wa:orion.local",
    connectionRepo,
    conversationRepo,
  });
  assert.equal(result.conversation.matrixRoomId, "!wa:orion.local");

  await assert.rejects(
    () =>
      assertVerifiedProviderRoom({
        userId: "user-b",
        provider: "whatsapp",
        roomId: "!wa:orion.local",
        connectionRepo,
        conversationRepo,
      }),
    MessagingAuthorizationError
  );
  await assert.rejects(
    () =>
      assertVerifiedProviderRoom({
        userId: "user-a",
        provider: "signal",
        roomId: "!wa:orion.local",
        connectionRepo,
        conversationRepo,
      }),
    MessagingAuthorizationError
  );
});

test("assertVerifiedProviderRoom rejects unverified and wrong-connection rooms", async () => {
  const connectionRepo = {
    async findConnection() {
      return { _id: "conn-a" };
    },
  };
  const unclassifiedRepo = {
    async findByMatrixRoom() {
      return {
        connectionId: "conn-a",
        classificationStatus: "unclassified",
      };
    },
  };
  await assert.rejects(
    () =>
      assertVerifiedProviderRoom({
        userId: "user-a",
        provider: "whatsapp",
        roomId: "!room:orion.local",
        connectionRepo,
        conversationRepo: unclassifiedRepo,
      }),
    MessagingAuthorizationError
  );

  const wrongConnectionRepo = {
    async findByMatrixRoom() {
      return {
        connectionId: "conn-b",
        classificationStatus: "verified",
      };
    },
  };
  await assert.rejects(
    () =>
      assertVerifiedProviderRoom({
        userId: "user-a",
        provider: "whatsapp",
        roomId: "!room:orion.local",
        connectionRepo,
        conversationRepo: wrongConnectionRepo,
      }),
    MessagingAuthorizationError
  );
});

test("assertVerifiedProviderRoom can fail closed for disconnected connections", async () => {
  const connectionRepo = {
    async findConnection() {
      return { _id: "conn-a", state: "disconnected" };
    },
  };
  const conversationRepo = {
    async findByMatrixRoom() {
      return {
        connectionId: "conn-a",
        classificationStatus: "verified",
      };
    },
  };

  await assert.rejects(
    () =>
      assertVerifiedProviderRoom({
        userId: "user-a",
        provider: "whatsapp",
        roomId: "!room:orion.local",
        requireConnected: true,
        connectionRepo,
        conversationRepo,
      }),
    MessagingAuthorizationError
  );
});
