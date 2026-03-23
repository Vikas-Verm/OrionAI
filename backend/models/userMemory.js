// ════════════════════════════════════════════════════════════════════════════
// FILE 1: UserMemory.js
// 📁 backend/models/UserMemory.js
// ════════════════════════════════════════════════════════════════════════════

const mongoose = require("mongoose");

const MemoryFactSchema = new mongoose.Schema({
  key: { type: String, required: true }, // "team_lead", "company_name"
  value: { type: String, required: true }, // "Rahul", "ExcelTech"
  category: { type: String, default: "general" }, // "people" | "company" | "workflow" | "preferences" | "general"
  source: { type: String, default: "user_stated" }, // "user_stated" | "agent_inferred"
  confidence: { type: Number, default: 1.0 }, // 0-1
  lastUsedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

const UserMemorySchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },

  // Explicit facts the user has told OrionAI
  facts: [MemoryFactSchema],

  // User preferences
  preferences: {
    responseStyle: { type: String, default: "casual" }, // "formal" | "casual"
    timezone: { type: String, default: "Asia/Kolkata" },
    language: { type: String, default: "en" },
    primaryApps: { type: [String], default: [] },
  },

  // Recent context — last 20 agent actions for cross-session continuity
  recentContext: [
    {
      tool: String,
      summary: String,
      data: Object,
      timestamp: { type: Date, default: Date.now },
    },
  ],

  updatedAt: { type: Date, default: Date.now },
});

module.exports =
  mongoose.models.UserMemory || mongoose.model("UserMemory", UserMemorySchema);

// ════════════════════════════════════════════════════════════════════════════
// FILE 2: memoryService.js
// 📁 backend/services/memoryService.js
// ════════════════════════════════════════════════════════════════════════════

/**
 * Memory Service — manages what OrionAI remembers about each user.
 *
 * Used in 3 places:
 * 1. agentPlanner.js — inject memory into every agent system prompt
 * 2. agentController.js — extract and save new facts after each run
 * 3. memoryRoutes.js — let user view/edit/delete their memory
 */

("use strict");

const UserMemory = require("../models/userMemory");
const { chatCompleteNoSystem } = require("./llmService");

// ── Get or create user memory ─────────────────────────────────────────────
async function getMemory(userId) {
  let memory = await UserMemory.findOne({ userId });
  if (!memory) {
    memory = await UserMemory.create({ userId, facts: [], recentContext: [] });
  }
  return memory;
}

// ── Format memory as system prompt context ────────────────────────────────
// Called by agentPlanner before every agent run
async function getMemoryContext(userId) {
  try {
    const memory = await getMemory(userId);
    if (!memory.facts.length && !memory.recentContext.length) return "";

    const lines = [];

    // Add facts
    if (memory.facts.length > 0) {
      lines.push("## What I know about you:");
      for (const fact of memory.facts) {
        lines.push(`- ${fact.key}: ${fact.value}`);
        fact.lastUsedAt = new Date();
      }
      await memory.save();
    }

    // Add recent context (last 5 actions)
    const recent = memory.recentContext.slice(-5);
    if (recent.length > 0) {
      lines.push("\n## Recent actions:");
      for (const ctx of recent) {
        const ago = getTimeAgo(ctx.timestamp);
        lines.push(`- ${ago}: ${ctx.summary}`);
      }
    }

    // Add preferences
    const prefs = memory.preferences;
    if (prefs.responseStyle === "formal") {
      lines.push("\n## Preferences:\n- Use formal tone in all responses");
    }

    return lines.join("\n");
  } catch {
    return "";
  }
}

