const express = require("express");
const router = express.Router();
const {
  parseIntent,
  runPlan,
  gmailReplyDirect,
  gmailSuggestReply,
} = require("../controllers/agentController");
const { authenticate } = require("../middleware/auth");

router.post("/parse", authenticate, parseIntent);
router.post("/run", authenticate, runPlan);
router.post("/gmail-reply", authenticate, gmailReplyDirect);
router.post("/gmail-suggest-reply", authenticate, gmailSuggestReply);

module.exports = router;
