/**
 * telegramAgent.js
 *
 * Sub-agent for all Telegram operations.
 */

const BaseAgent = require("./baseAgent");
const {
  toolTelegramListChats,
  toolTelegramGetMessages,
  toolTelegramSendMessage,
  toolTelegramGetUnread,
  toolTelegramSearchMessages,
  toolTelegramReplyMessage,
  toolTelegramGetContactInfo,
} = require("../tools/toolTelegram");

const TOOLS = [
  "telegram_list_chats",
  "telegram_get_messages",
  "telegram_send_message",
  "telegram_get_unread",
  "telegram_search_messages",
  "telegram_reply_message",
  "telegram_get_contact_info",
];

class TelegramAgent extends BaseAgent {
  constructor() {
    super("telegram", TOOLS);
  }

  async execute(tool, params, ctx) {
    switch (tool) {
      case "telegram_list_chats":
        return toolTelegramListChats(params, ctx);
      case "telegram_get_messages":
        return toolTelegramGetMessages(params, ctx);
      case "telegram_send_message":
        return toolTelegramSendMessage(params, ctx);
      case "telegram_get_unread":
        return toolTelegramGetUnread(params, ctx);
      case "telegram_search_messages":
        return toolTelegramSearchMessages(params, ctx);
      case "telegram_reply_message":
        return toolTelegramReplyMessage(params, ctx);
      case "telegram_get_contact_info":
        return toolTelegramGetContactInfo(params, ctx);
      default:
        throw new Error(`TelegramAgent: unknown tool "${tool}"`);
    }
  }
}

module.exports = new TelegramAgent();
