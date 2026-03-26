const express = require("express");
const router = express.Router();
const {
  getBriefing,
  getHome,
  postPriorityFeedAction,
} = require("../controllers/briefingController");

router.get("/morning", getBriefing);
router.get("/home", getHome);
router.post("/priority-feed/actions", postPriorityFeedAction);

module.exports = router;
