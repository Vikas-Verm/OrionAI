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
      "whatsapp",
    ],
    required: true,
  },

  name: { type: String, default: "" },
  enabled: { type: Boolean, default: true },

  // ── Slack OAuth ────────────────────────────────────────────────────────────
  // FIXED: was defined twice — old webhook-only version removed, OAuth version kept
  slack: {
    userToken: { type: String, default: "" }, // xoxp-... user token
    userId: { type: String, default: "" }, // Slack user ID e.g. U012AB3CD
    userName: { type: String, default: "" }, // Slack username
    realName: { type: String, default: "" }, // Display name
    teamId: { type: String, default: "" }, // Workspace ID
    teamName: { type: String, default: "" }, // Workspace name
    connectedAt: { type: Date },
    webhookUrl: { type: String, default: "" }, // kept for backwards compat
    channel: { type: String, default: "" }, // kept for backwards compat
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
    sessionString: { type: String, default: "" },
    phone: { type: String, default: "" },
    username: { type: String, default: "" },
    firstName: { type: String, default: "" },
  },

  // ── WhatsApp (Baileys) ─────────────────────────────────────────────────────
  whatsapp: {
    connected: { type: Boolean, default: false },
    phone: { type: String, default: "" },
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
