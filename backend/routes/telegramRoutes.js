/**
 * telegramRoutes.js
 * Mount: app.use('/api/telegram', require('./routes/telegramRoutes'))
 */

const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const tg = require("../services/tools/toolTelegramMTProto");

// ── AUTH ──────────────────────────────────────────────────────────────────────

// Step 1 — send code
router.post("/auth/phone", authenticate, async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber)
      return res.status(400).json({ error: "phoneNumber is required" });
    const result = await tg.sendPhoneCode(req.user?.username, phoneNumber);
    res.json(result);
  } catch (err) {
    console.error("TG auth/phone:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Step 2 — verify code
router.post("/auth/code", authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "code is required" });
    const result = await tg.verifyPhoneCode(req.user?.username, code);
    res.json(result); // { ok, needsPassword } or { ok, firstName, username, phone }
  } catch (err) {
    console.error("TG auth/code:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Step 3 — 2FA password
router.post("/auth/password", authenticate, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password)
      return res.status(400).json({ error: "password is required" });
    const result = await tg.verifyPassword(req.user?.username, password);
    res.json(result); // { ok, firstName, username, phone }
  } catch (err) {
    console.error("TG auth/password:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── SESSION ───────────────────────────────────────────────────────────────────

// GET /api/telegram/me  → { authorized: true/false, firstName, ... }
router.get("/me", authenticate, async (req, res) => {
  try {
    const userId = req.user?.username;
    const authorized = await tg.isAuthorized(userId);
    if (!authorized) return res.json({ authorized: false });
    const me = await tg.getMe(userId);
    res.json({ authorized: true, ...me });
  } catch (err) {
    res.json({ authorized: false });
  }
});

// DELETE /api/telegram/session  → logout
router.delete("/session", authenticate, async (req, res) => {
  try {
    await tg.logout(req.user?.username);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PROFILE PHOTOS ────────────────────────────────────────────────────────────

// GET /api/telegram/photo/:entityId  → { photo: "data:image/jpeg;base64,..." | null }
router.get("/photo/:entityId", authenticate, async (req, res) => {
  try {
    const photo = await tg.getProfilePhoto(
      req.user?.username,
      req.params.entityId
    );

    res.json({ photo: photo || null });
  } catch (err) {
    res.json({ photo: null });
  }
});

// ── DIALOGS ───────────────────────────────────────────────────────────────────

// GET /api/telegram/dialogs?limit=80
router.get("/dialogs", authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 80;
    const dialogs = await tg.getDialogs(req.user?.username, limit);
    res.json({ dialogs });
  } catch (err) {
    console.error("TG dialogs:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/telegram/dialogs/:id/messages?limit=50&offsetId=0
router.get("/dialogs/:id/messages", authenticate, async (req, res) => {
  try {
    const userId = req.user?.username;
    const dialogId = req.params.id;
    const limit = parseInt(req.query.limit) || 50;
    const offsetId = parseInt(req.query.offsetId) || 0;
    const messages = await tg.getMessages(userId, dialogId, limit, offsetId);
    res.json({ messages });
  } catch (err) {
    console.error("TG messages:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/telegram/dialogs/:id/send  { text: "hello" }
router.post("/dialogs/:id/send", authenticate, async (req, res) => {
  try {
    const userId = req.user?.username;
    const dialogId = req.params.id;
    const { text } = req.body;
    if (!text?.trim())
      return res.status(400).json({ error: "text is required" });
    const result = await tg.sendMessage(userId, dialogId, text);
    res.json(result);
  } catch (err) {
    console.error("TG send:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
