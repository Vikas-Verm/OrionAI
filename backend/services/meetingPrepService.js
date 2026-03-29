"use strict";

const Conversation = require("../models/conversation");
const { chatCompleteNoSystem } = require("./llmService");
const { calendarGetEvents, calendarGetToday } = require("./tools/toolCalendar");
const { toolGmailSearchEmails } = require("./tools/toolGmail");
const { toolSearchTickets } = require("./tools/toolJira");
const { toolTelegramSearchMessages } = require("./tools/toolTelegram");
const {
  APP_TIMEZONE_OFFSET,
  getTimezoneDateKey,
} = require("./calendarWindowUtils");
const {
  normalizeCommunicationText,
} = require("./communicationContactMatcher");

const PREP_PATTERNS = [
  /\bprep me\b/i,
  /\bprepare me\b/i,
  /\bbrief me\b/i,
  /\bsummarize what i should know\b/i,
  /\bwhat should i bring\b/i,
  /\bwhat questions should i ask\b/i,
  /\bget me ready\b/i,
  /\bhelp me get ready\b/i,
];

const MEETING_CONTEXT_RE =
  /\b(meeting|call|invite|event|sync|standup|review|demo|discussion)\b/i;

const TITLE_NOISE_WORDS = new Set([
  "meeting",
  "call",
  "invite",
  "event",
  "sync",
  "standup",
  "review",
  "demo",
  "discussion",
  "today",
  "todays",
  "tomorrow",
  "tomorrows",
  "the",
  "my",
  "for",
  "prep",
  "brief",
]);

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pad(value) {
  return String(value).padStart(2, "0");
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

function escapeRegex(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatLocalDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAttendees(attendees = []) {
  const people = (attendees || [])
    .map((attendee) => attendee?.name || attendee?.email || "")
    .map((value) => cleanText(value))
    .filter(Boolean);

  if (!people.length) return "No attendees listed";
  return people.join(", ");
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function extractDateKey(text = "", baseDate = new Date()) {
  const source = cleanText(text);
  const lowered = source.toLowerCase();
  const today = getTimezoneDateKey(baseDate);

  if (/\bday after tomorrow\b/.test(lowered)) return addDays(today, 2);
  if (/\btomorrow\b/.test(lowered)) return addDays(today, 1);
  if (/\btoday('?s)?\b/.test(lowered)) return today;

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
  const monthMatch = source.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/i
  );
  if (monthMatch) {
    const year = Number(monthMatch[3] || today.slice(0, 4));
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

function extractRelativeMinutes(text = "") {
  const source = cleanText(text).toLowerCase();
  const hourMinuteMatch = source.match(
    /\b(?:starting\s+)?in\s+(\d{1,2})\s*h(?:our|ours)?\s*(\d{1,2})?\s*m?(?:in|ins|ute|utes)?\b/
  );
  if (hourMinuteMatch) {
    return Number(hourMinuteMatch[1]) * 60 + Number(hourMinuteMatch[2] || 0);
  }

  const compactHourMinuteMatch = source.match(
    /\b(?:starting\s+)?in\s+(\d{1,2})h\s*(\d{1,2})m\b/
  );
  if (compactHourMinuteMatch) {
    return Number(compactHourMinuteMatch[1]) * 60 + Number(compactHourMinuteMatch[2]);
  }

  const hourOnlyMatch = source.match(
    /\b(?:starting\s+)?in\s+(\d{1,2})\s*(hour|hours|hr|hrs|h)\b/
  );
  if (hourOnlyMatch) {
    return Number(hourOnlyMatch[1]) * 60;
  }

  const match = source.match(
    /\b(?:starting\s+)?in\s+(\d{1,3})\s*(minute|minutes|min|mins)\b/
  );
  return match ? Number(match[1]) : null;
}

function normalizeTitleCandidate(value = "") {
  return cleanText(value)
    .replace(/^["'“”‘’]+|["'“”‘’.,!?]+$/g, "")
    .trim();
}

function extractQuotedMeetingTitle(text = "") {
  const source = cleanText(text);
  const match = source.match(/["'“”]([^"'“”]{3,120})["'“”]/);
  return match ? normalizeTitleCandidate(match[1]) : null;
}

function extractAttendeeHint(text = "") {
  const source = cleanText(text);
  const patterns = [
    /\bmeeting with\s+(.+?)(?:\s+(?:starting|in|at|on|today|tomorrow|next|this)\b|[,.]|$)/i,
    /\bwith\s+(.+?)(?:\s+(?:starting|in|at|on|today|tomorrow|next|this)\b|[,.]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const candidate = normalizeTitleCandidate(match[1]);
    if (candidate && candidate.length >= 2) return candidate;
  }

  return null;
}

function extractTitleHint(text = "") {
  const quoted = extractQuotedMeetingTitle(text);
  if (quoted) return quoted;

  const source = cleanText(text);
  const patterns = [
    /\bbrief me for\s+(?:today'?s\s+|tomorrow'?s\s+)?(.+?)(?:\s+(?:meeting|call|sync|discussion|review|demo)|[,.]|$)/i,
    /\bprep me for\s+(?:the\s+)?(?:meeting|call|sync|discussion|review|demo)\s+(.+?)(?:\s+(?:starting|in|at|on|today|tomorrow|next|this)\b|[,.]|$)/i,
    /\bmeeting\s+(.+?)(?:\s+(?:starting|in|at|on|today|tomorrow|next|this)\b|[,.]|$)/i,
    /\bfor\s+(.+?)(?:\s+(?:meeting|call|sync|discussion|review|demo)|[,.]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const candidate = normalizeTitleCandidate(match[1]);
    if (
      candidate &&
      !/^my$/i.test(candidate) &&
      !/^with\s+/i.test(candidate)
    ) {
      return candidate;
    }
  }

  return null;
}

function significantTerms(text = "", max = 4) {
  return uniqueStrings(
    normalizeCommunicationText(text)
      .split(" ")
      .filter(
        (term) => term.length >= 3 && !TITLE_NOISE_WORDS.has(term)
      )
      .slice(0, max)
  );
}

function extractMeetingPrepReference(text = "", options = {}) {
  const baseDate = options.baseDate || new Date();
  const titleHint = extractTitleHint(text);
  const attendeeHint = extractAttendeeHint(text);
  const relativeStartMinutes = extractRelativeMinutes(text);
  const dateKey = extractDateKey(text, baseDate);
  const windowHours = Math.min(
    12,
    Math.max(
      4,
      relativeStartMinutes
        ? Math.ceil((relativeStartMinutes + 180) / 60)
        : 12
    )
  );

  return {
    titleHint: titleHint || null,
    attendeeHint: attendeeHint || null,
    relativeStartMinutes:
      Number.isFinite(relativeStartMinutes) && relativeStartMinutes >= 0
        ? relativeStartMinutes
        : null,
    dateFrom: dateKey || null,
    dateTo: dateKey || null,
    windowHours,
  };
}

function isMeetingPrepRequest(text = "") {
  const source = cleanText(text);
  if (!source) return false;

  const hasPrepPhrase = PREP_PATTERNS.some((pattern) => pattern.test(source));
  if (!hasPrepPhrase) return false;

  return (
    MEETING_CONTEXT_RE.test(source) ||
    /\bstarting in\s+\d+\s*(minute|minutes|min|mins)\b/i.test(source) ||
    /\bin\s+\d+\s*(minute|minutes|min|mins)\b/i.test(source) ||
    Boolean(extractQuotedMeetingTitle(source))
  );
}

function buildCalendarLookupStep(reference = {}, existingPlan = {}) {
  const existingCalendarStep = (existingPlan.steps || []).find((step) =>
    ["calendar_get_today", "calendar_get_events", "calendar_get_week"].includes(
      step?.tool
    )
  );

  if (reference.titleHint) {
    return {
      tool: "calendar_get_events",
      params: {
        query: reference.titleHint,
        dateFrom: reference.dateFrom || undefined,
        dateTo: reference.dateTo || reference.dateFrom || undefined,
        maxResults: 10,
      },
    };
  }

  if (existingCalendarStep) {
    const params = { ...(existingCalendarStep.params || {}) };

    if (existingCalendarStep.tool === "calendar_get_events") {
      if (reference.dateFrom && !params.dateFrom) params.dateFrom = reference.dateFrom;
      if (reference.dateTo && !params.dateTo) params.dateTo = reference.dateTo;
      if (!params.query && (reference.titleHint || reference.attendeeHint)) {
        params.query = reference.titleHint || reference.attendeeHint;
      }
      if (!params.maxResults) params.maxResults = 10;
      return { tool: "calendar_get_events", params };
    }

    if (existingCalendarStep.tool === "calendar_get_today") {
      return {
        tool: "calendar_get_today",
        params: {
          upcomingOnly: true,
          windowHours:
            Number(params.windowHours || 0) > 0
              ? params.windowHours
              : reference.windowHours,
        },
      };
    }

    return {
      tool: existingCalendarStep.tool,
      params,
    };
  }

  if (reference.dateFrom) {
    return {
      tool: "calendar_get_events",
      params: {
        dateFrom: reference.dateFrom,
        dateTo: reference.dateTo,
        query: reference.titleHint || reference.attendeeHint || undefined,
        maxResults: 10,
      },
    };
  }

  return {
    tool: "calendar_get_today",
    params: {
      upcomingOnly: true,
      windowHours: reference.windowHours,
    },
  };
}

function buildMeetingPrepPlan(userMessage = "", existingPlan = {}, options = {}) {
  const reference = extractMeetingPrepReference(userMessage, options);
  const calendarStep = buildCalendarLookupStep(reference, existingPlan);

  return {
    isAgentTask: true,
    confidence: Math.max(Number(existingPlan?.confidence) || 0, 0.92),
    intent:
      existingPlan?.intent ||
      "Prepare a meeting brief using calendar details and connected-app context",
    steps: [
      calendarStep,
      {
        tool: "meeting_prep",
        params: {
          ...reference,
          userQuestion: userMessage,
        },
      },
    ],
  };
}

function scoreTitleMatch(eventTitle = "", titleHint = "") {
  const normalizedEvent = normalizeCommunicationText(eventTitle);
  const normalizedHint = normalizeCommunicationText(titleHint);
  if (!normalizedEvent || !normalizedHint) return 0;
  if (normalizedEvent === normalizedHint) return 60;
  if (normalizedEvent.includes(normalizedHint)) return 44;

  const eventTerms = significantTerms(normalizedEvent, 8);
  const hintTerms = significantTerms(normalizedHint, 8);
  const overlap = hintTerms.filter((term) => eventTerms.includes(term)).length;
  if (!overlap) return 0;
  return 12 + overlap * 10;
}

function scoreAttendeeMatch(attendees = [], attendeeHint = "") {
  const normalizedHint = normalizeCommunicationText(attendeeHint);
  if (!normalizedHint) return 0;

  const haystack = (attendees || [])
    .flatMap((attendee) => [attendee?.name, attendee?.email])
    .map((value) => normalizeCommunicationText(value))
    .filter(Boolean);

  if (!haystack.length) return 0;
  if (haystack.some((value) => value === normalizedHint)) return 50;
  if (haystack.some((value) => value.includes(normalizedHint))) return 36;

  const hintTerms = significantTerms(normalizedHint, 6);
  const overlap = haystack.some((value) =>
    hintTerms.some((term) => value.includes(term))
  );
  return overlap ? 18 : 0;
}

function scoreRelativeTiming(event = {}, relativeStartMinutes = null, now = new Date()) {
  if (!Number.isFinite(relativeStartMinutes) || !event?.start) return 0;
  const startMs = new Date(event.start).getTime();
  if (Number.isNaN(startMs)) return 0;

  const deltaMinutes = Math.round((startMs - now.getTime()) / 60000);
  const diff = Math.abs(deltaMinutes - relativeStartMinutes);
  if (diff <= 5) return 36;
  if (diff <= 15) return 24;
  if (diff <= 30) return 12;
  return -12;
}

function pickBestMeetingEvent(events = [], reference = {}, options = {}) {
  const now = options.now || new Date();
  if (!Array.isArray(events) || !events.length) return null;

  const scored = events
    .map((event) => {
      let score = 0;
      score += scoreTitleMatch(event?.title, reference.titleHint);
      score += scoreAttendeeMatch(event?.attendees, reference.attendeeHint);
      score += scoreRelativeTiming(event, reference.relativeStartMinutes, now);

      if (reference.dateFrom && String(event?.start || "").startsWith(reference.dateFrom)) {
        score += 14;
      }

      if (!reference.titleHint && !reference.attendeeHint && !reference.dateFrom) {
        score += 8;
      }

      return { event, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(a.event?.start || 0).getTime() - new Date(b.event?.start || 0).getTime();
    });

  const best = scored[0];
  if (!best) return null;
  if (best.score > 0 || events.length === 1) return best.event;
  return null;
}

function buildSyntheticMeeting(reference = {}, baseDate = new Date()) {
  const start = Number.isFinite(reference.relativeStartMinutes)
    ? new Date(baseDate.getTime() + reference.relativeStartMinutes * 60000)
    : reference.dateFrom
    ? new Date(`${reference.dateFrom}T12:00:00${APP_TIMEZONE_OFFSET}`)
    : null;

  const attendeeName = reference.attendeeHint
    ? { name: reference.attendeeHint, email: null }
    : null;

  return {
    id: null,
    title: reference.titleHint || "Upcoming meeting",
    start: start ? start.toISOString() : null,
    end: null,
    description: "",
    date: start
      ? start.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null,
    time: start
      ? start.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : null,
    location: null,
    meet: null,
    attendees: attendeeName ? [attendeeName] : [],
    status: "tentative",
  };
}

function buildEmailSearchQueries(event = {}, reference = {}) {
  const queries = [];
  const title = cleanText(event.title || reference.titleHint || "");
  const attendeeEmails = (event.attendees || [])
    .map((attendee) => attendee?.email)
    .filter(Boolean);

  if (title && title.toLowerCase() !== "meeting") {
    queries.push(`subject:"${title.replace(/"/g, '\\"')}"`);
    queries.push(`"${title.replace(/"/g, '\\"')}"`);
  }

  for (const email of attendeeEmails.slice(0, 2)) {
    queries.push(`"${email}"`);
  }

  if (!queries.length && reference.attendeeHint) {
    queries.push(`"${reference.attendeeHint.replace(/"/g, '\\"')}"`);
  }

  return uniqueStrings(queries);
}

function buildJiraSearchQuery(event = {}, reference = {}) {
  const titleTerms = significantTerms(event.title || reference.titleHint || "", 3);
  if (titleTerms.length) return titleTerms.join(" ");
  return cleanText(reference.attendeeHint || "");
}

function buildTelegramSearchQuery(event = {}, reference = {}) {
  const title = cleanText(event.title || reference.titleHint || "");
  const terms = significantTerms(title, 4);
  if (terms.length) return terms.join(" ");
  return cleanText(reference.attendeeHint || "");
}

async function fetchGmailContext(event, reference, ctx) {
  const queries = buildEmailSearchQueries(event, reference);
  for (const query of queries) {
    try {
      const result = await toolGmailSearchEmails({ query, maxResults: 5 }, ctx);
      if (result?.count) return result;
    } catch {}
  }
  return null;
}

async function fetchJiraContext(event, reference, ctx) {
  const query = buildJiraSearchQuery(event, reference);
  if (!query) return null;

  try {
    const result = await toolSearchTickets({ query, maxResults: 5 }, ctx);
    return result?.count ? result : null;
  } catch {
    return null;
  }
}

async function fetchTelegramContext(event, reference, ctx) {
  const query = buildTelegramSearchQuery(event, reference);
  if (!query || query.length < 3) return null;

  try {
    const result = await toolTelegramSearchMessages({ query }, ctx);
    return result?.count ? result : null;
  } catch {
    return null;
  }
}

function buildConversationKeywords(event = {}, reference = {}) {
  return uniqueStrings([
    ...(significantTerms(event.title || reference.titleHint || "", 5)),
    ...(significantTerms(reference.attendeeHint || "", 3)),
  ]);
}

async function fetchConversationContext(event, reference, ctx) {
  const keywords = buildConversationKeywords(event, reference);
  if (!ctx?.userId || !keywords.length) return [];

  const conversations = await Conversation.find({
    userId: ctx.userId,
    isDeleted: false,
  })
    .sort({ updatedAt: -1 })
    .limit(12)
    .lean()
    .catch(() => []);

  const matches = [];

  for (const conversation of conversations) {
    const title = cleanText(conversation?.title || "");
    const recentMessages = (conversation?.messages || [])
      .slice(-6)
      .map((message) => cleanText(message?.content || ""))
      .filter(Boolean);
    const haystack = normalizeCommunicationText([title, ...recentMessages].join(" "));

    const overlap = keywords.filter((keyword) => haystack.includes(keyword));
    if (!overlap.length) continue;

    matches.push({
      title: title || "Conversation",
      updatedAt: conversation?.updatedAt || conversation?.createdAt || null,
      snippet:
        recentMessages.find((message) =>
          overlap.some((keyword) =>
            normalizeCommunicationText(message).includes(keyword)
          )
        ) || recentMessages[0] || "",
      overlapCount: overlap.length,
    });
  }

  return matches
    .sort((a, b) => b.overlapCount - a.overlapCount)
    .slice(0, 4);
}

async function collectMeetingPrepContext(event, reference, ctx) {
  const [emailsResult, jiraResult, telegramResult, conversations] =
    await Promise.all([
      fetchGmailContext(event, reference, ctx),
      fetchJiraContext(event, reference, ctx),
      fetchTelegramContext(event, reference, ctx),
      fetchConversationContext(event, reference, ctx),
    ]);

  const emails = emailsResult?.emails || [];
  const tickets = jiraResult?.tickets || [];
  const chats = telegramResult?.results || [];

  const missing = [];
  if (!emails.length) missing.push("No related Gmail threads");
  if (!tickets.length) missing.push("No related Jira tickets");
  if (!chats.length) missing.push("No matching Telegram messages");
  if (!conversations.length) missing.push("No recent OrionAI conversations on this topic");

  return {
    emails,
    tickets,
    chats,
    conversations,
    missing,
  };
}

function inferMeetingPurpose(event = {}, context = {}) {
  const title = normalizeCommunicationText(event.title || "");
  if (/test|qa|bug|debug|fix|issue/.test(title)) {
    return "validate the current OrionAI flow, confirm broken paths, and align on fixes or owners";
  }
  if (/review|retro|status|sync|standup/.test(title)) {
    return "review progress, blockers, and the next concrete decisions";
  }
  if (/demo|walkthrough|showcase/.test(title)) {
    return "walk through the current build, capture feedback, and confirm next steps";
  }
  if (/sales|client|customer/.test(title)) {
    return "align on customer expectations, commitments, and follow-up actions";
  }

  if (context.tickets?.length || context.emails?.length) {
    return "review the latest open threads, decisions, and action items tied to this topic";
  }

  return "confirm the meeting objective, current status, and the next actions before the call ends";
}

function buildBringItems(event = {}, context = {}) {
  const title = normalizeCommunicationText(event.title || "");
  const items = [];

  if (/test|qa|bug|debug|fix|issue/.test(title)) {
    items.push("The latest build or environment link plus the exact flow you plan to test");
    items.push("Any screenshots, repro steps, or errors you have already seen");
    items.push("A short list of current bugs or open validation points");
  } else if (/review|status|sync|standup/.test(title)) {
    items.push("A concise status update with blockers, owners, and next steps");
    items.push("Any metrics or deliverables that changed since the last discussion");
  } else if (/demo|walkthrough|showcase/.test(title)) {
    items.push("A stable demo path and backup screenshots in case the live flow breaks");
    items.push("The key outcomes you want feedback on");
  } else {
    items.push("A one-line objective, the current status, and the next decision you need from the meeting");
    items.push("Relevant notes, links, or examples you may need to reference quickly");
  }

  if (context.tickets?.length) {
    items.push("The related Jira ticket list with current status and blockers");
  }
  if (context.emails?.length) {
    items.push("Any email thread where decisions, asks, or commitments were already made");
  }

  return uniqueStrings(items).slice(0, 4);
}

function buildQuestionIdeas(event = {}, context = {}) {
  const questions = [];

  questions.push("What outcome should we leave this meeting with?");
  questions.push("What is blocked right now, and who owns the unblock?");

  if (context.tickets?.length) {
    questions.push("Which open ticket is the true blocker, and what is the expected fix timeline?");
  }
  if (context.emails?.length) {
    questions.push("Have any requirements changed since the latest email thread?");
  }

  const title = normalizeCommunicationText(event.title || "");
  if (/test|qa|bug|debug|fix|issue/.test(title)) {
    questions.push("Which exact scenarios must pass before we call OrionAI ready?");
    questions.push("What evidence do we need if the issue reproduces again?");
  } else if (/demo|walkthrough/.test(title)) {
    questions.push("Which part of the demo matters most to the audience today?");
  }

  return uniqueStrings(questions).slice(0, 5);
}

function buildRiskItems(event = {}, context = {}, metadata = {}) {
  const risks = [];

  if (!event.description) risks.push("The calendar invite has little or no agenda context.");
  if (!event.meet && !event.location) risks.push("The invite does not clearly show join details.");
  if (!context.emails?.length && !context.tickets?.length && !context.chats?.length) {
    risks.push("There is no strong supporting context beyond the calendar invite.");
  }
  if (metadata.usedSyntheticEvent) {
    risks.push("I could not confidently match the calendar event, so this brief is best-effort from your request.");
  }

  return uniqueStrings(risks).slice(0, 4);
}

function buildFallbackSections(event = {}, context = {}, metadata = {}) {
  const purpose = inferMeetingPurpose(event, context);
  const summaryLines = [
    `- Title: ${event.title || metadata.reference?.titleHint || "Upcoming meeting"}`,
  ];

  const startLabel = event.start
    ? formatLocalDateTime(event.start)
    : metadata.reference?.relativeStartMinutes != null
    ? `Starts in about ${metadata.reference.relativeStartMinutes} minutes`
    : null;
  if (startLabel) summaryLines.push(`- Timing: ${startLabel}`);
  summaryLines.push(`- Attendees: ${formatAttendees(event.attendees)}`);
  if (event.meet || event.location) {
    summaryLines.push(`- Join info: ${event.meet || event.location}`);
  }
  if (event.description) {
    summaryLines.push(`- Invite context: ${cleanText(event.description).slice(0, 180)}`);
  }

  const knowItems = [
    `Likely goal: ${purpose}.`,
  ];
  if (context.emails?.length) {
    knowItems.push(
      `Recent email context: ${context.emails
        .slice(0, 2)
        .map((email) => `"${email.subject}" from ${email.from}`)
        .join("; ")}.`
    );
  }
  if (context.tickets?.length) {
    knowItems.push(
      `Related Jira work: ${context.tickets
        .slice(0, 3)
        .map((ticket) => `${ticket.key} (${ticket.status})`)
        .join(", ")}.`
    );
  }
  if (context.chats?.length) {
    knowItems.push(
      `Recent chat mentions: ${context.chats
        .slice(0, 2)
        .map((chat) => `${chat.chatName}: ${cleanText(chat.text).slice(0, 90)}`)
        .join("; ")}.`
    );
  }
  if (context.conversations?.length) {
    knowItems.push(
      `Earlier OrionAI context: ${context.conversations
        .slice(0, 2)
        .map((conversation) => `${conversation.title} — ${cleanText(conversation.snippet).slice(0, 90)}`)
        .join("; ")}.`
    );
  }

  return {
    meetingSummary: summaryLines,
    whatYouShouldKnow: uniqueStrings(knowItems).slice(0, 5),
    whatYouShouldBring: buildBringItems(event, context).map((item) => `- ${item}`),
    questionsYouShouldAsk: buildQuestionIdeas(event, context).map(
      (item) => `- ${item}`
    ),
    risksOpenItems: buildRiskItems(event, context, metadata).map(
      (item) => `- ${item}`
    ),
    whatICouldNotFind: uniqueStrings(context.missing || []).map(
      (item) => `- ${item}`
    ),
  };
}

function normalizeSectionList(value = [], addBullets = false) {
  const items = Array.isArray(value) ? value : [value];
  return uniqueStrings(
    items
      .flatMap((entry) => String(entry || "").split("\n"))
      .map((entry) => cleanText(entry.replace(/^[*-]\s*/, "")))
      .filter(Boolean)
      .map((entry) => (addBullets ? `- ${entry}` : `- ${entry}`))
  );
}

async function synthesizeMeetingPrepSections(event, context, metadata = {}) {
  const fallback = buildFallbackSections(event, context, metadata);

  const prompt = [
    "You are preparing a concise, practical meeting brief.",
    "Use the available context, but do not invent facts.",
    "Return ONLY valid JSON with these keys:",
    'meetingSummary, whatYouShouldKnow, whatYouShouldBring, questionsYouShouldAsk, risksOpenItems, whatICouldNotFind',
    "Each key must be an array of short bullet strings.",
    "",
    `User ask: ${metadata.reference?.userQuestion || ""}`,
    `Meeting title: ${event.title || "Unknown"}`,
    `Meeting timing: ${formatLocalDateTime(event.start) || "Unknown"}`,
    `Attendees: ${formatAttendees(event.attendees)}`,
    `Invite description: ${cleanText(event.description || "") || "None"}`,
    `Join info: ${event.meet || event.location || "None"}`,
    "",
    `Email context: ${JSON.stringify(
      context.emails.slice(0, 4).map((email) => ({
        subject: email.subject,
        from: email.from,
        snippet: cleanText(email.snippet).slice(0, 140),
      }))
    )}`,
    `Jira context: ${JSON.stringify(
      context.tickets.slice(0, 4).map((ticket) => ({
        key: ticket.key,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
      }))
    )}`,
    `Chat context: ${JSON.stringify(
      context.chats.slice(0, 4).map((chat) => ({
        chatName: chat.chatName,
        text: cleanText(chat.text).slice(0, 140),
      }))
    )}`,
    `Previous conversation context: ${JSON.stringify(
      context.conversations.slice(0, 4).map((conversation) => ({
        title: conversation.title,
        snippet: cleanText(conversation.snippet).slice(0, 140),
      }))
    )}`,
    `Missing context: ${JSON.stringify(context.missing || [])}`,
  ].join("\n");

  try {
    const raw = await chatCompleteNoSystem(prompt, 900, 0.2);
    const match = raw.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
    if (!match) return fallback;

    const parsed = JSON.parse(match[0]);
    return {
      meetingSummary: normalizeSectionList(parsed.meetingSummary),
      whatYouShouldKnow: normalizeSectionList(parsed.whatYouShouldKnow),
      whatYouShouldBring: normalizeSectionList(parsed.whatYouShouldBring),
      questionsYouShouldAsk: normalizeSectionList(parsed.questionsYouShouldAsk),
      risksOpenItems: normalizeSectionList(parsed.risksOpenItems),
      whatICouldNotFind: normalizeSectionList(parsed.whatICouldNotFind),
    };
  } catch {
    return fallback;
  }
}

function formatMeetingPrepSections(sections = {}) {
  const orderedSections = [
    ["Meeting summary", sections.meetingSummary],
    ["What you should know", sections.whatYouShouldKnow],
    ["What you should bring", sections.whatYouShouldBring],
    ["Questions you should ask", sections.questionsYouShouldAsk],
    ["Risks / open items", sections.risksOpenItems],
    ["What I could not find", sections.whatICouldNotFind],
  ];

  return orderedSections
    .map(([title, entries]) => {
      const lines = Array.isArray(entries) && entries.length
        ? entries
        : ["- No additional context found."];
      return `${title}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

async function toolMeetingPrep(params = {}, ctx = {}) {
  const reference = {
    titleHint: params.titleHint || null,
    attendeeHint: params.attendeeHint || null,
    relativeStartMinutes:
      Number.isFinite(params.relativeStartMinutes) ? params.relativeStartMinutes : null,
    dateFrom: params.dateFrom || null,
    dateTo: params.dateTo || params.dateFrom || null,
    userQuestion: params.userQuestion || "",
  };

  let events = Array.isArray(ctx.lastCalendarEvents) ? ctx.lastCalendarEvents : [];
  let event = pickBestMeetingEvent(events, reference);
  let usedSyntheticEvent = false;

  if (!event) {
    try {
      const lookupStep = buildCalendarLookupStep(reference, {});
      const lookupResult =
        lookupStep.tool === "calendar_get_events"
          ? await calendarGetEvents(lookupStep.params, ctx)
          : await calendarGetToday(lookupStep.params, ctx);
      events = lookupResult?.events || [];
      ctx.lastCalendarEvents = events;
      event = pickBestMeetingEvent(events, reference) || events[0] || null;
    } catch {}
  }

  if (!event) {
    event = buildSyntheticMeeting(reference);
    usedSyntheticEvent = true;
  }

  const context = await collectMeetingPrepContext(event, reference, ctx);
  const sections = await synthesizeMeetingPrepSections(event, context, {
    reference,
    usedSyntheticEvent,
  });
  const summary = formatMeetingPrepSections(sections);

  return {
    ok: true,
    event,
    sections,
    supportingContext: {
      emails: context.emails.length,
      tickets: context.tickets.length,
      chats: context.chats.length,
      conversations: context.conversations.length,
    },
    usedSyntheticEvent,
    summary,
  };
}

module.exports = {
  isMeetingPrepRequest,
  extractMeetingPrepReference,
  buildMeetingPrepPlan,
  buildCalendarLookupStep,
  pickBestMeetingEvent,
  formatMeetingPrepSections,
  toolMeetingPrep,
  __test: {
    extractDateKey,
    extractRelativeMinutes,
    extractQuotedMeetingTitle,
    extractTitleHint,
    extractAttendeeHint,
    buildFallbackSections,
  },
};
