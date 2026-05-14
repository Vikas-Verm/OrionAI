"use strict";

const User = require("../models/user");
const { applyOnboardingPatch } = require("../utils/onboarding");
const { buildOnboardingStatusForUser } = require("../services/onboardingState");

async function getOnboardingStatus(req, res) {
  try {
    const user = await User.findById(req.user?.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const status = await buildOnboardingStatusForUser(user);
    return res.json(status);
  } catch (error) {
    console.error("Get onboarding status error:", error.message);
    return res.status(500).json({ error: "Could not load onboarding status." });
  }
}

async function updateOnboardingStatus(req, res) {
  try {
    const user = await User.findById(req.user?.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    user.onboarding = applyOnboardingPatch(user.onboarding, req.body || {});
    await user.save();

    const status = await buildOnboardingStatusForUser(user, { persist: false });
    return res.json(status);
  } catch (error) {
    console.error("Update onboarding status error:", error.message);
    return res.status(400).json({ error: "Could not update onboarding status." });
  }
}

module.exports = {
  getOnboardingStatus,
  updateOnboardingStatus,
};
