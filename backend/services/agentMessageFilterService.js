"use strict";

const { INTENT_PATTERNS } = require("./communicationActionConfig");

const BULK_GMAIL_LABELS = new Set([
  "CATEGORY_PROMOTIONS",
  "CATEGORY_SOCIAL",
  "CATEGORY_UPDATES",
  "CATEGORY_FORUMS",
]);

function normalizeLower(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(text = "", patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function buildGmailInboxQuery({ unreadOnly = false, includeBulk = false } = {}) {
  const parts = [unreadOnly ? "is:unread" : "", "in:inbox"];
  if (!includeBulk) {
    parts.push(
      "-category:promotions",
      "-category:social",
      "-category:updates",
      "-category:forums"
    );
  }
  return parts.filter(Boolean).join(" ");
}

function looksLikeBulkGmailEmail(email = {}) {
  const labels = new Set(
    (email.labelIds || []).map((label) => String(label || "").toUpperCase())
  );
  if ([...BULK_GMAIL_LABELS].some((label) => labels.has(label))) {
    return true;
  }

  const haystack = normalizeLower(
    [
      email.subject,
      email.from,
      email.to,
      email.replyTo,
      email.listUnsubscribe,
      email.precedence,
      email.snippet,
    ].join(" ")
  );

  return (
    matchesAny(haystack, INTENT_PATTERNS.newsletter) ||
    matchesAny(haystack, INTENT_PATTERNS.automatedSender)
  );
}

function filterGmailInboxEmails(
  emails = [],
  { includeBulk = false, maxResults = 10 } = {}
) {
  const filtered = includeBulk
    ? emails
    : emails.filter((email) => !looksLikeBulkGmailEmail(email));
  return filtered.slice(0, Math.max(1, Number(maxResults) || 10));
}

function scoreTelegramDialog(dialog = {}, { includeGroups = false } = {}) {
  let score = Number(dialog.unreadCount || 0) * 5;

  if (dialog.type === "user") score += 100;
  else if (dialog.type === "group") score += includeGroups ? 25 : -50;
  else if (dialog.type === "channel") score += includeGroups ? 5 : -100;

  if (dialog.lastDate) score += 5;
  return score;
}

function filterTelegramDialogs(
  dialogs = [],
  { includeGroups = false, requireUnread = false } = {}
) {
  return [...dialogs]
    .filter((dialog) => {
      if (!dialog) return false;
      if (requireUnread && Number(dialog.unreadCount || 0) <= 0) return false;
      if (dialog.type === "user") return true;
      if (includeGroups && (dialog.type === "group" || dialog.type === "channel")) {
        return true;
      }
      return false;
    })
    .sort((a, b) => {
      const scoreDiff =
        scoreTelegramDialog(b, { includeGroups }) -
        scoreTelegramDialog(a, { includeGroups });
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.lastDate || 0) - new Date(a.lastDate || 0);
    });
}

function scoreWhatsAppChat(
  chat = {},
  { includeGroups = false, includeBroadcasts = false } = {}
) {
  let score = Number(chat.unreadCount || 0) * 5;

  if (!chat.isGroup && !chat.isReadOnly) score += 100;
  else if (chat.isGroup) score += includeGroups ? 25 : -60;

  if (chat.isReadOnly) score += includeBroadcasts ? 5 : -100;
  if (chat.lastMessage?.timestamp || chat.timestamp) score += 5;

  return score;
}

function filterWhatsAppChats(
  chats = [],
  { includeGroups = false, includeBroadcasts = false, requireUnread = false } = {}
) {
  return [...chats]
    .filter((chat) => {
      if (!chat) return false;
      if (requireUnread && Number(chat.unreadCount || 0) <= 0) return false;
      if (chat.isReadOnly && !includeBroadcasts) return false;
      if (chat.isGroup && !includeGroups) return false;
      return true;
    })
    .sort((a, b) => {
      const scoreDiff =
        scoreWhatsAppChat(b, { includeGroups, includeBroadcasts }) -
        scoreWhatsAppChat(a, { includeGroups, includeBroadcasts });
      if (scoreDiff !== 0) return scoreDiff;
      return Number(b.timestamp || 0) - Number(a.timestamp || 0);
    });
}

module.exports = {
  buildGmailInboxQuery,
  looksLikeBulkGmailEmail,
  filterGmailInboxEmails,
  filterTelegramDialogs,
  filterWhatsAppChats,
  __test: {
    buildGmailInboxQuery,
    looksLikeBulkGmailEmail,
    filterTelegramDialogs,
    filterWhatsAppChats,
  },
};
