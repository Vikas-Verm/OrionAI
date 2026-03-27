"use strict";

const { getCommunicationActionStates } = require("../services/communicationActionService");

async function getActionStates(req, res) {
  try {
    const userId = req.user?.username;
    const source = req.query.source || "all";
    const payload = await getCommunicationActionStates(userId, { source });
    res.json(payload);
  } catch (err) {
    console.error("Communication action states error:", err.message);
    res.status(500).json({ error: "Could not load communication action states" });
  }
}

module.exports = {
  getActionStates,
};
