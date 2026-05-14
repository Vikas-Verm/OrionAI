"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/user");
const {
  cleanString,
  normalizeEmail,
  normalizeUsername,
  sanitizeUser,
  createAuthToken,
} = require("../utils/auth");

const router = express.Router();
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

function baseUsernameFromProfile(email, name) {
  const candidate = normalizeUsername(email || name || "")
    .replace(/@.*$/, "")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 24);

  return candidate || "orionuser";
}

async function generateUniqueUsername(email, name) {
  const base = baseUsernameFromProfile(email, name);
  let candidate = base;
  let suffix = 0;

  while (await User.findOne({ username: candidate })) {
    suffix += 1;
    const suffixText = String(suffix);
    const maxBaseLength = Math.max(1, 24 - suffixText.length);
    candidate = `${base.slice(0, maxBaseLength)}${suffixText}`;
  }

  return candidate;
}

router.post("/verify", async (req, res) => {
  try {
    if (!CLIENT_ID) {
      return res.status(503).json({ error: "Google sign-in is not configured." });
    }

    const credential = cleanString(req.body?.credential);
    if (!credential) {
      return res.status(400).json({ error: "No Google credential was provided." });
    }

    const client = new OAuth2Client(CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: CLIENT_ID,
    });
    const payload = ticket.getPayload() || {};

    if (!payload.email_verified) {
      return res.status(400).json({ error: "Google email must be verified." });
    }

    const googleId = cleanString(payload.sub);
    const email = normalizeEmail(payload.email);
    const fullName = cleanString(payload.name) || email.split("@")[0] || "OrionAI User";
    const picture = cleanString(payload.picture);

    let user = await User.findOne({
      $or: [{ googleId }, { email }],
    });

    if (!user) {
      user = await User.create({
        googleId,
        email,
        username: await generateUniqueUsername(email, fullName),
        fullName,
        displayName: fullName,
        picture,
        passwordHash: await bcrypt.hash(`${googleId}:${Date.now()}`, 12),
        lastLoginAt: new Date(),
      });
    } else {
      user = await User.findByIdAndUpdate(
        user._id,
        {
          $set: {
            googleId,
            email,
            fullName,
            displayName: fullName,
            picture,
            username:
              user.username || (await generateUniqueUsername(email, fullName)),
            lastLoginAt: new Date(),
          },
        },
        { new: true }
      );
    }

    return res.json({
      token: createAuthToken(user),
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Google auth error:", error.message);
    return res.status(401).json({ error: "Google authentication failed." });
  }
});

module.exports = router;
