const nodemailer = require("nodemailer");
const twilio = require("twilio");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { chatCompleteNoSystem } = require("./llmService");
const { SCHEMA_DESCRIPTION, ALLOWED_COLLECTIONS } = require("./dbQueryService");
const { toolSlack } = require("./tools/toolSlack");
const { toolWhatsApp } = require("./tools/toolWhatsapp");
const {
  toolGetBacklog,
  toolGetOverdueTickets,
  toolUpdateDueDates,
  toolCreateTicket,
  toolGetMyTickets,
  toolGetSprintSummary,
  toolMoveTicket,
  toolAssignTicket,
  toolAddComment,
  toolGetShippedLastSprint,
  toolGetMostOverdue,
  toolGetSprintBugs,
  toolSearchTickets,
  toolNotifyOverdue,
  toolLinkTicket,
} = require("./tools/toolJira");
const {
  toolGmailGetInbox,
  toolGmailSearchEmails,
  toolGmailGetEmail,
  toolGmailSummarizeThread,
  toolGmailSendEmail,
  toolGmailReplyEmail,
} = require("./tools/toolGmail");
const {
  calendarGetToday,
  calendarGetWeek,
  calendarGetEvents,
  calendarCreate,
  calendarUpdate,
  calendarDelete,
  calendarGetInvites,
  calendarRespond,
} = require("./tools/toolCalendar");
const {
  toolTelegramListChats,
  toolTelegramGetMessages,
  toolTelegramSendMessage,
  toolTelegramGetUnread,
  toolTelegramSearchMessages,
  toolTelegramReplyMessage,
  toolTelegramGetContactInfo,
} = require("./tools/toolTelegram");
const Skill = require("../models/skill");
const { checkNeedsConfirmation } = require("./confirmationService");
const { withRetry } = require("./retryHelper");
// ─────────────────────────────────────────────────────────────────────────────
// TOOL_REGISTRY — static entries for non-Jira tools (document, email etc.)
// Jira tools are loaded dynamically from DB via loadToolRegistry()
// ─────────────────────────────────────────────────────────────────────────────
const STATIC_TOOL_REGISTRY = {
  fetch_document: { icon: "🔍", label: "Fetch document" },
  generate_pdf: { icon: "📄", label: "Generate PDF" },
  send_email: { icon: "📧", label: "Send email" },
  send_whatsapp: { icon: "💬", label: "Send WhatsApp" },
  notify_internal: { icon: "🔔", label: "Internal notify" },
  send_slack: { icon: "💼", label: "Send to Slack" },
  gmail_get_inbox: { icon: "📬", label: "Read inbox" },
  gmail_search_emails: { icon: "🔍", label: "Search emails" },
  gmail_get_email: { icon: "📧", label: "Open email" },
  gmail_summarize_thread: { icon: "🧵", label: "Summarize thread" },
  gmail_send_email: { icon: "✉️", label: "Send email (Gmail)" },
  gmail_reply_email: { icon: "↩️", label: "Reply to email" },
  // ── Google Calendar ──────────────────────────────────
  calendar_get_today: { icon: "📅", label: "Get today's events" },
  calendar_get_week: { icon: "🗓️", label: "Get this week's events" },
  calendar_get_events: { icon: "🔍", label: "Search events" },
  calendar_create: { icon: "➕", label: "Create calendar event" },
  calendar_update: { icon: "✏️", label: "Update calendar event" },
  calendar_delete: { icon: "🗑️", label: "Delete calendar event" },
  calendar_get_invites: { icon: "📬", label: "Check pending invites" },
  calendar_respond: { icon: "✅", label: "Respond to invite" },
  telegram_list_chats: { icon: "✈️", label: "List Telegram chats" },
  telegram_get_messages: { icon: "💬", label: "Read Telegram messages" },
  telegram_send_message: { icon: "📤", label: "Send Telegram message" },
  telegram_get_unread: { icon: "🔔", label: "Get unread Telegram messages" },
  telegram_search_messages: { icon: "🔍", label: "Search Telegram messages" },
  telegram_reply_message: { icon: "↩️", label: "Reply on Telegram" },
  telegram_get_contact_info: { icon: "👤", label: "Get Telegram contact info" },
  slack_read_messages: { icon: "💬", label: "Read Slack messages" },
  slack_send_message: { icon: "📤", label: "Send Slack message" },
  slack_get_unread: { icon: "🔔", label: "Slack unread" },
  slack_list_channels: { icon: "📋", label: "List Slack channels" },
  whatsapp_send_message: { icon: "💬", label: "Send WhatsApp" },
  whatsapp_get_messages: { icon: "💬", label: "Read WhatsApp" },
  whatsapp_get_unread: { icon: "🔔", label: "WhatsApp unread" },
  whatsapp_list_chats: { icon: "💬", label: "WhatsApp chats" },
};

// ── Load Jira + custom tools from DB and merge with static ───────────────────
async function loadToolRegistry() {
  try {
    const skills = await Skill.find({ enabled: true });

    const dbRegistry = {};

    for (const s of skills) {
      dbRegistry[s.toolName] = {
        icon: s.icon,
        label: s.label,
        description: s.description,
        presentation: s.presentation || null,
      };
    }

    return { ...STATIC_TOOL_REGISTRY, ...dbRegistry };
  } catch (err) {
    console.error("loadToolRegistry failed:", err.message);
    return STATIC_TOOL_REGISTRY;
  }
}

