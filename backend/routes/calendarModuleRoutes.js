const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const ctrl = require("../controllers/calendarModuleController");

// Used by CalendarPage.vue
router.get("/events", authenticate, ctrl.getEvents); // ?month=3&year=2026
router.post("/events", authenticate, ctrl.createEvent); // create new event
router.delete("/events/:eventId", authenticate, ctrl.deleteEvent); // delete event by id

module.exports = router;
