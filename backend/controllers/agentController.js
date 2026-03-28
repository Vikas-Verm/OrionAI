const mongoose = require("mongoose");
const Conversation = require("../models/conversation");
const { runAgent, loadToolRegistry } = require("../services/agentService");
const { parseAgentIntent } = require("../services/agentPlanner");
const { orchestrate } = require("../services/multiAgentOrchestrator");
const Integration = require("../models/Integration");
const { google } = require("googleapis");
const { normalizeStepParams } = require("../services/agentParamNormalizer");
const {
  resolveConfirmation,
  getPendingConfirmation,
} = require("../services/agentConfirmationStore");
const { captureException } = require("../services/errorMonitoring");

function buildSessionTitle(text = "") {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "New Chat";
  return trimmed.substring(0, 40) + (trimmed.length > 40 ? "..." : "");
}

async function resolveInitialAgentTitle(sessionId, userId, userMessage) {
  if (!sessionId || !userId || !String(userMessage || "").trim()) return null;
  const existing = await Conversation.findOne(
    { sessionId, userId },
    { title: 1, messages: 1 }
  );

  const userMessageCount =
    existing?.messages?.filter((m) => m.role === "user").length || 0;
  const title = existing?.title || "New Chat";

  if (title === "New Chat" && userMessageCount === 0) {
    return buildSessionTitle(userMessage);
  }

  return null;
}

let chatCompleteNoSystem;
try {
  ({ chatCompleteNoSystem } = require("../services/llmService"));
} catch {
  try {
    ({ chatCompleteNoSystem } = require("./llmService"));
  } catch (e) {
    console.warn(
      "llmService not found — gmail suggest-reply will be unavailable:",
      e.message
    );
  }
}

