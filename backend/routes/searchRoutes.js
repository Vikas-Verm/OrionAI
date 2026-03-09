const express = require("express");
const router = express.Router();
const { webSearch } = require("../services/searchService");

router.post("/search", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query?.trim())
      return res.status(400).json({ error: "Query required" });
    const results = await webSearch(query);
    res.json({ results });
  } catch (e) {
    console.error("Search error:", e);
    res.status(500).json({ error: "Search failed" });
  }
});

module.exports = router;
