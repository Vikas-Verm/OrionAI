const axios = require("axios");
require("dotenv").config();

function getEmbeddingUrl() {
  return (
    process.env.HF_EMBEDDING_URL ||
    process.env.HF_EMBEDDED_URL ||
    ""
  ).trim();
}

function isSentenceSimilarityMode() {
  return /sentence-similarity/i.test(getEmbeddingUrl());
}

function getAuthHeaders() {
  const token = String(process.env.HF_API_TOKEN || "").trim();

  if (!token) {
    throw new Error("Missing Hugging Face API token. Set HF_API_TOKEN.");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function normalizeEmbeddingResponse(data) {
  if (Array.isArray(data) && Array.isArray(data[0])) return data[0];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.embedding)) return data.embedding;
  if (Array.isArray(data?.embeddings?.[0])) return data.embeddings[0];
  if (Array.isArray(data?.embeddings)) return data.embeddings;
  throw new Error("Invalid embedding response shape from Hugging Face");
}

function normalizeScoreResponse(data, count) {
  if (!Array.isArray(data)) {
    throw new Error("Invalid similarity response shape from Hugging Face");
  }

  if (data.length !== count) {
    throw new Error(
      `Similarity response length mismatch. Expected ${count}, got ${data.length}.`
    );
  }

  return data.map((value) => Number(value) || 0);
}

function placeholderEmbedding() {
  return [0];
}

async function requestSentenceSimilarity(
  url,
  sourceSentence,
  sentences,
  headers
) {
  const payloads = [
    { inputs: { source_sentence: sourceSentence, sentences } },
    { source_sentence: sourceSentence, sentences },
  ];

  let lastError = null;

  for (const payload of payloads) {
    try {
      const response = await axios.post(url, payload, { headers });
      return normalizeScoreResponse(response.data, sentences.length);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

// Convert text to vector using Hugging Face.
async function getEmbedding(text) {
  const url = getEmbeddingUrl();
  const headers = getAuthHeaders();

  if (!url) {
    throw new Error(
      "Missing Hugging Face embedding URL. Set HF_EMBEDDING_URL or HF_EMBEDDED_URL."
    );
  }

  if (isSentenceSimilarityMode()) {
    return placeholderEmbedding();
  }

  try {
    const response = await axios.post(
      url,
      { inputs: text },
      {
        headers,
      }
    );

    const embedding = normalizeEmbeddingResponse(response.data);

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("Hugging Face returned an empty embedding");
    }

    return embedding;
  } catch (error) {
    console.error(
      "Embedding error:",
      error.response?.status || error.message,
      JSON.stringify(error.response?.data || {})
    );
    throw error;
  }
}

async function scoreSentences(sourceSentence, sentences = []) {
  if (!Array.isArray(sentences) || sentences.length === 0) return [];

  const url = getEmbeddingUrl();
  const headers = getAuthHeaders();

  if (!url) {
    throw new Error(
      "Missing Hugging Face embedding URL. Set HF_EMBEDDING_URL or HF_EMBEDDED_URL."
    );
  }

  if (!isSentenceSimilarityMode()) {
    const queryEmbedding = await getEmbedding(sourceSentence);
    const candidateEmbeddings = await Promise.all(
      sentences.map((sentence) => getEmbedding(sentence))
    );
    return candidateEmbeddings.map((embedding) =>
      cosineSimilarity(queryEmbedding, embedding)
    );
  }

  try {
    return await requestSentenceSimilarity(
      url,
      sourceSentence,
      sentences,
      headers
    );
  } catch (error) {
    console.error(
      "Embedding error:",
      error.response?.status || error.message,
      JSON.stringify(error.response?.data || {})
    );
    throw error;
  }
}

// Calculate similarity between two vectors (cosine similarity)
// Returns a number between -1 and 1 — closer to 1 means more similar
function cosineSimilarity(vecA, vecB) {
  const length = Math.min(vecA.length, vecB.length);
  if (length === 0) return 0;

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < length; i += 1) {
    const a = Number(vecA[i]) || 0;
    const b = Number(vecB[i]) || 0;
    dotProduct += a * b;
    magnitudeA += a * a;
    magnitudeB += b * b;
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);
  if (!magnitudeA || !magnitudeB) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}

module.exports = {
  getEmbedding,
  cosineSimilarity,
  isSentenceSimilarityMode,
  scoreSentences,
  placeholderEmbedding,
};
