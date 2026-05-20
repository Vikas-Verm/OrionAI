"use strict";

function formatDocumentType(collection = "") {
  return String(collection || "Document")
    .replace(/([A-Z])/g, " $1")
    .trim();
}

function buildRuntimeContext(results = [], ctx = {}) {
  const context = {
    ticketKey: ctx.lastCreatedTicketKey || "",
    ticketTitle: ctx.lastCreatedTicketTitle || "",
    ticketUrl: ctx.lastCreatedTicketUrl || "",
    emailSubject: ctx.lastEmail?.subject || "",
    lastSummary: "",
    eventTitle: "",
    eventDate: "",
    eventTime: "",
    eventSummary: "",
    meetLink: "",
    documentNumber: "",
    documentType: "",
    documentSummary: "",
    databaseSummary: "",
    googleDocId: "",
    googleDocTitle: "",
    googleDocUrl: "",
    googleSheetId: "",
    googleSheetTitle: "",
    googleSheetUrl: "",
    calendarEvents: null,
  };

  for (const entry of results) {
    if (entry?.status !== "done" || !entry.result) continue;
    const { tool, result } = entry;

    if (result.summary) {
      context.lastSummary = result.summary;
    }

    if (result.key) {
      context.ticketKey = result.key;
      context.ticketTitle = result.title || context.ticketTitle;
    }

    if (tool?.startsWith("calendar_")) {
      context.eventTitle = result.title || context.eventTitle;
      context.eventDate = result.date || context.eventDate;
      context.eventTime = result.time || context.eventTime;
      context.eventSummary = result.summary || context.eventSummary;
      context.meetLink = result.meet || context.meetLink;
      if (result.events?.length) {
        context.calendarEvents = result.events;
      }
    }

    if (result.docNum) {
      context.documentNumber = result.docNum;
      context.documentType = formatDocumentType(result.collection);
      context.documentSummary = result.summary || context.documentSummary;
    }

    if (tool === "database_query" && result.summary) {
      context.databaseSummary = result.summary;
    }

    if (tool?.startsWith("google_docs_")) {
      const doc = result.richGoogleDoc || result.richGoogleDocs?.[0];
      if (doc) {
        context.googleDocId = doc.id || context.googleDocId;
        context.googleDocTitle = doc.title || context.googleDocTitle;
        context.googleDocUrl = doc.webViewUrl || context.googleDocUrl;
      }
    }

    if (tool?.startsWith("google_sheets_")) {
      const sheet = result.richGoogleSheet || result.richGoogleSheets?.[0];
      if (sheet) {
        context.googleSheetId = sheet.id || context.googleSheetId;
        context.googleSheetTitle = sheet.title || context.googleSheetTitle;
        context.googleSheetUrl = sheet.webViewUrl || context.googleSheetUrl;
      }
    }

    if (result.subject) {
      context.emailSubject = result.subject;
    }
  }

  if (!context.documentType && ctx.fetchResult?.collection) {
    context.documentType = formatDocumentType(ctx.fetchResult.collection);
  }
  if (!context.documentNumber && ctx.fetchResult?.docNum) {
    context.documentNumber = ctx.fetchResult.docNum;
  }

  return context;
}

const TEMPLATE_ALIASES = {
  documentId: "googleDocId",
  docId: "googleDocId",
  docTitle: "googleDocTitle",
  docUrl: "googleDocUrl",
  spreadsheetId: "googleSheetId",
  sheetId: "googleSheetId",
  sheetTitle: "googleSheetTitle",
  sheetUrl: "googleSheetUrl",
};

function replaceTemplates(value, context) {
  if (typeof value === "string") {
    return value.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const resolved = TEMPLATE_ALIASES[key] || key;
      return context[resolved] ?? `{{${key}}}`;
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceTemplates(item, context));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        replaceTemplates(nestedValue, context),
      ])
    );
  }

  return value;
}

