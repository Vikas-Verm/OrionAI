/**
 * gmailModuleController.js  v3 — stateless / no local SQLite cache
 *
 * Data flow:
 *   Gmail REST API ──▶ this controller ──▶ frontend
 *
 * All emails are fetched directly from Gmail on demand.
 * Pagination uses Gmail's native nextPageToken cursor — no per-user DB files.
 */

const axios = require("axios");
const Integration = require("../models/Integration");

// ── In-memory token cache (per process, not per file) ─────────────
const tokenCache = new Map();

// ── Simple in-process SSE broadcast (no sync manager needed) ──────
const sseClients = new Map(); // userId → Set<res>

function broadcast(userId, event, data) {
  const clients = sseClients.get(userId);
  if (!clients?.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of [...clients]) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

// ── OAuth helpers ─────────────────────────────────────────────────
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
    expiresAt: doc.gmail.expiresAt || null,
  };
}

function isInvalidGrantError(err) {
  const haystack = [
    err?.response?.data?.error,
    err?.response?.data?.error_description,
    err?.message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes("invalid_grant");
}

async function markGmailReconnectRequired(userId) {
  tokenCache.delete(userId);
  await Integration.findOneAndUpdate(
    { userId, type: "gmail" },
    {
      $set: {
        enabled: false,
        "gmail.accessToken": "",
        "gmail.expiresAt": null,
        lastTestOk: false,
        updatedAt: new Date(),
      },
    }
  ).catch(() => {});
}

function createGmailReconnectError() {
  const error = new Error("Gmail reconnect needed.");
  error.code = "GMAIL_RECONNECT_REQUIRED";
  return error;
}

async function getAccessToken(userId) {
  const creds = await getCredentials(userId);
  const cached = tokenCache.get(userId);
  const sameMailbox =
    cached &&
    cached.refreshToken === creds.refreshToken &&
    cached.userEmail === creds.userEmail;

  if (sameMailbox && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  if (cached && !sameMailbox) {
    tokenCache.delete(userId);
  }

  const storedExpiresAt = creds.expiresAt
    ? new Date(creds.expiresAt).getTime()
    : 0;
  if (creds.accessToken && storedExpiresAt > Date.now() + 60_000) {
    tokenCache.set(userId, {
      accessToken: creds.accessToken,
      expiresAt: storedExpiresAt,
      refreshToken: creds.refreshToken,
      userEmail: creds.userEmail,
    });
    return creds.accessToken;
  }

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
      refreshToken: creds.refreshToken,
      userEmail: creds.userEmail,
    });
    return token;
  } catch (err) {
    tokenCache.delete(userId);
    if (isInvalidGrantError(err)) {
      await markGmailReconnectRequired(userId);
      throw createGmailReconnectError();
    }
    throw new Error(
      `Token refresh failed: ${err.response?.data?.error || err.message}`
    );
  }
}

