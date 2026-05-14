const jwt = require("jsonwebtoken");
const { normalizeOnboarding } = require("./onboarding");

const JWT_EXPIRES_IN = "30d";
const MIN_PASSWORD_LENGTH = 8;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return cleanString(value).toLowerCase();
}

function normalizeUsername(value) {
  return cleanString(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function sanitizeUser(user) {
  if (!user) return null;

  return {
    id: String(user._id || user.id || ""),
    username: user.username || "",
    email: user.email || "",
    fullName: user.fullName || user.displayName || "",
    displayName: user.displayName || user.fullName || user.username || "",
    workspaceName: user.workspaceName || "",
    picture: user.picture || "",
    onboarding: normalizeOnboarding(user.onboarding),
  };
}

function createAuthToken(user) {
  return jwt.sign(
    {
      userId: String(user._id || user.id || ""),
      username: user.username || user.email || "",
    },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

module.exports = {
  JWT_EXPIRES_IN,
  MIN_PASSWORD_LENGTH,
  cleanString,
  normalizeEmail,
  normalizeUsername,
  isValidEmail,
  sanitizeUser,
  createAuthToken,
};
