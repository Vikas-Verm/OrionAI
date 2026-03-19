const express = require("express");
const router = express.Router();
const multer = require("multer");
const { authenticate } = require("../middleware/auth");
const ctrl = require("../controllers/gmailModuleController");

// Multer: memory storage, 25 MB per file, max 10 attachments
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

router.post("/list", authenticate, ctrl.listEmails);
router.post("/message", authenticate, ctrl.getMessage);
router.post("/thread", authenticate, ctrl.getThread);
router.post("/send", authenticate, upload.array("attachments"), ctrl.sendEmail);
router.get("/labels", authenticate, ctrl.getLabels);
router.get("/profile-picture", authenticate, ctrl.getProfilePicture);
router.post("/contact-photos", authenticate, ctrl.getContactPhotos);
router.get("/sync-status", authenticate, ctrl.getSyncStatus);
router.get("/events", authenticate, ctrl.sseEvents);
router.get("/contacts", authenticate, ctrl.getContacts);
router.get("/storage-quota", authenticate, ctrl.getStorageQuota);

// NOTE: /fetch-older is removed — pagination now uses Gmail's native
// nextPageToken cursor returned by /list, so no separate "load older" call
// is needed.

module.exports = router;
