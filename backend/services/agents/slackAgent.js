/**
 * slackAgent.js
 *
 * Sub-agent for all Slack operations.
 * Wraps toolSlack.js and exposes 4 tool names to the super-agent.
 *
 * Tools:
 *   slack_read_messages  — read channel history
 *   slack_send_message   — send a message to a channel / DM
 *   slack_get_unread     — list all unread channels with counts
 *   slack_list_channels  — list all joined channels
 */

const BaseAgent = require("./baseAgent");
const { toolSlack } = require("../tools/toolSlack");

const TOOLS = [
  "slack_read_messages",
  "slack_send_message",
  "slack_get_unread",
  "slack_list_channels",
];

class SlackAgent extends BaseAgent {
  constructor() {
    super("slack", TOOLS);
  }

  async execute(tool, params, ctx) {
    switch (tool) {
      case "slack_read_messages":
        return toolSlack(
          {
            action: "read",
            channel: params.channel,
            limit: params.limit || 20,
          },
          ctx
        );

      case "slack_send_message":
        return toolSlack(
          { action: "send", channel: params.channel, message: params.message },
          ctx
        );

      case "slack_get_unread":
        return toolSlack({ action: "unread" }, ctx);

      case "slack_list_channels":
        return toolSlack({ action: "list_channels" }, ctx);

      default:
        throw new Error(`SlackAgent: unknown tool "${tool}"`);
    }
  }
}

module.exports = new SlackAgent();
