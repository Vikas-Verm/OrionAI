/**
 * gmailCache.js
 * SQLite-backed local message cache — one DB per user.
 * Requires: better-sqlite3
 */
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR =
  process.env.GMAIL_CACHE_DIR || path.join(__dirname, "../data/gmail_cache");

function getDb(userId) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, `${userId}.db`));
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous  = NORMAL");
  db.pragma("cache_size   = -16000");
  initSchema(db);
  // ── Safe migrations for existing DBs ─────────────────────────────
  // Each ALTER TABLE is wrapped in try/catch — silently skipped if
  // the column already exists, so this is safe to run every startup.
  const textCols = ["toAddr", "origFromAddr"];
  textCols.forEach((col) => {
    try {
      db.exec(`ALTER TABLE threads ADD COLUMN ${col} TEXT DEFAULT ''`);
    } catch {}
  });
  try {
    db.exec("ALTER TABLE threads ADD COLUMN starred INTEGER DEFAULT 0");
  } catch {}
  try {
    db.exec("ALTER TABLE sync_state ADD COLUMN pageToken TEXT DEFAULT NULL");
  } catch {}
  // Add missing indexes if they don't exist yet
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_thr_starred ON threads(starred, lastDateTs DESC)"
    );
  } catch {}
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY,
      threadId    TEXT NOT NULL,
      uid         INTEGER,
      folder      TEXT DEFAULT 'INBOX',
      fromAddr    TEXT DEFAULT '',
      toAddr      TEXT DEFAULT '',
      subject     TEXT DEFAULT '(no subject)',
      dateTs      INTEGER DEFAULT 0,
      dateStr     TEXT DEFAULT '',
      snippet     TEXT DEFAULT '',
      bodyText    TEXT DEFAULT '',
      bodyHtml    TEXT DEFAULT '',
      attachments TEXT DEFAULT '[]',
      flags       TEXT DEFAULT '[]',
      syncedAt    INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_msg_thread ON messages(threadId);
    CREATE INDEX IF NOT EXISTS idx_msg_folder ON messages(folder, dateTs DESC);

    CREATE TABLE IF NOT EXISTS threads (
      id           TEXT PRIMARY KEY,
      subject      TEXT DEFAULT '(no subject)',
      fromAddr     TEXT DEFAULT '',
      toAddr       TEXT DEFAULT '',
      origFromAddr TEXT DEFAULT '',
      lastDateTs   INTEGER DEFAULT 0,
      lastDateStr  TEXT DEFAULT '',
      snippet      TEXT DEFAULT '',
      unread       INTEGER DEFAULT 0,
      msgCount     INTEGER DEFAULT 1,
      folder       TEXT DEFAULT 'INBOX',
      starred      INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_thr_folder  ON threads(folder, lastDateTs DESC);
    CREATE INDEX IF NOT EXISTS idx_thr_starred ON threads(starred, lastDateTs DESC);

    CREATE TABLE IF NOT EXISTS sync_state (
      folder      TEXT PRIMARY KEY,
      uidValidity INTEGER DEFAULT 0,
      highestUid  INTEGER DEFAULT 0,
      syncedAt    INTEGER DEFAULT 0,
      pageToken   TEXT    DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_photos (
      email     TEXT PRIMARY KEY,
      photoUrl  TEXT,
      fetchedAt INTEGER DEFAULT 0
    );
  `);
}

// ── Thread helpers ─────────────────────────────────────────────────
function deriveThreadId(messageId, references) {
  if (references) {
    const refs = references.trim().split(/\s+/).filter(Boolean);
    if (refs.length) return refs[0].replace(/[<>]/g, "").toLowerCase();
  }
  return (
    (messageId || "").replace(/[<>]/g, "").toLowerCase() || `tid_${Date.now()}`
  );
}

// ── Write helpers ──────────────────────────────────────────────────
function upsertMessage(db, msg) {
  db.prepare(
    `
    INSERT INTO messages
      (id, threadId, uid, folder, fromAddr, toAddr, subject, dateTs, dateStr,
       snippet, bodyText, bodyHtml, attachments, flags, syncedAt)
    VALUES
      (@id, @threadId, @uid, @folder, @fromAddr, @toAddr, @subject, @dateTs, @dateStr,
       @snippet, @bodyText, @bodyHtml, @attachments, @flags, @syncedAt)
    ON CONFLICT(id) DO UPDATE SET
      flags    = excluded.flags,
      syncedAt = excluded.syncedAt,
      bodyText = CASE WHEN excluded.bodyText != '' THEN excluded.bodyText ELSE bodyText END,
      bodyHtml = CASE WHEN excluded.bodyHtml != '' THEN excluded.bodyHtml ELSE bodyHtml END
  `
  ).run(msg);
}

function upsertThread(db, thread) {
  db.prepare(
    `
    INSERT INTO threads
      (id, subject, fromAddr, toAddr, origFromAddr, lastDateTs, lastDateStr,
       snippet, unread, msgCount, folder, starred)
    VALUES
      (@id, @subject, @fromAddr, @toAddr, @origFromAddr, @lastDateTs, @lastDateStr,
       @snippet, @unread, @msgCount, @folder, @starred)
    ON CONFLICT(id) DO UPDATE SET
      lastDateTs   = MAX(lastDateTs,   excluded.lastDateTs),
      lastDateStr  = CASE WHEN excluded.lastDateTs > lastDateTs THEN excluded.lastDateStr  ELSE lastDateStr  END,
      fromAddr     = CASE WHEN excluded.lastDateTs > lastDateTs THEN excluded.fromAddr     ELSE fromAddr     END,
      toAddr       = CASE WHEN excluded.lastDateTs > lastDateTs THEN excluded.toAddr       ELSE toAddr       END,
      origFromAddr = CASE WHEN origFromAddr = '' THEN excluded.origFromAddr ELSE origFromAddr END,
      snippet      = CASE WHEN excluded.lastDateTs > lastDateTs THEN excluded.snippet      ELSE snippet      END,
      unread       = MAX(unread,   excluded.unread),
      starred      = MAX(starred,  excluded.starred),
      msgCount     = msgCount + 1
  `
  ).run(thread);
}

function setSyncState(db, folder, uidValidity, highestUid) {
  db.prepare(
    `
    INSERT INTO sync_state (folder, uidValidity, highestUid, syncedAt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(folder) DO UPDATE SET
      uidValidity = excluded.uidValidity,
      highestUid  = excluded.highestUid,
      syncedAt    = excluded.syncedAt
  `
  ).run(folder, uidValidity, highestUid, Date.now());
}

function getSyncState(db, folder) {
  return (
    db.prepare("SELECT * FROM sync_state WHERE folder = ?").get(folder) || null
  );
}

// ── Page token helpers (Gmail REST pagination) ─────────────────────
function getPageToken(db, folder) {
  const row = db
    .prepare("SELECT pageToken FROM sync_state WHERE folder = ?")
    .get(folder);
  return row?.pageToken || null;
}

function setPageToken(db, folder, token) {
  db.prepare(
    `
    INSERT INTO sync_state (folder, pageToken, syncedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(folder) DO UPDATE SET
      pageToken = excluded.pageToken,
      syncedAt  = excluded.syncedAt
  `
  ).run(folder, token || null, Date.now());
}

function saveContactPhotos(db, photoMap) {
  const stmt = db.prepare(`
    INSERT INTO contact_photos (email, photoUrl, fetchedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      photoUrl  = excluded.photoUrl,
      fetchedAt = excluded.fetchedAt
  `);
  for (const [email, url] of Object.entries(photoMap)) {
    stmt.run(email.toLowerCase(), url || null, Date.now());
  }
}

function getContactPhotos(db, emails) {
  const result = {};
  if (!emails.length) return result;
  const placeholders = emails.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT email, photoUrl FROM contact_photos WHERE email IN (${placeholders})`
    )
    .all(emails.map((e) => e.toLowerCase()));
  for (const row of rows) result[row.email] = row.photoUrl;
  return result;
}

function getMissingPhotoEmails(db, emails, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  return emails.filter((email) => {
    const row = db
      .prepare("SELECT fetchedAt FROM contact_photos WHERE email = ?")
      .get(email.toLowerCase());
    return !row || row.fetchedAt < cutoff;
  });
}

// ── Read helpers ───────────────────────────────────────────────────
function listThreads(db, folder, limit = 20, offset = 0, search = "") {
  if (search) {
    return db
      .prepare(
        `
      SELECT * FROM threads
      WHERE (subject LIKE ? OR fromAddr LIKE ? OR snippet LIKE ?)
      ORDER BY lastDateTs DESC LIMIT ? OFFSET ?
    `
      )
      .all(`%${search}%`, `%${search}%`, `%${search}%`, limit, offset);
  }
  // Starred uses its own column so starred-inbox emails show up correctly
  if (folder === "starred") {
    return db
      .prepare(
        "SELECT * FROM threads WHERE starred = 1 ORDER BY lastDateTs DESC LIMIT ? OFFSET ?"
      )
      .all(limit, offset);
  }
  const folderMap = {
    inbox: "INBOX",
    sent: "SENT",
    drafts: "DRAFTS",
    all: null,
  };
  const f = folderMap[folder] ?? "INBOX";
  if (f === null) {
    return db
      .prepare(
        "SELECT * FROM threads ORDER BY lastDateTs DESC LIMIT ? OFFSET ?"
      )
      .all(limit, offset);
  }
  return db
    .prepare(
      "SELECT * FROM threads WHERE folder = ? ORDER BY lastDateTs DESC LIMIT ? OFFSET ?"
    )
    .all(f, limit, offset);
}

function getThread(db, threadId) {
  return db
    .prepare("SELECT * FROM messages WHERE threadId = ? ORDER BY dateTs ASC")
    .all(threadId);
}

function getMessage(db, id) {
  return db.prepare("SELECT * FROM messages WHERE id = ?").get(id) || null;
}

function markRead(db, ids) {
  if (!ids.length) return;
  for (const id of ids) {
    const msg = db
      .prepare("SELECT threadId FROM messages WHERE id = ?")
      .get(id);
    if (!msg) continue;
    const row = db.prepare("SELECT flags FROM messages WHERE id = ?").get(id);
    const flags = JSON.parse(row?.flags || "[]").filter(
      (f) => f !== "\\Seen" && f !== "UNREAD"
    );
    flags.push("\\Seen");
    db.prepare("UPDATE messages SET flags = ? WHERE id = ?").run(
      JSON.stringify(flags),
      id
    );
    const unread = db
      .prepare(
        `SELECT COUNT(*) as c FROM messages WHERE threadId = ? AND flags NOT LIKE '%\\\\Seen%'`
      )
      .get(msg.threadId);
    db.prepare("UPDATE threads SET unread = ? WHERE id = ?").run(
      unread?.c || 0,
      msg.threadId
    );
  }
}

function hasCachedData(db, folder) {
  if (folder === "starred") {
    const row = db
      .prepare("SELECT COUNT(*) as c FROM threads WHERE starred = 1")
      .get();
    return (row?.c || 0) > 0;
  }
  const f = folder === "inbox" ? "INBOX" : folder.toUpperCase();
  const row = db
    .prepare("SELECT COUNT(*) as c FROM threads WHERE folder = ?")
    .get(f);
  return (row?.c || 0) > 0;
}

module.exports = {
  getDb,
  deriveThreadId,
  upsertMessage,
  upsertThread,
  setSyncState,
  getSyncState,
  getPageToken,
  setPageToken,
  saveContactPhotos,
  getContactPhotos,
  getMissingPhotoEmails,
  listThreads,
  getThread,
  getMessage,
  markRead,
  hasCachedData,
};
