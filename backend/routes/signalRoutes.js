"use strict";

const express = require("express");
const router = express.Router();
const multer = require("multer");
const { authenticate } = require("../middleware/auth");
const Integration = require("../models/Integration");
const {
  connectSignalIntegration,
  getSignalStatus,
  listSignalRooms,
  getSignalRoomTimeline,
  getSignalRoomHistory,
  sendSignalMessage,
  uploadSignalMedia,
  editSignalMessage,
  deleteSignalMessage,
  toggleSignalReaction,
  markSignalRoomAsRead,
  sendBridgeCommand,
  fetchSignalMedia,
  invalidateSignalCache,
} = require("../services/signalMatrixService");

router.use(authenticate);

const signalUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function refreshUserSignalsSoon(userId) {
  try {
    const { refreshUsersSignals } = require("../services/liveSignalRefresh");
    refreshUsersSignals([userId]).catch(() => {});
  } catch {}
}

router.post("/connect", async (req, res) => {
  try {
    const result = await connectSignalIntegration(req.user?.username, req.body || {});
    res.json({
      ok: true,
      integration: result.clientIntegration || result.integration || null,
      status: result.status || null,
    });
  } catch (err) {
    console.error("Signal connect error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get("/status", async (req, res) => {
  try {
    const status = await getSignalStatus(req.user?.username);
    res.json(status);
  } catch (err) {
    console.error("Signal status error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/disconnect", async (req, res) => {
  try {
    await Integration.findOneAndDelete({
      userId: req.user?.username,
      type: "signal",
    });
    invalidateSignalCache(req.user?.username);
    res.json({ ok: true });
  } catch (err) {
    console.error("Signal disconnect error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/rooms", async (req, res) => {
  try {
    const rooms = await listSignalRooms(req.user?.username, {
      search: req.query.search || "",
      limit: Number(req.query.limit || 80),
    });
    res.json({ rooms });
  } catch (err) {
    console.error("Signal rooms error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/rooms/:roomId/messages", async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const limit = Number(req.query.limit || 50);
    const from = String(req.query.from || "").trim();
    const result = from
      ? await getSignalRoomHistory(req.user?.username, roomId, { from, limit })
      : await getSignalRoomTimeline(req.user?.username, roomId, { limit });
    res.json(result);
  } catch (err) {
    console.error("Signal messages error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/rooms/:roomId/send", async (req, res) => {
  try {
    const result = await sendSignalMessage(
      req.user?.username,
      req.params.roomId,
      req.body?.text || "",
      { replyToEventId: req.body?.replyToEventId || null }
    );
    refreshUserSignalsSoon(req.user?.username);
    res.json(result);
  } catch (err) {
    console.error("Signal send error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post("/rooms/:roomId/upload", signalUpload.single("file"), async (req, res) => {
  try {
    const { base64, fileName, mimeType, caption, replyToEventId } = req.body || {};
    const uploadedFile = req.file || null;
    const normalizedFileName =
      String(uploadedFile?.originalname || fileName || "").trim() || "";
    const normalizedMimeType =
      String(uploadedFile?.mimetype || mimeType || "application/octet-stream").trim() ||
      "application/octet-stream";

    const buffer = Buffer.isBuffer(uploadedFile?.buffer)
      ? uploadedFile.buffer
      : base64
        ? Buffer.from(String(base64), "base64")
        : null;

    if (!buffer || !normalizedFileName) {
      return res.status(400).json({ error: "file upload is required" });
    }
    const result = await uploadSignalMedia(
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
    refreshUserSignalsSoon(req.user?.username);
    res.json(result);
  } catch (err) {
    console.error("Signal upload error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post("/rooms/:roomId/read", async (req, res) => {
  try {
    const result = await markSignalRoomAsRead(
      req.user?.username,
      req.params.roomId,
      req.body?.eventId || ""
    );
    try {
      const { refreshUsersSignals } = require("../services/liveSignalRefresh");
      refreshUsersSignals([req.user?.username]).catch(() => {});
    } catch {}
    res.json(result);
  } catch (err) {
    console.error("Signal read marker error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post("/rooms/:roomId/messages/:eventId/edit", async (req, res) => {
  try {
    const result = await editSignalMessage(
      req.user?.username,
      req.params.roomId,
      req.params.eventId,
      req.body?.text || ""
    );
    refreshUserSignalsSoon(req.user?.username);
    res.json(result);
  } catch (err) {
    console.error("Signal edit error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

router.delete("/rooms/:roomId/messages/:eventId", async (req, res) => {
  try {
    const result = await deleteSignalMessage(
      req.user?.username,
      req.params.roomId,
      req.params.eventId
    );
    refreshUserSignalsSoon(req.user?.username);
    res.json(result);
  } catch (err) {
    console.error("Signal delete error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post("/rooms/:roomId/messages/:eventId/react", async (req, res) => {
  try {
    const result = await toggleSignalReaction(
      req.user?.username,
      req.params.roomId,
      req.params.eventId,
      req.body?.key || req.body?.reaction || ""
    );
    refreshUserSignalsSoon(req.user?.username);
    res.json(result);
  } catch (err) {
    console.error("Signal react error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post("/bridge/command", async (req, res) => {
  try {
    const result = await sendBridgeCommand(
      req.user?.username,
      req.body?.command || ""
    );
    res.json(result);
  } catch (err) {
    console.error("Signal bridge command error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

router.get("/media", async (req, res) => {
  try {
    const mxc = String(req.query.mxc || "").trim();
    const thumbnail = String(req.query.thumbnail || "").trim() === "1";
    const media = await fetchSignalMedia(req.user?.username, mxc, { thumbnail });
    res.setHeader("Content-Type", media.contentType || "application/octet-stream");
    if (media.contentDisposition) {
      res.setHeader("Content-Disposition", media.contentDisposition);
    }
    res.send(media.body);
  } catch (err) {
    console.error("Signal media proxy error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
