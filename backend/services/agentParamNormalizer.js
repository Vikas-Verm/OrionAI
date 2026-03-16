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