// ── stepSummary ───────────────────────────────────────────────────────────────
function stepSummary(tool, result) {
  switch (tool) {
    case "fetch_document":
      return `Found ${result.collection} #${result.docNum}`;
    case "generate_pdf":
      return `PDF ready — ${result.sizeKB}KB`;
    case "send_email":
      return `Email sent to ${result.to}`;
    case "send_whatsapp":
      return `WhatsApp sent to ${result.to}`;
    case "send_slack":
      return `Slack message sent to ${result.channel}`;
    case "notify_internal":
      return result.message;

    // Jira read
    case "jira_get_backlog":
      return `Fetched ${result.totalOpen} open tickets in ${result.projectKey}`;
    case "jira_get_overdue":
      return result.count
        ? `Found ${result.count} overdue tickets`
        : "No overdue tickets — all on track!";
    case "jira_update_dates":
      return `Updated ${result.updated} ticket due dates`;
    case "jira_my_tickets":
      return `Found ${result.count ?? result.tickets?.length ?? 0} tickets`;
    case "jira_sprint_summary":
      return `Sprint: ${result.done} done, ${result.inProgress} in progress, ${result.overdue} overdue`;
    case "jira_shipped_last_sprint":
      return `${result.total} tickets shipped in ${result.sprintName}`;
    case "jira_most_overdue":
      return result.tickets?.length
        ? `${result.tickets.length} overdue tickets across ${
            result.sorted?.length ?? 0
          } people`
        : "No overdue tickets found";
    case "jira_sprint_bugs":
      return `${result.open} open bugs (${result.critical} critical) in ${result.sprintName}`;
    case "jira_search":
      return `Found ${result.count ?? 0} tickets`;

    // Jira write
    case "jira_create_ticket":
      return `Created ${result.key} — ${result.title}`;
    case "jira_move_ticket":
      return result.success
        ? `Moved ${result.ticketKey} → ${result.newStatus}`
        : `Could not move ticket: ${result.ticketKey}`;
    case "jira_assign_ticket":
      return result.success
        ? `Assigned ${result.ticketKey} to ${result.assignee}`
        : `Could not assign ticket`;
    case "jira_add_comment":
      return result.success
        ? `Comment added to ${result.ticketKey}`
        : `Failed to add comment`;
    case "jira_notify_overdue":
      return `Notified ${result.totalPeople} person${
        result.totalPeople > 1 ? "s" : ""
      } about ${result.totalTickets} overdue tickets`;

    // Calendar
    case "calendar_get_today":
      return result.count
        ? `${result.count} event${result.count !== 1 ? "s" : ""} today`
        : "No events today";
    case "calendar_get_week":
      return result.count
        ? `${result.count} events this week`
        : "No events this week";
    case "calendar_get_events":
      return result.count ? `Found ${result.count} events` : "No events found";
    case "calendar_create":
      return result.title ? `Created "${result.title}"` : "Event created";
    case "calendar_update":
      return result.title ? `Updated "${result.title}"` : "Event updated";
    case "calendar_delete":
      return result.success ? "Event deleted" : "Delete failed";
    case "calendar_get_invites":
      return result.count
        ? `${result.count} pending invite${result.count !== 1 ? "s" : ""}`
        : "No pending invites";
    case "calendar_respond":
      return result.summary || "RSVP sent";

    // Telegram
    case "telegram_list_chats":
      return `${result.total || 0} Telegram chats · ${
        result.unreadCount || 0
      } unread`;
    case "telegram_get_messages":
      return result.ok
        ? `${result.count} messages from ${result.chatName}`
        : `No chat found: "${result.contact}"`;
    case "telegram_send_message":
      return result.ok
        ? `Message sent to ${result.to} on Telegram`
        : `Could not find contact: "${result.contact}"`;
    case "telegram_get_unread":
      return result.totalUnread > 0
        ? `${result.totalUnread} unread across ${result.chatCount} chat${
            result.chatCount !== 1 ? "s" : ""
          }`
        : "No unread Telegram messages";
    case "telegram_search_messages":
      return result.count > 0
        ? `Found ${result.count} messages containing "${result.query}"`
        : `No messages found for "${result.query}"`;
    case "telegram_reply_message":
      return result.ok
        ? `Replied to ${result.to} on Telegram`
        : `Could not find contact: "${result.contact}"`;
    case "telegram_get_contact_info":
      return result.ok
        ? result.summary
        : `No Telegram contact found: "${result.contact}"`;

    // Slack
    case "slack_send_message":
      return result.slackSent
        ? `Message sent to ${result.slackChannel}`
        : `Slack message failed`;
    case "slack_read_messages":
      return (
        result.summary ||
        `Read ${result.richSlackMessages?.length || 0} messages`
      );
    case "slack_get_unread":
      return result.summary || `${result.totalUnread || 0} unread messages`;
    case "slack_list_channels":
      return (
        result.summary ||
        `Found ${result.richSlackChannels?.length || 0} channels`
      );

    // WhatsApp
    case "whatsapp_send_message":
      return result.ok
        ? `WhatsApp sent to ${result.to}`
        : `WhatsApp send failed`;
    case "whatsapp_get_messages":
      return result.ok
        ? `${result.count} messages from ${result.chatName}`
        : `Chat not found`;
    case "whatsapp_get_unread":
      return result.totalUnread > 0
        ? `${result.totalUnread} unread across ${result.chatCount} chats`
        : "No unread WhatsApp messages";
    case "whatsapp_list_chats":
      return `${result.total || 0} WhatsApp chats`;

    case "database_query":
      return result.summary || `Database query returned ${result.count || 0} row(s)`;

    case "razorpay_get_payouts":
      return result.summary || `Found ${result.count || 0} Razorpay payouts`;

    case "razorpay_create_payout":
      return result.summary || "Razorpay payout created";

    default:
      return "Done";
  }
}

// ── buildFinalSummary ─────────────────────────────────────────────────────────
function buildFinalSummary(results, TOOL_REGISTRY) {
  const done = results.filter((r) => r.status === "done");
  if (done.length === 1 && done[0].result?.summary)
    return done[0].result.summary;

  const stepLines = done.map((r) => {
    const meta = TOOL_REGISTRY[r.tool] || { icon: "⚙️" };
    return `${meta.icon} ${stepSummary(r.tool, r.result)}`;
  });

  const lastResult = done[done.length - 1]?.result;
  if (lastResult?.summary && lastResult.summary.length > 60) {
    return stepLines.join("\n") + "\n\n" + lastResult.summary;
  }
  return stepLines.join("\n");
}

// ── extractRichTickets ────────────────────────────────────────────────────────
function extractRichTickets(tool, result) {
  if (!result) return null;
  return result.richTickets || result.tickets || null;
}

