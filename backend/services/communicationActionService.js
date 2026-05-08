"use strict";

const axios = require("axios");
const Integration = require("../models/Integration");
const PriorityFeedAction = require("../models/PriorityFeedAction");
const { getGmailClient } = require("./workspaceSignalsService");
const { chatCompleteNoSystem } = require("./llmService");
const tg = require("./tools/toolTelegramMTProto");
const {
  listSignalRooms,
  getSignalRoomTimeline,
} = require("./signalMatrixService");
const {
  listWhatsAppChats,
  getWhatsAppRoomTimeline,
} = require("./whatsappMatrixService");
const {
  getSignalConnectionState,
  getWhatsAppConnectionState,
} = require("./integrationConnectionState");
const {
  ACTION_STATES,
  ACTION_STATE_META,
  buildSurfaceEligibility,
  classifyConversation,
  classifyConversationWithSemantics,
  selectStatesForSurface,
  summarizeActionStates,
  normalizeText,
  toTimestamp,
  toConversationState,
  clamp,
} = require("./conversationStateEngine");
const { SOURCE_THRESHOLDS } = require("./communicationActionConfig");
const conversationSourceAdapters = require("./conversationSourceAdapters");
const {
  buildCanonicalConversationKey,
  getQuickActionsForState,
  QUICK_ACTIONS,
} = require("./conversationActionStateMachine");

const APP_META = {
  gmail: { label: "Gmail", icon: "📧", module: "gmail" },
  slack: { label: "Slack", icon: "💬", module: "slack" },
  telegram: { label: "Telegram", icon: "✈️", module: "telegram" },
  signal: { label: "Signal", icon: "🛡️", module: "signal" },
  whatsapp: { label: "WhatsApp", icon: "🟢", module: "whatsapp" },
};

const WORKSPACE_ACTIONABLE_STATES = new Set([
  ACTION_STATES.WAITING_ON_YOUR_REPLY,
  ACTION_STATES.NEEDS_APPROVAL,
  ACTION_STATES.NEEDS_FOLLOW_UP,
  ACTION_STATES.WAITING_ON_OTHERS,
]);
const PRIORITY_FEED_LIVE_CHAT_SOURCES = new Set([
  "slack",
  "telegram",
  "signal",
  "whatsapp",
]);
const WORKSPACE_DECISION_CACHE = new Map();
const WORKSPACE_DECISION_CACHE_TTL_MS = 5 * 60 * 1000;
const WORKSPACE_DECISION_CACHE_LIMIT = 400;

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

function getStateUnreadCount(state = {}) {
  return Math.max(
    Number(
      state?.sourceMetadata?.unreadCount || state?.platformMetadata?.unreadCount || 0
    ) || 0,
    0
  );
}

function shouldKeepUnreadTrackedState(state = {}) {
  const sourceType = String(state?.sourceType || "").toLowerCase();
  if (!PRIORITY_FEED_LIVE_CHAT_SOURCES.has(sourceType)) {
    return true;
  }
  return getStateUnreadCount(state) > 0;
}

function filterSurfaceStates(states = []) {
  return selectStatesForSurface(states, "insights").filter(
    shouldKeepUnreadTrackedState
  );
}

function filterBriefingStates(states = []) {
  return selectStatesForSurface(states, "briefing");
}

