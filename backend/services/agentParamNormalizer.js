function extractTicketKeys(text = "") {
  const regex = /\b[A-Z]+-\d+\b/g;
  return text.match(regex) || [];
}

function extractPersonName(text = "") {
  // simple human-name guess
  const match = text.match(/\b([A-Z][a-z]{2,})(?:\s+[A-Z][a-z]+)?\b/);
  return match ? match[0] : null;
}

function normalizeStepParams(step, userMessage) {
  const params = { ...(step.params || {}) };

  // ── Auto extract Jira ticket keys ─────────────────
  if (!params.ticketKey) {
    const keys = extractTicketKeys(userMessage);
    if (keys.length) params.ticketKey = keys[0];
  }

  // ── Fix assignee variations ───────────────────────
  if (!params.assigneeName) {
    params.assigneeName =
      params.assignee ||
      params.user ||
      params.person ||
      extractPersonName(userMessage);
  }

  // ── Normalize priority
  if (params.priority) {
    params.priority =
      params.priority.charAt(0).toUpperCase() +
      params.priority.slice(1).toLowerCase();
  }

  return {
    ...step,
    params,
  };
}

module.exports = { normalizeStepParams };
/**
 * agentParamNormalizer.js
 *
 * Pre-processes step params before they reach a sub-agent.
 * Handles common LLM output quirks:
 *   - Extracting Jira ticket keys from free text
 *   - Normalising assignee / priority casing
 *   - Normalising Slack channel names
 *   - Stripping Telegram contact prefixes
 */

("use strict");

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTicketKeys(text = "") {
  return text.match(/\b[A-Z]+-\d+\b/g) || [];
}

function extractPersonName(text = "") {
  const match = text.match(/\b([A-Z][a-z]{2,})(?:\s+[A-Z][a-z]+)?\b/);
  return match ? match[0] : null;
}

/** Strip leading # from Slack channel names, lowercase */
function normalizeSlackChannel(channel = "") {
  return channel.replace(/^#/, "").trim();
}

/** Strip leading @ from Telegram contacts */
function normalizeTelegramContact(contact = "") {
  return contact.replace(/^@/, "").trim();
}

// ── Main normalizer ───────────────────────────────────────────────────────────

function normalizeStepParams(step, userMessage = "") {
  const params = { ...(step.params || {}) };

  // ── Jira ──────────────────────────────────────────────────────────────────
  if (step.tool?.startsWith("jira_")) {
    // Auto-extract ticket key from user message if not provided
    if (!params.ticketKey) {
      const keys = extractTicketKeys(userMessage);
      if (keys.length) params.ticketKey = keys[0];
    }

    // Merge assignee variants into a single canonical field
    if (!params.assigneeName) {
      params.assigneeName =
        params.assignee ||
        params.user ||
        params.person ||
        extractPersonName(userMessage);
    }

    // Capitalise priority: "high" → "High"
    if (params.priority) {
      params.priority =
        params.priority.charAt(0).toUpperCase() +
        params.priority.slice(1).toLowerCase();
    }
  }

  // ── Slack ─────────────────────────────────────────────────────────────────
  if (step.tool?.startsWith("slack_")) {
    if (params.channel) {
      params.channel = normalizeSlackChannel(params.channel);
    }
  }

  // ── Telegram ──────────────────────────────────────────────────────────────
  if (step.tool?.startsWith("telegram_")) {
    if (params.contact) {
      params.contact = normalizeTelegramContact(params.contact);
    }
  }

  return { ...step, params };
}

module.exports = { normalizeStepParams };
