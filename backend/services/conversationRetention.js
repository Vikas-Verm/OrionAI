"use strict";

const DEFAULT_AGENT_CONVERSATION_TTL_HOURS = 6;

function getAgentConversationTtlHours() {
  const raw = Number.parseInt(process.env.AGENT_CONVERSATION_TTL_HOURS || "", 10);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_AGENT_CONVERSATION_TTL_HOURS;
}

function isAgentConversationMode(mode) {
  return String(mode || "").toLowerCase() === "agent";
}

function computeAgentConversationExpiry(now = new Date()) {
  return new Date(now.getTime() + getAgentConversationTtlHours() * 60 * 60 * 1000);
}

function buildActiveConversationQuery(query = {}, now = new Date()) {
  return {
    ...query,
    isDeleted: false,
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
  };
}

module.exports = {
  DEFAULT_AGENT_CONVERSATION_TTL_HOURS,
  getAgentConversationTtlHours,
  isAgentConversationMode,
  computeAgentConversationExpiry,
  buildActiveConversationQuery,
};
