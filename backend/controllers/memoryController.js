const { loadMemory } = require("../services/memoryService");

async function getMemory(req, res) {
  const memory = await loadMemory(req.params.userId);
  res.json({ userId: req.params.userId, memory });
}

module.exports = { getMemory };
