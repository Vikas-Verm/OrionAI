/**
 * jiraAgent.js
 *
 * Sub-agent for all Jira operations.
 * Also handles cross-step context: saves lastCreatedTicketKey so later steps
 * (e.g. slack_send_message) can reference the new ticket.
 */

const BaseAgent = require("../agents/baseAgent");
const {
  toolGetBacklog,
  toolGetOverdueTickets,
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
} = require("../tools/toolJira");
const { toolSendSlack } = require("../tools/toolSlack");
const { toolSendEmail } = require("../tools/toolGmail"); // your existing email helper

const TOOLS = [
  "jira_my_tickets",
  "jira_get_backlog",
  "jira_get_overdue",
  "jira_sprint_summary",
  "jira_create_ticket",
  "jira_move_ticket",
  "jira_assign_ticket",
  "jira_add_comment",
  "jira_shipped_last_sprint",
  "jira_most_overdue",
  "jira_sprint_bugs",
  "jira_search",
  "jira_notify_overdue",
  "jira_link_ticket",
];

class JiraAgent extends BaseAgent {
  constructor() {
    super("jira", TOOLS);
  }

  async execute(tool, params, ctx) {
    // Safety net: resolve placeholder ticket keys from the shared context
    if (
      params.ticketKey &&
      (params.ticketKey === "<TICKET_KEY_FROM_PREVIOUS_STEP>" ||
        params.ticketKey === "")
    ) {
      params.ticketKey = ctx.lastCreatedTicketKey || null;
    }

    let result;
    switch (tool) {
      case "jira_my_tickets":
        result = await toolGetMyTickets(params, ctx);
        break;
      case "jira_get_backlog":
        result = await toolGetBacklog(params, ctx);
        break;
      case "jira_get_overdue":
        result = await toolGetOverdueTickets(params, ctx);
        break;
      case "jira_sprint_summary":
        result = await toolGetSprintSummary(params, ctx);
        break;
      case "jira_move_ticket":
        result = await toolMoveTicket(params, ctx);
        break;
      case "jira_add_comment":
        result = await toolAddComment(params, ctx);
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

      case "jira_create_ticket":
        result = await toolCreateTicket(params, ctx);
        // Persist for downstream steps (slack_send_message, jira_assign_ticket, etc.)
        ctx.lastCreatedTicketKey = result.key;
        ctx.lastCreatedTicketUrl = result.url;
        ctx.lastCreatedTicketTitle = params.summary;
        break;

      case "jira_assign_ticket":
        if (!params.ticketKey && ctx.lastCreatedTicketKey) {
          params.ticketKey = ctx.lastCreatedTicketKey;
        }
        if (!params.ticketKey)
          throw new Error("No ticket key available for assignment.");
        result = await toolAssignTicket(params, ctx);
        break;

      case "jira_link_ticket":
        if (!params.ticketKey) params.ticketKey = ctx.lastCreatedTicketKey;
        if (!params.ticketKey) throw new Error("No ticket key to link.");
        result = await toolLinkTicket(params, ctx);
        break;

      case "jira_notify_overdue":
        result = await toolNotifyOverdue(params, ctx);
        // Side-effects: fan out to Slack + email per person
        for (const n of result.notifications || []) {
          if (n.channels.includes("slack") && n.slackChannel) {
            await toolSendSlack(
              { channel: n.slackChannel, message: n.slackBody },
              ctx
            ).catch((err) =>
              console.warn(
                `Slack notification failed for ${n.person}:`,
                err.message
              )
            );
          }
          if (n.channels.includes("email") && n.emailAddress) {
            await toolSendEmail(
              {
                to: n.emailAddress,
                subject: result.emailSubject,
                body: n.emailBody,
              },
              ctx
            ).catch((err) =>
              console.warn(
                `Email notification failed for ${n.person}:`,
                err.message
              )
            );
          }
        }
        break;

      default:
        throw new Error(`JiraAgent: unknown tool "${tool}"`);
    }

    return result;
  }
}

module.exports = new JiraAgent();
