// models/Skill.js
const mongoose = require("mongoose");

const skillSchema = new mongoose.Schema({
  toolName: { type: String, required: true, unique: true },

  icon: { type: String, default: "⚙️" },
  label: { type: String, required: true },
  description: { type: String, default: "" },

  category: {
    type: String,
    enum: [
      "jira",
      "email",
      "slack",
      "document",
      "database",
      "telegram",
      "calendar",
      "gmail",
      "custom",
    ],
    default: "custom",
  },

  enabled: { type: Boolean, default: true },

  params: [
    {
      name: { type: String, required: true },
      type: { type: String, default: "string" },
      required: { type: Boolean, default: false },
      description: { type: String, default: "" },
      default: { type: String, default: "" },
      example: { type: String, default: "" },
    },
  ],

  triggers: [{ type: String }],

  promptExample: {
    userSays: { type: String },
    output: { type: String },
  },

  // 🔥 NEW: UI step presentation
  presentation: {
    steps: [
      {
        label: String,
        icon: String,
      },
    ],
  },

  createdBy: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

skillSchema.index({ category: 1, enabled: 1 });

module.exports = mongoose.model("Skill", skillSchema);
