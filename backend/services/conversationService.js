const Conversation = require("../models/conversation");
const { buildActiveConversationQuery } = require("./conversationRetention");

async function loadConversation(sessionId, userIdOrQuery = null) {
  const query =
    userIdOrQuery && typeof userIdOrQuery === "object"
      ? { sessionId, ...userIdOrQuery }
      : userIdOrQuery
      ? { sessionId, userId: userIdOrQuery }
      : { sessionId };
  const conversation = await Conversation.findOne(buildActiveConversationQuery(query));
  if (!conversation) return [];
  return conversation.messages;
}

async function saveConversation(sessionId, messages) {
  await Conversation.findOneAndUpdate(
    { sessionId },
    { messages, updatedAt: Date.now() },
    { upsert: true }
  );
}

async function getAllSessions(userId, search = "") {
  const query = buildActiveConversationQuery({ userId });
  if (search) query.title = { $regex: search, $options: "i" };

  return await Conversation.find(
    query,
    { sessionId: 1, title: 1, updatedAt: 1, mode: 1 } // ← include mode
  ).sort({ updatedAt: -1 });
}

async function createSession(sessionId, title, userId, mode) {
  const session = new Conversation({
    sessionId,
    title,
    userId,
    mode,
    messages: [],
  });
  await session.save();
  return session;
}

async function updateSessionTitle(sessionId, title) {
  await Conversation.findOneAndUpdate({ sessionId }, { $set: { title } });
}

async function deleteSession(sessionId, userId) {
  // Soft delete — don't actually remove from DB
  await Conversation.findOneAndUpdate(
    { sessionId, userId },
    { isDeleted: true }
  );
}

async function appendActivityLog(sessionId, activity) {
  await Conversation.findOneAndUpdate(
    { sessionId },
    {
      $push: { activityLog: activity },
      updatedAt: Date.now(),
    }
  );
}

async function getActivityLog(sessionLookup) {
  const query =
    typeof sessionLookup === "string"
      ? buildActiveConversationQuery({ sessionId: sessionLookup })
      : buildActiveConversationQuery(sessionLookup || {});
  const conversation = await Conversation.findOne(
    query,
    { activityLog: 1 }
  );
  return conversation?.activityLog || [];
}
module.exports = {
  loadConversation,
  saveConversation,
  getAllSessions,
  createSession,
  updateSessionTitle,
  deleteSession,
  appendActivityLog,
  getActivityLog,
  buildActiveConversationQuery,
};
