"use strict";

const express = require("express");
const axios = require("axios");
const router = express.Router();
const { authenticate } = require("../middleware/auth");

router.use(authenticate);

const TENOR_BASE = "https://tenor.googleapis.com/v2";

function normalizeTenorResults(rawResults = []) {
  return rawResults
    .map((entry) => {
      const formats = entry?.media_formats || {};
      const preview =
        formats.tinygif?.url ||
        formats.nanogif?.url ||
        formats.gif?.url ||
        null;
      const full =
        formats.gif?.url ||
        formats.mediumgif?.url ||
        formats.tinygif?.url ||
        null;
      if (!preview || !full) return null;
      return {
        id: String(entry?.id || ""),
        title: String(entry?.content_description || entry?.title || "GIF"),
        preview,
        url: full,
        width: Number(formats.gif?.dims?.[0] || 0) || null,
        height: Number(formats.gif?.dims?.[1] || 0) || null,
      };
    })
    .filter(Boolean);
}

router.get("/search", async (req, res) => {
  const apiKey =
    process.env.TENOR_API_KEY ||
    process.env.TENOR_KEY ||
    process.env.GIPHY_API_KEY; // Reserved for future GIPHY support; not wired yet.

  if (!apiKey) {
    return res.json({
      ok: false,
      error:
        "GIF search is not configured. Add TENOR_API_KEY to backend/.env to enable it.",
      results: [],
    });
  }

  const q = String(req.query.q || "").trim();
  const limit = Math.max(1, Math.min(48, Number(req.query.limit) || 24));

  try {
    const endpoint = q ? `${TENOR_BASE}/search` : `${TENOR_BASE}/featured`;
    const params = {
      key: apiKey,
      limit,
      media_filter: "tinygif,nanogif,gif,mediumgif",
      contentfilter: "high", // Tenor's safe-mode filter.
      client_key: "orionai",
    };
    if (q) params.q = q;

    const response = await axios.get(endpoint, {
      params,
      timeout: 8000,
    });

    res.json({
      ok: true,
      results: normalizeTenorResults(response.data?.results || []),
    });
  } catch (err) {
    console.error("GIF search error:", err.message);
    res.status(502).json({
      ok: false,
      error:
        err.response?.data?.error?.message ||
        "GIF search failed. Try again or check the TENOR_API_KEY.",
      results: [],
    });
  }
});

module.exports = router;
