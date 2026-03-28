function extractTicketKeys(text = "") {
  return text.match(/\b[A-Z]+-\d+\b/g) || [];
}

function cleanupAssigneeCandidate(value = "") {
  const cleaned = String(value || "")
    .replace(/^[\s"'`]+|[\s"'`.,!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();
  if (["my", "me", "myself", "current user", "currentuser"].includes(lower)) {
    return null;
  }

  return cleaned;
}

function extractAssigneeFromMessage(text = "") {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return null;

  const lowered = source.toLowerCase();
  if (/\b(my tickets|my issues|my tasks|assigned to me)\b/i.test(source)) {
    return null;
  }

  const patterns = [
    /\b(?:show|get|list|fetch|find|view|open)\s+([a-z][a-z\s.'-]{1,60}?)\s+(?:jira\s+)?(?:tickets|issues|tasks)\b/i,
    /\b(?:jira\s+)?(?:tickets|issues|tasks)\s+(?:for|of)\s+([a-z][a-z\s.'-]{1,60}?)(?:$|\s+(?:in|with|that|who)\b)/i,
    /\bassigned to\s+([a-z][a-z\s.'-]{1,60}?)(?:$|\s+(?:in|with|that|who)\b)/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const candidate = cleanupAssigneeCandidate(match[1]);
    if (candidate) return candidate;
  }

  if (
    /\b(all|everyone|everybody|team)\s+(?:jira\s+)?(?:tickets|issues|tasks)\b/i.test(
      lowered
    )
  ) {
    return "all";
  }

  return null;
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
        extractAssigneeFromMessage(userMessage);
    }

    if (!params.assignee && params.assigneeName) {
      params.assignee = params.assigneeName;
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

module.exports = {
  normalizeStepParams,
  __test: {
    cleanupAssigneeCandidate,
    extractAssigneeFromMessage,
  },
};
