const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  role: String,
  content: String,
});

const conversationSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: String, default: "guest" }, // ← add this
  title: { type: String, default: "New Chat" },
  messages: [messageSchema],
  updatedAt: { type: Date, default: Date.now },
});

const Conversation = mongoose.model("Conversation", conversationSchema);

module.exports = Conversation;
