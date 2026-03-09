/**
 * toolSendSlack — sends a message to a Slack channel via webhook
 * Pulled from user's Integration settings, or params.webhookUrl override
 *
 * params:
 *   channel      — display name only (e.g. "#finance") — informational
 *   message      — custom message text (optional, auto-built from doc if omitted)
 *   webhookUrl   — override URL (optional, falls back to saved integration)
 *
 * ctx:
 *   fetchResult  — { doc, collection, docNum } from fetch_document
 *   userId       — passed through runAgent context
 */

const axios = require("axios");
const Integration = require("../../models/Integration");

async function toolSendSlack(params, ctx) {
  const { channel = "", message, webhookUrl: overrideUrl } = params;

  // 1. Get webhook URL — from params override or saved integration
  let webhookUrl = overrideUrl;
  if (!webhookUrl && ctx.userId) {
    const integration = await Integration.findOne({
      userId: ctx.userId,
      type: "slack",
      enabled: true,
    });
    if (integration?.slack?.webhookUrl) {
      webhookUrl = integration.slack.webhookUrl;
    }
  }

  if (!webhookUrl) {
    throw new Error(
      "No Slack webhook configured. Go to Settings → Integrations → Slack to set it up."
    );
  }

  // 2. Build message from document context if no custom message
  const { doc, collection, docNum } = ctx.fetchResult || {};
  const typeName = (collection || "Document").replace(/([A-Z])/g, " $1").trim();
  const status = doc?.status || doc?.status_cd || "N/A";
  const amount = doc?.total_amount
    ? `Rs.${Number(doc.total_amount).toLocaleString("en-IN")}`
    : "";

  const text = message || buildSlackMessage(typeName, docNum, status, amount);

  // 3. Build Slack Block Kit payload for rich formatting
  const payload = {
    text, // fallback for notifications
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `🔭 OrionAI Agent`, emoji: true },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Document:*\n${typeName} #${docNum || "N/A"}`,
          },
          { type: "mrkdwn", text: `*Status:*\n${status}` },
          amount ? { type: "mrkdwn", text: `*Amount:*\n${amount}` } : null,
          {
            type: "mrkdwn",
            text: `*Time:*\n${new Date().toLocaleString("en-IN")}`,
          },
        ].filter(Boolean),
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: text },
      },
      {
        type: "divider",
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Sent by *OrionAI Agent* ${channel ? `to ${channel}` : ""}`,
          },
        ],
      },
    ],
  };

  await axios.post(webhookUrl, payload);

  return {
    channel: channel || "configured channel",
    message: text,
  };
}

function buildSlackMessage(typeName, docNum, status, amount) {
  let msg = `📄 *${typeName}${
    docNum ? ` #${docNum}` : ""
  }* has been processed by OrionAI.`;
  if (status && status !== "N/A") msg += `\nStatus: *${status}*`;
  if (amount) msg += `\nAmount: *${amount}*`;
  return msg;
}

module.exports = { toolSendSlack };