function filterPriorityFeedStates(states = []) {
  return selectStatesForSurface(states, "priorityFeed").filter(
    shouldKeepUnreadTrackedState
  );
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

function shouldEnableWorkspaceInterpreter(options = {}) {
  if (typeof options.workspaceInterpreter === "function") {
    return true;
  }
  if (typeof options.enableWorkspaceLLM === "boolean") {
    return options.enableWorkspaceLLM;
  }
  if (
    String(process.env.ORION_WORKSPACE_DECISION_LLM || "").toLowerCase() ===
    "disabled"
  ) {
    return false;
  }
  return hasPriorityLLMConfig();
}

function normalizeActionStateValue(value = "", fallback = "") {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (
    normalized === ACTION_STATES.WAITING_ON_YOUR_REPLY ||
    normalized === "waiting_on_you"
  ) {
    return ACTION_STATES.WAITING_ON_YOUR_REPLY;
  }
  if (normalized === ACTION_STATES.NEEDS_APPROVAL) {
    return ACTION_STATES.NEEDS_APPROVAL;
  }
  if (normalized === ACTION_STATES.NEEDS_FOLLOW_UP) {
    return ACTION_STATES.NEEDS_FOLLOW_UP;
  }
  if (normalized === ACTION_STATES.WAITING_ON_OTHERS) {
    return ACTION_STATES.WAITING_ON_OTHERS;
  }
  if (normalized === ACTION_STATES.RESOLVED) {
    return ACTION_STATES.RESOLVED;
  }
  if (normalized === ACTION_STATES.NO_ACTION_NEEDED) {
    return ACTION_STATES.NO_ACTION_NEEDED;
  }
  return fallback || "";
}

function summarizeDecisionText(value = "", maxLength = 200) {
  const text = normalizeText(value || "");
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function buildWorkspaceDecisionContext(conversation = {}) {
  const sortedMessages = [...(conversation.messages || [])]
    .map((message) => ({
      id: message?.id ?? null,
      direction: message?.direction || "unknown",
      timestamp: toTimestamp(message?.timestamp),
      text: summarizeDecisionText(message?.text || message?.previewText || "", 220),
    }))
    .filter((message) => message.timestamp && message.text)
    .sort((a, b) => a.timestamp - b.timestamp);

  const recentMessages = sortedMessages.slice(-4);
  const latestInbound = [...sortedMessages]
    .reverse()
    .find((message) => message.direction === "inbound");
  const latestOutbound = [...sortedMessages]
    .reverse()
    .find((message) => message.direction === "outbound");

  return {
    sourceType: conversation.sourceType,
    conversationTitle: summarizeDecisionText(
      conversation.conversationTitle || "Conversation",
      120
    ),
    participantLabel: summarizeDecisionText(
      conversation.participantLabel || "",
      120
    ),
    isDirect: Boolean(
      conversation.sourceMetadata?.isDirect ||
        conversation.sourceMetadata?.directRecipient
    ),
    latestInboundText: latestInbound?.text || "",
    latestOutboundText: latestOutbound?.text || "",
    recentMessages,
  };
}

function createWorkspaceDecisionFingerprint(state = {}) {
  const context = state.workspaceDecisionContext || {};
  return [
    state.id || "",
    state.actionState || "",
    state.latestMessageTimestamp || "",
    state.latestInboundTimestamp || "",
    state.latestOutboundTimestamp || "",
    summarizeDecisionText(state.previewText || "", 120),
    summarizeDecisionText(context.latestInboundText || "", 120),
    summarizeDecisionText(context.latestOutboundText || "", 120),
    (context.recentMessages || [])
      .map((message) => `${message.direction}:${message.timestamp}:${message.text}`)
      .join("|"),
  ].join("::");
}

function pruneWorkspaceDecisionCache(nowMs = Date.now()) {
  for (const [key, entry] of WORKSPACE_DECISION_CACHE.entries()) {
    if (!entry || entry.expiresAt <= nowMs) {
      WORKSPACE_DECISION_CACHE.delete(key);
    }
  }

  if (WORKSPACE_DECISION_CACHE.size <= WORKSPACE_DECISION_CACHE_LIMIT) {
    return;
  }

  const overflow = WORKSPACE_DECISION_CACHE.size - WORKSPACE_DECISION_CACHE_LIMIT;
  const keys = [...WORKSPACE_DECISION_CACHE.keys()].slice(0, overflow);
  for (const key of keys) {
    WORKSPACE_DECISION_CACHE.delete(key);
  }
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

function buildWorkspaceDecisionPrompt(states = []) {
  return [
    "Decide which communication threads should still appear in OrionAI WorkspaceBriefing right now.",
    "Return JSON only.",
    'Use this exact shape: {"items":[{"id":"string","actionState":"waiting_on_your_reply|needs_approval|needs_follow_up|waiting_on_others|resolved|no_action_needed","priority":"High|Medium|Low","score":0,"reason":"short reason"}]}',
    "",
    "Rules:",
    "- Read the recent message bodies and latest replies, not just the subject or thread title.",
    "- waiting_on_your_reply: the other person is still waiting for the current user's answer.",
    "- needs_approval: the unresolved ask specifically needs the current user's approval or sign-off.",
    "- needs_follow_up: the current user already replied, but that reply promises more work, says they will update later, or leaves the next step on the current user.",
    "- waiting_on_others: the current user already made the latest actionable move and the other side now owns the next step.",
    "- resolved or no_action_needed: the latest reply clearly answered, approved, closed, or finished the earlier ask. These should not stay in WorkspaceBriefing.",
    '- Example: "WFH approved for today" is resolved.',
    '- Example: "I will review and update shortly" is needs_follow_up.',
    "- Low priority: casual chat, introductions, social messages, or completed threads.",
    "- If unsure, choose the lower priority and prefer resolved/no_action_needed over keeping a completed thread open.",
    "",
    ...states.map((state, index) => {
      const context = state.workspaceDecisionContext || {};
      const transcript =
        (context.recentMessages || []).length > 0
          ? context.recentMessages
              .map(
                (message) =>
                  `- ${message.direction}: """${summarizeDecisionText(message.text || "", 220)}"""`
              )
              .join("\n")
          : "- (no recent message body captured)";

      return [
        `${index + 1}. id: ${state.id}`,
        `source: ${state.sourceLabel || getAppMeta(state.sourceType).label}`,
        `current_rule_state: ${state.actionState}`,
        `conversation: ${summarizeDecisionText(state.conversationTitle || state.participantLabel || "Conversation", 140)}`,
        context.participantLabel
          ? `other_party: ${summarizeDecisionText(context.participantLabel, 140)}`
          : "",
        `latest_message: """${summarizeDecisionText(state.previewText || "", 220) || "(none)"}"""`,
        context.latestInboundText
          ? `latest_inbound: """${summarizeDecisionText(context.latestInboundText, 220)}"""`
          : "",
        context.latestOutboundText
          ? `latest_outbound: """${summarizeDecisionText(context.latestOutboundText, 220)}"""`
          : "",
        `recent_messages:\n${transcript}`,
      ]
        .filter(Boolean)
        .join("\n");
    }),
  ].join("\n");
}

async function defaultWorkspaceInterpreter(states = [], options = {}) {
  const prompt = buildWorkspaceDecisionPrompt(states);
  const raw = await chatCompleteNoSystem(
    prompt,
    options.workspaceMaxTokens || Math.min(2200, 320 + states.length * 130),
    0.1
  );
  const parsed = extractJsonObject(raw);
  if (!parsed) {
    throw new Error("Could not parse workspace interpreter response");
  }

  const items = Array.isArray(parsed?.items)
    ? parsed.items
    : Array.isArray(parsed)
      ? parsed
      : [];

  return items
    .map((item) => {
      const actionState = normalizeActionStateValue(item?.actionState, "");
      const priority = normalizePriorityLabel(item?.priority, "");
      if (!item?.id || !actionState || !priority) return null;
      return {
        id: String(item.id),
        actionState,
        priority,
        priorityScore: normalizePriorityScore(item?.score, priority),
        reason: summarizeDecisionText(item?.reason || "", 180),
        decisionSource: "workspace_llm",
      };
    })
    .filter(Boolean);
}

function applyWorkspaceDecisionToState(state, decision) {
  if (!state || !decision) return state;

  const actionState = normalizeActionStateValue(
    decision.actionState,
    state.actionState
  );
  if (!actionState) return state;

  // Never let the LLM downgrade a high-signal item. If we somehow ended up
  // with a decision for one (cache from before the bypass landed, or a
  // future code path that calls this directly), keep the rules verdict.
  const isDowngrade =
    actionState === ACTION_STATES.RESOLVED ||
    actionState === ACTION_STATES.NO_ACTION_NEEDED;
  if (isDowngrade && isHighSignalState(state)) {
    return state;
  }

  const conversationState = toConversationState(actionState);
  const eligibility = buildSurfaceEligibility(conversationState);
  const nextPriority = normalizePriorityLabel(
    decision.priority,
    state.priority || toPriorityLevel(state.priorityScore)
  );
  const nextReason = summarizeDecisionText(
    decision.reason || state.actionReason || state.reason || "",
    180
  );

  return {
    ...state,
    state: conversationState,
    stateLabel: ACTION_STATE_META[actionState]?.label || state.stateLabel,
    actionState,
    actionStateLabel: ACTION_STATE_META[actionState]?.label || state.actionStateLabel,
    eligibleForInsights: eligibility.insights,
    eligibleForBriefing: eligibility.briefing,
    eligibleForPriorityFeed: eligibility.priorityFeed,
    surfaceEligibility: eligibility,
    surfaceEligible: eligibility.insights,
    reason: nextReason || state.reason,
    actionReason: nextReason || state.actionReason,
    priority: nextPriority,
    priorityScore: normalizePriorityScore(
      decision.priorityScore,
      nextPriority
    ),
    priorityReason: nextReason || state.priorityReason || "",
    prioritySource: decision.decisionSource || "workspace_llm",
    meta: {
      ...(state.meta || {}),
      actionState,
      state: conversationState,
      prioritySource: decision.decisionSource || "workspace_llm",
      priorityReason: nextReason || state.priorityReason || "",
      workspaceDecisionReason: nextReason || "",
    },
    ...(state.debug
      ? {
          debug: {
            ...state.debug,
            workspaceDecisionActionState: actionState,
            workspaceDecisionReason: nextReason || "",
            workspaceDecisionSource: decision.decisionSource || "workspace_llm",
          },
        }
      : {}),
  };
}

// High-signal items: the rules-based classifier strongly believes these
// require attention. The workspace LLM has a known bias to downgrade
// items toward "resolved/no_action_needed" when uncertain — for these
// items the LLM should NOT get a vote. Triggers:
//   - latest inbound is recent (≤ 60 minutes), AND
//   - one of: classifier confidenceBand "high", an explicit @-mention,
//     an urgency keyword, or a direct DM with an unanswered question.
function isHighSignalState(state = {}) {
  if (!state) return false;
  if (
    state.actionState !== ACTION_STATES.WAITING_ON_YOUR_REPLY &&
    state.actionState !== ACTION_STATES.NEEDS_APPROVAL
  ) {
    return false;
  }

  const latestInboundTs =
    Number(state.latestInboundTimestamp) ||
    Number(state.latestMessageTimestamp) ||
    0;
  if (!latestInboundTs) return false;
  const ageMinutes = (Date.now() - latestInboundTs) / 60000;
  if (ageMinutes > 60) return false;

  const debug = state.debug || {};
  const intentSignals = Array.isArray(debug.intentSignals)
    ? debug.intentSignals
    : [];

  const hasUrgency =
    intentSignals.includes("urgency") ||
    intentSignals.includes("semantic_urgency");
  const hasMention = Boolean(state.hasMentionOfCurrentUser);
  const isDirectAsk = Boolean(
    state.sourceMetadata?.isDirect &&
      (state.hasDirectQuestion || state.hasApprovalIntent)
  );
  const highConfidence = state.confidenceBand === "high";

  return hasUrgency || hasMention || (isDirectAsk && highConfidence);
}

async function applyWorkspaceDecisions(states = [], options = {}) {
  const candidates = sortStates(
    states.filter(
      (state) =>
        WORKSPACE_ACTIONABLE_STATES.has(state?.actionState) &&
        !isHighSignalState(state)
    )
  ).slice(0, options.workspaceStateLimit || 18);

  if (!candidates.length || !shouldEnableWorkspaceInterpreter(options)) {
    return states;
  }

  const interpreter =
    typeof options.workspaceInterpreter === "function"
      ? options.workspaceInterpreter
      : defaultWorkspaceInterpreter;

  const nowMs = Date.now();
  pruneWorkspaceDecisionCache(nowMs);

  const cachedDecisions = [];
  const uncachedCandidates = [];

  for (const state of candidates) {
    const cacheKey = createWorkspaceDecisionFingerprint(state);
    const cached = WORKSPACE_DECISION_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > nowMs) {
      cachedDecisions.push(cached.value);
      continue;
    }
    uncachedCandidates.push(state);
  }

  let freshDecisions = [];
  if (uncachedCandidates.length) {
    try {
      freshDecisions = await interpreter(uncachedCandidates, options);
      for (const decision of freshDecisions) {
        const state = uncachedCandidates.find(
          (candidate) => String(candidate.id) === String(decision.id)
        );
        if (!state) continue;
        WORKSPACE_DECISION_CACHE.set(createWorkspaceDecisionFingerprint(state), {
          value: decision,
          expiresAt: nowMs + WORKSPACE_DECISION_CACHE_TTL_MS,
        });
      }
      pruneWorkspaceDecisionCache(nowMs);
    } catch (err) {
      if (options.includeDebug || process.env.NODE_ENV !== "production") {
        console.debug("[communication-workspace] LLM fallback:", err.message);
      }
      return states;
    }
  }

  const byId = new Map(
    [...cachedDecisions, ...freshDecisions]
      .filter((decision) => decision?.id)
      .map((decision) => [String(decision.id), decision])
  );

  if (!byId.size) return states;

  return states.map((state) => {
    const decision = byId.get(String(state.id));
    if (!decision) return state;
    return applyWorkspaceDecisionToState(state, decision);
  });
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
      state.actionState !== ACTION_STATES.RESOLVED &&
      String(state.prioritySource || "").toLowerCase() !== "workspace_llm"
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

  if (!debugEnabled || !Array.isArray(states) || states.length === 0) return;

  // console.debug(
  //   "[conversation-state]",
  //   states.map((state) => state.debug || {
  //     source: state.sourceType,
  //     conversationId: state.conversationId,
  //     computedState: state.state,
  //     currentActor: state.currentActor,
  //     reason: state.actionReason,
  //     confidence: state.confidence,
  //   })
  // );
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
    // Reclassify keeps the item visible so the override can be applied later.
    // Without this branch, a reclassified item would silently disappear because
    // the historical fall-through treats every non-snooze action as suppress.
    if (latestAction.action === "reclassified") return true;
    if (latestAction.action === "snoozed") {
      return !latestAction.snoozedUntil || new Date(latestAction.snoozedUntil).getTime() <= now;
    }
    return false;
  });
}

