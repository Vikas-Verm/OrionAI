const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const {
  getIntegrations,
  saveIntegration,
  deleteIntegration,
  testIntegration,
} = require("../controllers/integrationController");
const {
  gmailOAuthStart,
  gmailOAuthCallback,
} = require("../controllers/gmailOauthController");
const {
  googleCalendarOAuthStart,
  googleCalendarOAuthCallback,
} = require("../controllers/googleCalenderOauthController");
const {
  slackOAuthStart,
  slackOAuthCallback,
} = require("../controllers/slackOAuthController");
router.get("/gmail/oauth/start", gmailOAuthStart);
router.get("/gmail/oauth/callback", gmailOAuthCallback);

router.get("/google-calendar/oauth/start", googleCalendarOAuthStart);
router.get("/google-calendar/oauth/callback", googleCalendarOAuthCallback);

router.get("/slack/oauth/start", slackOAuthStart);
router.get("/slack/oauth/callback", slackOAuthCallback);
router.get("/", getIntegrations);
router.post("/:type", saveIntegration);
router.delete("/:type", deleteIntegration);
router.post("/:type/test", testIntegration);

module.exports = router;
