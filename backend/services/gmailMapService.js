/**
 * gmailSyncService.js — Gmail REST API sync engine
 * Same architecture as IMAP approach: SQLite cache + SSE push
 * Works with standard scopes — no Workspace admin approval needed.
 *
 * Flow:
 *   1. Initial sync: fetch last 50 messages via REST → SQLite
 *   2. Incremental sync: Gmail History API (only fetches changes)
 *   3. Poll every 30s for new mail → SSE push to frontend
 */
const axios = require("axios");
const cache = require("../utils/gmailCache");
const EventEmitter = require("events");

const managers = new Map(); // userId → GmailRestSyncManager
const sseClients = new Map();

// ── SSE ────────────────────────────────────────────────────────────
function broadcast(userId, event, data) {
  const clients = sseClients.get(userId);
  if (!clients?.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of [...clients]) {
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}
function addSseClient(userId, res) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  const client = { res };
  sseClients.get(userId).add(client);
  return () => sseClients.get(userId)?.delete(client);
}

// ── Parsing helpers ────────────────────────────────────────────────
function hdr(headers = [], name) {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    ""
  );
}
function b64(data) {
  if (!data) return "";
  return Buffer.from(
    data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("utf-8");
}
function extractBody(payload, mime) {
  if (!payload) return "";
  if (payload.mimeType === mime && payload.body?.data)
    return b64(payload.body.data);
  if (payload.parts) {
    const hit = payload.parts.find((p) => p.mimeType === mime);
    if (hit?.body?.data) return b64(hit.body.data);
    for (const p of payload.parts) {
      const r = extractBody(p, mime);
      if (r) return r;
    }
  }
  return "";
}
function extractAtts(payload, out = []) {
  if (!payload) return out;
  if (payload.filename && payload.body?.attachmentId)
    out.push({
      filename: payload.filename,
      mimeType: payload.mimeType || "application/octet-stream",
      size: payload.body.size || 0,
      attachmentId: payload.body.attachmentId,
    });
  if (payload.parts) payload.parts.forEach((p) => extractAtts(p, out));
  return out;
}
function isRichHtml(html) {
  if (!html) return false;
  // Strip all tags and get plain text
  const plain = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Very short content is never "rich" regardless of tags
  if (plain.length < 80) return false;
  const ratio = plain.length / html.length;
  // Has actual rich elements: images, tables, styled divs
  const hasRich =
    /<(img|table|td|style)[^>]*>/i.test(html) ||
    /style\s*=\s*["'][^"']*(color|background|font-size|font-family|padding|margin)[^"']*["']/i.test(
      html
    );
  // If rich elements exist → use iframe
  if (hasRich) return true;
  // If mostly tags with little content → treat as plain text
  return ratio > 0.25; // at least 25% real text content
}
function fmtDate(raw) {
  if (!raw) return "";
  try {
    return new Date(raw).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return raw;
  }
}

function msgToRow(msg) {
  const hdrs = msg.payload?.headers || [];
  const fromAddr = hdr(hdrs, "From");
  const toAddr = hdr(hdrs, "To");
  const subject = hdr(hdrs, "Subject") || "(no subject)";
  const rawDate = hdr(hdrs, "Date");
  const msgId = hdr(hdrs, "Message-ID") || msg.id;
  const refs = hdr(hdrs, "References") || hdr(hdrs, "In-Reply-To") || "";
  const dateTs = rawDate
    ? new Date(rawDate).getTime()
    : Number(msg.internalDate || Date.now());
  const dateStr = fmtDate(rawDate || new Date(dateTs).toUTCString());
  const threadId = msg.threadId || cache.deriveThreadId(msgId, refs);
  const rawHtml = extractBody(msg.payload, "text/html");
  const rawText = extractBody(msg.payload, "text/plain");
  const useHtml = rawHtml && isRichHtml(rawHtml);
  const bodyHtml = useHtml ? rawHtml : "";
  const bodyText = useHtml
    ? ""
    : rawText ||
      rawHtml
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
  const snippet = (msg.snippet || bodyText)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  const unread = msg.labelIds?.includes("UNREAD") || false;
  const flags = unread ? [] : ["\\Seen"];

  // Map Gmail labelIds → folder. starred is a separate flag, not a folder.
  let folder = "INBOX";
  if (msg.labelIds?.includes("SENT")) folder = "SENT";
  if (msg.labelIds?.includes("DRAFT")) folder = "DRAFTS";
  const isStarred = msg.labelIds?.includes("STARRED") ? 1 : 0;

  return {
    message: {
      id: msg.id,
      threadId,
      uid: Number(msg.internalDate || 0),
      folder,
      fromAddr,
      toAddr,
      subject,
      dateTs,
      dateStr,
      snippet,
      bodyText,
      bodyHtml,
      attachments: JSON.stringify(extractAtts(msg.payload)),
      flags: JSON.stringify(flags),
      syncedAt: Date.now(),
    },
    thread: {
      id: threadId,
      subject,
      fromAddr,
      toAddr,
      origFromAddr: fromAddr,
      lastDateTs: dateTs,
      lastDateStr: dateStr,
      snippet,
      unread: unread ? 1 : 0,
      msgCount: 1,
      folder,
      starred: isStarred,
    },
  };
}

// ── Sync Manager ───────────────────────────────────────────────────
class GmailRestSyncManager extends EventEmitter {
  constructor(userId, auth) {
    super();
    this.userId = userId;
    this.auth = auth;
    this.db = cache.getDb(userId);
    this.status = "idle";
    this.lastSyncAt = 0;
    this.historyId = null;
    this.pollTimer = null;
    this.destroyed = false;
    this.syncing = false;
    this.totalCached = 0; // running count shown in UI
  }

  async start() {
    if (this.destroyed) return;
    await this._fullSync();
    this._schedulePoll();
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.pollTimer);
  }

  getStatus() {
    return { status: this.status, lastSyncAt: this.lastSyncAt };
  }

  async _client() {
    const token = await this.auth.getToken();
    return axios.create({
      baseURL: "https://gmail.googleapis.com/gmail/v1/users/me",
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20000,
    });
  }

  _setStatus(s) {
    this.status = s;
  }

  // ── Phase 1: fast first-page sync so UI loads immediately ─────────
  // ── Phase 2: background deep sync — pages through ALL emails ──────
  //
  // Gmail API max = 500 per request. For 4,619 emails that is ~10 pages.
  // Phase 1 fetches the first page fast and marks status "synced" so the
  // frontend becomes usable immediately. Phase 2 then quietly pages through
  // everything else in the background, broadcasting progress every 200 msgs.
  async _fullSync() {
    if (this.destroyed || this.syncing) return;
    this.syncing = true;
    this._setStatus("syncing");
    broadcast(this.userId, "sync_status", { status: "syncing" });
    console.log(`[REST:${this.userId}] Starting full sync...`);

    try {
      const api = await this._client();

      // ── Phase 1: fetch first page of inbox + sent + starred in parallel ──
      const [inboxR, sentR, starredR] = await Promise.all([
        this._listPage(api, "in:inbox", 500),
        this._listPage(api, "in:sent", 200),
        this._listPage(api, "is:starred", 500),
      ]);

      const seenIds = new Set();
      const phase1Ids = [];
      for (const id of [...inboxR.ids, ...sentR.ids, ...starredR.ids]) {
        if (!seenIds.has(id)) {
          seenIds.add(id);
          phase1Ids.push(id);
        }
      }

      let count = await this._fetchAndCache(api, phase1Ids);

      // Save historyId for incremental updates
      const profile = await api.get("/profile").catch(() => null);
      if (profile?.data?.historyId) this.historyId = profile.data.historyId;

      // Mark synced immediately — frontend is usable now
      this.lastSyncAt = Date.now();
      this._setStatus("synced");
      broadcast(this.userId, "sync_status", {
        status: "synced",
        count,
        lastSyncAt: this.lastSyncAt,
      });
      broadcast(this.userId, "inbox_updated", { folder: "inbox" });
      console.log(
        `[REST:${this.userId}] Phase 1 done — ${count} messages. Starting deep sync...`
      );

      // ── Phase 2: background deep sync — follow all nextPageTokens ────
      // Run fire-and-forget so _schedulePoll isn't blocked
      this.syncing = false;
      this._deepSync(api, inboxR.nextPageToken, seenIds, count).catch((e) =>
        console.error(`[REST:${this.userId}] Deep sync error:`, e.message)
      );
    } catch (err) {
      console.error(`[REST:${this.userId}] Full sync error:`, err.message);
      this._setStatus("error");
      broadcast(this.userId, "sync_status", {
        status: "error",
        error: err.message,
      });
      this.syncing = false;
    }
  }

  // Deep sync: page through ALL remaining inbox emails until no more nextPageToken
  async _deepSync(api, nextPageToken, seenIds, startCount) {
    if (!nextPageToken || this.destroyed) return;
    let token = nextPageToken;
    let total = startCount;
    let page = 1;

    while (token && !this.destroyed) {
      try {
        const r = await api.get("/messages", {
          params: { q: "in:inbox", maxResults: 500, pageToken: token },
        });
        const ids = (r.data.messages || [])
          .map((m) => m.id)
          .filter((id) => !seenIds.has(id));
        ids.forEach((id) => seenIds.add(id));
        token = r.data.nextPageToken || null;

        if (ids.length) {
          const added = await this._fetchAndCache(api, ids);
          total += added;
          page++;
          console.log(
            `[REST:${this.userId}] Deep sync page ${page} — ${total} total cached`
          );

          // Broadcast progress every page so frontend count updates
          broadcast(this.userId, "sync_status", {
            status: "syncing_deep",
            count: total,
            lastSyncAt: this.lastSyncAt,
          });
          // Refresh list every 2 pages so new emails appear gradually
          if (page % 2 === 0) {
            broadcast(this.userId, "inbox_updated", { folder: "inbox" });
          }
        }
      } catch (err) {
        console.error(
          `[REST:${this.userId}] Deep sync page error:`,
          err.message
        );
        // Brief pause then retry on transient errors
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    if (!this.destroyed) {
      console.log(
        `[REST:${this.userId}] Deep sync complete — ${total} total messages cached`
      );
      this.lastSyncAt = Date.now();
      broadcast(this.userId, "sync_status", {
        status: "synced",
        count: total,
        lastSyncAt: this.lastSyncAt,
        deepSyncDone: true,
      });
      broadcast(this.userId, "inbox_updated", { folder: "inbox" });
    }
  }

  // Fetch full message details for a list of IDs in batches of 10
  async _fetchAndCache(api, ids) {
    let count = 0;
    for (let i = 0; i < ids.length; i += 10) {
      if (this.destroyed) break;
      const batch = ids.slice(i, i + 10);
      const msgs = await Promise.all(
        batch.map((id) =>
          api
            .get(`/messages/${id}`, { params: { format: "full" } })
            .then((r) => r.data)
            .catch(() => null)
        )
      );
      for (const msg of msgs) {
        if (!msg) continue;
        const { message, thread } = msgToRow(msg);
        cache.upsertMessage(this.db, message);
        cache.upsertThread(this.db, thread);
        count++;
      }
    }
    return count;
  }

  // Fetch one page of message IDs
  async _listPage(api, q, maxResults = 500) {
    try {
      const r = await api.get("/messages", { params: { q, maxResults } });
      return {
        ids: (r.data.messages || []).map((m) => m.id),
        nextPageToken: r.data.nextPageToken || null,
      };
    } catch {
      return { ids: [], nextPageToken: null };
    }
  }

  // Legacy helper for _miniSync
  async _listIds(api, q, max) {
    const { ids } = await this._listPage(api, q, max);
    return ids;
  }

  // ── Incremental sync via Gmail History API ───────────────────────
  async _incrementalSync() {
    if (this.destroyed || this.syncing || !this.historyId) {
      // No historyId yet → do a mini sync of last 10 messages
      return this._miniSync();
    }
    this.syncing = true;
    try {
      const api = await this._client();
      const r = await api.get("/history", {
        params: {
          startHistoryId: this.historyId,
          historyTypes: "messageAdded",
        },
      });
      const history = r.data.history || [];
      const newHistoryId = r.data.historyId;
      if (newHistoryId) this.historyId = newHistoryId;

      const newIds = [];
      for (const h of history) {
        for (const m of h.messagesAdded || []) newIds.push(m.message.id);
      }

      if (!newIds.length) return; // nothing new

      console.log(
        `[REST:${this.userId}] ${newIds.length} new messages via History API`
      );

      const msgs = await Promise.all(
        newIds.map((id) =>
          api
            .get(`/messages/${id}`, { params: { format: "full" } })
            .then((r) => r.data)
            .catch(() => null)
        )
      );
      for (const msg of msgs) {
        if (!msg) continue;
        const { message, thread } = msgToRow(msg);
        cache.upsertMessage(this.db, message);
        cache.upsertThread(this.db, thread);
      }

      this.lastSyncAt = Date.now();
      this._setStatus("synced");
      broadcast(this.userId, "sync_status", {
        status: "synced",
        lastSyncAt: this.lastSyncAt,
      });
      broadcast(this.userId, "inbox_updated", { folder: "inbox" });
    } catch (err) {
      // 404 means historyId is too old — fall back to full sync
      if (err.response?.status === 404) {
        this.historyId = null;
        await this._fullSync();
      }
    } finally {
      this.syncing = false;
    }
  }

  // Mini sync: just check last 5 inbox messages for changes
  async _miniSync() {
    if (this.destroyed || this.syncing) return;
    this.syncing = true;
    try {
      const api = await this._client();
      const ids = await this._listIds(api, "in:inbox", 5);
      const profile = await api.get("/profile").catch(() => null);
      if (profile?.data?.historyId) this.historyId = profile.data.historyId;
      const msgs = await Promise.all(
        ids.map((id) =>
          api
            .get(`/messages/${id}`, { params: { format: "full" } })
            .then((r) => r.data)
            .catch(() => null)
        )
      );
      let hasNew = false;
      for (const msg of msgs) {
        if (!msg) continue;
        const existing = cache.getMessage(this.db, msg.id);
        if (!existing) {
          const { message, thread } = msgToRow(msg);
          cache.upsertMessage(this.db, message);
          cache.upsertThread(this.db, thread);
          hasNew = true;
        }
      }
      if (hasNew) {
        this.lastSyncAt = Date.now();
        broadcast(this.userId, "sync_status", {
          status: "synced",
          lastSyncAt: this.lastSyncAt,
        });
        broadcast(this.userId, "inbox_updated", { folder: "inbox" });
      }
    } catch {
    } finally {
      this.syncing = false;
    }
  }

  _schedulePoll() {
    if (this.destroyed) return;
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(async () => {
      await this._incrementalSync();
      this._schedulePoll();
    }, 30000);
  }
}

// ── Public API ─────────────────────────────────────────────────────
function getOrCreate(userId, auth) {
  if (managers.has(userId)) {
    const m = managers.get(userId);
    m.auth.getToken = auth.getToken;
    return m;
  }
  const m = new GmailRestSyncManager(userId, auth);
  managers.set(userId, m);
  m.start().catch((err) =>
    console.error(`[REST:${userId}] start error:`, err.message)
  );
  return m;
}

function getManager(userId) {
  return managers.get(userId) || null;
}

function destroyManager(userId) {
  const m = managers.get(userId);
  if (m) {
    m.destroy();
    managers.delete(userId);
  }
}

// Called by controller when user scrolls past all cached emails
// and wants to pull older pages from Gmail on demand
async function fetchOlderPage(userId, auth) {
  const mgr = managers.get(userId);
  if (!mgr) throw new Error("Manager not initialised");
  if (mgr.syncing) return { added: 0, hasMore: false };

  const db = cache.getDb(userId);
  const pageToken = cache.getPageToken(db, "inbox");
  if (!pageToken) return { added: 0, hasMore: false };

  mgr.syncing = true;
  try {
    const api = await mgr._client();
    const r = await api.get("/messages", {
      params: { q: "in:inbox", maxResults: 500, pageToken },
    });
    const ids = (r.data.messages || []).map((m) => m.id);
    const nextToken = r.data.nextPageToken || null;
    cache.setPageToken(db, "inbox", nextToken);

    const added = await mgr._fetchAndCache(api, ids);
    console.log(
      `[REST:${userId}] fetchOlderPage — ${added} added (hasMore: ${!!nextToken})`
    );
    return { added, hasMore: !!nextToken };
  } finally {
    mgr.syncing = false;
  }
}

module.exports = {
  getOrCreate,
  getManager,
  destroyManager,
  addSseClient,
  broadcast,
  msgToRow,
  fetchOlderPage,
};
