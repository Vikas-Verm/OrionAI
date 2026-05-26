const {
  APP_TIMEZONE_OFFSET,
  getTimezoneDateKey,
} = require("./calendarWindowUtils");

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

function pad(value) {
  return String(value).padStart(2, "0");
}

function normalizeNameCandidate(value = "") {
  return String(value || "")
    .replace(/^[\s"'`]+|[\s"'`.,!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNamedRecipient(text = "", platform = "") {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return null;

  const patternsByPlatform = {
    telegram: [
      /\b(?:send|message|tell|notify|reply to)\s+.+?\s+to\s+([a-z][a-z0-9.'@_-]*(?:\s+[a-z][a-z0-9.'@_-]*){0,4})\s+(?:on|in|via)\s+telegram\b/i,
      /\bto\s+([a-z][a-z0-9.'@_-]*(?:\s+[a-z][a-z0-9.'@_-]*){0,4})\s+(?:on|in|via)\s+telegram\b/i,
    ],
    slack: [
      /\b(?:send|message|tell|notify|reply to)\s+.+?\s+to\s+([#a-z][a-z0-9._-]*(?:\s+[a-z][a-z0-9._-]*){0,3})\s+(?:on|in|via)\s+slack\b/i,
      /\bto\s+([#a-z][a-z0-9._-]*(?:\s+[a-z][a-z0-9._-]*){0,3})\s+(?:on|in|via)\s+slack\b/i,
    ],
    whatsapp: [
      /\b(?:send|message|tell|notify|reply to)\s+.+?\s+to\s+([a-z0-9+][a-z0-9+ .@_-]*(?:\s+[a-z0-9+][a-z0-9+ .@_-]*){0,4})\s+(?:on|in|via)\s+whatsapp\b/i,
      /\bto\s+([a-z0-9+][a-z0-9+ .@_-]*(?:\s+[a-z0-9+][a-z0-9+ .@_-]*){0,4})\s+(?:on|in|via)\s+whatsapp\b/i,
    ],
  };

  const patterns = patternsByPlatform[platform] || [];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const candidate = normalizeNameCandidate(match[1]);
    if (candidate) return candidate;
  }

  return null;
}

const DRAFT_MESSAGE_TOPIC_RE =
  /\b(romantic|flirty|love|birthday|anniversary|apology|professional|formal|funny|sweet|motivational|congratulatory|invitation|reminder|follow[-\s]?up|acknowledg(?:e|ement|ment)?|draft|write|compose|about|regarding|topic)\b/i;

const NON_EXACT_MESSAGE_CONTEXT_RE =
  /\b(invoice|bill|document|pdf|file|attachment|report|latest|recent|last|newest|ticket|issue|task|meeting|calendar|event|schedule|summary|digest)\b/i;

function cleanExactMessageCandidate(value = "", options = {}) {
  const candidate = normalizeNameCandidate(value)
    .replace(/\s+(?:message|msg|text)$/i, "")
    .trim();
  if (!candidate) return null;
  if (DRAFT_MESSAGE_TOPIC_RE.test(candidate)) return null;
  if (options.rejectContext && NON_EXACT_MESSAGE_CONTEXT_RE.test(candidate)) {
    return null;
  }
  return candidate;
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMessagingExactMessage(text = "", platform = "") {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  const platformName = String(platform || "").trim().toLowerCase();
  if (!source || !platformName) return null;

  const platformRe = escapeRegExp(platformName);
  const platformMention = new RegExp(`\\b${platformRe}\\b`, "i");
  if (!platformMention.test(source)) return null;

  const quoted = source.match(/["']([^"']{1,500})["']/);
  if (quoted) {
    return cleanExactMessageCandidate(quoted[1]);
  }

  const patterns = [
    new RegExp(
      `\\b(?:send|message|text)\\s+(.+?)\\s+(?:message|msg|text)\\s+to\\s+.+?\\s+(?:on|in|via)\\s+${platformRe}\\b`,
      "i"
    ),
    new RegExp(
      `\\b(?:send|message|text)\\s+(?:message|msg|text)\\s+(.+?)\\s+to\\s+.+?\\s+(?:on|in|via)\\s+${platformRe}\\b`,
      "i"
    ),
    new RegExp(
      `\\b(?:send|message|text)\\s+(.+?)\\s+to\\s+.+?\\s+(?:on|in|via)\\s+${platformRe}\\b`,
      "i"
    ),
    new RegExp(
      `\\b(?:message|text|tell|notify)\\s+.+?\\s+(?:on|in|via)\\s+${platformRe}\\s+(?:that|saying|with text)\\s+(.+?)$`,
      "i"
    ),
    new RegExp(
      `\\b(?:saying|that says|with text)\\s+(.+?)\\s+to\\s+.+?\\s+(?:on|in|via)\\s+${platformRe}\\b`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const candidate = cleanExactMessageCandidate(match[1], {
      rejectContext: pattern === patterns[2],
    });
    if (candidate) return candidate;
  }

  return null;
}

function extractTelegramExactMessage(text = "") {
  return extractMessagingExactMessage(text, "telegram");
}

function markExactMessagingSend(params, userMessage, platform) {
  delete params.messageSource;
  delete params.skipConfirmation;

  const exactMessage = extractMessagingExactMessage(userMessage, platform);
  if (!exactMessage) return;

  params.message = exactMessage;
  params.messageSource = "user_exact";
  params.skipConfirmation = true;
}

function extractEmails(text = "") {
  const matches = String(text || "").match(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
  );
  return [...new Set(matches || [])];
}

function extractDurationMinutes(text = "") {
  const source = String(text || "").toLowerCase();
  const hourMatch = source.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(hour|hours|hr|hrs)\b/);
  if (hourMatch) {
    return Math.round(Number(hourMatch[1]) * 60);
  }

  const minuteMatch = source.match(/\bfor\s+(\d+)\s*(minute|minutes|min|mins)\b/);
  if (minuteMatch) {
    return Number(minuteMatch[1]);
  }

  return null;
}

function isIsoDateTime(value = "") {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(value || "").trim());
}

function addDays(dateKey, days) {
  const base = new Date(`${dateKey}T12:00:00${APP_TIMEZONE_OFFSET}`);
  base.setUTCDate(base.getUTCDate() + days);
  return getTimezoneDateKey(base);
}

function nextWeekdayDateKey(baseDateKey, weekdayIndex) {
  const base = new Date(`${baseDateKey}T00:00:00${APP_TIMEZONE_OFFSET}`);
  const currentWeekday = (base.getUTCDay() + 6) % 7;
  let diff = weekdayIndex - currentWeekday;
  if (diff <= 0) diff += 7;
  return addDays(baseDateKey, diff);
}

function extractDateKey(text = "", baseDate = new Date()) {
  const source = String(text || "");
  const lowered = source.toLowerCase();
  const today = getTimezoneDateKey(baseDate);

  if (/\bday after tomorrow\b/.test(lowered)) return addDays(today, 2);
  if (/\btomorrow\b/.test(lowered)) return addDays(today, 1);
  if (/\btoday\b/.test(lowered)) return today;

  const explicitYmd = source.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (explicitYmd) return `${explicitYmd[1]}-${explicitYmd[2]}-${explicitYmd[3]}`;

  const explicitDmy = source.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (explicitDmy) {
    return `${explicitDmy[3]}-${pad(explicitDmy[2])}-${pad(explicitDmy[1])}`;
  }

  const monthNames = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  const monthRegex =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/i;
  const monthMatch = source.match(monthRegex);
  if (monthMatch) {
    const currentYear = Number(today.slice(0, 4));
    const year = Number(monthMatch[3] || currentYear);
    const month = monthNames[monthMatch[1].toLowerCase()];
    return `${year}-${pad(month)}-${pad(monthMatch[2])}`;
  }

  const weekdayNames = {
    monday: 0,
    tuesday: 1,
    wednesday: 2,
    thursday: 3,
    friday: 4,
    saturday: 5,
    sunday: 6,
  };
  const nextWeekdayMatch = lowered.match(
    /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
  );
  if (nextWeekdayMatch) {
    return nextWeekdayDateKey(today, weekdayNames[nextWeekdayMatch[1]]);
  }

  const weekdayMatch = lowered.match(
    /\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
  );
  if (weekdayMatch) {
    return nextWeekdayDateKey(today, weekdayNames[weekdayMatch[1]]);
  }

  return null;
}

function extractTimeParts(text = "") {
  const source = String(text || "").toLowerCase();
  const meridiemMatch = source.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (meridiemMatch) {
    let hour = Number(meridiemMatch[1]);
    const minute = Number(meridiemMatch[2] || 0);
    const meridiem = meridiemMatch[3];
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return { hour, minute };
  }

  const twentyFourHourMatch = source.match(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHourMatch) {
    return {
      hour: Number(twentyFourHourMatch[1]),
      minute: Number(twentyFourHourMatch[2]),
    };
  }

  return null;
}

function extractCalendarStartDateTime(text = "", baseDate = new Date()) {
  const dateKey = extractDateKey(text, baseDate);
  const time = extractTimeParts(text);

  if (!dateKey || !time) return null;

  return `${dateKey}T${pad(time.hour)}:${pad(time.minute)}:00${APP_TIMEZONE_OFFSET}`;
}

function extractMeetingTitle(text = "") {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return null;

  const patterns = [
    /\b(?:schedule|create|book|set up|add)\s+(?:a\s+)?(?:meeting|call|event)\s+with\s+.+?\s+for\s+(.+?)(?:\s+(?:at|on|today|tomorrow|next\b|\d{1,2}[:/-])|,|$)/i,
    /\b(?:schedule|create|book|set up|add)\s+(?:a\s+)?(?:meeting|call|event)\s+for\s+(.+?)(?:\s+(?:at|on|today|tomorrow|next\b|\d{1,2}[:/-])|,|$)/i,
    /\b(?:about|regarding)\s+(.+?)(?:\s+(?:at|on|today|tomorrow|next\b|\d{1,2}[:/-])|,|$)/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const candidate = normalizeNameCandidate(match[1]);
    if (candidate) return candidate;
  }

  if (/\b(meeting|call)\b/i.test(source)) {
    return "Meeting";
  }

  return null;
}

function stripCalendarTitleNoise(value = "") {
  let candidate = normalizeNameCandidate(value);
  if (!candidate) return null;

  candidate = candidate
    .replace(/\b(?:today's|tomorrow's|today|tomorrow|upcoming|scheduled)\b/gi, " ")
    .replace(
      /\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi,
      " "
    )
    .replace(
      /\b(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
      " "
    )
    .replace(/\bnext\s+(?:week|month)\b/gi, " ")
    .replace(/\b(?:meeting|call|event|session|appointment)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalizeNameCandidate(candidate) || null;
}

function extractCalendarDeleteTitle(text = "") {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return null;

  const quoted = source.match(/["']([^"']{2,120})["']/);
  if (quoted) return stripCalendarTitleNoise(quoted[1]);

  const namedPatterns = [
    /\b(?:called|named|titled|about|regarding)\s+(.+?)(?:\s+(?:today|tomorrow|on\s+\d|at\s+\d{1,2}|next\s+\w+)|,|$)/i,
    /\b(?:delete|cancel|remove)\s+(?:my\s+|the\s+|a\s+|an\s+)?(?:meeting|call|event|session|appointment)\s+for\s+(.+?)(?:\s+(?:today|tomorrow|on\s+\d|at\s+\d{1,2}|next\s+\w+)|,|$)/i,
  ];

  for (const pattern of namedPatterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const candidate = stripCalendarTitleNoise(match[1]);
    if (candidate) return candidate;
  }

  let candidate = source
    .replace(/^\s*(?:please\s+)?(?:delete|cancel|remove)\s+/i, "")
    .replace(/^(?:my\s+|the\s+|a\s+|an\s+)/i, "")
    .replace(/^(?:today's|tomorrow's|today|tomorrow|upcoming|scheduled)\s+/i, "")
    .replace(/^(?:meeting|call|event|session|appointment)\s+/i, "")
    .replace(/^(?:with|for|about|regarding|called|named|titled)\s+/i, "")
    .replace(/\s+(?:today|tomorrow|on\s+\d|at\s+\d{1,2}|next\s+\w+).*$/i, "")
    .replace(/(?:\s+)?(?:meeting|call|event|session|appointment)$/i, "");

  return stripCalendarTitleNoise(candidate);
}

// ── Main normalizer ───────────────────────────────────────────────────────────

function normalizeStepParams(step, userMessage = "", options = {}) {
  const params = { ...(step.params || {}) };
  const baseDate = options.baseDate || new Date();

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
    if (!params.channel) {
      params.channel = extractNamedRecipient(userMessage, "slack");
    }
    if (params.channel) params.channel = normalizeSlackChannel(params.channel);

    if (step.tool === "slack_send_message") {
      markExactMessagingSend(params, userMessage, "slack");
    }
  }

  // ── Telegram ──────────────────────────────────────────────────────────────
  if (step.tool?.startsWith("telegram_")) {
    if (!params.contact) {
      params.contact = extractNamedRecipient(userMessage, "telegram");
    }
    if (params.contact) params.contact = normalizeTelegramContact(params.contact);

    if (step.tool === "telegram_send_message") {
      markExactMessagingSend(params, userMessage, "telegram");
    }
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  if (step.tool?.startsWith("whatsapp_") || step.tool === "send_whatsapp") {
    if (!params.contact && !params.to) {
      const recipient = extractNamedRecipient(userMessage, "whatsapp");
      if (recipient) {
        params.contact = recipient;
        params.to = recipient;
      }
    }

    if (step.tool === "whatsapp_send_message") {
      markExactMessagingSend(params, userMessage, "whatsapp");
    }
  }

  // ── Calendar ──────────────────────────────────────────────────────────────
  if (step.tool === "calendar_create" || step.tool === "calendar_update") {
    if (!Array.isArray(params.attendees) || !params.attendees.length) {
      const attendeeEmails = extractEmails(userMessage);
      if (attendeeEmails.length) params.attendees = attendeeEmails;
    }

    if (step.tool === "calendar_create" && !params.title) {
      params.title = extractMeetingTitle(userMessage) || "Meeting";
    }

    if (!params.durationMinutes) {
      const durationMinutes = extractDurationMinutes(userMessage);
      if (durationMinutes) params.durationMinutes = durationMinutes;
    }

    const normalizedStartFromMessage = extractCalendarStartDateTime(
      userMessage,
      baseDate
    );

    if (normalizedStartFromMessage) {
      params.startDateTime = normalizedStartFromMessage;
    }

    if (
      !params.startDateTime ||
      !isIsoDateTime(params.startDateTime) ||
      String(params.startDateTime).toLowerCase().includes("today") ||
      String(params.startDateTime).toLowerCase().includes("tomorrow")
    ) {
      const normalizedStart =
        extractCalendarStartDateTime(params.startDateTime || "", baseDate) ||
        extractCalendarStartDateTime(userMessage, baseDate);
      if (normalizedStart) params.startDateTime = normalizedStart;
    }

    if (
      step.tool === "calendar_create" &&
      typeof params.addMeet === "undefined" &&
      /\b(meeting|call|meet|google meet|gmeet)\b/i.test(userMessage)
    ) {
      params.addMeet = true;
    }
  }

  if (step.tool === "calendar_delete") {
    if (!params.eventId) {
      const hasSpecificTitle = Boolean(stripCalendarTitleNoise(params.title));
      if (!hasSpecificTitle) {
        const title = extractCalendarDeleteTitle(userMessage);
        if (title) params.title = title;
      }
    }

    const dateKey = extractDateKey(userMessage, baseDate);
    if (dateKey) {
      if (!params.dateFrom) params.dateFrom = dateKey;
      if (!params.dateTo) params.dateTo = dateKey;
    }
  }

  return { ...step, params };
}

module.exports = {
  normalizeStepParams,
  __test: {
    cleanupAssigneeCandidate,
    extractAssigneeFromMessage,
    extractNamedRecipient,
    extractMessagingExactMessage,
    extractTelegramExactMessage,
    extractEmails,
    extractDurationMinutes,
    extractCalendarStartDateTime,
    extractMeetingTitle,
    extractCalendarDeleteTitle,
  },
};
