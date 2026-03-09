const express = require("express");
const router = express.Router();
const { handleDbChat } = require("../controllers/dbQueryController");

router.post("/", handleDbChat);

module.exports = router;
