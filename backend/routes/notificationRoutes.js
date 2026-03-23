/**
 * notificationRoutes.js
 * 📁 backend/routes/notificationRoutes.js
 *
 * REST fallback for initial badge load on page open.
 * Real-time updates go through WebSocket (/ws).
 */

const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { getUnread } = require("../controllers/notificationController");

// GET /api/notifications/unread
// Called once on page load to populate badges immediately
// After that, WebSocket takes over for real-time updates
router.get("/unread", authenticate, getUnread);

module.exports = router;
