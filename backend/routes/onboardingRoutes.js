const express = require("express");
const router = express.Router();
const {
  getOnboardingStatus,
  updateOnboardingStatus,
} = require("../controllers/onboardingController");

router.get("/status", getOnboardingStatus);
router.patch("/", updateOnboardingStatus);

module.exports = router;
