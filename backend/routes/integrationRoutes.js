const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const {
  getIntegrations,
  saveIntegration,
  deleteIntegration,
  testIntegration,
  getDatabaseSchemaPreview,
  getRazorpayOverview,
} = require("../controllers/integrationController");
const {
  gmailOAuthStart,
  gmailOAuthCallback,
} = require("../controllers/gmailOauthController");
const {
  googleDocsOAuthStart,
  googleDocsOAuthCallback,
} = require("../controllers/googleDocsOauthController");
const {
  googleSheetsOAuthStart,
  googleSheetsOAuthCallback,
} = require("../controllers/googleSheetsOauthController");
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

router.get("/google-docs/oauth/start", googleDocsOAuthStart);
router.get("/google-docs/oauth/callback", googleDocsOAuthCallback);

router.get("/google-sheets/oauth/start", googleSheetsOAuthStart);
router.get("/google-sheets/oauth/callback", googleSheetsOAuthCallback);

router.get("/google-calendar/oauth/start", googleCalendarOAuthStart);
router.get("/google-calendar/oauth/callback", googleCalendarOAuthCallback);

router.get("/slack/oauth/start", slackOAuthStart);
router.get("/slack/oauth/callback", slackOAuthCallback);
router.get("/database/schema", getDatabaseSchemaPreview);
router.get("/razorpay/overview", getRazorpayOverview);
router.get("/", getIntegrations);
router.post("/:type", saveIntegration);
router.delete("/:type", deleteIntegration);
router.post("/:type/test", testIntegration);

module.exports = router;
