/**
 * agentPlanner.js
 * 📁 backend/services/agentPlanner.js
 *
 * Loads ALL tools from Skill DB. LLM decides what to call.
 * No hardcoded rules — fully natural language.
 */

"use strict";

const Skill = require("../models/skill");
const { chatCompleteNoSystem } = require("./llmService");
const { getMemoryContext } = require("../services/memoryService");

const DOCUMENT_LOOKUP_RE =
  /\b(invoice|invoices|bill|bills|purchase order|purchase orders|credit note|credit notes|debit note|debit notes|payment request|payment requests|proof of delivery|proof of deliveries|pod|pods|\bpo\b)\b/i;
const DOCUMENT_DELIVERY_RE =
  /\b(send|share|email|mail|whatsapp|slack|telegram|pdf|download|export|attach|attachment|forward|dispatch|print)\b/i;

const BUILTIN_TOOLS = [
  {
    name: "database_query",
    description:
      "Query the user's connected business database in a read-only way using natural language.",
    paramsText:
      '    - question (string, required): the business question to answer from the connected database',
  },
  {
    name: "razorpay_get_payouts",
    description:
      "Fetch recent Razorpay payouts and their statuses for finance or payroll workflows.",
    paramsText: [
      '    - status (string, optional): filter by payout status such as processed or pending',
      '    - limit (number, optional): how many payouts to fetch, default 10',
    ].join("\n"),
  },
  {
    name: "razorpay_create_payout",
    description:
      "Create a real Razorpay payout to an existing fund account. Use only when the user clearly wants to send money.",
    paramsText: [
      '    - fundAccountId (string, required): existing Razorpay fund account ID',
      '    - amount (number, required): amount in INR rupees to send',
      '    - narration (string, optional): payout narration',
      '    - referenceId (string, optional): business reference',
      '    - mode (string, optional): IMPS, NEFT, RTGS, or UPI',
    ].join("\n"),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Load all enabled tools from Skill DB
// ─────────────────────────────────────────────────────────────────────────────
async function loadToolsFromDB() {
  const skills = await Skill.find({ enabled: true });
  const dbTools = skills.map((s) => {
    const paramsText = (s.params || [])
      .map((p) => {
        let line = `    - ${p.name} (${p.type}${
          p.required ? ", required" : ", optional"
        })`;
        if (p.description) line += `: ${p.description}`;
        if (p.example) line += ` — e.g. "${p.example}"`;
        if (p.default !== undefined) line += ` — default: ${p.default}`;
        return line;
      })
      .join("\n");

    return { name: s.toolName, description: s.description, paramsText };
  });

  return [...BUILTIN_TOOLS, ...dbTools];
}

function formatTools(tools) {
  return tools
    .map((t) =>
      [
        `• ${t.name}`,
        `  ${t.description}`,
        t.paramsText ? `  Params:\n${t.paramsText}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

function buildConnectedDatabasePlan(userMessage, existingPlan = {}) {
  return {
    isAgentTask: true,
    confidence: Math.max(Number(existingPlan?.confidence) || 0, 0.85),
    intent:
      existingPlan?.intent ||
      "Query the connected database for the requested business data",
    steps: [{ tool: "database_query", params: { question: userMessage } }],
  };
}

function shouldUseConnectedDatabase(userMessage = "", plan = {}) {
  const message = String(userMessage || "").trim();
  const steps = Array.isArray(plan?.steps) ? plan.steps.filter(Boolean) : [];

  if (!DOCUMENT_LOOKUP_RE.test(message)) return false;
  if (DOCUMENT_DELIVERY_RE.test(message)) return false;

  if (
    steps.some((step) =>
      ["generate_pdf", "send_email", "send_whatsapp", "send_slack"].includes(
        step?.tool
      )
    )
  ) {
    return false;
  }

  if (!steps.length) return true;

  return steps.every((step) => step.tool === "fetch_document");
}

function normalizePlannedSteps(userMessage = "", plan = {}) {
  const normalizedPlan = {
    isAgentTask: Boolean(plan?.isAgentTask),
    confidence: Number(plan?.confidence) || 0,
    intent: plan?.intent || "",
    steps: Array.isArray(plan?.steps) ? plan.steps.filter((step) => step?.tool) : [],
  };

  if (shouldUseConnectedDatabase(userMessage, normalizedPlan)) {
    return buildConnectedDatabasePlan(userMessage, normalizedPlan);
  }

  return normalizedPlan;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSE AGENT INTENT
// ─────────────────────────────────────────────────────────────────────────────
async function parseAgentIntent(userMessage, history = [], userId = null) {
  try {
    const tools = await loadToolsFromDB();
    const toolsText = formatTools(tools);
    const now = new Date();
    const today = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
    const memoryCtx = userId
      ? await getMemoryContext(userId).catch(() => "")
      : "";
    const prompt = [
      `You are an AI agent planner.${
        memoryCtx ? `\n${memoryCtx}\n` : ""
      } Analyze the user request and decide which tools to call.`,
      ``,
      `Current date: ${today} (${dayName}, IST timezone UTC+05:30)`,
      ``,
      `AVAILABLE TOOLS:`,
      `─────────────────`,
      toolsText,
      ``,
      `PLANNING RULES:`,
      `1. Pick the right tool(s). For multi-step tasks list ALL steps in order.`,
      `2. Steps share results — use {{ticketKey}} in message params to reference a Jira ticket key from a previous step.`,
      `3. CALENDAR DATES: When user mentions a specific date (e.g. "23/03/2026", "March 23", "tomorrow", "next Monday"):`,
      `   - Convert to YYYY-MM-DD and set BOTH dateFrom AND dateTo to that date`,
      `   - "tomorrow" = ${
        new Date(now.getTime() + 86400000).toISOString().split("T")[0]
      }`,
      `   - "today" = ${today}`,
      `   - Use calendar_get_events with dateFrom+dateTo, NOT query`,
      `4. SLACK/TELEGRAM DMs: Use person's first name in lowercase as channel/contact (e.g. "hari", "rahul")`,
      `5. CONNECTED DATABASE: Use database_query for read-only business data questions such as "show latest bill", "latest invoice details", "list unpaid bills", or "find PO details".`,
      `6. fetch_document is ONLY for document-delivery workflows where the user wants to send, share, attach, export, or generate a PDF from a document.`,
      `7. General questions, coding help, maths, or casual chat are NOT agent tasks.`,
      ``,
      `USER REQUEST: "${userMessage}"`,
      ``,
      `Respond with ONLY valid JSON:`,
      `{`,
      `  "isAgentTask": true | false,`,
      `  "confidence": 0.0 to 1.0,`,
      `  "intent": "one line — what you will do",`,
      `  "steps": [{ "tool": "tool_name", "params": { "key": "value" } }]`,
      `}`,
      ``,
      `Not an agent task: {"isAgentTask":false,"confidence":0.95,"intent":"","steps":[]}`,
    ].join("\n");

    const raw = await chatCompleteNoSystem(prompt, 1024, 0.1);
    const clean = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in LLM response");

    const plan = normalizePlannedSteps(userMessage, JSON.parse(match[0]));
    console.log("🧠 Agent plan:", JSON.stringify(plan, null, 2));
    return plan;
  } catch (err) {
    console.error("parseAgentIntent failed:", err.message);
    if (shouldUseConnectedDatabase(userMessage)) {
      return buildConnectedDatabasePlan(userMessage);
    }
    return { isAgentTask: false, confidence: 0, intent: "", steps: [] };
  }
}

module.exports = {
  parseAgentIntent,
  __test: {
    buildConnectedDatabasePlan,
    shouldUseConnectedDatabase,
    normalizePlannedSteps,
  },
};
