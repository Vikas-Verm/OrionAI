const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const {
  getMe,
  getCustomEmojis,
  listChannels,
  getMessages,
  sendMessage,
  getUnread,
  searchMessages,
  createChannel,
  openDM,
  addReaction,
  pinMessage,
  unpinMessage,
  getThreadReplies,
  sendThreadReply,
  getChannelFiles,
  getWorkspaceFiles,
  uploadFile,
  startHuddle,
  inviteToHuddle,
  updateStatus,
  setAwayStatus,
} = require("../controllers/slackModuleController");

// ── Profile & workspace ───────────────────────────────────
router.get("/me", authenticate, getMe);
router.get("/emojis", authenticate, getCustomEmojis);

// ── Channels ──────────────────────────────────────────────
router.get("/channels", authenticate, listChannels);
router.post("/channels/create", authenticate, createChannel);
router.get("/channels/:id/messages", authenticate, getMessages);
router.post("/channels/:id/send", authenticate, sendMessage);
router.get("/channels/:id/files", authenticate, getChannelFiles);
router.post("/channels/:id/pin", authenticate, pinMessage);
router.post("/channels/:id/unpin", authenticate, unpinMessage);

// ── Threads ───────────────────────────────────────────────
router.get("/channels/:id/threads/:ts", authenticate, getThreadReplies);
router.post("/channels/:id/threads/:ts/reply", authenticate, sendThreadReply);

// ── DMs ───────────────────────────────────────────────────
router.post("/dm/open", authenticate, openDM);

// ── Messages ──────────────────────────────────────────────
router.post("/messages/:ts/react", authenticate, addReaction);

// ── Search ────────────────────────────────────────────────
router.get("/search", authenticate, searchMessages);

// ── Unread ────────────────────────────────────────────────
router.get("/unread", authenticate, getUnread);

// ── Files ─────────────────────────────────────────────────
router.get("/files", authenticate, getWorkspaceFiles);
router.post(
  "/channels/:id/upload",
  authenticate,
  upload.single("file"),
  uploadFile
);

// ── Huddle ────────────────────────────────────────────────
router.post("/huddle/start", authenticate, startHuddle);
router.post("/huddle/invite", authenticate, inviteToHuddle);

// ── Status ────────────────────────────────────────────────
router.post("/status/update", authenticate, updateStatus);
router.post("/status/away", authenticate, setAwayStatus);

module.exports = router;
