const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const ctrl = require("../controllers/jiraModuleController");

// Used by JiraPage.vue
router.get("/board", authenticate, ctrl.getBoard); // all tickets for kanban
router.post("/ticket", authenticate, ctrl.createTicket); // create new ticket

module.exports = router;
