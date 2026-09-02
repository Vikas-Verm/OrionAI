"use strict";

const express = require("express");
const multer = require("multer");
const controller = require("../controllers/careerController");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.get("/overview", controller.getOverview);

router.get("/applications", controller.listApplications);
router.post("/applications", controller.createApplication);
router.get("/applications/:applicationId/memory", controller.listApplicationMemory);
router.delete("/applications/:applicationId/memory", controller.clearApplicationMemory);
router.get("/applications/:id", controller.getApplication);
router.patch("/applications/:id", controller.updateApplication);
router.delete("/applications/:id", controller.deleteApplication);

router.get("/interviews", controller.listInterviews);
router.post("/interviews", controller.createInterview);
router.patch("/interviews/:id", controller.updateInterview);
router.delete("/interviews/:id", controller.deleteInterview);

router.get("/follow-ups", controller.listFollowUps);
router.post("/applications/:id/follow-up-draft", controller.draftFollowUp);
router.post("/applications/:id/snooze-follow-up", controller.snoozeFollowUp);
router.post("/applications/:id/mark-follow-up-handled", controller.markFollowUpHandled);

router.get("/memory", controller.listCareerMemory);
router.delete("/memory", controller.clearCareerMemory);
router.delete("/memory/:id", controller.deleteCareerMemory);

router.get("/documents", controller.listDocuments);
router.get("/drive/files", controller.listDriveFiles);
router.post("/documents/upload", upload.single("file"), controller.uploadDocument);
router.post("/documents/drive", controller.attachDriveDocument);
router.patch("/documents/:id", controller.updateDocument);
router.get("/documents/:id/file", controller.openDocumentFile);
router.post("/job-descriptions", controller.createJobDescription);
router.delete("/documents/:id", controller.deleteDocument);

router.post("/applications/:id/resume-match", controller.resumeMatch);

router.post("/interviews/:id/prepare", controller.prepareInterview);
router.post("/interviews/:id/practice", controller.startPractice);
router.post("/practice/:sessionId/answer", controller.answerPractice);

router.get("/email-signals", controller.getEmailSignals);
router.post("/email-signals/:id/accept", controller.acceptEmailSignal);
router.post("/email-signals/:id/ignore", controller.ignoreEmailSignal);

router.get("/offers", controller.listOffers);
router.post("/offers", controller.createOffer);
router.post("/offers/:id/draft-email", controller.draftOfferEmail);

module.exports = router;
