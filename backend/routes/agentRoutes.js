const express = require("express");
const router = express.Router();
const {
  parseIntent,
  runPlan,
  gmailReplyDirect,
  gmailSuggestReply,
  calendarRsvpDirect,
} = require("../controllers/agentController");
const { authenticate } = require("../middleware/auth");

router.post("/parse", authenticate, parseIntent);
router.post("/run", authenticate, runPlan);
router.post("/gmail-reply", authenticate, gmailReplyDirect);
router.post("/gmail-suggest-reply", authenticate, gmailSuggestReply);
router.post("/calendar-rsvp", authenticate, calendarRsvpDirect);

module.exports = router;
