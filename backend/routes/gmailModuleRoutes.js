const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const ctrl = require("../controllers/gmailModuleController");

router.post("/list", authenticate, ctrl.listEmails);
router.post("/message", authenticate, ctrl.getMessage);
router.post("/thread", authenticate, ctrl.getThread);
router.post("/send", authenticate, ctrl.sendEmail);
router.post("/fetch-older", authenticate, ctrl.fetchOlderEmails); // load next page of older emails from Gmail
router.get("/labels", authenticate, ctrl.getLabels);
router.get("/profile-picture", authenticate, ctrl.getProfilePicture);
router.post("/contact-photos", authenticate, ctrl.getContactPhotos);
router.get("/sync-status", authenticate, ctrl.getSyncStatus);
router.get("/events", authenticate, ctrl.sseEvents);
router.get("/contacts", authenticate, ctrl.getContacts);
router.get("/storage-quota", authenticate, ctrl.getStorageQuota);

module.exports = router;
