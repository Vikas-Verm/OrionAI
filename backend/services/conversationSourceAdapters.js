"use strict";

const {
  normalizeText,
  normalizeLower,
  stripQuotedReplyText,
  toTimestamp,
} = require("./communicationActionClassifier");
const { INTENT_PATTERNS } = require("./communicationActionConfig");

const GMAIL_HEADERS = [
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

function matchesAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function getHeader(headers = [], name) {
  return (
    headers.find((header) => String(header.name || "").toLowerCase() === name.toLowerCase())
      ?.value || ""
  );
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

function splitEmails(value = "") {
  return String(value || "")
    .split(",")
    .map((part) => extractEmailAddress(part))
    .filter(Boolean);
}

function gmailB64(data) {
  if (!data) return "";
  return Buffer.from(
    String(data).replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("utf-8");
}

function extractGmailBody(payload, mime) {
  if (!payload) return "";
  if (payload.mimeType === mime && payload.body?.data) {
    return gmailB64(payload.body.data);
  }
  if (payload.parts) {
    const hit = payload.parts.find((part) => part.mimeType === mime);
    if (hit?.body?.data) return gmailB64(hit.body.data);
    for (const part of payload.parts) {
      const nested = extractGmailBody(part, mime);
      if (nested) return nested;
    }
  }
  return "";
}

function getNormalizedGmailMessageText(message, threadFallback = "") {
  const plainText = extractGmailBody(message?.payload, "text/plain");
  const htmlText = extractGmailBody(message?.payload, "text/html")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const rawText =
    plainText ||
    htmlText ||
    message?.snippet ||
    threadFallback ||
    "";
  const cleanedText = stripQuotedReplyText(rawText, "gmail");
  return cleanedText || normalizeText(message?.snippet || threadFallback || "");
}

function isAutomatedEmail(headers = [], fromValue = "") {
  const haystack = normalizeLower(
    [
      fromValue,
      getHeader(headers, "Reply-To"),
      getHeader(headers, "Auto-Submitted"),
      getHeader(headers, "Precedence"),
      getHeader(headers, "X-Auto-Response-Suppress"),
      getHeader(headers, "List-Unsubscribe"),
    ].join(" ")
  );

  return (
    matchesAny(haystack, INTENT_PATTERNS.automatedSender) ||
    (getHeader(headers, "Auto-Submitted") || "").toLowerCase() === "auto-generated"
  );
}

function walkPayloadParts(payload, visitor) {
  if (!payload) return;
  visitor(payload);
  if (Array.isArray(payload.parts)) {
    payload.parts.forEach((part) => walkPayloadParts(part, visitor));
  }
}

function buildGmailThreadHaystack(thread) {
  const fragments = [thread?.snippet || ""];

  for (const message of thread?.messages || []) {
    const headers = message?.payload?.headers || [];
    fragments.push(
      getHeader(headers, "Subject"),
      getHeader(headers, "From"),
      getHeader(headers, "To"),
      getHeader(headers, "Cc"),
      getHeader(headers, "Reply-To"),
      getHeader(headers, "Content-Class"),
      getHeader(headers, "List-Unsubscribe"),
      message?.snippet || "",
      // The snippet caps at ~100 chars and often misses bulk-email markers
      // like "unsubscribe" that live further down the body. Pull the
      // normalized body so newsletter / cold-outreach detection works on
      // the full message, not just the salutation preview.
      getNormalizedGmailMessageText(message, thread?.snippet || "")
    );

    walkPayloadParts(message?.payload, (part) => {
      fragments.push(
        part?.mimeType || "",
        part?.filename || ""
      );
    });
  }

  return normalizeLower(fragments.filter(Boolean).join(" "));
}

function looksLikeBulkEmail(thread) {
  const messages = thread.messages || [];
  const latest = messages[messages.length - 1];
  const labels = new Set(messages.flatMap((message) => message.labelIds || []));
  const haystack = buildGmailThreadHaystack(thread);

  if (
    labels.has("CATEGORY_PROMOTIONS") ||
    labels.has("CATEGORY_SOCIAL") ||
    labels.has("CATEGORY_UPDATES") ||
    labels.has("CATEGORY_FORUMS")
  ) {
    return "This looks like promotional or bulk email and does not require action.";
  }

  if (matchesAny(haystack, INTENT_PATTERNS.invitation)) {
    return "This looks like a calendar invite and does not require action.";
  }

  if (matchesAny(haystack, INTENT_PATTERNS.newsletter)) {
    return "This looks like newsletter or marketing traffic and does not require action.";
  }

  return "";
}

function normalizeGmailThread(thread, selfEmail) {
  const firstHeaders = thread.messages?.[0]?.payload?.headers || [];
  const latestHeaders =
    thread.messages?.[thread.messages.length - 1]?.payload?.headers || [];
  const latestToValue = getHeader(latestHeaders, "To") || getHeader(firstHeaders, "To");
  const latestCcValue = getHeader(latestHeaders, "Cc") || getHeader(firstHeaders, "Cc");
  const directRecipient = splitEmails(latestToValue).includes(selfEmail);
  const ccOnlyRecipient = !directRecipient && splitEmails(latestCcValue).includes(selfEmail);

  const messages = [...(thread.messages || [])]
    .sort((a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0))
    .map((message) => {
      const headers = message.payload?.headers || [];
      const from = getHeader(headers, "From");
      const senderEmail = extractEmailAddress(from);
      const to = getHeader(headers, "To");
      const cc = getHeader(headers, "Cc");
      const text = getNormalizedGmailMessageText(message, thread.snippet || "");
      const direction = senderEmail === selfEmail ? "outbound" : "inbound";
      const automated = isAutomatedEmail(headers, from);
      const toList = splitEmails(to);
      const ccList = splitEmails(cc);
      const directlyAddressed = toList.includes(selfEmail);

      return {
        id: message.id,
        timestamp: Number(message.internalDate || 0),
        text,
        previewText: text,
        direction,
        senderType: automated ? "system" : senderEmail ? "human" : "unknown",
        senderName: extractSenderName(from),
        senderId: senderEmail,
        mentionedCurrentUser: false,
        addressedToCurrentUser:
          direction === "inbound" && (directlyAddressed || ccList.includes(selfEmail)),
        hasAttachments: Boolean(message.payload?.parts?.some((part) => part.filename)),
      };
    });

  const subject =
    getHeader(firstHeaders, "Subject") ||
    getHeader(latestHeaders, "Subject") ||
    "(no subject)";

  return {
    sourceType: "gmail",
    conversationId: thread.id,
    threadId: thread.id,
    conversationTitle: normalizeText(subject),
    participantLabel: extractSenderName(
      getHeader(latestHeaders, "From") || getHeader(firstHeaders, "From")
    ),
    previewText:
      messages[messages.length - 1]?.text ||
      stripQuotedReplyText(thread.snippet || "", "gmail") ||
      normalizeText(thread.snippet || ""),
    sourceMetadata: {
      directRecipient,
      ccOnlyRecipient,
      excludedReason: looksLikeBulkEmail(thread),
      participantLabel: extractSenderName(
        getHeader(latestHeaders, "From") || getHeader(firstHeaders, "From")
      ),
      isDirect: directRecipient,
      explicitlyDirectedToCurrentUser: directRecipient,
    },
    platformMetadata: {
      latestFrom: getHeader(latestHeaders, "From"),
      latestTo: getHeader(latestHeaders, "To"),
      latestCc: getHeader(latestHeaders, "Cc"),
      snippet: normalizeText(thread.snippet || ""),
      messageCount: (thread.messages || []).length,
      headers: GMAIL_HEADERS.reduce((acc, header) => {
        const value = getHeader(latestHeaders, header) || getHeader(firstHeaders, header);
        if (value) acc[header] = value;
        return acc;
      }, {}),
    },
    openContext: {
      threadId: thread.id,
      searchQuery: `"${normalizeText(subject)}"`,
    },
    messages,
  };
}

function determineSlackSenderType(message = {}) {
  if (message.bot_id || message.subtype === "bot_message") return "bot";
  if (message.subtype && message.subtype !== "thread_broadcast") return "system";
  if (message.user) return "human";
  return "unknown";
}

function normalizeSlackText(text = "") {
  return String(text || "")
    .replace(/<@[^>]+>/g, "@mention")
    .replace(/<#[^>|]+\|([^>]+)>/g, "#$1")
    .replace(/<([^>|]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>]+)>/g, "$1");
}

function containsNameMention(text = "", handles = []) {
  const normalized = normalizeLower(text);
  return handles
    .filter(Boolean)
    .some((handle) => {
      const escaped = String(handle).trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!escaped) return false;
      return new RegExp(`(^|\\s|@)${escaped}(\\b|[:,])`).test(normalized);
    });
}

function slackMessageMentionsCurrentUser(message = {}, currentUser = {}) {
  const rawText = String(message.text || "");
  const normalizedText = normalizeSlackText(rawText);
  return (
    rawText.includes(`<@${currentUser.id}>`) ||
    containsNameMention(normalizedText, currentUser.handles)
  );
}

function normalizeSlackMessages(rawMessages = [], channel, currentUser = {}) {
  const sortedMessages = [...rawMessages]
    .filter((message) => toTimestamp(message.ts))
    .sort((a, b) => toTimestamp(a.ts) - toTimestamp(b.ts));

  return sortedMessages.map((message, index) => {
    const text = normalizeSlackText(message.text || "");
    const direction = message.user === currentUser.id ? "outbound" : "inbound";
    const mentionedCurrentUser = slackMessageMentionsCurrentUser(
      message,
      currentUser
    );
    const previousMessage = index > 0 ? sortedMessages[index - 1] : null;
    const inReplyToCurrentUser = Boolean(
      previousMessage && previousMessage.user === currentUser.id && message.user !== currentUser.id
    );

    return {
      id: message.ts,
      timestamp: toTimestamp(message.ts),
      text,
      previewText: text,
      direction,
      senderType: determineSlackSenderType(message),
      senderId: message.user || message.bot_id || "",
      senderName: message.username || message.user || message.bot_id || "Slack",
      mentionedCurrentUser,
      addressedToCurrentUser:
        Boolean(channel.is_im) ||
        mentionedCurrentUser ||
        containsNameMention(text, currentUser.handles) ||
        inReplyToCurrentUser,
      inReplyToCurrentUser,
      hasAttachments: Boolean((message.files || []).length),
    };
  });
}

function pickSlackConversationMessages({
  channel,
  historyMessages = [],
  threadMessagesByRoot = new Map(),
  currentUser = {},
}) {
  const chronologicalHistory = [...historyMessages]
    .filter((message) => toTimestamp(message.ts))
    .sort((a, b) => toTimestamp(a.ts) - toTimestamp(b.ts));

  if (channel.is_im || channel.is_mpim) {
    return {
      messages: chronologicalHistory,
      threadTs: null,
      scope: channel.is_im ? "dm" : "group_dm",
    };
  }

  const threadCandidates = chronologicalHistory
    .filter((message) => threadMessagesByRoot.has(message.ts))
    .map((rootMessage) => {
      const threadMessages = threadMessagesByRoot.get(rootMessage.ts) || [];
      const normalizedThread = normalizeSlackMessages(
        threadMessages,
        channel,
        currentUser
      );
      const hasRelevantSignal = normalizedThread.some(
        (message) =>
          message.direction === "outbound" ||
          message.mentionedCurrentUser ||
          message.addressedToCurrentUser ||
          message.inReplyToCurrentUser
      );

      return {
        hasRelevantSignal,
        latestTimestamp:
          normalizedThread[normalizedThread.length - 1]?.timestamp || 0,
        messages: threadMessages,
        threadTs: rootMessage.ts,
      };
    })
    .filter((candidate) => candidate.hasRelevantSignal)
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp);

  if (threadCandidates.length) {
    return {
      messages: threadCandidates[0].messages,
      threadTs: threadCandidates[0].threadTs,
      scope: "thread",
    };
  }

  return {
    messages: chronologicalHistory,
    threadTs: null,
    scope: "channel",
  };
}

function normalizeTelegramConversation(dialog, messages = [], me = {}) {
  const currentUserHandles = [
    me.username ? `@${me.username}` : "",
    me.username || "",
    [me.firstName, me.lastName].filter(Boolean).join(" "),
    me.firstName || "",
  ].filter(Boolean);
  const outboundIds = new Set(
    messages.filter((message) => message.fromMe).map((message) => String(message.id))
  );
  const normalizedMessages = messages.map((message) => {
    const text = normalizeText(message.text || "");
    const mentionedCurrentUser =
      containsNameMention(text, currentUserHandles) ||
      (me.username
        ? normalizeLower(text).includes(`@${String(me.username).toLowerCase()}`)
        : false);
    const replyToCurrentUser = Boolean(
      message.replyTo && outboundIds.has(String(message.replyTo))
    );

    return {
      id: message.id,
      timestamp: toTimestamp(message.date),
      text,
      previewText: text,
      direction: message.fromMe ? "outbound" : "inbound",
      senderType: dialog.type === "channel" ? "system" : "human",
      senderId: message.fromId || "",
      senderName: message.fromName || dialog.name,
      mentionedCurrentUser,
      addressedToCurrentUser:
        dialog.type === "user" ||
        mentionedCurrentUser ||
        replyToCurrentUser,
      replyToCurrentUser,
      hasAttachments: Boolean(message.media),
    };
  });

  return {
    sourceType: "telegram",
    conversationId: String(dialog.id),
    threadId: null,
    conversationTitle: dialog.name,
    participantLabel: dialog.name,
    previewText:
      dialog.lastMessage ||
      normalizedMessages[normalizedMessages.length - 1]?.text ||
      "",
    sourceMetadata: {
      isDirect: dialog.type === "user",
      isGroup: dialog.type === "group",
      isBroadcast: dialog.type === "channel",
      unreadCount: Number(dialog.unreadCount || 0),
      participantLabel: dialog.name,
    },
    platformMetadata: {
      dialogType: dialog.type,
      unreadCount: Number(dialog.unreadCount || 0),
    },
    openContext: {
      dialogId: String(dialog.id),
    },
    messages: normalizedMessages,
  };
}

function normalizeSignalConversation(room, messages = [], me = {}) {
  const currentUserHandles = [
    me.mxid ? `@${String(me.mxid).replace(/^@/, "").split(":")[0]}` : "",
    me.mxid ? String(me.mxid).replace(/^@/, "").split(":")[0] : "",
    me.displayName || "",
  ].filter(Boolean);
  const outboundIds = new Set(
    messages.filter((message) => message.fromMe).map((message) => String(message.id))
  );

  const normalizedMessages = messages.map((message) => {
    const text = normalizeText(message.text || message.previewText || "");
    const mentionedCurrentUser =
      containsNameMention(text, currentUserHandles) ||
      currentUserHandles.some(
        (handle) => handle && normalizeLower(text).includes(String(handle).toLowerCase())
      );
    const replyToCurrentUser = Boolean(
      message.replyToEventId && outboundIds.has(String(message.replyToEventId))
    );

    return {
      id: message.id,
      timestamp: toTimestamp(message.timestamp),
      text,
      previewText: text,
      direction: message.fromMe ? "outbound" : "inbound",
      senderType: room.isDirect ? "human" : "unknown",
      senderId: message.sender || "",
      senderName: message.senderName || room.name,
      mentionedCurrentUser,
      addressedToCurrentUser:
        room.isDirect || mentionedCurrentUser || replyToCurrentUser,
      replyToCurrentUser,
      hasAttachments: Boolean(message.media),
    };
  });

  return {
    sourceType: "signal",
    conversationId: String(room.roomId || room.id),
    threadId: null,
    conversationTitle: room.name,
    participantLabel: room.name,
    previewText:
      room.lastMessage ||
      normalizedMessages[normalizedMessages.length - 1]?.text ||
      "",
    sourceMetadata: {
      isDirect: Boolean(room.isDirect),
      isGroup: Boolean(room.isGroup),
      isBroadcast: false,
      unreadCount: Number(room.unreadCount || 0),
      participantLabel: room.name,
    },
    platformMetadata: {
      roomId: String(room.roomId || room.id),
      unreadCount: Number(room.unreadCount || 0),
      memberCount: Number(room.memberCount || 0),
    },
    openContext: {
      roomId: String(room.roomId || room.id),
    },
    messages: normalizedMessages,
  };
}

function normalizeWhatsAppConversation(chat, messages = []) {
  const isMatrixBackedChat = Boolean(chat?.roomId || chat?.title || chat?.lastMessagePreview);

  const normalizedMessages = messages.map((message) => {
    if (isMatrixBackedChat) {
      const attachments = Array.isArray(message.attachments)
        ? message.attachments
        : [];
      const attachmentLabel =
        attachments[0]?.fileName ||
        attachments[0]?.type ||
        "";
      const text = normalizeText(message.text || attachmentLabel);
      const direction =
        message.direction || (message.fromMe ? "outbound" : "inbound");

      return {
        id: message.id || message.eventId,
        timestamp: toTimestamp(message.timestamp),
        text,
        previewText: text,
        direction,
        senderType: chat.isGroup ? "unknown" : "human",
        senderId: message.senderId || "",
        senderName:
          message.senderName ||
          (direction === "outbound" ? "You" : chat.title || chat.name),
        mentionedCurrentUser: false,
        addressedToCurrentUser: !chat.isGroup,
        hasAttachments: attachments.length > 0,
      };
    }

    return {
      id: message.id._serialized,
      timestamp: toTimestamp(message.timestamp),
      text: normalizeText(message.body || ""),
      previewText: normalizeText(message.body || ""),
      direction: message.fromMe ? "outbound" : "inbound",
      senderType:
        message.type === "chat"
          ? "human"
          : chat.isReadOnly
            ? "system"
            : "unknown",
      senderId: message.from || "",
      senderName: message.fromMe ? "You" : message._data?.notifyName || chat.name,
      mentionedCurrentUser: false,
      addressedToCurrentUser: !chat.isGroup,
      hasAttachments: message.type !== "chat",
    };
  });

  return {
    sourceType: "whatsapp",
    conversationId: isMatrixBackedChat ? String(chat.roomId || chat.id) : chat.id._serialized,
    threadId: null,
    conversationTitle: chat.title || chat.name,
    participantLabel: chat.title || chat.name,
    previewText:
      normalizeText(
        chat.lastMessagePreview ||
          chat.lastMessage ||
          chat.lastMessage?.body ||
          ""
      ) ||
      normalizedMessages[normalizedMessages.length - 1]?.text ||
      "",
    sourceMetadata: {
      isDirect: !chat.isGroup,
      isGroup: Boolean(chat.isGroup),
      isBroadcast: Boolean(chat.isReadOnly),
      unreadCount: Number(chat.unreadCount || chat.unread || 0),
      participantLabel: chat.title || chat.name,
    },
    platformMetadata: {
      isGroup: Boolean(chat.isGroup),
      unreadCount: Number(chat.unreadCount || chat.unread || 0),
      roomId: isMatrixBackedChat ? String(chat.roomId || chat.id) : undefined,
    },
    openContext: {
      chatId: isMatrixBackedChat
        ? String(chat.roomId || chat.id)
        : chat.id._serialized,
      roomId: isMatrixBackedChat ? String(chat.roomId || chat.id) : undefined,
    },
    messages: normalizedMessages,
  };
}

module.exports = {
  GMAIL_HEADERS,
  matchesAny,
  getHeader,
  extractEmailAddress,
  extractSenderName,
  splitEmails,
  getNormalizedGmailMessageText,
  isAutomatedEmail,
  buildGmailThreadHaystack,
  looksLikeBulkEmail,
  normalizeGmailThread,
  determineSlackSenderType,
  normalizeSlackText,
  containsNameMention,
  normalizeSlackMessages,
  pickSlackConversationMessages,
  normalizeTelegramConversation,
  normalizeSignalConversation,
  normalizeWhatsAppConversation,
};
