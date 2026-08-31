"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_FILE_SIZE,
  inferType,
  sanitizeFileName,
  validateUpload,
} = require("../services/studyMaterialService");

test("study material upload validation accepts supported material files", () => {
  const file = {
    originalname: "notes.pdf",
    mimetype: "application/pdf",
    size: 1024,
  };

  assert.equal(inferType(file), "pdf");
  assert.equal(validateUpload(file), "");
});

test("study material upload validation rejects empty, oversized, and unsupported files", () => {
  assert.equal(validateUpload(null), "No file uploaded");
  assert.equal(
    validateUpload({ originalname: "empty.txt", mimetype: "text/plain", size: 0 }),
    "Uploaded file is empty"
  );
  assert.equal(
    validateUpload({
      originalname: "huge.pdf",
      mimetype: "application/pdf",
      size: MAX_FILE_SIZE + 1,
    }),
    "File is too large. Maximum size is 15MB."
  );
  assert.equal(
    validateUpload({
      originalname: "binary.bin",
      mimetype: "application/octet-stream",
      size: 512,
    }),
    "Unsupported file type"
  );
});

test("study material file names are sanitized before local storage", () => {
  assert.equal(sanitizeFileName("../DSA<script>.pdf"), "DSA_script_.pdf");
  assert.equal(inferType({ originalname: "revision.md", size: 10 }), "markdown");
  assert.equal(inferType({ originalname: "sheet.csv", size: 10 }), "csv");
});
