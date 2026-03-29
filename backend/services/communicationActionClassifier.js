"use strict";

const {
  CONVERSATION_STATES,
  CONVERSATION_STATE_META,
  ACTION_STATES,
  ACTION_STATE_META,
  ACTION_STATE_BY_CONVERSATION_STATE,
  CONVERSATION_STATE_BY_ACTION_STATE,
  SOURCE_THRESHOLDS,
  INTENT_PATTERNS,
} = require("./communicationActionConfig");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeLower(value = "") {
  return normalizeText(value).toLowerCase();
}

function stripQuotedReplyText(value = "", sourceType = "") {
  let text = String(value || "").replace(/\r/g, "\n");
  if (!text) return "";

  const looksLikeEmailReply =
    sourceType === "gmail" ||
    /\bOn .+ wrote:/i.test(text) ||
    /-{2,}\s*Original Message\s*-{2,}/i.test(text) ||
    /^From:\s.+$/im.test(text);

  if (looksLikeEmailReply) {
    const quoteMarkers = [
      /\bOn .+ wrote:/i,
      /-{2,}\s*Original Message\s*-{2,}/i,
      /^From:\s.+$/im,
    ];

    for (const pattern of quoteMarkers) {
      const match = text.match(pattern);
      if (match?.index >= 0) {
        text = text.slice(0, match.index);
        break;
      }
    }
  }

  const visibleLines = text
    .split("\n")
    .filter((line) => !/^\s*>/.test(line));

  return normalizeText(visibleLines.join("\n"));
}

function toTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const numeric = Number(value);
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hoursSince(timestamp, nowMs) {
  if (!timestamp) return null;
  return Math.max(0, (nowMs - timestamp) / 3600000);
}

function matchesAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function findMatchingPatterns(text, patterns = []) {
  return patterns.filter((pattern) => pattern.test(text));
}

