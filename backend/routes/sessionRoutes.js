const express = require("express");
const router = express.Router();
const {
  getSessions,
  createNewSession,
  getSessionMessages,
  resetSession,
  removeSession,
  getActivityLog,
} = require("../controllers/sessionController");

router.get("/", getSessions);
router.post("/new", createNewSession);
router.get("/:sessionId/messages", getSessionMessages);
router.post("/reset", resetSession);
router.delete("/:sessionId", removeSession);
router.get("/:sessionId/activity", getActivityLog);
module.exports = router;
