/**
 * rendererRegistry.js
 * 📁 Place in: frontend/src/components/agent/rendererRegistry.js
 *    (same folder as AgentBubble.vue)
 *
 * Resolves the right renderer component for a set of agent steps.
 * Matches by EITHER tool name OR rich data fields on the step.
 */

import GmailRenderer from "./renderers/GmailRenderer.vue";
import JiraRenderer from "./renderers/JiraRenderer.vue";
import CalendarRenderer from "./renderers/CalendarRenderer.vue";
import TelegramRenderer from "./renderers/TelegramRenderer.vue";
import SlackRenderer from "./renderers/SlackRenderer.vue";

export const TOOL_RENDERERS = [
  {
    name: "slack",
    tools: ["slack_read_messages", "slack_send_message", "slack_get_unread", "slack_list_channels"],
    richFields: ["richSlackMessages", "richSlackUnread", "richSlackChannels", "slackSent"],
    component: SlackRenderer,
  },
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
    richFields: ["richEmails"],
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
      "jira_assign_ticket",
      "jira_add_comment",
      "jira_search",
      "jira_notify_overdue",
      "jira_link_ticket",
      "jira_shipped_last_sprint",
      "jira_most_overdue",
      "jira_sprint_bugs",
    ],
    // DB custom skills return these even if their toolName isn't above
    richFields: ["richTickets", "byAssignee", "notifications"],
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
      "calendar_delete",
      "calendar_get_invites",
      "calendar_respond",
    ],
    richFields: ["richEvents", "calendarByDay"],
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
    richFields: ["richTelegramMessages", "telegramUnreadChats", "telegramChats", "telegramSent"],
    component: TelegramRenderer,
  },
];

function stepMatchesEntry(step, entry) {
  if (entry.tools.includes(step.tool)) return true;
  if (entry.richFields?.some((f) => step[f] != null)) return true;
  return false;
}

/**
 * Resolve the best renderer for a set of steps.
 * Single integration → its renderer
 * Multi-integration  → null (AgentBubble shows combined list)
 */
export function resolveRenderer(steps = []) {
  if (!steps.length) return null;

  const done = steps.filter((s) => s.status === "done" || s.status === "error");
  const checkSteps = done.length ? done : steps;

  const matched = TOOL_RENDERERS.filter((entry) =>
    checkSteps.some((s) => stepMatchesEntry(s, entry))
  );

  if (matched.length === 1) return matched[0].component;
  return null;
}

export function resolveRendererByName(name) {
  return TOOL_RENDERERS.find((e) => e.name === name)?.component || null;
}