function hasQuestionSignal(text) {
  return /\?/.test(text) || /\b(any update|what is|what's|when can|who can|should we|can i)\b/.test(text);
}

function mergeSemanticIntent(baseIntent, semanticHints = null) {
  if (!semanticHints || typeof semanticHints !== "object") {
    return baseIntent;
  }

  const merged = {
    ...baseIntent,
    signals: [...(baseIntent.signals || [])],
  };
  const semanticRole = normalizeLower(
    semanticHints.semanticRole ||
      semanticHints.role ||
      semanticHints.label ||
      ""
  );
  const semanticSignals = [];

  if (semanticHints.isApprovalRequest || semanticRole === "approval_request") {
    merged.hasApproval = true;
    merged.hasRequest = true;
    semanticSignals.push("semantic_approval_request");
  }

  if (
    semanticHints.isAsk ||
    semanticHints.isQuestion ||
    semanticRole === "ask" ||
    semanticRole === "question"
  ) {
    merged.hasQuestion = true;
    merged.hasRequest = true;
    semanticSignals.push("semantic_ask");
  }

  if (semanticHints.isApprovalDecision || semanticRole === "approval") {
    merged.hasApprovalDecision = true;
    merged.resolvesPreviousRequest = true;
    merged.looksResolved = true;
    semanticSignals.push("semantic_approval");
  }

  if (semanticHints.isAnswer || semanticRole === "answer") {
    merged.resolvesPreviousRequest = true;
    merged.looksResolved = true;
    semanticSignals.push("semantic_answer");
  }

  if (
    semanticHints.isAcknowledgement ||
    semanticRole === "acknowledgement"
  ) {
    merged.hasAcknowledgement = true;
    semanticSignals.push("semantic_acknowledgement");
  }

  if (semanticHints.isCommitment || semanticRole === "commitment") {
    merged.hasPromise = true;
    semanticSignals.push("semantic_commitment");
  }

  if (semanticHints.isFollowUp || semanticRole === "follow_up") {
    merged.hasFollowUp = true;
    merged.hasRequest = true;
    semanticSignals.push("semantic_follow_up");
  }

  if (
    semanticHints.isResolved ||
    semanticRole === "resolved" ||
    semanticRole === "resolution"
  ) {
    merged.looksResolved = true;
    merged.resolvesPreviousRequest = true;
    semanticSignals.push("semantic_resolved");
  }

  if (
    semanticHints.isInformational ||
    semanticRole === "informational"
  ) {
    merged.isInformational = true;
    semanticSignals.push("semantic_informational");
  }

  if (semanticHints.isUrgent) {
    merged.hasUrgency = true;
    semanticSignals.push("semantic_urgency");
  }

  if (semanticRole) {
    merged.semanticRole = semanticRole;
  }

  if (semanticHints.source) {
    merged.semanticSource = semanticHints.source;
  }

  if (Number.isFinite(Number(semanticHints.confidence))) {
    merged.semanticConfidence = Number(semanticHints.confidence);
  }

  merged.signals = [...new Set([...merged.signals, ...semanticSignals])];
  return merged;
}

function detectIntent(text = "", semanticHints = null) {
  const normalized = normalizeLower(text);
  if (!normalized) {
      return {
      hasQuestion: false,
      hasRequest: false,
      hasApproval: false,
      hasApprovalDecision: false,
      hasDenial: false,
      hasFollowUp: false,
      hasPromise: false,
      hasAcknowledgement: false,
      hasUrgency: false,
      looksResolved: false,
      resolvesPreviousRequest: false,
      isInformational: false,
      semanticRole: "informational",
      signals: [],
    };
  }

  const approvalHits = findMatchingPatterns(normalized, INTENT_PATTERNS.approval);
  const approvalDecisionHits = findMatchingPatterns(
    normalized,
    INTENT_PATTERNS.approvalDecision
  );
  const denialHits = findMatchingPatterns(normalized, INTENT_PATTERNS.denial);
  const requestHits = findMatchingPatterns(normalized, INTENT_PATTERNS.request);
  const followUpHits = findMatchingPatterns(normalized, INTENT_PATTERNS.followUp);
  const promiseHits = findMatchingPatterns(normalized, INTENT_PATTERNS.promise);
  const acknowledgementHits = findMatchingPatterns(
    normalized,
    INTENT_PATTERNS.acknowledgement
  );
  const urgencyHits = findMatchingPatterns(normalized, INTENT_PATTERNS.urgency);
  const resolutionHits = findMatchingPatterns(normalized, INTENT_PATTERNS.resolution);
  const informationalHits = findMatchingPatterns(normalized, INTENT_PATTERNS.informational);
  const questionSignal = hasQuestionSignal(normalized);
  const decisionSignal =
    approvalDecisionHits.length > 0 || denialHits.length > 0;
  const resolvesPreviousRequest =
    (decisionSignal || resolutionHits.length > 0) &&
    !questionSignal &&
    !requestHits.length &&
    !followUpHits.length &&
    !promiseHits.length;
  const semanticRole = approvalDecisionHits.length
    ? "approval"
    : denialHits.length
      ? "denial"
      : followUpHits.length
        ? "follow_up"
        : promiseHits.length
          ? "commitment"
          : acknowledgementHits.length
            ? "acknowledgement"
            : approvalHits.length
              ? "approval_request"
              : questionSignal || requestHits.length
                ? "ask"
                : resolutionHits.length
                  ? "resolved"
                  : informationalHits.length
                    ? "informational"
                    : "informational";

  return mergeSemanticIntent({
    hasQuestion: questionSignal,
    hasRequest: questionSignal || requestHits.length > 0,
    hasApproval: approvalHits.length > 0,
    hasApprovalDecision: approvalDecisionHits.length > 0,
    hasDenial: denialHits.length > 0,
    hasFollowUp: followUpHits.length > 0,
    hasPromise: promiseHits.length > 0,
    hasAcknowledgement: acknowledgementHits.length > 0,
    hasUrgency: urgencyHits.length > 0,
    looksResolved:
      resolvesPreviousRequest &&
      !approvalHits.length &&
      !acknowledgementHits.length,
    resolvesPreviousRequest,
    isInformational:
      informationalHits.length > 0 &&
      !questionSignal &&
      !requestHits.length &&
      !approvalHits.length &&
      !followUpHits.length &&
      !promiseHits.length,
    semanticRole,
    signals: [
      ...(approvalHits.length ? ["approval"] : []),
      ...(approvalDecisionHits.length ? ["approval_decision"] : []),
      ...(denialHits.length ? ["denial"] : []),
      ...(requestHits.length ? ["request"] : []),
      ...(followUpHits.length ? ["follow_up"] : []),
      ...(promiseHits.length ? ["promise"] : []),
      ...(acknowledgementHits.length ? ["acknowledgement"] : []),
      ...(urgencyHits.length ? ["urgency"] : []),
      ...(questionSignal ? ["question"] : []),
      ...(resolutionHits.length ? ["resolved"] : []),
      ...(informationalHits.length ? ["informational"] : []),
    ],
  }, semanticHints);
}

function isMeaningfulMessage(message = {}) {
  if (!message) return false;
  if (message.isMeaningful === false) return false;
  return Boolean(
    normalizeText(message.text) ||
      normalizeText(message.previewText) ||
      message.hasAttachments
  );
}

function resolveThresholds(sourceType) {
  return {
    ...SOURCE_THRESHOLDS.default,
    ...(SOURCE_THRESHOLDS[sourceType] || {}),
  };
}

function inferMessageExpectedToAct(conversation, message) {
  if (!message) return false;

  if (message.addressedToCurrentUser || message.mentionedCurrentUser) {
    return true;
  }

  if (message.replyToCurrentUser || message.inReplyToCurrentUser) {
    return true;
  }

  if (conversation?.sourceMetadata?.assignedToCurrentUser) {
    return true;
  }

  if (conversation?.sourceMetadata?.isDirect) {
    return true;
  }

  if (conversation?.sourceType === "gmail" && conversation?.sourceMetadata?.directRecipient) {
    return true;
  }

  if (
    conversation?.sourceMetadata?.explicitlyDirectedToCurrentUser ||
    conversation?.sourceMetadata?.recentMentionOfCurrentUser
  ) {
    return true;
  }

  return false;
}

function inferUserExpectedToAct(conversation, latestInbound) {
  return inferMessageExpectedToAct(conversation, latestInbound);
}

function hasActionIntent(intent = {}) {
  return Boolean(
    intent.hasApproval ||
      intent.hasQuestion ||
      intent.hasRequest ||
      intent.hasFollowUp
  );
}

function hasOwnershipSignal(intent = {}) {
  return Boolean(
    (intent.hasPromise || intent.hasAcknowledgement) &&
      !intent.hasQuestion &&
      !intent.hasRequest
  );
}

function toLegacyActionState(state) {
  return ACTION_STATE_BY_CONVERSATION_STATE[state] || state;
}

function toConversationState(actionState) {
  return CONVERSATION_STATE_BY_ACTION_STATE[actionState] || actionState;
}

function normalizeCurrentActor(value = "nobody") {
  if (value === "current_user") return "current_user";
  if (value === "other" || value === "other_party") return "other_party";
  return "nobody";
}

function toLegacyCurrentActor(value = "nobody") {
  if (value === "current_user") return "current_user";
  if (value === "other_party") return "other";
  return "none";
}

function isInsightEligibleState(state) {
  return (
    state === CONVERSATION_STATES.WAITING_ON_YOU ||
    state === CONVERSATION_STATES.NEEDS_APPROVAL ||
    state === CONVERSATION_STATES.NEEDS_FOLLOW_UP
  );
}

function isBriefingEligibleState(state) {
  return (
    isInsightEligibleState(state) ||
    state === CONVERSATION_STATES.WAITING_ON_OTHERS
  );
}

function isPriorityFeedEligibleState(state) {
  return isInsightEligibleState(state);
}

function buildSurfaceEligibility(state) {
  return {
    insights: isInsightEligibleState(state),
    briefing: isBriefingEligibleState(state),
    priorityFeed: isPriorityFeedEligibleState(state),
  };
}

function shouldIncludeStateDebug(options = {}) {
  if (typeof options.includeDebug === "boolean") {
    return options.includeDebug;
  }
  return process.env.NODE_ENV !== "production";
}

function findPriorMessage(messages = [], startIndex, predicate) {
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    if (predicate(messages[index], index)) {
      return messages[index];
    }
  }
  return null;
}

