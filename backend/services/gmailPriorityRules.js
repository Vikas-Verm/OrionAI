"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;

const GMAIL_PRIORITY_24H_QUERY = [
  "in:inbox",
  "newer_than:1d",
  "-from:me",
  "-category:promotions",
  "-category:social",
  "-category:updates",
  "-category:forums",
].join(" ");

const GMAIL_PRIORITY_RECENT_QUERY = [
  "in:inbox",
  "newer_than:20m",
  "-from:me",
  "-category:promotions",
  "-category:social",
  "-category:updates",
  "-category:forums",
].join(" ");

const GMAIL_PRIORITY_HEADERS = [
  "Subject",
  "From",
  "To",
  "Cc",
  "Date",
  "Reply-To",
  "Auto-Submitted",
  "Precedence",
  "X-Auto-Response-Suppress",
  "List-Unsubscribe",
  "Content-Class",
];

const GMAIL_INCLUDE_SIGNALS = [
  { match: /\?/, label: "direct question", score: 18, why: "asked a direct question" },
  { match: /please confirm|confirm by|kindly confirm/, label: "needs confirmation", score: 16, why: "asked for confirmation" },
  { match: /let me know|let us know|let's know/, label: "waiting for your answer", score: 12, why: "is waiting to hear back from you" },
  { match: /can you|could you|would you|will you/, label: "direct ask", score: 16, why: "contains a direct ask" },
  { match: /please share|please send|share\b|send\b/, label: "requested document", score: 12, why: "asked you to send something" },
  { match: /please review|kindly check|review this|check this/, label: "needs review", score: 12, why: "asked you to review something" },
  { match: /approval|approve|sign off|green light/, label: "approval ask", score: 15, why: "is asking for your approval" },
  { match: /leave request|leave apply|apply(?:ing)? for leave|request(?:ing)? leave|can i take leave|grant (?:my|the)? leave|approve my leave/, label: "leave approval", score: 18, why: "is asking you to approve leave" },
  { match: /follow[\s-]?up|following up|circling back|checking in/, label: "follow-up", score: 13, why: "looks like a follow-up waiting on you" },
  { match: /need your response|need your update|waiting for your update/, label: "waiting on update", score: 15, why: "is explicitly waiting on your update" },
  { match: /share an update|status update|send an update|provide an update/, label: "status request", score: 12, why: "asked you for a status update" },
  { match: /thoughts|feedback|input/, label: "needs your input", score: 11, why: "is asking for your input" },
  { match: /invoice|payment|billing|renewal/, label: "payment follow-up", score: 18, why: "mentions payment follow-up" },
  { match: /urgent|asap|immediately|critical/, label: "urgent wording", score: 16, why: "uses urgent wording" },
];

const GMAIL_EXCLUDE_PATTERNS = [
  /invitation:|updated invitation:|accepted:|declined:|tentative:/,
  /\bgoogle calendar\b|\bgoogle meet\b|calendar invitation|meeting invitation|event invitation/,
  /\bunsubscribe\b|newsletter|digest|weekly summary|daily summary|marketing/,
  /\bpromo\b|offer ends|sale|discount|deal/,
  /\bnotification\b|system alert|do not reply|noreply|no-reply/,
  /github|jira|atlassian|asana|notion updates|build succeeded|build failed/,
];

function getHeader(headers = [], name) {
  return (
    headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())
      ?.value || ""
  );
}

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractEmailAddress(value = "") {
  const bracketMatch = value.match(/<([^>]+)>/);
  const raw = bracketMatch?.[1] || value;
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (emailMatch?.[0] || "").trim().toLowerCase();
}

