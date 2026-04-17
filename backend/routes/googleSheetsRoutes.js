const express = require("express");
const {
  createGoogleSheet,
  deleteGoogleSheet,
  duplicateGoogleSheet,
  exportGoogleSheet,
  getGoogleSheet,
  listGoogleSheets,
  mutateGoogleSheet,
  runGoogleSheetAi,
  shareGoogleSheet,
  updateGoogleSheet,
} = require("../controllers/googleSheetsController");

const router = express.Router();

router.get("/", listGoogleSheets);
router.post("/", createGoogleSheet);
router.get("/:id", getGoogleSheet);
router.patch("/:id", updateGoogleSheet);
router.delete("/:id", deleteGoogleSheet);
router.post("/:id/duplicate", duplicateGoogleSheet);
router.post("/:id/mutations", mutateGoogleSheet);
router.post("/:id/ai", runGoogleSheetAi);
router.post("/:id/share", shareGoogleSheet);
router.post("/:id/export", exportGoogleSheet);

module.exports = router;
