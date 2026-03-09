const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
  fileId: { type: String, required: true, unique: true },
  sessionId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  filename: { type: String, required: true },
  fileType: { type: String, enum: ["pdf", "csv", "image"] },
  fileSize: { type: Number },
  totalChunks: { type: Number },
  status: {
    type: String,
    enum: ["processing", "ready", "failed"],
    default: "processing",
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("File", fileSchema);
