"use strict";

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const pdf = require("pdf-parse-new");
const mammoth = require("mammoth");
const XLSX = require("xlsx");

const StudyMaterial = require("../models/StudyMaterial");

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const STORAGE_DIR = path.join(__dirname, "..", "uploads", "study-materials");

const EXTENSION_TO_TYPE = {
  ".pdf": "pdf",
  ".doc": "doc",
  ".docx": "docx",
  ".txt": "txt",
  ".md": "markdown",
  ".markdown": "markdown",
  ".csv": "csv",
  ".xlsx": "xlsx",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
};

function sanitizeFileName(name = "study-material") {
  const base = path.basename(String(name || "study-material"));
  return base.replace(/[^a-zA-Z0-9._ -]+/g, "_").slice(0, 160);
}

function inferType(file = {}) {
  const ext = path.extname(String(file.originalname || "")).toLowerCase();
  if (EXTENSION_TO_TYPE[ext]) return EXTENSION_TO_TYPE[ext];
  const mime = String(file.mimetype || "").toLowerCase();
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("text/")) return "txt";
  if (mime.includes("csv")) return "csv";
  if (mime.startsWith("image/")) return "image";
  return "";
}

function validateUpload(file) {
  if (!file) return "No file uploaded";
  if (!file.size) return "Uploaded file is empty";
  if (file.size > MAX_FILE_SIZE) return "File is too large. Maximum size is 15MB.";
  const type = inferType(file);
  if (!type) return "Unsupported file type";
  return "";
}

async function extractTextFromUpload(file, type) {
  if (["txt", "markdown", "csv"].includes(type)) {
    return {
      text: file.buffer.toString("utf8").trim(),
      extractionStatus: "ready",
      processingStatus: "ready",
      processingError: "",
      pageCount: null,
    };
  }
  if (type === "pdf") {
    const parsed = await pdf(file.buffer);
    return {
      text: String(parsed.text || "").trim(),
      extractionStatus: parsed.text?.trim() ? "ready" : "failed",
      processingStatus: parsed.text?.trim() ? "ready" : "failed",
      processingError: parsed.text?.trim() ? "" : "No extractable PDF text found.",
      pageCount: parsed.numpages || null,
    };
  }
  if (type === "docx") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    const text = String(result.value || "").trim();
    return {
      text,
      extractionStatus: text ? "ready" : "failed",
      processingStatus: text ? "ready" : "failed",
      processingError: text ? "" : "No extractable DOCX text found.",
      pageCount: null,
    };
  }
  if (type === "xlsx") {
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const text = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_csv(sheet).trim();
      return rows ? `${sheetName}\n${rows}` : "";
    })
      .filter(Boolean)
      .join("\n\n")
      .trim();
    return {
      text,
      extractionStatus: text ? "ready" : "failed",
      processingStatus: text ? "ready" : "failed",
      processingError: text ? "" : "No extractable XLSX text found.",
      pageCount: null,
    };
  }
  if (type === "image") {
    return {
      text: "",
      extractionStatus: "failed",
      processingStatus: "failed",
      processingError: "Image OCR is not configured in this workspace.",
      pageCount: null,
    };
  }
  return {
    text: "",
    extractionStatus: "failed",
    processingStatus: "failed",
    processingError: `${type.toUpperCase()} extraction is not configured in this workspace.`,
    pageCount: null,
  };
}

function summarizeText(text = "") {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.slice(0, 360);
}

async function createUploadedMaterial({
  userId,
  goalId,
  topicId,
  file,
  title,
} = {}) {
  const validationError = validateUpload(file);
  if (validationError) {
    const err = new Error(validationError);
    err.status = 400;
    throw err;
  }

  const type = inferType(file);
  const safeName = sanitizeFileName(file.originalname);
  const storageKey = `${userId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const absolutePath = path.join(STORAGE_DIR, storageKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, file.buffer);

  let extraction;
  try {
    extraction = await extractTextFromUpload(file, type);
  } catch (err) {
    extraction = {
      text: "",
      extractionStatus: "failed",
      processingStatus: "failed",
      processingError: "Could not process this file.",
      pageCount: null,
    };
  }

  const material = await StudyMaterial.create({
    userId,
    goalId: goalId || null,
    topicId: topicId || null,
    type,
    title: String(title || "").trim() || safeName,
    originalFileName: safeName,
    mimeType: file.mimetype || "",
    size: file.size || 0,
    storageProvider: "local",
    storageKey,
    sourceApp: "upload",
    contentText: "",
    extractedText: extraction.text,
    extractionStatus: extraction.extractionStatus,
    processingStatus: extraction.processingStatus,
    processingError: extraction.processingError,
    summary: summarizeText(extraction.text),
    pageCount: extraction.pageCount,
    status: extraction.processingStatus,
  });
  return material;
}

async function retryMaterialProcessing({ userId, materialId } = {}) {
  const material = await StudyMaterial.findOne({ _id: materialId, userId }).select(
    "+storageKey"
  );
  if (!material) return null;
  if (!material.storageKey) return material;

  material.processingStatus = "processing";
  material.extractionStatus = "processing";
  material.processingError = "";
  material.status = "processing";
  await material.save();

  try {
    const buffer = await fs.readFile(path.join(STORAGE_DIR, material.storageKey));
    const file = {
      buffer,
      originalname: material.originalFileName,
      mimetype: material.mimeType,
      size: material.size,
    };
    const extraction = await extractTextFromUpload(file, material.type);
    material.extractedText = extraction.text;
    material.extractionStatus = extraction.extractionStatus;
    material.processingStatus = extraction.processingStatus;
    material.processingError = extraction.processingError;
    material.summary = summarizeText(extraction.text);
    material.pageCount = extraction.pageCount;
    material.status = extraction.processingStatus;
  } catch {
    material.extractionStatus = "failed";
    material.processingStatus = "failed";
    material.processingError = "Could not retry processing this file.";
    material.status = "failed";
  }
  await material.save();
  return material;
}

function materialPublic(material) {
  if (!material) return null;
  const obj = typeof material.toObject === "function" ? material.toObject() : { ...material };
  delete obj.storageKey;
  return obj;
}

module.exports = {
  MAX_FILE_SIZE,
  sanitizeFileName,
  inferType,
  validateUpload,
  createUploadedMaterial,
  retryMaterialProcessing,
  materialPublic,
};
