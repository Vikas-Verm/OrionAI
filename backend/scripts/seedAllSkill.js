/**
 * seedAllSkills.js
 * 📁 backend/scripts/seedAllSkills.js
 *
 * Seeds 60+ skills across all integrations.
 * Run: node scripts/seedAllSkills.js
 *
 * After running, your agent can do EVERYTHING via natural language.
 * Examples:
 *   "What did Adi message me on Telegram?"
 *   "Create a Jira ticket for the bug Rahul mentioned in Slack and assign it to him"
 *   "Summarize my unread emails and send a digest to my Telegram"
 *   "What meetings do I have this week? Create a Jira task for each one"
 *   "Send the latest invoice to client@company.com via WhatsApp and Email"
 *   "Check all my Slack channels and summarize what I missed"
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Skill = require("../models/skill");

const ALL_SKILLS = [
  // ══════════════════════════════════════════════════════════════════════
  // JIRA — Complete coverage
  // ══════════════════════════════════════════════════════════════════════
  {
    toolName: "jira_my_tickets",
    icon: "🎫",
    label: "My Jira tickets",
    category: "jira",
    enabled: true,
    description:
      "Get all Jira tickets assigned to a specific person or yourself. Shows status, due date, priority and sprint.",
    params: [
      {
        name: "assigneeName",
        type: "string",
        required: false,
        description: "Name of the person. Leave empty for your own tickets.",
        example: "Hari",
      },
      {
        name: "projectKey",
        type: "string",
        required: false,
        description: "Jira project key filter",
        example: "ENGG",
      },
      {
        name: "status",
        type: "string",
        required: false,
        description: "Filter by status",
        example: "In Progress",
      },
    ],
    promptExample: {
      userSays: "Show Hari's tickets",
      output: '{"tool":"jira_my_tickets","params":{"assigneeName":"Hari"}}',
    },
  },
  {
    toolName: "jira_get_backlog",
    icon: "📋",
    label: "Jira backlog",
    category: "jira",
    enabled: true,
    description: "Get all open tickets in the Jira backlog for a project.",
    params: [
      { name: "projectKey", type: "string", required: false, example: "ENGG" },
      { name: "maxResults", type: "number", required: false, default: "50" },
    ],
    promptExample: {
      userSays: "Show backlog for ENGG",
      output: '{"tool":"jira_get_backlog","params":{"projectKey":"ENGG"}}',
    },
  },
  {
    toolName: "jira_get_overdue",
    icon: "⚠️",
    label: "Overdue tickets",
    category: "jira",
    enabled: true,
    description:
      "Get all overdue Jira tickets — past their due date and not done.",
    params: [
      { name: "projectKey", type: "string", required: false, example: "ENGG" },
      {
        name: "assigneeName",
        type: "string",
        required: false,
        description: "Filter by assignee",
      },
    ],
    promptExample: {
      userSays: "Show all overdue tickets",
      output: '{"tool":"jira_get_overdue","params":{}}',
    },
  },
  {
    toolName: "jira_sprint_summary",
    icon: "🏃",
    label: "Sprint summary",
    category: "jira",
    enabled: true,
    description:
      "Get a summary of the current sprint — done, in-progress, todo, overdue counts.",
    params: [
      { name: "projectKey", type: "string", required: false, example: "ENGG" },
    ],
    promptExample: {
      userSays: "How is the sprint going?",
      output: '{"tool":"jira_sprint_summary","params":{}}',
    },
  },
  {
    toolName: "jira_create_ticket",
    icon: "➕",
    label: "Create Jira ticket",
    category: "jira",
    enabled: true,
    description:
      "Create a new Jira ticket with summary, description, priority, assignee and type.",
    params: [
      {
        name: "summary",
        type: "string",
        required: true,
        description: "Ticket title/summary",
        example: "Fix login bug on mobile",
      },
      {
        name: "description",
        type: "string",
        required: false,
        description: "Detailed description",
      },
      {
        name: "priority",
        type: "string",
        required: false,
        description: "Highest/High/Medium/Low",
        default: "Medium",
      },
      {
        name: "assigneeName",
        type: "string",
        required: false,
        description: "Assignee full name",
        example: "Hari Kumar",
      },
      {
        name: "type",
        type: "string",
        required: false,
        description: "Bug/Story/Task/Epic",
        default: "Task",
      },
      { name: "projectKey", type: "string", required: false, example: "ENGG" },
    ],
    promptExample: {
      userSays: "Create a high priority bug for login crash",
      output:
        '{"tool":"jira_create_ticket","params":{"summary":"Login crash on mobile","priority":"High","type":"Bug"}}',
    },
  },
  {
    toolName: "jira_move_ticket",
    icon: "🔄",
    label: "Move Jira ticket",
    category: "jira",
    enabled: true,
    description:
      "Move a Jira ticket to a different status like In Progress, Done, In Review.",
    params: [
      {
        name: "ticketKey",
        type: "string",
        required: true,
        description: "Jira ticket key",
        example: "ENGG-123",
      },
      {
        name: "newStatus",
        type: "string",
        required: true,
        description: "Target status",
        example: "In Review",
      },
    ],
    promptExample: {
      userSays: "Move ENGG-123 to Done",
      output:
        '{"tool":"jira_move_ticket","params":{"ticketKey":"ENGG-123","newStatus":"Done"}}',
    },
  },
  {
    toolName: "jira_assign_ticket",
    icon: "👤",
    label: "Assign Jira ticket",
    category: "jira",
    enabled: true,
    description: "Assign or reassign a Jira ticket to a team member.",
    params: [
      {
        name: "ticketKey",
        type: "string",
        required: true,
        example: "ENGG-123",
      },
      {
        name: "assigneeName",
        type: "string",
        required: true,
        example: "Hari Kumar",
      },
    ],
    promptExample: {
      userSays: "Assign ENGG-123 to Hari",
      output:
        '{"tool":"jira_assign_ticket","params":{"ticketKey":"ENGG-123","assigneeName":"Hari"}}',
    },
  },
  {
    toolName: "jira_add_comment",
    icon: "💬",
    label: "Comment on ticket",
    category: "jira",
    enabled: true,
    description: "Add a comment to a Jira ticket.",
    params: [
      {
        name: "ticketKey",
        type: "string",
        required: true,
        example: "ENGG-123",
      },
      {
        name: "comment",
        type: "string",
        required: true,
        example: "Fixed in PR #45",
      },
    ],
    promptExample: {
      userSays: "Comment on ENGG-123: fixed in PR",
      output:
        '{"tool":"jira_add_comment","params":{"ticketKey":"ENGG-123","comment":"Fixed in PR #45"}}',
    },
  },
  {
    toolName: "jira_search",
    icon: "🔍",
    label: "Search Jira",
    category: "jira",
    enabled: true,
    description:
      "Search Jira tickets using JQL or keyword. Finds tickets by title, description, assignee, label.",
    params: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Search keyword or JQL query",
        example: "login bug",
      },
      { name: "maxResults", type: "number", required: false, default: "10" },
    ],
    promptExample: {
      userSays: "Find all login-related tickets",
      output: '{"tool":"jira_search","params":{"query":"login"}}',
    },
  },
  {
    toolName: "jira_most_overdue",
    icon: "🔥",
    label: "Most overdue tickets",
    category: "jira",
    enabled: true,
    description:
      "Get the most overdue tickets grouped by assignee to identify blockers.",
    params: [
      { name: "projectKey", type: "string", required: false, example: "ENGG" },
      { name: "limit", type: "number", required: false, default: "10" },
    ],
    promptExample: {
      userSays: "Who has the most overdue tickets?",
      output: '{"tool":"jira_most_overdue","params":{}}',
    },
  },
  {
    toolName: "jira_sprint_bugs",
    icon: "🐛",
    label: "Sprint bugs",
    category: "jira",
    enabled: true,
    description: "Get all open bugs in the current sprint.",
    params: [
      { name: "projectKey", type: "string", required: false, example: "ENGG" },
    ],
    promptExample: {
      userSays: "How many bugs in current sprint?",
      output: '{"tool":"jira_sprint_bugs","params":{}}',
    },
  },
  {
    toolName: "jira_notify_overdue",
    icon: "📢",
    label: "Notify overdue assignees",
    category: "jira",
    enabled: true,
    description:
      "Send notifications to people with overdue tickets via Slack and email.",
    params: [
      { name: "projectKey", type: "string", required: false, example: "ENGG" },
      {
        name: "channels",
        type: "array",
        required: false,
        description: "Notification channels",
        default: '["slack","email"]',
      },
    ],
    promptExample: {
      userSays: "Notify everyone with overdue tickets",
      output: '{"tool":"jira_notify_overdue","params":{}}',
    },
  },
  {
    toolName: "jira_shipped_last_sprint",
    icon: "🚀",
    label: "Shipped last sprint",
    category: "jira",
    enabled: true,
    description:
      "Get all tickets that were shipped/completed in the last sprint.",
    params: [
      { name: "projectKey", type: "string", required: false, example: "ENGG" },
    ],
    promptExample: {
      userSays: "What did we ship last sprint?",
      output: '{"tool":"jira_shipped_last_sprint","params":{}}',
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // TELEGRAM — Complete coverage
  // ══════════════════════════════════════════════════════════════════════
  {
    toolName: "telegram_get_messages",
    icon: "✈️",
    label: "Read Telegram messages",
    category: "telegram",
    enabled: true,
    description:
      "Read recent messages from a specific Telegram contact or group chat.",
    params: [
      {
        name: "contact",
        type: "string",
        required: true,
        description: "Contact name or username",
        example: "Adi",
      },
      { name: "limit", type: "number", required: false, default: "20" },
    ],
    promptExample: {
      userSays: "What did Adi message me?",
      output: '{"tool":"telegram_get_messages","params":{"contact":"Adi"}}',
    },
  },
  {
    toolName: "telegram_send_message",
    icon: "📤",
    label: "Send Telegram message",
    category: "telegram",
    enabled: true,
    description:
      "Send a Telegram message to a contact or group. Use {{ticketKey}} to reference a Jira ticket.",
    params: [
      {
        name: "contact",
        type: "string",
        required: true,
        description: "Contact name or username",
        example: "Adi",
      },
      {
        name: "message",
        type: "string",
        required: true,
        description: "Message to send",
        example: "Hey, ticket {{ticketKey}} is ready for review",
      },
    ],
    promptExample: {
      userSays: "Send Adi a message on Telegram",
      output:
        '{"tool":"telegram_send_message","params":{"contact":"Adi","message":"Hey!"}}',
    },
  },
  {
    toolName: "telegram_get_unread",
    icon: "🔔",
    label: "Telegram unread",
    category: "telegram",
    enabled: true,
    description: "Get all unread Telegram messages across all chats.",
    params: [{ name: "limit", type: "number", required: false, default: "20" }],
    promptExample: {
      userSays: "Any unread Telegram messages?",
      output: '{"tool":"telegram_get_unread","params":{}}',
    },
  },
  {
    toolName: "telegram_list_chats",
    icon: "📋",
    label: "List Telegram chats",
    category: "telegram",
    enabled: true,
    description: "List all Telegram chats including groups and channels.",
    params: [],
    promptExample: {
      userSays: "Show my Telegram chats",
      output: '{"tool":"telegram_list_chats","params":{}}',
    },
  },
  {
    toolName: "telegram_search_messages",
    icon: "🔍",
    label: "Search Telegram",
    category: "telegram",
    enabled: true,
    description:
      "Search for messages containing a keyword across all Telegram chats.",
    params: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Keyword to search",
        example: "invoice",
      },
      {
        name: "contact",
        type: "string",
        required: false,
        description: "Limit to a specific contact",
      },
    ],
    promptExample: {
      userSays: "Search Telegram for 'meeting tomorrow'",
      output:
        '{"tool":"telegram_search_messages","params":{"query":"meeting tomorrow"}}',
    },
  },
  {
    toolName: "telegram_reply_message",
    icon: "↩️",
    label: "Reply on Telegram",
    category: "telegram",
    enabled: true,
    description:
      "Reply to the latest message from a specific Telegram contact.",
    params: [
      { name: "contact", type: "string", required: true, example: "Adi" },
      {
        name: "message",
        type: "string",
        required: true,
        example: "Sure, will do!",
      },
    ],
    promptExample: {
      userSays: "Reply to Adi on Telegram: on my way",
      output:
        '{"tool":"telegram_reply_message","params":{"contact":"Adi","message":"On my way!"}}',
    },
  },
  {
    toolName: "telegram_get_contact_info",
    icon: "👤",
    label: "Telegram contact info",
    category: "telegram",
    enabled: true,
    description: "Get profile information about a Telegram contact.",
    params: [
      { name: "contact", type: "string", required: true, example: "Adi" },
    ],
    promptExample: {
      userSays: "Who is Adi on Telegram?",
      output: '{"tool":"telegram_get_contact_info","params":{"contact":"Adi"}}',
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // SLACK — Complete coverage
  // ══════════════════════════════════════════════════════════════════════
  {
    toolName: "slack_send_message",
    icon: "💬",
    label: "Send Slack message",
    category: "slack",
    enabled: true,
    description:
      "Send a message to a Slack channel or person via DM. Use channel name for channels (general, engineering) or person's first name for DMs.",
    params: [
      {
        name: "channel",
        type: "string",
        required: true,
        description: "Channel name or person's first name",
        example: "general",
      },
      {
        name: "message",
        type: "string",
        required: true,
        description:
          "Message to send. Use {{ticketKey}} for Jira ticket references.",
        example: "Hey team, ENGG-123 is ready for review",
      },
    ],
    promptExample: {
      userSays: "Post in Slack general: sprint review at 4pm",
      output:
        '{"tool":"slack_send_message","params":{"channel":"general","message":"Sprint review at 4pm"}}',
    },
  },
  {
    toolName: "slack_read_messages",
    icon: "📖",
    label: "Read Slack messages",
    category: "slack",
    enabled: true,
    description:
      "Read recent messages from a Slack channel or DM conversation.",
    params: [
      {
        name: "channel",
        type: "string",
        required: true,
        description: "Channel name or person's name",
        example: "engineering",
      },
      { name: "limit", type: "number", required: false, default: "20" },
    ],
    promptExample: {
      userSays: "What's happening in the engineering Slack channel?",
      output:
        '{"tool":"slack_read_messages","params":{"channel":"engineering","limit":20}}',
    },
  },
  {
    toolName: "slack_get_unread",
    icon: "🔔",
    label: "Slack unread",
    category: "slack",
    enabled: true,
    description: "Get all unread Slack messages across all channels and DMs.",
    params: [],
    promptExample: {
      userSays: "What did I miss on Slack?",
      output: '{"tool":"slack_get_unread","params":{}}',
    },
  },
  {
    toolName: "slack_list_channels",
    icon: "📋",
    label: "List Slack channels",
    category: "slack",
    enabled: true,
    description: "List all Slack channels and DMs the user is a member of.",
    params: [],
    promptExample: {
      userSays: "Show my Slack channels",
      output: '{"tool":"slack_list_channels","params":{}}',
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // GMAIL — Complete coverage
  // ══════════════════════════════════════════════════════════════════════
  {
    toolName: "gmail_get_inbox",
    icon: "📬",
    label: "Gmail inbox",
    category: "gmail",
    enabled: true,
    description: "Get emails from Gmail inbox. Can filter to unread only.",
    params: [
      { name: "maxResults", type: "number", required: false, default: "10" },
      {
        name: "unreadOnly",
        type: "boolean",
        required: false,
        default: "false",
        description: "Set true to show only unread emails",
      },
    ],
    promptExample: {
      userSays: "Show my unread emails",
      output: '{"tool":"gmail_get_inbox","params":{"unreadOnly":true}}',
    },
  },
  {
    toolName: "gmail_search_emails",
    icon: "🔍",
    label: "Search Gmail",
    category: "gmail",
    enabled: true,
    description:
      "Search Gmail emails by sender, subject, keyword or any Gmail search query.",
    params: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Gmail search query",
        example: "from:boss@company.com subject:invoice",
      },
      { name: "maxResults", type: "number", required: false, default: "10" },
    ],
    promptExample: {
      userSays: "Find emails from Rahul about the invoice",
      output:
        '{"tool":"gmail_search_emails","params":{"query":"from:rahul invoice"}}',
    },
  },
  {
    toolName: "gmail_get_email",
    icon: "📧",
    label: "Open email",
    category: "gmail",
    enabled: true,
    description:
      "Open and read the full content of a specific email by subject or sender.",
    params: [
      {
        name: "subject",
        type: "string",
        required: false,
        example: "Q4 Report",
      },
      {
        name: "from",
        type: "string",
        required: false,
        example: "boss@company.com",
      },
    ],
    promptExample: {
      userSays: "Read the email about Q4 report",
      output: '{"tool":"gmail_get_email","params":{"subject":"Q4 Report"}}',
    },
  },
  {
    toolName: "gmail_send_email",
    icon: "📤",
    label: "Send email",
    category: "gmail",
    enabled: true,
    description: "Send a new email via Gmail to any recipient.",
    params: [
      {
        name: "to",
        type: "string",
        required: true,
        description: "Recipient email",
        example: "client@company.com",
      },
      {
        name: "subject",
        type: "string",
        required: true,
        example: "Meeting tomorrow at 3pm",
      },
      {
        name: "body",
        type: "string",
        required: true,
        example: "Hi, just wanted to confirm our meeting...",
      },
    ],
    promptExample: {
      userSays: "Email Rahul about the delay",
      output:
        '{"tool":"gmail_send_email","params":{"to":"rahul@company.com","subject":"Update","body":"Hi Rahul..."}}',
    },
  },
  {
    toolName: "gmail_reply_email",
    icon: "↩️",
    label: "Reply to email",
    category: "gmail",
    enabled: true,
    description:
      "Reply to an email. Call gmail_get_email first to get the email context.",
    params: [
      {
        name: "replyText",
        type: "string",
        required: true,
        description: "The reply message body",
      },
    ],
    promptExample: {
      userSays: "Reply to the Q4 report email saying I'll review it today",
      output:
        '{"tool":"gmail_reply_email","params":{"replyText":"I will review it today and share feedback."}}',
    },
  },
  {
    toolName: "gmail_summarize_thread",
    icon: "📝",
    label: "Summarize email thread",
    category: "gmail",
    enabled: true,
    description:
      "Summarize an email thread. Call gmail_get_email first to open the thread.",
    params: [],
    promptExample: {
      userSays: "Summarize the invoice email thread",
      output: '{"tool":"gmail_summarize_thread","params":{}}',
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // GOOGLE CALENDAR — Complete coverage
  // ══════════════════════════════════════════════════════════════════════
  {
    toolName: "calendar_get_today",
    icon: "📅",
    label: "Today's schedule",
    category: "calendar",
    enabled: true,
    description: "Get all calendar events scheduled for today.",
    params: [],
    promptExample: {
      userSays: "What's on my calendar today?",
      output: '{"tool":"calendar_get_today","params":{}}',
    },
  },
  {
    toolName: "calendar_get_week",
    icon: "🗓️",
    label: "This week's schedule",
    category: "calendar",
    enabled: true,
    description: "Get all calendar events for the current week.",
    params: [],
    promptExample: {
      userSays: "What meetings do I have this week?",
      output: '{"tool":"calendar_get_week","params":{}}',
    },
  },
  {
    toolName: "calendar_get_events",
    icon: "🔍",
    label: "Search calendar events",
    category: "calendar",
    enabled: true,
    description:
      "Get calendar events for a specific date, date range, or search by topic. For a specific date use dateFrom and dateTo (YYYY-MM-DD). For topic search use query.",
    params: [
      {
        name: "dateFrom",
        type: "string",
        required: false,
        description: "Start date YYYY-MM-DD. For single day, same as dateTo.",
        example: "2026-03-23",
      },
      {
        name: "dateTo",
        type: "string",
        required: false,
        description: "End date YYYY-MM-DD.",
        example: "2026-03-23",
      },
      {
        name: "query",
        type: "string",
        required: false,
        description: "Topic search — only when no date given.",
        example: "standup",
      },
    ],
    promptExample: {
      userSays: "Show my schedule for March 25",
      output:
        '{"tool":"calendar_get_events","params":{"dateFrom":"2026-03-25","dateTo":"2026-03-25"}}',
    },
  },
  {
    toolName: "calendar_create",
    icon: "➕",
    label: "Create calendar event",
    category: "calendar",
    enabled: true,
    description:
      "Create a new calendar event or meeting with attendees and Google Meet link.",
    params: [
      {
        name: "title",
        type: "string",
        required: true,
        example: "Sprint Review",
      },
      {
        name: "startDateTime",
        type: "string",
        required: true,
        description: "ISO8601 format",
        example: "2026-03-25T14:00:00+05:30",
      },
      {
        name: "durationMinutes",
        type: "number",
        required: false,
        default: "30",
      },
      {
        name: "attendees",
        type: "array",
        required: false,
        description: "Email addresses",
        example: '["hari@company.com"]',
      },
      {
        name: "addMeet",
        type: "boolean",
        required: false,
        default: "false",
        description: "Add Google Meet link",
      },
      { name: "description", type: "string", required: false },
    ],
    promptExample: {
      userSays: "Schedule a sprint review tomorrow at 2pm",
      output:
        '{"tool":"calendar_create","params":{"title":"Sprint Review","startDateTime":"2026-03-23T14:00:00+05:30","durationMinutes":60,"addMeet":true}}',
    },
  },
  {
    toolName: "calendar_update",
    icon: "✏️",
    label: "Update calendar event",
    category: "calendar",
    enabled: true,
    description: "Reschedule or update an existing calendar event.",
    params: [
      { name: "title", type: "string", required: true, example: "Standup" },
      {
        name: "startDateTime",
        type: "string",
        required: false,
        example: "2026-03-25T10:00:00+05:30",
      },
    ],
    promptExample: {
      userSays: "Move the standup to 10am tomorrow",
      output:
        '{"tool":"calendar_update","params":{"title":"Standup","startDateTime":"2026-03-23T10:00:00+05:30"}}',
    },
  },
  {
    toolName: "calendar_delete",
    icon: "🗑️",
    label: "Delete calendar event",
    category: "calendar",
    enabled: true,
    description: "Delete or cancel a calendar event by its title.",
    params: [
      { name: "title", type: "string", required: true, example: "Standup" },
    ],
    promptExample: {
      userSays: "Cancel today's standup",
      output: '{"tool":"calendar_delete","params":{"title":"Standup"}}',
    },
  },
  {
    toolName: "calendar_get_invites",
    icon: "📬",
    label: "Pending invites",
    category: "calendar",
    enabled: true,
    description: "Get pending calendar invitations that need a response.",
    params: [],
    promptExample: {
      userSays: "Any pending meeting invites?",
      output: '{"tool":"calendar_get_invites","params":{}}',
    },
  },
  {
    toolName: "calendar_respond",
    icon: "✅",
    label: "Respond to invite",
    category: "calendar",
    enabled: true,
    description:
      "Accept, decline, or mark tentative for a calendar invitation.",
    params: [
      { name: "title", type: "string", required: true, example: "Team sync" },
      {
        name: "response",
        type: "string",
        required: true,
        description: "accept, decline, or tentative",
      },
    ],
    promptExample: {
      userSays: "Accept the team sync invite",
      output:
        '{"tool":"calendar_respond","params":{"title":"Team sync","response":"accept"}}',
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // GOOGLE DOCS — Complete coverage
  // ══════════════════════════════════════════════════════════════════════
  {
    toolName: "google_docs_list",
    icon: "📝",
    label: "List Google Docs",
    category: "google_docs",
    enabled: true,
    description:
      "List recent Google Docs documents from the user's Google Drive.",
    params: [
      {
        name: "limit",
        type: "number",
        required: false,
        default: "12",
        description: "Number of documents to return",
      },
    ],
    promptExample: {
      userSays: "Show my recent Google Docs",
      output: '{"tool":"google_docs_list","params":{"limit":12}}',
    },
  },
  {
    toolName: "google_docs_search",
    icon: "🔍",
    label: "Search Google Docs",
    category: "google_docs",
    enabled: true,
    description:
      "Search Google Docs by title or keyword to find a specific document.",
    params: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Search keyword or document title",
        example: "meeting notes",
      },
    ],
    promptExample: {
      userSays: "Find my doc about project roadmap",
      output:
        '{"tool":"google_docs_search","params":{"query":"project roadmap"}}',
    },
  },
  {
    toolName: "google_docs_get",
    icon: "📄",
    label: "Open Google Doc",
    category: "google_docs",
    enabled: true,
    description:
      "Open and read the content of a specific Google Doc by its document ID.",
    params: [
      {
        name: "documentId",
        type: "string",
        required: true,
        description: "Google Docs document ID",
        example: "1abc2def3ghi4jkl",
      },
    ],
    promptExample: {
      userSays: "Open the meeting notes doc",
      output:
        '{"tool":"google_docs_get","params":{"documentId":"1abc2def3ghi4jkl"}}',
    },
  },
  {
    toolName: "google_docs_create",
    icon: "➕",
    label: "Create Google Doc",
    category: "google_docs",
    enabled: true,
    description: "Create a new blank Google Doc with a specified title.",
    params: [
      {
        name: "title",
        type: "string",
        required: true,
        description: "Title for the new document",
        example: "Sprint Planning Notes",
      },
    ],
    promptExample: {
      userSays: "Create a new Google Doc called Sprint Planning Notes",
      output:
        '{"tool":"google_docs_create","params":{"title":"Sprint Planning Notes"}}',
    },
  },
  {
    toolName: "google_docs_update",
    icon: "✏️",
    label: "Update Google Doc",
    category: "google_docs",
    enabled: true,
    description:
      "Update the title or content of an existing Google Doc. Can use the doc from a previous google_docs_create or google_docs_get step.",
    params: [
      {
        name: "documentId",
        type: "string",
        required: false,
        description:
          "Document ID. Uses last opened/created doc if not specified.",
      },
      {
        name: "title",
        type: "string",
        required: false,
        description: "New title for the document",
      },
      {
        name: "content",
        type: "string",
        required: false,
        description: "HTML content to set in the document",
        example: "<p>Updated project notes here</p>",
      },
    ],
    promptExample: {
      userSays: "Update the doc title to Final Report",
      output:
        '{"tool":"google_docs_update","params":{"title":"Final Report"}}',
    },
  },
  {
    toolName: "google_docs_share",
    icon: "🔗",
    label: "Share Google Doc",
    category: "google_docs",
    enabled: true,
    description:
      "Share a Google Doc with someone by email. Can set role as writer, reader, or commenter.",
    params: [
      {
        name: "documentId",
        type: "string",
        required: false,
        description:
          "Document ID. Uses last opened/created doc if not specified.",
      },
      {
        name: "email",
        type: "string",
        required: true,
        description: "Email address to share with",
        example: "hari@company.com",
      },
      {
        name: "role",
        type: "string",
        required: false,
        default: "writer",
        description: "Permission role: writer, reader, or commenter",
      },
    ],
    promptExample: {
      userSays: "Share the doc with hari@company.com",
      output:
        '{"tool":"google_docs_share","params":{"email":"hari@company.com","role":"writer"}}',
    },
  },
  {
    toolName: "google_docs_delete",
    icon: "🗑️",
    label: "Delete Google Doc",
    category: "google_docs",
    enabled: true,
    description:
      "Move a Google Doc to trash. Can use the doc from a previous step.",
    params: [
      {
        name: "documentId",
        type: "string",
        required: false,
        description:
          "Document ID. Uses last opened/created doc if not specified.",
      },
    ],
    promptExample: {
      userSays: "Delete the old meeting notes doc",
      output:
        '{"tool":"google_docs_delete","params":{"documentId":"1abc2def3ghi4jkl"}}',
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // GOOGLE SHEETS — Complete coverage
  // ══════════════════════════════════════════════════════════════════════
  {
    toolName: "google_sheets_list",
    icon: "📊",
    label: "List Google Sheets",
    category: "google_sheets",
    enabled: true,
    description:
      "List recent Google Sheets spreadsheets from the user's Google Drive.",
    params: [
      {
        name: "limit",
        type: "number",
        required: false,
        default: "14",
        description: "Number of spreadsheets to return",
      },
    ],
    promptExample: {
      userSays: "Show my recent Google Sheets",
      output: '{"tool":"google_sheets_list","params":{"limit":14}}',
    },
  },
  {
    toolName: "google_sheets_search",
    icon: "🔍",
    label: "Search Google Sheets",
    category: "google_sheets",
    enabled: true,
    description:
      "Search Google Sheets by title or keyword to find a specific spreadsheet.",
    params: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Search keyword or spreadsheet title",
        example: "sales report",
      },
    ],
    promptExample: {
      userSays: "Find my spreadsheet about sales report",
      output:
        '{"tool":"google_sheets_search","params":{"query":"sales report"}}',
    },
  },
  {
    toolName: "google_sheets_get",
    icon: "📋",
    label: "Open Google Sheet",
    category: "google_sheets",
    enabled: true,
    description:
      "Open and read the content of a specific Google Sheet by its spreadsheet ID.",
    params: [
      {
        name: "spreadsheetId",
        type: "string",
        required: true,
        description: "Google Sheets spreadsheet ID",
        example: "1abc2def3ghi4jkl",
      },
    ],
    promptExample: {
      userSays: "Open the sales report sheet",
      output:
        '{"tool":"google_sheets_get","params":{"spreadsheetId":"1abc2def3ghi4jkl"}}',
    },
  },
  {
    toolName: "google_sheets_create",
    icon: "➕",
    label: "Create Google Sheet",
    category: "google_sheets",
    enabled: true,
    description: "Create a new blank Google Sheet with a specified title.",
    params: [
      {
        name: "title",
        type: "string",
        required: true,
        description: "Title for the new spreadsheet",
        example: "Q4 Budget Tracker",
      },
    ],
    promptExample: {
      userSays: "Create a new Google Sheet called Q4 Budget Tracker",
      output:
        '{"tool":"google_sheets_create","params":{"title":"Q4 Budget Tracker"}}',
    },
  },
  {
    toolName: "google_sheets_rename",
    icon: "✏️",
    label: "Rename Google Sheet",
    category: "google_sheets",
    enabled: true,
    description: "Rename an existing Google Sheet.",
    params: [
      {
        name: "spreadsheetId",
        type: "string",
        required: false,
        description:
          "Spreadsheet ID. Uses last opened/created sheet if not specified.",
      },
      {
        name: "title",
        type: "string",
        required: true,
        description: "New title for the spreadsheet",
        example: "Final Budget Report",
      },
    ],
    promptExample: {
      userSays: "Rename the sheet to Final Budget Report",
      output:
        '{"tool":"google_sheets_rename","params":{"title":"Final Budget Report"}}',
    },
  },
  {
    toolName: "google_sheets_share",
    icon: "🔗",
    label: "Share Google Sheet",
    category: "google_sheets",
    enabled: true,
    description:
      "Share a Google Sheet with someone by email. Can set role as writer, reader, or commenter.",
    params: [
      {
        name: "spreadsheetId",
        type: "string",
        required: false,
        description:
          "Spreadsheet ID. Uses last opened/created sheet if not specified.",
      },
      {
        name: "email",
        type: "string",
        required: true,
        description: "Email address to share with",
        example: "hari@company.com",
      },
      {
        name: "role",
        type: "string",
        required: false,
        default: "writer",
        description: "Permission role: writer, reader, or commenter",
      },
    ],
    promptExample: {
      userSays: "Share the sheet with hari@company.com",
      output:
        '{"tool":"google_sheets_share","params":{"email":"hari@company.com","role":"writer"}}',
    },
  },
  {
    toolName: "google_sheets_delete",
    icon: "🗑️",
    label: "Delete Google Sheet",
    category: "google_sheets",
    enabled: true,
    description:
      "Move a Google Sheet to trash. Can use the sheet from a previous step.",
    params: [
      {
        name: "spreadsheetId",
        type: "string",
        required: false,
        description:
          "Spreadsheet ID. Uses last opened/created sheet if not specified.",
      },
    ],
    promptExample: {
      userSays: "Delete the old budget sheet",
      output:
        '{"tool":"google_sheets_delete","params":{"spreadsheetId":"1abc2def3ghi4jkl"}}',
    },
  },
  {
    toolName: "google_sheets_duplicate",
    icon: "📑",
    label: "Duplicate Google Sheet",
    category: "google_sheets",
    enabled: true,
    description:
      "Create a copy of an existing Google Sheet. Can specify a new title.",
    params: [
      {
        name: "spreadsheetId",
        type: "string",
        required: false,
        description:
          "Spreadsheet ID. Uses last opened/created sheet if not specified.",
      },
      {
        name: "title",
        type: "string",
        required: false,
        description: "Title for the duplicated spreadsheet",
        example: "Copy of Budget Tracker",
      },
    ],
    promptExample: {
      userSays: "Duplicate the sales report sheet",
      output:
        '{"tool":"google_sheets_duplicate","params":{"title":"Copy of Sales Report"}}',
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // WHATSAPP — Complete coverage
  // ══════════════════════════════════════════════════════════════════════
  {
    toolName: "whatsapp_send_message",
    icon: "💬",
    label: "Send WhatsApp",
    category: "whatsapp",
    enabled: true,
    description:
      "Send a WhatsApp message to a contact by name or phone number.",
    params: [
      {
        name: "to",
        type: "string",
        required: true,
        description: "Contact name or phone number",
        example: "Rahul",
      },
      {
        name: "message",
        type: "string",
        required: true,
        description: "Message to send",
        example: "Meeting at 3pm",
      },
    ],
    promptExample: {
      userSays: "WhatsApp Rahul about the invoice",
      output:
        '{"tool":"whatsapp_send_message","params":{"to":"Rahul","message":"Your invoice is ready"}}',
    },
  },
  {
    toolName: "whatsapp_get_messages",
    icon: "📖",
    label: "Read WhatsApp messages",
    category: "whatsapp",
    enabled: true,
    description: "Read recent messages from a WhatsApp contact or group.",
    params: [
      { name: "contact", type: "string", required: true, example: "Rahul" },
      { name: "limit", type: "number", required: false, default: "20" },
    ],
    promptExample: {
      userSays: "What did Rahul say on WhatsApp?",
      output: '{"tool":"whatsapp_get_messages","params":{"contact":"Rahul"}}',
    },
  },
  {
    toolName: "whatsapp_get_unread",
    icon: "🔔",
    label: "WhatsApp unread",
    category: "whatsapp",
    enabled: true,
    description: "Get all unread WhatsApp messages across all chats.",
    params: [],
    promptExample: {
      userSays: "Any unread WhatsApp messages?",
      output: '{"tool":"whatsapp_get_unread","params":{}}',
    },
  },
  {
    toolName: "whatsapp_list_chats",
    icon: "📋",
    label: "WhatsApp chats",
    category: "whatsapp",
    enabled: true,
    description: "List all WhatsApp chats and conversations.",
    params: [],
    promptExample: {
      userSays: "Show my WhatsApp chats",
      output: '{"tool":"whatsapp_list_chats","params":{}}',
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // DOCUMENT DELIVERY — Complete coverage
  // ══════════════════════════════════════════════════════════════════════
  {
    toolName: "fetch_document",
    icon: "🔍",
    label: "Fetch document",
    category: "document",
    enabled: true,
    description:
      "Fetch a business document artifact from OrionAI collections for delivery workflows like sharing, emailing, or generating a PDF. Do not use this for generic reporting or connected-database lookups.",
    params: [
      {
        name: "collection",
        type: "string",
        required: true,
        description:
          "Invoices, Bills, PurchaseOrders, CreditNotes, DebitNotes, PaymentRequests, ProofOfDeliveries",
        example: "Invoices",
      },
      {
        name: "identifier",
        type: "string",
        required: false,
        description: "Document number e.g. INV-001. Leave empty for latest.",
      },
      {
        name: "fallbackToLatest",
        type: "boolean",
        required: false,
        default: "false",
      },
    ],
    promptExample: {
      userSays: "Send the latest invoice",
      output:
        '{"tool":"fetch_document","params":{"collection":"Invoices","fallbackToLatest":true}}',
    },
  },
  {
    toolName: "generate_pdf",
    icon: "📄",
    label: "Generate PDF",
    category: "document",
    enabled: true,
    description:
      "Generate a PDF from the previously fetched document. Must call fetch_document before this.",
    params: [],
    promptExample: {
      userSays: "Generate PDF for invoice INV-001",
      output: '{"tool":"generate_pdf","params":{}}',
    },
  },
  {
    toolName: "send_email",
    icon: "📧",
    label: "Send email with PDF",
    category: "document",
    enabled: true,
    description:
      "Send an email with optional PDF attachment from a previous generate_pdf step.",
    params: [
      {
        name: "to",
        type: "string",
        required: true,
        description: "Recipient email",
        example: "client@company.com",
      },
      { name: "subject", type: "string", required: false },
    ],
    promptExample: {
      userSays: "Send the invoice to client@company.com",
      output: '{"tool":"send_email","params":{"to":"client@company.com"}}',
    },
  },
  {
    toolName: "send_whatsapp",
    icon: "📱",
    label: "Send WhatsApp (document)",
    category: "document",
    enabled: true,
    description:
      "Send a WhatsApp message with document info to a phone number.",
    params: [
      {
        name: "to",
        type: "string",
        required: true,
        description: "Phone number with country code",
        example: "+919999999999",
      },
      { name: "message", type: "string", required: false },
    ],
    promptExample: {
      userSays: "WhatsApp the invoice to +919999999999",
      output: '{"tool":"send_whatsapp","params":{"to":"+919999999999"}}',
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // CROSS-APP POWER COMBOS — multi-step shortcuts
  // ══════════════════════════════════════════════════════════════════════
  {
    toolName: "notify_internal",
    icon: "📢",
    label: "Internal notification",
    category: "notifications",
    enabled: true,
    description:
      "Send a notification to an internal team member via their preferred channel (Slack, Telegram, or Email).",
    params: [
      {
        name: "person",
        type: "string",
        required: true,
        description: "Person's name",
        example: "Hari",
      },
      {
        name: "message",
        type: "string",
        required: true,
        example: "Your PR is ready for review",
      },
      {
        name: "channel",
        type: "string",
        required: false,
        description:
          "slack, telegram, or email. Auto-detects if not specified.",
      },
    ],
    promptExample: {
      userSays: "Notify Hari that his ticket is ready",
      output:
        '{"tool":"notify_internal","params":{"person":"Hari","message":"Your ticket is ready for review"}}',
    },
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB\n");

  let created = 0,
    updated = 0;

  for (const skill of ALL_SKILLS) {
    const existing = await Skill.findOne({ toolName: skill.toolName });
    if (existing) {
      await Skill.findOneAndUpdate(
        { toolName: skill.toolName },
        { $set: skill }
      );
      updated++;
      console.log(`🔄 Updated: ${skill.toolName}`);
    } else {
      await Skill.create(skill);
      created++;
      console.log(`✅ Created: ${skill.toolName}`);
    }
  }

  console.log(`\n🎉 Done! ${created} created, ${updated} updated.`);
  console.log(`📊 Total skills in DB: ${ALL_SKILLS.length}`);
  console.log(`\n💡 Your agent can now handle:`);
  console.log(`   - All Jira operations (13 tools)`);
  console.log(`   - All Telegram operations (7 tools)`);
  console.log(`   - All Slack operations (4 tools)`);
  console.log(`   - All Gmail operations (6 tools)`);
  console.log(`   - All Calendar operations (8 tools)`);
  console.log(`   - All Google Docs operations (7 tools)`);
  console.log(`   - All Google Sheets operations (8 tools)`);
  console.log(`   - All WhatsApp operations (4 tools)`);
  console.log(`   - Document delivery (4 tools)`);
  console.log(`   - Cross-app notifications (1 tool)`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
