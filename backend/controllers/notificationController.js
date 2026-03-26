/**
 * notificationController.js
 * 📁 backend/controllers/notificationController.js
 *
 * GET /api/notifications/unread
 * Returns unread counts + AI-summarized previews for all connected apps.
 * Called by the frontend every 60 seconds via useNotifications.js
 */

"use strict";

const { getUnreadSignals } = require("../services/inboxSignalsService");

// ── GET /api/notifications/unread ─────────────────────────────────────────
async function getUnread(req, res) {
  const userId = req.user?.username;
  const results = await getUnreadSignals(userId);

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  // Total unread across all apps
  const total = Object.values(results).reduce(
    (sum, r) => sum + (r?.count || 0),
    0
  );

  res.json({ total, apps: results });
}

module.exports = { getUnread };
