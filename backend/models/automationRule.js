const mongoose = require("mongoose");

const AutomationRuleSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  description: { type: String, default: "" },

  // TRIGGER — what starts this rule
  trigger: {
    app: { type: String, required: true }, // gmail | telegram | slack | whatsapp | jira | calendar | schedule
    event: { type: String, required: true }, // new_message | new_email | ticket_assigned | meeting_starting | cron
    params: { type: Object, default: {} },
    // Examples:
    // { app: "gmail",     event: "new_email",      params: { from: "boss@co.com" } }
    // { app: "telegram",  event: "new_message",     params: { from: "Adi" } }
    // { app: "slack",     event: "new_message",     params: { channel: "engineering" } }
    // { app: "jira",      event: "ticket_assigned", params: { assignee: "me" } }
    // { app: "schedule",  event: "cron",            params: { cron: "0 9 * * 1" } } // every Monday 9am
  },

  // CONDITIONS — optional filters (all must match)
  conditions: [
    {
      field: String, // e.g. "subject", "from", "priority", "message"
      operator: String, // contains | equals | startsWith | not_contains
      value: String, // e.g. "invoice", "urgent"
    },
  ],

  // ACTIONS — what to do (can chain multiple)
  actions: [
    {
      app: { type: String, required: true }, // telegram | slack | whatsapp | gmail | jira | agent
      action: { type: String, required: true }, // send_message | create_ticket | reply | summarize | forward
      params: { type: Object, default: {} },
      // Examples:
      // { app: "telegram",  action: "send_message", params: { contact: "me",      message: "New email from {{from}}: {{subject}}" } }
      // { app: "slack",     action: "send_message", params: { channel: "general", message: "{{summary}}" } }
      // { app: "jira",      action: "create_ticket",params: { summary: "{{subject}}", priority: "High" } }
      // { app: "agent",     action: "summarize",    params: { prompt: "Summarize this email: {{body}}" } }
    },
  ],

  // Stats
  runCount: { type: Number, default: 0 },
  lastRunAt: { type: Date },
  lastResult: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports =
  mongoose.models.AutomationRule ||
  mongoose.model("AutomationRule", AutomationRuleSchema);
