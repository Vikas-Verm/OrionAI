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
const {
  buildActiveConversationQuery,
} = require("../services/conversationService");
const Conversation = require("../models/conversation");

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
  const userId = req.user.username;
  const messages = await loadConversation(sessionId, userId);
  const session = await Conversation.findOne(
    buildActiveConversationQuery({ sessionId, userId }),
    { mode: 1 }
  );
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
  const userId = req.user.username;
  const log = await fetchActivityLog(buildActiveConversationQuery({ sessionId, userId }));
  res.json(log);
}

async function setMessageFeedback(req, res) {
  const { sessionId, messageIndex } = req.params;
  const { rating = null } = req.body || {};
  const userId = req.user.username;

  if (![null, "up", "down"].includes(rating)) {
    return res.status(400).json({ error: "rating must be 'up', 'down', or null" });
  }

  const idx = Number(messageIndex);
  if (!Number.isInteger(idx) || idx < 0) {
    return res.status(400).json({ error: "Invalid message index" });
  }

  const conversation = await Conversation.findOne({
    ...buildActiveConversationQuery({ sessionId, userId }),
  });

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }

  const message = conversation.messages[idx];
  if (!message) {
    return res.status(404).json({ error: "Message not found" });
  }

  if (message.role !== "assistant") {
    return res.status(400).json({ error: "Feedback is only supported for assistant messages" });
  }

  if (rating) {
    message.feedback = {
      rating,
      updatedAt: new Date(),
    };
  } else {
    message.feedback = {
      rating: null,
      updatedAt: null,
    };
  }

  conversation.markModified(`messages.${idx}.feedback`);
  conversation.updatedAt = new Date();
  await conversation.save();

  res.json({ ok: true, feedback: message.feedback || null });
}

async function exportSession(req, res) {
  const { sessionId } = req.params;
  const { format = "json" } = req.query;
  const userId = req.user.username;

  const conversation = await Conversation.findOne({
    ...buildActiveConversationQuery({ sessionId, userId }),
  }).lean();

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }

  const exportPayload = {
    sessionId: conversation.sessionId,
    title: conversation.title,
    mode: conversation.mode,
    userId: conversation.userId,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: conversation.messages || [],
    activityLog: conversation.activityLog || [],
  };

  if (format === "markdown") {
    const markdown = [
      `# ${conversation.title || "OrionAI Export"}`,
      "",
      `- Session ID: ${conversation.sessionId}`,
      `- Mode: ${conversation.mode || "chat"}`,
      `- Exported: ${new Date().toISOString()}`,
      "",
      "## Messages",
      "",
      ...(conversation.messages || []).flatMap((message) => [
        `### ${message.role === "user" ? "User" : message.role === "assistant" ? "OrionAI" : "System"}`,
        "",
        `${message.content || ""}`,
        "",
      ]),
      "## Activity Log",
      "",
      ...((conversation.activityLog || []).length
        ? conversation.activityLog.map((item) =>
            `- ${item.createdAt ? new Date(item.createdAt).toISOString() : ""} ${item.message || ""}`.trim()
          )
        : ["- No activity recorded"]),
      "",
    ].join("\n");

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${conversation.sessionId}.md"`
    );
    return res.send(markdown);
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${conversation.sessionId}.json"`
  );
  return res.json(exportPayload);
}

module.exports = {
  getSessions,
  createNewSession,
  getSessionMessages,
  resetSession,
  removeSession,
  getActivityLog,
  setMessageFeedback,
  exportSession,
};
