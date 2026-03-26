const express = require("express");
const router = express.Router();
const {
  parseIntent,
  runPlan,
  confirmAgentAction,
  gmailReplyDirect,
  gmailSuggestReply,
  calendarRsvpDirect,
  saveTelegramReply,
} = require("../controllers/agentController");
const { authenticate } = require("../middleware/auth");

router.post("/parse", authenticate, parseIntent);
router.post("/run", authenticate, runPlan);
router.post("/confirm", authenticate, confirmAgentAction);
router.post("/gmail-reply", authenticate, gmailReplyDirect);
router.post("/gmail-suggest-reply", authenticate, gmailSuggestReply);
router.post("/calendar-rsvp", authenticate, calendarRsvpDirect);
router.post("/telegram-reply", authenticate, saveTelegramReply);

module.exports = router;
