"use strict";

const CommunicationTelemetryEvent = require("../models/CommunicationTelemetryEvent");
const {
  parseCanonicalConversationKey,
  buildCanonicalConversationKey,
} = require("./conversationActionStateMachine");

const ALLOWED_KINDS = new Set(["open", "action", "state_change"]);

function normalizeString(value = "", max = 240) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return "";
  return text.length > max ? text.slice(0, max) : text;
}

function safeJsonMeta(meta = {}) {
  if (!meta || typeof meta !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(meta));
  } catch {
    return {};
  }
}

function resolveConversationContext({ itemId, sourceApp, conversationId } = {}) {
  let resolvedSourceApp = normalizeString(sourceApp, 60).toLowerCase();
  let resolvedConversationId = normalizeString(conversationId, 240);

  if ((!resolvedSourceApp || !resolvedConversationId) && itemId) {
    const parsed = parseCanonicalConversationKey(itemId);
    if (parsed) {
      resolvedSourceApp = resolvedSourceApp || parsed.sourceApp;
      resolvedConversationId = resolvedConversationId || parsed.conversationId;
    }
  }

  const canonicalItemId =
    normalizeString(itemId, 240) ||
    buildCanonicalConversationKey(resolvedSourceApp, resolvedConversationId) ||
    "";

  return {
    itemId: canonicalItemId,
    sourceApp: resolvedSourceApp,
    conversationId: resolvedConversationId,
  };
}

async function recordTelemetryEvent(userId, payload = {}) {
  if (!userId) return null;

  const kind = String(payload.kind || "").trim().toLowerCase();
  if (!ALLOWED_KINDS.has(kind)) {
    throw new Error(
      `Unsupported telemetry kind "${payload.kind}". Allowed: ${[...ALLOWED_KINDS].join(", ")}.`
    );
  }

  const context = resolveConversationContext(payload);
  const document = {
    userId,
    kind,
    itemId: context.itemId,
    sourceApp: context.sourceApp,
    conversationId: context.conversationId,
    threadId: normalizeString(payload.threadId, 240),
    fromState: normalizeString(payload.fromState, 60).toLowerCase(),
    toState: normalizeString(payload.toState, 60).toLowerCase(),
    action: normalizeString(payload.action, 60).toLowerCase(),
    reason: normalizeString(payload.reason, 240),
    origin: normalizeString(payload.origin, 60),
    meta: safeJsonMeta(payload.meta),
  };

  try {
    const created = await CommunicationTelemetryEvent.create(document);
    return created.toObject();
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[communication-telemetry] failed to record:", err.message);
    }
    return null;
  }
}

function recordOpenEvent(userId, payload = {}) {
  return recordTelemetryEvent(userId, { ...payload, kind: "open" });
}

function recordActionEvent(userId, payload = {}) {
  return recordTelemetryEvent(userId, { ...payload, kind: "action" });
}

function recordStateChangeEvent(userId, payload = {}) {
  return recordTelemetryEvent(userId, { ...payload, kind: "state_change" });
}

async function getRecentTelemetry(userId, { limit = 50, kind = null } = {}) {
  if (!userId) return [];
  const filter = { userId };
  if (kind && ALLOWED_KINDS.has(kind)) filter.kind = kind;
  const events = await CommunicationTelemetryEvent.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 50, 1), 500))
    .lean();
  return events;
}

module.exports = {
  ALLOWED_KINDS: [...ALLOWED_KINDS],
  recordTelemetryEvent,
  recordOpenEvent,
  recordActionEvent,
  recordStateChangeEvent,
  getRecentTelemetry,
  __test: {
    resolveConversationContext,
    normalizeString,
    safeJsonMeta,
  },
};
