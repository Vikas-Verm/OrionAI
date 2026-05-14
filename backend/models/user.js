const mongoose = require("mongoose");
const { DEFAULT_ONBOARDING } = require("../utils/onboarding");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  fullName: {
    type: String,
    trim: true,
    default: "",
  },
  workspaceName: {
    type: String,
    trim: true,
    default: "",
  },
  passwordHash: { type: String, required: true },
  googleId: { type: String, sparse: true },
  picture: { type: String, default: "" },
  displayName: { type: String, trim: true, default: "" },
  onboarding: {
    hasCompletedAppConnection: {
      type: Boolean,
      default: DEFAULT_ONBOARDING.hasCompletedAppConnection,
    },
    hasCompletedFirstSync: {
      type: Boolean,
      default: DEFAULT_ONBOARDING.hasCompletedFirstSync,
    },
    hasSeenFirstBriefing: {
      type: Boolean,
      default: DEFAULT_ONBOARDING.hasSeenFirstBriefing,
    },
    hasSelectedFocusAreas: {
      type: Boolean,
      default: DEFAULT_ONBOARDING.hasSelectedFocusAreas,
    },
    focusAreas: {
      type: [String],
      default: () => [...DEFAULT_ONBOARDING.focusAreas],
    },
    skippedFocusAreas: {
      type: Boolean,
      default: DEFAULT_ONBOARDING.skippedFocusAreas,
    },
  },
  lastLoginAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