// ── POST /api/agent/parse ─────────────────────────────────────────────────────
async function parseIntent(req, res) {
  try {
    const { message, history = [] } = req.body;
    const plan = await parseAgentIntent(message, history, req.user?.username);
    console.log("Parsed agent intent:", plan);
    res.json(plan);
  } catch (err) {
    console.error("Agent parse error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

function validateSteps(steps) {
  return steps.filter((step) => {
    if (!step.tool) return false;
    if (!step.params) step.params = {};
    return true;
  });
}

// ── POST /api/agent/run (SSE) ─────────────────────────────────────────────────
async function runPlan(req, res) {
  const { steps, sessionId } = req.body;
  const userId = req.user?.username;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  function safeStringify(obj) {
    return JSON.stringify(obj, (key, value) =>
      typeof value === "bigint" ? Number(value) : value
    );
  }
  const send = (data) => {
    if (!res.writableEnded) res.write(`data: ${safeStringify(data)}\n\n`);
  };

  try {
    const initialAgentTitle = await resolveInitialAgentTitle(
      sessionId,
      userId,
      req.body.userMessage || ""
    ).catch(() => null);
    const db = mongoose.connection.db;
    const TOOL_REGISTRY = await loadToolRegistry();

    let executionSteps = steps || [];

    // ── FIX: autoInferSingleTool removed — graceful fallback ─────────────────
    if (!executionSteps.length) {
      console.log("⚠️ Planner returned empty steps — cannot execute");
      send({
        type: "complete",
        success: false,
        summary: "Could not understand the request. Please try rephrasing.",
      });
      send({ type: "done" });
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    send({ type: "start", totalSteps: executionSteps.length });
    await new Promise((r) => setTimeout(r, 150));

    const normalizedSteps = validateSteps(
      executionSteps.map((s) =>
        normalizeStepParams(s, req.body.userMessage || "")
      )
    );

    // ── Try multi-agent orchestration first ───────────────────────────────────
    const orchestratorResult = await orchestrate(
      req.body.userMessage || "",
      userId,
      db,
      async (progress) => {
        const meta = TOOL_REGISTRY[progress.tool] || {
          icon: progress.icon || "🤖",
          label: progress.label || progress.tool,
        };
        if (progress.status === "running") {
          send({
            type: "step_start",
            tool: progress.tool,
            icon: meta.icon,
            label: meta.label,
          });
        }
        if (progress.status === "done") {
          send({
            type: "step_done",
            tool: progress.tool,
            icon: meta.icon,
            label: meta.label,
            summary: progress.summary || progress.result?.summary || "Done",
          });
        }
        if (progress.status === "error") {
          send({
            type: "step_error",
            tool: progress.tool,
            icon: meta.icon,
            label: meta.label,
            error: progress.error,
          });
        }
      }
    );

    // Orchestrator handled it — return early
    if (orchestratorResult) {
      const summary = orchestratorResult.summary || "All tasks completed.";
      send({ type: "complete", success: true, summary });

      if (sessionId && userId) {
        try {
          await Conversation.findOneAndUpdate(
            { sessionId, userId },
            {
              $setOnInsert: {
                sessionId,
                userId,
                mode: "agent",
                title: initialAgentTitle || "New Chat",
              },
              $push: {
                messages: {
                  $each: [
                    {
                      role: "user",
                      content: req.body.userMessage || "[Agent task]",
                    },
                    {
                      role: "assistant",
                      content: summary,
                      isAgent: true,
                      agentDone: true,
                      steps: [],
                    },
                  ],
                },
              },
              $set: {
                updatedAt: new Date(),
                ...(initialAgentTitle ? { title: initialAgentTitle } : {}),
              },
            },
            { upsert: true }
          );
        } catch {}
      }
      send({ type: "done" });
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    // ── Normal single-agent run ───────────────────────────────────────────────
    console.log("Agent executing steps:", normalizedSteps);

    const results = await runAgent(
      normalizedSteps,
      db,
      async (progress) => {
        const meta = TOOL_REGISTRY[progress.tool] || {
          icon: "⚙️",
          label: progress.tool,
        };

        if (progress.status === "running") {
          send({
            type: "step_start",
            tool: progress.tool,
            icon: meta.icon,
            label: meta.label,
          });
          await new Promise((r) => setTimeout(r, 80));
        }

        if (progress.status === "done") {
          const r = progress.result; // ← use r consistently for all fields

          send({
            type: "step_done",
            tool: progress.tool,
            icon: meta.icon,
            label: meta.label,
            summary: stepSummary(progress.tool, r),
            richSummary: r?.summary || null,

            // ── Jira ─────────────────────────────────────────────────────────
            richTickets: extractRichTickets(progress.tool, r),
            byAssignee: r?.byAssignee || null,
            jiraDomain: r?.jiraDomain || process.env.JIRA_DOMAIN || null,
            sprintName: r?.sprintName || null,
            notifications: r?.notifications || null,

            // ── Gmail ─────────────────────────────────────────────────────────
            richEmails: r?.emails ? r.emails : r?.id && r?.subject ? [r] : null,
            emailQuery: r?.query || null,

            // ── Calendar ─────────────────────────────────────────────────────
            richEvents: r?.events || (r?.id && r?.title ? [r] : null),
            calendarByDay: r?.byDay || null,

            // ── Telegram ─────────────────────────────────────────────────────
            richTelegramMessages: r?.messages || null,
            telegramChatName: r?.chatName || null,
            telegramChatId: String(r?.chatId || ""),
            telegramChatUsername: r?.chatUsername || null,
            telegramChats: r?.chats || null,
            telegramUnreadChats: r?.chats || null,
            telegramSearchResults: r?.results || null,
            telegramQuery: r?.query || null,
            telegramSent:
              r?.ok &&
              (progress.tool === "telegram_send_message" ||
                progress.tool === "telegram_reply_message")
                ? { to: r.to, message: r.message }
                : null,
            telegramContact:
              r?.ok && progress.tool === "telegram_get_contact_info" ? r : null,

            // ── Slack ─────────────────────────────────────────────────────────
            richSlackMessages: r?.richSlackMessages || null,
            richSlackChannels: r?.richSlackChannels || null,
            richSlackUnread: r?.richSlackUnread || null,
            slackChannel: r?.slackChannel || null,
            slackChannelId: r?.slackChannelId || null,
            slackSent: r?.slackSent || null,
            slackMessage: r?.slackMessage || null,
            totalUnread: r?.totalUnread || null,

            // ── WhatsApp — FIX: use r not progress.result ─────────────────────
            richWhatsAppMessages: r?.messages || null,
            richWhatsAppUnread: r?.chats || null,
            richWhatsAppChats: r?.chats || null,
            whatsappChatName: r?.chatName || null,
            whatsappChatId: String(r?.chatId || ""),
            whatsappSent:
              r?.ok && progress.tool === "whatsapp_send_message" ? true : null,
            whatsappTo: r?.to || null,
            whatsappMessage: r?.message || null,
          });
          await new Promise((r) => setTimeout(r, 60));
        }

        if (progress.status === "error") {
          send({
            type: "step_error",
            tool: progress.tool,
            icon: meta.icon,
            label: meta.label,
            error: progress.error,
          });
        }

        if (progress.status === "confirm_needed") {
          send({
            type: "confirm_needed",
            tool: progress.tool,
            icon: meta.icon,
            label: meta.label,
            preview: progress.preview || null,
          });
        }
      },
      userId,
      sessionId
    );

    const failed = results.find((r) => r.status === "error");
    const summary = failed
      ? `Stopped: ${failed.error}`
      : buildFinalSummary(results, TOOL_REGISTRY);

    send({ type: "complete", success: !failed, summary });

    // ── Persist to DB ─────────────────────────────────────────────────────────
    if (sessionId && userId) {
      try {
        const persistedSteps = results
          .filter((r) => r.status === "done")
          .map((r) => {
            const meta = TOOL_REGISTRY[r.tool] || { icon: "⚙️", label: r.tool };
            return {
              tool: r.tool,
              icon: meta.icon,
              label: meta.label,
              status: "done",
              summary: stepSummary(r.tool, r.result),

              // Jira
              richTickets: extractRichTickets(r.tool, r.result),
              byAssignee: r.result?.byAssignee || null,
              jiraDomain:
                r.result?.jiraDomain || process.env.JIRA_DOMAIN || null,
              sprintName: r.result?.sprintName || null,
              notifications: r.result?.notifications || null,

              // Email
              richEmails: r.result?.emails
                ? r.result.emails
                : r.result?.id && r.result?.subject
                ? [r.result]
                : null,
              emailQuery: r.result?.query || null,

              // Calendar
              richEvents:
                r.result?.events ||
                (r.result?.id && r.result?.title ? [r.result] : null),
              calendarByDay: r.result?.byDay || null,

              // Telegram
              richTelegramMessages: r.result?.messages || null,
              telegramChatName: r.result?.chatName || null,
              telegramChatId: r.result?.chatId || null,
              telegramChatUsername: r.result?.chatUsername || null,
              telegramChats: r.result?.chats || null,
              telegramUnreadChats: r.result?.chats || null,
              telegramSearchResults: r.result?.results || null,
              telegramQuery: r.result?.query || null,
              telegramSentMessages:
                r.tool === "telegram_send_message" ||
                r.tool === "telegram_reply_message"
                  ? [
                      {
                        chatId: r.result?.chatId || null,
                        to: r.result?.to,
                        message: r.result?.message || null,
                        type: r.result?.type || "text",
                        attachment: r.result?.attachment || null,
                        ts: Date.now(),
                      },
                    ]
                  : null,
              telegramContact:
                r.result?.ok && r.tool === "telegram_get_contact_info"
                  ? r.result
                  : null,

              // Slack
              richSlackMessages: r.result?.richSlackMessages || null,
              richSlackChannels: r.result?.richSlackChannels || null,
              richSlackUnread: r.result?.richSlackUnread || null,
              slackChannel: r.result?.slackChannel || null,
              slackChannelId: r.result?.slackChannelId || null,
              slackSent: r.result?.slackSent || null,
              slackMessage: r.result?.slackMessage || null,
              totalUnread: r.result?.totalUnread || null,

              // ── WhatsApp — FIX: was missing from persistedSteps ───────────
              richWhatsAppMessages: r.result?.messages || null,
              richWhatsAppUnread: r.result?.chats || null,
              richWhatsAppChats: r.result?.chats || null,
              whatsappChatName: r.result?.chatName || null,
              whatsappChatId: r.result?.chatId || null,
              whatsappSent: r.tool === "whatsapp_send_message" ? true : null,
              whatsappTo: r.result?.to || null,
              whatsappMessage: r.result?.message || null,
            };
          });
        try {
          const {
            extractAndSaveFacts,
            saveRecentContext,
          } = require("../services/memoryService");
          await extractAndSaveFacts(
            userId,
            req.body.userMessage || "",
            results
          );
          for (const r of results.filter((r) => r.status === "done")) {
            await saveRecentContext(
              userId,
              r.tool,
              stepSummary(r.tool, r.result),
              {}
            );
          }
        } catch {}
        await Conversation.findOneAndUpdate(
          { sessionId, userId },
          {
            $setOnInsert: {
              sessionId,
              userId,
              mode: "agent",
              title: initialAgentTitle || "New Chat",
            },
            $push: {
              messages: {
                $each: [
                  {
                    role: "user",
                    content: req.body.userMessage || "[Agent task]",
                  },
                  {
                    role: "assistant",
                    content: summary,
                    isAgent: true,
                    agentDone: true,
                    steps: persistedSteps,
                  },
                ],
              },
            },
            $set: {
              updatedAt: new Date(),
              ...(initialAgentTitle ? { title: initialAgentTitle } : {}),
            },
          },
          { upsert: true }
        );
      } catch (saveErr) {
        console.error("Agent session save failed:", saveErr.message);
      }
    }
  } catch (err) {
    console.error("Agent run error:", err.message);
    captureException(err, {
      controller: "agentController.runPlan",
      userId,
      sessionId,
    });
    send({ type: "error", error: err.message });
  } finally {
    send({ type: "done" });
    res.write("data: [DONE]\n\n");
    res.end();
  }
}

async function confirmAgentAction(req, res) {
  const { sessionId, tool, approved } = req.body || {};
  const userId = req.user?.username;

  if (!sessionId || !tool) {
    return res.status(400).json({ error: "sessionId and tool are required" });
  }

  const pending = getPendingConfirmation(sessionId, tool);
  if (!pending) {
    return res.status(404).json({ error: "No pending confirmation found" });
  }

  const resolved = resolveConfirmation(sessionId, tool, approved);
  if (!resolved) {
    return res.status(409).json({ error: "Confirmation could not be resolved" });
  }

  await Conversation.findOneAndUpdate(
    { sessionId, userId },
    {
      $push: {
        activityLog: {
          message: `Confirmation ${approved ? "approved" : "declined"} for ${tool}`,
          queryType: "agent_confirmation",
          explanation: pending.preview?.action || tool,
          createdAt: new Date(),
        },
      },
      $set: { updatedAt: new Date() },
    }
  ).catch(() => {});

  res.json({
    ok: true,
    approved: Boolean(approved),
    sessionId,
    tool,
  });
}

// ── POST /api/agent/gmail-reply ───────────────────────────────────────────────
async function gmailReplyDirect(req, res) {
  const userId = req.user?.username;
  const { threadId, messageId, replyTo, subject, body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: "Body is required" });

  try {
    const integration = await Integration.findOne({ userId, type: "gmail" });
    if (!integration?.gmail?.accessToken)
      return res.status(400).json({ error: "Gmail not connected" });

    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );
    oauth2Client.setCredentials({
      access_token: integration.gmail.accessToken,
      refresh_token: integration.gmail.refreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const rawReply = [
      `To: ${replyTo}`,
      `Subject: Re: ${subject?.replace(/^Re:\s*/i, "")}`,
      `In-Reply-To: ${messageId}`,
      `References: ${messageId}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ].join("\r\n");

    const encoded = Buffer.from(rawReply)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encoded, threadId: threadId || undefined },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("gmailReplyDirect error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/agent/gmail-suggest-reply ──────────────────────────────────────
async function gmailSuggestReply(req, res) {
  const { subject, from, body, snippet } = req.body;
  if (!chatCompleteNoSystem)
    return res.status(500).json({ error: "LLM service not available" });

  const emailContent = body?.trim() || snippet?.trim() || "(no content)";
  try {
    const prompt = `You are a professional email assistant. Write a concise, helpful reply to the following email.

From: ${from}
Subject: ${subject}
Email body:
${emailContent.slice(0, 1500)}

Instructions:
- Write a natural, professional reply
- Be concise (3-6 sentences max)
- Match the tone of the original email
- Do NOT include a subject line
- Do NOT include "Dear..." or formal salutations
- End with a simple closing like "Thanks," or "Best regards,"
- Return ONLY the reply body, nothing else`;

    const suggested = await chatCompleteNoSystem(prompt, 300, 0.5);
    res.json({ suggested: suggested.trim() });
  } catch (err) {
    console.error("gmailSuggestReply error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/agent/calendar-rsvp ────────────────────────────────────────────
async function calendarRsvpDirect(req, res) {
  const userId = req.user?.username;
  const { eventId, response } = req.body;
  if (!eventId || !response)
    return res.status(400).json({ error: "eventId and response required" });
  try {
    const { calendarRespond } = require("../services/tools/toolCalendar");
    const result = await calendarRespond({ eventId, response }, { userId });
    res.json(result);
  } catch (err) {
    console.error("calendarRsvp error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/agent/telegram-reply ───────────────────────────────────────────
async function saveTelegramReply(req, res) {
  const { sessionId, chatId, text, fileNames } = req.body;
  const userId = req.user?.username;
  if (!sessionId || !chatId)
    return res.status(400).json({ error: "sessionId and chatId required" });

  try {
    const conv = await Conversation.findOne({ sessionId, userId });
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const sentMsg = {
      id: Date.now(),
      chatId: String(chatId),
      text: text || "",
      fileNames: fileNames || [],
      fromMe: true,
      date: new Date().toISOString(),
    };

    let updated = false;
    for (const message of conv.messages) {
      if (!message.isAgent || !Array.isArray(message.steps)) continue;
      for (const step of message.steps) {
        const stepChatId = String(step.telegramChatId || "");
        const hasChat =
          stepChatId === String(chatId) ||
          (step.telegramUnreadChats || []).some(
            (c) => String(c.chatId) === String(chatId)
          );
        if (hasChat) {
          if (!Array.isArray(step.telegramSentMessages))
            step.telegramSentMessages = [];
          step.telegramSentMessages.push(sentMsg);
          updated = true;
        }
      }
    }

    if (updated) {
      conv.markModified("messages");
      await conv.save();
    }
    res.json({ ok: true, updated });
  } catch (err) {
    console.error("saveTelegramReply error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  parseIntent,
  runPlan,
  confirmAgentAction,
  gmailReplyDirect,
  gmailSuggestReply,
  calendarRsvpDirect,
  saveTelegramReply,
};