// ── Extract new facts from a user message ─────────────────────────────────
// Called after each agent run to learn from the conversation
async function extractAndSaveFacts(userId, userMessage, agentResults) {
  try {
    const prompt = `Extract any personal/business facts from this message that should be remembered for future conversations.
Only extract explicit facts stated by the user, not inferred facts.

User message: "${userMessage}"

Examples of facts to extract:
- "Rahul is my team lead" → {key: "team_lead", value: "Rahul", category: "people"}
- "My company is ExcelTech" → {key: "company_name", value: "ExcelTech", category: "company"}
- "Our sprint ends every Friday" → {key: "sprint_end_day", value: "Friday", category: "workflow"}
- "Always use formal tone" → {key: "response_style", value: "formal", category: "preferences"}
- "My Jira project is ENGG" → {key: "jira_project", value: "ENGG", category: "workflow"}

Reply ONLY with JSON array. Empty array [] if nothing to extract:
[{"key": "...", "value": "...", "category": "people|company|workflow|preferences|general"}]`;

    const raw = await chatCompleteNoSystem(prompt, 300, 0.1);
    const match = raw.replace(/```json|```/g, "").match(/\[[\s\S]*\]/);
    if (!match) return;

    const newFacts = JSON.parse(match[0]);
    if (!newFacts.length) return;

    const memory = await getMemory(userId);

    for (const fact of newFacts) {
      if (!fact.key || !fact.value) continue;

      // Handle special preference facts
      if (fact.key === "response_style") {
        memory.preferences.responseStyle = fact.value
          .toLowerCase()
          .includes("formal")
          ? "formal"
          : "casual";
        continue;
      }

      // Upsert: update if key exists, add if new
      const existing = memory.facts.find((f) => f.key === fact.key);
      if (existing) {
        existing.value = fact.value;
        existing.source = "user_stated";
        existing.confidence = 1.0;
        existing.lastUsedAt = new Date();
      } else {
        memory.facts.push({
          key: fact.key,
          value: fact.value,
          category: fact.category || "general",
          source: "user_stated",
          confidence: 1.0,
        });
      }
    }

    memory.updatedAt = new Date();
    await memory.save();

    if (newFacts.length > 0) {
      console.log(`🧠 Memory: saved ${newFacts.length} fact(s) for ${userId}`);
    }
  } catch (err) {
    console.error("extractAndSaveFacts error:", err.message);
  }
}

// ── Save recent context (what the agent just did) ─────────────────────────
async function saveRecentContext(userId, tool, summary, data = {}) {
  try {
    const memory = await getMemory(userId);

    memory.recentContext.push({
      tool,
      summary,
      data,
      timestamp: new Date(),
    });

    // Keep only last 20
    if (memory.recentContext.length > 20) {
      memory.recentContext = memory.recentContext.slice(-20);
    }

    memory.updatedAt = new Date();
    await memory.save();
  } catch {}
}

// ── Manually add a fact ───────────────────────────────────────────────────
async function addFact(userId, key, value, category = "general") {
  const memory = await getMemory(userId);
  const existing = memory.facts.find((f) => f.key === key);

  if (existing) {
    existing.value = value;
    existing.lastUsedAt = new Date();
  } else {
    memory.facts.push({
      key,
      value,
      category,
      source: "user_stated",
      confidence: 1.0,
    });
  }

  memory.updatedAt = new Date();
  await memory.save();
  return memory;
}

// ── Delete a fact ─────────────────────────────────────────────────────────
async function deleteFact(userId, key) {
  const memory = await getMemory(userId);
  memory.facts = memory.facts.filter((f) => f.key !== key);
  memory.updatedAt = new Date();
  await memory.save();
  return memory;
}

// ── Clear all memory ──────────────────────────────────────────────────────
async function clearMemory(userId) {
  await UserMemory.findOneAndUpdate(
    { userId },
    { $set: { facts: [], recentContext: [], updatedAt: new Date() } }
  );
}

// ── Helper: human-readable time ago ──────────────────────────────────────
function getTimeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

module.exports = {
  getMemory,
  getMemoryContext,
  extractAndSaveFacts,
  saveRecentContext,
  addFact,
  deleteFact,
  clearMemory,
};
