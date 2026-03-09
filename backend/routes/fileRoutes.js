const express = require("express");
const router = express.Router();
const {
  uploadPDF,
  uploadCSV,
  getFiles,
  removeFile,
  upload,
} = require("../controllers/fileController");

router.post("/upload/pdf", upload.single("file"), uploadPDF);
router.post("/upload/csv", upload.single("file"), uploadCSV);
router.get("/:sessionId", getFiles);
router.delete("/:fileId", removeFile);

module.exports = router;
