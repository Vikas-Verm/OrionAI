const mongoose = require("mongoose");

const CANONICAL_ACTIONS = ["handled", "dismissed", "snoozed", "reclassified"];
const LEGACY_ACTIONS = ["approved", "edited_approved"];
const ACTION_VALUES = [...CANONICAL_ACTIONS, ...LEGACY_ACTIONS];
const PRIORITYFEED_TTL_DAYS = 1;
const priorityFeedActionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  itemId: { type: String, required: true, index: true },
  sourceApp: { type: String, default: "" },
  conversationId: { type: String, default: "" },
  title: { type: String, default: "" },
  action: {
    type: String,
    enum: ACTION_VALUES,
    required: true,
  },
  legacyAction: { type: String, default: "" },
  actionLabel: { type: String, default: "" },
  fromActionState: { type: String, default: "" },
  toActionState: { type: String, default: "" },
  reason: { type: String, default: "" },
  note: { type: String, default: "" },
  snoozedUntil: { type: Date, default: null },
  createdAt: {
    type: Date,
    default: Date.now,
    index: { expires: `${PRIORITYFEED_TTL_DAYS}d` },
  },
});

priorityFeedActionSchema.index({ userId: 1, itemId: 1, createdAt: -1 });

const PriorityFeedAction =
  mongoose.models.PriorityFeedAction ||
  mongoose.model("PriorityFeedAction", priorityFeedActionSchema);

PriorityFeedAction.CANONICAL_ACTIONS = CANONICAL_ACTIONS;
PriorityFeedAction.LEGACY_ACTIONS = LEGACY_ACTIONS;
PriorityFeedAction.ACTION_VALUES = ACTION_VALUES;

module.exports = PriorityFeedAction;
