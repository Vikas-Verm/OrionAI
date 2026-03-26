/**
 * tokenEncryption.js
 * 📁 backend/services/tokenEncryption.js
 *
 * AES-256-GCM encryption for all OAuth tokens and API keys.
 *
 * Setup: Add to .env
 *   ENCRYPTION_KEY=<64 hex chars>
 *
 * Generate a key (run once in terminal):
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

"use strict";

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // bytes
const TAG_LENGTH = 16; // bytes

// ── Get encryption key from env ───────────────────────────────────────────
function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    // Warn once — don't crash, allows existing unencrypted tokens to still work
    if (!getKey._warned) {
      console.warn(
        "⚠️  ENCRYPTION_KEY not set in .env — tokens stored unencrypted. " +
          "Run: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
          "and add ENCRYPTION_KEY=<result> to your .env"
      );
      getKey._warned = true;
    }
    return null;
  }
  if (hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)"
    );
  }
  return Buffer.from(hex, "hex");
}

// ── Encrypt a string ──────────────────────────────────────────────────────
// Returns: "iv:tag:encrypted" (all hex) or original value if no key set
function encrypt(plaintext) {
  if (!plaintext) return plaintext;

  const key = getKey();
  if (!key) return plaintext; // no key = store as-is (backward compat)

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Prefix with "enc:" so we can detect encrypted vs plain values
  return (
    "enc:" +
    [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(
      ":"
    )
  );
}

// ── Decrypt a string ──────────────────────────────────────────────────────
// Handles both encrypted ("enc:iv:tag:data") and plain (legacy) values
function decrypt(value) {
  if (!value) return value;

  // Plain value (not encrypted yet) — return as-is
  if (!value.startsWith("enc:")) return value;

  const key = getKey();
  if (!key) {
    console.error(
      "ENCRYPTION_KEY not set but encrypted token found — cannot decrypt"
    );
    return null;
  }

  try {
    const parts = value.slice(4).split(":"); // remove "enc:" prefix
    const iv = Buffer.from(parts[0], "hex");
    const tag = Buffer.from(parts[1], "hex");
    const encrypted = Buffer.from(parts[2], "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return decipher.update(encrypted) + decipher.final("utf8");
  } catch (err) {
    console.error("Token decryption failed:", err.message);
    return null;
  }
}

// ── Encrypt all sensitive fields in an integration object ─────────────────
// Call before saving to MongoDB
function encryptIntegration(type, data) {
  if (!data) return data;
  const d = { ...data };
  const fields = SENSITIVE_FIELDS[type] || [];
  for (const field of fields) {
    if (d[field]) d[field] = encrypt(d[field]);
  }
  return d;
}

// ── Decrypt all sensitive fields in an integration object ─────────────────
// Call after reading from MongoDB, before using tokens
function decryptIntegration(type, data) {
  if (!data) return data;
  const d = { ...data };
  const fields = SENSITIVE_FIELDS[type] || [];
  for (const field of fields) {
    if (d[field]) d[field] = decrypt(d[field]);
  }
  return d;
}

// ── Which fields to encrypt per integration type ──────────────────────────
const SENSITIVE_FIELDS = {
  gmail: ["accessToken", "refreshToken", "clientSecret"],
  google_calendar: ["accessToken", "refreshToken", "clientSecret"],
  slack: ["userToken", "botToken", "accessToken", "clientSecret"],
  telegram: ["sessionString", "apiHash"],
  whatsapp: ["sessionData"],
  jira: ["apiToken"],
  notion: ["apiToken"],
  database: ["connectionString"],
  razorpay: ["keySecret"],
  github: ["accessToken", "clientSecret"],
};

module.exports = {
  encrypt,
  decrypt,
  encryptIntegration,
  decryptIntegration,
  SENSITIVE_FIELDS,
};
