const express = require("express");
const router = express.Router();
const {
  getBriefing,
  getHome,
  postPriorityFeedAction,
  postPriorityFeedDraftReply,
} = require("../controllers/briefingController");

router.get("/morning", getBriefing);
router.get("/home", getHome);
router.post("/priority-feed/actions", postPriorityFeedAction);
router.post("/priority-feed/draft-reply", postPriorityFeedDraftReply);

module.exports = router;
