const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: { type: String, required: true },
  googleId: { type: String, sparse: true },
  picture: { type: String },
  displayName: { type: String },
  lastLoginAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date },
});

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
