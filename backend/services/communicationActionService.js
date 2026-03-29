"use strict";

const axios = require("axios");
const Integration = require("../models/Integration");
const PriorityFeedAction = require("../models/PriorityFeedAction");
const { getGmailClient } = require("./workspaceSignalsService");
const { chatCompleteNoSystem } = require("./llmService");
const tg = require("./tools/toolTelegramMTProto");
const { getOrCreateClient } = require("./tools/toolWhatsapp");
const {
  ACTION_STATES,
  ACTION_STATE_META,
  classifyConversation,
  classifyConversationWithSemantics,
  selectStatesForSurface,
  summarizeActionStates,
  normalizeText,
  toTimestamp,
  clamp,
} = require("./conversationStateEngine");
const { SOURCE_THRESHOLDS } = require("./communicationActionConfig");
const conversationSourceAdapters = require("./conversationSourceAdapters");

const APP_META = {
  gmail: { label: "Gmail", icon: "📧", module: "gmail" },
  slack: { label: "Slack", icon: "💬", module: "slack" },
  telegram: { label: "Telegram", icon: "✈️", module: "telegram" },
  whatsapp: { label: "WhatsApp", icon: "🟢", module: "whatsapp" },
};

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

function filterSurfaceStates(states = []) {
  return selectStatesForSurface(states, "insights");
}

function filterBriefingStates(states = []) {
  return selectStatesForSurface(states, "briefing");
}

function filterPriorityFeedStates(states = []) {
  return selectStatesForSurface(states, "priorityFeed");
}

function hasPriorityLLMConfig() {
  return Boolean(
    process.env.OPENAI_BASE_URL &&
      process.env.OPENAI_API_KEY &&
      process.env.API_VERSION
  );
}

function shouldEnableSemanticInterpreter(options = {}) {
  if (typeof options.enableSemanticLLM === "boolean") {
    return options.enableSemanticLLM;
  }
  return String(process.env.ORION_CONVERSATION_STATE_LLM || "").toLowerCase() === "enabled";
}

function shouldEnablePriorityInterpreter(options = {}) {
  if (typeof options.priorityInterpreter === "function") {
    return true;
  }
  if (typeof options.enablePriorityLLM === "boolean") {
    return options.enablePriorityLLM;
  }
  if (String(process.env.ORION_PRIORITY_LLM || "").toLowerCase() === "disabled") {
    return false;
  }
  return hasPriorityLLMConfig();
}

function extractJsonObject(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {}
  }

  return null;
}

function normalizePriorityScore(score, label = "") {
  const numeric = Number(score);
  if (Number.isFinite(numeric)) {
    return clamp(Math.round(numeric), 0, 99);
  }

  if (label === "High") return 85;
  if (label === "Medium") return 58;
  return 22;
}

function normalizePriorityLabel(value = "", fallback = "Medium") {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";
  return fallback;
}

function buildPriorityClassificationPrompt(states = []) {
  return [
    "Classify the work priority of each conversation for OrionAI.",
    "Return JSON only.",
    'Use this exact shape: {"items":[{"id":"string","priority":"High|Medium|Low","score":0,"reason":"short reason"}]}',
    "",
    "Priority rules:",
    "- High: urgent, time-sensitive, blocker, repeated follow-up, approval needed soon, financial/ops risk, or clear deadline pressure.",
    "- Medium: normal work request or reply needed, but not urgent.",
    "- Low: introductions, greetings, casual chat, social questions, vague small talk, or no clear work urgency.",
    '- A message like "My name is arti and your?" must be Low.',
    "- If unsure, choose the lower priority.",
    "",
    ...states.map((state, index) =>
      [
        `${index + 1}. id: ${state.id}`,
        `source: ${state.sourceLabel || getAppMeta(state.sourceType).label}`,
        `action_state: ${state.actionStateLabel || state.actionState}`,
        `conversation: ${normalizeText(state.conversationTitle || state.participantLabel || "Conversation")}`,
        `latest_message: """${normalizeText(state.previewText || "") || "(none)"}"""`,
        `reason: ${normalizeText(state.actionReason || "") || "(none)"}`,
        `confidence: ${state.confidenceBand || "unknown"}`,
      ].join("\n")
    ),
  ].join("\n");
}