function buildResponsibilityAnalysis(conversation, sortedMessages = []) {
  const meaningfulMessages = sortedMessages
    .filter(isMeaningfulMessage)
    .map((message) => {
      const intent = detectIntent(
        message.text || message.previewText || "",
        message.semanticHints
      );
      const userExpectedToAct = inferMessageExpectedToAct(conversation, message);
      const addressedToCurrentUser = Boolean(
        message.addressedToCurrentUser ||
          message.mentionedCurrentUser ||
          message.replyToCurrentUser ||
          message.inReplyToCurrentUser
      );

      return {
        ...message,
        intent,
        userExpectedToAct,
        addressedToCurrentUser,
        asksCurrentUser:
          message.direction === "inbound" &&
          userExpectedToAct &&
          hasActionIntent(intent),
        asksOtherParty:
          message.direction === "outbound" &&
          hasActionIntent(intent),
        takesOwnership:
          message.direction === "inbound" &&
          message.senderType === "human" &&
          hasOwnershipSignal(intent),
      };
    });

  const latestMeaningful =
    meaningfulMessages[meaningfulMessages.length - 1] || null;
  const latestInbound =
    [...meaningfulMessages]
      .reverse()
      .find((message) => message.direction === "inbound") || null;
  const latestOutbound =
    [...meaningfulMessages]
      .reverse()
      .find((message) => message.direction === "outbound") || null;
  const latestInboundAsk =
    [...meaningfulMessages].reverse().find((message) => message.asksCurrentUser) ||
    null;
  const latestOutboundAsk =
    [...meaningfulMessages]
      .reverse()
      .find((message) => message.asksOtherParty) || null;

  let responsibilityMessage = latestMeaningful;
  let responsibilityReason = latestMeaningful ? "latest_meaningful" : "none";
  let currentActor = "nobody";
  let responsibilityShifted = false;
  let anchorMessage = null;

  for (let index = meaningfulMessages.length - 1; index >= 0; index -= 1) {
    const message = meaningfulMessages[index];
    const priorInboundAsk = findPriorMessage(
      meaningfulMessages,
      index,
      (candidate) => candidate.asksCurrentUser
    );
    const priorOutboundAsk = findPriorMessage(
      meaningfulMessages,
      index,
      (candidate) => candidate.asksOtherParty
    );

    if (
      message.direction === "outbound" &&
      message.intent.hasPromise &&
      priorInboundAsk &&
      priorInboundAsk.timestamp < message.timestamp
    ) {
      responsibilityMessage = message;
      responsibilityReason = "promised_follow_up";
      currentActor = "current_user";
      anchorMessage = priorInboundAsk;
      break;
    }

    if (
      message.direction === "inbound" &&
      message.takesOwnership &&
      priorOutboundAsk &&
      priorOutboundAsk.timestamp < message.timestamp
    ) {
      responsibilityMessage = message;
      responsibilityReason = "ownership_reply";
      currentActor = "other_party";
      responsibilityShifted = true;
      anchorMessage = priorOutboundAsk;
      break;
    }

    if (
      message.direction === "inbound" &&
      message.takesOwnership &&
      priorInboundAsk &&
      priorInboundAsk.timestamp < message.timestamp
    ) {
      responsibilityMessage = message;
      responsibilityReason = "peer_ownership_reply";
      currentActor = "other_party";
      responsibilityShifted = true;
      anchorMessage = priorInboundAsk;
      break;
    }

    if (
      message.direction === "inbound" &&
      message.intent.resolvesPreviousRequest &&
      priorOutboundAsk &&
      priorOutboundAsk.timestamp < message.timestamp
    ) {
      responsibilityMessage = message;
      responsibilityReason = "resolved_reply";
      currentActor = "nobody";
      anchorMessage = priorOutboundAsk;
      break;
    }

    if (
      message.direction === "inbound" &&
      message.intent.resolvesPreviousRequest &&
      priorInboundAsk &&
      priorInboundAsk.timestamp < message.timestamp
    ) {
      responsibilityMessage = message;
      responsibilityReason = "resolved_reply";
      currentActor = "nobody";
      anchorMessage = priorInboundAsk;
      break;
    }

    if (message.asksCurrentUser) {
      responsibilityMessage = message;
      responsibilityReason = "direct_ask";
      currentActor = "current_user";
      anchorMessage = message;
      break;
    }

    if (message.direction === "outbound" && message.asksOtherParty) {
      responsibilityMessage = message;
      responsibilityReason = "outbound_request";
      currentActor = "other_party";
      anchorMessage = message;
      break;
    }

    if (
      message.direction === "outbound" &&
      priorInboundAsk &&
      priorInboundAsk.timestamp < message.timestamp
    ) {
      responsibilityMessage = message;
      responsibilityReason = "user_replied";
      currentActor = "other_party";
      anchorMessage = priorInboundAsk;
      break;
    }

    if (
      message.direction === "inbound" &&
      priorOutboundAsk &&
      priorOutboundAsk.timestamp < message.timestamp
    ) {
      if (message.asksCurrentUser) {
        responsibilityMessage = message;
        responsibilityReason = "counter_request";
        currentActor = "current_user";
        anchorMessage = message;
        break;
      }

      if (message.intent.looksResolved) {
        responsibilityMessage = message;
        responsibilityReason = "resolved_reply";
        currentActor = "nobody";
        anchorMessage = priorOutboundAsk;
        break;
      }

      responsibilityMessage = message;
      responsibilityReason = message.intent.hasAcknowledgement
        ? "acknowledged_reply"
        : "other_replied";
      currentActor = "other_party";
      responsibilityShifted = Boolean(
        message.takesOwnership || message.intent.hasAcknowledgement
      );
      anchorMessage = priorOutboundAsk;
      break;
    }

    if (message.intent.looksResolved) {
      responsibilityMessage = message;
      responsibilityReason = "resolved";
      currentActor = "nobody";
      anchorMessage = message;
      break;
    }

    if (
      message.direction === "inbound" &&
      conversation?.sourceMetadata?.isGroup &&
      !message.userExpectedToAct &&
      !hasActionIntent(message.intent)
    ) {
      responsibilityMessage = message;
      responsibilityReason = "group_noise";
      currentActor = "nobody";
      anchorMessage = message;
      break;
    }
  }

  return {
    meaningfulMessages,
    latestMeaningful,
    latestInbound,
    latestOutbound,
    latestInboundAsk,
    latestOutboundAsk,
    latestMeaningfulIntent: latestMeaningful?.intent || detectIntent(""),
    latestInboundIntent: latestInbound?.intent || detectIntent(""),
    latestOutboundIntent: latestOutbound?.intent || detectIntent(""),
    mentionedCurrentUser: Boolean(
      latestInbound?.mentionedCurrentUser || latestMeaningful?.mentionedCurrentUser
    ),
    addressedToCurrentUser: Boolean(
      latestInbound?.addressedToCurrentUser ||
        latestMeaningful?.addressedToCurrentUser ||
        conversation?.sourceMetadata?.directRecipient ||
        conversation?.sourceMetadata?.isDirect ||
        conversation?.sourceMetadata?.assignedToCurrentUser
    ),
    userExpectedToAct:
      responsibilityMessage?.userExpectedToAct ||
      latestInboundAsk?.userExpectedToAct ||
      inferUserExpectedToAct(conversation, latestInbound),
    userRepliedAfterLatestInbound: Boolean(
      latestInbound && latestOutbound && latestOutbound.timestamp > latestInbound.timestamp
    ),
    responsibilityMessage,
    responsibilityIntent: responsibilityMessage?.intent || detectIntent(""),
    responsibilityReason,
    responsibilityShifted,
    currentActor,
    anchorMessage,
    latestInboundTakesOwnership: Boolean(
      responsibilityMessage &&
        responsibilityMessage.direction === "inbound" &&
        responsibilityReason === "ownership_reply"
    ),
  };
}

