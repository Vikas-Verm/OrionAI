const { randomUUID } = require("crypto");
const DocumentChunk = require("../models/documentChunk");
const File = require("../models/file");
const {
  getEmbedding,
  cosineSimilarity,
  isSentenceSimilarityMode,
  scoreSentences,
  placeholderEmbedding,
} = require("./embeddingService");

// ── Text chunking ──────────────────────────────────────────
function chunkText(text, chunkSize = 100, overlap = 20) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.trim()) chunks.push(chunk);
    if (i + chunkSize >= words.length) break;
  }

  return chunks;
}

// ── Process and store a file ───────────────────────────────
async function processFile(
  text,
  filename,
  fileType,
  sessionId,
  userId,
  fileSize
) {
  const fileId = randomUUID();

  // Create file record immediately — status: processing
  await File.create({
    fileId,
    sessionId,
    userId,
    filename,
    fileType,
    fileSize,
    status: "processing",
  });

  try {
    const chunks = chunkText(text);
    const sentenceMode = isSentenceSimilarityMode();

    // Generate embeddings for all chunks
    const chunkDocs = [];
    for (let i = 0; i < chunks.length; i++) {
      const embedding = sentenceMode
        ? placeholderEmbedding()
        : await getEmbedding(chunks[i]);
      chunkDocs.push({
        sessionId,
        userId,
        fileId,
        filename,
        fileType,
        chunkIndex: i,
        content: chunks[i],
        embedding,
        metadata: {
          totalChunks: chunks.length,
          fileSize,
          extractedAt: new Date(),
        },
      });
    }

    // Bulk insert all chunks
    await DocumentChunk.insertMany(chunkDocs);

    // Update file status to ready
    await File.findOneAndUpdate(
      { fileId },
      { status: "ready", totalChunks: chunks.length }
    );

    return { fileId, filename, fileType, totalChunks: chunks.length };
  } catch (error) {
    await File.findOneAndUpdate({ fileId }, { status: "failed" });
    throw error;
  }
}

// ── Retrieve relevant chunks for a query ──────────────────
async function retrieveChunks(query, sessionId, topK = 8, fileId = null) {
  // Filter by fileId if provided
  const filter = fileId
    ? { sessionId, fileId } // ← search only this file
    : { sessionId }; // ← search all files

  const allChunks = await DocumentChunk.find(filter);
  if (allChunks.length === 0) return [];

  if (isSentenceSimilarityMode()) {
    const scores = await scoreSentences(
      query,
      allChunks.map((chunk) => chunk.content)
    );

    return allChunks
      .map((chunk, index) => ({
        content: chunk.content,
        filename: chunk.filename,
        fileId: chunk.fileId,
        score: scores[index] || 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  const queryEmbedding = await getEmbedding(query);

  return allChunks
    .map((chunk) => ({
      content: chunk.content,
      filename: chunk.filename,
      fileId: chunk.fileId,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ── Get all files for a session ────────────────────────────
async function getSessionFiles(sessionId) {
  return await File.find(
    { sessionId, status: "ready" },
    { fileId: 1, filename: 1, fileType: 1, totalChunks: 1, createdAt: 1 }
  );
}

// ── Delete a file and its chunks ──────────────────────────
async function deleteFile(fileId, sessionId) {
  await Promise.all([
    File.deleteOne({ fileId, sessionId }),
    DocumentChunk.deleteMany({ fileId, sessionId }),
  ]);
}

// ── Clear all files for a session ─────────────────────────
async function clearSessionFiles(sessionId) {
  const files = await File.find({ sessionId });
  const fileIds = files.map((f) => f.fileId);

  await Promise.all([
    File.deleteMany({ sessionId }),
    DocumentChunk.deleteMany({ sessionId }),
  ]);

  return fileIds;
}

module.exports = {
  processFile,
  retrieveChunks,
  getSessionFiles,
  deleteFile,
  clearSessionFiles,
};
