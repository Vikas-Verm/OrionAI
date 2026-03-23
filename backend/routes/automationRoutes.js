/**
 * automationRoutes.js
 * 📁 backend/routes/automationRoutes.js
 *
 * Register in app.js:
 *   const automationRoutes = require('./routes/automationRoutes')
 *   app.use('/api/automations', automationRoutes)
 */

"use strict";

const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const AutomationRule = require("../models/automationRule");
const { executeRule } = require("../services/automationEngine");

// ── GET /api/automations ─────────── List all rules ──────────────────────────
router.get("/", authenticate, async (req, res) => {
  const userId = req.user?.username;
  try {
    const rules = await AutomationRule.find({ userId }).sort({ createdAt: -1 });
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/automations ─────────── Create rule ────────────────────────────
router.post("/", authenticate, async (req, res) => {
  const userId = req.user?.username;
  try {
    const rule = await AutomationRule.create({ ...req.body, userId });
    res.json({ ok: true, rule });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/automations/:id ──────── Update rule ────────────────────────────
router.put("/:id", authenticate, async (req, res) => {
  const userId = req.user?.username;
  try {
    const rule = await AutomationRule.findOneAndUpdate(
      { _id: req.params.id, userId },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    res.json({ ok: true, rule });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/automations/:id ───── Delete rule ────────────────────────────
router.delete("/:id", authenticate, async (req, res) => {
  const userId = req.user?.username;
  try {
    await AutomationRule.findOneAndDelete({ _id: req.params.id, userId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/automations/:id/toggle ─ Enable/disable ───────────────────────
router.patch("/:id/toggle", authenticate, async (req, res) => {
  const userId = req.user?.username;
  try {
    const rule = await AutomationRule.findOne({ _id: req.params.id, userId });
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    rule.enabled = !rule.enabled;
    rule.updatedAt = new Date();
    await rule.save();
    res.json({ ok: true, enabled: rule.enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/automations/:id/test ─── Test run a rule ───────────────────────
router.post("/:id/test", authenticate, async (req, res) => {
  const userId = req.user?.username;
  try {
    const rule = await AutomationRule.findOne({ _id: req.params.id, userId });
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    const result = await executeRule(rule, userId, req.body?.testData || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/automations/templates ─── Preset templates ──────────────────────
router.get("/templates", authenticate, (req, res) => {
  res.json(TEMPLATES);
});

// ─────────────────────────────────────────────────────────────────────────────
// PRESET TEMPLATES — shown in the UI for quick setup
// ─────────────────────────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: "email_to_telegram",
    name: "Email → Telegram alert",
    description: "Get a Telegram message whenever a new email arrives",
    icon: "📧→✈️",
    trigger: { app: "gmail", event: "new_email", params: {} },
    conditions: [],
    actions: [
      {
        app: "telegram",
        action: "send_message",
        params: {
          contact: "me",
          message: "📧 New email from {{from}}\nSubject: {{subject}}",
        },
      },
    ],
  },
  {
    id: "whatsapp_to_slack",
    name: "WhatsApp → Slack forward",
    description: "Forward WhatsApp messages to a Slack channel",
    icon: "💬→💬",
    trigger: { app: "whatsapp", event: "new_message", params: {} },
    conditions: [],
    actions: [
      {
        app: "slack",
        action: "send_message",
        params: {
          channel: "general",
          message: "📱 WhatsApp from {{from}}: {{message}}",
        },
      },
    ],
  },
  {
    id: "jira_ticket_notify",
    name: "Jira assigned → Notify me",
    description: "Get notified when a Jira ticket is assigned to you",
    icon: "🔷→✈️",
    trigger: { app: "jira", event: "ticket_assigned", params: {} },
    conditions: [],
    actions: [
      {
        app: "telegram",
        action: "send_message",
        params: {
          contact: "me",
          message: "🔷 New Jira ticket assigned: {{key}}\n{{summary}}",
        },
      },
    ],
  },
  {
    id: "weekly_summary",
    name: "Weekly email summary",
    description:
      "Every Monday morning, summarize unread emails and send to Telegram",
    icon: "📅→📧",
    trigger: { app: "schedule", event: "cron", params: { cron: "0 9 * * 1" } },
    conditions: [],
    actions: [
      {
        app: "agent",
        action: "summarize",
        params: { prompt: "Summarize my unread emails from this week" },
      },
      {
        app: "telegram",
        action: "send_message",
        params: {
          contact: "me",
          message: "📋 Weekly email summary:\n{{summary}}",
        },
      },
    ],
  },
  {
    id: "urgent_email_slack",
    name: "Urgent email → Slack alert",
    description: "Post to Slack when an email with 'urgent' in subject arrives",
    icon: "🚨→💬",
    trigger: { app: "gmail", event: "new_email", params: {} },
    conditions: [{ field: "subject", operator: "contains", value: "urgent" }],
    actions: [
      {
        app: "slack",
        action: "send_message",
        params: {
          channel: "general",
          message: "🚨 Urgent email from {{from}}: {{subject}}",
        },
      },
    ],
  },
  {
    id: "telegram_to_jira",
    name: "Telegram message → Jira ticket",
    description: "Create a Jira ticket from a Telegram message",
    icon: "✈️→🔷",
    trigger: { app: "telegram", event: "new_message", params: {} },
    conditions: [
      { field: "message", operator: "startsWith", value: "!ticket" },
    ],
    actions: [
      {
        app: "jira",
        action: "create_ticket",
        params: {
          summary: "{{message}}",
          priority: "Medium",
        },
      },
    ],
  },
];

module.exports = router;
