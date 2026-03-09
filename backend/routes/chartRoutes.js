const express = require("express");
const router = express.Router();
const { extractChart } = require("../controllers/chartController");

router.post("/extract-chart", extractChart);

module.exports = router;