function applyReclassifyToState(state, latestAction) {
  if (!state || !latestAction) return state;
  const targetActionState = normalizeActionStateValue(
    latestAction.toActionState,
    ""
  );
  if (!targetActionState) return state;

  const conversationState = toConversationState(targetActionState);
  const eligibility = buildSurfaceEligibility(conversationState);
  const stateLabel =
    ACTION_STATE_META[targetActionState]?.label || state.actionStateLabel;
  const reason =
    String(latestAction.reason || "").trim() ||
    `Reclassified by user as ${stateLabel}.`;

  return {
    ...state,
    state: conversationState,
    stateLabel,
    actionState: targetActionState,
    actionStateLabel: stateLabel,
    eligibleForInsights: eligibility.insights,
    eligibleForBriefing: eligibility.briefing,
    eligibleForPriorityFeed: eligibility.priorityFeed,
    surfaceEligibility: eligibility,
    surfaceEligible: eligibility.insights,
    actionReason: reason,
    reason,
    prioritySource: "user_reclassify",
    priorityReason: reason,
    meta: {
      ...(state.meta || {}),
      actionState: targetActionState,
      state: conversationState,
      reclassifiedByUser: true,
      reclassifiedAt: latestAction.createdAt
        ? new Date(latestAction.createdAt).toISOString()
        : null,
      prioritySource: "user_reclassify",
      priorityReason: reason,
    },
    ...(state.debug
      ? {
          debug: {
            ...state.debug,
            userReclassifyActionState: targetActionState,
            userReclassifyReason: reason,
            userReclassifySource: "user",
          },
        }
      : {}),
  };
}

