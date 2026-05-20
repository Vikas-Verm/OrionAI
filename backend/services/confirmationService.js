const DESTRUCTIVE_TOOLS = new Set([
  // Sends actual messages
  "telegram_send_message",
  "telegram_reply_message",
  "slack_send_message",
  "whatsapp_send_message",
  "send_email",
  "send_whatsapp",

  // Deletes data
  "calendar_delete",
  "jira_delete_ticket",

  // Creates records (less destructive but still confirm)
  "jira_create_ticket",
  "calendar_create",

  // Mass actions
  "jira_notify_overdue",
  "razorpay_create_payout",

  // Google Docs — sharing & deleting are destructive
  "google_docs_share",
  "google_docs_delete",

  // Google Sheets — sharing & deleting are destructive
  "google_sheets_share",
  "google_sheets_delete",
]);

const BATCH_THRESHOLD = 3;

const EXACT_MESSAGE_SEND_TOOLS = new Set([
  "telegram_send_message",
  "slack_send_message",
  "whatsapp_send_message",
]);

function hasExactSendTarget(tool, params = {}) {
  if (tool === "telegram_send_message") return Boolean(params.contact);
  if (tool === "slack_send_message") return Boolean(params.channel);
  if (tool === "whatsapp_send_message") {
    return Boolean(
      params.to || params.contact || params.phone || params.chatId || params.roomId
    );
  }
  return false;
}

function checkNeedsConfirmation(tool, params, previousResults = []) {
  if (!DESTRUCTIVE_TOOLS.has(tool)) {
    return { needsConfirm: false };
  }

  if (
    EXACT_MESSAGE_SEND_TOOLS.has(tool) &&
    hasExactSendTarget(tool, params) &&
    Boolean(params?.message) &&
    params?.messageSource === "user_exact" &&
    params?.skipConfirmation === true
  ) {
    return { needsConfirm: false };
  }

  // Build a human-readable preview of what will happen
  const preview = buildPreview(tool, params, previousResults);

  // High-risk actions always need confirmation
  const isHighRisk = [
    "send_email",
    "whatsapp_send_message",
    "telegram_send_message",
    "slack_send_message",
    "jira_notify_overdue",
    "calendar_delete",
    "razorpay_create_payout",
    "google_docs_share",
    "google_docs_delete",
    "google_sheets_share",
    "google_sheets_delete",
  ].includes(tool);

  // Batch actions (multiple recipients) always need confirmation
  const isBatch =
    (Array.isArray(params.recipients) &&
      params.recipients.length > BATCH_THRESHOLD) ||
    (Array.isArray(params.contacts) &&
      params.contacts.length > BATCH_THRESHOLD);

  if (isHighRisk || isBatch) {
    return { needsConfirm: true, preview };
  }

  return { needsConfirm: false };
}

function buildPreview(tool, params, previousResults) {
  switch (tool) {
    case "telegram_send_message":
    case "telegram_reply_message":
      return {
        action: "Send Telegram message",
        to: params.contact || params.chatId,
        message: params.message?.slice(0, 100),
        icon: "✈️",
      };

    case "slack_send_message":
      return {
        action: "Send Slack message",
        to: params.channel,
        message: params.message?.slice(0, 100),
        icon: "💬",
      };

    case "whatsapp_send_message":
    case "send_whatsapp":
      return {
        action: "Send WhatsApp message",
        to: params.phone || params.contact || params.to,
        message: params.message?.slice(0, 100),
        icon: "📱",
      };

    case "send_email":
      return {
        action: "Send email",
        to: params.to,
        subject: params.subject,
        icon: "📧",
      };

    case "calendar_delete":
      return {
        action: "Delete calendar event",
        event: params.title || params.eventId,
        icon: "📅",
        danger: true,
      };

    case "jira_create_ticket":
      return {
        action: "Create Jira ticket",
        title: params.title || params.summary,
        project: params.projectKey,
        icon: "🎯",
      };

    case "jira_notify_overdue":
      return {
        action: "Send overdue notifications to team",
        icon: "🔔",
        danger: false,
      };

    case "razorpay_create_payout":
      return {
        action: "Create Razorpay payout",
        title: params.referenceId || params.contactName || "Business payout",
        to: params.contactName || params.fundAccountId || params.accountNumber,
        message: params.amount
          ? `Amount: INR ${Number(params.amount).toLocaleString("en-IN")}`
          : params.narration || "This will trigger a real payout.",
        icon: "₹",
        danger: true,
      };

    case "google_docs_share":
      return {
        action: "Share Google Doc",
        to: params.email || (params.emails || []).join(", "),
        message: `Role: ${params.role || "writer"}`,
        icon: "🔗",
      };

    case "google_docs_delete":
      return {
        action: "Delete Google Doc",
        title: params.documentId || "document",
        icon: "🗑️",
        danger: true,
      };

    case "google_sheets_share":
      return {
        action: "Share Google Sheet",
        to: params.email || (params.emails || []).join(", "),
        message: `Role: ${params.role || "writer"}`,
        icon: "🔗",
      };

    case "google_sheets_delete":
      return {
        action: "Delete Google Sheet",
        title: params.spreadsheetId || "spreadsheet",
        icon: "🗑️",
        danger: true,
      };

    default:
      return {
        action: tool.replace(/_/g, " "),
        params: JSON.stringify(params).slice(0, 100),
        icon: "⚙️",
      };
  }
}

module.exports = { checkNeedsConfirmation, DESTRUCTIVE_TOOLS, buildPreview };
