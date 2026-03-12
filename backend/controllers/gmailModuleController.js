/**
 * gmailModuleController.js  v2 — Beeper-style architecture
 *
 * Data flow:
 *   Gmail IMAP ──imapflow──▶ SQLite cache ──▶ this controller ──▶ frontend
 *
 * REST API is only used for:
 *   - OAuth token refresh
 *   - Sending email
 *   - Marking messages read
 *   - Label counts
 *   - Contact photos (People API)
 */
const axios = require("axios");
const Integration = require("../models/Integration");
const cache = require("../utils/gmailCache");
const sync = require("../services/gmailMapService");

// ── Token cache ───────────────────────────────────────────────────
const tokenCache = new Map();

async function getCredentials(userId) {
  const doc = await Integration.findOne({
    userId,
    type: "gmail",
    enabled: true,
  });
  if (!doc?.gmail) throw new Error("Gmail not connected.");
  return {
    accessToken: doc.gmail.accessToken || null,
    refreshToken: doc.gmail.refreshToken || null,
    clientId: doc.gmail.clientId || process.env.GOOGLE_CLIENT_ID,
    clientSecret: doc.gmail.clientSecret || process.env.GOOGLE_CLIENT_SECRET,
    userEmail: doc.gmail.userEmail || "me",
  };
}

async function getAccessToken(userId) {
  const cached = tokenCache.get(userId);
  if (cached && cached.expiresAt > Date.now() + 60_000)
    return cached.accessToken;
  const creds = await getCredentials(userId);
  if (!creds.refreshToken || !creds.clientId || !creds.clientSecret) {
    if (creds.accessToken) return creds.accessToken;
    throw new Error("Gmail OAuth credentials incomplete.");
  }
  try {
    const r = await axios.post("https://oauth2.googleapis.com/token", null, {
      params: {
        grant_type: "refresh_token",
        refresh_token: creds.refreshToken,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      },
    });
    const token = r.data.access_token;
    tokenCache.set(userId, {
      accessToken: token,
      expiresAt: Date.now() + (r.data.expires_in || 3600) * 1000,
    });
    return token;
  } catch (err) {
    tokenCache.delete(userId);
    throw new Error(
      `Token refresh failed: ${err.response?.data?.error || err.message}`
    );
  }
}

