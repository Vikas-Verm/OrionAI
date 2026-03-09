const {
  ingestDocument,
  retrieveRelevantChunks,
  clearDocuments,
  getChunkCount,
} = require("../services/ragStore");
const { azureClient } = require("../services/llmService");
const multer = require("multer");
const pdf = require("pdf-parse-new");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const RAG_SYSTEM_PROMPT = `You are a helpful assistant that answers questions based on provided document excerpts.
Try your best to find the answer in the excerpts.
If you can partially answer, do so.
Only say "I don't have enough information" if the topic is completely absent.
Be specific — if asked about times, names, or numbers, look carefully.`;

async function ingestText(req, res) {
  const { text, filename } = req.body;
  if (!text) return res.status(400).json({ error: "No text provided" });

  try {
    const chunkCount = await ingestDocument(text, filename || "document.txt");
    res.json({
      message: "Document ingested successfully",
      chunks: chunkCount,
      total_chunks: getChunkCount(),
    });
  } catch (error) {
    console.error("Ingest error:", error.message);
    res.status(500).json({ error: "Failed to ingest document" });
  }
}

async function ingestPDF(req, res) {
  if (!req.file) return res.status(400).json({ error: "No PDF uploaded" });

  try {
    const pdfData = await pdf(req.file.buffer);
    const extractedText = pdfData.text;

    if (!extractedText?.trim()) {
      return res.status(400).json({ error: "Could not extract text from PDF" });
    }

    const chunkCount = await ingestDocument(
      extractedText,
      req.file.originalname
    );
    res.json({
      message: "PDF ingested successfully",
      filename: req.file.originalname,
      characters: extractedText.length,
      chunks: chunkCount,
      total_chunks: getChunkCount(),
    });
  } catch (error) {
    console.error("PDF parse error:", error.message);
    res.status(500).json({ error: "Failed to parse PDF" });
  }
}

async function ragChat(req, res) {
  const { message } = req.body;

  if (getChunkCount() === 0) {
    return res.status(400).json({ error: "No documents ingested yet." });
  }

  try {
    const relevantChunks = await retrieveRelevantChunks(message, 5);

    if (relevantChunks.length === 0) {
      return res.json({
        reply: "I couldn't find relevant information in the document.",
      });
    }

    const context = relevantChunks
      .map((chunk, i) => `[Excerpt ${i + 1}]: ${chunk.content}`)
      .join("\n\n");

    const response = await azureClient.post("chat/completions", {
      messages: [
        { role: "system", content: RAG_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Document excerpts:\n\n${context}\n\nQuestion: ${message}`,
        },
      ],
      max_tokens: 400,
      temperature: 0.3,
    });

    res.json({
      reply: response.data.choices[0].message.content,
      chunks_used: relevantChunks.map((c) => ({
        excerpt: c.content.substring(0, 100) + "...",
        score: parseFloat(c.score.toFixed(3)),
      })),
    });
  } catch (error) {
    console.error("RAG error:", error.response?.data || error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
}

async function clearDocs(req, res) {
  clearDocuments();
  res.json({ message: "All documents cleared" });
}

module.exports = { ingestText, ingestPDF, ragChat, clearDocs, upload };
