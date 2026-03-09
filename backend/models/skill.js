// models/Skill.js
const mongoose = require("mongoose");

const skillSchema = new mongoose.Schema({
  // Tool identifier — matches TOOL_REGISTRY and switch cases
  toolName: { type: String, required: true, unique: true },

  // Display
  icon: { type: String, default: "⚙️" },
  label: { type: String, required: true },
  description: { type: String, default: "" },

  // Which category this skill belongs to
  category: {
    type: String,
    enum: ["jira", "email", "slack", "document", "database", "custom"],
    default: "custom",
  },

  // Whether this skill is active
  enabled: { type: Boolean, default: true },

  // Params schema — tells the LLM what params to extract
  params: [
    {
      name: { type: String, required: true }, // e.g. "ticketKey"
      type: { type: String, default: "string" }, // string / number / boolean / array
      required: { type: Boolean, default: false },
      description: { type: String, default: "" }, // e.g. "Jira ticket key like ENGG-123"
      default: { type: String, default: "" }, // default value if not provided
      example: { type: String, default: "" }, // e.g. "ENGG-2618"
    },
  ],

  // Natural language triggers — used to build classifier prompt dynamically
  triggers: [{ type: String }],
  // e.g. ["move ticket", "transition status", "change status to"]

  // Example for the LLM prompt
  promptExample: {
    userSays: { type: String }, // "Move ENGG-2618 to In Review"
    output: { type: String }, // JSON string of the step
  },

  // Who created this skill
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

skillSchema.index({ category: 1, enabled: 1 });

module.exports = mongoose.model("Skill", skillSchema);
