const mongoose = require("mongoose");

const integrationSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  type: {
    type: String,
    enum: [
      "slack",
      "notion",
      "jira",
      "gmail",
      "google_calendar",
      "webhook",
      "telegram",
      "whatsapp", // ← ADDED
    ],
    required: true,
  },

  name: { type: String, default: "" },
  enabled: { type: Boolean, default: true },

  // ── Slack ──────────────────────────────────────────────────────────────────
  slack: {
    webhookUrl: { type: String, default: "" },
    channel: { type: String, default: "" },
    workspaceName: { type: String, default: "" },
  },

  // ── Notion ─────────────────────────────────────────────────────────────────
  notion: {
    apiToken: { type: String, default: "" },
    databaseId: { type: String, default: "" },
    pageId: { type: String, default: "" },
  },

  // ── Jira ───────────────────────────────────────────────────────────────────
  jira: {
    domain: { type: String, default: "" },
    email: { type: String, default: "" },
    apiToken: { type: String, default: "" },
    projectKey: { type: String, default: "" },
  },

  // ── Gmail OAuth ────────────────────────────────────────────────────────────
  gmail: {
    accessToken: { type: String, default: "" },
    refreshToken: { type: String, default: "" },
    expiresAt: { type: Date },
    userEmail: { type: String, default: "" },
    userName: { type: String, default: "" },
    clientId: { type: String, default: "" },
    clientSecret: { type: String, default: "" },
  },

  // ── Google Calendar OAuth ──────────────────────────────────────────────────
  googleCalendar: {
    accessToken: { type: String, default: "" },
    refreshToken: { type: String, default: "" },
    expiresAt: { type: Date },
    userEmail: { type: String, default: "" },
    userName: { type: String, default: "" },
    clientId: { type: String, default: "" },
    clientSecret: { type: String, default: "" },
  },

  // ── Telegram MTProto ───────────────────────────────────────────────────────
  telegram: {
    sessionString: { type: String, default: "" }, // gramjs StringSession
    phone: { type: String, default: "" },
    username: { type: String, default: "" },
    firstName: { type: String, default: "" },
  },

  // ── WhatsApp (Baileys) ─────────────────────────────────────────────────────
  whatsapp: {
    // Baileys saves auth files to disk per user; we store connected flag + phone
    connected: { type: Boolean, default: false },
    phone: { type: String, default: "" },
  },

  slack: {
    userToken: { type: String },
    userId: { type: String }, // Slack user ID e.g. U012AB3CD
    userName: { type: String }, // Slack username
    realName: { type: String }, // Display name
    teamId: { type: String },
    teamName: { type: String },
    connectedAt: { type: Date },
    webhookUrl: { type: String },
  },
  // ── Custom Webhook ─────────────────────────────────────────────────────────
  webhook: {
    url: { type: String, default: "" },
    method: { type: String, default: "POST" },
    headers: { type: Map, of: String, default: {} },
    secret: { type: String, default: "" },
  },

  lastTestedAt: { type: Date },
  lastTestOk: { type: Boolean },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

integrationSchema.index({ userId: 1, type: 1 }, { unique: true });

integrationSchema.pre("save", function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model("Integration", integrationSchema);
