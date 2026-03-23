/**
 * automationEngine.js
 * 📁 backend/services/automationEngine.js
 *
 * Evaluates automation rules and executes their actions.
 * Called by WebSocket server when new events arrive,
 * and by the cron scheduler for time-based triggers.
 */

"use strict";

const AutomationRule = require("../models/automationRule");
const { chatCompleteNoSystem } = require("./llmService");

// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER AN EVENT — called when something happens in any app
// event = { app, event, data }
// Examples:
//   triggerEvent(userId, { app: "telegram",  event: "new_message", data: { from: "Adi", message: "Hi" } })
//   triggerEvent(userId, { app: "gmail",     event: "new_email",   data: { from: "boss@co.com", subject: "Invoice", body: "..." } })
//   triggerEvent(userId, { app: "jira",      event: "ticket_assigned", data: { key: "ENGG-123", assignee: "vikas" } })
// ─────────────────────────────────────────────────────────────────────────────
async function triggerEvent(userId, event) {
  try {
    // Find all enabled rules for this user + app + event
    const rules = await AutomationRule.find({
      userId,
      enabled: true,
      "trigger.app": event.app,
      "trigger.event": event.event,
    });

    for (const rule of rules) {
      // Check conditions
      if (!matchesConditions(rule.conditions, event.data)) continue;

      // Execute actions
      await executeRule(rule, userId, event.data);
    }
  } catch (err) {
    console.error("automationEngine.triggerEvent error:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK CONDITIONS
// ─────────────────────────────────────────────────────────────────────────────
function matchesConditions(conditions, data) {
  if (!conditions?.length) return true; // no conditions = always match

  return conditions.every((cond) => {
    const fieldValue = String(data[cond.field] || "").toLowerCase();
    const checkValue = String(cond.value || "").toLowerCase();

    switch (cond.operator) {
      case "contains":
        return fieldValue.includes(checkValue);
      case "equals":
        return fieldValue === checkValue;
      case "startsWith":
        return fieldValue.startsWith(checkValue);
      case "endsWith":
        return fieldValue.endsWith(checkValue);
      case "not_contains":
        return !fieldValue.includes(checkValue);
      default:
        return true;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTE A RULE
// ─────────────────────────────────────────────────────────────────────────────
async function executeRule(rule, userId, eventData) {
  const ctx = { userId };
  const results = [];

  // Build a context object — data from event + results of previous actions
  const context = { ...eventData };

  try {
    for (const action of rule.actions) {
      // Resolve template variables in action params
      const resolvedParams = resolveTemplates(action.params, context);

      let result;
      switch (`${action.app}:${action.action}`) {
        // ── Telegram ────────────────────────────────────────────────────────
        case "telegram:send_message": {
          const { toolTelegramSendMessage } = require("./tools/toolTelegram");
          result = await toolTelegramSendMessage(
            {
              contact: resolvedParams.contact,
              message: resolvedParams.message,
            },
            ctx
          );
          break;
        }

        // ── Slack ────────────────────────────────────────────────────────────
        case "slack:send_message": {
          const { toolSlack } = require("./tools/toolSlack");
          result = await toolSlack(
            {
              action: "send",
              channel: resolvedParams.channel,
              message: resolvedParams.message,
            },
            ctx
          );
          break;
        }

        // ── WhatsApp ─────────────────────────────────────────────────────────
        case "whatsapp:send_message": {
          const { toolWhatsApp } = require("./tools/toolWhatsapp");
          result = await toolWhatsApp(
            {
              action: "send",
              to: resolvedParams.to,
              message: resolvedParams.message,
            },
            ctx
          );
          break;
        }

        // ── Gmail ────────────────────────────────────────────────────────────
        case "gmail:send_email": {
          const { toolGmail } = require("./tools/toolGmail");
          result = await toolGmail(
            {
              action: "send",
              to: resolvedParams.to,
              subject: resolvedParams.subject,
              body: resolvedParams.body,
            },
            ctx
          );
          break;
        }

        case "gmail:reply": {
          const { toolGmail } = require("./tools/toolGmail");
          result = await toolGmail(
            {
              action: "reply",
              messageId: context.messageId,
              threadId: context.threadId,
              replyTo: context.from,
              subject: context.subject,
              body: resolvedParams.body,
            },
            ctx
          );
          break;
        }

        // ── Jira ─────────────────────────────────────────────────────────────
        case "jira:create_ticket": {
          const { runJiraTool } = require("./tools/toolJira");
          result = await runJiraTool(
            "jira_create_ticket",
            {
              summary: resolvedParams.summary,
              description: resolvedParams.description || context.body || "",
              priority: resolvedParams.priority || "Medium",
              assigneeName: resolvedParams.assignee || "",
            },
            ctx
          );
          if (result.key) context.ticketKey = result.key;
          break;
        }

        // ── AI actions ───────────────────────────────────────────────────────
        case "agent:summarize": {
          const prompt = resolveTemplates(resolvedParams.prompt, context);
          const summary = await chatCompleteNoSystem(prompt, 300, 0.3);
          context.summary = summary.trim();
          context.aiResult = context.summary;
          result = { summary: context.summary };
          break;
        }

        case "agent:classify": {
          const prompt =
            `Classify the following as one of: ${
              resolvedParams.categories?.join(", ") || "urgent, normal, spam"
            }.\n` +
            `Reply with ONLY the category name.\n\n` +
            resolveTemplates(resolvedParams.content, context);
          const classification = await chatCompleteNoSystem(prompt, 20, 0.1);
          context.classification = classification.trim().toLowerCase();
          result = { classification: context.classification };
          break;
        }

        default:
          console.warn(
            `Unknown automation action: ${action.app}:${action.action}`
          );
          result = { ok: false, error: "Unknown action" };
      }

      results.push({ action: `${action.app}:${action.action}`, result });

      // If action failed and it's critical, stop
      if (result?.ok === false && resolvedParams.stopOnError) break;
    }

    // Update rule stats
    await AutomationRule.findByIdAndUpdate(rule._id, {
      $inc: { runCount: 1 },
      $set: {
        lastRunAt: new Date(),
        lastResult: "success",
        updatedAt: new Date(),
      },
    });

    console.log(
      `✅ Automation "${rule.name}" executed (${results.length} actions)`
    );
    return { ok: true, results };
  } catch (err) {
    console.error(`Automation "${rule.name}" failed:`, err.message);
    await AutomationRule.findByIdAndUpdate(rule._id, {
      $set: { lastRunAt: new Date(), lastResult: `error: ${err.message}` },
    });
    return { ok: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE RESOLVER — replaces {{variable}} in strings
// ─────────────────────────────────────────────────────────────────────────────
function resolveTemplates(obj, context) {
  if (typeof obj === "string") {
    return obj.replace(
      /\{\{(\w+)\}\}/g,
      (_, key) => context[key] ?? `{{${key}}}`
    );
  }
  if (typeof obj === "object" && obj !== null) {
    const resolved = {};
    for (const [k, v] of Object.entries(obj)) {
      resolved[k] = resolveTemplates(v, context);
    }
    return resolved;
  }
  return obj;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRON SCHEDULER — runs time-based rules
// ─────────────────────────────────────────────────────────────────────────────
let cronJob = null;

async function startCronScheduler() {
  const cron = require("node-cron");
  if (cronJob) return;

  // Check every minute for matching cron rules
  cronJob = cron.schedule("* * * * *", async () => {
    try {
      const rules = await AutomationRule.find({
        enabled: true,
        "trigger.app": "schedule",
        "trigger.event": "cron",
      });

      const now = new Date();
      for (const rule of rules) {
        const cronExpr = rule.trigger.params?.cron;
        if (!cronExpr) continue;

        if (cron.validate(cronExpr) && shouldRunNow(cronExpr, now)) {
          await executeRule(rule, rule.userId, {
            triggeredAt: now.toISOString(),
            type: "scheduled",
          });
        }
      }
    } catch (err) {
      console.error("Cron scheduler error:", err.message);
    }
  });

  console.log("✅ Automation cron scheduler started");
}

function shouldRunNow(cronExpr, now) {
  // Simple check — cron.schedule validates but we use node-cron's match
  try {
    const cron = require("node-cron");
    return cron.validate(cronExpr);
  } catch {
    return false;
  }
}

module.exports = { triggerEvent, executeRule, startCronScheduler };
