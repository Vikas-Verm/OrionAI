import GmailRenderer from "./renderers/GmailRenderer.vue";
import JiraRenderer from "./renderers/JiraRenderer.vue";
import CalendarRenderer from "./renderers/CalendarRenderer.vue";
import TelegramRenderer from "./renderers/TelegramRenderer.vue";

export const TOOL_RENDERERS = [
  {
    name: "gmail",
    tools: [
      "gmail_get_inbox",
      "gmail_search_emails",
      "gmail_get_email",
      "gmail_send_email",
      "gmail_reply_email",
      "gmail_summarize_thread",
    ],
    component: GmailRenderer,
  },
  {
    name: "jira",
    tools: [
      "jira_my_tickets",
      "jira_get_backlog",
      "jira_get_overdue",
      "jira_update_ticket",
      "jira_sprint_summary",
      "jira_create_ticket",
    ],
    component: JiraRenderer,
  },
  {
    name: "calendar",
    tools: [
      "calendar_get_today",
      "calendar_get_week",
      "calendar_get_events",
      "calendar_create",
      "calendar_update",
      "calendar_get_invites",
    ],
    component: CalendarRenderer,
  },
  {
    name: "telegram",
    tools: [
      "telegram_get_messages",
      "telegram_get_unread",
      "telegram_list_chats",
      "telegram_send_message",
      "telegram_reply_message",
      "telegram_search_messages",
      "telegram_get_contact_info",
    ],
    component: TelegramRenderer,
  },
];

export function resolveRenderer(steps = []) {
  if (!steps.length) return null;
  for (const entry of TOOL_RENDERERS) {
    if (steps.some((s) => entry.tools.includes(s.tool))) return entry.component;
  }
  return null;
}
