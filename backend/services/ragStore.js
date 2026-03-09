const { randomUUID } = require("crypto");
const { getEmbedding, cosineSimilarity } = require("./embeddingService");

let documentChunks = []; // { id, content, embedding, index }

// Break document into chunks of ~200 words
function chunkText(text, chunkSize = 100) {
  const words = text.split(" ");
  const chunks = [];

  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.trim()) {
      chunks.push(chunk);
    }
  }
  return chunks;
}

// Ingest document — chunk it and generate embeddings for each chunk
async function ingestDocument(text, filename) {
  const chunks = chunkText(text);
  console.log(`📄 Chunking ${filename} into ${chunks.length} chunks...`);

  // Generate embedding for each chunk
  // We do this one by one to avoid rate limits
  const chunksWithEmbeddings = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`🔢 Embedding chunk ${i + 1}/${chunks.length}...`);
    const embedding = await getEmbedding(chunks[i]);
    chunksWithEmbeddings.push({
      id: randomUUID(),
      content: chunks[i],
      embedding, // ← store the vector
      index: i,
    });
  }

  documentChunks = [...documentChunks, ...chunksWithEmbeddings];
  console.log(
    `✅ Ingested ${chunks.length} chunks with embeddings from ${filename}`
  );
  return chunks.length;
}

// Semantic search — find chunks most similar in MEANING to the query
async function retrieveRelevantChunks(query, topK = 3) {
  if (documentChunks.length === 0) return [];
  // Convert query to vector
  console.log(`🔍 Embedding query for semantic search...`);
  const queryEmbedding = await getEmbedding(query);

  // Score each chunk by cosine similarity with query
  const scored = documentChunks.map((chunk) => ({
    ...chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  // Sort by score descending — highest similarity first
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

function clearDocuments() {
  documentChunks = [];
}

function getChunkCount() {
  return documentChunks.length;
}

module.exports = {
  ingestDocument,
  retrieveRelevantChunks,
  clearDocuments,
  getChunkCount,
};
