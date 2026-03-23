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

// ─────────────────────────────────────────────────────────────────────────────
// Load all enabled tools from Skill DB
// ─────────────────────────────────────────────────────────────────────────────
async function loadToolsFromDB() {
  const skills = await Skill.find({ enabled: true });

  return skills.map((s) => {
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

// ─────────────────────────────────────────────────────────────────────────────
// PARSE AGENT INTENT
// ─────────────────────────────────────────────────────────────────────────────
async function parseAgentIntent(userMessage, history = []) {
  try {
    const tools = await loadToolsFromDB();
    const toolsText = formatTools(tools);
    const now = new Date();
    const today = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const dayName = now.toLocaleDateString("en-US", { weekday: "long" });

    const prompt = [
      `You are an AI agent planner. Analyze the user request and decide which tools to call.`,
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
      `5. General questions, coding help, maths, or casual chat are NOT agent tasks.`,
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

    const plan = JSON.parse(match[0]);
    console.log("🧠 Agent plan:", JSON.stringify(plan, null, 2));
    return plan;
  } catch (err) {
    console.error("parseAgentIntent failed:", err.message);
    return { isAgentTask: false, confidence: 0, intent: "", steps: [] };
  }
}

module.exports = { parseAgentIntent };
