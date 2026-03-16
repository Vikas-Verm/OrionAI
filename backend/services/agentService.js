const nodemailer = require("nodemailer");
const twilio = require("twilio");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { chatCompleteNoSystem } = require("./llmService");
const { SCHEMA_DESCRIPTION, ALLOWED_COLLECTIONS } = require("./dbQueryService");
const { toolSendSlack } = require("./tools/toolSlack");
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
  let toolLines = [];

  try {
    const skills = await Skill.find({ enabled: true, category: "jira" });
    toolLines = skills.map((s) => {
      const exampleOutput =
        s.promptExample?.output || `{"tool":"${s.toolName}","params":{}}`;
      const lines = [`- ${s.triggers.join(" / ")} → ${exampleOutput}`];
      if (s.promptExample?.userSays) {
        lines.push(`  Example: "${s.promptExample.userSays}"`);
      }
      return lines.join("\n");
    });
  } catch (err) {
    console.error("buildClassifierPrompt DB fetch failed:", err.message);
  }

  return [
    `I need help understanding this user request: "${userMessage}"`,
    "",
    "Is this one of these task types?",
    "",
    "TYPE A — DOCUMENT DELIVERY: user wants to send, email, share, or dispatch a business document to a person.",
    "TYPE B — JIRA TASK: user mentions Jira, tickets, backlog, sprint, overdue, due dates, tasks, bugs, assignee.",
    "",
    "Document collections: invoice→Invoices | bill→Bills | PO→PurchaseOrders | CN→CreditNotes | DN→DebitNotes | payment→PaymentRequests | POD→ProofOfDeliveries",
    "",
    "If TYPE A — respond with:",
    '{"isAgentTask":true,"confidence":0.95,"intent":"brief description","steps":[{"tool":"fetch_document","params":{"collection":"Invoices","identifier":"INV-001","identifierField":"number","fallbackToLatest":false}},{"tool":"generate_pdf","params":{}},{"tool":"send_email","params":{"to":"email@example.com","subject":"Invoice"}}]}',
    "Use fallbackToLatest:true when user says latest/recent/last. Use empty string for to if no recipient.",
    "",
    "If TYPE B — Jira, pick the right tool:",
    ...toolLines,
    "",
    'Jira response format: {"isAgentTask":true,"confidence":0.93,"intent":"brief description","steps":[{"tool":"TOOL_NAME","params":{...}}]}',
    "IMPORTANT: Always put assigneeName inside jira_create_ticket params, never as a separate jira_assign_ticket step.",
    "",
    "",
    "If TYPE C — GMAIL (user wants to read/check/search/send/reply to emails):",
    "- check inbox / show emails / what's in my inbox → gmail_get_inbox with params {maxResults:10}",
    "- show unread emails → gmail_get_inbox with params {unreadOnly:true,maxResults:10}",
    '- search emails from X / find emails about Y → gmail_search_emails with params {query:"from:X" or "subject:Y"}',
    '- open / read / show email about X → gmail_get_email with params {subject:"X"}',
    "- summarize email / summarize thread → chain: gmail_get_email then gmail_summarize_thread",
    '- send email to X about Y → gmail_send_email with params {to:"email@x.com",subject:"Y",body:"..."}',
    "- reply to email / respond to email → chain: gmail_get_email then gmail_reply_email",
    'Gmail format: {"isAgentTask":true,"confidence":0.93,"intent":"..","steps":[{"tool":"gmail_get_inbox","params":{"maxResults":10}}]}',
    "",
    "If TYPE D — GOOGLE CALENDAR (user wants to check/create/update/delete events or invites):",
    "- what's on my calendar / show today's events → calendar_get_today",
    "- show this week / what do I have this week → calendar_get_week",
    "- find events about X / events on date Y → calendar_get_events with params {query:'X'} or {dateFrom:'YYYY-MM-DD'}",
    "- schedule / create / add meeting → calendar_create with params {title, startDateTime (ISO8601), durationMinutes, attendees:['email@x.com'], addMeet:false}",
    "- reschedule / update event X → calendar_update with params {title:'X', startDateTime}",
    "- delete / cancel event X → calendar_delete with params {title:'X'}",
    "- check pending invites / RSVPs → calendar_get_invites",
    "- accept / decline / maybe invite X → calendar_respond with params {title:'X', response:'accept'|'decline'|'tentative'}",
    'Calendar format: {"isAgentTask":true,"confidence":0.93,"intent":"..","steps":[{"tool":"calendar_create","params":{"title":"Meeting","startDateTime":"2026-03-11T10:00:00+05:30","durationMinutes":30}}]}',
    "",
    'If NEITHER (general questions, coding, analytics, casual chat): {"isAgentTask":false,"confidence":0.95,"intent":"","steps":[]}',
    "",
    "",
    "If TYPE E — TELEGRAM (user wants to read, search, send, reply to Telegram messages):",
    "- show telegram messages / what did X say on telegram → telegram_get_messages with params {contact:'X', limit:20}",
    "- list telegram chats / who messaged me on telegram → telegram_list_chats",
    "- send telegram message to X → telegram_send_message with params {contact:'X', message:'...'}",
    "- show unread / what are my unread telegram messages → telegram_get_unread with params {limit:10}",
    "- search telegram for X / find messages about X in telegram → telegram_search_messages with params {query:'X'}",
    "- search for X in chat with Y / find X in telegram conversation with Y → telegram_search_messages with params {query:'X', contact:'Y'}",
    "- reply to X on telegram / respond to X → telegram_reply_message with params {contact:'X', message:'...'}",
    "- who is X on telegram / get info about X on telegram → telegram_get_contact_info with params {contact:'X'}",
    'Telegram format: {"isAgentTask":true,"confidence":0.93,"intent":"..","steps":[{"tool":"telegram_get_messages","params":{"contact":"Rahul","limit":20}}]}',
    "",
    "Respond with ONLY the JSON object, nothing else.",
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// INTENT PARSER
// ─────────────────────────────────────────────────────────────────────────────
async function parseAgentIntent(userMessage, history = []) {
  try {
    const classifierMessage = await buildClassifierPrompt(userMessage);
    const responseText = await chatCompleteNoSystem(
      classifierMessage,
      512,
      0.1
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

  await t.sendMail({
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
  });

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
    const stepUI = presentStep(tool, results.length, TOOL_REGISTRY);

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
        // ── Document tools ─────────────────────────────────────────
        case "fetch_document":
          result = await toolFetchDocument(params, db);
          ctx.fetchResult = result;
          break;

        case "generate_pdf":
          ctx.pdfBuffer = await toolGeneratePDF(params, ctx);
          result = { sizeKB: Math.round(ctx.pdfBuffer.length / 1024) };
          break;

        case "send_email":
          result = await toolSendEmail(params, ctx);
          break;

        case "send_whatsapp":
          result = await toolSendWhatsApp(params, ctx);
          break;

        case "notify_internal":
          result = toolNotifyInternal(params, ctx);
          break;

        case "send_slack":
          result = await toolSendSlack(params, ctx);
          break;

        // ── Jira: read tools ────────────────────────────────────────
        case "jira_get_backlog":
          result = await toolGetBacklog(params, ctx);
          break;

        case "jira_get_overdue":
          result = await toolGetOverdueTickets(params, ctx);
          ctx.jiraOverdue = result.tickets; // saved for jira_update_dates chaining
          break;

        case "jira_update_dates":
          if (ctx.jiraOverdue) params.tickets = ctx.jiraOverdue;
          result = await toolUpdateDueDates(params, ctx);
          break;

        case "jira_my_tickets":
          result = await toolGetMyTickets(params, ctx);
          break;

        case "jira_sprint_summary":
          result = await toolGetSprintSummary(params, ctx);
          break;

        case "jira_shipped_last_sprint":
          result = await toolGetShippedLastSprint(params, ctx);
          break;

        case "jira_most_overdue":
          result = await toolGetMostOverdue(params, ctx);
          break;

        case "jira_sprint_bugs":
          result = await toolGetSprintBugs(params, ctx);
          break;

        case "jira_search":
          result = await toolSearchTickets(params, ctx);
          break;

        // ── Jira: write tools ───────────────────────────────────────
        case "jira_create_ticket":
          result = await toolCreateTicket(params, ctx);
          ctx.lastCreatedTicketKey = result.key; // saved for chained assign step
          break;

        case "jira_move_ticket":
          result = await toolMoveTicket(params, ctx);
          break;

        case "jira_assign_ticket":
          // Safety net: if LLM used a placeholder key, replace with last created ticket
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
          result = await toolAssignTicket(params, ctx);
          break;

        case "jira_add_comment":
          result = await toolAddComment(params, ctx);
          break;

        // ── Jira: notify (chains into slack + email) ────────────────
        case "jira_notify_overdue": {
          result = await toolNotifyOverdue(params, ctx);

          for (const n of result.notifications || []) {
            if (n.channels.includes("slack") && n.slackChannel) {
              try {
                await toolSendSlack(
                  { channel: n.slackChannel, message: n.slackBody },
                  ctx
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
          // If LLM used placeholder, resolve from last created ticket
          if (
            !params.ticketKey ||
            params.ticketKey === "<TICKET_KEY_FROM_PREVIOUS_STEP>"
          ) {
            params.ticketKey = ctx.lastCreatedTicketKey || null;
          }
          if (!params.ticketKey) throw new Error("No ticket key to link");
          result = await toolLinkTicket(params, ctx);
          break;

        // ── Gmail tools ────────────────────────────────────────────────────────
        case "gmail_get_inbox":
          result = await toolGmailGetInbox(params, ctx);
          break;

        case "gmail_search_emails":
          result = await toolGmailSearchEmails(params, ctx);
          break;

        case "gmail_get_email":
          result = await toolGmailGetEmail(params, ctx);
          ctx.lastEmail = result;
          break;

        case "gmail_summarize_thread":
          result = await toolGmailSummarizeThread(params, ctx);
          break;

        case "gmail_send_email":
          result = await toolGmailSendEmail(params, ctx);
          break;

        case "gmail_reply_email":
          result = await toolGmailReplyEmail(params, ctx);
          break;

        // ── Google Calendar ──────────────────────────────
        case "calendar_get_today":
          result = await calendarGetToday(params, ctx);
          break;
        case "calendar_get_week":
          result = await calendarGetWeek(params, ctx);
          break;
        case "calendar_get_events":
          result = await calendarGetEvents(params, ctx);
          break;
        case "calendar_create":
          result = await calendarCreate(params, ctx);
          break;
        case "calendar_update":
          result = await calendarUpdate(params, ctx);
          break;
        case "calendar_delete":
          result = await calendarDelete(params, ctx);
          break;
        case "calendar_get_invites":
          result = await calendarGetInvites(params, ctx);
          break;
        case "calendar_respond":
          result = await calendarRespond(params, ctx);
          break;
        case "telegram_list_chats":
          result = await toolTelegramListChats(params, ctx);
          break;
        case "telegram_get_messages":
          result = await toolTelegramGetMessages(params, ctx);
          break;
        case "telegram_send_message":
          result = await toolTelegramSendMessage(params, ctx);
          break;
        case "telegram_get_unread":
          result = await toolTelegramGetUnread(params, ctx);
          break;
        case "telegram_search_messages":
          result = await toolTelegramSearchMessages(params, ctx);
          break;
        case "telegram_reply_message":
          result = await toolTelegramReplyMessage(params, ctx);
          break;
        case "telegram_get_contact_info":
          result = await toolTelegramGetContactInfo(params, ctx);
          break;
        default:
          throw new Error(`Unknown tool: "${tool}"`);
      }

      const stepUI = presentStep(tool, results.length, TOOL_REGISTRY);

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
