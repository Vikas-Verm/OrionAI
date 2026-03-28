const mongoose = require("mongoose");
const {
  computeAgentConversationExpiry,
  isAgentConversationMode,
} = require("../services/conversationRetention");

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
  feedback: {
    rating: {
      type: String,
      enum: ["up", "down"],
      default: null,
    },
    updatedAt: { type: Date, default: null },
  },
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
  expiresAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index for faster queries
conversationSchema.index({ userId: 1, updatedAt: -1 });
conversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

conversationSchema.pre("save", function (next) {
  this.updatedAt = new Date();

  if (isAgentConversationMode(this.mode) && !this.isDeleted) {
    this.expiresAt = computeAgentConversationExpiry(this.updatedAt);
  } else {
    this.expiresAt = undefined;
  }

  next();
});

conversationSchema.pre("findOneAndUpdate", async function () {
  const update = this.getUpdate() || {};
  const existing = await this.model.findOne(this.getQuery()).select("mode").lean();
  const mode =
    update?.$set?.mode ||
    update?.$setOnInsert?.mode ||
    update?.mode ||
    existing?.mode ||
    "";
  const markedDeleted = update?.isDeleted === true || update?.$set?.isDeleted === true;
  const nextUpdate = { ...update };
  const nextSet = { ...(nextUpdate.$set || {}) };
  nextSet.updatedAt = new Date();

  if (isAgentConversationMode(mode) && !markedDeleted) {
    nextSet.expiresAt = computeAgentConversationExpiry(nextSet.updatedAt);
  } else {
    delete nextSet.expiresAt;
    nextUpdate.$unset = { ...(nextUpdate.$unset || {}), expiresAt: 1 };
  }

  nextUpdate.$set = nextSet;
  this.setUpdate(nextUpdate);
});

module.exports =
  mongoose.models.Conversation ||
  mongoose.model("Conversation", conversationSchema);
