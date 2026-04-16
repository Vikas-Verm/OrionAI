const express = require("express");
const {
  listGoogleDocs,
  getGoogleDoc,
  createGoogleDoc,
  updateGoogleDoc,
  runGoogleDocAi,
  shareGoogleDoc,
  exportGoogleDoc,
  deleteGoogleDoc,
} = require("../controllers/googleDocsController");

const router = express.Router();

router.get("/", listGoogleDocs);
router.post("/", createGoogleDoc);
router.get("/:id", getGoogleDoc);
router.patch("/:id", updateGoogleDoc);
router.delete("/:id", deleteGoogleDoc);
router.post("/:id/ai", runGoogleDocAi);
router.post("/:id/share", shareGoogleDoc);
router.post("/:id/export", exportGoogleDoc);

module.exports = router;