function buildDefaultFollowUpMessage(context = {}) {
  if (context.eventTitle || context.eventDate || context.eventTime) {
    const detail = [
      context.eventTitle ? `"${context.eventTitle}"` : "the meeting",
      context.eventDate ? `on ${context.eventDate}` : "",
      context.eventTime ? `at ${context.eventTime}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const meetLine = context.meetLink ? `\nMeet link: ${context.meetLink}` : "";
    return `${detail}${meetLine}`.trim();
  }

  if (context.googleDocTitle && context.googleDocUrl) {
    return `Here's the document: ${context.googleDocTitle} — ${context.googleDocUrl}`;
  }

  if (context.googleSheetTitle && context.googleSheetUrl) {
    return `Here's the spreadsheet: ${context.googleSheetTitle} — ${context.googleSheetUrl}`;
  }

  if (context.ticketKey) {
    const ticketLine = `Jira ticket ${context.ticketKey}${
      context.ticketTitle ? ` (${context.ticketTitle})` : ""
    }`;
    return context.ticketUrl
      ? `${ticketLine}\n${context.ticketUrl}`
      : ticketLine;
  }

  if (context.documentNumber) {
    return `${context.documentType || "Document"} ${context.documentNumber} is ready.`;
  }

  if (context.databaseSummary) {
    return context.databaseSummary;
  }

  return context.lastSummary || "";
}

function buildDefaultEmailSubject(context = {}) {
  if (context.eventTitle) return `Meeting scheduled: ${context.eventTitle}`;
  if (context.ticketKey) return `Update on ${context.ticketKey}`;
  if (context.documentNumber) {
    return `${context.documentType || "Document"} ${context.documentNumber}`;
  }
  return "Update";
}

function shouldAutofillMessage(value, context = {}) {
  const text = String(value || "").trim();
  if (!text) return true;
  if (/\{\{\w+\}\}/.test(text)) return true;

  const lowered = text.toLowerCase();
  if (
    context.eventTitle &&
    /\b(acknowledg(?:e|ement|ment)?|notify|inform|tell)\b/.test(lowered) &&
    /\b(this|it|meeting|event)\b/.test(lowered) &&
    !lowered.includes(String(context.eventTitle || "").toLowerCase())
  ) {
    return true;
  }

  if (
    context.ticketKey &&
    /\b(acknowledg(?:e|ement|ment)?|notify|inform|tell)\b/.test(lowered) &&
    /\b(this|it|ticket)\b/.test(lowered) &&
    !lowered.includes(String(context.ticketKey || "").toLowerCase())
  ) {
    return true;
  }

  return false;
}

function resolveEventFromCalendar(messageText, context = {}) {
  if (!context.calendarEvents?.length) return null;
  const lowered = String(messageText || "").toLowerCase();
  for (const ev of context.calendarEvents) {
    const titleLower = String(ev.title || "").toLowerCase();
    if (!titleLower || titleLower === "(no title)") continue;
    const words = titleLower.split(/\s+/).filter((w) => w.length > 2);
    const matchCount = words.filter((w) => lowered.includes(w)).length;
    if (matchCount >= Math.max(1, Math.ceil(words.length * 0.5))) {
      return ev;
    }
  }
  return null;
}

function enrichMessageWithContext(message, context = {}) {
  let text = String(message || "").trim();
  if (!text) return text;

  const lowered = text.toLowerCase();

  const mentionsMeeting = /\b(meeting|event|call|standup|sync|huddle|review|retro|catchup|catch-up|1-on-1|one-on-one|demo|webinar|workshop|session)\b/.test(lowered);

  if (mentionsMeeting && context.eventTime && !text.includes(context.eventTime)) {
    text += `\nTime: ${context.eventTime}`;
  }

  if (context.meetLink && !text.includes(context.meetLink)) {
    if (/\b(link|join)\b/.test(lowered) || mentionsMeeting) {
      text += `\nMeet link: ${context.meetLink}`;
    }
  }

  if (
    context.eventTitle &&
    mentionsMeeting &&
    !lowered.includes(String(context.eventTitle).toLowerCase())
  ) {
    const details = [
      context.eventTitle ? `"${context.eventTitle}"` : null,
      context.eventDate ? `on ${context.eventDate}` : null,
    ].filter(Boolean).join(" ");
    if (details) text = text.replace(/\b(the meeting|the event|the call|this meeting|this event)\b/i, details);
  }

  if (
    context.googleDocUrl &&
    /\b(doc|document)\b/.test(lowered) &&
    !text.includes(context.googleDocUrl)
  ) {
    const label = context.googleDocTitle || "Document";
    text += `\n${label}: ${context.googleDocUrl}`;
  }

  if (
    context.googleSheetUrl &&
    /\b(sheet|spreadsheet)\b/.test(lowered) &&
    !text.includes(context.googleSheetUrl)
  ) {
    const label = context.googleSheetTitle || "Spreadsheet";
    text += `\n${label}: ${context.googleSheetUrl}`;
  }

  if (
    context.ticketKey &&
    /\b(ticket|issue|bug)\b/.test(lowered) &&
    !text.includes(context.ticketKey)
  ) {
    text += ` (${context.ticketKey})`;
  }

  return text;
}

function applyRuntimeDefaults(tool, params = {}, context = {}) {
  const resolved = { ...params };

  const isMessagingTool = [
    "telegram_send_message",
    "telegram_reply_message",
    "slack_send_message",
    "whatsapp_send_message",
    "send_whatsapp",
  ].includes(tool);

  if (isMessagingTool || ["gmail_send_email", "send_email"].includes(tool)) {
    const msgText = resolved.message || resolved.body || "";
    const matchedEvent = resolveEventFromCalendar(msgText, context);
    if (matchedEvent) {
      context.eventTitle = matchedEvent.title || context.eventTitle;
      context.eventDate = matchedEvent.date || context.eventDate;
      context.eventTime = matchedEvent.time || context.eventTime;
      context.meetLink = matchedEvent.meet || context.meetLink;
    }
  }

  if (isMessagingTool && shouldAutofillMessage(resolved.message, context)) {
    resolved.message = buildDefaultFollowUpMessage(context);
  } else if (isMessagingTool && resolved.message) {
    resolved.message = enrichMessageWithContext(resolved.message, context);
  }

  if (
    ["google_docs_get", "google_docs_update", "google_docs_share", "google_docs_delete"].includes(tool) &&
    context.googleDocId
  ) {
    const docId = String(resolved.documentId || "").trim();
    if (!docId || docId.startsWith("{{")) {
      resolved.documentId = context.googleDocId;
    }
  }

  if (
    ["google_sheets_get", "google_sheets_rename", "google_sheets_share", "google_sheets_delete", "google_sheets_duplicate"].includes(tool) &&
    context.googleSheetId
  ) {
    const sheetId = String(resolved.spreadsheetId || "").trim();
    if (!sheetId || sheetId.startsWith("{{")) {
      resolved.spreadsheetId = context.googleSheetId;
    }
  }

  if (["gmail_send_email", "send_email"].includes(tool)) {
    if (shouldAutofillMessage(resolved.body || resolved.message, context)) {
      resolved.body = buildDefaultFollowUpMessage(context);
    } else if (resolved.body) {
      resolved.body = enrichMessageWithContext(resolved.body, context);
    }
    if (!String(resolved.subject || "").trim()) {
      resolved.subject = buildDefaultEmailSubject(context);
    }
  }

  return resolved;
}

function resolveRuntimeStep(step = {}, results = [], ctx = {}) {
  const context = buildRuntimeContext(results, ctx);

  const rawMsg = step.params?.message || step.params?.body || "";
  if (rawMsg && context.calendarEvents?.length) {
    const ev = resolveEventFromCalendar(rawMsg, context);
    if (ev) {
      context.eventTitle = ev.title || context.eventTitle;
      context.eventDate = ev.date || context.eventDate;
      context.eventTime = ev.time || context.eventTime;
      context.meetLink = ev.meet || context.meetLink;
    }
  }

  const params = applyRuntimeDefaults(
    step.tool,
    replaceTemplates(step.params || {}, context),
    context
  );

  return { ...step, params, context };
}

module.exports = {
  buildRuntimeContext,
  resolveRuntimeStep,
  __test: {
    buildRuntimeContext,
    replaceTemplates,
    buildDefaultFollowUpMessage,
    buildDefaultEmailSubject,
    shouldAutofillMessage,
    enrichMessageWithContext,
    applyRuntimeDefaults,
    resolveRuntimeStep,
  },
};
