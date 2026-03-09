const pdf = require("pdf-parse-new");
const multer = require("multer");
const {
  processFile,
  getSessionFiles,
  deleteFile,
} = require("../services/fileService");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Upload and process PDF
async function uploadPDF(req, res) {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const sessionId = req.body.sessionId;
  const userId = req.user.username;

  try {
    // Extract text from PDF
    const pdfData = await pdf(req.file.buffer);
    const text = pdfData.text?.trim();

    if (!text) {
      return res.status(400).json({ error: "Could not extract text from PDF" });
    }

    const result = await processFile(
      text,
      req.file.originalname,
      "pdf",
      sessionId,
      userId,
      req.file.size
    );

    res.json({
      message: "PDF processed successfully",
      ...result,
    });
  } catch (error) {
    console.error("PDF upload error:", error.message);
    res.status(500).json({ error: "Failed to process PDF" });
  }
}

// Upload and process CSV
async function uploadCSV(req, res) {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const sessionId = req.body.sessionId;
  const userId = req.user.username;

  try {
    const text = req.file.buffer.toString("utf-8");

    const result = await processFile(
      text,
      req.file.originalname,
      "csv",
      sessionId,
      userId,
      req.file.size
    );

    res.json({
      message: "CSV processed successfully",
      ...result,
    });
  } catch (error) {
    console.error("CSV upload error:", error.message);
    res.status(500).json({ error: "Failed to process CSV" });
  }
}

// Get all files for a session
async function getFiles(req, res) {
  const { sessionId } = req.params;
  const files = await getSessionFiles(sessionId);
  res.json(files);
}

// Delete a file
async function removeFile(req, res) {
  const { fileId } = req.params;
  const { sessionId } = req.body;

  await deleteFile(fileId, sessionId);
  res.json({ message: "File deleted" });
}

module.exports = { uploadPDF, uploadCSV, getFiles, removeFile, upload };