async function defaultPriorityInterpreter(states = [], options = {}) {
  const prompt = buildPriorityClassificationPrompt(states);
  const raw = await chatCompleteNoSystem(
    prompt,
    options.priorityMaxTokens || Math.min(1400, 220 + states.length * 90),
    0.1
  );
  const parsed = extractJsonObject(raw);
  if (!parsed) {
    throw new Error("Could not parse priority interpreter response");
  }

  const items = Array.isArray(parsed?.items)
    ? parsed.items
    : Array.isArray(parsed)
      ? parsed
      : [];

  return items
    .map((item) => {
      const priority = normalizePriorityLabel(item?.priority, "");
      if (!item?.id || !priority) return null;
      return {
        id: String(item.id),
        priority,
        priorityScore: normalizePriorityScore(item?.score, priority),
        priorityReason: normalizeText(item?.reason || ""),
        prioritySource: "llm",
      };
    })
    .filter(Boolean);
}

async function applyPriorityLabels(states = [], options = {}) {
  const actionableStates = states.filter(
    (state) =>
      state.actionState !== ACTION_STATES.NO_ACTION_NEEDED &&
      state.actionState !== ACTION_STATES.RESOLVED
  );

  if (!actionableStates.length || !shouldEnablePriorityInterpreter(options)) {
    return states;
  }

  const interpreter =
    typeof options.priorityInterpreter === "function"
      ? options.priorityInterpreter
      : defaultPriorityInterpreter;

  try {
    const classifications = await interpreter(
      actionableStates.slice(0, options.priorityStateLimit || 12),
      options
    );
    const byId = new Map(
      (classifications || [])
        .filter((item) => item?.id)
        .map((item) => [String(item.id), item])
    );

    if (!byId.size) return states;

    return states.map((state) => {
      const classification = byId.get(String(state.id));
      if (!classification) return state;
      return {
        ...state,
        priority: classification.priority,
        priorityScore: classification.priorityScore,
        priorityReason: classification.priorityReason || "",
        prioritySource: classification.prioritySource || "llm",
      };
    });
  } catch (err) {
    if (options.includeDebug || process.env.NODE_ENV !== "production") {
      console.debug("[communication-priority] LLM fallback:", err.message);
    }
    return states;
  }
}

async function classifyNormalizedConversation(conversation, options = {}) {
  if (!conversation) return null;

  if (shouldEnableSemanticInterpreter(options) || typeof options.semanticInterpreter === "function") {
    return classifyConversationWithSemantics(conversation, options);
  }

  return classifyConversation(conversation, options);
}

function maybeLogStateDebug(states = [], options = {}) {
  const debugEnabled =
    options.includeDebug ||
    process.env.ORION_CONVERSATION_STATE_DEBUG === "1";

  if (!debugEnabled) return;

  console.debug(
    "[conversation-state]",
    states.map((state) => state.debug || {
      source: state.sourceType,
      conversationId: state.conversationId,
      computedState: state.state,
      currentActor: state.currentActor,
      reason: state.actionReason,
      confidence: state.confidence,
    })
  );
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
    const aPriority = Number.isFinite(Number(a.priorityScore))
      ? Number(a.priorityScore)
      : Number(a.priorityBoost || 0);
    const bPriority = Number.isFinite(Number(b.priorityScore))
      ? Number(b.priorityScore)
      : Number(b.priorityBoost || 0);

    if (bPriority !== aPriority) {
      return bPriority - aPriority;
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
  const conversations = details
    .filter(Boolean)
    .map((thread) => conversationSourceAdapters.normalizeGmailThread(thread, selfEmail))
    .filter(Boolean);

  const states = await Promise.all(
    conversations.map((conversation) => classifyNormalizedConversation(conversation, options))
  );

  return states
    .filter(Boolean)
    .map((state) => ({
      ...state,
      ...buildSourceBadge("gmail"),
    }));
}

async function fetchSlackStates(userId, options = {}) {
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

        const selectedConversation = conversationSourceAdapters.pickSlackConversationMessages({
          channel,
          historyMessages,
          threadMessagesByRoot,
          currentUser,
        });
        const messages = conversationSourceAdapters.normalizeSlackMessages(
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

  const states = await Promise.all(
    normalized
      .filter(Boolean)
      .map((conversation) => classifyNormalizedConversation(conversation, options))
  );

  return states
    .filter(Boolean)
    .map((state) => ({
      ...state,
      ...buildSourceBadge("slack"),
    }));
}

async function fetchTelegramStates(userId, options = {}) {
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

  const conversations = await Promise.all(
    candidates.map(async (dialog) => {
      try {
        const messages = await tg.getMessages(
          userId,
          dialog.id,
          SOURCE_THRESHOLDS.telegram.messageLimit
        );
        return conversationSourceAdapters.normalizeTelegramConversation(
          dialog,
          messages,
          me
        );
      } catch {
        return null;
      }
    })
  );

  const states = await Promise.all(
    conversations
      .filter(Boolean)
      .map((conversation) => classifyNormalizedConversation(conversation, options))
  );

  return states
    .filter(Boolean)
    .map((state) => ({
      ...state,
      ...buildSourceBadge("telegram"),
    }));
}

async function fetchWhatsAppStates(userId, options = {}) {
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
        return conversationSourceAdapters.normalizeWhatsAppConversation(
          chat,
          messages
        );
      } catch {
        return null;
      }
    })
  );

  const states = await Promise.all(
    conversations
      .filter(Boolean)
      .map((conversation) => classifyNormalizedConversation(conversation, options))
  );

  return states
    .filter(Boolean)
    .map((state) => ({
      ...state,
      ...buildSourceBadge("whatsapp"),
    }));
}