function buildActionReason(actionState, details = {}) {
  const {
    latestInboundIntent = {},
    latestMeaningfulIntent = {},
    latestInbound = null,
    responsibilityIntent = {},
    responsibilityReason = "",
    mentionedCurrentUser = false,
    promisedFollowUp = false,
    responsibilityShifted = false,
    excludedReason = "",
    userRepliedAfterLatestInbound = false,
    userExpectedToAct = false,
  } = details;

  if (actionState === CONVERSATION_STATES.RESOLVED) {
    return buildResolvedReason(details);
  }

  if (actionState === CONVERSATION_STATES.NEEDS_APPROVAL) {
    if (mentionedCurrentUser) {
      return "Latest message asks for your approval directly.";
    }
    return "Latest message asks for your approval.";
  }

  if (actionState === CONVERSATION_STATES.WAITING_ON_YOU) {
    if (mentionedCurrentUser) {
      return "You were directly asked to respond and have not replied yet.";
    }
    if (latestInboundIntent.hasApproval) {
      return "Latest message asks for confirmation or sign-off.";
    }
    if (latestInboundIntent.hasQuestion) {
      return "This conversation is waiting on your reply to a direct question.";
    }
    if (latestInboundIntent.hasFollowUp) {
      return "You were directly asked for an update in the latest follow-up.";
    }
    return "This conversation is waiting on your reply.";
  }

  if (actionState === CONVERSATION_STATES.NEEDS_FOLLOW_UP) {
    if (promisedFollowUp) {
      return "You previously committed to send an update and the follow-up still looks open.";
    }
    if (latestInboundIntent.hasFollowUp || latestInboundIntent.hasQuestion || latestInboundIntent.hasRequest) {
      return "This conversation still appears to be waiting on you and now needs follow-up.";
    }
    return "The thread still looks unresolved and likely needs you to re-engage.";
  }

  if (actionState === CONVERSATION_STATES.WAITING_ON_OTHERS) {
    if (responsibilityShifted) {
      return "The other person has acknowledged and is taking the next step.";
    }
    if (responsibilityReason === "acknowledged_reply") {
      return "The other person acknowledged the request, so the next move appears to be on their side.";
    }
    if (userRepliedAfterLatestInbound) {
      return "You already replied; next action appears to be on the other side.";
    }
    if (
      latestMeaningfulIntent.hasQuestion ||
      latestMeaningfulIntent.hasRequest ||
      latestMeaningfulIntent.hasApproval ||
      responsibilityIntent.hasQuestion ||
      responsibilityIntent.hasRequest ||
      responsibilityIntent.hasApproval
    ) {
      return "You made the latest actionable move and are currently waiting on someone else.";
    }
    if (userExpectedToAct) {
      return "The thread is no longer blocked on you right now.";
    }
    return "Next action appears to belong to someone else.";
  }

  if (excludedReason) {
    return excludedReason;
  }

  if (latestInbound?.senderType === "system" || latestInbound?.senderType === "bot") {
    return "This looks automated and does not require action.";
  }

  return "This looks informational and does not require action.";
}

