/**
 * superAgent.js
 *
 * The Super Agent is the single entry point for all agent operations.
 *
 * Responsibilities:
 *   1. Parse the user's natural-language message into a structured multi-step plan
 *   2. Route each step to the correct sub-agent (Slack, Jira, Gmail, etc.)
 *   3. Maintain a shared execution context so results flow between steps
 *      e.g. Jira creates a ticket → Slack message can reference {{ticketKey}}
 *   4. Stream progress events (step_start, step_done, step_error, complete) via SSE
 *
 * Usage (from agentController.js):
 *   const { parseAgentIntent, runAgent, loadToolRegistry } = require("./superAgent");
 */

"use strict";

const { chatCompleteNoSystem } = require("../llmService");
const { resolveAgent } = require("./agentRegistry");
const { normalizeStepParams } = require("../agentParamNormalizer");
const Skill = require("../../models/skill");

// ─────────────────────────────────────────────────────────────────────────────
// TOOL UI REGISTRY  (icon + label shown in the chat bubble)
// ─────────────────────────────────────────────────────────────────────────────
const STATIC_TOOL_REGISTRY = {
  // Document delivery
  fetch_document: { icon: "🔍", label: "Fetch document" },
  generate_pdf: { icon: "📄", label: "Generate PDF" },
  send_email: { icon: "📧", label: "Send email" },
  send_whatsapp: { icon: "💬", label: "Send WhatsApp" },
  notify_internal: { icon: "🔔", label: "Internal notify" },

  // Slack
  slack_read_messages: { icon: "💬", label: "Read Slack messages" },
  slack_send_message: { icon: "📤", label: "Send Slack message" },
  slack_get_unread: { icon: "🔔", label: "Slack unread" },
  slack_list_channels: { icon: "📋", label: "List Slack channels" },

  // Gmail
  gmail_get_inbox: { icon: "📬", label: "Read inbox" },
  gmail_search_emails: { icon: "🔍", label: "Search emails" },
  gmail_get_email: { icon: "📧", label: "Open email" },
  gmail_summarize_thread: { icon: "🧵", label: "Summarize thread" },
  gmail_send_email: { icon: "✉️", label: "Send email (Gmail)" },
  gmail_reply_email: { icon: "↩️", label: "Reply to email" },

  // Google Calendar
  calendar_get_today: { icon: "📅", label: "Today's events" },
  calendar_get_week: { icon: "🗓️", label: "This week's events" },
  calendar_get_events: { icon: "🔍", label: "Search events" },
  calendar_create: { icon: "➕", label: "Create event" },
  calendar_update: { icon: "✏️", label: "Update event" },
  calendar_delete: { icon: "🗑️", label: "Delete event" },
  calendar_get_invites: { icon: "📬", label: "Pending invites" },
  calendar_respond: { icon: "✅", label: "Respond to invite" },

  // Telegram
  telegram_list_chats: { icon: "✈️", label: "List Telegram chats" },
  telegram_get_messages: { icon: "💬", label: "Read Telegram messages" },
  telegram_send_message: { icon: "📤", label: "Send Telegram message" },
  telegram_get_unread: { icon: "🔔", label: "Unread Telegram messages" },
  telegram_search_messages: { icon: "🔍", label: "Search Telegram" },
  telegram_reply_message: { icon: "↩️", label: "Reply on Telegram" },
  telegram_get_contact_info: { icon: "👤", label: "Telegram contact info" },

  // Google Docs
  google_docs_list: { icon: "📝", label: "List Google Docs" },
  google_docs_get: { icon: "📄", label: "Open Google Doc" },
  google_docs_create: { icon: "➕", label: "Create Google Doc" },
  google_docs_update: { icon: "✏️", label: "Update Google Doc" },
  google_docs_share: { icon: "🔗", label: "Share Google Doc" },
  google_docs_delete: { icon: "🗑️", label: "Delete Google Doc" },
  google_docs_search: { icon: "🔍", label: "Search Google Docs" },

  // Google Sheets
  google_sheets_list: { icon: "📊", label: "List Google Sheets" },
  google_sheets_get: { icon: "📋", label: "Open Google Sheet" },
  google_sheets_create: { icon: "➕", label: "Create Google Sheet" },
  google_sheets_rename: { icon: "✏️", label: "Rename Google Sheet" },
  google_sheets_share: { icon: "🔗", label: "Share Google Sheet" },
  google_sheets_delete: { icon: "🗑️", label: "Delete Google Sheet" },
  google_sheets_search: { icon: "🔍", label: "Search Google Sheets" },
  google_sheets_duplicate: { icon: "📑", label: "Duplicate Google Sheet" },
};

