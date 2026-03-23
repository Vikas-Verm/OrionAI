const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const {
  getMemory,
  addFact,
  deleteFact,
  clearMemory,
} = require("../services/memoryService");

// GET /api/memory — get all user memory
router.get("/", authenticate, async (req, res) => {
  const userId = req.user?.username;
  try {
    const memory = await getMemory(userId);
    res.json({
      facts: memory.facts || [],
      preferences: memory.preferences || {},
      recentContext: memory.recentContext?.slice(-10) || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/memory/fact — add/update a fact
router.post("/fact", authenticate, async (req, res) => {
  const userId = req.user?.username;
  const { key, value, category } = req.body;
  if (!key || !value)
    return res.status(400).json({ error: "key and value required" });
  try {
    const memory = await addFact(userId, key, value, category);
    res.json({ ok: true, facts: memory.facts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/memory/fact/:key — delete a specific fact
router.delete("/fact/:key", authenticate, async (req, res) => {
  const userId = req.user?.username;
  try {
    const memory = await deleteFact(userId, req.params.key);
    res.json({ ok: true, facts: memory.facts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/memory — clear all memory
router.delete("/", authenticate, async (req, res) => {
  const userId = req.user?.username;
  try {
    await clearMemory(userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/memory/preferences — update preferences
router.post("/preferences", authenticate, async (req, res) => {
  const userId = req.user?.username;
  try {
    const UserMemory = require("../models/userMemory");
    const memory = await UserMemory.findOneAndUpdate(
      { userId },
      { $set: { preferences: req.body, updatedAt: new Date() } },
      { upsert: true, new: true }
    );
    res.json({ ok: true, preferences: memory.preferences });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