function buildResolvedReason(details = {}) {
  const {
    latestMeaningfulIntent = {},
    responsibilityIntent = {},
    responsibilityReason = "",
  } = details;

  if (latestMeaningfulIntent.hasApprovalDecision || responsibilityIntent.hasApprovalDecision) {
    return "Latest reply approved the request.";
  }

  if (latestMeaningfulIntent.hasDenial || responsibilityIntent.hasDenial) {
    return "Latest reply denied or closed the request.";
  }

  if (
    responsibilityReason === "resolved_reply" ||
    latestMeaningfulIntent.resolvesPreviousRequest ||
    responsibilityIntent.resolvesPreviousRequest
  ) {
    return "Latest reply answered the previous ask.";
  }

  return "This request appears resolved.";
}

function buildConfidenceBand(value) {
  if (value >= 0.78) return "high";
  if (value >= 0.55) return "medium";
  return "low";
}

function computeConfidence(actionState, details = {}) {
  if (actionState === CONVERSATION_STATES.NO_ACTION_NEEDED) {
    const excludeScore = details.excludedReason ? 0.88 : 0.62;
    return clamp(excludeScore, 0.05, 0.99);
  }

  if (actionState === CONVERSATION_STATES.RESOLVED) {
    return clamp(0.84, 0.05, 0.99);
  }

  let score = 0.38;
  if (details.latestInbound?.senderType === "human") score += 0.12;
  if (details.latestInboundIntent?.hasApproval) score += 0.18;
  if (details.latestInboundIntent?.hasQuestion || details.latestInboundIntent?.hasRequest) score += 0.16;
  if (details.latestInboundIntent?.hasFollowUp) score += 0.12;
  if (details.latestInboundIntent?.hasUrgency || details.latestMeaningfulIntent?.hasUrgency) score += 0.06;
  if (details.latestMeaningfulIntent?.hasPromise) score += 0.12;
  if (details.userExpectedToAct) score += 0.14;
  if (details.mentionedCurrentUser) score += 0.1;
  if (details.addressedToCurrentUser) score += 0.08;
  if (details.userRepliedAfterLatestInbound) score += 0.14;
  if (details.conversation?.sourceMetadata?.isGroup && !details.mentionedCurrentUser) score -= 0.14;
  if (details.conversation?.sourceMetadata?.ccOnlyRecipient) score -= 0.08;
  return clamp(score, 0.05, 0.99);
}

function computePriorityBoost(actionState, details = {}) {
  const base = CONVERSATION_STATE_META[actionState]?.priorityWeight || 0;
  const latestTs =
    details.latestInboundTimestamp ||
    details.latestMessageTimestamp ||
    null;
  const ageHours = hoursSince(latestTs, details.nowMs);
  const latestInboundSignals = new Set(details.latestInboundIntent?.signals || []);
  const hasExplicitRequest = latestInboundSignals.has("request");
  const isLightQuestion = Boolean(
    details.latestInboundIntent?.hasQuestion &&
      !hasExplicitRequest &&
      !details.latestInboundIntent?.hasApproval &&
      !details.latestInboundIntent?.hasFollowUp &&
      !details.latestInboundIntent?.hasUrgency
  );

  let recencyBoost = 0;
  if (ageHours !== null) {
    if (ageHours <= 2) recencyBoost = 8;
    else if (ageHours <= 8) recencyBoost = 6;
    else if (ageHours <= 24) recencyBoost = 4;
    else if (ageHours <= 72) recencyBoost = 2;
  }

  let signalBoost = 0;
  if (details.latestInboundIntent?.hasApproval) signalBoost += 10;
  if (details.latestInboundIntent?.hasFollowUp) signalBoost += 6;
  if (details.latestInboundIntent?.hasQuestion) signalBoost += isLightQuestion ? 1 : 4;
  if (
    hasExplicitRequest &&
    !details.latestInboundIntent?.hasApproval &&
    !details.latestInboundIntent?.hasFollowUp
  ) {
    signalBoost += 4;
  }
  if (details.mentionedCurrentUser) signalBoost += 5;
  if (details.conversation?.sourceMetadata?.isDirect && !isLightQuestion) {
    signalBoost += 3;
  }
  if (details.latestInboundIntent?.hasUrgency || details.latestMeaningfulIntent?.hasUrgency) {
    signalBoost += 10;
  }

  return clamp(base + recencyBoost + signalBoost, 0, 98);
}

