"use strict";

const {
  ACTION_STATES,
  ACTION_STATE_META,
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

function detectIntent(text = "") {
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

  return {
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
  };
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

function isActionableState(actionState) {
  return (
    actionState === ACTION_STATES.WAITING_ON_YOUR_REPLY ||
    actionState === ACTION_STATES.NEEDS_APPROVAL ||
    actionState === ACTION_STATES.NEEDS_FOLLOW_UP
  );
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
      const intent = detectIntent(message.text || message.previewText || "");
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
  let currentActor = "none";
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
      currentActor = "other";
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
      currentActor = "other";
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
      currentActor = "none";
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
      currentActor = "none";
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
      currentActor = "other";
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
      currentActor = "other";
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
        currentActor = "none";
        anchorMessage = priorOutboundAsk;
        break;
      }

      responsibilityMessage = message;
      responsibilityReason = message.intent.hasAcknowledgement
        ? "acknowledged_reply"
        : "other_replied";
      currentActor = "other";
      responsibilityShifted = Boolean(
        message.takesOwnership || message.intent.hasAcknowledgement
      );
      anchorMessage = priorOutboundAsk;
      break;
    }

    if (message.intent.looksResolved) {
      responsibilityMessage = message;
      responsibilityReason = "resolved";
      currentActor = "none";
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
      currentActor = "none";
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

  if (actionState === ACTION_STATES.NEEDS_APPROVAL) {
    if (mentionedCurrentUser) {
      return "Latest message asks for your approval directly.";
    }
    return "Latest message asks for your approval.";
  }

  if (actionState === ACTION_STATES.WAITING_ON_YOUR_REPLY) {
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

  if (actionState === ACTION_STATES.NEEDS_FOLLOW_UP) {
    if (promisedFollowUp) {
      return "You previously committed to send an update and the follow-up still looks open.";
    }
    if (latestInboundIntent.hasFollowUp || latestInboundIntent.hasQuestion || latestInboundIntent.hasRequest) {
      return "This conversation still appears to be waiting on you and now needs follow-up.";
    }
    return "The thread still looks unresolved and likely needs you to re-engage.";
  }

  if (actionState === ACTION_STATES.WAITING_ON_OTHERS) {
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
  if (actionState === ACTION_STATES.NO_ACTION_NEEDED) {
    const excludeScore = details.excludedReason ? 0.88 : 0.62;
    return clamp(excludeScore, 0.05, 0.99);
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
  const base = ACTION_STATE_META[actionState]?.priorityWeight || 0;
  const latestTs =
    details.latestInboundTimestamp ||
    details.latestMessageTimestamp ||
    null;
  const ageHours = hoursSince(latestTs, details.nowMs);

  let recencyBoost = 0;
  if (ageHours !== null) {
    if (ageHours <= 2) recencyBoost = 12;
    else if (ageHours <= 8) recencyBoost = 8;
    else if (ageHours <= 24) recencyBoost = 5;
    else if (ageHours <= 72) recencyBoost = 2;
  }

  let signalBoost = 0;
  if (details.latestInboundIntent?.hasApproval) signalBoost += 8;
  if (details.latestInboundIntent?.hasQuestion || details.latestInboundIntent?.hasRequest) signalBoost += 6;
  if (details.mentionedCurrentUser) signalBoost += 5;
  if (details.conversation?.sourceMetadata?.isDirect) signalBoost += 4;
  if (details.latestInboundIntent?.hasUrgency || details.latestMeaningfulIntent?.hasUrgency) signalBoost += 6;

  return clamp(base + recencyBoost + signalBoost, 0, 98);
}

function buildBaseState(conversation, actionState, payload = {}, nowMs = Date.now()) {
  const latestMeaningful = payload.latestMeaningful || null;
  const latestInbound = payload.latestInbound || null;
  const latestOutbound = payload.latestOutbound || null;
  const confidence = computeConfidence(actionState, payload);

  return {
    id: `comm:${conversation.sourceType}:${conversation.conversationId}`,
    sourceType: conversation.sourceType,
    conversationId: conversation.conversationId,
    conversationTitle: conversation.conversationTitle || "Conversation",
    threadId: conversation.threadId || null,
    latestMessageTimestamp: latestMeaningful?.timestamp || null,
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
    currentActor: payload.currentActor || "none",
    responsibilityShifted: Boolean(payload.responsibilityShifted),
    surfaceEligible: isActionableState(actionState),
    actionState,
    actionStateLabel: ACTION_STATE_META[actionState].label,
    actionReason: buildActionReason(actionState, payload),
    confidence,
    confidenceBand: buildConfidenceBand(confidence),
    priorityBoost:
      actionState === ACTION_STATES.NO_ACTION_NEEDED
        ? 0
        : computePriorityBoost(actionState, {
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
  };
}

function buildNoActionState(conversation, payload = {}, nowMs = Date.now()) {
  return buildBaseState(
    conversation,
    ACTION_STATES.NO_ACTION_NEEDED,
    payload,
    nowMs
  );
}

function buildClassifiedState(conversation, actionState, payload = {}, nowMs = Date.now()) {
  return buildBaseState(conversation, actionState, payload, nowMs);
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
    return buildNoActionState(conversation || { sourceType: "other", conversationId: "unknown" }, {}, nowMs);
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
      nowMs
    );
  }

  if (matchesAny(latestNoiseText, INTENT_PATTERNS.oneTimeCode)) {
    return buildNoActionState(
      conversation,
      {
        ...basePayload,
        excludedReason: "This looks like a login or verification message and does not require action.",
      },
      nowMs
    );
  }

  if (conversation?.sourceMetadata?.isBroadcast && !mentionedCurrentUser) {
    return buildNoActionState(
      conversation,
      {
        ...basePayload,
        excludedReason: "This looks like broadcast or announcement traffic with no action expected from you.",
      },
      nowMs
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
      nowMs
    );
  }

  if (conversationResolved) {
    return buildNoActionState(
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
      nowMs
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
      ACTION_STATES.NEEDS_APPROVAL,
      basePayload,
      nowMs
    );
  }

  if (
    latestInboundNeedsReply &&
    latestInboundAgeHours !== null &&
    latestInboundAgeHours <= thresholds.replyWindowHours
  ) {
    return buildClassifiedState(
      conversation,
      ACTION_STATES.WAITING_ON_YOUR_REPLY,
      basePayload,
      nowMs
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
      ACTION_STATES.NEEDS_FOLLOW_UP,
      {
        ...basePayload,
        promisedFollowUp,
      },
      nowMs
    );
  }

  if (
    currentActor === "other" &&
    responsibilityAgeHours !== null &&
    responsibilityAgeHours <= thresholds.waitingOnOthersWindowHours
  ) {
    return buildClassifiedState(
      conversation,
      ACTION_STATES.WAITING_ON_OTHERS,
      basePayload,
      nowMs
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
    nowMs
  );
}

function summarizeActionStates(states = []) {
  const counts = {
    [ACTION_STATES.WAITING_ON_YOUR_REPLY]: 0,
    [ACTION_STATES.NEEDS_APPROVAL]: 0,
    [ACTION_STATES.NEEDS_FOLLOW_UP]: 0,
    [ACTION_STATES.WAITING_ON_OTHERS]: 0,
    [ACTION_STATES.NO_ACTION_NEEDED]: 0,
  };

  for (const state of states) {
    if (counts[state.actionState] !== undefined) {
      counts[state.actionState] += 1;
    }
  }

  return {
    counts,
    actionableCount:
      counts[ACTION_STATES.WAITING_ON_YOUR_REPLY] +
      counts[ACTION_STATES.NEEDS_APPROVAL] +
      counts[ACTION_STATES.NEEDS_FOLLOW_UP],
    replyRequiredCount: counts[ACTION_STATES.WAITING_ON_YOUR_REPLY],
    approvalCount: counts[ACTION_STATES.NEEDS_APPROVAL],
    followUpCount: counts[ACTION_STATES.NEEDS_FOLLOW_UP],
    waitingOnOthersCount: counts[ACTION_STATES.WAITING_ON_OTHERS],
    noActionCount: counts[ACTION_STATES.NO_ACTION_NEEDED],
  };
}

module.exports = {
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
  classifyConversation,
  summarizeActionStates,
  resolveThresholds,
};
