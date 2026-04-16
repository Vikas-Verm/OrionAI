const mongoose = require("mongoose");
const {
  encryptIntegration,
  decryptIntegration,
  SENSITIVE_FIELDS,
  encrypt,
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
      "google_docs",
      "google_sheets",
      "google_calendar",
      "webhook",
      "telegram",
      "signal",
      "whatsapp",
      "database",
      "razorpay",
    ],
    required: true,
  },

  name: { type: String, default: "" },
  enabled: { type: Boolean, default: true },
  transport: {
    type: String,
    enum: ["native", "mautrix"],
    default: "mautrix",
  },
  matrix: {
    homeserverUrl: { type: String, default: "http://localhost:8008" },
    mxid: { type: String, default: "" },
    accessToken: { type: String, default: "" },
    deviceId: { type: String, default: "" },
    managementRoomId: { type: String, default: "" },
    bridgeBotMxid: { type: String, default: "" },
    loginState: {
      type: String,
      enum: [
        "disconnected",
        "creating_account",
        "logging_in",
        "pending_qr",
        "connected",
        "error",
      ],
      default: "disconnected",
    },
    lastError: { type: String, default: "" },
    connectedAt: { type: Date, default: null },
  },

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

  // ── Google Docs OAuth ─────────────────────────────────────────────────────
  googleDocs: {
    accessToken: { type: String, default: "" },
    refreshToken: { type: String, default: "" },
    expiresAt: { type: Date },
    userEmail: { type: String, default: "" },
    userName: { type: String, default: "" },
    clientId: { type: String, default: "" },
    clientSecret: { type: String, default: "" },
  },

  // ── Google Sheets OAuth ───────────────────────────────────────────────────
  googleSheets: {
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
    pendingSessionString: { type: String, default: "" },
    phoneCodeHash: { type: String, default: "" },
    pendingPhone: { type: String, default: "" },
    phone: { type: String, default: "" },
    username: { type: String, default: "" },
    firstName: { type: String, default: "" },
  },

  // ── Signal via mautrix / Matrix ───────────────────────────────────────────
  signal: {
    homeserverUrl: { type: String, default: "" },
    mxid: { type: String, default: "" },
    password: { type: String, default: "" },
    accessToken: { type: String, default: "" },
    deviceId: { type: String, default: "" },
    deviceDisplayName: { type: String, default: "" },
    displayName: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    bridgeBotMxid: { type: String, default: "" },
    managementRoomId: { type: String, default: "" },
    connectedAt: { type: Date },
  },

  // ── WhatsApp via mautrix / Matrix ─────────────────────────────────────────
  whatsapp: {
    connected: { type: Boolean, default: false },
    phone: { type: String, default: "" },
    profileName: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    connectedAt: { type: Date, default: null },
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
  if (
    ["signal", "whatsapp"].includes(type) &&
    doc.matrix &&
    typeof doc.matrix === "object"
  ) {
    const decryptedMatrix = decryptIntegration(
      "matrix",
      doc.matrix.toObject ? doc.matrix.toObject() : doc.matrix
    );
    Object.assign(doc.matrix, decryptedMatrix);
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
  if (
    ["signal", "whatsapp"].includes(type) &&
    this.matrix &&
    typeof this.matrix === "object"
  ) {
    const encryptedMatrix = encryptIntegration(
      "matrix",
      this.matrix.toObject ? this.matrix.toObject() : this.matrix
    );
    Object.assign(this.matrix, encryptedMatrix);
  }
  next();
});

// ── pre findOneAndUpdate: encrypt fields being updated ────────────────────
integrationSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  const set = update?.$set || {};

  // Handle both whole integration object updates (e.g. "signal": {...})
  // and dotted field updates (e.g. "gmail.accessToken").
  for (const [key, value] of Object.entries(set)) {
    const parts = key.split(".");
    if (parts.length === 1) {
      const [type] = parts;
      if (SENSITIVE_FIELDS[type] && value && typeof value === "object") {
        set[key] = encryptIntegration(type, value);
      }
      if (type === "matrix" && value && typeof value === "object") {
        set[key] = encryptIntegration("matrix", value);
      }
      continue;
    }

    if (parts.length === 2) {
      const [type, field] = parts;
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
