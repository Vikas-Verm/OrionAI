"use strict";

const { getMorningBriefing } = require("../services/briefingService");
const {
  getHomeDashboard,
  recordPriorityFeedAction,
} = require("../services/priorityFeedService");
const { chatCompleteNoSystem } = require("../services/llmService");

function normalizeReplyText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildRecentMessageTranscript(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .map((message) => ({
      direction: String(message?.direction || "").trim().toLowerCase(),
      text: normalizeReplyText(message?.text || ""),
    }))
    .filter((message) => message.text)
    .slice(-4)
    .map((message) => `${message.direction === "outbound" ? "You" : "Them"}: ${message.text}`)
    .join("\n");
}

function getLatestInboundPreview(item = {}) {
  const burst = Array.isArray(item?.meta?.latestInboundBurst)
    ? item.meta.latestInboundBurst
    : [];
  const latestInbound = burst[burst.length - 1];
  return normalizeReplyText(
    latestInbound?.text || item.meta?.previewText || item.previewText || ""
  );
}

function buildFallbackReplyPrompt(item = {}) {
  const sourceLabel = normalizeReplyText(item.sourceLabel || item.sourceApp || "conversation");
  const title = normalizeReplyText(item.title || item.conversationTitle || "Conversation");
  const participantLabel = normalizeReplyText(
    item.meta?.participantLabel || item.participantLabel || ""
  );
  const previewText = getLatestInboundPreview(item);
  const recentTranscript = buildRecentMessageTranscript(item.meta?.recentMessages || []);
  const actionState = String(item.actionState || "").trim().toLowerCase();
  const approvalHint =
    actionState === "needs_approval"
      ? "This specifically needs an approval or sign-off reply from me."
      : "";
  const guidance =
    sourceLabel.toLowerCase() === "gmail" || item.sourceApp === "gmail"
      ? "Keep it professional and email-ready without adding a subject line."
      : "Keep it natural, concise, and ready to send as a chat reply.";

  return [
    `Write the exact reply text I should send next in this ${sourceLabel} conversation.`,
    title ? `Conversation: "${title}".` : "",
    participantLabel && participantLabel !== title
      ? `Other participant: ${participantLabel}.`
      : "",
    previewText ? `Latest message: "${previewText}".` : "",
    approvalHint,
    recentTranscript ? `Recent context:\n${recentTranscript}` : "",
    "",
    guidance,
    "Return ONLY the reply text.",
    "Do NOT explain the ask, add commentary, or call any tools.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function getBriefing(req, res) {
  try {
    const userId = req.user?.username;
    const briefing = await getMorningBriefing(userId);
    res.json(briefing);
  } catch (err) {
    console.error("Briefing error:", err.message);
    res.status(500).json({ error: "Could not load briefing" });
  }
}

async function getHome(req, res) {
  try {
    const userId = req.user?.username;
    const dashboard = await getHomeDashboard(userId);
    res.json(dashboard);
  } catch (err) {
    console.error("Home briefing error:", err.message);
    res.status(500).json({ error: "Could not load home dashboard" });
  }
}

async function postPriorityFeedAction(req, res) {
  try {
    const userId = req.user?.username;
    const entry = await recordPriorityFeedAction(userId, req.body || {});
    res.json({ success: true, entry });
  } catch (err) {
    console.error("Priority feed action error:", err.message);
    res.status(400).json({ error: err.message || "Could not record action" });
  }
}

async function postPriorityFeedDraftReply(req, res) {
  const item = req.body?.item || {};
  const providedPrompt = normalizeReplyText(item?.action?.prompt || req.body?.prompt || "");
  const prompt = providedPrompt || buildFallbackReplyPrompt(item);

  if (!prompt) {
    return res.status(400).json({ error: "Draft prompt is required" });
  }

  try {
    const suggested = await chatCompleteNoSystem(prompt, 300, 0.35);
    res.json({ success: true, suggested: String(suggested || "").trim() });
  } catch (err) {
    console.error("Priority feed draft reply error:", err.message);
    res.status(500).json({ error: "Could not draft reply" });
  }
}

module.exports = {
  getBriefing,
  getHome,
  postPriorityFeedAction,
  postPriorityFeedDraftReply,
};