function buildStateDebug(
  conversation,
  conversationState,
  actionState,
  payload,
  confidence,
  nowMs
) {
  const latestMeaningful = payload.latestMeaningful || null;
  const latestIntent = latestMeaningful?.intent || payload.latestMeaningfulIntent || {};
  const eligibility = buildSurfaceEligibility(conversationState);

  return {
    source: conversation.sourceType,
    conversationId: conversation.conversationId,
    normalizedLatestMeaningfulMessage: latestMeaningful
      ? {
          id: latestMeaningful.id || null,
          timestamp: latestMeaningful.timestamp
            ? new Date(latestMeaningful.timestamp).toISOString()
            : null,
          direction: latestMeaningful.direction || "unknown",
          senderType: latestMeaningful.senderType || "unknown",
          senderName: latestMeaningful.senderName || "",
          text:
            latestMeaningful.text ||
            latestMeaningful.previewText ||
            "",
        }
      : null,
    computedState: conversationState,
    legacyActionState: actionState,
    currentActor: normalizeCurrentActor(payload.currentActor),
    reason: buildActionReason(conversationState, payload),
    confidence,
    confidenceBand: buildConfidenceBand(confidence),
    eligibleForInsights: eligibility.insights,
    eligibleForBriefing: eligibility.briefing,
    eligibleForPriorityFeed: eligibility.priorityFeed,
    responsibilityReason: payload.responsibilityReason || "",
    semanticRole: latestIntent.semanticRole || "informational",
    semanticSource: latestIntent.semanticSource || "rules",
    semanticConfidence:
      latestIntent.semanticConfidence !== undefined
        ? latestIntent.semanticConfidence
        : null,
    intentSignals: latestIntent.signals || [],
    generatedAt: new Date(nowMs).toISOString(),
  };
}

function buildBaseState(
  conversation,
  conversationState,
  payload = {},
  nowMs = Date.now(),
  options = {}
) {
  const latestMeaningful = payload.latestMeaningful || null;
  const latestInbound = payload.latestInbound || null;
  const latestOutbound = payload.latestOutbound || null;
  const confidence = computeConfidence(conversationState, payload);
  const actionState = toLegacyActionState(conversationState);
  const currentActor = normalizeCurrentActor(payload.currentActor);
  const reason = buildActionReason(conversationState, payload);
  const surfaceEligibility = buildSurfaceEligibility(conversationState);
  const latestMeaningfulTimestamp = latestMeaningful?.timestamp
    ? new Date(latestMeaningful.timestamp).toISOString()
    : null;

  return {
    id: `comm:${conversation.sourceType}:${conversation.conversationId}`,
    source: conversation.sourceType,
    sourceType: conversation.sourceType,
    conversationId: conversation.conversationId,
    conversationTitle: conversation.conversationTitle || "Conversation",
    threadId: conversation.threadId || null,
    state: conversationState,
    stateLabel: CONVERSATION_STATE_META[conversationState]?.label || actionState,
    latestMessageTimestamp: latestMeaningful?.timestamp || null,
    latestMeaningfulMessageId: latestMeaningful?.id || null,
    latestMeaningfulTimestamp,
    latestInboundTimestamp: latestInbound?.timestamp || null,
    latestOutboundTimestamp: latestOutbound?.timestamp || null,
    latestSenderType: latestMeaningful?.senderType || "unknown",
    latestDirection: latestMeaningful?.direction || "unknown",
    addressedToCurrentUser: Boolean(payload.addressedToCurrentUser),
    userRepliedAfterLatestInbound: Boolean(payload.userRepliedAfterLatestInbound),
    hasDirectQuestion: Boolean(payload.latestInboundIntent?.hasQuestion),
    hasApprovalIntent: Boolean(payload.latestInboundIntent?.hasApproval),
    hasFollowUpIntent: Boolean(payload.latestInboundIntent?.hasFollowUp),
    hasMentionOfCurrentUser: Boolean(payload.mentionedCurrentUser),
    currentActor,
    legacyCurrentActor: toLegacyCurrentActor(currentActor),
    responsibilityShifted: Boolean(payload.responsibilityShifted),
    eligibleForInsights: surfaceEligibility.insights,
    eligibleForBriefing: surfaceEligibility.briefing,
    eligibleForPriorityFeed: surfaceEligibility.priorityFeed,
    surfaceEligibility,
    surfaceEligible: surfaceEligibility.insights,
    actionState,
    actionStateLabel: ACTION_STATE_META[actionState].label,
    reason,
    actionReason: reason,
    confidence,
    confidenceBand: buildConfidenceBand(confidence),
    priorityBoost:
      conversationState === CONVERSATION_STATES.NO_ACTION_NEEDED ||
      conversationState === CONVERSATION_STATES.RESOLVED
        ? 0
        : computePriorityBoost(conversationState, {
            ...payload,
            nowMs,
            latestInboundTimestamp: payload.latestInboundTimestamp || latestInbound?.timestamp || null,
            latestMessageTimestamp: payload.latestMessageTimestamp || latestMeaningful?.timestamp || null,
          }),
    excludedReason: payload.excludedReason || "",
    participantLabel:
      conversation.participantLabel ||
      conversation.sourceMetadata?.participantLabel ||
      "",
    previewText:
      conversation.previewText ||
      latestMeaningful?.text ||
      latestMeaningful?.previewText ||
      "",
    sourceMetadata: conversation.sourceMetadata || {},
    platformMetadata: conversation.platformMetadata || {},
    openContext: conversation.openContext || {},
    generatedAt: new Date(nowMs).toISOString(),
    ...(shouldIncludeStateDebug(options)
      ? {
          debug: buildStateDebug(
            conversation,
            conversationState,
            actionState,
            payload,
            confidence,
            nowMs
          ),
        }
      : {}),
  };
}

