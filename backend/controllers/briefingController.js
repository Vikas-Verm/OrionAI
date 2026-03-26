"use strict";

const { getMorningBriefing } = require("../services/briefingService");
const {
  getHomeDashboard,
  recordPriorityFeedAction,
} = require("../services/priorityFeedService");

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

async function getHome(req, res) {
  try {
    const userId = req.user?.username;
    const dashboard = await getHomeDashboard(userId);
    res.json(dashboard);
  } catch (err) {
    console.error("Home briefing error:", err.message);
    res.status(500).json({ error: "Could not load home dashboard" });
  }
}

async function postPriorityFeedAction(req, res) {
  try {
    const userId = req.user?.username;
    const entry = await recordPriorityFeedAction(userId, req.body || {});
    res.json({ success: true, entry });
  } catch (err) {
    console.error("Priority feed action error:", err.message);
    res.status(400).json({ error: err.message || "Could not record action" });
  }
}

module.exports = {
  getBriefing,
  getHome,
  postPriorityFeedAction,
};