async function fetchStatesForSource(sourceType, userId, options = {}) {
  switch (sourceType) {
    case "gmail":
      return fetchGmailStates(userId, options);
    case "slack":
      return fetchSlackStates(userId, options);
    case "telegram":
      return fetchTelegramStates(userId, options);
    case "whatsapp":
      return fetchWhatsAppStates(userId, options);
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
    Promise.allSettled(
      sources.map((sourceType) => fetchStatesForSource(sourceType, userId, options))
    ),
    getLatestActionsByItem(userId),
  ]);

  const states = dedupeStates(
    results.flatMap((result) =>
      result.status === "fulfilled" ? result.value || [] : []
    )
  );
  const visibleBaseStates = filterSuppressedStates(states, latestActionsByItem);
  const visibleStates = sortStates(
    await applyPriorityLabels(visibleBaseStates, options)
  );
  const insightsStates = sortStates(filterSurfaceStates(visibleStates));
  const briefingStates = sortStates(filterBriefingStates(visibleStates));
  const priorityFeedStates = sortStates(filterPriorityFeedStates(visibleStates));
  const summary = summarizeActionStates(visibleStates);
  maybeLogStateDebug(visibleStates, options);

  return {
    generatedAt: new Date().toISOString(),
    source,
    sources,
    states: insightsStates,
    allStates: visibleStates,
    surfaceStates: {
      insights: insightsStates,
      briefing: briefingStates,
      priorityFeed: priorityFeedStates,
    },
    groups: buildActionGroups(insightsStates),
    counts: summary,
    stateCounts: summary.stateCounts,
    summaryText:
      source === "all"
        ? summarizeAllSources(insightsStates, summary)
        : summarizeSource(source, summary),
    debug:
      options.includeDebug || process.env.ORION_CONVERSATION_STATE_DEBUG === "1"
        ? {
            enabled: true,
            statesInspected: visibleStates.length,
          }
        : undefined,
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
  const priorityScore = Number.isFinite(Number(state.priorityScore))
    ? clamp(Number(state.priorityScore), 0, 99)
    : clamp(24 + Number(state.priorityBoost || 0), 0, 99);
  const priority = state.priority || toPriorityLevel(priorityScore);
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
    state: state.state,
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
      currentActor: state.currentActor,
      participantLabel: state.participantLabel || "",
      previewText: state.previewText || "",
      actionState: state.actionState,
      state: state.state,
      openContext: state.openContext || {},
      debug: state.debug || null,
      prioritySource: state.prioritySource || "rules",
      priorityReason: state.priorityReason || "",
    },
    ...buildSourceBadge(state.sourceType),
  };
}

function buildCommunicationPriorityItems(states = []) {
  return states
    .filter(
      (state) =>
        state.actionState !== ACTION_STATES.NO_ACTION_NEEDED &&
        state.actionState !== ACTION_STATES.RESOLVED
    )
    .map(mapActionStateToPriorityItem)
    .slice(0, 12);
}

async function getCommunicationPriorityItems(userId, options = {}) {
  const result = await getCommunicationActionStates(userId, {
    source: "all",
    ...options,
  });
  return buildCommunicationPriorityItems(result.surfaceStates.priorityFeed);
}

module.exports = {
  ACTION_STATES,
  ACTION_STATE_META,
  getCommunicationActionStates,
  buildCommunicationPriorityItems,
  getCommunicationPriorityItems,
  mapActionStateToPriorityItem,
  __test: {
    filterSurfaceStates,
    filterBriefingStates,
    filterPriorityFeedStates,
    buildGmailThreadHaystack: conversationSourceAdapters.buildGmailThreadHaystack,
    getNormalizedGmailMessageText: conversationSourceAdapters.getNormalizedGmailMessageText,
    normalizeGmailThread: conversationSourceAdapters.normalizeGmailThread,
    normalizeSlackMessages: conversationSourceAdapters.normalizeSlackMessages,
    pickSlackConversationMessages: conversationSourceAdapters.pickSlackConversationMessages,
    buildPriorityClassificationPrompt,
    applyPriorityLabels,
  },
};