function applyUserReclassifications(states = [], latestActionsByItem = new Map()) {
  if (!latestActionsByItem || latestActionsByItem.size === 0) return states;

  return states.map((state) => {
    const latestAction = latestActionsByItem.get(state.id);
    if (!latestAction) return state;
    if (latestAction.action !== "reclassified") return state;
    // A new inbound message after the reclassify resets to the classifier's verdict,
    // mirroring the reactivation semantics in filterSuppressedStates.
    if (isReactivatedSinceAction(state, latestAction)) return state;
    return applyReclassifyToState(state, latestAction);
  });
}

async function classifyConversationBatch(conversations = [], sourceType, options = {}) {
  const entries = await Promise.all(
    conversations.filter(Boolean).map(async (conversation) => {
      const state = await classifyNormalizedConversation(conversation, options);
      if (!state) return null;
      return {
        ...state,
        workspaceDecisionContext: buildWorkspaceDecisionContext(conversation),
        ...buildSourceBadge(sourceType),
      };
    })
  );

  return entries.filter(Boolean);
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

  return classifyConversationBatch(conversations, "gmail", options);
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

  return classifyConversationBatch(normalized.filter(Boolean), "slack", options);
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

  return classifyConversationBatch(conversations.filter(Boolean), "telegram", options);
}

