/**
 * whatsappRoutes.js
 * 📁 backend/routes/whatsappRoutes.js
 *
 * Register in app.js:
 *   const whatsappRoutes = require('./routes/whatsappRoutes')
 *   app.use('/api/whatsapp', whatsappRoutes)
 */

"use strict";

const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { toolWhatsApp } = require("../services/tools/toolWhatsapp");
const qrcode = require("qrcode");

// ── POST /api/whatsapp/connect ────────────────────────────────────────────────
router.post("/connect", authenticate, async (req, res) => {
  const userId = req.user?.username;
  try {
    const result = await toolWhatsApp({ action: "connect" }, { userId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/whatsapp/status ──────────────────────────────────────────────────
router.get("/status", authenticate, async (req, res) => {
  const userId = req.user?.username;
  try {
    const result = await toolWhatsApp({ action: "status" }, { userId });

    // Convert QR string to data URL image so frontend can render it
    if (result.qr) {
      result.qrImage = await qrcode.toDataURL(result.qr);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/disconnect ─────────────────────────────────────────────
router.post("/disconnect", authenticate, async (req, res) => {
  const userId = req.user?.username;
  try {
    const result = await toolWhatsApp({ action: "disconnect" }, { userId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/send ───────────────────────────────────────────────────
router.post("/send", authenticate, async (req, res) => {
  const userId = req.user?.username;
  const { to, message } = req.body;
  try {
    const result = await toolWhatsApp(
      { action: "send", to, message },
      { userId }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/whatsapp/chats ───────────────────────────────────────────────────
router.get("/chats", authenticate, async (req, res) => {
  const userId = req.user?.username;
  try {
    const result = await toolWhatsApp({ action: "list_chats" }, { userId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/whatsapp/unread ──────────────────────────────────────────────────
router.get("/unread", authenticate, async (req, res) => {
  const userId = req.user?.username;
  try {
    const result = await toolWhatsApp({ action: "get_unread" }, { userId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/messages", authenticate, async (req, res) => {
  const userId = req.user?.username;
  const { chatId, limit = 30 } = req.body;
  try {
    const result = await toolWhatsApp(
      { action: "get_messages", contact: chatId, limit },
      { userId }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
