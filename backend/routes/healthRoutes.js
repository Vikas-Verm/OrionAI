"use strict";

const express = require("express");
const router = express.Router();
const {
  checkUserIntegrations,
} = require("../services/integrationHealthService");

// GET /api/health/integrations — get all integration health statuses
router.get("/integrations", async (req, res) => {
  const userId = req.user?.username;
  try {
    const statuses = await checkUserIntegrations(userId);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json({ statuses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/health/integrations/check — force re-check all
router.post("/integrations/check", async (req, res) => {
  const userId = req.user?.username;
  try {
    const results = await checkUserIntegrations(userId);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