async function fetchWhatsAppStates(userId, options = {}) {
  const integration = await Integration.findOne({
    userId,
    type: "whatsapp",
    enabled: true,
  });
  const whatsappState = getWhatsAppConnectionState(integration);
  if (!whatsappState.isConnected) return [];

  const chats = await listWhatsAppChats(userId, { limit: 80 }).catch(() => []);
  const candidates = chats
    .filter(
      (chat) =>
        !chat.isArchived &&
        (!chat.isGroup || Number(chat.unreadCount || 0) > 0 || !options.unreadOnly)
    )
    .sort((a, b) => {
      if (Boolean(b.isGroup) !== Boolean(a.isGroup)) {
        return Number(a.isGroup) - Number(b.isGroup);
      }
      return Number(b.unreadCount || 0) - Number(a.unreadCount || 0);
    })
    .slice(0, SOURCE_THRESHOLDS.whatsapp.maxConversations);

  const conversations = await Promise.all(
    candidates.map(async (chat) => {
      try {
        const timeline = await getWhatsAppRoomTimeline(userId, chat.roomId || chat.id, {
          limit: SOURCE_THRESHOLDS.whatsapp.messageLimit,
        });
        return conversationSourceAdapters.normalizeWhatsAppConversation(
          chat,
          timeline.messages || []
        );
      } catch {
        return null;
      }
    })
  );

  return classifyConversationBatch(conversations.filter(Boolean), "whatsapp", options);
}

