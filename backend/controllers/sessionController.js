const { randomUUID } = require("crypto");
const {
  getAllSessions,
  createSession,
  loadConversation,
  saveConversation,
  deleteSession,
} = require("../services/conversationService");
const {
  getActivityLog: fetchActivityLog,
} = require("../services/conversationService");
const Conversation = require("../models/Conversation");
async function getSessions(req, res) {
  const userId = req.user.username; // ← from JWT
  const { search = "" } = req.query;
  const sessions = await getAllSessions(userId, search);
  res.json(sessions);
}

async function createNewSession(req, res) {
  const { mode = "chat" } = req.body;
  const userId = req.user.username;
  const sessionId = randomUUID();
  await createSession(sessionId, "New Chat", userId, mode);
  res.json({ sessionId });
}

async function getSessionMessages(req, res) {
  const { sessionId } = req.params;
  const messages = await loadConversation(sessionId);

  // Also get the session mode

  const session = await Conversation.findOne({ sessionId }, { mode: 1 });
  console.log(session);
  res.json({
    messages,
    mode: session?.mode || "chat",
  });
}

async function resetSession(req, res) {
  const { sessionId = "default" } = req.body;
  await saveConversation(sessionId, []);
  res.json({ message: "Conversation reset" });
}

async function removeSession(req, res) {
  const { sessionId } = req.params;
  const userId = req.user.username; // ← from JWT
  await deleteSession(sessionId, userId);
  res.json({ message: "Chat deleted" });
}

async function getActivityLog(req, res) {
  const { sessionId } = req.params;
  const log = await fetchActivityLog(sessionId);
  res.json(log);
}
module.exports = {
  getSessions,
  createNewSession,
  getSessionMessages,
  resetSession,
  removeSession,
  getActivityLog,
};
