/**
 * telegramRoutes.js
 * Mount: app.use('/api/telegram', require('./routes/telegramRoutes'))
 */
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const tg = require("../services/tools/toolTelegramMTProto");

// ── AUTH ──────────────────────────────────────────────────────────────
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

router.post("/auth/code", authenticate, async (req, res) => {
  try {
    const { code, phoneNumber, phoneCodeHash, pendingAuthToken } = req.body;
    if (!code) return res.status(400).json({ error: "code is required" });
    const result = await tg.verifyPhoneCode(req.user?.username, code, {
      phoneNumber,
      phoneCodeHash,
      pendingAuthToken,
    });
    res.json(result);
  } catch (err) {
    console.error("TG auth/code:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/auth/password", authenticate, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password)
      return res.status(400).json({ error: "password is required" });
    const result = await tg.verifyPassword(req.user?.username, password);
    res.json(result);
  } catch (err) {
    console.error("TG auth/password:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── SESSION ───────────────────────────────────────────────────────────
router.get("/me", authenticate, async (req, res) => {
  try {
    const userId = req.user?.username;
    const authorized = await tg.isAuthorized(userId);
    if (!authorized) return res.json({ authorized: false });
    const me = await tg.getMe(userId);
    res.json({ authorized: true, ...me });
  } catch {
    res.json({ authorized: false });
  }
});

router.delete("/session", authenticate, async (req, res) => {
  try {
    await tg.logout(req.user?.username);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PROFILE PHOTOS ────────────────────────────────────────────────────
router.get("/photo/:entityId", authenticate, async (req, res) => {
  try {
    const photo = await tg.getProfilePhoto(
      req.user?.username,
      req.params.entityId
    );
    res.json({ photo: photo || null });
  } catch {
    res.json({ photo: null });
  }
});

// ── DIALOGS ───────────────────────────────────────────────────────────
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

router.post("/dialogs/:id/send", authenticate, async (req, res) => {
  try {
    const userId = req.user?.username;
    const dialogId = req.params.id;
    const { text } = req.body;
    if (!text?.trim())
      return res.status(400).json({ error: "text is required" });
    const { replyToMsgId } = req.body;
    const result = await tg.sendMessage(userId, dialogId, text, replyToMsgId);
    res.json(result);
  } catch (err) {
    console.error("TG send:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── FILE UPLOAD ────────────────────────────────────────────────────────
// POST /api/telegram/dialogs/:id/upload
// Accepts JSON: { fileName, mimeType, base64, caption? }
router.post("/dialogs/:id/upload", authenticate, async (req, res) => {
  const userId = req.user?.username;
  const dialogId = req.params.id;
  try {
    const { fileName, mimeType, base64, caption } = req.body;
    if (!base64 || !fileName) {
      return res.status(400).json({ error: "fileName and base64 required" });
    }

    const buffer = Buffer.from(base64, "base64");
    const result = await tg.sendFile(
      userId,
      dialogId,
      buffer,
      fileName,
      mimeType || "application/octet-stream",
      caption || ""
    );
    res.json({ ok: true, messageId: result?.messageId });
  } catch (err) {
    console.error("TG upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── MARK AS READ ──────────────────────────────────────────────────────
// POST /api/telegram/dialogs/:id/read
router.post("/dialogs/:id/read", authenticate, async (req, res) => {
  try {
    await tg.markAsRead(req.user?.username, req.params.id);
    const { refreshUsersSignals } = require("../services/liveSignalRefresh");
    refreshUsersSignals([req.user?.username]).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false }); // non-fatal
  }
});

// ── MEDIA DOWNLOAD ────────────────────────────────────────────────────
// GET /api/telegram/media/:dialogId/:msgId
// Returns { data: "data:image/jpeg;base64,...", mime, fileName }
router.get("/media/:dialogId/:msgId", authenticate, async (req, res) => {
  try {
    const result = await tg.downloadMedia(
      req.user?.username,
      req.params.dialogId,
      req.params.msgId
    );
    res.json(result);
  } catch (err) {
    console.error("TG media:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── EDIT MESSAGE ──────────────────────────────────────────────────────
// POST /api/telegram/dialogs/:id/messages/:msgId/edit  { text }
router.post(
  "/dialogs/:id/messages/:msgId/edit",
  authenticate,
  async (req, res) => {
    try {
      const { text } = req.body;
      if (!text?.trim())
        return res.status(400).json({ error: "text is required" });
      const result = await tg.editMessage(
        req.user?.username,
        req.params.id,
        req.params.msgId,
        text
      );
      res.json(result);
    } catch (err) {
      console.error("TG edit msg:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// ── DELETE MESSAGE ────────────────────────────────────────────────────
// DELETE /api/telegram/dialogs/:id/messages/:msgId
router.delete(
  "/dialogs/:id/messages/:msgId",
  authenticate,
  async (req, res) => {
    try {
      const result = await tg.deleteMessage(
        req.user?.username,
        req.params.id,
        req.params.msgId
      );
      res.json(result);
    } catch (err) {
      console.error("TG delete msg:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// ── REACTIONS ─────────────────────────────────────────────────────────
// POST /api/telegram/dialogs/:id/messages/:msgId/react  { emoticon: "👍" }
router.post(
  "/dialogs/:id/messages/:msgId/react",
  authenticate,
  async (req, res) => {
    try {
      const { emoticon } = req.body;
      const result = await tg.sendReaction(
        req.user?.username,
        req.params.id,
        req.params.msgId,
        emoticon || ""
      );
      res.json(result);
    } catch (err) {
      console.error("TG react:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// ── CONTACTS ──────────────────────────────────────────────────────────
router.get("/contacts", authenticate, async (req, res) => {
  try {
    const contacts = await tg.getContacts(req.user?.username);
    res.json({ contacts });
  } catch (err) {
    console.error("TG contacts:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── SAVED MESSAGES ────────────────────────────────────────────────────
router.get("/saved-messages", authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const messages = await tg.getSavedMessages(req.user?.username, limit);
    res.json({ messages });
  } catch (err) {
    console.error("TG saved-messages:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
