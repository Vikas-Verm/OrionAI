const Conversation = require("../models/Conversation");

async function loadConversation(sessionId) {
  const conversation = await Conversation.findOne({
    sessionId,
    isDeleted: false,
  });
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
  const query = { userId, isDeleted: false };
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

async function getActivityLog(sessionId) {
  const conversation = await Conversation.findOne(
    { sessionId },
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
};
