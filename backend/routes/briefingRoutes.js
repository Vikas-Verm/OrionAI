const express = require("express");
const router = express.Router();
const { getBriefing } = require("../controllers/briefingController");

router.get("/morning", getBriefing);

module.exports = router;
