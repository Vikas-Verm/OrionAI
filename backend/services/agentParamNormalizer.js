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
      /\b(?:send|message|tell|notify|reply to)\s+.+?\s+to\s+([a-z][a-z0-9.'@_-]*(?:\s+[a-z][a-z0-9.'@_-]*){0,4})\s+(?:on|via)\s+telegram\b/i,
      /\bto\s+([a-z][a-z0-9.'@_-]*(?:\s+[a-z][a-z0-9.'@_-]*){0,4})\s+(?:on|via)\s+telegram\b/i,
    ],
    slack: [
      /\b(?:send|message|tell|notify|reply to)\s+.+?\s+to\s+([#a-z][a-z0-9._-]*(?:\s+[a-z][a-z0-9._-]*){0,3})\s+(?:on|via)\s+slack\b/i,
      /\bto\s+([#a-z][a-z0-9._-]*(?:\s+[a-z][a-z0-9._-]*){0,3})\s+(?:on|via)\s+slack\b/i,
    ],
    whatsapp: [
      /\b(?:send|message|tell|notify|reply to)\s+.+?\s+to\s+([a-z0-9+][a-z0-9+ .@_-]*(?:\s+[a-z0-9+][a-z0-9+ .@_-]*){0,4})\s+(?:on|via)\s+whatsapp\b/i,
      /\bto\s+([a-z0-9+][a-z0-9+ .@_-]*(?:\s+[a-z0-9+][a-z0-9+ .@_-]*){0,4})\s+(?:on|via)\s+whatsapp\b/i,
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
  const base = new Date(`${dateKey}T00:00:00${APP_TIMEZONE_OFFSET}`);
  base.setUTCDate(base.getUTCDate() + days);
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(
    base.getUTCDate()
  )}`;
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
  }

  // ── Telegram ──────────────────────────────────────────────────────────────
  if (step.tool?.startsWith("telegram_")) {
    if (!params.contact) {
      params.contact = extractNamedRecipient(userMessage, "telegram");
    }
    if (params.contact) params.contact = normalizeTelegramContact(params.contact);
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

  return { ...step, params };
}

module.exports = {
  normalizeStepParams,
  __test: {
    cleanupAssigneeCandidate,
    extractAssigneeFromMessage,
    extractNamedRecipient,
    extractEmails,
    extractDurationMinutes,
    extractCalendarStartDateTime,
    extractMeetingTitle,
  },
};
