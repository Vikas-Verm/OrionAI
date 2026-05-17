"use strict";

const express = require("express");
const multer = require("multer");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const Integration = require("../models/Integration");
const {
  connectWhatsAppIntegration,
  getWhatsAppStatus,
  listWhatsAppChats,
  getWhatsAppRoomTimeline,
  getWhatsAppRoomHistory,
  sendWhatsAppMessage,
  uploadWhatsAppMedia,
  markWhatsAppRoomAsRead,
  redactWhatsAppMessage,
  deleteWhatsAppChat,
  fetchWhatsAppMedia,
  getWhatsAppUnreadSummary,
  invalidateWhatsAppCache,
  syncWhatsAppContacts,
} = require("../services/whatsappMatrixService");

router.use(authenticate);

const whatsappUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post("/connect", async (req, res) => {
  try {
    const result = await connectWhatsAppIntegration(
      req.user?.username,
      req.body || {}
    );
    res.json({
      ok: true,
      integration: result.clientIntegration || result.integration || null,
      status: result.status || null,
    });
  } catch (err) {
    console.error("WhatsApp connect error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get("/status", async (req, res) => {
  try {
    const status = await getWhatsAppStatus(req.user?.username);
    res.json({
      ...status,
      status: status.connected
        ? "connected"
        : status.loginState || "disconnected",
      qrImage: status.qrImageUrl || null,
    });
  } catch (err) {
    console.error("WhatsApp status error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/disconnect", async (req, res) => {
  try {
    await Integration.findOneAndDelete({
      userId: req.user?.username,
      type: "whatsapp",
    });
    invalidateWhatsAppCache(req.user?.username);
    res.json({ ok: true });
  } catch (err) {
    console.error("WhatsApp disconnect error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/chats", async (req, res) => {
  try {
    const chats = await listWhatsAppChats(req.user?.username, {
      search: req.query.search || "",
      limit: Number(req.query.limit || 100),
    });
    res.json({ chats });
  } catch (err) {
    console.error("WhatsApp chats error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// One-click "Sync contacts" — sends `sync contacts` to the bridge
// management room so the bridge re-pulls the address book into its local
// SQLite. This populates whatsmeow_contacts.full_name for chats that were
// still showing as phone numbers.
router.post("/sync-contacts", async (req, res) => {
  try {
    const result = await syncWhatsAppContacts(req.user?.username);
    res.json({
      ok: true,
      roomId: result?.roomId || null,
      eventId: result?.eventId || null,
      message:
        "Contact sync requested. Names usually update within 5–30 seconds.",
    });
  } catch (err) {
    console.error("WhatsApp sync-contacts error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get("/unread", async (req, res) => {
  try {
    const result = await getWhatsAppUnreadSummary(req.user?.username);
    res.json({
      ok: true,
      totalUnread: Number(result?.count || 0),
      chatCount: Array.isArray(result?.chats) ? result.chats.length : 0,
      chats: result?.chats || [],
      previews: result?.previews || [],
      summary: result?.summary || null,
    });
  } catch (err) {
    console.error("WhatsApp unread error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/rooms/:roomId/messages", async (req, res) => {
  try {
    const from = String(req.query.from || "").trim();
    const result = from
      ? await getWhatsAppRoomHistory(req.user?.username, req.params.roomId, {
          from,
          limit: Number(req.query.limit || 60),
        })
      : await getWhatsAppRoomTimeline(req.user?.username, req.params.roomId, {
          limit: Number(req.query.limit || 60),
        });
    res.json(result);
  } catch (err) {
    console.error("WhatsApp room messages error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post("/messages", async (req, res) => {
  try {
    const roomRef =
      req.body?.chatId || req.body?.roomId || req.body?.contact || "";
    const result = await getWhatsAppRoomTimeline(req.user?.username, roomRef, {
      limit: Number(req.body?.limit || 30),
    });
    res.json({
      ok: true,
      room: result.room,
      chatId: result.room?.roomId || roomRef,
      chatName: result.room?.title || result.room?.name || "",
      messages: result.messages || [],
      prevBatch: result.prevBatch || null,
    });
  } catch (err) {
    console.error("WhatsApp messages error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post("/send", async (req, res) => {
  try {
    const roomRef = req.body?.to || req.body?.chatId || req.body?.roomId || "";
    const text = req.body?.message || req.body?.text || "";
    const result = await sendWhatsAppMessage(
      req.user?.username,
      roomRef,
      text,
      {
        replyToEventId: req.body?.replyToEventId || null,
      }
    );
    res.json({
      ok: true,
      chatId: result.roomId,
      roomId: result.roomId,
      msgId: result.eventId,
      eventId: result.eventId,
      to: roomRef,
      message: text,
    });
  } catch (err) {
    console.error("WhatsApp send error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post("/rooms/:roomId/send", async (req, res) => {
  try {
    const result = await sendWhatsAppMessage(
      req.user?.username,
      req.params.roomId,
      req.body?.text || "",
      {
        replyToEventId: req.body?.replyToEventId || null,
      }
    );
    res.json(result);
  } catch (err) {
    console.error("WhatsApp room send error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post(
  "/rooms/:roomId/upload",
  whatsappUpload.single("file"),
  async (req, res) => {
    try {
      const { base64, fileName, mimeType, caption, replyToEventId } =
        req.body || {};
      const uploadedFile = req.file || null;
      const normalizedFileName =
        String(uploadedFile?.originalname || fileName || "").trim() || "";
      const normalizedMimeType =
        String(
          uploadedFile?.mimetype || mimeType || "application/octet-stream"
        ).trim() || "application/octet-stream";

      const buffer = Buffer.isBuffer(uploadedFile?.buffer)
        ? uploadedFile.buffer
        : base64
        ? Buffer.from(String(base64), "base64")
        : null;

      if (!buffer || !normalizedFileName) {
        return res.status(400).json({ error: "file upload is required" });
      }

      const result = await uploadWhatsAppMedia(
        req.user?.username,
        req.params.roomId,
        buffer,
        normalizedFileName,
        normalizedMimeType,
        {
          caption: caption || "",
          replyToEventId: replyToEventId || null,
        }
      );
      res.json(result);
    } catch (err) {
      console.error("WhatsApp upload error:", err.message);
      res.status(400).json({ error: err.message });
    }
  }
);

// Delete a single message. The Matrix redaction propagates through the
// mautrix-whatsapp bridge as WhatsApp's "Delete for everyone" — the
// recipient sees "This message was deleted" in their WhatsApp.
router.post("/rooms/:roomId/messages/:eventId/redact", async (req, res) => {
  try {
    const result = await redactWhatsAppMessage(
      req.user?.username,
      req.params.roomId,
      req.params.eventId,
      req.body?.reason || ""
    );
    res.json(result);
  } catch (err) {
    console.error("WhatsApp redact error:", err.message);
    res.status(err?.response?.status === 403 ? 403 : 400).json({
      error:
        err?.response?.status === 403
          ? "You don't have permission to delete that message."
          : err.message,
    });
  }
});

// Delete the whole chat for this user — matches WhatsApp's local "Delete
// chat" semantic. Removes the Matrix portal from our view; the other party
// keeps their copy of the chat.
router.delete("/rooms/:roomId", async (req, res) => {
  try {
    const result = await deleteWhatsAppChat(
      req.user?.username,
      req.params.roomId
    );
    res.json(result);
  } catch (err) {
    console.error("WhatsApp delete-chat error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post("/rooms/:roomId/read", async (req, res) => {
  try {
    const result = await markWhatsAppRoomAsRead(
      req.user?.username,
      req.params.roomId,
      req.body?.eventId || ""
    );
    res.json(result);
  } catch (err) {
    console.error("WhatsApp read marker error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

router.get("/media", async (req, res) => {
  try {
    const mxc = String(req.query.mxc || "").trim();
    const thumbnail = String(req.query.thumbnail || "").trim() === "1";
    const media = await fetchWhatsAppMedia(req.user?.username, mxc, {
      thumbnail,
    });
    res.setHeader(
      "Content-Type",
      media.contentType || "application/octet-stream"
    );
    if (media.contentDisposition) {
      res.setHeader("Content-Disposition", media.contentDisposition);
    }
    res.send(media.body);
  } catch (err) {
    console.error("WhatsApp media proxy error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