async function fetchSignalStates(userId, options = {}) {
  const integration = await Integration.findOne({
    userId,
    type: "signal",
    enabled: true,
  });
  const signalState = getSignalConnectionState(integration);
  if (!signalState.isConnected) return [];

  const rooms = await listSignalRooms(userId, { limit: 80 }).catch(() => []);
  const candidates = rooms
    .filter(
      (room) =>
        room.isDirect ||
        room.isGroup ||
        Number(room.unreadCount || 0) > 0
    )
    .sort((a, b) => {
      if (Boolean(a.isDirect) !== Boolean(b.isDirect)) {
        return Number(b.isDirect) - Number(a.isDirect);
      }
      if (Number(a.highlightCount || 0) !== Number(b.highlightCount || 0)) {
        return Number(b.highlightCount || 0) - Number(a.highlightCount || 0);
      }
      return Number(b.unreadCount || 0) - Number(a.unreadCount || 0);
    })
    .slice(0, SOURCE_THRESHOLDS.signal.maxConversations);

  const me = {
    mxid: integration.matrix?.mxid || integration.signal?.mxid || "",
    displayName: integration.signal?.displayName || "",
  };

  const conversations = await Promise.all(
    candidates.map(async (room) => {
      try {
        const timeline = await getSignalRoomTimeline(userId, room.roomId, {
          limit: SOURCE_THRESHOLDS.signal.messageLimit,
        });
        return conversationSourceAdapters.normalizeSignalConversation(
          timeline.room || room,
          timeline.messages || [],
          me
        );
      } catch {
        return null;
      }
    })
  );

  return classifyConversationBatch(conversations.filter(Boolean), "signal", options);
}

async function fetchStatesForSource(sourceType, userId, options = {}) {
  switch (sourceType) {
    case "gmail":
      return fetchGmailStates(userId, options);
    case "slack":
      return fetchSlackStates(userId, options);
    case "telegram":
      return fetchTelegramStates(userId, options);
    case "signal":
      return fetchSignalStates(userId, options);
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

function toPublicRecentMessages(messages = []) {
  return messages
    .map((message) => ({
      direction: message?.direction || "unknown",
      timestamp: message?.timestamp
        ? new Date(message.timestamp).toISOString()
        : null,
      text: summarizeDecisionText(message?.text || message?.previewText || "", 220),
    }))
    .filter((message) => message.text)
    .slice(-4);
}

function buildLatestInboundBurst(messages = [], unreadCount = 0) {
  const normalizedUnreadCount = Math.max(Number(unreadCount || 0) || 0, 0);
  if (normalizedUnreadCount <= 0) return [];
  const burst = [];
  let remainingUnread = normalizedUnreadCount;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.direction !== "inbound") {
      if (burst.length) break;
      continue;
    }

    if (normalizedUnreadCount > 0 && remainingUnread <= 0) {
      break;
    }

    burst.unshift(message);
    if (normalizedUnreadCount > 0) {
      remainingUnread -= 1;
    }
    if (burst.length >= 4) break;
  }

  return burst;
}

