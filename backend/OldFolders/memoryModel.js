const mongoose = require("mongoose");

const memorySchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  memory: { type: String, default: "" },
  updatedAt: { type: Date, default: Date.now },
});

const Memory = mongoose.model("Memory", memorySchema);

module.exports = Memory;
