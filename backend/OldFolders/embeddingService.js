const axios = require("axios");
require("dotenv").config();

// Convert text to vector using HuggingFace
async function getEmbedding(text) {
  try {
    const response = await axios.post(
      process.env.HF_EMBEDDING_URL,
      { inputs: text },
      {
        headers: {
          Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = response.data;
    const embedding = Array.isArray(data[0]) ? data[0] : data;

    return embedding; // array of 384 numbers
  } catch (error) {
    console.error(
      "Embedding error:",
      error.response?.status,
      JSON.stringify(error.response?.data)
    );
    throw error;
  }
}

// Calculate similarity between two vectors (cosine similarity)
// Returns a number between -1 and 1 — closer to 1 means more similar
function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

module.exports = { getEmbedding, cosineSimilarity };
