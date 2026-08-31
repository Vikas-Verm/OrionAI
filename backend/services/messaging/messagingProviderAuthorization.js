"use strict";

const connectionRepository = require("./messagingConnectionRepository");
const conversationRepository = require("./messagingConversationRepository");
const {
  MESSAGING_CLASSIFICATION_STATUSES,
  MESSAGING_CONNECTION_STATES,
  assertMessagingProvider,
} = require("./messagingConstants");

function normalizeString(value = "") {
  return String(value || "").trim();
}

function idString(value) {
  if (!value) return "";
  return String(value._id || value);
}

class MessagingAuthorizationError extends Error {
  constructor(message = "Conversation not found.") {
    super(message);
    this.name = "MessagingAuthorizationError";
    this.statusCode = 404;
    this.code = "MESSAGING_CONVERSATION_NOT_FOUND";
  }
}

async function assertVerifiedProviderRoom({
  userId,
  provider,
  roomId,
  connectionId = "",
  requireConnected = false,
  connectionRepo = connectionRepository,
  conversationRepo = conversationRepository,
} = {}) {
  const normalizedUserId = normalizeString(userId);
  const normalizedRoomId = normalizeString(roomId);
  const normalizedProvider = assertMessagingProvider(provider);
  if (!normalizedUserId || !normalizedRoomId) {
    throw new MessagingAuthorizationError();
  }

  const connectionPromise = connectionId
    ? connectionRepo.findConnectionById({
        userId: normalizedUserId,
        connectionId,
      })
    : connectionRepo.findConnection({
        userId: normalizedUserId,
        provider: normalizedProvider,
      });
  const conversationPromise = conversationRepo.findByMatrixRoom({
    userId: normalizedUserId,
    provider: normalizedProvider,
    matrixRoomId: normalizedRoomId,
  });
  const [connection, conversation] = await Promise.all([
    connectionPromise,
    conversationPromise,
  ]);
  if (!connection) throw new MessagingAuthorizationError();
  if (
    requireConnected &&
    String(connection.state || "") !== MESSAGING_CONNECTION_STATES.CONNECTED
  ) {
    throw new MessagingAuthorizationError();
  }

  if (
    !conversation ||
    conversation.classificationStatus !==
      MESSAGING_CLASSIFICATION_STATUSES.VERIFIED ||
    idString(conversation.connectionId) !== idString(connection._id)
  ) {
    throw new MessagingAuthorizationError();
  }

  return {
    connection,
    conversation,
  };
}

module.exports = {
  MessagingAuthorizationError,
  assertVerifiedProviderRoom,
};
