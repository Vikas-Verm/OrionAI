const mongoose = require("mongoose");

const priorityFeedActionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  itemId: { type: String, required: true, index: true },
  sourceApp: { type: String, default: "" },
  title: { type: String, default: "" },
  action: {
    type: String,
    enum: ["approved", "dismissed", "snoozed", "edited_approved"],
    required: true,
  },
  actionLabel: { type: String, default: "" },
  note: { type: String, default: "" },
  snoozedUntil: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
});

priorityFeedActionSchema.index({ userId: 1, itemId: 1, createdAt: -1 });

module.exports =
  mongoose.models.PriorityFeedAction ||
  mongoose.model("PriorityFeedAction", priorityFeedActionSchema);
