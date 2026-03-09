const express = require("express");
const router = express.Router();
const {
  ingestText,
  ingestPDF,
  ragChat,
  clearDocs,
  upload,
} = require("../controllers/ragController");

router.post("/ingest", ingestText);
router.post("/ingest-pdf", upload.single("pdf"), ingestPDF);
router.post("/chat", ragChat);
router.post("/clear", clearDocs);

module.exports = router;
