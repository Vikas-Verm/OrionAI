const Memory = require("../models/memory");

let userMemoryCompat = {};
try {
  userMemoryCompat = require("../models/userMemory");
} catch {
  userMemoryCompat = {};
}

async function loadMemory(userId) {
  const doc = await Memory.findOne({ userId });
  if (!doc) return "";
  return doc.memory;
}

async function saveMemory(userId, memory) {
  await Memory.findOneAndUpdate(
    { userId },
    { memory, updatedAt: Date.now() },
    { upsert: true }
  );
}

async function getMemoryContext(userId) {
  if (typeof userMemoryCompat.getMemoryContext === "function") {
    try {
      const richContext = await userMemoryCompat.getMemoryContext(userId);
      if (richContext) return richContext;
    } catch {}
  }

  const memory = await loadMemory(userId);
  return memory ? `## Context from previous sessions:\n${memory}` : "";
}

async function extractAndSaveFacts(...args) {
  if (typeof userMemoryCompat.extractAndSaveFacts === "function") {
    return userMemoryCompat.extractAndSaveFacts(...args);
  }
}

async function saveRecentContext(...args) {
  if (typeof userMemoryCompat.saveRecentContext === "function") {
    return userMemoryCompat.saveRecentContext(...args);
  }
}

module.exports = {
  loadMemory,
  saveMemory,
  getMemoryContext,
  extractAndSaveFacts,
  saveRecentContext,
};
