/**
 * migrateTokens.js
 * 📁 backend/scripts/migrateTokens.js
 *
 * ONE-TIME migration script — encrypts all existing plain tokens in MongoDB.
 * Run ONCE after adding ENCRYPTION_KEY to .env and patching Integration.js.
 *
 * Run: node scripts/migrateTokens.js
 *
 * Safe to run multiple times — already-encrypted tokens are skipped.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const crypto = require("crypto");

// ── Verify ENCRYPTION_KEY is set ─────────────────────────────────────────
if (!process.env.ENCRYPTION_KEY) {
  console.error("❌ ENCRYPTION_KEY not set in .env");
  console.error("Generate one with:");
  console.error(
    "   node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  );
  process.exit(1);
}
if (process.env.ENCRYPTION_KEY.length !== 64) {
  console.error("❌ ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  process.exit(1);
}

const { encrypt, SENSITIVE_FIELDS } = require("../services/tokenEncryption");

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB\n");

  const db = mongoose.connection.db;
  const integrations = await db.collection("integrations").find({}).toArray();

  console.log(`Found ${integrations.length} integrations to migrate\n`);

  let encrypted = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of integrations) {
    const type = doc.type;
    const fields = SENSITIVE_FIELDS[type];
    if (!fields || !doc[type]) {
      skipped++;
      continue;
    }

    const updates = {};
    let changed = false;

    for (const field of fields) {
      const value = doc[type][field];
      if (!value) continue;

      // Skip already encrypted values
      if (typeof value === "string" && value.startsWith("enc:")) {
        continue;
      }

      // Encrypt the value
      const encryptedValue = encrypt(value);
      updates[`${type}.${field}`] = encryptedValue;
      changed = true;
    }

    if (!changed) {
      skipped++;
      continue;
    }

    try {
      await db
        .collection("integrations")
        .updateOne({ _id: doc._id }, { $set: updates });
      encrypted++;
      console.log(
        `✅ Encrypted: ${type} for ${doc.userId} (${Object.keys(updates).join(
          ", "
        )})`
      );
    } catch (err) {
      errors++;
      console.error(`❌ Failed: ${type} for ${doc.userId} — ${err.message}`);
    }
  }

  console.log("\n─────────────────────────────────────");
  console.log(`✅ Encrypted: ${encrypted} integrations`);
  console.log(
    `⏭️  Skipped:   ${skipped} (already encrypted or no sensitive fields)`
  );
  console.log(`❌ Errors:    ${errors}`);
  console.log("\n🔐 All tokens are now encrypted in MongoDB.");
  console.log(
    "Even if your DB is compromised, tokens cannot be read without ENCRYPTION_KEY."
  );

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
