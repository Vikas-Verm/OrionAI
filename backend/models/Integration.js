const mongoose = require("mongoose");

/**
 * Integration — stores user-configured external service connections
 * One document per user per integration type
 */
const integrationSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  type: {
    type: String,
    enum: ["slack", "notion", "jira", "gmail", "google_calendar", "webhook"],
    required: true,
  },

  // Display
  name: { type: String, default: "" }, // e.g. "Poshn Finance Slack"
  enabled: { type: Boolean, default: true },

  // Slack
  slack: {
    webhookUrl: { type: String, default: "" },
    channel: { type: String, default: "" }, // #finance
    workspaceName: { type: String, default: "" },
  },

  // Notion (Phase 2)
  notion: {
    apiToken: { type: String, default: "" },
    databaseId: { type: String, default: "" },
    pageId: { type: String, default: "" },
  },

  // Jira (Phase 2)
  jira: {
    domain: { type: String, default: "" },
    email: { type: String, default: "" },
    apiToken: { type: String, default: "" },
    projectKey: { type: String, default: "" },
  },

  // Gmail OAuth (Phase 2)
  gmail: {
    accessToken: { type: String, default: "" },
    refreshToken: { type: String, default: "" },
    expiresAt: { type: Date },
    userEmail: { type: String, default: "" }, // vikasverma@poshn.co
    userName: { type: String, default: "" }, // Vikas Verma
    clientId: { type: String, default: "" },
    clientSecret: { type: String, default: "" },
  },

  // Custom Webhook (Phase 2)
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

// One integration per user per type
integrationSchema.index({ userId: 1, type: 1 }, { unique: true });

integrationSchema.pre("save", function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model("Integration", integrationSchema);