function buildNoActionState(conversation, payload = {}, nowMs = Date.now(), options = {}) {
  return buildBaseState(
    conversation,
    CONVERSATION_STATES.NO_ACTION_NEEDED,
    payload,
    nowMs,
    options
  );
}

function buildResolvedState(conversation, payload = {}, nowMs = Date.now(), options = {}) {
  return buildBaseState(
    conversation,
    CONVERSATION_STATES.RESOLVED,
    payload,
    nowMs,
    options
  );
}

function buildClassifiedState(
  conversation,
  actionState,
  payload = {},
  nowMs = Date.now(),
  options = {}
) {
  return buildBaseState(conversation, actionState, payload, nowMs, options);
}

function classifyConversation(conversation, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const thresholds = resolveThresholds(conversation?.sourceType);
  const sortedMessages = [...(conversation?.messages || [])]
    .map((message) => {
      const cleanedText = stripQuotedReplyText(
        message.text || message.previewText || "",
        conversation?.sourceType
      );
      return {
        ...message,
        timestamp: toTimestamp(message.timestamp),
        text: cleanedText,
        previewText: cleanedText,
      };
    })
    .filter((message) => message.timestamp)
    .sort((a, b) => a.timestamp - b.timestamp);
  const analysis = buildResponsibilityAnalysis(conversation, sortedMessages);
  const {
    latestMeaningful,
    latestInbound,
    latestOutbound,
    latestMeaningfulIntent,
    latestInboundIntent,
    latestOutboundIntent,
    mentionedCurrentUser,
    addressedToCurrentUser,
    userExpectedToAct,
    userRepliedAfterLatestInbound,
    responsibilityMessage,
    responsibilityIntent,
    responsibilityReason,
    responsibilityShifted,
    currentActor,
    latestInboundTakesOwnership,
  } = analysis;

  if (!conversation || !latestMeaningful) {
    return buildNoActionState(
      conversation || { sourceType: "other", conversationId: "unknown" },
      {},
      nowMs,
      options
    );
  }

  const latestInboundAgeHours = hoursSince(latestInbound?.timestamp, nowMs);
  const latestOutboundAgeHours = hoursSince(latestOutbound?.timestamp, nowMs);
  const latestNoiseText = normalizeLower(latestMeaningful.text || latestMeaningful.previewText || "");
  const responsibilityAgeHours = hoursSince(responsibilityMessage?.timestamp, nowMs);
  const promisedFollowUp = Boolean(
    responsibilityReason === "promised_follow_up" &&
      latestOutbound &&
      responsibilityMessage?.id === latestOutbound.id &&
      latestOutboundAgeHours !== null &&
      latestOutboundAgeHours >= thresholds.promiseFollowUpHours
  );
  const latestInboundNeedsReply = Boolean(
    currentActor === "current_user" &&
      responsibilityMessage?.direction === "inbound" &&
      responsibilityMessage?.id === latestInbound?.id &&
      hasActionIntent(latestInboundIntent) &&
      !userRepliedAfterLatestInbound
  );

  const basePayload = {
    conversation,
    latestMeaningful,
    latestInbound,
    latestOutbound,
    latestMeaningfulIntent,
    latestInboundIntent,
    latestOutboundIntent,
    responsibilityIntent,
    responsibilityReason,
    addressedToCurrentUser,
    mentionedCurrentUser,
    userExpectedToAct,
    userRepliedAfterLatestInbound,
    responsibilityShifted,
    currentActor,
  };
  const conversationResolved = Boolean(
    latestMeaningfulIntent.looksResolved ||
      responsibilityIntent.resolvesPreviousRequest ||
      responsibilityReason === "resolved_reply" ||
      responsibilityReason === "resolved"
  );

  const excludedReason = conversation?.sourceMetadata?.excludedReason || "";
  if (excludedReason) {
    return buildNoActionState(
      conversation,
      {
        ...basePayload,
        excludedReason,
      },
      nowMs,
      options
    );
  }

  if (matchesAny(latestNoiseText, INTENT_PATTERNS.oneTimeCode)) {
    return buildNoActionState(
      conversation,
      {
        ...basePayload,
        excludedReason: "This looks like a login or verification message and does not require action.",
      },
      nowMs,
      options
    );
  }

  if (conversation?.sourceMetadata?.isBroadcast && !mentionedCurrentUser) {
    return buildNoActionState(
      conversation,
      {
        ...basePayload,
        excludedReason: "This looks like broadcast or announcement traffic with no action expected from you.",
      },
      nowMs,
      options
    );
  }

  const automatedMessageNeedsAction = Boolean(
    latestInbound &&
      userExpectedToAct &&
      (latestInboundIntent.hasApproval ||
        latestInboundIntent.hasQuestion ||
        latestInboundIntent.hasRequest ||
        latestInboundIntent.hasFollowUp)
  );

  if (
    (latestMeaningful.senderType === "bot" || latestMeaningful.senderType === "system") &&
    !automatedMessageNeedsAction
  ) {
    return buildNoActionState(
      conversation,
      {
        ...basePayload,
        excludedReason: "This looks automated and does not require action.",
      },
      nowMs,
      options
    );
  }

  if (conversationResolved) {
    return buildResolvedState(
      conversation,
      {
        ...basePayload,
        excludedReason: buildResolvedReason({
          ...basePayload,
          latestMeaningfulIntent,
          responsibilityIntent,
          responsibilityReason,
        }),
      },
      nowMs,
      options
    );
  }

  if (
    currentActor === "current_user" &&
    responsibilityMessage?.direction === "inbound" &&
    latestInboundIntent.hasApproval &&
    !latestInboundTakesOwnership &&
    !userRepliedAfterLatestInbound &&
    userExpectedToAct &&
    latestInboundAgeHours !== null &&
    latestInboundAgeHours <= thresholds.approvalWindowHours
  ) {
    return buildClassifiedState(
      conversation,
      CONVERSATION_STATES.NEEDS_APPROVAL,
      basePayload,
      nowMs,
      options
    );
  }

  if (
    latestInboundNeedsReply &&
    latestInboundAgeHours !== null &&
    latestInboundAgeHours <= thresholds.replyWindowHours
  ) {
    return buildClassifiedState(
      conversation,
      CONVERSATION_STATES.WAITING_ON_YOU,
      basePayload,
      nowMs,
      options
    );
  }

  if (
    (latestInboundNeedsReply &&
      latestInboundAgeHours !== null &&
      latestInboundAgeHours <= thresholds.followUpWindowHours) ||
    promisedFollowUp
  ) {
    return buildClassifiedState(
      conversation,
      CONVERSATION_STATES.NEEDS_FOLLOW_UP,
      {
        ...basePayload,
        promisedFollowUp,
      },
      nowMs,
      options
    );
  }

  if (
    currentActor === "other_party" &&
    responsibilityAgeHours !== null &&
    responsibilityAgeHours <= thresholds.waitingOnOthersWindowHours
  ) {
    return buildClassifiedState(
      conversation,
      CONVERSATION_STATES.WAITING_ON_OTHERS,
      basePayload,
      nowMs,
      options
    );
  }

  return buildNoActionState(
    conversation,
    {
      ...basePayload,
      excludedReason:
        userExpectedToAct || latestInboundIntent.isInformational
          ? ""
          : "Responsibility is unclear, so OrionAI is not surfacing this as your action.",
    },
    nowMs,
    options
  );
}

