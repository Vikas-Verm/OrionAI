"use strict";

const express = require("express");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// ── You need a User model — adjust path if yours is different ────────────
const User = require("../models/user");

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// POST /auth/google/verify
// Frontend sends the Google ID token after user clicks "Sign in with Google"
router.post("/verify", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential)
      return res.status(400).json({ error: "No credential provided" });

    // Verify the token with Google
    const client = new OAuth2Client(CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || email.split("@")[0];
    const picture = payload.picture || null;

    if (!payload.email_verified) {
      return res.status(400).json({ error: "Google email not verified" });
    }

    // Find or create user by Google ID or email
    let user = await User.findOne({
      $or: [{ googleId }, { email }],
    });

    if (!user) {
      // New user — create account automatically
      const username =
        email
          .split("@")[0]
          .replace(/[^a-zA-Z0-9]/g, "")
          .toLowerCase() + Math.floor(Math.random() * 1000);
      user = await User.create({
        googleId,
        email,
        username,
        displayName: name,
        picture,
        // Random password — user will only log in via Google
        password: await bcrypt.hash(Math.random().toString(36), 10),
        createdAt: new Date(),
      });
    } else {
      // Update Google info on existing user
      await User.findByIdAndUpdate(user._id, {
        $set: {
          googleId: googleId,
          picture: picture,
          displayName: name,
          lastLoginAt: new Date(),
        },
      });
    }

    // Issue JWT — same as your normal login
    const token = jwt.sign(
      { userId: user._id, username: user.username || user.email },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        displayName: name,
        picture,
      },
    });
  } catch (err) {
    console.error("Google auth error:", err.message);
    res
      .status(401)
      .json({ error: "Google authentication failed: " + err.message });
  }
});

module.exports = router;