function extractSenderName(value = "") {
  const bracketMatch = value.match(/^(.+?)\s*</);
  return (bracketMatch?.[1] || value.split("@")[0] || value).replace(/"/g, "").trim();
}

function isAutomatedSender(fromValue, headers = []) {
  const haystack = [
    fromValue,
    getHeader(headers, "Reply-To"),
    getHeader(headers, "Auto-Submitted"),
    getHeader(headers, "Precedence"),
    getHeader(headers, "X-Auto-Response-Suppress"),
    getHeader(headers, "List-Unsubscribe"),
  ]
    .join(" ")
    .toLowerCase();

  if (
    /no-?reply|do-?not-?reply|donotreply|mailer-daemon|auto-?reply|bounce|newsletter|digest/.test(
      haystack
    )
  ) {
    return true;
  }

  const autoSubmitted = getHeader(headers, "Auto-Submitted").toLowerCase();
  return autoSubmitted && autoSubmitted !== "no";
}

function isLikelyImportantSender(from = "", selfEmail = "") {
  const senderEmail = extractEmailAddress(from);
  const senderName = extractSenderName(from).toLowerCase();
  const selfDomain = selfEmail.split("@")[1] || "";
  const senderDomain = senderEmail.split("@")[1] || "";

  if (selfDomain && senderDomain && senderDomain === selfDomain) return true;
  if (/(founder|ceo|cto|finance|billing|manager|director|lead|client|partner)/.test(senderName)) {
    return true;
  }
  return false;
}

function isLikelyHumanSender(from = "") {
  const senderName = extractSenderName(from);
  const senderEmail = extractEmailAddress(from);
  if (!senderEmail) return false;

  const cleanName = senderName.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const words = cleanName.split(/\s+/).filter(Boolean);
  const companyWords = /team|support|noreply|newsletter|info|updates|alert|notification|service|admin|billing|sales|help|notifications|marketing|digest/i;

  if (companyWords.test(cleanName)) return false;
  if (words.length >= 2 && /^[A-Z][a-z]/.test(words[0]) && /^[A-Z][a-z]/.test(words[1])) {
    return true;
  }

  const localPart = senderEmail.split("@")[0] || "";
  return !companyWords.test(localPart);
}

function hoursAgo(value) {
  const diffMs = Date.now() - value;
  return Math.max(0, diffMs / 3600000);
}

function formatAgeHours(hours) {
  if (hours < 1) return "less than an hour";
  if (hours < 2) return "1 hour";
  return `${Math.round(hours)} hours`;
}

function buildReasonBits({ ageHours, unread, topSignal, importantSender }) {
  const reasonBits = [`${Math.max(1, Math.round(ageHours))}h old`];
  if (unread) reasonBits.push("unread");
  if (topSignal) reasonBits.push(topSignal.label);
  else if (importantSender) reasonBits.push("important sender");
  return reasonBits;
}

function classifyPriorityThread(thread, selfEmail = "", nowMs = Date.now()) {
  const messages = [...(thread?.messages || [])].sort(
    (a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0)
  );
  const latestMessage = messages[messages.length - 1];
  if (!latestMessage) return null;

  const headers = latestMessage.payload?.headers || [];
  const subject = normalizeText(
    getHeader(headers, "Subject") || thread.snippet || "(no subject)"
  );
  const from = getHeader(headers, "From") || "Unknown sender";
  const senderEmail = extractEmailAddress(from);
  const senderName = extractSenderName(from);
  const latestMs =
    Number(latestMessage.internalDate || 0) || Date.parse(getHeader(headers, "Date") || "");
  const ageHours = latestMs ? Math.max(0, (nowMs - latestMs) / 3600000) : 999;
  const latestLabels = new Set(
    (messages.flatMap((message) => message.labelIds || []) || []).map((label) =>
      String(label || "").toUpperCase()
    )
  );

  if (!senderEmail || senderEmail === String(selfEmail || "").toLowerCase()) return null;
  if (isAutomatedSender(from, headers)) return null;
  if (!isLikelyHumanSender(from)) return null;
  if (!latestMs || nowMs - latestMs > DAY_MS) return null;

  if (
    latestLabels.has("CATEGORY_PROMOTIONS") ||
    latestLabels.has("CATEGORY_SOCIAL") ||
    latestLabels.has("CATEGORY_UPDATES") ||
    latestLabels.has("CATEGORY_FORUMS")
  ) {
    return null;
  }

  const haystack = normalizeText(
    `${subject} ${thread.snippet || ""} ${getHeader(headers, "Content-Class")} ${getHeader(headers, "List-Unsubscribe")}`
  ).toLowerCase();

  if (GMAIL_EXCLUDE_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return null;
  }

  const unread = (latestMessage.labelIds || []).includes("UNREAD");
  const importantSender = isLikelyImportantSender(from, selfEmail);
  const includeHits = GMAIL_INCLUDE_SIGNALS.filter((signal) => signal.match.test(haystack));
  const includeScore = includeHits.reduce((sum, hit) => sum + hit.score, 0);
  const topSignal = includeHits[0] || null;

  const strongReplyNeeded =
    includeScore >= 16 ||
    (importantSender && includeScore >= 10) ||
    /\?/.test(haystack) ||
    /please confirm|approval|approve|follow[\s-]?up|following up|need your response|waiting for your update|urgent|asap/.test(
      haystack
    );

  const unreadWorthSurfacing =
    unread && (includeScore >= 10 || (importantSender && includeScore >= 8));

  if (!strongReplyNeeded && !unreadWorthSurfacing) {
    return null;
  }

  if (!unread && !strongReplyNeeded) {
    return null;
  }

  let priorityScore = 24;
  if (unread) priorityScore += 14;
  if (importantSender) priorityScore += 10;
  if (ageHours >= 6) priorityScore += 12;
  else if (ageHours >= 2) priorityScore += 8;
  priorityScore += includeScore;
  if ((thread.messages || []).length >= 4) priorityScore += 4;
  priorityScore = Math.max(0, Math.min(priorityScore, 99));

  const highConfidence =
    strongReplyNeeded &&
    (includeScore >= 18 || importantSender || /urgent|asap|payment|approval|please confirm/.test(haystack));

  const whyThisMatters = topSignal
    ? `The latest inbound message from ${senderName} arrived ${formatAgeHours(ageHours)} ago, ${topSignal.why}, and you have not replied yet.`
    : `The latest inbound message from ${senderName} is ${formatAgeHours(ageHours)} old and still appears to be waiting on your reply.`;

  return {
    id: thread.id,
    subject,
    from,
    senderEmail,
    senderName,
    unread,
    lastMs: latestMs,
    ageHours: hoursAgo(latestMs),
    latestMessageId: latestMessage.id,
    importantSender,
    includeHits,
    includeScore,
    topSignal,
    highConfidence,
    reasonBits: buildReasonBits({ ageHours: hoursAgo(latestMs), unread, topSignal, importantSender }),
    whyThisMatters,
    priorityScore,
  };
}

function buildGmailSignalSummary(count) {
  if (!count) return null;
  return `${count} reply-worthy email${count === 1 ? "" : "s"} waiting on you`;
}

module.exports = {
  GMAIL_PRIORITY_24H_QUERY,
  GMAIL_PRIORITY_RECENT_QUERY,
  GMAIL_PRIORITY_HEADERS,
  buildGmailSignalSummary,
  classifyPriorityThread,
  extractEmailAddress,
  extractSenderName,
  formatAgeHours,
  getHeader,
};
