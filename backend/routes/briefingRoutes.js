const express = require("express");
const router = express.Router();
const {
  getBriefing,
  getHome,
  postPriorityFeedAction,
  postPriorityFeedDraftReply,
  postPriorityFeedTelemetry,
} = require("../controllers/briefingController");

router.get("/morning", getBriefing);
router.get("/home", getHome);
router.post("/priority-feed/actions", postPriorityFeedAction);
router.post("/priority-feed/draft-reply", postPriorityFeedDraftReply);
router.post("/priority-feed/telemetry", postPriorityFeedTelemetry);

module.exports = router;
