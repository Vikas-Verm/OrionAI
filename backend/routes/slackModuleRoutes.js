const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const ctrl = require("../controllers/slackModuleController");

// Used by SlackPage.vue
router.get("/channels", authenticate, ctrl.getChannels);
router.get("/channels/:channelId/messages", authenticate, ctrl.getMessages);
router.post("/channels/:channelId/send", authenticate, ctrl.sendMessage);

module.exports = router;
