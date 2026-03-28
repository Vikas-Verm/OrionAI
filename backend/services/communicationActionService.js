"use strict";

const axios = require("axios");
const Integration = require("../models/Integration");
const PriorityFeedAction = require("../models/PriorityFeedAction");
const { getGmailClient } = require("./workspaceSignalsService");
const tg = require("./tools/toolTelegramMTProto");
const { getOrCreateClient } = require("./tools/toolWhatsapp");
const {
  ACTION_STATES,
  ACTION_STATE_META,
  classifyConversation,
  summarizeActionStates,
  normalizeText,
  normalizeLower,
  stripQuotedReplyText,
  toTimestamp,
  clamp,
} = require("./communicationActionClassifier");
const { SOURCE_THRESHOLDS, INTENT_PATTERNS } = require("./communicationActionConfig");

const APP_META = {
  gmail: { label: "Gmail", icon: "📧", module: "gmail" },
  slack: { label: "Slack", icon: "💬", module: "slack" },
  telegram: { label: "Telegram", icon: "✈️", module: "telegram" },
  whatsapp: { label: "WhatsApp", icon: "🟢", module: "whatsapp" },
};

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

function getAppMeta(sourceType) {
  return APP_META[sourceType] || {
    label: sourceType,
    icon: "•",
    module: sourceType,
  };
}

function buildSourceBadge(sourceType) {
  const meta = getAppMeta(sourceType);
  return {
    sourceApp: sourceType,
    sourceLabel: meta.label,
    sourceIcon: meta.icon,
    module: meta.module,
  };
}

function toPriorityLevel(score) {
  if (score >= 72) return "High";
  if (score >= 42) return "Medium";
  return "Low";
}

function createModuleAction(label, module, context = null) {
  return {
    label,
    kind: "module",
    module,
    context: context || undefined,
  };
}