function resolveLatestInboundReplyText(state = {}) {
  const latestInboundBurst = Array.isArray(state?.latestInboundBurst)
    ? state.latestInboundBurst
    : buildLatestInboundBurst(
        toPublicRecentMessages(state?.workspaceDecisionContext?.recentMessages || []),
        getStateUnreadCount(state)
      );
  const latestInboundMessage = latestInboundBurst[latestInboundBurst.length - 1];
  return normalizeText(latestInboundMessage?.text || state.previewText || "");
}

function stripInternalStateFields(state) {
  if (!state) return state;
  const {
    workspaceDecisionContext,
    ...rest
  } = state;
  const recentMessages = toPublicRecentMessages(
    workspaceDecisionContext?.recentMessages || []
  );
  const latestInboundBurst = buildLatestInboundBurst(
    recentMessages,
    state?.sourceMetadata?.unreadCount || state?.platformMetadata?.unreadCount || 0
  );
  const canonicalConversationKey =
    buildCanonicalConversationKey(state.sourceType, state.conversationId) ||
    null;

  return {
    ...rest,
    conversationKey: canonicalConversationKey,
    quickActions: getQuickActionsForState(state.state || rest.state),
    recentMessages,
    latestInboundBurst,
    latestInboundBurstCount: latestInboundBurst.length,
  };
}

