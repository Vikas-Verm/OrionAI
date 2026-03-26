const mongoose = require("mongoose");
const {
  encryptIntegration,
  decryptIntegration,
} = require("../services/tokenEncryption");

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
      "database",
      "razorpay",
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

  // ── Database Integration ──────────────────────────────────────────────────
  database: {
    vendor: {
      type: String,
      enum: ["mongodb", "postgres", "mysql", "sqlite"],
      default: "postgres",
    },
    connectionString: { type: String, default: "" },
    filePath: { type: String, default: "" },
    ssl: { type: Boolean, default: false },
    defaultSchema: { type: String, default: "public" },
    readOnly: { type: Boolean, default: true },
  },

  // ── Razorpay ───────────────────────────────────────────────────────────────
  razorpay: {
    keyId: { type: String, default: "" },
    keySecret: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    webhookSecret: { type: String, default: "" },
  },

  lastTestedAt: { type: Date },
  lastTestOk: { type: Boolean },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// ── Helper: decrypt a single integration document in-place ───────────────
function decryptDoc(doc) {
  if (!doc || !doc.type) return;
  const type = doc.type;
  if (doc[type] && typeof doc[type] === "object") {
    const decrypted = decryptIntegration(
      type,
      doc[type].toObject ? doc[type].toObject() : doc[type]
    );
    Object.assign(doc[type], decrypted);
  }
}

// ── pre save: encrypt before writing ─────────────────────────────────────
integrationSchema.pre("save", function (next) {
  const type = this.type;
  if (this[type] && typeof this[type] === "object") {
    const encrypted = encryptIntegration(
      type,
      this[type].toObject ? this[type].toObject() : this[type]
    );
    Object.assign(this[type], encrypted);
  }
  next();
});

// ── pre findOneAndUpdate: encrypt fields being updated ────────────────────
integrationSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  const set = update?.$set || {};

  // Find any integration type fields being updated (e.g. "gmail.accessToken")
  for (const key of Object.keys(set)) {
    const parts = key.split(".");
    if (parts.length === 2) {
      const [type, field] = parts;
      const { SENSITIVE_FIELDS } = require("../services/tokenEncryption");
      const { encrypt } = require("../services/tokenEncryption");
      if (SENSITIVE_FIELDS[type]?.includes(field) && set[key]) {
        set[key] = encrypt(set[key]);
      }
    }
  }
  next();
});
integrationSchema.index({ userId: 1, type: 1 }, { unique: true });

integrationSchema.pre("save", function () {
  this.updatedAt = new Date();
});

// ── post find: decrypt after reading ─────────────────────────────────────
integrationSchema.post("find", function (docs) {
  if (Array.isArray(docs)) docs.forEach(decryptDoc);
});

integrationSchema.post("findOne", function (doc) {
  if (doc) decryptDoc(doc);
});

integrationSchema.post("findOneAndUpdate", function (doc) {
  if (doc) decryptDoc(doc);
});
module.exports = mongoose.model("Integration", integrationSchema);
