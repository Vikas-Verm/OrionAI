const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const ctrl = require("../controllers/jiraModuleController");

router.get("/projects", authenticate, ctrl.getProjects); // NEW: all projects
router.get("/board", authenticate, ctrl.getBoard); // ?project=KEY1,KEY2
router.get("/sprints", authenticate, ctrl.getSprints);
router.get("/ticket/:key", authenticate, ctrl.getTicket); // full detail
router.patch("/ticket/:key", authenticate, ctrl.updateTicket); // NEW: patch any field
router.put("/ticket/:key", authenticate, ctrl.updateTicket); // alias
router.delete("/ticket/:key", authenticate, ctrl.deleteTicket);
router.post("/ticket/:key/comment", authenticate, ctrl.addComment);
router.post("/ticket", authenticate, ctrl.createTicket);
router.get("/users", authenticate, ctrl.searchUsers); // ?q=name
router.get("/components", authenticate, ctrl.getComponents); // ?project=KEY
router.get("/search", authenticate, ctrl.searchTickets); // ?jql=...

module.exports = router;
