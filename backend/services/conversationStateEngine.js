"use strict";

const {
  chatCompleteNoSystem,
} = require("./llmService");
const classifier = require("./communicationActionClassifier");

const ALLOWED_SEMANTIC_ROLES = new Set([
  "ask",
  "question",
  "approval_request",
  "approval",
  "answer",
  "acknowledgement",
  "commitment",
  "follow_up",
  "resolved",
  "resolution",
  "informational",
]);

function shouldUseSemanticInterpreter(options = {}) {
  if (typeof options.semanticInterpreter === "function") {
    return true;
  }
  if (typeof options.enableSemanticLLM === "boolean") {
    return options.enableSemanticLLM;
  }
  return String(process.env.ORION_CONVERSATION_STATE_LLM || "").toLowerCase() === "enabled";
}

function shouldInterpretMessage(message = {}) {
  const text = classifier.normalizeText(message.text || message.previewText || "");
  return text.length >= 4 && (message.senderType || "human") !== "unknown";
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

function sanitizeSemanticHints(value = {}) {
  const semanticRole = classifier
    .normalizeLower(value.semanticRole || value.role || value.label || "")
    .replace(/\s+/g, "_");
  const normalizedRole = ALLOWED_SEMANTIC_ROLES.has(semanticRole)
    ? semanticRole
    : "informational";
  const confidence = Number(value.confidence);

  return {
    semanticRole: normalizedRole,
    isAsk: Boolean(value.isAsk),
    isQuestion: Boolean(value.isQuestion),
    isApprovalRequest: Boolean(value.isApprovalRequest),
    isApprovalDecision: Boolean(value.isApprovalDecision),
    isAnswer: Boolean(value.isAnswer),
    isAcknowledgement: Boolean(value.isAcknowledgement),
    isCommitment: Boolean(value.isCommitment),
    isFollowUp: Boolean(value.isFollowUp),
    isResolved: Boolean(value.isResolved),
    isInformational:
      value.isInformational === undefined ? normalizedRole === "informational" : Boolean(value.isInformational),
    isUrgent: Boolean(value.isUrgent),
    source: value.source || "llm",
    confidence: Number.isFinite(confidence)
      ? classifier.clamp(confidence, 0, 1)
      : 0.62,
  };
}

function buildSemanticPrompt(message = {}, context = {}) {
  const text = classifier.normalizeText(message.text || message.previewText || "");
  const sourceType = context?.conversation?.sourceType || "conversation";
  const title = classifier.normalizeText(
    context?.conversation?.conversationTitle ||
      context?.conversation?.participantLabel ||
      "Conversation"
  );
  const direction = message.direction || "unknown";

  return [
    "Classify the latest message semantics for a communication-state engine.",
    "Return JSON only.",
    "Use this exact shape:",
    '{"semanticRole":"ask|approval_request|approval|answer|acknowledgement|commitment|follow_up|resolved|informational","isAsk":false,"isQuestion":false,"isApprovalRequest":false,"isApprovalDecision":false,"isAnswer":false,"isAcknowledgement":false,"isCommitment":false,"isFollowUp":false,"isResolved":false,"isInformational":false,"isUrgent":false,"confidence":0.0}',
    "",
    "Guidance:",
    "- approval_request: asks for approval, confirmation, sign-off, or permission.",
    "- approval: grants approval or declines it.",
    "- answer: answers a prior question or request.",
    "- acknowledgement: confirms receipt without necessarily owning the next step.",
    "- commitment: promises to take the next step.",
    "- resolved: clearly closes or resolves the prior ask.",
    "- informational: no direct action request.",
    "",
    `Source: ${sourceType}`,
    `Conversation: ${title}`,
    `Direction: ${direction}`,
    `Message: """${text}"""`,
  ].join("\n");
}

async function defaultSemanticInterpreter(message, context = {}, options = {}) {
  const prompt = buildSemanticPrompt(message, context);
  const raw = await chatCompleteNoSystem(
    prompt,
    options.semanticMaxTokens || 220,
    0.1
  );
  const parsed = extractJsonObject(raw);
  if (!parsed) {
    throw new Error("Could not parse semantic interpreter response");
  }
  return sanitizeSemanticHints(parsed);
}

async function enrichConversationWithSemanticHints(conversation, options = {}) {
  const semanticInterpreter =
    typeof options.semanticInterpreter === "function"
      ? options.semanticInterpreter
      : shouldUseSemanticInterpreter(options)
        ? defaultSemanticInterpreter
        : null;

  if (!semanticInterpreter || !Array.isArray(conversation?.messages) || !conversation.messages.length) {
    return conversation;
  }

  const semanticCandidates = [...conversation.messages]
    .filter((message) => shouldInterpretMessage(message))
    .sort((a, b) => classifier.toTimestamp(a.timestamp) - classifier.toTimestamp(b.timestamp))
    .slice(-(options.semanticMessageLimit || 6));

  if (!semanticCandidates.length) {
    return conversation;
  }

  const hintsById = new Map();
  await Promise.all(
    semanticCandidates.map(async (message) => {
      try {
        const hints = await semanticInterpreter(message, { conversation }, options);
        if (hints && message.id !== undefined && message.id !== null) {
          hintsById.set(String(message.id), sanitizeSemanticHints(hints));
        }
      } catch (err) {
        if (options.includeDebug || process.env.NODE_ENV !== "production") {
          console.debug(
            `[conversation-state] semantic interpreter fallback for ${conversation.sourceType}:${conversation.conversationId}:`,
            err.message
          );
        }
      }
    })
  );

  if (!hintsById.size) {
    return conversation;
  }

  return {
    ...conversation,
    messages: (conversation.messages || []).map((message) => {
      const key = message?.id !== undefined && message?.id !== null ? String(message.id) : null;
      if (!key || !hintsById.has(key)) return message;
      return {
        ...message,
        semanticHints: {
          ...(message.semanticHints || {}),
          ...hintsById.get(key),
        },
      };
    }),
  };
}

async function classifyConversationWithSemantics(conversation, options = {}) {
  const enrichedConversation = await enrichConversationWithSemanticHints(
    conversation,
    options
  );
  return classifier.classifyConversation(enrichedConversation, options);
}

module.exports = {
  ...classifier,
  buildSemanticPrompt,
  classifyConversationWithSemantics,
  enrichConversationWithSemanticHints,
  shouldUseSemanticInterpreter,
};
