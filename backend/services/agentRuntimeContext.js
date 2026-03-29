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
    }

    if (result.docNum) {
      context.documentNumber = result.docNum;
      context.documentType = formatDocumentType(result.collection);
      context.documentSummary = result.summary || context.documentSummary;
    }

    if (tool === "database_query" && result.summary) {
      context.databaseSummary = result.summary;
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

function replaceTemplates(value, context) {
  if (typeof value === "string") {
    return value.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] ?? `{{${key}}}`);
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

    const meetLine = context.meetLink ? ` Meet link: ${context.meetLink}` : "";
    return `Noted. ${detail} has been scheduled.${meetLine}`.trim();
  }

  if (context.ticketKey) {
    return `Noted. Jira ticket ${context.ticketKey}${
      context.ticketTitle ? ` (${context.ticketTitle})` : ""
    } has been created.`;
  }

  if (context.documentNumber) {
    return `Noted. ${context.documentType || "Document"} ${context.documentNumber} is ready.`;
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

function applyRuntimeDefaults(tool, params = {}, context = {}) {
  const resolved = { ...params };

  if (
    [
      "telegram_send_message",
      "telegram_reply_message",
      "slack_send_message",
      "whatsapp_send_message",
      "send_whatsapp",
    ].includes(tool) &&
    shouldAutofillMessage(resolved.message, context)
  ) {
    resolved.message = buildDefaultFollowUpMessage(context);
  }

  if (["gmail_send_email", "send_email"].includes(tool)) {
    if (shouldAutofillMessage(resolved.body || resolved.message, context)) {
      resolved.body = buildDefaultFollowUpMessage(context);
    }
    if (!String(resolved.subject || "").trim()) {
      resolved.subject = buildDefaultEmailSubject(context);
    }
  }

  return resolved;
}

function resolveRuntimeStep(step = {}, results = [], ctx = {}) {
  const context = buildRuntimeContext(results, ctx);
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
    applyRuntimeDefaults,
    resolveRuntimeStep,
  },
};
