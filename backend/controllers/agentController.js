const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const {
  parseAgentIntent,
  runAgent,
  loadToolRegistry,
} = require("../services/agentService");
const Integration = require("../models/Integration");
const { google } = require("googleapis");
// Try both common paths for llmService
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

// ── stepSummary — human-readable one-liner per tool result ───────────────────
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

    // ── Jira: read ───────────────────────────────────────
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

    // ── Jira: write ──────────────────────────────────────
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

    // ── Google Calendar ──────────────────────────────────
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
    default:
      return "Done";
  }
}

// ── buildFinalSummary — receives TOOL_REGISTRY as param, no global needed ────
function buildFinalSummary(results, TOOL_REGISTRY) {
  const done = results.filter((r) => r.status === "done");

  // Single step with rich summary — use it directly
  if (done.length === 1 && done[0].result?.summary) {
    return done[0].result.summary;
  }

  // Multi-step — show step summaries then append last rich content
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

// ── POST /api/agent/parse ─────────────────────────────────────────────────────
async function parseIntent(req, res) {
  try {
    const { message, history = [] } = req.body;
    const plan = await parseAgentIntent(message, history);
    res.json(plan);
  } catch (err) {
    console.error("Agent parse error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/agent/run  (SSE) ────────────────────────────────────────────────
async function runPlan(req, res) {
  const { steps, sessionId } = req.body;
  const userId = req.user?.username;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const db = mongoose.connection.db;

    // ── Load registry ONCE per run — DB + static merged ──
    const TOOL_REGISTRY = await loadToolRegistry();

    send({ type: "start", totalSteps: steps.length });
    await new Promise((r) => setTimeout(r, 150));

    const results = await runAgent(
      steps,
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
          send({
            type: "step_done",
            tool: progress.tool,
            icon: meta.icon,
            label: meta.label,
            summary: stepSummary(progress.tool, progress.result),
            richSummary: progress.result?.summary || null,
            richTickets: progress.result?.tickets || null,
            byAssignee: progress.result?.byAssignee || null,
            jiraDomain: process.env.JIRA_DOMAIN || null,
            sprintName: progress.result?.sprintName || null,
            notifications: progress.result?.notifications || null,
            richEmails: progress.result?.emails
              ? progress.result.emails
              : progress.result?.id && progress.result?.subject
              ? [progress.result]
              : null,
            emailQuery: progress.result?.query || null,
            // Calendar
            richEvents:
              progress.result?.events ||
              (progress.result?.id && progress.result?.title
                ? [progress.result]
                : null),
            calendarByDay: progress.result?.byDay || null,
            richTelegramMessages: progress.result?.messages || null,
            telegramChatName: progress.result?.chatName || null,
            telegramChats: progress.result?.chats || null,
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
      },
      userId
    );

    const failed = results.find((r) => r.status === "error");
    const summary = failed
      ? `Stopped: ${failed.error}`
      : buildFinalSummary(results, TOOL_REGISTRY);

    send({ type: "complete", success: !failed, summary });

    // ── Persist to DB with steps + richTickets ────────────
    if (sessionId && userId) {
      try {
        const persistedSteps = results
          .filter((r) => r.status === "done")
          .map((r) => {
            const meta = TOOL_REGISTRY[r.tool] || { icon: "⚙️", label: r.tool };
            return {
              tool: r.tool,
              label: meta.label,
              status: "done",
              summary: stepSummary(r.tool, r.result),
              richTickets: r.result?.tickets || null,
              byAssignee: r.result?.byAssignee || null,
              jiraDomain: process.env.JIRA_DOMAIN || null,
              sprintName: r.result?.sprintName || null,
              notifications: r.result?.notifications || null,
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
              richTelegramMessages: r.result?.messages || null,
              telegramChatName:     r.result?.chatName  || null,
              telegramChats:        r.result?.chats     || null,
            };
          });

        await Conversation.findOneAndUpdate(
          { sessionId, userId },
          {
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
            $set: { updatedAt: new Date() },
          },
          { upsert: true }
        );
      } catch (saveErr) {
        console.error("Agent session save failed:", saveErr.message);
      }
    }
  } catch (err) {
    console.error("Agent run error:", err.message);
    send({ type: "error", error: err.message });
  } finally {
    send({ type: "done" });
    res.write("data: [DONE]\n\n");
    res.end();
  }
}

// ── POST /api/agent/gmail-reply ──────────────────────────────────────────────
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
      requestBody: {
        raw: encoded,
        threadId: threadId || undefined,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("gmailReplyDirect error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/agent/gmail-suggest-reply ─────────────────────────────────────
async function gmailSuggestReply(req, res) {
  const { subject, from, body, snippet } = req.body;

  if (!chatCompleteNoSystem) {
    return res.status(500).json({ error: "LLM service not available" });
  }

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
- Do NOT include "Dear..." or formal salutations — start directly with the reply content
- End with a simple closing like "Thanks," or "Best regards," followed by a new line (no name needed)
- Return ONLY the reply body, nothing else`;

    const suggested = await chatCompleteNoSystem(prompt, 300, 0.5);
    console.log("Suggested reply:", suggested);
    res.json({ suggested: suggested.trim() });
  } catch (err) {
    console.error("gmailSuggestReply error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/agent/calendar-rsvp ───────────────────────────────────────────
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

module.exports = {
  parseIntent,
  runPlan,
  gmailReplyDirect,
  gmailSuggestReply,
  calendarRsvpDirect,
};