async function loadToolRegistry() {
  try {
    const skills = await Skill.find({ enabled: true });
    const dbTools = Object.fromEntries(
      skills.map((s) => [
        s.toolName,
        {
          icon: s.icon,
          label: s.label,
          description: s.description,
          presentation: s.presentation || null,
        },
      ])
    );
    return { ...STATIC_TOOL_REGISTRY, ...dbTools };
  } catch (err) {
    console.error("loadToolRegistry failed:", err.message);
    return STATIC_TOOL_REGISTRY;
  }
}

function getStepUI(toolName, stepIndex, registry) {
  const entry = registry[toolName];
  if (!entry) return { icon: "⚙️", label: toolName };
  const step = entry.presentation?.steps?.[stepIndex];
  return step || { icon: entry.icon || "⚙️", label: entry.label || toolName };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTENT CLASSIFIER PROMPT
// ─────────────────────────────────────────────────────────────────────────────
async function buildClassifierPrompt(userMessage) {
  // Load Jira skill lines from DB
  let jiraLines = [];
  try {
    const skills = await Skill.find({ enabled: true, category: "jira" });
    jiraLines = skills.map((s) => {
      const out =
        s.promptExample?.output || `{"tool":"${s.toolName}","params":{}}`;
      const lines = [`- ${s.triggers.join(" / ")} → ${out}`];
      if (s.promptExample?.userSays)
        lines.push(`  Example: "${s.promptExample.userSays}"`);
      return lines.join("\n");
    });
  } catch (err) {
    console.error("Skill fetch failed:", err.message);
  }

  return [
    `User request: "${userMessage}"`,
    "",
    "Classify this as one of the agent task types below and return a JSON plan.",
    "For multi-step requests (e.g. 'create a Jira ticket AND notify on Slack'), include ALL steps in the steps array.",
    "Steps are executed sequentially — later steps can use results from earlier ones.",
    "When a Slack/Telegram message should include a Jira ticket key from a previous step, use the placeholder {{ticketKey}} in the message.",
    "",

    // ── TYPE A: Document Delivery ──────────────────────────────────────────
    "TYPE A — DOCUMENT DELIVERY: user wants to send/email/share a business document.",
    "Collections: invoice→Invoices | bill→Bills | PO→PurchaseOrders | CN→CreditNotes | DN→DebitNotes | payment→PaymentRequests | POD→ProofOfDeliveries",
    'Format: {"isAgentTask":true,"confidence":0.95,"intent":"...","steps":[{"tool":"fetch_document","params":{"collection":"Invoices","identifier":"INV-001","identifierField":"number","fallbackToLatest":false}},{"tool":"generate_pdf","params":{}},{"tool":"send_email","params":{"to":"email@example.com","subject":"Invoice"}}]}',
    "",

    // ── TYPE B: Jira ───────────────────────────────────────────────────────
    "TYPE B — JIRA: user mentions Jira, tickets, backlog, sprint, overdue, bugs, assignee.",
    ...jiraLines,
    'Format: {"isAgentTask":true,"confidence":0.93,"intent":"...","steps":[{"tool":"TOOL_NAME","params":{...}}]}',
    "Always embed assigneeName inside jira_create_ticket params — do NOT add a separate jira_assign_ticket step.",
    "",

    // ── TYPE C: Gmail ──────────────────────────────────────────────────────
    "TYPE C — GMAIL:",
    "- check inbox / show emails → gmail_get_inbox {maxResults:10}",
    "- show unread emails → gmail_get_inbox {unreadOnly:true,maxResults:10}",
    "- search emails from X / about Y → gmail_search_emails {query:'from:X'}",
    "- open / read email about X → gmail_get_email {subject:'X'}",
    "- summarize email / thread → chain gmail_get_email then gmail_summarize_thread",
    "- send email to X → gmail_send_email {to:'x@example.com',subject:'...',body:'...'}",
    "- reply to email → chain gmail_get_email then gmail_reply_email",
    'Format: {"isAgentTask":true,"confidence":0.93,"intent":"...","steps":[{"tool":"gmail_get_inbox","params":{"maxResults":10}}]}',
    "",

    // ── TYPE D: Google Calendar ────────────────────────────────────────────
    "TYPE D — GOOGLE CALENDAR:",
    "- what's on my calendar / show today → calendar_get_today",
    "- show this week → calendar_get_week",
    "- find events about X / on date Y → calendar_get_events {query:'X'} or {dateFrom:'YYYY-MM-DD'}",
    "- schedule / create / add meeting → calendar_create {title, startDateTime (ISO8601), durationMinutes, attendees:['email@x.com'], addMeet:false}",
    "- reschedule / update event X → calendar_update {title:'X', startDateTime}",
    "- delete / cancel event X → calendar_delete {title:'X'}",
    "- check pending invites → calendar_get_invites",
    "- accept / decline invite X → calendar_respond {title:'X', response:'accept'|'decline'|'tentative'}",
    'Format: {"isAgentTask":true,"confidence":0.93,"intent":"...","steps":[{"tool":"calendar_create","params":{"title":"Meeting","startDateTime":"2026-03-20T10:00:00+05:30","durationMinutes":30}}]}',
    "",

    // ── TYPE E: Telegram ───────────────────────────────────────────────────
    "TYPE E — TELEGRAM:",
    "- show telegram messages from X / what did X say → telegram_get_messages {contact:'X', limit:20}",
    "- list telegram chats → telegram_list_chats",
    "- send telegram message to X → telegram_send_message {contact:'X', message:'...'}",
    "- show unread telegram → telegram_get_unread {limit:10}",
    "- search telegram for X → telegram_search_messages {query:'X'}",
    "- reply to X on telegram → telegram_reply_message {contact:'X', message:'...'}",
    "- who is X on telegram → telegram_get_contact_info {contact:'X'}",
    'Format: {"isAgentTask":true,"confidence":0.93,"intent":"...","steps":[{"tool":"telegram_get_messages","params":{"contact":"Rahul","limit":20}}]}',
    "",

    // ── TYPE G: Google Docs ──────────────────────────────────────────────
    "TYPE G — GOOGLE DOCS:",
    "- list my google docs / show my documents / recent docs → google_docs_list {limit:12}",
    "- search google docs for X / find doc about X → google_docs_search {query:'X'}",
    "- open google doc X / read doc X / get doc X → google_docs_get {documentId:'DOC_ID'}",
    "  If user mentions doc by name instead of ID, first use google_docs_search to find it, then google_docs_get.",
    "- create a google doc / new doc titled X → google_docs_create {title:'X'}",
    "- update / edit google doc → google_docs_update {documentId:'DOC_ID', title:'new title', content:'<p>HTML content</p>'}",
    "- share google doc with X → google_docs_share {documentId:'DOC_ID', email:'x@example.com', role:'writer'}",
    "- delete google doc X → google_docs_delete {documentId:'DOC_ID'}",
    "Note: When user references a doc by title, use google_docs_search first to find the documentId, then chain with the next step.",
    "Note: When user says 'create a doc about X with content', use google_docs_create then google_docs_update to add content.",
    'Format: {"isAgentTask":true,"confidence":0.93,"intent":"...","steps":[{"tool":"google_docs_list","params":{"limit":12}}]}',
    "",

    // ── TYPE F: Slack ──────────────────────────────────────────────────────
    "TYPE F — SLACK:",
    "- show slack messages / read #channel / what's in #channel → slack_read_messages {channel:'channel-name', limit:20}",
    "- show unread slack / any unread slack messages → slack_get_unread",
    "- list slack channels / show my slack channels → slack_list_channels",
    "- send slack message to X / message X on slack / tell X on slack → slack_send_message {channel:'X', message:'...'}",
    "- dm X on slack → slack_send_message {channel:'X', message:'...'}",
    "Note: For slack_send_message, 'channel' can be a person's name (DM), a channel name, or a channel ID.",
    'Format: {"isAgentTask":true,"confidence":0.93,"intent":"...","steps":[{"tool":"slack_send_message","params":{"channel":"rahul","message":"Hello!"}}]}',
    "",

    // ── Multi-agent examples ───────────────────────────────────────────────
    "MULTI-AGENT EXAMPLES (combine steps from different types):",
    '- "create a bug ticket for GST issue and message Rahul on Slack about it"',
    '  → [{"tool":"jira_create_ticket","params":{"summary":"GST setting issue","type":"Bug"}}, {"tool":"slack_send_message","params":{"channel":"rahul","message":"Hey! Bug ticket {{ticketKey}} has been created for the GST setting issue."}}]',
    '- "check my unread slack and telegram messages"',
    '  → [{"tool":"slack_get_unread","params":{}}, {"tool":"telegram_get_unread","params":{"limit":10}}]',
    '- "send the latest invoice to client@example.com and notify #billing on slack"',
    '  → [{"tool":"fetch_document","params":{"collection":"Invoices","fallbackToLatest":true}}, {"tool":"generate_pdf","params":{}}, {"tool":"send_email","params":{"to":"client@example.com"}}, {"tool":"slack_send_message","params":{"channel":"billing","message":"Invoice sent to client@example.com ✅"}}]',
    "",

    // ── Not an agent task ──────────────────────────────────────────────────
    'If NONE of the above (general questions, coding, analytics, casual chat): {"isAgentTask":false,"confidence":0.95,"intent":"","steps":[]}',
    "",
    "Respond with ONLY valid JSON. No markdown, no explanation.",
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSE INTENT
// ─────────────────────────────────────────────────────────────────────────────
async function parseAgentIntent(userMessage, history = []) {
  try {
    const prompt = await buildClassifierPrompt(userMessage);
    const raw = await chatCompleteNoSystem(prompt, 768, 0.1);
    const clean = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in LLM response");
    return JSON.parse(match[0]);
  } catch (err) {
    console.error("parseAgentIntent failed:", err.message);
    return { isAgentTask: false, confidence: 0, intent: "", steps: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT RESOLVER
// Replaces template placeholders like {{ticketKey}} with actual values from ctx
// ─────────────────────────────────────────────────────────────────────────────
function resolveTemplates(params, ctx) {
  if (!params || typeof params !== "object") return params;

  const resolved = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      resolved[key] = value
        .replace(/\{\{ticketKey\}\}/gi, ctx.lastCreatedTicketKey || "")
        .replace(/\{\{ticketUrl\}\}/gi, ctx.lastCreatedTicketUrl || "")
        .replace(/\{\{ticketTitle\}\}/gi, ctx.lastCreatedTicketTitle || "")
        .replace(/\{\{emailSubject\}\}/gi, ctx.lastEmail?.subject || "")
        .replace(/\{\{googleDocId\}\}/gi, ctx.lastGoogleDoc?.documentId || ctx.lastGoogleDoc?.id || "")
        .replace(/\{\{googleDocTitle\}\}/gi, ctx.lastGoogleDoc?.title || "")
        .replace(/\{\{googleDocUrl\}\}/gi, ctx.lastGoogleDoc?.webViewUrl || "");
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN AGENT  (called from agentController → streams SSE events)
// ─────────────────────────────────────────────────────────────────────────────
async function runAgent(
  { steps, userId, db, sessionId, userMessage },
  onProgress
) {
  const TOOL_REGISTRY = await loadToolRegistry();

  /** Shared mutable context passed to every sub-agent */
  const ctx = {
    userId,
    db,
    sessionId,
    userMessage,
    // Cross-step state populated by sub-agents:
    lastCreatedTicketKey: null,
    lastCreatedTicketUrl: null,
    lastCreatedTicketTitle: null,
    lastEmail: null,
    lastGoogleDoc: null,
    fetchResult: null,
    pdfResult: null,
  };

  const results = [];

  for (let i = 0; i < steps.length; i++) {
    let { tool, params = {} } = steps[i];

    // 1. Normalize params (extract ticket keys from text, fix assignee casing, etc.)
    const normalized = normalizeStepParams({ tool, params }, userMessage);
    params = normalized.params;

    // 2. Resolve template placeholders ({{ticketKey}}, {{ticketUrl}}, etc.)
    params = resolveTemplates(params, ctx);

    // 3. Find the sub-agent responsible for this tool
    const agent = resolveAgent(tool);
    if (!agent) {
      onProgress({
        tool,
        status: "error",
        error: `No agent found for tool "${tool}"`,
      });
      results.push({ tool, status: "error" });
      break;
    }

    // 4. Emit step_start
    const stepUI = getStepUI(tool, results.length, TOOL_REGISTRY);
    onProgress({
      tool,
      status: "start",
      icon: stepUI.icon,
      label: stepUI.label,
    });

    // 5. Execute the step
    try {
      const result = await agent.execute(tool, params, ctx);

      const doneUI = getStepUI(tool, results.length, TOOL_REGISTRY);
      onProgress({
        tool,
        status: "done",
        result,
        icon: doneUI.icon,
        label: doneUI.label,
      });
      results.push({ tool, status: "done", result });
    } catch (err) {
      console.error(`[SuperAgent] step "${tool}" failed:`, err.message);
      onProgress({ tool, status: "error", error: err.message });
      results.push({ tool, status: "error", error: err.message });
      break; // stop pipeline on first error
    }
  }

  return results;
}

module.exports = { parseAgentIntent, runAgent, loadToolRegistry };
