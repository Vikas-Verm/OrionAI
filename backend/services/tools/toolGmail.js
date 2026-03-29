/**
 * toolGmail.js — Gmail integration for OrionAI
 *
 * Tools:
 *  - gmailGetInbox()        — fetch recent inbox emails with sender/subject/snippet
 *  - gmailSearchEmails()    — search emails by query (from, subject, keyword, date)
 *  - gmailGetEmail()        — get full body of a specific email by ID or subject
 *  - gmailSummarizeThread() — AI summary of an email thread
 *  - gmailSendEmail()       — compose and send a new email via Gmail API
 *  - gmailReplyEmail()      — reply to an existing email thread
 *
 * Auth: OAuth2 (access_token + refresh_token stored in Integration model)
 * Falls back to env vars: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 */

const axios = require("axios");
const Integration = require("../../models/Integration");
const {
  buildGmailInboxQuery,
  filterGmailInboxEmails,
} = require("../agentMessageFilterService");

// ─────────────────────────────────────────────────────────────────────────────
// Gmail OAuth2 client factory
// ─────────────────────────────────────────────────────────────────────────────
async function getGmailClient(userId) {
  let cfg = null;

  // 1. Try Integration model
  if (userId) {
    const doc = await Integration.findOne({
      userId,
      type: "gmail",
      enabled: true,
    });
    if (doc?.gmail?.accessToken) {
      cfg = {
        accessToken: doc.gmail.accessToken,
        refreshToken: doc.gmail.refreshToken,
        clientId: doc.gmail.clientId || process.env.GMAIL_CLIENT_ID,
        clientSecret: doc.gmail.clientSecret || process.env.GMAIL_CLIENT_SECRET,
        userEmail: doc.gmail.userEmail,
      };
    }
  }

  // 2. Fall back to env
  if (!cfg && process.env.GMAIL_REFRESH_TOKEN) {
    cfg = {
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      userEmail: process.env.GMAIL_USER_EMAIL || "me",
    };
  }

  if (!cfg) {
    throw new Error(
      "Gmail not configured. Go to Settings → Integrations → Gmail."
    );
  }

  // Always get a fresh access token via refresh
  const accessToken = await refreshAccessToken(cfg);

  const client = axios.create({
    baseURL: "https://gmail.googleapis.com/gmail/v1/users/me",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  client.interceptors.response.use(
    (r) => r,
    (err) => {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || err.message;
      console.error(`Gmail API ${status}: ${msg}`);
      return Promise.reject(new Error(`Gmail API error ${status}: ${msg}`));
    }
  );

  return { client, userEmail: cfg.userEmail || "me" };
}

async function refreshAccessToken(cfg) {
  if (!cfg.refreshToken || !cfg.clientId || !cfg.clientSecret) {
    // If we only have an accessToken (from Integration), use it directly
    if (cfg.accessToken) return cfg.accessToken;
    throw new Error("Gmail OAuth credentials incomplete.");
  }
  try {
    const res = await axios.post("https://oauth2.googleapis.com/token", {
      grant_type: "refresh_token",
      refresh_token: cfg.refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    });
    return res.data.access_token;
  } catch (err) {
    throw new Error(
      "Gmail token refresh failed. Re-connect Gmail in Integrations."
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function decodeBody(payload) {
  // Recursively find text/plain or text/html part and decode base64
  if (!payload) return "";

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts) {
    // Prefer text/plain
    const plain = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plain?.body?.data) {
      return Buffer.from(plain.body.data, "base64url").toString("utf-8");
    }
    // Fall back to text/html — strip tags
    const html = payload.parts.find((p) => p.mimeType === "text/html");
    if (html?.body?.data) {
      const raw = Buffer.from(html.body.data, "base64url").toString("utf-8");
      return raw
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    // Recurse into multipart
    for (const part of payload.parts) {
      const body = decodeBody(part);
      if (body) return body;
    }
  }

  return "";
}

function headerVal(headers, name) {
  return (
    headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    ""
  );
}

function formatDate(internalDate) {
  if (!internalDate) return "";
  return new Date(Number(internalDate)).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEmail(msg) {
  const h = msg.payload?.headers || [];
  return {
    id: msg.id,
    threadId: msg.threadId,
    subject: headerVal(h, "Subject") || "(no subject)",
    from: headerVal(h, "From"),
    to: headerVal(h, "To"),
    date: formatDate(msg.internalDate),
    snippet: msg.snippet || "",
    unread: (msg.labelIds || []).includes("UNREAD"),
    labelIds: msg.labelIds || [],
    replyTo: headerVal(h, "Reply-To"),
    listUnsubscribe: headerVal(h, "List-Unsubscribe"),
    precedence: headerVal(h, "Precedence"),
  };
}

// Build a base64url-encoded RFC 2822 email
function buildRawEmail({
  to,
  from,
  subject,
  body,
  inReplyTo,
  references,
  threadId,
}) {
  const lines = [
    `From: ${from || "me"}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
  ];
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push("", body);

  const raw = lines.join("\r\n");
  return Buffer.from(raw).toString("base64url");
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 1: gmailGetInbox — recent inbox emails
// ─────────────────────────────────────────────────────────────────────────────
async function toolGmailGetInbox(params, ctx) {
  const { maxResults = 10, unreadOnly = false, includeBulk = false } = params;
  const { client } = await getGmailClient(ctx.userId);

  const q = buildGmailInboxQuery({ unreadOnly, includeBulk });
  const listRes = await client.get("/messages", {
    params: {
      q,
      maxResults: includeBulk ? maxResults : Math.min(maxResults * 5, 50),
      format: "minimal",
    },
  });

  const messages = listRes.data.messages || [];
  if (!messages.length) {
    return {
      emails: [],
      count: 0,
      unreadCount: 0,
      summary: includeBulk
        ? "📭 Your inbox is empty."
        : unreadOnly
          ? "📭 No important unread emails right now."
          : "📭 No important inbox emails right now.",
    };
  }

  // Fetch each message metadata in parallel
  const emails = await Promise.all(
    messages.map((m) =>
      client
        .get(`/messages/${m.id}`, {
          params: {
            format: "metadata",
            metadataHeaders: [
              "Subject",
              "From",
              "To",
              "Date",
              "Reply-To",
              "List-Unsubscribe",
              "Precedence",
            ],
          },
        })
        .then((r) => formatEmail(r.data))
    )
  );

  const filteredEmails = filterGmailInboxEmails(emails, {
    includeBulk,
    maxResults,
  });

  if (!filteredEmails.length) {
    return {
      emails: [],
      count: 0,
      unreadCount: 0,
      summary: unreadOnly
        ? "📭 No important unread emails right now."
        : "📭 No important inbox emails right now.",
    };
  }

  const unreadCount = filteredEmails.filter((e) => e.unread).length;
  const lines = [
    `📬 *Inbox — ${filteredEmails.length} email${
      filteredEmails.length !== 1 ? "s" : ""
    }${unreadOnly ? " (unread)" : ""}*${
      unreadCount ? `  •  🔵 ${unreadCount} unread` : ""
    }`,
    "",
    ...filteredEmails.map(
      (e, i) =>
        `${e.unread ? "🔵" : "⚪"} *${e.subject}*\n   From: ${e.from}\n   ${
          e.date
        }\n   ${e.snippet.slice(0, 80)}${e.snippet.length > 80 ? "…" : ""}`
    ),
  ];

  return {
    emails: filteredEmails,
    count: filteredEmails.length,
    unreadCount,
    summary: lines.join("\n"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 2: gmailSearchEmails — search by query
// ─────────────────────────────────────────────────────────────────────────────
async function toolGmailSearchEmails(params, ctx) {
  const { query, maxResults = 10 } = params;
  if (!query) throw new Error("gmailSearchEmails requires a query");

  const { client } = await getGmailClient(ctx.userId);

  const listRes = await client.get("/messages", {
    params: { q: query, maxResults },
  });

  const messages = listRes.data.messages || [];
  if (!messages.length) {
    return {
      emails: [],
      count: 0,
      summary: `🔍 No emails found for: "${query}"`,
    };
  }

  const emails = await Promise.all(
    messages.map((m) =>
      client
        .get(`/messages/${m.id}`, {
          params: {
            format: "metadata",
            metadataHeaders: ["Subject", "From", "To", "Date"],
          },
        })
        .then((r) => formatEmail(r.data))
    )
  );

  const lines = [
    `🔍 *Search: "${query}" — ${emails.length} result${
      emails.length !== 1 ? "s" : ""
    }*`,
    "",
    ...emails.map(
      (e) =>
        `${e.unread ? "🔵" : "⚪"} *${e.subject}*\n   From: ${e.from}\n   ${
          e.date
        }\n   ${e.snippet.slice(0, 80)}…`
    ),
  ];

  return { emails, count: emails.length, query, summary: lines.join("\n") };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 3: gmailGetEmail — full body of a specific email
// ─────────────────────────────────────────────────────────────────────────────
async function toolGmailGetEmail(params, ctx) {
  const { messageId, subject: subjectQuery } = params;
  const { client } = await getGmailClient(ctx.userId);

  let id = messageId;

  // If no ID, search by subject
  if (!id && subjectQuery) {
    const search = await client.get("/messages", {
      params: { q: `subject:${subjectQuery}`, maxResults: 1 },
    });
    id = search.data.messages?.[0]?.id;
    if (!id)
      throw new Error(`No email found with subject matching "${subjectQuery}"`);
  }

  if (!id) throw new Error("gmailGetEmail requires messageId or subject");

  const res = await client.get(`/messages/${id}`, {
    params: { format: "full" },
  });
  const msg = res.data;
  const h = msg.payload?.headers || [];
  const body = decodeBody(msg.payload);

  const email = {
    id: msg.id,
    threadId: msg.threadId,
    subject: headerVal(h, "Subject"),
    from: headerVal(h, "From"),
    to: headerVal(h, "To"),
    date: formatDate(msg.internalDate),
    body: body.trim(),
    snippet: msg.snippet,
    messageIdHeader: headerVal(h, "Message-ID"),
    references: headerVal(h, "References"),
  };

  // Save to context for chaining (reply, summarize)
  ctx.lastEmail = email;

  const preview =
    body.length > 500 ? body.slice(0, 500) + "\n…[truncated]" : body;
  const summary = `📧 *${email.subject}*\nFrom: ${email.from}\nDate: ${email.date}\n\n${preview}`;

  return { ...email, summary };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 4: gmailSummarizeThread — AI summary of thread
// ─────────────────────────────────────────────────────────────────────────────
async function toolGmailSummarizeThread(params, ctx) {
  const { threadId: paramThreadId, messageId } = params;
  const { client } = await getGmailClient(ctx.userId);

  const threadId = paramThreadId || ctx.lastEmail?.threadId;
  if (!threadId && !messageId)
    throw new Error(
      "gmailSummarizeThread requires threadId or a prior gmailGetEmail step"
    );

  let resolvedThreadId = threadId;
  if (!resolvedThreadId && messageId) {
    const msg = await client.get(`/messages/${messageId}`, {
      params: { format: "minimal" },
    });
    resolvedThreadId = msg.data.threadId;
  }

  const threadRes = await client.get(`/threads/${resolvedThreadId}`, {
    params: { format: "full" },
  });
  const messages = threadRes.data.messages || [];

  // Build conversation text
  const conversation = messages
    .map((msg) => {
      const h = msg.payload?.headers || [];
      const from = headerVal(h, "From");
      const date = formatDate(msg.internalDate);
      const body = decodeBody(msg.payload).trim().slice(0, 600);
      return `[${date}] ${from}:\n${body}`;
    })
    .join("\n\n---\n\n");

  // Use LLM to summarize
  const { chatCompleteNoSystem } = require("../llmService");
  const prompt = `Summarize this email thread concisely. List:
1. Main topic
2. Key decisions or requests
3. Action items (if any)
4. Current status

Email thread:
${conversation}

Keep summary under 200 words. Be specific.`;

  const aiSummary = await chatCompleteNoSystem(prompt, 400, 0.3);

  const firstMsg = messages[0];
  const h = firstMsg?.payload?.headers || [];
  const subject = headerVal(h, "Subject") || "(no subject)";

  const summary = `🧵 *Thread Summary: "${subject}"*\n${
    messages.length
  } message${messages.length !== 1 ? "s" : ""}\n\n${aiSummary}`;

  return {
    threadId: resolvedThreadId,
    messageCount: messages.length,
    subject,
    aiSummary,
    summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 5: gmailSendEmail — compose and send a new email
// ─────────────────────────────────────────────────────────────────────────────
async function toolGmailSendEmail(params, ctx) {
  const { to, subject, body, autoDraft } = params;
  const { client, userEmail } = await getGmailClient(ctx.userId);

  if (!to) throw new Error("gmailSendEmail requires a recipient (to)");
  if (!subject) throw new Error("gmailSendEmail requires a subject");

  // Auto-generate body if not provided but we have document context
  let finalBody = body;
  if (!finalBody) {
    const { chatCompleteNoSystem } = require("../llmService");
    const docCtx = ctx.fetchResult
      ? `Document: ${ctx.fetchResult.collection} #${
          ctx.fetchResult.docNum
        }\n${JSON.stringify(ctx.fetchResult.doc).slice(0, 800)}`
      : "No document context available.";

    const prompt = `Write a professional email for Poshn (Indian food supply chain company).
To: ${to}
Subject: ${subject}
Context: ${docCtx}
Requirements: concise, professional, end with "— Poshn Team"
Return ONLY the email body, no subject line.`;
    finalBody = await chatCompleteNoSystem(prompt, 300, 0.3);
  }

  // Attach PDF if available from context
  const raw = buildRawEmail({ to, from: userEmail, subject, body: finalBody });

  const endpoint = autoDraft ? "/drafts" : "/messages/send";
  const payload = autoDraft ? { message: { raw } } : { raw };

  const res = await client.post(endpoint, payload);

  const action = autoDraft ? "Draft saved" : "Email sent";
  const summary = `📧 *${action}*\nTo: ${to}\nSubject: ${subject}\n\n${finalBody.slice(
    0,
    200
  )}${finalBody.length > 200 ? "…" : ""}`;

  return {
    messageId: res.data.id,
    to,
    subject,
    body: finalBody,
    sent: !autoDraft,
    drafted: !!autoDraft,
    summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 6: gmailReplyEmail — reply to an existing thread
// ─────────────────────────────────────────────────────────────────────────────
async function toolGmailReplyEmail(params, ctx) {
  const {
    threadId: paramThreadId,
    messageId: paramMessageId,
    body,
    replyAll = false,
  } = params;
  const { client, userEmail } = await getGmailClient(ctx.userId);

  // Use from context if available
  const sourceEmail = ctx.lastEmail;
  const threadId = paramThreadId || sourceEmail?.threadId;
  const messageId = paramMessageId || sourceEmail?.id;

  if (!threadId)
    throw new Error(
      "gmailReplyEmail requires threadId or a prior gmailGetEmail step"
    );

  // Fetch original to get headers for In-Reply-To / References
  let subject = sourceEmail?.subject || "";
  let inReplyTo = sourceEmail?.messageIdHeader || "";
  let references = sourceEmail?.references || "";
  let replyTo = sourceEmail?.from || "";

  if (!inReplyTo && messageId) {
    const msg = await client.get(`/messages/${messageId}`, {
      params: {
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Message-ID", "References"],
      },
    });
    const h = msg.data.payload?.headers || [];
    subject = headerVal(h, "Subject");
    inReplyTo = headerVal(h, "Message-ID");
    references = headerVal(h, "References");
    replyTo = headerVal(h, "From");
  }

  // Auto-generate reply body if not provided
  let finalBody = body;
  if (!finalBody) {
    const { chatCompleteNoSystem } = require("../llmService");
    const prompt = `Write a short, professional reply to this email from ${replyTo} with subject "${subject}".
Context available: ${JSON.stringify(ctx.fetchResult || {}).slice(0, 400)}
Keep it concise and end with "— Poshn Team".
Return ONLY the reply body.`;
    finalBody = await chatCompleteNoSystem(prompt, 250, 0.3);
  }

  // Re-prefix subject if needed
  const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;

  const raw = buildRawEmail({
    to: replyTo,
    from: userEmail,
    subject: replySubject,
    body: finalBody,
    inReplyTo,
    references: references ? `${references} ${inReplyTo}` : inReplyTo,
  });

  await client.post("/messages/send", { raw, threadId });

  const summary = `↩️ *Reply sent*\nTo: ${replyTo}\nSubject: ${replySubject}\n\n${finalBody.slice(
    0,
    200
  )}${finalBody.length > 200 ? "…" : ""}`;

  return {
    threadId,
    to: replyTo,
    subject: replySubject,
    body: finalBody,
    sent: true,
    summary,
  };
}

module.exports = {
  toolGmailGetInbox,
  toolGmailSearchEmails,
  toolGmailGetEmail,
  toolGmailSummarizeThread,
  toolGmailSendEmail,
  toolGmailReplyEmail,
};