function createPromptAction({ label, prompt, mode = "agent" }) {
  return {
    label,
    kind: "prompt",
    prompt,
    mode,
  };
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

function matchesAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
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
      message?.snippet || ""
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

function determineSlackSenderType(message = {}) {
  if (message.bot_id || message.subtype === "bot_message") return "bot";
  if (message.subtype && message.subtype !== "thread_broadcast") return "system";
  if (message.user) return "human";
  return "unknown";
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

async function slackApiGet(token, method, params = {}) {
  const res = await axios.get(`https://slack.com/api/${method}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });
  if (!res.data.ok) {
    throw new Error(`Slack API [${method}]: ${res.data.error || "unknown_error"}`);
  }
  return res.data;
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

function filterSurfaceStates(states = []) {
  return states.filter((state) => state?.surfaceEligible);
}

function summarizeSource(sourceType, summary) {
  const label = getAppMeta(sourceType).label;
  if (!summary.actionableCount) {
    return `No action-heavy ${label} conversations were detected right now.`;
  }

  const parts = [];
  if (summary.replyRequiredCount) {
    parts.push(`${summary.replyRequiredCount} waiting on your reply`);
  }
  if (summary.approvalCount) {
    parts.push(`${summary.approvalCount} approval${summary.approvalCount === 1 ? "" : "s"}`);
  }
  if (summary.followUpCount) {
    parts.push(`${summary.followUpCount} follow-up${summary.followUpCount === 1 ? "" : "s"}`);
  }

  return `${label}: ${parts.join(" · ")}.`;
}

function buildActionGroups(states = []) {
  const summary = summarizeActionStates(states);
  return [
    {
      id: ACTION_STATES.WAITING_ON_YOUR_REPLY,
      label: ACTION_STATE_META[ACTION_STATES.WAITING_ON_YOUR_REPLY].label,
      count: summary.replyRequiredCount,
    },
    {
      id: ACTION_STATES.NEEDS_APPROVAL,
      label: ACTION_STATE_META[ACTION_STATES.NEEDS_APPROVAL].label,
      count: summary.approvalCount,
    },
    {
      id: ACTION_STATES.NEEDS_FOLLOW_UP,
      label: ACTION_STATE_META[ACTION_STATES.NEEDS_FOLLOW_UP].label,
      count: summary.followUpCount,
    },
    {
      id: ACTION_STATES.WAITING_ON_OTHERS,
      label: ACTION_STATE_META[ACTION_STATES.WAITING_ON_OTHERS].label,
      count: summary.waitingOnOthersCount,
    },
    {
      id: ACTION_STATES.NO_ACTION_NEEDED,
      label: ACTION_STATE_META[ACTION_STATES.NO_ACTION_NEEDED].label,
      count: summary.noActionCount,
    },
  ];
}

function sortStates(states = []) {
  return [...states].sort((a, b) => {
    if ((b.priorityBoost || 0) !== (a.priorityBoost || 0)) {
      return (b.priorityBoost || 0) - (a.priorityBoost || 0);
    }
    return (b.latestMessageTimestamp || 0) - (a.latestMessageTimestamp || 0);
  });
}

async function getLatestActionsByItem(userId) {
  const actions = await PriorityFeedAction.find({ userId })
    .sort({ createdAt: -1 })
    .limit(150)
    .lean();

  const latestByItem = new Map();
  for (const action of actions) {
    if (!latestByItem.has(action.itemId)) {
      latestByItem.set(action.itemId, action);
    }
  }
  return latestByItem;
}

function isReactivatedSinceAction(item, latestAction) {
  const latestRelevant =
    toTimestamp(item.latestMessageTimestamp) ||
    toTimestamp(item.latestInboundTimestamp) ||
    null;
  const actionAt = toTimestamp(latestAction?.createdAt);
  if (!latestRelevant || !actionAt) return false;
  return latestRelevant > actionAt;
}

function filterSuppressedStates(states = [], latestActionsByItem = new Map()) {
  const now = Date.now();
  return states.filter((state) => {
    const latestAction = latestActionsByItem.get(state.id);
    if (!latestAction) return true;
    if (isReactivatedSinceAction(state, latestAction)) return true;
    if (latestAction.action === "snoozed") {
      return !latestAction.snoozedUntil || new Date(latestAction.snoozedUntil).getTime() <= now;
    }
    return false;
  });
}

async function fetchGmailStates(userId, options = {}) {
  const client = await getGmailClient(userId);
  if (!client?.gmail) return [];

  const lookbackDays = SOURCE_THRESHOLDS.gmail.lookbackDays || 14;
  const q = [
    "in:inbox",
    `newer_than:${lookbackDays}d`,
    "-category:promotions",
    "-category:social",
    "-category:updates",
    "-category:forums",
  ].join(" ");

  const threadList = await client.gmail.users.threads.list({
    userId: "me",
    q,
    maxResults: SOURCE_THRESHOLDS.gmail.maxConversations,
    fields: "threads/id",
  });

  const threads = threadList.data.threads || [];
  if (!threads.length) return [];

  const details = await Promise.all(
    threads.map((thread) =>
      client.gmail.users.threads
        .get({
          userId: "me",
          id: thread.id,
          format: "full",
        })
        .then((result) => result.data)
        .catch(() => null)
    )
  );

  const selfEmail = String(client.integration?.gmail?.userEmail || "").toLowerCase();
  return details
    .filter(Boolean)
    .map((thread) => normalizeGmailThread(thread, selfEmail))
    .filter(Boolean)
    .map((conversation) => classifyConversation(conversation))
    .filter(Boolean)
    .map((state) => ({
      ...state,
      ...buildSourceBadge("gmail"),
    }));
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
        addressedToCurrentUser: direction === "inbound" && (directlyAddressed || ccList.includes(selfEmail)),
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
    participantLabel: extractSenderName(getHeader(latestHeaders, "From") || getHeader(firstHeaders, "From")),
    previewText:
      messages[messages.length - 1]?.text ||
      stripQuotedReplyText(thread.snippet || "", "gmail") ||
      normalizeText(thread.snippet || ""),
    sourceMetadata: {
      directRecipient,
      ccOnlyRecipient,
      excludedReason: looksLikeBulkEmail(thread),
      participantLabel: extractSenderName(getHeader(latestHeaders, "From") || getHeader(firstHeaders, "From")),
      isDirect: directRecipient,
      explicitlyDirectedToCurrentUser: directRecipient,
    },
    platformMetadata: {
      latestFrom: getHeader(latestHeaders, "From"),
      latestTo: getHeader(latestHeaders, "To"),
      latestCc: getHeader(latestHeaders, "Cc"),
      snippet: normalizeText(thread.snippet || ""),
      messageCount: (thread.messages || []).length,
    },
    openContext: {
      threadId: thread.id,
      searchQuery: `"${normalizeText(subject)}"`,
    },
    messages,
  };
}

async function fetchSlackStates(userId) {
  const integration = await Integration.findOne({
    userId,
    type: "slack",
    enabled: true,
  });
  if (!integration?.slack?.userToken) return [];

  const token = integration.slack.userToken;
  const currentUser = {
    id: integration.slack.userId || "",
    handles: [
      integration.slack.userName || "",
      integration.slack.realName || "",
    ],
  };

  const listRes = await slackApiGet(token, "conversations.list", {
    types: "im,mpim,public_channel,private_channel",
    limit: 120,
    exclude_archived: true,
  });

  const conversations = (listRes.channels || [])
    .filter((channel) => channel.is_im || channel.is_mpim || channel.is_channel || channel.is_group)
    .sort((a, b) => {
      if (Boolean(b.is_im) !== Boolean(a.is_im)) return Number(b.is_im) - Number(a.is_im);
      return Number(b.unread_count_display || b.unread_count || 0) - Number(a.unread_count_display || a.unread_count || 0);
    })
    .slice(0, SOURCE_THRESHOLDS.slack.maxConversations);

  const normalized = await Promise.all(
    conversations.map(async (channel) => {
      try {
        const historyRes = await slackApiGet(token, "conversations.history", {
          channel: channel.id,
          limit: SOURCE_THRESHOLDS.slack.messageLimit,
        });

        let participantLabel = channel.name || channel.id;
        if (channel.is_im && channel.user) {
          try {
            const userRes = await slackApiGet(token, "users.info", {
              user: channel.user,
            });
            participantLabel =
              userRes.user?.profile?.display_name ||
              userRes.user?.profile?.real_name ||
              userRes.user?.name ||
              participantLabel;
          } catch {}
        } else if (channel.is_channel || channel.is_group) {
          participantLabel = `#${channel.name}`;
        }

        const historyMessages = historyRes.messages || [];
        const threadRoots = historyMessages
          .filter((message) => Number(message.reply_count || 0) > 0)
          .sort((a, b) => toTimestamp(b.ts) - toTimestamp(a.ts))
          .slice(0, SOURCE_THRESHOLDS.slack.threadLimit || 4);
        const threadResults = await Promise.all(
          threadRoots.map((rootMessage) =>
            slackApiGet(token, "conversations.replies", {
              channel: channel.id,
              ts: rootMessage.ts,
              limit: SOURCE_THRESHOLDS.slack.messageLimit,
            }).catch(() => null)
          )
        );
        const threadMessagesByRoot = new Map();
        threadResults.forEach((thread, index) => {
          if (thread?.messages?.length) {
            threadMessagesByRoot.set(threadRoots[index].ts, thread.messages);
          }
        });

        const selectedConversation = pickSlackConversationMessages({
          channel,
          historyMessages,
          threadMessagesByRoot,
          currentUser,
        });
        const messages = normalizeSlackMessages(
          selectedConversation.messages,
          channel,
          currentUser
        );

        const latestPreview = messages[messages.length - 1]?.text || "";
        return {
          sourceType: "slack",
          conversationId: channel.id,
          threadId: selectedConversation.threadTs || null,
          conversationTitle: participantLabel,
          participantLabel,
          previewText: latestPreview,
          sourceMetadata: {
            isDirect: Boolean(channel.is_im),
            isGroup: !channel.is_im,
            isBroadcast:
              Boolean(channel.is_channel) &&
              selectedConversation.scope === "channel" &&
              !Number(channel.unread_count || 0),
            unreadCount: Number(channel.unread_count || 0),
            participantLabel,
            recentMentionOfCurrentUser: messages.some(
              (message) =>
                message.mentionedCurrentUser ||
                message.addressedToCurrentUser ||
                message.inReplyToCurrentUser
            ),
          },
          platformMetadata: {
            channelType: channel.is_im ? "dm" : channel.is_mpim ? "group" : "channel",
            unreadCount: Number(channel.unread_count || 0),
            threadTs: selectedConversation.threadTs || null,
          },
          openContext: {
            channelId: channel.id,
            threadTs: selectedConversation.threadTs || null,
          },
          messages,
        };
      } catch {
        return null;
      }
    })
  );

  return normalized
    .filter(Boolean)
    .map((conversation) => classifyConversation(conversation))
    .filter(Boolean)
    .map((state) => ({
      ...state,
      ...buildSourceBadge("slack"),
    }));
}

