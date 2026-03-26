const express = require("express");
const router = express.Router();
const {
  getSessions,
  createNewSession,
  getSessionMessages,
  resetSession,
  removeSession,
  getActivityLog,
  setMessageFeedback,
  exportSession,
} = require("../controllers/sessionController");

router.get("/", getSessions);
router.post("/new", createNewSession);
router.get("/:sessionId/messages", getSessionMessages);
router.get("/:sessionId/export", exportSession);
router.post("/:sessionId/messages/:messageIndex/feedback", setMessageFeedback);
router.post("/reset", resetSession);
router.delete("/:sessionId", removeSession);
router.get("/:sessionId/activity", getActivityLog);
module.exports = router;
