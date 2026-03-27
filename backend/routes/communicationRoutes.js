"use strict";

const express = require("express");
const router = express.Router();
const { getActionStates } = require("../controllers/communicationController");

router.get("/action-states", getActionStates);

module.exports = router;