function gmailApi(token) {
  return axios.create({
    baseURL: "https://gmail.googleapis.com/gmail/v1/users/me",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

async function ensureSync(userId) {
  const creds = await getCredentials(userId);
  sync.getOrCreate(userId, {
    userEmail: creds.userEmail,
    getToken: () => getAccessToken(userId),
  });
}

// ── Row formatters ────────────────────────────────────────────────
function threadRowToEmail(row) {
  return {
    id: row.id,
    threadId: row.id,
    from: row.fromAddr,
    to: row.toAddr || "",
    origFrom: row.origFromAddr || row.fromAddr || "",
    subject: row.subject,
    date: row.lastDateStr,
    snippet: row.snippet,
    body: "",
    html: "",
    unread: row.unread > 0,
    starred: row.starred === 1, // ← expose starred flag to frontend
    msgCount: row.msgCount,
  };
}

function messageRowToFull(row) {
  let attachments = [];
  try {
    attachments = JSON.parse(row.attachments || "[]");
  } catch {}
  const flags = (() => {
    try {
      return JSON.parse(row.flags || "[]");
    } catch {
      return [];
    }
  })();
  return {
    id: row.id,
    threadId: row.threadId,
    from: row.fromAddr,
    to: row.toAddr || "",
    subject: row.subject,
    date: row.dateStr,
    snippet: row.snippet,
    body: row.bodyText || "",
    html: row.bodyHtml || "",
    attachments,
    unread: !flags.includes("\\Seen"),
  };
}

// ── POST /api/gmail/list ──────────────────────────────────────────
exports.listEmails = async (req, res) => {
  const userId = req.user?.username;
  try {
    await ensureSync(userId);
    const db = cache.getDb(userId);
    const folder = req.body.folder || "inbox";
    const search = req.body.search || "";
    const page = parseInt(req.body.page || "0");
    const LIMIT = 20;
    const syncStatus = sync.getManager(userId)?.getStatus() || {
      status: "connecting",
    };
    const hasCached = cache.hasCachedData(db, folder);
    if (hasCached) {
      const rows = cache.listThreads(db, folder, LIMIT, page * LIMIT, search);
      const emails = rows.map(threadRowToEmail);
      return res.json({
        emails,
        hasMore: rows.length === LIMIT,
        page,
        fromCache: true,
        syncStatus,
      });
    }
    res.json({
      emails: [],
      hasMore: false,
      page: 0,
      fromCache: false,
      syncStatus,
    });
  } catch (err) {
    console.error("Gmail list error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/gmail/thread ────────────────────────────────────────
exports.getThread = async (req, res) => {
  const userId = req.user?.username;
  try {
    await ensureSync(userId);
    const db = cache.getDb(userId);
    const rows = cache.getThread(db, req.body.threadId);
    if (!rows.length) return res.json({ messages: [] });
    const messages = rows.map(messageRowToFull);
    const unreadIds = rows
      .filter((r) => {
        try {
          return !JSON.parse(r.flags || "[]").includes("\\Seen");
        } catch {
          return false;
        }
      })
      .map((r) => r.id);
    if (unreadIds.length) {
      cache.markRead(db, unreadIds);
      getAccessToken(userId)
        .then((token) =>
          Promise.all(
            unreadIds.map((id) =>
              gmailApi(token)
                .post(`/messages/${id}/modify`, { removeLabelIds: ["UNREAD"] })
                .catch(() => {})
            )
          )
        )
        .catch(() => {});
    }
    res.json({ messages });
  } catch (err) {
    console.error("Gmail thread error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/gmail/send ──────────────────────────────────────────
exports.sendEmail = async (req, res) => {
  const userId = req.user?.username;
  try {
    const token = await getAccessToken(userId);
    const creds = await getCredentials(userId);
    const { to, subject, body, threadId } = req.body;
    const raw = [
      `From: ${creds.userEmail}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
      "",
      body,
    ].join("\r\n");
    const sendRes = await gmailApi(token).post("/messages/send", {
      raw: Buffer.from(raw).toString("base64url"),
      ...(threadId ? { threadId } : {}),
    });

    // ── Immediately cache the sent message so it appears without
    //    waiting for the next 30s poll ─────────────────────────────
    const sentMsgId = sendRes.data?.id;
    if (sentMsgId) {
      (async () => {
        try {
          const api = gmailApi(token);
          const fullMsg = await api.get(`/messages/${sentMsgId}`, {
            params: { format: "full" },
          });
          const db = cache.getDb(userId);
          const { msgToRow } = require("../services/gmailMapService");
          const { message, thread } = msgToRow(fullMsg.data);
          cache.upsertMessage(db, message);
          cache.upsertThread(db, thread);
          sync.broadcast(userId, "thread_updated", {
            threadId: message.threadId,
            messageId: sentMsgId,
          });
          sync.broadcast(userId, "inbox_updated", { folder: "sent" });
        } catch (cacheErr) {
          console.error(
            `[sendEmail] cache error for ${sentMsgId}:`,
            cacheErr.message
          );
        }
      })();
    }

    res.json({ success: true, messageId: sentMsgId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/gmail/labels ─────────────────────────────────────────
exports.getLabels = async (req, res) => {
  try {
    const token = await getAccessToken(req.user?.username);
    const api = gmailApi(token);
    const r = await api.get("/labels");
    const want = ["INBOX", "STARRED", "SENT", "DRAFT"];
    const sel = (r.data.labels || []).filter((l) => want.includes(l.id));
    const results = await Promise.all(
      sel.map(async (lbl) => {
        const d = await api.get(`/labels/${lbl.id}`);
        return [lbl.id.toLowerCase(), d.data.messagesUnread || 0];
      })
    );
    res.json(Object.fromEntries(results));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/gmail/profile-picture ───────────────────────────────
exports.getProfilePicture = async (req, res) => {
  try {
    const token = await getAccessToken(req.user?.username);
    const r = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    res.json({
      picture: r.data.picture || null,
      name: r.data.name || "",
      email: r.data.email || "",
    });
  } catch {
    res.json({ picture: null });
  }
};

// ── POST /api/gmail/contact-photos ───────────────────────────────
exports.getContactPhotos = async (req, res) => {
  const userId = req.user?.username;
  try {
    const db = cache.getDb(userId);
    const requested = (req.body.emails || [])
      .slice(0, 30)
      .map((e) => e.toLowerCase());
    if (!requested.length) return res.json({});
    const cached = cache.getContactPhotos(db, requested);
    const missing = cache.getMissingPhotoEmails(db, requested);
    if (!missing.length) return res.json(cached);
    const token = await getAccessToken(userId);
    const headers = { Authorization: `Bearer ${token}` };
    const fresh = {};
    await Promise.all(
      missing.map(async (email) => {
        try {
          const r = await axios.get(
            "https://people.googleapis.com/v1/otherContacts:search",
            {
              headers,
              params: {
                query: email,
                readMask: "photos,emailAddresses",
                pageSize: 3,
              },
            }
          );
          for (const item of r.data.results || []) {
            const addrs = (item.person.emailAddresses || []).map((e) =>
              e.value?.toLowerCase()
            );
            if (addrs.includes(email)) {
              const photo =
                item.person.photos?.find((p) => !p.default)?.url ||
                item.person.photos?.[0]?.url;
              if (photo) {
                fresh[email] = photo;
                return;
              }
            }
          }
          const r2 = await axios.get(
            "https://people.googleapis.com/v1/people:searchContacts",
            {
              headers,
              params: {
                query: email,
                readMask: "photos,emailAddresses",
                pageSize: 3,
                sources: "READ_SOURCE_TYPE_CONTACT",
              },
            }
          );
          for (const item of r2.data.results || []) {
            const addrs = (item.person.emailAddresses || []).map((e) =>
              e.value?.toLowerCase()
            );
            if (addrs.includes(email)) {
              const photo =
                item.person.photos?.find((p) => !p.default)?.url ||
                item.person.photos?.[0]?.url;
              if (photo) {
                fresh[email] = photo;
                return;
              }
            }
          }
          fresh[email] = null;
        } catch {
          fresh[email] = null;
        }
      })
    );
    cache.saveContactPhotos(db, fresh);
    res.json({ ...cached, ...fresh });
  } catch (err) {
    res.json({});
  }
};

// ── GET /api/gmail/sync-status ────────────────────────────────────
exports.getSyncStatus = async (req, res) => {
  const userId = req.user?.username;
  try {
    await ensureSync(userId);
    res.json(sync.getManager(userId)?.getStatus() || { status: "connecting" });
  } catch (err) {
    res.json({ status: "error", error: err.message });
  }
};

// ── GET /api/gmail/events — SSE real-time stream ──────────────────
exports.sseEvents = async (req, res) => {
  const userId = req.user?.username;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write("event: ping\ndata: {}\n\n");
  const remove = sync.addSseClient(userId, res);
  try {
    await ensureSync(userId);
    const mgr = sync.getManager(userId);
    if (mgr)
      res.write(
        `event: sync_status\ndata: ${JSON.stringify(mgr.getStatus())}\n\n`
      );
  } catch {}
  const ping = setInterval(() => {
    try {
      res.write("event: ping\ndata: {}\n\n");
    } catch {
      clearInterval(ping);
    }
  }, 25000);
  req.on("close", () => {
    clearInterval(ping);
    remove();
  });
};

// ── POST /api/gmail/message (backward compat) ─────────────────────
exports.getMessage = async (req, res) => {
  const userId = req.user?.username;
  try {
    const db = cache.getDb(userId);
    const row = cache.getMessage(db, req.body.messageId);
    if (row) return res.json(messageRowToFull(row));
    const token = await getAccessToken(userId);
    const r = await gmailApi(token).get(`/messages/${req.body.messageId}`, {
      params: { format: "full" },
    });
    res.json(r.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/gmail/fetch-older ───────────────────────────────────
// Called by the frontend when local SQLite is exhausted and the user
// wants older emails that haven't been synced yet from Gmail.
exports.fetchOlderEmails = async (req, res) => {
  const userId = req.user?.username;
  try {
    await ensureSync(userId);
    const auth = { getToken: () => getAccessToken(userId) };
    const { added, hasMore } = await sync.fetchOlderPage(userId, auth);
    const db = cache.getDb(userId);
    const folder = req.body.folder || "inbox";
    const LIMIT = 20;
    const rows = cache.listThreads(db, folder, LIMIT, 0);
    res.json({
      added,
      hasMore,
      emails: rows.map(threadRowToEmail),
    });
  } catch (err) {
    console.error("fetchOlderEmails error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/gmail/storage-quota ─────────────────────────────────
exports.getStorageQuota = async (req, res) => {
  try {
    const token = await getAccessToken(req.user?.username);
    const r = await axios.get(
      "https://www.googleapis.com/drive/v3/about?fields=storageQuota",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const q = r.data.storageQuota || {};
    res.json({
      limit: parseInt(q.limit || "0"), // total bytes
      usage: parseInt(q.usage || "0"), // used bytes (all Google products)
      usageInDrive: parseInt(q.usageInDrive || "0"),
    });
  } catch (err) {
    // Drive scope may not be granted — fall back gracefully so the UI
    // doesn't get stuck on "Loading storage…"
    try {
      const token = await getAccessToken(req.user?.username);
      const p = await axios.get(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      res.json({
        limit: 0,
        usage: 0,
        scopeError: true,
        messagesTotal: p.data.messagesTotal || 0,
      });
    } catch {
      res.json({ limit: 0, usage: 0, scopeError: true });
    }
  }
};

exports.getContacts = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json({ contacts: [] });

    const userId = req.user?.username;
    const token = await getAccessToken(userId);
    const client = gmailApi(token);
    const creds = await getCredentials(userId);
    const userEmail = creds.userEmail;
    const lower = q.toLowerCase();

    const [sentRes, rcvdRes] = await Promise.allSettled([
      client.get("/messages", {
        params: { q: `in:sent ${q}`, maxResults: 15 },
      }),
      client.get("/messages", {
        params: { q: `in:anywhere ${q}`, maxResults: 15 },
      }),
    ]);

    const msgIds = new Set();
    for (const r of [sentRes, rcvdRes]) {
      if (r.status === "fulfilled") {
        for (const m of r.value.data.messages || []) msgIds.add(m.id);
      }
    }

    if (!msgIds.size) return res.json({ contacts: [] });

    const metaList = await Promise.allSettled(
      [...msgIds].slice(0, 20).map((id) =>
        client.get(`/messages/${id}`, {
          params: { format: "metadata", metadataHeaders: ["From", "To", "Cc"] },
        })
      )
    );

    const ADDR_RE = /([^<,\n]*?)\s*<([^>@]+@[^>]+)>/g;
    const BARE_RE = /^[^\s,]+@[^\s,]+$/;
    const seen = new Map();

    const myEmail = (userEmail || "").toLowerCase();

    for (const result of metaList) {
      if (result.status !== "fulfilled") continue;
      const hdrs = result.value.data.payload?.headers || [];
      const raw = ["From", "To", "Cc"]
        .map((n) => hdrs.find((h) => h.name === n)?.value || "")
        .join(", ");

      let m;
      ADDR_RE.lastIndex = 0;
      while ((m = ADDR_RE.exec(raw)) !== null) {
        const name = m[1].replace(/^["'\s]+|["'\s]+$/g, "").trim();
        const email = m[2].toLowerCase().trim();
        if (!email || email === myEmail) continue;
        if (!seen.has(email)) seen.set(email, { email, name, photo: null });
      }

      for (const part of raw.split(/[,\n]/)) {
        const bare = part.trim();
        if (BARE_RE.test(bare) && bare !== myEmail) {
          const email = bare.toLowerCase();
          if (!seen.has(email))
            seen.set(email, { email, name: "", photo: null });
        }
      }
    }

    const contacts = [...seen.values()]
      .filter(
        (c) => c.email.includes(lower) || c.name.toLowerCase().includes(lower)
      )
      .slice(0, 10);

    res.json({ contacts });
  } catch (err) {
    console.error("Gmail contacts error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
