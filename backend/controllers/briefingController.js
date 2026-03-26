"use strict";

const { getMorningBriefing } = require("../services/briefingService");

async function getBriefing(req, res) {
  try {
    const userId = req.user?.username;
    const briefing = await getMorningBriefing(userId);
    res.json(briefing);
  } catch (err) {
    console.error("Briefing error:", err.message);
    res.status(500).json({ error: "Could not load briefing" });
  }
}

module.exports = {
  getBriefing,
};
