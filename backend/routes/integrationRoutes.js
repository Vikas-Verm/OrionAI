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

router.get("/gmail/oauth/start", authenticate, gmailOAuthStart);
router.get("/gmail/oauth/callback", gmailOAuthCallback);

router.get("/", authenticate, getIntegrations);
router.post("/:type", authenticate, saveIntegration);
router.delete("/:type", authenticate, deleteIntegration);
router.post("/:type/test", authenticate, testIntegration);

module.exports = router;