async function getCommunicationActionStates(userId, options = {}) {
  const source = options.source || "all";
  const sources =
    source === "all"
      ? ["gmail", "slack", "telegram", "signal", "whatsapp"]
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
  const workspaceAdjustedStates = await applyWorkspaceDecisions(
    visibleBaseStates,
    options
  );
  const priorityAdjustedStates = await applyPriorityLabels(
    workspaceAdjustedStates,
    options
  );
  // User reclassify is the final word — it overrides the rules-based classifier,
  // the workspace LLM, and the priority LLM. A newer inbound message resets it.
  const reclassifiedStates = applyUserReclassifications(
    priorityAdjustedStates,
    latestActionsByItem
  );
  const visibleStates = sortStates(reclassifiedStates);
  const publicStates = visibleStates.map(stripInternalStateFields);
  const insightsStates = sortStates(filterSurfaceStates(publicStates));
  const briefingStates = sortStates(filterBriefingStates(publicStates));
  const priorityFeedStates = sortStates(filterPriorityFeedStates(publicStates));
  const summary = {
    ...summarizeActionStates(insightsStates),
    surfaceCounts: {
      insights: insightsStates.length,
      briefing: briefingStates.length,
      priorityFeed: priorityFeedStates.length,
    },
    actionableCount: insightsStates.length,
    insightsCount: insightsStates.length,
    briefingCount: briefingStates.length,
    priorityFeedCount: priorityFeedStates.length,
  };
  maybeLogStateDebug(visibleStates, options);

  return {
    generatedAt: new Date().toISOString(),
    source,
    sources,
    states: insightsStates,
    allStates: publicStates,
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
  const latestMessage = resolveLatestInboundReplyText(state);
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

  const canonicalConversationKey =
    buildCanonicalConversationKey(state.sourceType, state.conversationId) ||
    state.id;
  const quickActions = getQuickActionsForState(state.state);

  return {
    id: state.id,
    conversationKey: canonicalConversationKey,
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
      latestMessageId: state.latestMeaningfulMessageId || null,
      latestMessageAt: state.latestMessageTimestamp
        ? new Date(state.latestMessageTimestamp).toISOString()
        : null,
      latestInboundAt: state.latestInboundTimestamp
        ? new Date(state.latestInboundTimestamp).toISOString()
        : null,
      conversationId: state.conversationId,
      conversationKey: canonicalConversationKey,
      threadId: state.threadId || null,
      confidence: state.confidence,
      confidenceBand: state.confidenceBand,
      currentActor: state.currentActor,
      participantLabel: state.participantLabel || "",
      previewText: state.previewText || "",
      platformMetadata: state.platformMetadata || {},
      sourceMetadata: state.sourceMetadata || {},
      recentMessages: Array.isArray(state.recentMessages)
        ? state.recentMessages
        : [],
      latestInboundBurst: Array.isArray(state.latestInboundBurst)
        ? state.latestInboundBurst
        : [],
      latestInboundBurstCount: Number(state.latestInboundBurstCount || 0),
      actionState: state.actionState,
      state: state.state,
      openContext: state.openContext || {},
      quickActions,
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
    .map(mapActionStateToPriorityItem);
}

function buildNotificationSignalFromStates(result = null, sourceType = "gmail") {
  const states = Array.isArray(result?.surfaceStates?.insights)
    ? result.surfaceStates.insights
    : Array.isArray(result?.states)
      ? result.states
      : [];
  const items = states.slice(0, 3).map((state) => ({
    id:
      buildCanonicalConversationKey(state.sourceType, state.conversationId) ||
      state.id ||
      state.conversationId ||
      null,
    conversationId: state.conversationId || null,
    conversationKey:
      buildCanonicalConversationKey(state.sourceType, state.conversationId) ||
      null,
    threadId: state.threadId || state.openContext?.threadId || null,
    chatId: state.openContext?.chatId || null,
    roomId: state.openContext?.roomId || null,
    dialogId: state.openContext?.dialogId || null,
    channelId: state.openContext?.channelId || null,
    latestMessageId:
      state.latestMeaningfulMessageId ||
      state.latestMessageId ||
      state.latestMessageTimestamp ||
      state.id,
    latestMessageAt: state.latestMessageTimestamp
      ? new Date(state.latestMessageTimestamp).toISOString()
      : null,
    name: state.participantLabel || state.conversationTitle || "Conversation",
    subject: state.conversationTitle || state.participantLabel || "Conversation",
    from: state.participantLabel || state.conversationTitle || "Conversation",
    unread: Math.max(getStateUnreadCount(state), 1),
    preview: resolveLatestInboundReplyText(state) || state.previewText || "",
    highConfidence:
      state.confidenceBand === "high" || String(state.priority || "") === "High",
    actionState: state.actionState,
  }));

  const count = Number(result?.counts?.actionableCount ?? states.length) || 0;

  return {
    app: sourceType,
    count,
    previews: items,
    items,
    summary: result?.summaryText || null,
  };
}

async function getCommunicationNotificationSignal(userId, sourceType, options = {}) {
  const result = await getCommunicationActionStates(userId, {
    source: sourceType,
    enablePriorityLLM: false,
    ...options,
  });
  return buildNotificationSignalFromStates(result, sourceType);
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
  QUICK_ACTIONS,
  getCommunicationActionStates,
  getCommunicationNotificationSignal,
  buildCommunicationPriorityItems,
  getCommunicationPriorityItems,
  mapActionStateToPriorityItem,
  __test: {
    filterSurfaceStates,
    filterBriefingStates,
    filterPriorityFeedStates,
    filterSuppressedStates,
    isReactivatedSinceAction,
    isHighSignalState,
    applyReclassifyToState,
    applyUserReclassifications,
    buildGmailThreadHaystack: conversationSourceAdapters.buildGmailThreadHaystack,
    getNormalizedGmailMessageText: conversationSourceAdapters.getNormalizedGmailMessageText,
    normalizeGmailThread: conversationSourceAdapters.normalizeGmailThread,
    normalizeSlackMessages: conversationSourceAdapters.normalizeSlackMessages,
    pickSlackConversationMessages: conversationSourceAdapters.pickSlackConversationMessages,
    buildNotificationSignalFromStates,
    buildWorkspaceDecisionPrompt,
    applyWorkspaceDecisions,
    buildPriorityClassificationPrompt,
    applyPriorityLabels,
    buildLatestInboundBurst,
    stripInternalStateFields,
  },
};
