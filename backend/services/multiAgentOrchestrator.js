/**
 * multiAgentOrchestrator.js
 * 📁 backend/services/multiAgentOrchestrator.js
 *
 * Enables agents to collaborate on complex tasks.
 *
 * How it works:
 * 1. User sends complex request
 * 2. Orchestrator Agent breaks it into sub-tasks
 * 3. Each sub-task runs as its own agent
 * 4. Results flow back and get combined
 *
 * Example:
 *   "Summarize what happened in all my apps today and send me a digest"
 *     → Agent 1: Get Slack unread
 *     → Agent 2: Get Gmail unread
 *     → Agent 3: Get Telegram unread
 *     → Agent 4: Get today's calendar
 *     → Orchestrator: Combine + AI summarize → send to Telegram
 */

"use strict";

const { chatCompleteNoSystem } = require("./llmService");
const { runAgent } = require("./agentService");
const Skill = require("../models/skill");

// ─────────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR — decides whether to use multi-agent or single-agent
// ─────────────────────────────────────────────────────────────────────────────
async function orchestrate(userMessage, userId, db, onProgress) {
  // First check if this needs multi-agent (complex cross-app task)
  const plan = await planOrchestration(userMessage);

  if (!plan.needsMultiAgent || plan.agents.length <= 1) {
    // Simple task — use regular single agent
    return null; // caller falls back to normal agentPlanner
  }

  console.log(
    `🤖 Multi-agent: ${plan.agents.length} agents for "${plan.intent}"`
  );

  onProgress({
    tool: "orchestrator",
    status: "running",
    label: "Orchestrating agents",
    icon: "🤖",
  });

  const agentResults = {};

  // Run each sub-agent (some in parallel, some sequential)
  const parallelAgents = plan.agents.filter((a) => !a.dependsOn);
  const sequentialAgents = plan.agents.filter((a) => a.dependsOn);

  // ── Run parallel agents simultaneously ───────────────────────────────────
  await Promise.allSettled(
    parallelAgents.map(async (agentPlan) => {
      onProgress({
        tool: agentPlan.agentId,
        status: "running",
        label: agentPlan.label,
        icon: agentPlan.icon || "⚙️",
      });

      try {
        const results = await runAgent(
          agentPlan.steps,
          db,
          () => {}, // sub-agent progress is silent
          userId
        );
        agentResults[agentPlan.agentId] = {
          ok: true,
          results,
          summary: results
            .map((r) => r.result?.summary || "")
            .filter(Boolean)
            .join(". "),
        };
        onProgress({
          tool: agentPlan.agentId,
          status: "done",
          label: agentPlan.label,
          icon: agentPlan.icon || "⚙️",
          summary: agentResults[agentPlan.agentId].summary,
          result: agentResults[agentPlan.agentId],
        });
      } catch (err) {
        agentResults[agentPlan.agentId] = { ok: false, error: err.message };
        onProgress({
          tool: agentPlan.agentId,
          status: "error",
          error: err.message,
        });
      }
    })
  );

  // ── Run sequential agents (depend on previous results) ───────────────────
  for (const agentPlan of sequentialAgents) {
    const dep = agentResults[agentPlan.dependsOn];
    if (!dep?.ok) continue;

    // Inject previous results into this agent's params
    const resolvedSteps = resolveAgentContext(agentPlan.steps, agentResults);

    onProgress({
      tool: agentPlan.agentId,
      status: "running",
      label: agentPlan.label,
      icon: agentPlan.icon || "⚙️",
    });

    try {
      const results = await runAgent(resolvedSteps, db, () => {}, userId);
      agentResults[agentPlan.agentId] = {
        ok: true,
        results,
        summary: results
          .map((r) => r.result?.summary || "")
          .filter(Boolean)
          .join(". "),
      };
      onProgress({
        tool: agentPlan.agentId,
        status: "done",
        label: agentPlan.label,
        icon: agentPlan.icon || "⚙️",
        summary: agentResults[agentPlan.agentId].summary,
      });
    } catch (err) {
      agentResults[agentPlan.agentId] = { ok: false, error: err.message };
      onProgress({
        tool: agentPlan.agentId,
        status: "error",
        error: err.message,
      });
    }
  }

  // ── Final synthesis ───────────────────────────────────────────────────────
  const finalSummary = await synthesize(plan.intent, agentResults);

  onProgress({
    tool: "orchestrator",
    status: "done",
    label: "Orchestrating agents",
    icon: "🤖",
    summary: finalSummary,
    result: { summary: finalSummary, agentResults },
  });

  return { summary: finalSummary, agentResults };
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAN ORCHESTRATION — decide which agents to run
// ─────────────────────────────────────────────────────────────────────────────
async function planOrchestration(userMessage) {
  const prompt = [
    `You are an orchestration planner. Decide if this task needs MULTIPLE agents running in parallel.`,
    ``,
    `Multi-agent is needed when the task requires:`,
    `- Reading from multiple apps simultaneously (Slack + Gmail + Telegram + Calendar)`,
    `- Creating something in one app then notifying in multiple others`,
    `- Complex workflows with 4+ steps across different systems`,
    ``,
    `USER REQUEST: "${userMessage}"`,
    ``,
    `Reply with ONLY valid JSON:`,
    `{`,
    `  "needsMultiAgent": true/false,`,
    `  "intent": "brief description",`,
    `  "agents": [`,
    `    {`,
    `      "agentId": "unique_id",`,
    `      "label": "Human readable label",`,
    `      "icon": "emoji",`,
    `      "dependsOn": null or "agentId_of_dependency",`,
    `      "steps": [{"tool": "tool_name", "params": {}}]`,
    `    }`,
    `  ]`,
    `}`,
    ``,
    `If needsMultiAgent is false, return: {"needsMultiAgent":false,"intent":"","agents":[]}`,
  ].join("\n");

  try {
    const raw = await chatCompleteNoSystem(prompt, 1500, 0.1);
    const match = raw.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
    if (!match) return { needsMultiAgent: false, agents: [] };
    return JSON.parse(match[0]);
  } catch {
    return { needsMultiAgent: false, agents: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLVE TEMPLATES — inject previous agent results into next agent params
// ─────────────────────────────────────────────────────────────────────────────
function resolveAgentContext(steps, agentResults) {
  const context = {};

  // Build context from all previous results
  for (const [agentId, agentResult] of Object.entries(agentResults)) {
    if (!agentResult.ok) continue;
    for (const r of agentResult.results || []) {
      if (r.result?.key) context.ticketKey = r.result.key;
      if (r.result?.summary) context[`${agentId}_summary`] = r.result.summary;
    }
  }

  // Resolve {{variable}} templates in step params
  return steps.map((step) => ({
    ...step,
    params: Object.fromEntries(
      Object.entries(step.params || {}).map(([k, v]) => [
        k,
        typeof v === "string"
          ? v.replace(
              /\{\{(\w+)\}\}/g,
              (_, key) => context[key] ?? `{{${key}}}`
            )
          : v,
      ])
    ),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHESIZE — AI combines all agent results into a final response
// ─────────────────────────────────────────────────────────────────────────────
async function synthesize(intent, agentResults) {
  const summaries = Object.entries(agentResults)
    .filter(([, r]) => r.ok && r.summary)
    .map(([id, r]) => `${id}: ${r.summary}`)
    .join("\n");

  if (!summaries) return "All tasks completed.";

  try {
    const prompt =
      `Synthesize these agent results into one clear, friendly summary (max 3 sentences):\n\n` +
      `Original intent: ${intent}\n\n` +
      `Results:\n${summaries}`;
    return await chatCompleteNoSystem(prompt, 200, 0.3);
  } catch {
    return summaries;
  }
}

module.exports = { orchestrate };
