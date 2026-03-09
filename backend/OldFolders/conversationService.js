const Conversation = require("./conversationModel");

// Load conversation from MongoDB
async function loadConversation(sessionId) {
  const conversation = await Conversation.findOne({ sessionId });
  if (!conversation) return [];
  return conversation.messages;
}

// Save conversation to MongoDB
async function saveConversation(sessionId, messages) {
  await Conversation.findOneAndUpdate(
    { sessionId },
    { messages, updatedAt: Date.now() },
    { upsert: true }
  );
}

// Get all sessions for a specific user
async function getAllSessions(userId) {
  // ← fixed: accepts userId as param
  const sessions = await Conversation.find(
    { userId },
    { sessionId: 1, title: 1, updatedAt: 1 }
  ).sort({ updatedAt: -1 });
  return sessions;
}

// Create a new session
async function createSession(sessionId, title, userId = "guest") {
  const session = new Conversation({ sessionId, title, userId, messages: [] });
  await session.save();
  return session;
}

// Update chat title (auto-generated from first message)
async function updateSessionTitle(sessionId, title) {
  await Conversation.findOneAndUpdate(
    { sessionId },
    { $set: { title } },
    { returnDocument: "after" }
  );
}

// Summarize old messages using Azure client
async function summarizeConversation(messages, azureClient) {
  // ← fixed: uses azureClient
  const conversationText = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const response = await azureClient.post("chat/completions", {
    messages: [
      {
        role: "user",
        content: `Summarize this conversation in 3-4 bullet points. Keep it brief and factual — only what was discussed and decided:

${conversationText}

Summary:`,
      },
    ],
    max_tokens: 200,
    temperature: 0.3,
  });

  return response.data.choices[0].message.content;
}

module.exports = {
  loadConversation,
  saveConversation,
  getAllSessions,
  createSession,
  updateSessionTitle,
  summarizeConversation,
};
