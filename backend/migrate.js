const path = require("path");
const fs = require("fs");

// Search every plausible location for the gmail_cache directory
const candidates = [
  path.join(__dirname, "data/gmail_cache"),
  path.join(__dirname, "utils/gmail_cache"),
  path.join(__dirname, "../data/gmail_cache"),
  path.join(__dirname, "gmail_cache"),
  process.env.GMAIL_CACHE_DIR,
].filter(Boolean);

console.log("Searching for gmail_cache...\n");
let found = null;
for (const p of candidates) {
  const exists = fs.existsSync(p);
  console.log(exists ? "✓ FOUND:" : "✗ missing:", p);
  if (exists && !found) found = p;
}

if (!found) {
  console.log("\nNo existing DB found anywhere.");
  console.log("→ This is fine — it means no emails have been synced yet.");
  console.log("→ Just restart your server. The new gmailCache.js will create");
  console.log("  the DB fresh with the correct schema (including 'starred').");
  console.log("  No migration needed.");
  process.exit(0);
}

// DB exists — run migration
const Database = require("better-sqlite3");
const files = fs.readdirSync(found).filter((f) => f.endsWith(".db"));
console.log(`\nFound ${files.length} DB file(s) in: ${found}`);

for (const file of files) {
  console.log(`\nMigrating ${file}...`);
  const db = new Database(path.join(found, file));
  const threadCols = db.pragma("table_info(threads)").map((c) => c.name);
  const syncCols = db.pragma("table_info(sync_state)").map((c) => c.name);

  if (!threadCols.includes("toAddr")) {
    db.exec("ALTER TABLE threads ADD COLUMN toAddr TEXT DEFAULT ''");
    console.log("  ✓ Added toAddr");
  }
  if (!threadCols.includes("origFromAddr")) {
    db.exec("ALTER TABLE threads ADD COLUMN origFromAddr TEXT DEFAULT ''");
    console.log("  ✓ Added origFromAddr");
  }
  if (!threadCols.includes("starred")) {
    db.exec("ALTER TABLE threads ADD COLUMN starred INTEGER DEFAULT 0");
    console.log("  ✓ Added starred");
  } else {
    console.log("  — starred already exists");
  }
  if (!syncCols.includes("pageToken")) {
    db.exec("ALTER TABLE sync_state ADD COLUMN pageToken TEXT DEFAULT NULL");
    console.log("  ✓ Added pageToken");
  } else {
    console.log("  — pageToken already exists");
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_thr_starred ON threads(starred, lastDateTs DESC)"
  );
  console.log("  ✓ Index ensured");
  db.close();
}

console.log("\n✓ Migration complete — restart your server.");
