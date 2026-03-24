const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ["user", "assistant", "system"],
    required: true,
  },
  content: { type: String, required: true },
  isAgent: { type: Boolean, default: false },
  agentDone: { type: Boolean, default: false },
  steps: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now },
});

const activitySchema = new mongoose.Schema({
  message: { type: String },
  collection: { type: String },
  queryType: { type: String },
  explanation: { type: String },
  recordCount: { type: Number },
  createdAt: { type: Date, default: Date.now },
});

const conversationSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  title: { type: String, default: "New Chat" },
  mode: { type: String, enum: ["chat", "db", "rag", "agent"], default: "chat" }, // ← new
  messages: [messageSchema],
  activityLog: [activitySchema], // ← new
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index for faster queries
conversationSchema.index({ userId: 1, updatedAt: -1 });

module.exports =
  mongoose.models.Conversation ||
  mongoose.model("Conversation", conversationSchema);
