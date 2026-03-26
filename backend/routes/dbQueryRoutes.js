const express = require("express");
const router = express.Router();
const {
  handleDbChat,
  handleRawDbQuery,
  handleDbPreview,
  handleDbMutation,
} = require("../controllers/dbQueryController");

router.post("/", handleDbChat);
router.post("/preview", handleDbPreview);
router.post("/raw", handleRawDbQuery);
router.post("/mutate", handleDbMutation);

module.exports = router;
