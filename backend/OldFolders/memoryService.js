const Memory = require("./memoryModel");

// Load memory for a user
async function loadMemory(userId) {
  const doc = await Memory.findOne({ userId });
  if (!doc) return "";
  return doc.memory;
}

// Save/update memory for a user
async function saveMemory(userId, memory) {
  await Memory.findOneAndUpdate(
    { userId },
    { memory, updatedAt: Date.now() },
    { upsert: true }
  );
}

module.exports = { loadMemory, saveMemory };
