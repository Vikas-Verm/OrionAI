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

function toTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const numeric = Number(value);
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
      hasFollowUp: false,
      hasPromise: false,
      hasUrgency: false,
      looksResolved: false,
      isInformational: false,
      signals: [],
    };
  }

  const approvalHits = findMatchingPatterns(normalized, INTENT_PATTERNS.approval);
  const requestHits = findMatchingPatterns(normalized, INTENT_PATTERNS.request);
  const followUpHits = findMatchingPatterns(normalized, INTENT_PATTERNS.followUp);
  const promiseHits = findMatchingPatterns(normalized, INTENT_PATTERNS.promise);
  const urgencyHits = findMatchingPatterns(normalized, INTENT_PATTERNS.urgency);
  const resolutionHits = findMatchingPatterns(normalized, INTENT_PATTERNS.resolution);
  const informationalHits = findMatchingPatterns(normalized, INTENT_PATTERNS.informational);
  const questionSignal = hasQuestionSignal(normalized);

  return {
    hasQuestion: questionSignal,
    hasRequest: questionSignal || requestHits.length > 0,
    hasApproval: approvalHits.length > 0,
    hasFollowUp: followUpHits.length > 0,
    hasPromise: promiseHits.length > 0,
    hasUrgency: urgencyHits.length > 0,
    looksResolved:
      resolutionHits.length > 0 &&
      !questionSignal &&
      !requestHits.length &&
      !approvalHits.length,
    isInformational:
      informationalHits.length > 0 &&
      !questionSignal &&
      !requestHits.length &&
      !approvalHits.length &&
      !followUpHits.length,
    signals: [
      ...(approvalHits.length ? ["approval"] : []),
      ...(requestHits.length ? ["request"] : []),
      ...(followUpHits.length ? ["follow_up"] : []),
      ...(promiseHits.length ? ["promise"] : []),
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

function inferUserExpectedToAct(conversation, latestInbound) {
  if (!latestInbound) return false;

  if (latestInbound.addressedToCurrentUser || latestInbound.mentionedCurrentUser) {
    return true;
  }

  if (latestInbound.replyToCurrentUser || latestInbound.inReplyToCurrentUser) {
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

function buildActionReason(actionState, details = {}) {
  const {
    latestInboundIntent = {},
    latestMeaningfulIntent = {},
    latestInbound = null,
    mentionedCurrentUser = false,
    promisedFollowUp = false,
    responsibilityShifted = false,
    excludedReason = "",
    userRepliedAfterLatestInbound = false,
    userExpectedToAct = false,
  } = details;

  if (actionState === ACTION_STATES.NEEDS_APPROVAL) {
    if (mentionedCurrentUser) {
      return "Approval was requested from you directly and no reply has been sent.";
    }
    return "Approval requested in the most recent inbound message.";
  }

  if (actionState === ACTION_STATES.WAITING_ON_YOUR_REPLY) {
    if (mentionedCurrentUser) {
      return "You were mentioned directly and no reply has been sent.";
    }
    if (latestInboundIntent.hasApproval) {
      return "Latest message asks for confirmation or sign-off and you have not replied.";
    }
    if (latestInboundIntent.hasQuestion) {
      return "This thread is waiting on your response to a direct question.";
    }
    if (latestInboundIntent.hasFollowUp) {
      return "A follow-up came in and the conversation still appears to be waiting on you.";
    }
    return "Latest inbound message contains a direct ask and you have not replied.";
  }

  if (actionState === ACTION_STATES.NEEDS_FOLLOW_UP) {
    if (promisedFollowUp) {
      return "You previously committed to send an update and the follow-up still looks open.";
    }
    if (latestInboundIntent.hasFollowUp || latestInboundIntent.hasQuestion || latestInboundIntent.hasRequest) {
      return "This conversation still appears to be waiting on your response and now needs follow-up.";
    }
    return "The thread still looks unresolved and likely needs you to re-engage.";
  }

  if (actionState === ACTION_STATES.WAITING_ON_OTHERS) {
    if (responsibilityShifted) {
      return "Latest reply acknowledges the request and takes ownership of the next step.";
    }
    if (userRepliedAfterLatestInbound) {
      return "You already replied; next action appears to be on the other side.";
    }
    if (latestMeaningfulIntent.hasQuestion || latestMeaningfulIntent.hasRequest || latestMeaningfulIntent.hasApproval) {
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

function buildNoActionState(conversation, payload = {}, nowMs = Date.now()) {
  const confidence = computeConfidence(ACTION_STATES.NO_ACTION_NEEDED, payload);
  const latestMeaningful = payload.latestMeaningful || null;
  const latestInbound = payload.latestInbound || null;
  const latestOutbound = payload.latestOutbound || null;

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
    actionState: ACTION_STATES.NO_ACTION_NEEDED,
    actionStateLabel: ACTION_STATE_META[ACTION_STATES.NO_ACTION_NEEDED].label,
    actionReason: buildActionReason(ACTION_STATES.NO_ACTION_NEEDED, payload),
    confidence,
    confidenceBand: buildConfidenceBand(confidence),
    priorityBoost: 0,
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

function classifyConversation(conversation, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const thresholds = resolveThresholds(conversation?.sourceType);
  const sortedMessages = [...(conversation?.messages || [])]
    .map((message) => ({
      ...message,
      timestamp: toTimestamp(message.timestamp),
      text: normalizeText(message.text || message.previewText || ""),
    }))
    .filter((message) => message.timestamp)
    .sort((a, b) => a.timestamp - b.timestamp);

  const meaningfulMessages = sortedMessages.filter(isMeaningfulMessage);
  const latestMeaningful = meaningfulMessages[meaningfulMessages.length - 1] || null;
  const latestInbound =
    [...meaningfulMessages].reverse().find((message) => message.direction === "inbound") ||
    null;
  const latestOutbound =
    [...meaningfulMessages].reverse().find((message) => message.direction === "outbound") ||
    null;

  if (!conversation || !latestMeaningful) {
    return buildNoActionState(conversation || { sourceType: "other", conversationId: "unknown" }, {}, nowMs);
  }

  const latestMeaningfulIntent = detectIntent(latestMeaningful.text);
  const latestInboundIntent = detectIntent(latestInbound?.text || "");
  const latestOutboundIntent = detectIntent(latestOutbound?.text || "");
  const mentionedCurrentUser = Boolean(
    latestInbound?.mentionedCurrentUser || latestMeaningful?.mentionedCurrentUser
  );
  const addressedToCurrentUser = Boolean(
    latestInbound?.addressedToCurrentUser ||
      latestMeaningful?.addressedToCurrentUser ||
      conversation?.sourceMetadata?.directRecipient ||
      conversation?.sourceMetadata?.isDirect ||
      conversation?.sourceMetadata?.assignedToCurrentUser
  );
  const userExpectedToAct = inferUserExpectedToAct(conversation, latestInbound);
  const userRepliedAfterLatestInbound = Boolean(
    latestInbound && latestOutbound && latestOutbound.timestamp > latestInbound.timestamp
  );
  const priorOutboundRequestedAction = Boolean(
    latestOutbound &&
      latestInbound &&
      latestOutbound.timestamp < latestInbound.timestamp &&
      (
        latestOutboundIntent.hasApproval ||
        latestOutboundIntent.hasQuestion ||
        latestOutboundIntent.hasRequest ||
        latestOutboundIntent.hasFollowUp
      )
  );
  const latestInboundTakesOwnership = Boolean(
    latestInbound &&
      latestMeaningful &&
      latestMeaningful.id === latestInbound.id &&
      latestInbound.direction === "inbound" &&
      latestInboundIntent.hasPromise &&
      !latestInboundIntent.hasQuestion &&
      !latestInboundIntent.hasRequest &&
      priorOutboundRequestedAction
  );

  const latestInboundAgeHours = hoursSince(latestInbound?.timestamp, nowMs);
  const latestOutboundAgeHours = hoursSince(latestOutbound?.timestamp, nowMs);
  const latestNoiseText = normalizeLower(latestMeaningful.text || latestMeaningful.previewText || "");

  const excludedReason = conversation?.sourceMetadata?.excludedReason || "";
  if (excludedReason) {
    return buildNoActionState(
      conversation,
      {
        latestMeaningful,
        latestInbound,
        latestOutbound,
        latestInboundIntent,
        latestMeaningfulIntent,
        addressedToCurrentUser,
        mentionedCurrentUser,
        userRepliedAfterLatestInbound,
        excludedReason,
      },
      nowMs
    );
  }

  if (matchesAny(latestNoiseText, INTENT_PATTERNS.oneTimeCode)) {
    return buildNoActionState(
      conversation,
      {
        latestMeaningful,
        latestInbound,
        latestOutbound,
        latestInboundIntent,
        latestMeaningfulIntent,
        addressedToCurrentUser,
        mentionedCurrentUser,
        userRepliedAfterLatestInbound,
        excludedReason: "This looks like a login or verification message and does not require action.",
      },
      nowMs
    );
  }

  if (conversation?.sourceMetadata?.isBroadcast && !mentionedCurrentUser) {
    return buildNoActionState(
      conversation,
      {
        latestMeaningful,
        latestInbound,
        latestOutbound,
        latestInboundIntent,
        latestMeaningfulIntent,
        addressedToCurrentUser,
        mentionedCurrentUser,
        userRepliedAfterLatestInbound,
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
        latestMeaningful,
        latestInbound,
        latestOutbound,
        latestInboundIntent,
        latestMeaningfulIntent,
        addressedToCurrentUser,
        mentionedCurrentUser,
        userRepliedAfterLatestInbound,
        excludedReason: "This looks automated and does not require action.",
      },
      nowMs
    );
  }

  if (latestMeaningfulIntent.looksResolved) {
    return buildNoActionState(
      conversation,
      {
        latestMeaningful,
        latestInbound,
        latestOutbound,
        latestInboundIntent,
        latestMeaningfulIntent,
        addressedToCurrentUser,
        mentionedCurrentUser,
        userRepliedAfterLatestInbound,
        excludedReason: "This conversation looks resolved and does not require action.",
      },
      nowMs
    );
  }

  if (
    latestInbound &&
    latestInboundIntent.hasApproval &&
    !latestInboundTakesOwnership &&
    !userRepliedAfterLatestInbound &&
    userExpectedToAct &&
    latestInboundAgeHours !== null &&
    latestInboundAgeHours <= thresholds.approvalWindowHours
  ) {
    const confidence = computeConfidence(ACTION_STATES.NEEDS_APPROVAL, {
      conversation,
      latestInbound,
      latestInboundIntent,
      latestMeaningfulIntent,
      addressedToCurrentUser,
      mentionedCurrentUser,
      userExpectedToAct,
    });

    return {
      id: `comm:${conversation.sourceType}:${conversation.conversationId}`,
      sourceType: conversation.sourceType,
      conversationId: conversation.conversationId,
      conversationTitle: conversation.conversationTitle || "Conversation",
      threadId: conversation.threadId || null,
      latestMessageTimestamp: latestMeaningful.timestamp,
      latestInboundTimestamp: latestInbound.timestamp,
      latestOutboundTimestamp: latestOutbound?.timestamp || null,
      latestSenderType: latestMeaningful.senderType || "unknown",
      latestDirection: latestMeaningful.direction || "unknown",
      addressedToCurrentUser,
      userRepliedAfterLatestInbound,
      hasDirectQuestion: Boolean(latestInboundIntent.hasQuestion),
      hasApprovalIntent: true,
      hasFollowUpIntent: Boolean(latestInboundIntent.hasFollowUp),
      hasMentionOfCurrentUser: mentionedCurrentUser,
      actionState: ACTION_STATES.NEEDS_APPROVAL,
      actionStateLabel: ACTION_STATE_META[ACTION_STATES.NEEDS_APPROVAL].label,
      actionReason: buildActionReason(ACTION_STATES.NEEDS_APPROVAL, {
        latestInboundIntent,
        latestMeaningfulIntent,
        latestInbound,
        mentionedCurrentUser,
      }),
      confidence,
      confidenceBand: buildConfidenceBand(confidence),
      priorityBoost: computePriorityBoost(ACTION_STATES.NEEDS_APPROVAL, {
        nowMs,
        latestInboundTimestamp: latestInbound.timestamp,
        latestMessageTimestamp: latestMeaningful.timestamp,
        latestInboundIntent,
        latestMeaningfulIntent,
        mentionedCurrentUser,
        conversation,
      }),
      excludedReason: "",
      participantLabel:
        conversation.participantLabel ||
        conversation.sourceMetadata?.participantLabel ||
        "",
      previewText:
        conversation.previewText ||
        latestInbound.text ||
        latestMeaningful.text ||
        "",
      sourceMetadata: conversation.sourceMetadata || {},
      platformMetadata: conversation.platformMetadata || {},
      openContext: conversation.openContext || {},
      generatedAt: new Date(nowMs).toISOString(),
    };
  }

  const latestInboundNeedsReply = Boolean(
    latestInbound &&
      !latestInboundTakesOwnership &&
      !userRepliedAfterLatestInbound &&
      userExpectedToAct &&
      (latestInboundIntent.hasQuestion ||
        latestInboundIntent.hasRequest ||
        latestInboundIntent.hasFollowUp)
  );

  if (
    latestInboundNeedsReply &&
    latestInboundAgeHours !== null &&
    latestInboundAgeHours <= thresholds.replyWindowHours
  ) {
    const confidence = computeConfidence(ACTION_STATES.WAITING_ON_YOUR_REPLY, {
      conversation,
      latestInbound,
      latestInboundIntent,
      latestMeaningfulIntent,
      addressedToCurrentUser,
      mentionedCurrentUser,
      userExpectedToAct,
    });

    return {
      id: `comm:${conversation.sourceType}:${conversation.conversationId}`,
      sourceType: conversation.sourceType,
      conversationId: conversation.conversationId,
      conversationTitle: conversation.conversationTitle || "Conversation",
      threadId: conversation.threadId || null,
      latestMessageTimestamp: latestMeaningful.timestamp,
      latestInboundTimestamp: latestInbound.timestamp,
      latestOutboundTimestamp: latestOutbound?.timestamp || null,
      latestSenderType: latestMeaningful.senderType || "unknown",
      latestDirection: latestMeaningful.direction || "unknown",
      addressedToCurrentUser,
      userRepliedAfterLatestInbound,
      hasDirectQuestion: Boolean(latestInboundIntent.hasQuestion),
      hasApprovalIntent: Boolean(latestInboundIntent.hasApproval),
      hasFollowUpIntent: Boolean(latestInboundIntent.hasFollowUp),
      hasMentionOfCurrentUser: mentionedCurrentUser,
      actionState: ACTION_STATES.WAITING_ON_YOUR_REPLY,
      actionStateLabel: ACTION_STATE_META[ACTION_STATES.WAITING_ON_YOUR_REPLY].label,
      actionReason: buildActionReason(ACTION_STATES.WAITING_ON_YOUR_REPLY, {
        latestInboundIntent,
        latestMeaningfulIntent,
        latestInbound,
        mentionedCurrentUser,
      }),
      confidence,
      confidenceBand: buildConfidenceBand(confidence),
      priorityBoost: computePriorityBoost(ACTION_STATES.WAITING_ON_YOUR_REPLY, {
        nowMs,
        latestInboundTimestamp: latestInbound.timestamp,
        latestMessageTimestamp: latestMeaningful.timestamp,
        latestInboundIntent,
        latestMeaningfulIntent,
        mentionedCurrentUser,
        conversation,
      }),
      excludedReason: "",
      participantLabel:
        conversation.participantLabel ||
        conversation.sourceMetadata?.participantLabel ||
        "",
      previewText:
        conversation.previewText ||
        latestInbound.text ||
        latestMeaningful.text ||
        "",
      sourceMetadata: conversation.sourceMetadata || {},
      platformMetadata: conversation.platformMetadata || {},
      openContext: conversation.openContext || {},
      generatedAt: new Date(nowMs).toISOString(),
    };
  }

  const promisedFollowUp = Boolean(
    latestOutbound &&
      latestOutboundIntent.hasPromise &&
      latestOutboundAgeHours !== null &&
      latestOutboundAgeHours >= thresholds.promiseFollowUpHours &&
      (!latestInbound || latestOutbound.timestamp >= latestInbound.timestamp)
  );

  if (
    (latestInboundNeedsReply &&
      latestInboundAgeHours !== null &&
      latestInboundAgeHours <= thresholds.followUpWindowHours) ||
    promisedFollowUp
  ) {
    const confidence = computeConfidence(ACTION_STATES.NEEDS_FOLLOW_UP, {
      conversation,
      latestInbound,
      latestInboundIntent,
      latestMeaningfulIntent: latestOutboundIntent,
      addressedToCurrentUser,
      mentionedCurrentUser,
      userExpectedToAct,
      latestMeaningfulIntent,
    });

    return {
      id: `comm:${conversation.sourceType}:${conversation.conversationId}`,
      sourceType: conversation.sourceType,
      conversationId: conversation.conversationId,
      conversationTitle: conversation.conversationTitle || "Conversation",
      threadId: conversation.threadId || null,
      latestMessageTimestamp: latestMeaningful.timestamp,
      latestInboundTimestamp: latestInbound?.timestamp || null,
      latestOutboundTimestamp: latestOutbound?.timestamp || null,
      latestSenderType: latestMeaningful.senderType || "unknown",
      latestDirection: latestMeaningful.direction || "unknown",
      addressedToCurrentUser,
      userRepliedAfterLatestInbound,
      hasDirectQuestion: Boolean(latestInboundIntent.hasQuestion),
      hasApprovalIntent: Boolean(latestInboundIntent.hasApproval),
      hasFollowUpIntent: Boolean(latestInboundIntent.hasFollowUp || promisedFollowUp),
      hasMentionOfCurrentUser: mentionedCurrentUser,
      actionState: ACTION_STATES.NEEDS_FOLLOW_UP,
      actionStateLabel: ACTION_STATE_META[ACTION_STATES.NEEDS_FOLLOW_UP].label,
      actionReason: buildActionReason(ACTION_STATES.NEEDS_FOLLOW_UP, {
        latestInboundIntent,
        latestMeaningfulIntent: latestOutboundIntent,
        latestInbound,
        promisedFollowUp,
      }),
      confidence,
      confidenceBand: buildConfidenceBand(confidence),
      priorityBoost: computePriorityBoost(ACTION_STATES.NEEDS_FOLLOW_UP, {
        nowMs,
        latestInboundTimestamp: latestInbound?.timestamp || latestOutbound?.timestamp || null,
        latestMessageTimestamp: latestMeaningful.timestamp,
        latestInboundIntent,
        latestMeaningfulIntent: latestOutboundIntent,
        mentionedCurrentUser,
        conversation,
      }),
      excludedReason: "",
      participantLabel:
        conversation.participantLabel ||
        conversation.sourceMetadata?.participantLabel ||
        "",
      previewText:
        conversation.previewText ||
        latestInbound?.text ||
        latestOutbound?.text ||
        latestMeaningful.text ||
        "",
      sourceMetadata: conversation.sourceMetadata || {},
      platformMetadata: conversation.platformMetadata || {},
      openContext: conversation.openContext || {},
      generatedAt: new Date(nowMs).toISOString(),
    };
  }

  const latestOutboundAsksForSomething = Boolean(
    latestMeaningful.direction === "outbound" &&
      (latestMeaningfulIntent.hasQuestion ||
        latestMeaningfulIntent.hasRequest ||
        latestMeaningfulIntent.hasApproval)
  );

  if (
    latestInboundTakesOwnership ||
    userRepliedAfterLatestInbound ||
    (latestOutboundAsksForSomething &&
      latestOutboundAgeHours !== null &&
      latestOutboundAgeHours <= thresholds.waitingOnOthersWindowHours)
  ) {
    const confidence = computeConfidence(ACTION_STATES.WAITING_ON_OTHERS, {
      conversation,
      latestInbound,
      latestInboundIntent,
      latestMeaningfulIntent,
      addressedToCurrentUser,
      mentionedCurrentUser,
      userExpectedToAct,
      userRepliedAfterLatestInbound,
    });

    return {
      id: `comm:${conversation.sourceType}:${conversation.conversationId}`,
      sourceType: conversation.sourceType,
      conversationId: conversation.conversationId,
      conversationTitle: conversation.conversationTitle || "Conversation",
      threadId: conversation.threadId || null,
      latestMessageTimestamp: latestMeaningful.timestamp,
      latestInboundTimestamp: latestInbound?.timestamp || null,
      latestOutboundTimestamp: latestOutbound?.timestamp || null,
      latestSenderType: latestMeaningful.senderType || "unknown",
      latestDirection: latestMeaningful.direction || "unknown",
      addressedToCurrentUser,
      userRepliedAfterLatestInbound,
      hasDirectQuestion: Boolean(latestInboundIntent.hasQuestion || latestMeaningfulIntent.hasQuestion),
      hasApprovalIntent: Boolean(latestInboundIntent.hasApproval || latestMeaningfulIntent.hasApproval),
      hasFollowUpIntent: Boolean(latestInboundIntent.hasFollowUp),
      hasMentionOfCurrentUser: mentionedCurrentUser,
      actionState: ACTION_STATES.WAITING_ON_OTHERS,
      actionStateLabel: ACTION_STATE_META[ACTION_STATES.WAITING_ON_OTHERS].label,
      actionReason: buildActionReason(ACTION_STATES.WAITING_ON_OTHERS, {
        latestInboundIntent,
        latestMeaningfulIntent,
        latestInbound,
        responsibilityShifted: latestInboundTakesOwnership,
        userRepliedAfterLatestInbound,
        userExpectedToAct,
      }),
      confidence,
      confidenceBand: buildConfidenceBand(confidence),
      priorityBoost: computePriorityBoost(ACTION_STATES.WAITING_ON_OTHERS, {
        nowMs,
        latestInboundTimestamp: latestInbound?.timestamp || latestOutbound?.timestamp || null,
        latestMessageTimestamp: latestMeaningful.timestamp,
        latestInboundIntent,
        latestMeaningfulIntent,
        mentionedCurrentUser,
        conversation,
      }),
      excludedReason: "",
      participantLabel:
        conversation.participantLabel ||
        conversation.sourceMetadata?.participantLabel ||
        "",
      previewText:
        conversation.previewText ||
        latestMeaningful.text ||
        latestInbound?.text ||
        "",
      sourceMetadata: conversation.sourceMetadata || {},
      platformMetadata: conversation.platformMetadata || {},
      openContext: conversation.openContext || {},
      generatedAt: new Date(nowMs).toISOString(),
    };
  }

  return buildNoActionState(
    conversation,
    {
      conversation,
      latestMeaningful,
      latestInbound,
      latestOutbound,
      latestInboundIntent,
      latestMeaningfulIntent,
      addressedToCurrentUser,
      mentionedCurrentUser,
      userRepliedAfterLatestInbound,
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
  toTimestamp,
  hoursSince,
  detectIntent,
  classifyConversation,
  summarizeActionStates,
  resolveThresholds,
};