function selectStatesForSurface(states = [], surface = "insights") {
  const field =
    surface === "briefing"
      ? "eligibleForBriefing"
      : surface === "priorityFeed"
        ? "eligibleForPriorityFeed"
        : "eligibleForInsights";

  return states.filter((state) => {
    if (typeof state?.[field] === "boolean") {
      return state[field];
    }

    const conversationState = state?.state || toConversationState(state?.actionState);
    const eligibility = buildSurfaceEligibility(conversationState);
    if (surface === "briefing") return eligibility.briefing;
    if (surface === "priorityFeed") return eligibility.priorityFeed;
    return eligibility.insights;
  });
}

function summarizeActionStates(states = []) {
  const stateCounts = {
    [CONVERSATION_STATES.WAITING_ON_YOU]: 0,
    [CONVERSATION_STATES.NEEDS_APPROVAL]: 0,
    [CONVERSATION_STATES.NEEDS_FOLLOW_UP]: 0,
    [CONVERSATION_STATES.WAITING_ON_OTHERS]: 0,
    [CONVERSATION_STATES.RESOLVED]: 0,
    [CONVERSATION_STATES.NO_ACTION_NEEDED]: 0,
  };
  const counts = {
    [ACTION_STATES.WAITING_ON_YOUR_REPLY]: 0,
    [ACTION_STATES.NEEDS_APPROVAL]: 0,
    [ACTION_STATES.NEEDS_FOLLOW_UP]: 0,
    [ACTION_STATES.WAITING_ON_OTHERS]: 0,
    [ACTION_STATES.RESOLVED]: 0,
    [ACTION_STATES.NO_ACTION_NEEDED]: 0,
  };

  for (const state of states) {
    const conversationState = state?.state || toConversationState(state?.actionState);
    const legacyActionState = state?.actionState || toLegacyActionState(conversationState);

    if (stateCounts[conversationState] !== undefined) {
      stateCounts[conversationState] += 1;
    }
    if (counts[legacyActionState] !== undefined) {
      counts[legacyActionState] += 1;
    }
  }

  const insightStates = selectStatesForSurface(states, "insights");
  const briefingStates = selectStatesForSurface(states, "briefing");
  const priorityFeedStates = selectStatesForSurface(states, "priorityFeed");

  return {
    counts,
    stateCounts,
    surfaceCounts: {
      insights: insightStates.length,
      briefing: briefingStates.length,
      priorityFeed: priorityFeedStates.length,
    },
    actionableCount: insightStates.length,
    insightsCount: insightStates.length,
    briefingCount: briefingStates.length,
    priorityFeedCount: priorityFeedStates.length,
    replyRequiredCount: stateCounts[CONVERSATION_STATES.WAITING_ON_YOU],
    approvalCount: stateCounts[CONVERSATION_STATES.NEEDS_APPROVAL],
    followUpCount: stateCounts[CONVERSATION_STATES.NEEDS_FOLLOW_UP],
    waitingOnOthersCount: stateCounts[CONVERSATION_STATES.WAITING_ON_OTHERS],
    resolvedCount: stateCounts[CONVERSATION_STATES.RESOLVED],
    noActionCount: stateCounts[CONVERSATION_STATES.NO_ACTION_NEEDED],
  };
}

module.exports = {
  CONVERSATION_STATES,
  CONVERSATION_STATE_META,
  ACTION_STATES,
  ACTION_STATE_META,
  clamp,
  normalizeText,
  normalizeLower,
  stripQuotedReplyText,
  toTimestamp,
  hoursSince,
  detectIntent,
  buildResponsibilityAnalysis,
  buildSurfaceEligibility,
  classifyConversation,
  selectStatesForSurface,
  summarizeActionStates,
  toLegacyActionState,
  toConversationState,
  resolveThresholds,
};
