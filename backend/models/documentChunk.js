const mongoose = require("mongoose");

const documentChunkSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  fileId: { type: String, required: true }, // groups chunks from same file
  filename: { type: String, required: true },
  fileType: { type: String, enum: ["pdf", "csv", "image"], required: true },
  chunkIndex: { type: Number, required: true },
  content: { type: String, required: true },
  embedding: { type: [Number], required: true }, // 384-dim vector
  metadata: {
    totalChunks: Number,
    fileSize: Number,
    extractedAt: { type: Date, default: Date.now },
  },
});

// Index for fast vector search per session
documentChunkSchema.index({ sessionId: 1, fileId: 1 });

module.exports = mongoose.model("DocumentChunk", documentChunkSchema);