async function fetchTelegramStates(userId) {
  const integration = await Integration.findOne({
    userId,
    type: "telegram",
    enabled: true,
  });
  if (!integration?.telegram?.sessionString) return [];

  const me = await tg.getMe(userId).catch(() => null);
  if (!me) return [];

  const dialogs = await tg.getDialogs(userId, 80).catch(() => []);
  const candidates = dialogs
    .filter(
      (dialog) =>
        dialog.type === "user" ||
        dialog.type === "group" ||
        Number(dialog.unreadCount || 0) > 0
    )
    .sort((a, b) => {
      if (a.type === "user" && b.type !== "user") return -1;
      if (b.type === "user" && a.type !== "user") return 1;
      return Number(b.unreadCount || 0) - Number(a.unreadCount || 0);
    })
    .slice(0, SOURCE_THRESHOLDS.telegram.maxConversations);

  const currentUserHandles = [
    me.username ? `@${me.username}` : "",
    me.username || "",
    [me.firstName, me.lastName].filter(Boolean).join(" "),
    me.firstName || "",
  ].filter(Boolean);

  const conversations = await Promise.all(
    candidates.map(async (dialog) => {
      try {
        const messages = await tg.getMessages(
          userId,
          dialog.id,
          SOURCE_THRESHOLDS.telegram.messageLimit
        );
        const outboundIds = new Set(
          messages.filter((message) => message.fromMe).map((message) => String(message.id))
        );
        const normalizedMessages = messages.map((message) => {
          const text = normalizeText(message.text || "");
          const mentionedCurrentUser =
            containsNameMention(text, currentUserHandles) ||
            (me.username ? normalizeLower(text).includes(`@${String(me.username).toLowerCase()}`) : false);
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
          previewText: dialog.lastMessage || normalizedMessages[normalizedMessages.length - 1]?.text || "",
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
      } catch {
        return null;
      }
    })
  );

  return conversations
    .filter(Boolean)
    .map((conversation) => classifyConversation(conversation))
    .filter(Boolean)
    .map((state) => ({
      ...state,
      ...buildSourceBadge("telegram"),
    }));
}

async function fetchWhatsAppStates(userId) {
  const integration = await Integration.findOne({
    userId,
    type: "whatsapp",
    enabled: true,
  });
  if (!integration?.whatsapp?.connected) return [];

  const entry = await getOrCreateClient(userId).catch(() => null);
  if (!entry?.client || entry.status !== "connected") return [];

  const chats = await entry.client.getChats();
  const candidates = chats
    .filter((chat) => !chat.isArchived)
    .sort((a, b) => {
      if (Boolean(b.isGroup) !== Boolean(a.isGroup)) return Number(a.isGroup) - Number(b.isGroup);
      return Number(b.unreadCount || 0) - Number(a.unreadCount || 0);
    })
    .slice(0, SOURCE_THRESHOLDS.whatsapp.maxConversations);

  const conversations = await Promise.all(
    candidates.map(async (chat) => {
      try {
        const messages = await chat.fetchMessages({
          limit: SOURCE_THRESHOLDS.whatsapp.messageLimit,
        });
        const normalizedMessages = messages.map((message) => ({
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
        }));

        return {
          sourceType: "whatsapp",
          conversationId: chat.id._serialized,
          threadId: null,
          conversationTitle: chat.name,
          participantLabel: chat.name,
          previewText:
            normalizeText(chat.lastMessage?.body || "") ||
            normalizedMessages[normalizedMessages.length - 1]?.text ||
            "",
          sourceMetadata: {
            isDirect: !chat.isGroup,
            isGroup: Boolean(chat.isGroup),
            isBroadcast: Boolean(chat.isReadOnly),
            unreadCount: Number(chat.unreadCount || 0),
            participantLabel: chat.name,
          },
          platformMetadata: {
            isGroup: Boolean(chat.isGroup),
            unreadCount: Number(chat.unreadCount || 0),
          },
          openContext: {
            chatId: chat.id._serialized,
          },
          messages: normalizedMessages,
        };
      } catch {
        return null;
      }
    })
  );

  return conversations
    .filter(Boolean)
    .map((conversation) => classifyConversation(conversation))
    .filter(Boolean)
    .map((state) => ({
      ...state,
      ...buildSourceBadge("whatsapp"),
    }));
}

async function fetchStatesForSource(sourceType, userId) {
  switch (sourceType) {
    case "gmail":
      return fetchGmailStates(userId);
    case "slack":
      return fetchSlackStates(userId);
    case "telegram":
      return fetchTelegramStates(userId);
    case "whatsapp":
      return fetchWhatsAppStates(userId);
    default:
      return [];
  }
}

function dedupeStates(states = []) {
  const seen = new Set();
  return states.filter((state) => {
    if (!state?.id || seen.has(state.id)) return false;
    seen.add(state.id);
    return true;
  });
}

async function getCommunicationActionStates(userId, options = {}) {
  const source = options.source || "all";
  const sources =
    source === "all"
      ? ["gmail", "slack", "telegram", "whatsapp"]
      : [source].filter(Boolean);

  const [results, latestActionsByItem] = await Promise.all([
    Promise.allSettled(sources.map((sourceType) => fetchStatesForSource(sourceType, userId))),
    getLatestActionsByItem(userId),
  ]);

  const states = dedupeStates(
    results.flatMap((result) =>
      result.status === "fulfilled" ? result.value || [] : []
    )
  );
  const visibleStates = sortStates(filterSuppressedStates(states, latestActionsByItem));
  const activeStates = sortStates(filterSurfaceStates(visibleStates));
  const summary = summarizeActionStates(activeStates);

  return {
    generatedAt: new Date().toISOString(),
    source,
    sources,
    states: activeStates,
    allStates: visibleStates,
    groups: buildActionGroups(activeStates),
    counts: summary,
    summaryText:
      source === "all"
        ? summarizeAllSources(activeStates, summary)
        : summarizeSource(source, summary),
  };
}

function summarizeAllSources(states = [], summary) {
  if (!summary.actionableCount) {
    return "No cross-app conversations are currently waiting on you.";
  }

  const sourceCounts = states.reduce((acc, state) => {
    acc[state.sourceType] = (acc[state.sourceType] || 0) + 1;
    return acc;
  }, {});

  const sources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([sourceType, count]) => `${getAppMeta(sourceType).label} ${count}`)
    .slice(0, 3)
    .join(" · ");

  const parts = [];
  if (summary.replyRequiredCount) {
    parts.push(`${summary.replyRequiredCount} waiting on your reply`);
  }
  if (summary.approvalCount) {
    parts.push(`${summary.approvalCount} approval${summary.approvalCount === 1 ? "" : "s"}`);
  }
  if (summary.followUpCount) {
    parts.push(`${summary.followUpCount} follow-up${summary.followUpCount === 1 ? "" : "s"}`);
  }

  return `${parts.join(" · ")} across ${sources}.`;
}

function buildCommunicationSuggestedAction(state) {
  if (state.actionState === ACTION_STATES.NEEDS_APPROVAL) {
    return "Open the conversation and make the approval decision while the context is fresh.";
  }
  if (state.actionState === ACTION_STATES.WAITING_ON_YOUR_REPLY) {
    return "Open the conversation and send the reply while the ask is still fresh.";
  }
  if (state.actionState === ACTION_STATES.NEEDS_FOLLOW_UP) {
    return "Re-open the conversation and send a concrete follow-up so it stops lingering.";
  }
  if (state.actionState === ACTION_STATES.WAITING_ON_OTHERS) {
    return "Review the latest context and decide whether any escalation is needed.";
  }
  return "Review the thread if you want more context.";
}

function buildCommunicationPrompt(state) {
  const sourceLabel = getAppMeta(state.sourceType).label;
  const conversationTitle = normalizeText(state.conversationTitle || "conversation");
  const participantLabel = normalizeText(state.participantLabel || "");
  const latestMessage = normalizeText(state.previewText || "");
  const reason = normalizeText(state.actionReason || "Tell me what needs action.");
  const contextLines = [
    `You are drafting a reply for me to send in a ${sourceLabel} conversation.`,
    `Conversation: "${conversationTitle}".`,
    participantLabel && participantLabel !== conversationTitle
      ? `Other participant: ${participantLabel}.`
      : "",
    latestMessage ? `Latest message: "${latestMessage}".` : "",
    `Why this needs attention: ${reason}`,
  ].filter(Boolean);

  if (state.actionState === ACTION_STATES.NEEDS_APPROVAL) {
    return [
      ...contextLines,
      "",
      "Write the exact approval or decline reply I should send next.",
      "Return ONLY the reply text.",
      "Do NOT explain the ask, add commentary, use placeholders, brackets, or template language.",
      "Do NOT send the message or call any tools.",
    ].join("\n");
  }

  if (
    state.actionState === ACTION_STATES.WAITING_ON_YOUR_REPLY ||
    state.actionState === ACTION_STATES.NEEDS_FOLLOW_UP
  ) {
    return [
      ...contextLines,
      "",
      "Write the exact reply text I should send next.",
      latestMessage
        ? "If the latest message is vague, ask one short clarifying question instead of inventing details."
        : "If context is limited, draft a short clarifying reply that politely asks what they need.",
      "Return ONLY the reply text.",
      "Do NOT explain the ask, add commentary, use placeholders, brackets, or template language.",
      "Do NOT send the message or call any tools.",
    ].join("\n");
  }

  return [
    ...contextLines,
    "",
    "Summarize the latest status in one or two short sentences.",
    "Then say whether I should do anything next.",
    "Do NOT send the message or call any tools.",
  ].join("\n");
}

function mapActionStateToPriorityItem(state) {
  const priorityScore = clamp(24 + Number(state.priorityBoost || 0), 0, 99);
  const priority = toPriorityLevel(priorityScore);
  const module = getAppMeta(state.sourceType).module;

  const baseContext = {
    focus: "reply-required",
    ...state.openContext,
  };

  const actionLabel =
    state.actionState === ACTION_STATES.WAITING_ON_OTHERS
      ? "Open conversation"
      : "Draft reply";

  return {
    id: state.id,
    title: state.conversationTitle,
    category: "communication",
    actionState: state.actionState,
    actionStateLabel: state.actionStateLabel,
    priority,
    priorityScore,
    reason: state.actionReason,
    whyThisMatters: `${state.sourceLabel} · ${state.participantLabel || "Conversation"} · confidence ${state.confidenceBand}.`,
    suggestedNextAction: buildCommunicationSuggestedAction(state),
    action:
      state.actionState === ACTION_STATES.WAITING_ON_OTHERS
        ? createModuleAction("Open conversation", module, baseContext)
        : createPromptAction({
            label: actionLabel,
            prompt: buildCommunicationPrompt(state),
            mode: "chat",
          }),
    secondaryAction: createModuleAction("Open conversation", module, baseContext),
    canClearQuickly:
      state.actionState !== ACTION_STATES.WAITING_ON_OTHERS &&
      state.confidenceBand !== "low",
    needsAttentionSoon:
      state.actionState === ACTION_STATES.WAITING_ON_YOUR_REPLY ||
      state.actionState === ACTION_STATES.NEEDS_APPROVAL,
    meta: {
      latestMessageAt: state.latestMessageTimestamp
        ? new Date(state.latestMessageTimestamp).toISOString()
        : null,
      latestInboundAt: state.latestInboundTimestamp
        ? new Date(state.latestInboundTimestamp).toISOString()
        : null,
      conversationId: state.conversationId,
      threadId: state.threadId || null,
      confidence: state.confidence,
      confidenceBand: state.confidenceBand,
      participantLabel: state.participantLabel || "",
      previewText: state.previewText || "",
      actionState: state.actionState,
      openContext: state.openContext || {},
    },
    ...buildSourceBadge(state.sourceType),
  };
}

async function getCommunicationPriorityItems(userId) {
  const result = await getCommunicationActionStates(userId, { source: "all" });
  return result.states
    .filter((state) => state.actionState !== ACTION_STATES.NO_ACTION_NEEDED)
    .map(mapActionStateToPriorityItem)
    .slice(0, 12);
}

module.exports = {
  ACTION_STATES,
  ACTION_STATE_META,
  getCommunicationActionStates,
  getCommunicationPriorityItems,
  mapActionStateToPriorityItem,
  __test: {
    filterSurfaceStates,
    buildGmailThreadHaystack,
    getNormalizedGmailMessageText,
    normalizeGmailThread,
    normalizeSlackMessages,
    pickSlackConversationMessages,
  },
};