function presentStep(toolName, index, TOOL_REGISTRY) {
  const tool = TOOL_REGISTRY[toolName];

  if (!tool) {
    return { icon: "⚙️", label: toolName };
  }

  const presentation = tool.presentation?.steps;

  if (presentation && presentation[index]) {
    return presentation[index];
  }

  return {
    icon: tool.icon || "⚙️",
    label: tool.label || toolName,
  };
}
// ── Build classifier prompt dynamically from DB skills ───────────────────────
async function buildClassifierPrompt(userMessage) {
  // ── Load all enabled skills from DB grouped by category ─────────────────
  let skillsByCategory = {};
  try {
    const skills = await Skill.find({ enabled: true });
    for (const s of skills) {
      if (!skillsByCategory[s.category]) skillsByCategory[s.category] = [];
      skillsByCategory[s.category].push(s);
    }
  } catch (err) {
    console.error("buildClassifierPrompt DB fetch failed:", err.message);
  }

  // ── Build prompt lines per category ──────────────────────────────────────
  function buildSkillLines(category) {
    const skills = skillsByCategory[category] || [];
    return skills.map((s) => {
      const out =
        s.promptExample?.output || `{"tool":"${s.toolName}","params":{}}`;
      const lines = [`- ${s.triggers.join(" / ")} → ${out}`];
      if (s.promptExample?.userSays)
        lines.push(`  Example: "${s.promptExample.userSays}"`);
      return lines.join("\n");
    });
  }

  const jiraLines = buildSkillLines("jira");
  const slackLines = buildSkillLines("slack");
  const gmailLines = buildSkillLines("gmail");
  const telegramLines = buildSkillLines("telegram");
  const calendarLines = buildSkillLines("calendar");

  return [
    `User request: "${userMessage}"`,
    "",
    "Classify this request and return a JSON plan.",
    "For multi-step requests (e.g. 'create a Jira ticket AND message Rahul on Slack'),",
    "include ALL steps in the steps array — they execute sequentially.",
    "When a Slack/Telegram message should reference a Jira ticket from a previous step,",
    "use {{ticketKey}} in the message param — it will be replaced automatically.",
    "",

    // ── TYPE A: Document Delivery ──────────────────────────────────────────
    "TYPE A — DOCUMENT DELIVERY: user wants to send/email/share a business document.",
    "Collections: invoice→Invoices | bill→Bills | PO→PurchaseOrders | CN→CreditNotes | DN→DebitNotes | payment→PaymentRequests | POD→ProofOfDeliveries",
    'Format: {"isAgentTask":true,"confidence":0.95,"intent":"...","steps":[{"tool":"fetch_document","params":{"collection":"Invoices","identifier":"INV-001","identifierField":"number","fallbackToLatest":false}},{"tool":"generate_pdf","params":{}},{"tool":"send_email","params":{"to":"email@example.com"}}]}',
    "Use fallbackToLatest:true when user says latest/recent/last.",
    "",

    // ── TYPE B: Jira ───────────────────────────────────────────────────────
    "TYPE B — JIRA: user mentions Jira, tickets, backlog, sprint, overdue, bugs, assignee.",
    ...jiraLines,
    'Format: {"isAgentTask":true,"confidence":0.93,"intent":"...","steps":[{"tool":"TOOL_NAME","params":{...}}]}',
    "Always embed assigneeName inside jira_create_ticket params — never use a separate jira_assign_ticket step.",
    "",

    // ── TYPE C: Gmail ──────────────────────────────────────────────────────
    "TYPE C — GMAIL:",
    ...gmailLines,
    "- check inbox / show emails → gmail_get_inbox {maxResults:10}",
    "- show unread emails → gmail_get_inbox {unreadOnly:true,maxResults:10}",
    "- reply to email → chain gmail_get_email then gmail_reply_email",
    'Format: {"isAgentTask":true,"confidence":0.93,"intent":"...","steps":[{"tool":"gmail_get_inbox","params":{"maxResults":10}}]}',
    "",

    // ── TYPE D: Calendar ───────────────────────────────────────────────────
    "TYPE D — GOOGLE CALENDAR:",
    ...calendarLines,
    "- find events on date Y → calendar_get_events {dateFrom:'YYYY-MM-DD'}",
    "- reschedule/update event X → calendar_update {title:'X', startDateTime}",
    "- delete/cancel event X → calendar_delete {title:'X'}",
    "- check pending invites → calendar_get_invites",
    "- accept/decline invite X → calendar_respond {title:'X', response:'accept'|'decline'|'tentative'}",
    'Format: {"isAgentTask":true,"confidence":0.93,"intent":"...","steps":[{"tool":"calendar_get_today","params":{}}]}',
    "",

    // ── TYPE E: Telegram ───────────────────────────────────────────────────
    "TYPE E — TELEGRAM:",
    ...telegramLines,
    "- search telegram for X → telegram_search_messages {query:'X'}",
    "- who is X on telegram → telegram_get_contact_info {contact:'X'}",
    'Format: {"isAgentTask":true,"confidence":0.93,"intent":"...","steps":[{"tool":"telegram_get_messages","params":{"contact":"Rahul","limit":20}}]}',
    "",

    // ── TYPE F: Slack ──────────────────────────────────────────────────────
    "TYPE F — SLACK:",
    ...slackLines,
    "NOTE: For slack_send_message, 'channel' can be a person name (DM), a channel name like 'general', or a channel ID.",
    "NOTE: When sending to a person by name (e.g. 'Adi', 'Rahul'), set channel to their first name in lowercase.",
    "",
    "MULTI-AGENT EXAMPLES (combine steps freely across types):",
    "- 'create a bug ticket for GST issue and message Rahul on slack about it'",
    '  → [{"tool":"jira_create_ticket","params":{"title":"GST setting issue","issueType":"Bug"}},{"tool":"slack_send_message","params":{"channel":"rahul","message":"Bug ticket {{ticketKey}} created for GST setting issue."}}]',
    "- 'check my unread slack and telegram messages'",
    '  → [{"tool":"slack_get_unread","params":{}},{"tool":"telegram_get_unread","params":{}}]',
    "- 'send latest invoice to client and notify #billing on slack'",
    '  → [{"tool":"fetch_document","params":{"collection":"Invoices","fallbackToLatest":true}},{"tool":"generate_pdf","params":{}},{"tool":"send_email","params":{"to":"client@example.com"}},{"tool":"slack_send_message","params":{"channel":"billing","message":"Invoice sent to client ✅"}}]',
    "",

    // ── Not an agent task ──────────────────────────────────────────────────
    'If NONE of the above (general questions, coding, analytics, casual chat): {"isAgentTask":false,"confidence":0.95,"intent":"","steps":[]}',
    "",
    "Respond with ONLY valid JSON. No markdown, no explanation.",
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// INTENT PARSER
// ─────────────────────────────────────────────────────────────────────────────
async function parseAgentIntent(userMessage, history = []) {
  try {
    const classifierMessage = await buildClassifierPrompt(userMessage);
    const responseText = await withRetry(
      () => chatCompleteNoSystem(classifierMessage, 512, 0.1),
      { label: "LLM classification" }
    );
    const clean = responseText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("parseAgentIntent failed:", err.message);
    return { isAgentTask: false, confidence: 0, intent: "", steps: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL: fetch_document
// ─────────────────────────────────────────────────────────────────────────────
async function toolFetchDocument(params, db) {
  const {
    collection,
    identifier,
    identifierField = "number",
    fallbackToLatest = false,
  } = params;

  if (!collection) throw new Error("fetch_document requires a collection name");
  if (!ALLOWED_COLLECTIONS.includes(collection))
    throw new Error(`"${collection}" is not an allowed collection`);

  const col = db.collection(collection);
  const vague =
    !identifier ||
    fallbackToLatest ||
    ["latest", "recent", "last", "newest", "any", ""].includes(
      String(identifier).toLowerCase().trim()
    );

  let doc;
  if (vague) {
    doc = await col.findOne({}, { sort: { _id: -1 } });
  } else {
    const escaped = String(identifier).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const fields = [identifierField, "number", "internal_number"].filter(
      (f, i, a) => a.indexOf(f) === i
    );
    const orQuery = fields.flatMap((f) => [
      { [f]: identifier },
      { [f]: { $regex: escaped, $options: "i" } },
    ]);
    doc = await col.findOne({ $or: orQuery });
  }

  if (!doc)
    throw new Error(
      vague
        ? `No documents found in ${collection}`
        : `No document matching "${identifier}" in ${collection}`
    );

  return {
    doc,
    collection,
    docNum: doc.number || doc.internal_number || String(doc._id),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL: generate_pdf
// ─────────────────────────────────────────────────────────────────────────────
async function toolGeneratePDF(params, ctx) {
  if (!ctx.fetchResult)
    throw new Error("generate_pdf requires fetch_document first");

  const { doc, collection } = ctx.fetchResult;
  const typeName = collection.replace(/([A-Z])/g, " $1").trim();

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  const C = {
    purple: rgb(0.388, 0.4, 0.945),
    dark: rgb(0.07, 0.07, 0.15),
    mid: rgb(0.27, 0.27, 0.42),
    light: rgb(0.53, 0.53, 0.67),
    white: rgb(1, 1, 1),
    bg: rgb(0.94, 0.94, 0.98),
    line: rgb(0.88, 0.88, 0.95),
  };

  page.drawRectangle({
    x: 0,
    y: height - 80,
    width,
    height: 80,
    color: C.purple,
  });
  page.drawText("OrionAI", {
    x: 40,
    y: height - 34,
    size: 22,
    font: bold,
    color: C.white,
  });
  page.drawText(typeName.toUpperCase(), {
    x: 40,
    y: height - 57,
    size: 10,
    font,
    color: rgb(0.85, 0.85, 1),
  });
  const docNum = doc.number || doc.internal_number || "N/A";
  page.drawText(`#${docNum}`, {
    x: width - 160,
    y: height - 34,
    size: 13,
    font: bold,
    color: C.white,
  });

  let y = height - 105;
  const docDate = doc.date || doc.created_date || doc.bill_date;
  const dateStr = docDate
    ? new Date(docDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "N/A";
  const status = doc.status || doc.status_cd || "N/A";

  page.drawText(`Date: ${dateStr}`, { x: 40, y, size: 10, font, color: C.mid });
  page.drawText(`Status: ${status}`, {
    x: 220,
    y,
    size: 10,
    font,
    color: C.mid,
  });
  if (doc.total_amount) {
    page.drawText(
      `Total: Rs. ${Number(doc.total_amount).toLocaleString("en-IN")}`,
      {
        x: 400,
        y,
        size: 10,
        font: bold,
        color: C.dark,
      }
    );
  }
  y -= 16;
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 0.8,
    color: C.line,
  });
  y -= 18;

  const party =
    doc.seller_info?.shop_name ||
    doc.buyer_name ||
    doc.party_name ||
    doc.po_info?.buyer_name;
  if (party) {
    page.drawText("Party:", { x: 40, y, size: 9, font: bold, color: C.light });
    page.drawText(String(party).slice(0, 60), {
      x: 90,
      y,
      size: 10,
      font,
      color: C.dark,
    });
    y -= 16;
  }

  const addr = doc.shipping_address_info || doc.billing_address_info;
  if (addr?.city) {
    const addrStr = [addr.shop_name, addr.city, addr.state, addr.pincode]
      .filter(Boolean)
      .join(", ");
    page.drawText("Address:", {
      x: 40,
      y,
      size: 9,
      font: bold,
      color: C.light,
    });
    page.drawText(addrStr.slice(0, 65), {
      x: 90,
      y,
      size: 9,
      font,
      color: C.mid,
    });
    y -= 14;
  }

  y -= 8;
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 0.4,
    color: rgb(0.92, 0.92, 0.97),
  });
  y -= 14;

  if (doc.lineitems?.length) {
    page.drawText("LINE ITEMS", {
      x: 40,
      y,
      size: 8,
      font: bold,
      color: C.light,
    });
    y -= 14;
    page.drawRectangle({
      x: 36,
      y: y - 4,
      width: width - 72,
      height: 18,
      color: C.bg,
    });
    for (const [lbl, xp] of [
      ["Description", 44],
      ["Qty", 320],
      ["Rate", 375],
      ["GST%", 430],
      ["Amount", 470],
    ]) {
      page.drawText(lbl, {
        x: xp,
        y: y + 2,
        size: 8,
        font: bold,
        color: C.mid,
      });
    }
    y -= 18;
    for (const item of (doc.lineitems || []).slice(0, 20)) {
      if (y < 130) {
        page.drawText("(more items...)", {
          x: 44,
          y,
          size: 8,
          font,
          color: C.light,
        });
        y -= 14;
        break;
      }
      page.drawText(String(item.name || item.item_name || "").slice(0, 48), {
        x: 44,
        y,
        size: 8,
        font,
        color: C.dark,
      });
      page.drawText(String(item.qty || ""), {
        x: 320,
        y,
        size: 8,
        font,
        color: C.dark,
      });
      page.drawText(String(item.rate || ""), {
        x: 375,
        y,
        size: 8,
        font,
        color: C.dark,
      });
      page.drawText(String(item.gst || ""), {
        x: 430,
        y,
        size: 8,
        font,
        color: C.dark,
      });
      page.drawText(String(item.amount_wt || item.amount || ""), {
        x: 470,
        y,
        size: 8,
        font,
        color: C.dark,
      });
      y -= 14;
    }
    y -= 6;
  }

  page.drawLine({
    start: { x: 350, y },
    end: { x: width - 36, y },
    thickness: 0.5,
    color: C.line,
  });
  y -= 14;

  for (const [lbl, val] of [
    ["Subtotal", doc.sub_total || doc.total_amount_ex_tax],
    ["Tax", doc.total_tax || doc.tax_amount],
    ["Freight", doc.freight],
    ["TDS", doc.tds?.amount],
    ["Total", doc.total_amount || doc.grand_total || doc.net_amount],
  ]) {
    if (!val) continue;
    const big = lbl === "Total";
    page.drawText(lbl + ":", {
      x: 355,
      y,
      size: big ? 10 : 8,
      font: big ? bold : font,
      color: C.mid,
    });
    page.drawText(`Rs. ${Number(val).toLocaleString("en-IN")}`, {
      x: 455,
      y,
      size: big ? 10 : 8,
      font: big ? bold : font,
      color: C.dark,
    });
    y -= big ? 16 : 13;
  }

  if (doc.payment_summary?.balance_due != null) {
    y -= 8;
    page.drawLine({
      start: { x: 350, y },
      end: { x: width - 36, y },
      thickness: 0.3,
      color: rgb(0.92, 0.92, 0.97),
    });
    y -= 12;
    page.drawText("Balance Due:", {
      x: 355,
      y,
      size: 9,
      font: bold,
      color: rgb(0.87, 0.27, 0.27),
    });
    page.drawText(
      `Rs. ${Number(doc.payment_summary.balance_due).toLocaleString("en-IN")}`,
      {
        x: 455,
        y,
        size: 9,
        font: bold,
        color: rgb(0.87, 0.27, 0.27),
      }
    );
  }

  if (doc.remarks) {
    y -= 20;
    page.drawText("Remarks:", {
      x: 40,
      y,
      size: 8,
      font: bold,
      color: C.light,
    });
    page.drawText(String(doc.remarks).slice(0, 80), {
      x: 90,
      y,
      size: 8,
      font,
      color: C.mid,
    });
  }

  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height: 26,
    color: rgb(0.97, 0.97, 0.99),
  });
  page.drawText(
    `Generated by OrionAI Agent  •  ${new Date().toLocaleString(
      "en-IN"
    )}  •  ${typeName} #${docNum}`,
    { x: 40, y: 9, size: 7, font, color: C.light }
  );

  return Buffer.from(await pdfDoc.save());
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL: send_email
// ─────────────────────────────────────────────────────────────────────────────
async function toolSendEmail(params, ctx) {
  const { to, subject, body } = params;
  if (!to) throw new Error("Email recipient (to) is required");

  const { doc, collection } = ctx.fetchResult || {};
  const typeName = (collection || "Document").replace(/([A-Z])/g, " $1").trim();
  const docNum = doc?.number || doc?.internal_number || "";
  const amount = doc?.total_amount
    ? `Rs.${Number(doc.total_amount).toLocaleString("en-IN")}`
    : "";
  const subj = subject || `${typeName} ${docNum} — OrionAI`;
  const txt =
    body ||
    `Please find attached ${typeName} ${docNum}.\nAmount: ${amount}\n\nSent via OrionAI Agent.`;

  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await withRetry(
    () =>
      t.sendMail({
        from: `"OrionAI" <${process.env.SMTP_USER}>`,
        to,
        subject: subj,
        text: txt,
        html: `<div style="font-family:sans-serif;max-width:580px;margin:0 auto">
      <div style="background:#6366f1;padding:20px 28px;border-radius:10px 10px 0 0">
        <h2 style="color:white;margin:0">🔭 OrionAI</h2>
        <p style="color:rgba(255,255,255,0.75);margin:5px 0 0;font-size:12px">${subj}</p>
      </div>
      <div style="padding:20px 28px;background:#f8f8fc;border:1px solid #e0e0ee;border-top:none;border-radius:0 0 10px 10px">
        <p style="color:#11111f;line-height:1.7">${txt.replace(
          /\n/g,
          "<br>"
        )}</p>
        <hr style="border:none;border-top:1px solid #e0e0ee;margin:14px 0">
        <p style="color:#9898b8;font-size:11px;margin:0">OrionAI Agent • ${new Date().toLocaleString(
          "en-IN"
        )}</p>
      </div>
    </div>`,
        attachments: ctx.pdfBuffer
          ? [
              {
                filename: `${typeName.replace(/ /g, "_")}_${docNum}.pdf`,
                content: ctx.pdfBuffer,
                contentType: "application/pdf",
              },
            ]
          : [],
      }),
    { label: "send_email" }
  );

  return { to, subject: subj };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL: send_whatsapp
// ─────────────────────────────────────────────────────────────────────────────
async function toolSendWhatsApp(params, ctx) {
  const { to, message } = params;
  if (!to) throw new Error("WhatsApp recipient (to) is required");

  const { doc, collection } = ctx.fetchResult || {};
  const typeName = (collection || "Document").replace(/([A-Z])/g, " $1").trim();
  const docNum = doc?.number || doc?.internal_number || "";
  const status = doc?.status || doc?.status_cd || "N/A";
  const amount = doc?.total_amount
    ? `Rs.${Number(doc.total_amount).toLocaleString("en-IN")}`
    : "";
  const body =
    message ||
    `🔭 *OrionAI Agent*\n\n📄 *${typeName} #${docNum}*\nStatus: ${status}\nAmount: ${amount}\n\n_Dispatched via OrionAI_`;

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886",
    to: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
    body,
  });
  return { to };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL: notify_internal
// ─────────────────────────────────────────────────────────────────────────────
function toolNotifyInternal(params, ctx) {
  const { doc, collection } = ctx.fetchResult || {};
  const typeName = (collection || "Document").replace(/([A-Z])/g, " $1").trim();
  const docNum = doc?.number || doc?.internal_number || "";
  return { message: params.message || `✅ ${typeName} #${docNum} processed` };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL: get_commodity_price
// ─────────────────────────────────────────────────────────────────────────────
async function toolGetCommodityPrice(params) {
  const { commodity, market = "Delhi NCR", unit = "quintal" } = params;
  if (!commodity) throw new Error("Commodity name is required");
  const query = `${commodity} wholesale mandi price today ${market} ${new Date().getFullYear()} per ${unit}`;
  try {
    const result = await chatCompleteNoSystem(
      `You are a commodity price assistant for Indian food markets.\n` +
        `Search your knowledge for the current approximate wholesale price of "${commodity}" in ${market}.\n` +
        `Provide: current price range, unit, market name, and any recent trend (up/down/stable).\n` +
        `Format as a clear, concise 2-3 line response. Mention if data may not be real-time.\n` +
        `Query context: ${query}`,
      300,
      0.2
    );
    return { commodity, market, unit, priceInfo: result, query };
  } catch (err) {
    throw new Error(`Price lookup failed for ${commodity}: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL: query_database
// ─────────────────────────────────────────────────────────────────────────────
async function toolQueryDatabase(params, db) {
  const { question, collection } = params;
  if (!question) throw new Error("Question is required for database query");

  const queryPrompt =
    `You are a MongoDB query generator for Poshn's food supply chain database.\n` +
    `Schema info: ${SCHEMA_DESCRIPTION}\n` +
    `Allowed collections: ${ALLOWED_COLLECTIONS.join(", ")}\n\n` +
    `User question: "${question}"\n` +
    `${collection ? `Focus on collection: ${collection}` : ""}\n\n` +
    `Generate a MongoDB aggregation pipeline as JSON array. ` +
    `Return ONLY valid JSON array, no explanation. Max 5 stages. ` +
    `Use $match, $group, $sort, $limit, $project as needed. ` +
    `IMPORTANT: Always use {_id: -1} for sorting latest/recent documents — NEVER sort by date, created_date, or bill_date fields as these may be outdated. ` +
    `Example for latest: [{"$sort":{"_id":-1}},{"$limit":1}]`;

  try {
    const pipelineText = await chatCompleteNoSystem(queryPrompt, 512, 0.1);
    const clean = pipelineText
      .replace(/```json?/g, "")
      .replace(/```/g, "")
      .trim();
    const pipelineMatch = clean.match(/\[[\s\S]*\]/);
    if (!pipelineMatch) throw new Error("Could not generate a valid query");

    const pipeline = JSON.parse(pipelineMatch[0]);
    const targetCollection = collection || ALLOWED_COLLECTIONS[0];
    if (!ALLOWED_COLLECTIONS.includes(targetCollection)) {
      throw new Error(`Collection "${targetCollection}" is not allowed`);
    }

    const col = db.collection(targetCollection);
    const results = await col.aggregate(pipeline).limit(50).toArray();

    const summary = await chatCompleteNoSystem(
      `User asked: "${question}"\n` +
        `Database returned ${results.length} records: ${JSON.stringify(
          results.slice(0, 20)
        )}\n\n` +
        `Provide a clear, concise business summary of these results in 2-4 sentences. ` +
        `Include specific numbers. Format nicely for a chat response.`,
      400,
      0.3
    );

    return {
      question,
      collection: targetCollection,
      rowCount: results.length,
      summary,
    };
  } catch (err) {
    throw new Error(`Database query failed: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL: draft_message
// ─────────────────────────────────────────────────────────────────────────────
async function toolDraftMessage(params) {
  const {
    type = "whatsapp",
    context,
    tone = "formal",
    recipient = "",
  } = params;
  if (!context) throw new Error("Context is required to draft a message");

  const typeLabel =
    type === "whatsapp"
      ? "WhatsApp message"
      : type === "email"
      ? "email"
      : "SMS";
  const prompt =
    `Draft a professional ${tone} ${typeLabel} for Poshn (Indian food supply chain company).\n` +
    `Context: ${context}\n` +
    `${recipient ? `Recipient: ${recipient}` : ""}\n\n` +
    `Requirements:\n` +
    `- Keep it concise and professional\n` +
    `- For WhatsApp: use *bold* for key info, keep under 300 chars if possible\n` +
    `- For email: include a subject line prefixed with "Subject:"\n` +
    `- End with: "— Poshn Team"\n` +
    `Return ONLY the drafted message, nothing else.`;

  try {
    const drafted = await chatCompleteNoSystem(prompt, 400, 0.4);
    return { type, tone, recipient, drafted };
  } catch (err) {
    throw new Error(`Draft failed: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN AGENT
// ─────────────────────────────────────────────────────────────────────────────
async function runAgent(steps, db, onProgress, userId) {
  // Load registry fresh from DB each run so new skills are picked up immediately
  const TOOL_REGISTRY = await loadToolRegistry();
  const ctx = { userId };
  const results = [];

  for (const step of steps) {
    const { tool, params } = step;
    const { needsConfirm, preview } = checkNeedsConfirmation(
      step.tool,
      step.params,
      results
    );
    // Resolve stepUI once per step — used in both running + done progress events
    const stepUI = presentStep(tool, results.length, TOOL_REGISTRY);

    if (needsConfirm) {
      await onProgress({ status: "confirm_needed", tool: step.tool, preview });
      const confirmed = await waitForConfirmation(sessionId, step.tool);
      if (!confirmed) {
        results.push({
          tool: step.tool,
          status: "skipped",
          result: { summary: "Skipped by user" },
        });
        continue;
      }
    }

    onProgress({
      tool,
      status: "running",
      params,
      label: stepUI.label,
      icon: stepUI.icon,
    });

    try {
      let result;

      switch (tool) {
        // ── Document tools ─────────────────────────────────────────────────
        case "fetch_document":
          result = await withRetry(() => toolFetchDocument(params, db), {
            label: "fetch_document",
          });
          ctx.fetchResult = result;
          break;

        case "generate_pdf":
          // Pure in-process CPU work — no external I/O, retry not needed
          ctx.pdfBuffer = await toolGeneratePDF(params, ctx);
          result = { sizeKB: Math.round(ctx.pdfBuffer.length / 1024) };
          break;

        case "send_email":
          // withRetry is applied inside toolSendEmail itself (nodemailer call)
          result = await toolSendEmail(params, ctx);
          break;

        case "send_whatsapp":
          result = await withRetry(() => toolSendWhatsApp(params, ctx), {
            label: "send_whatsapp",
          });
          break;

        case "notify_internal":
          // Synchronous in-memory helper — no external I/O
          result = toolNotifyInternal(params, ctx);
          break;

        case "send_slack":
          result = await withRetry(() => toolSlack(params, ctx), {
            label: "send_slack",
          });
          break;

        // ── Jira: read tools ───────────────────────────────────────────────
        case "jira_get_backlog":
          result = await withRetry(() => toolGetBacklog(params, ctx), {
            label: "jira_get_backlog",
          });
          break;

        case "jira_get_overdue":
          result = await withRetry(() => toolGetOverdueTickets(params, ctx), {
            label: "jira_get_overdue",
          });
          ctx.jiraOverdue = result.tickets;
          break;

        case "jira_update_dates":
          if (ctx.jiraOverdue) params.tickets = ctx.jiraOverdue;
          result = await withRetry(() => toolUpdateDueDates(params, ctx), {
            label: "jira_update_dates",
          });
          break;

        case "jira_my_tickets":
          result = await withRetry(() => toolGetMyTickets(params, ctx), {
            label: "jira_my_tickets",
          });
          break;

        case "jira_sprint_summary":
          result = await withRetry(() => toolGetSprintSummary(params, ctx), {
            label: "jira_sprint_summary",
          });
          break;

        case "jira_shipped_last_sprint":
          result = await withRetry(
            () => toolGetShippedLastSprint(params, ctx),
            { label: "jira_shipped_last_sprint" }
          );
          break;

        case "jira_most_overdue":
          result = await withRetry(() => toolGetMostOverdue(params, ctx), {
            label: "jira_most_overdue",
          });
          break;

        case "jira_sprint_bugs":
          result = await withRetry(() => toolGetSprintBugs(params, ctx), {
            label: "jira_sprint_bugs",
          });
          break;

        case "jira_search":
          result = await withRetry(() => toolSearchTickets(params, ctx), {
            label: "jira_search",
          });
          break;

        // ── Jira: write tools ──────────────────────────────────────────────
        case "jira_create_ticket":
          result = await withRetry(() => toolCreateTicket(params, ctx), {
            label: "jira_create_ticket",
          });
          ctx.lastCreatedTicketKey = result.key;
          break;

        case "jira_move_ticket":
          result = await withRetry(() => toolMoveTicket(params, ctx), {
            label: "jira_move_ticket",
          });
          break;

        case "jira_assign_ticket":
          if (
            !params.ticketKey ||
            params.ticketKey === "<TICKET_KEY_FROM_PREVIOUS_STEP>" ||
            params.ticketKey === ""
          ) {
            if (ctx.lastCreatedTicketKey) {
              params.ticketKey = ctx.lastCreatedTicketKey;
              console.log(`Auto-resolved ticketKey → ${params.ticketKey}`);
            } else {
              throw new Error(
                "No ticket key available. Create a ticket first."
              );
            }
          }
          result = await withRetry(() => toolAssignTicket(params, ctx), {
            label: "jira_assign_ticket",
          });
          break;

        case "jira_add_comment":
          result = await withRetry(() => toolAddComment(params, ctx), {
            label: "jira_add_comment",
          });
          break;

        // ── Jira: notify (chains into Slack + email) ───────────────────────
        case "jira_notify_overdue": {
          result = await withRetry(() => toolNotifyOverdue(params, ctx), {
            label: "jira_notify_overdue",
          });

          for (const n of result.notifications || []) {
            if (n.channels.includes("slack") && n.slackChannel) {
              try {
                await withRetry(
                  () =>
                    toolSlack(
                      { channel: n.slackChannel, message: n.slackBody },
                      ctx
                    ),
                  { label: `jira_notify_overdue:slack:${n.person}` }
                );
                console.log(
                  `✅ Slack sent to ${n.slackChannel} for ${n.person}`
                );
              } catch (err) {
                console.warn(`Slack failed for ${n.person}:`, err.message);
              }
            }
            if (n.channels.includes("email") && n.emailAddress) {
              try {
                await toolSendEmail(
                  {
                    to: n.emailAddress,
                    subject: result.emailSubject,
                    body: n.emailBody,
                  },
                  ctx
                );
                console.log(
                  `✅ Email sent to ${n.emailAddress} for ${n.person}`
                );
              } catch (err) {
                console.warn(`Email failed for ${n.person}:`, err.message);
              }
            } else if (n.channels.includes("email") && !n.emailAddress) {
              console.warn(
                `Skipping email for ${n.person} — no email found in Jira`
              );
            }
          }
          break;
        }

        case "jira_link_ticket":
          if (
            !params.ticketKey ||
            params.ticketKey === "<TICKET_KEY_FROM_PREVIOUS_STEP>"
          ) {
            params.ticketKey = ctx.lastCreatedTicketKey || null;
          }
          if (!params.ticketKey) throw new Error("No ticket key to link");
          result = await withRetry(() => toolLinkTicket(params, ctx), {
            label: "jira_link_ticket",
          });
          break;

        // ── Gmail ──────────────────────────────────────────────────────────
        case "gmail_get_inbox":
          result = await withRetry(() => toolGmailGetInbox(params, ctx), {
            label: "gmail_get_inbox",
          });
          break;

        case "gmail_search_emails":
          // BUG FIX: was incorrectly calling calendarDelete
          result = await withRetry(() => toolGmailSearchEmails(params, ctx), {
            label: "gmail_search_emails",
          });
          break;

        case "gmail_get_email":
          result = await withRetry(() => toolGmailGetEmail(params, ctx), {
            label: "gmail_get_email",
          });
          ctx.lastEmail = result;
          break;

        case "gmail_summarize_thread":
          result = await withRetry(
            () => toolGmailSummarizeThread(params, ctx),
            {
              label: "gmail_summarize_thread",
            }
          );
          break;

        case "gmail_send_email":
          result = await withRetry(() => toolGmailSendEmail(params, ctx), {
            label: "gmail_send_email",
          });
          break;

        case "gmail_reply_email":
          result = await withRetry(() => toolGmailReplyEmail(params, ctx), {
            label: "gmail_reply_email",
          });
          break;

        // ── Google Calendar ────────────────────────────────────────────────
        case "calendar_get_today":
          result = await withRetry(() => calendarGetToday(params, ctx), {
            label: "calendar_get_today",
          });
          break;

        case "calendar_get_week":
          result = await withRetry(() => calendarGetWeek(params, ctx), {
            label: "calendar_get_week",
          });
          break;

        case "calendar_get_events":
          result = await withRetry(() => calendarGetEvents(params, ctx), {
            label: "calendar_get_events",
          });
          break;

        case "calendar_create":
          result = await withRetry(() => calendarCreate(params, ctx), {
            label: "calendar_create",
          });
          break;

        case "calendar_update":
          result = await withRetry(() => calendarUpdate(params, ctx), {
            label: "calendar_update",
          });
          break;

        case "calendar_delete":
          result = await withRetry(() => calendarDelete(params, ctx), {
            label: "calendar_delete",
          });
          break;

        case "calendar_get_invites":
          result = await withRetry(() => calendarGetInvites(params, ctx), {
            label: "calendar_get_invites",
          });
          break;

        case "calendar_respond":
          result = await withRetry(() => calendarRespond(params, ctx), {
            label: "calendar_respond",
          });
          break;

        // ── Telegram ───────────────────────────────────────────────────────
        case "telegram_list_chats":
          result = await withRetry(() => toolTelegramListChats(params, ctx), {
            label: "telegram_list_chats",
          });
          break;

        case "telegram_get_messages":
          result = await withRetry(() => toolTelegramGetMessages(params, ctx), {
            label: "telegram_get_messages",
          });
          break;

        case "telegram_send_message":
          result = await withRetry(() => toolTelegramSendMessage(params, ctx), {
            label: "telegram_send_message",
          });
          break;

        case "telegram_get_unread":
          result = await withRetry(() => toolTelegramGetUnread(params, ctx), {
            label: "telegram_get_unread",
          });
          break;

        case "telegram_search_messages":
          result = await withRetry(
            () => toolTelegramSearchMessages(params, ctx),
            { label: "telegram_search_messages" }
          );
          break;

        case "telegram_reply_message":
          result = await withRetry(
            () => toolTelegramReplyMessage(params, ctx),
            {
              label: "telegram_reply_message",
            }
          );
          break;

        case "telegram_get_contact_info":
          result = await withRetry(
            () => toolTelegramGetContactInfo(params, ctx),
            { label: "telegram_get_contact_info" }
          );
          break;

        // ── Slack ──────────────────────────────────────────────────────────
        case "slack_read_messages":
          // BUG FIX: was incorrectly calling toolSlack with action "send"
          result = await withRetry(
            () => toolSlack({ action: "read", channel: params.channel }, ctx),
            { label: "slack_read_messages" }
          );
          break;

        case "slack_send_message":
          result = await withRetry(
            () =>
              toolSlack(
                {
                  action: "send",
                  channel: params.channel,
                  message: params.message,
                },
                ctx
              ),
            { label: "slack_send_message" }
          );
          break;

        case "slack_get_unread":
          result = await withRetry(() => toolSlack({ action: "unread" }, ctx), {
            label: "slack_get_unread",
          });
          break;

        case "slack_list_channels":
          result = await withRetry(
            () => toolSlack({ action: "list_channels" }, ctx),
            { label: "slack_list_channels" }
          );
          break;

        // ── WhatsApp ───────────────────────────────────────────────────────
        case "whatsapp_send_message":
          result = await withRetry(
            () => toolWhatsApp({ action: "send", ...params }, ctx),
            { label: "whatsapp_send_message" }
          );
          break;

        case "whatsapp_get_messages":
          result = await withRetry(
            () => toolWhatsApp({ action: "get_messages", ...params }, ctx),
            { label: "whatsapp_get_messages" }
          );
          break;

        case "whatsapp_get_unread":
          result = await withRetry(
            () => toolWhatsApp({ action: "get_unread", ...params }, ctx),
            { label: "whatsapp_get_unread" }
          );
          break;

        case "whatsapp_list_chats":
          result = await withRetry(
            () => toolWhatsApp({ action: "list_chats", ...params }, ctx),
            { label: "whatsapp_list_chats" }
          );
          break;

        default:
          throw new Error(`Unknown tool: "${tool}"`);
      }

      onProgress({
        tool,
        status: "done",
        result,
        label: stepUI.label,
        icon: stepUI.icon,
      });
      results.push({ tool, status: "done", result });
    } catch (err) {
      onProgress({ tool, status: "error", error: err.message });
      results.push({ tool, status: "error", error: err.message });
      break; // stop pipeline on first error
    }
  }

  return results;
}

module.exports = {
  parseAgentIntent,
  runAgent,
  loadToolRegistry, // exported so agentController can call it for stepSummary
};