function clearCachedAccessToken(userId) {
  if (!userId) {
    tokenCache.clear();
    return;
  }
  tokenCache.delete(userId);
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

function disableCache(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

// ── Gmail message parsing helpers ─────────────────────────────────
function hdr(headers = [], name) {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    ""
  );
}

function extractEmailAddress(value = "") {
  const bracketMatch = String(value || "").match(/<([^>]+)>/);
  const raw = bracketMatch?.[1] || value;
  const emailMatch = String(raw || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (emailMatch?.[0] || "").trim().toLowerCase();
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

function fmtDate(raw) {
  if (!raw) return "";
  try {
    const d = new Date(raw);
    if (isNaN(d)) return raw;
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday)
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (d.getFullYear() === now.getFullYear())
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    return d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return raw;
  }
}

function sortThreadMessages(messages = []) {
  return [...messages].sort(
    (a, b) => Number(a?.internalDate || 0) - Number(b?.internalDate || 0)
  );
}

// ── Map a Gmail thread API response to the shape the frontend expects
function threadToEmail(thread, selfEmail = "") {
  const msgs = sortThreadMessages(thread.messages || []);
  const lastMsg = msgs[msgs.length - 1] || {};
  const firstMsg = msgs[0] || {};
  const lastHdrs = lastMsg.payload?.headers || [];
  const firstHdrs = firstMsg.payload?.headers || [];
  const normalizedSelfEmail = String(selfEmail || "").toLowerCase();
  const lastFrom = hdr(lastHdrs, "from");
  const lastSenderEmail = extractEmailAddress(lastFrom);
  const subject =
    hdr(firstHdrs, "subject") || hdr(lastHdrs, "subject") || "(no subject)";
  const allLabels = msgs.flatMap((m) => m.labelIds || []);
  const isSent = allLabels.includes("SENT") && !allLabels.includes("INBOX");
  const rawDate = hdr(lastHdrs, "date");
  const latestDirection =
    normalizedSelfEmail && lastSenderEmail === normalizedSelfEmail
      ? "outbound"
      : "inbound";

  return {
    id: thread.id,
    threadId: thread.id,
    latestMessageId: lastMsg.id || null,
    from: lastFrom,
    to: hdr(lastHdrs, "to") || hdr(firstHdrs, "to"),
    cc: hdr(lastHdrs, "cc") || hdr(firstHdrs, "cc"),
    origFrom: hdr(firstHdrs, "from"),
    subject,
    rawDate,
    date: fmtDate(rawDate),
    timestamp: Number(lastMsg.internalDate || 0) || null,
    latestDirection,
    senderEmail: lastSenderEmail,
    snippet: thread.snippet || "",
    unread: allLabels.includes("UNREAD"),
    starred: allLabels.includes("STARRED"),
    isSent,
    msgCount: msgs.length,
  };
}

// ── Map a full Gmail message to the shape the frontend expects ─────
function messageToFull(msg, selfEmail = "") {
  const headers = msg.payload?.headers || [];
  const flags = msg.labelIds || [];
  const from = hdr(headers, "from");
  const senderEmail = extractEmailAddress(from);
  const normalizedSelfEmail = String(selfEmail || "").toLowerCase();
  const rawDate = hdr(headers, "date");
  const direction =
    normalizedSelfEmail && senderEmail === normalizedSelfEmail
      ? "outbound"
      : "inbound";
  const plainBody = extractBody(msg.payload, "text/plain");

  return {
    id: msg.id,
    threadId: msg.threadId,
    from,
    to: hdr(headers, "to"),
    cc: hdr(headers, "cc"),
    bcc: hdr(headers, "bcc"),
    replyTo: hdr(headers, "reply-to"),
    subject: hdr(headers, "subject") || "(no subject)",
    rawDate,
    date: fmtDate(rawDate),
    timestamp: Number(msg.internalDate || 0) || null,
    direction,
    isSelf: direction === "outbound",
    senderEmail,
    snippet: msg.snippet || "",
    body: plainBody || msg.snippet || "",
    html: extractBody(msg.payload, "text/html"),
    attachments: extractAtts(msg.payload),
    unread: flags.includes("UNREAD"),
  };
}

function mapThreadMessages(thread, selfEmail = "") {
  return sortThreadMessages(thread.messages || []).map((message) =>
    messageToFull(message, selfEmail)
  );
}

// ── POST /api/gmail/list ──────────────────────────────────────────
// Fetches directly from Gmail REST API — no SQLite involved.
// Uses Gmail's nextPageToken for cursor-based pagination.
exports.listEmails = async (req, res) => {
  const userId = req.user?.username;
  try {
    disableCache(res);
    const token = await getAccessToken(userId);
    const creds = await getCredentials(userId);
    const api = gmailApi(token);

    const folder = req.body.folder || "inbox";
    const pageToken = req.body.pageToken || null; // cursor from previous page
    const search = req.body.search || "";

    // Map UI folder key → Gmail label IDs
    const labelMap = {
      inbox: "INBOX",
      sent: "SENT",
      drafts: "DRAFTS",
      starred: "STARRED",
    };

    const params = { maxResults: 20 };
    if (search) {
      // When searching, pass raw query (Gmail handles label filtering within search)
      params.q = search;
    } else {
      const labelId = labelMap[folder];
      if (labelId) params.labelIds = labelId;
    }
    if (pageToken) params.pageToken = pageToken;

    // Step 1: get list of thread IDs for this page
    const listRes = await api.get("/threads", { params });
    const threadStubs = listRes.data.threads || [];
    const nextPageToken = listRes.data.nextPageToken || null;

    if (!threadStubs.length) {
      return res.json({ emails: [], nextPageToken: null, hasMore: false });
    }

    // Step 2: batch-fetch thread metadata in parallel
    const threadDetails = await Promise.all(
      threadStubs.map((t) =>
        api
          .get(`/threads/${t.id}`, {
            params: {
              format: "metadata",
              metadataHeaders: ["From", "To", "Cc", "Subject", "Date", "Reply-To"],
            },
          })
          .then((r) => r.data)
          .catch(() => null)
      )
    );

    const emails = threadDetails
      .filter(Boolean)
      .map((thread) => threadToEmail(thread, creds.userEmail));

    res.json({ emails, nextPageToken, hasMore: !!nextPageToken });
  } catch (err) {
    if (err.code === "GMAIL_RECONNECT_REQUIRED") {
      console.warn(`Gmail reconnect required for ${userId}`);
      return res.status(401).json({ error: err.message });
    }
    console.error("Gmail list error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/gmail/thread ────────────────────────────────────────
exports.getThread = async (req, res) => {
  const userId = req.user?.username;
  try {
    disableCache(res);
    const token = await getAccessToken(userId);
    const creds = await getCredentials(userId);
    const api = gmailApi(token);

    const threadRes = await api.get(`/threads/${req.body.threadId}`, {
      params: { format: "full" },
    });
    const thread = threadToEmail(threadRes.data, creds.userEmail);
    const messages = mapThreadMessages(threadRes.data, creds.userEmail);

    // Mark unread messages as read (fire-and-forget)
    const unreadIds = messages.filter((m) => m.unread).map((m) => m.id);
    if (unreadIds.length) {
      messages.forEach((message) => {
        if (unreadIds.includes(message.id)) message.unread = false;
      });
      thread.unread = false;
      Promise.all(
        unreadIds.map((id) =>
          api
            .post(`/messages/${id}/modify`, { removeLabelIds: ["UNREAD"] })
            .catch(() => {})
        )
      ).catch(() => {});
    }

    res.json({ thread, messages });
  } catch (err) {
    console.error("Gmail thread error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/gmail/message (backward compat) ─────────────────────
exports.getMessage = async (req, res) => {
  const userId = req.user?.username;
  try {
    disableCache(res);
    const token = await getAccessToken(userId);
    const creds = await getCredentials(userId);
    const api = gmailApi(token);
    const r = await api.get(`/messages/${req.body.messageId}`, {
      params: { format: "full" },
    });
    res.json(messageToFull(r.data, creds.userEmail));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── MIME builder helpers ──────────────────────────────────────────
// Builds a raw RFC 2822 message string (to be base64url-encoded for Gmail API).
// attachments: [{ name, mimeType, buffer }]  ← buffer is a Node.js Buffer
function buildMimeMessage({
  from,
  to,
  cc,
  bcc,
  subject,
  body,
  attachments = [],
}) {
  const boundary = `----=_Part_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;

  // Encode header value for non-ASCII characters (RFC 2047 Base64)
  const encodeHdr = (s) => {
    if (!s || !/[^\x00-\x7F]/.test(s)) return s || "";
    return `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`;
  };

  const hdrLines = [`MIME-Version: 1.0`, `From: ${from}`, `To: ${to}`];
  if (cc) hdrLines.push(`Cc: ${cc}`);
  if (bcc) hdrLines.push(`Bcc: ${bcc}`);
  hdrLines.push(`Subject: ${encodeHdr(subject)}`);

  if (!attachments.length) {
    // Simple plain-text message — no multipart needed
    return [
      ...hdrLines,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: quoted-printable`,
      "",
      body,
    ].join("\r\n");
  }

  // Multipart/mixed with attachments
  const lines = [
    ...hdrLines,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    "",
    body,
  ];

  for (const att of attachments) {
    const safeName = att.name.replace(/"/g, '\\"');
    // att.buffer is a Node Buffer — convert to base64 in 76-char lines (RFC 2045)
    const b64 = att.buffer.toString("base64").replace(/.{76}/g, "$&\r\n");
    lines.push(
      `--${boundary}`,
      `Content-Type: ${
        att.mimeType || "application/octet-stream"
      }; name="${safeName}"`,
      `Content-Disposition: attachment; filename="${safeName}"`,
      `Content-Transfer-Encoding: base64`,
      "",
      b64
    );
  }

  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}

// ── POST /api/gmail/send ──────────────────────────────────────────
// Accepts multipart/form-data (from multer) so files are binary streams,
// not base64 inside JSON — avoids PayloadTooLargeError entirely.
exports.sendEmail = async (req, res) => {
  const userId = req.user?.username;
  try {
    const token = await getAccessToken(userId);
    const api = gmailApi(token);
    const creds = await getCredentials(userId);

    // req.body fields come from multer's form-data parsing
    const { to, cc, bcc, subject, body, threadId } = req.body;

    // req.files populated by multer.array("attachments")
    const attachments = (req.files || []).map((f) => ({
      name: f.originalname,
      mimeType: f.mimetype || "application/octet-stream",
      buffer: f.buffer, // raw Buffer — no base64 overhead in transit
    }));

    const raw = buildMimeMessage({
      from: creds.userEmail,
      to,
      cc: cc || "",
      bcc: bcc || "",
      subject,
      body,
      attachments,
    });

    const sendRes = await api.post("/messages/send", {
      raw: Buffer.from(raw).toString("base64url"),
      ...(threadId ? { threadId } : {}),
    });

    broadcast(userId, "inbox_updated", { folder: "sent" });
    res.json({ success: true, messageId: sendRes.data?.id });
  } catch (err) {
    console.error("sendEmail error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/gmail/labels ─────────────────────────────────────────
exports.getLabels = async (req, res) => {
  try {
    disableCache(res);
    const token = await getAccessToken(req.user?.username);
    const api = gmailApi(token);
    const r = await api.get("/labels");
    const want = ["INBOX", "STARRED", "SENT", "DRAFT"];
    const sel = (r.data.labels || []).filter((l) => want.includes(l.id));
    const results = await Promise.all(
      sel.map(async (lbl) => {
        const d = await api.get(`/labels/${lbl.id}`);
        return [
          lbl.id.toLowerCase(),
          d.data.threadsUnread ?? d.data.messagesUnread ?? 0,
        ];
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
    disableCache(res);
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
// Note: contact photos are now fetched fresh from People API each time
// (no SQLite cache). In practice the frontend batches well so this
// is called infrequently — at most once per page-load per unique sender.
exports.getContactPhotos = async (req, res) => {
  const userId = req.user?.username;
  try {
    disableCache(res);
    const requested = (req.body.emails || [])
      .slice(0, 30)
      .map((e) => e.toLowerCase());
    if (!requested.length) return res.json({});

    const token = await getAccessToken(userId);
    const headers = { Authorization: `Bearer ${token}` };
    const result = {};

    await Promise.all(
      requested.map(async (email) => {
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
                result[email] = photo;
                return;
              }
            }
          }
          // Fallback: searchContacts
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
                result[email] = photo;
                return;
              }
            }
          }
          result[email] = null;
        } catch {
          result[email] = null;
        }
      })
    );

    res.json(result);
  } catch (err) {
    res.json({});
  }
};

// ── GET /api/gmail/sync-status ────────────────────────────────────
// With direct-API architecture there's no background sync — always live.
exports.getSyncStatus = async (_req, res) => {
  disableCache(res);
  res.json({ status: "live", lastSyncAt: Date.now() });
};

// ── GET /api/gmail/events — SSE stream ───────────────────────────
// Keeps a persistent connection open.  When the user sends an email
// (or a future webhook fires) we push `inbox_updated` so the frontend
// can auto-refresh without polling.
exports.sseEvents = async (req, res) => {
  const userId = req.user?.username;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write("event: ping\ndata: {}\n\n");

  // Register client
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId).add(res);

  // Send an initial 'live' status so the badge updates immediately
  res.write(
    `event: sync_status\ndata: ${JSON.stringify({
      status: "live",
      lastSyncAt: Date.now(),
    })}\n\n`
  );

  const ping = setInterval(() => {
    try {
      res.write("event: ping\ndata: {}\n\n");
    } catch {
      clearInterval(ping);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(ping);
    sseClients.get(userId)?.delete(res);
  });
};

// ── GET /api/gmail/contacts ───────────────────────────────────────
exports.getContacts = async (req, res) => {
  try {
    disableCache(res);
    const q = (req.query.q || "").trim();
    if (!q) return res.json({ contacts: [] });

    const userId = req.user?.username;
    const token = await getAccessToken(userId);
    const api = gmailApi(token);
    const creds = await getCredentials(userId);
    const lower = q.toLowerCase();

    const [sentRes, rcvdRes] = await Promise.allSettled([
      api.get("/messages", { params: { q: `in:sent ${q}`, maxResults: 15 } }),
      api.get("/messages", {
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
        api.get(`/messages/${id}`, {
          params: { format: "metadata", metadataHeaders: ["From", "To", "Cc"] },
        })
      )
    );

    const ADDR_RE = /([^<,\n]*?)\s*<([^>@]+@[^>]+)>/g;
    const BARE_RE = /^[^\s,]+@[^\s,]+$/;
    const seen = new Map();
    const myEmail = (creds.userEmail || "").toLowerCase();

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

// ── GET /api/gmail/storage-quota ─────────────────────────────────
exports.getStorageQuota = async (req, res) => {
  try {
    disableCache(res);
    const token = await getAccessToken(req.user?.username);
    const r = await axios.get(
      "https://www.googleapis.com/drive/v3/about?fields=storageQuota",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const q = r.data.storageQuota || {};
    res.json({
      limit: parseInt(q.limit || "0"),
      usage: parseInt(q.usage || "0"),
      usageInDrive: parseInt(q.usageInDrive || "0"),
    });
  } catch {
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

exports.clearCachedAccessToken = clearCachedAccessToken;
exports.__test = {
  threadToEmail,
  messageToFull,
  mapThreadMessages,
  extractEmailAddress,
};
