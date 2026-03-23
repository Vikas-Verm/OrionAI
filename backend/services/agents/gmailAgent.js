/**
 * gmailAgent.js
 *
 * Sub-agent for all Gmail operations.
 */

const BaseAgent = require("./baseAgent");
const {
  toolGmailGetInbox,
  toolGmailSearchEmails,
  toolGmailGetEmail,
  toolGmailSummarizeThread,
  toolGmailSendEmail,
  toolGmailReplyEmail,
} = require("../tools/toolGmail");

const TOOLS = [
  "gmail_get_inbox",
  "gmail_search_emails",
  "gmail_get_email",
  "gmail_summarize_thread",
  "gmail_send_email",
  "gmail_reply_email",
];

class GmailAgent extends BaseAgent {
  constructor() {
    super("gmail", TOOLS);
  }

  async execute(tool, params, ctx) {
    switch (tool) {
      case "gmail_get_inbox":
        return toolGmailGetInbox(params, ctx);

      case "gmail_search_emails":
        return toolGmailSearchEmails(params, ctx);

      case "gmail_get_email": {
        const result = await toolGmailGetEmail(params, ctx);
        ctx.lastEmail = result; // persisted for downstream summarize / reply
        return result;
      }

      case "gmail_summarize_thread":
        return toolGmailSummarizeThread(params, ctx);

      case "gmail_send_email":
        return toolGmailSendEmail(params, ctx);

      case "gmail_reply_email":
        return toolGmailReplyEmail(params, ctx);

      default:
        throw new Error(`GmailAgent: unknown tool "${tool}"`);
    }
  }
}

module.exports = new GmailAgent();
