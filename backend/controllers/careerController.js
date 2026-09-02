"use strict";

const career = require("../services/careerService");
const JobApplication = require("../models/JobApplication");

function userId(req) {
  return req.user?.username || req.user?.userId || "";
}

function handleError(res, err, fallback = "Career request failed") {
  const status = err?.status || err?.statusCode || 500;
  if (status >= 500) {
    console.error("Career controller error:", err?.message || err);
  }
  res.status(status).json({ error: status >= 500 ? fallback : err.message });
}

exports.getOverview = async (req, res) => {
  try {
    res.json(await career.getOverview(userId(req)));
  } catch (err) {
    handleError(res, err, "Could not load career overview");
  }
};

exports.listApplications = async (req, res) => {
  try {
    res.json({ applications: await career.listApplications(userId(req), req.query || {}) });
  } catch (err) {
    handleError(res, err, "Could not load applications");
  }
};

exports.createApplication = async (req, res) => {
  try {
    const result = await career.createApplication(userId(req), req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, "Could not create application");
  }
};

exports.getApplication = async (req, res) => {
  try {
    const application = await JobApplication.findOne({
      _id: req.params.id,
      userId: userId(req),
    }).lean();
    if (!application) return res.status(404).json({ error: "Application not found" });
    res.json({ application });
  } catch (err) {
    handleError(res, err, "Could not load application");
  }
};

exports.updateApplication = async (req, res) => {
  try {
    const result = await career.updateApplication(userId(req), req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    handleError(res, err, "Could not update application");
  }
};

exports.deleteApplication = async (req, res) => {
  try {
    const application = await career.archiveApplication(userId(req), req.params.id);
    if (!application) return res.status(404).json({ error: "Application not found" });
    res.json({ success: true, application });
  } catch (err) {
    handleError(res, err, "Could not archive application");
  }
};

exports.listInterviews = async (req, res) => {
  try {
    res.json(await career.listInterviews(userId(req), req.query || {}));
  } catch (err) {
    handleError(res, err, "Could not load interviews");
  }
};

exports.createInterview = async (req, res) => {
  try {
    const result = await career.createInterview(userId(req), req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) {
    handleError(res, err, "Could not create interview");
  }
};

exports.updateInterview = async (req, res) => {
  try {
    const result = await career.updateInterview(userId(req), req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    handleError(res, err, "Could not update interview");
  }
};

exports.deleteInterview = async (req, res) => {
  try {
    const interview = await career.archiveInterview(userId(req), req.params.id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    res.json({ success: true, interview });
  } catch (err) {
    handleError(res, err, "Could not archive interview");
  }
};

exports.listDocuments = async (req, res) => {
  try {
    res.json({ documents: await career.listDocuments(userId(req), req.query || {}) });
  } catch (err) {
    handleError(res, err, "Could not load documents");
  }
};

exports.listDriveFiles = async (req, res) => {
  try {
    res.json(await career.listDriveFiles(userId(req), req.query || {}));
  } catch (err) {
    handleError(res, err, "Could not load Google Drive files");
  }
};

exports.attachDriveDocument = async (req, res) => {
  try {
    const result = await career.attachDriveDocument(userId(req), req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) {
    handleError(res, err, "Could not attach Google Drive document");
  }
};

exports.uploadDocument = async (req, res) => {
  try {
    const result = await career.uploadCareerDocument(userId(req), req.file, req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, "Could not upload document");
  }
};

exports.updateDocument = async (req, res) => {
  try {
    const result = await career.updateDocument(userId(req), req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    handleError(res, err, "Could not update document");
  }
};

exports.openDocumentFile = async (req, res) => {
  try {
    const file = await career.getDocumentFile(userId(req), req.params.id);
    if (!file) return res.status(404).json({ error: "Document not found" });
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${file.fileName.replace(/"/g, "")}"`);
    res.sendFile(file.filePath);
  } catch (err) {
    handleError(res, err, "Could not open document");
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const document = await career.archiveDocument(userId(req), req.params.id);
    if (!document) return res.status(404).json({ error: "Document not found" });
    res.json({ success: true, document });
  } catch (err) {
    handleError(res, err, "Could not archive document");
  }
};

exports.createJobDescription = async (req, res) => {
  try {
    const result = await career.createJobDescription(userId(req), req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, "Could not save job description");
  }
};

exports.resumeMatch = async (req, res) => {
  try {
    const result = await career.resumeMatch(userId(req), req.params.id, req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    handleError(res, err, "Could not compare resume and job description");
  }
};

exports.prepareInterview = async (req, res) => {
  try {
    res.json(await career.prepareInterview(userId(req), req.params.id));
  } catch (err) {
    handleError(res, err, "Could not prepare interview");
  }
};

exports.listCareerMemory = async (req, res) => {
  try {
    res.json({ memory: await career.listCareerMemory(userId(req), req.query || {}) });
  } catch (err) {
    handleError(res, err, "Could not load career memory");
  }
};

exports.listApplicationMemory = async (req, res) => {
  try {
    res.json({ memory: await career.listApplicationMemory(userId(req), req.params.applicationId) });
  } catch (err) {
    handleError(res, err, "Could not load application memory");
  }
};

exports.deleteCareerMemory = async (req, res) => {
  try {
    const memory = await career.deleteCareerMemory(userId(req), req.params.id);
    if (!memory) return res.status(404).json({ error: "Memory not found" });
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, "Could not delete career memory");
  }
};

exports.clearApplicationMemory = async (req, res) => {
  try {
    res.json(await career.clearApplicationMemory(userId(req), req.params.applicationId));
  } catch (err) {
    handleError(res, err, "Could not clear application memory");
  }
};

exports.clearCareerMemory = async (req, res) => {
  try {
    res.json(await career.clearCareerMemory(userId(req)));
  } catch (err) {
    handleError(res, err, "Could not clear career memory");
  }
};

exports.startPractice = async (req, res) => {
  try {
    res.status(201).json(await career.startPractice(userId(req), req.params.id, req.body || {}));
  } catch (err) {
    handleError(res, err, "Could not start interview practice");
  }
};

exports.answerPractice = async (req, res) => {
  try {
    const result = await career.answerPractice(userId(req), req.params.sessionId, req.body || {});
    if (!result) return res.status(404).json({ error: "Practice session not found" });
    res.json(result);
  } catch (err) {
    handleError(res, err, "Could not save practice answer");
  }
};

exports.listFollowUps = async (req, res) => {
  try {
    res.json({ followUps: await career.listFollowUps(userId(req)) });
  } catch (err) {
    handleError(res, err, "Could not load follow-ups");
  }
};

exports.draftFollowUp = async (req, res) => {
  try {
    res.json(await career.draftFollowUp(userId(req), req.params.id));
  } catch (err) {
    handleError(res, err, "Could not draft follow-up");
  }
};

exports.snoozeFollowUp = async (req, res) => {
  try {
    const application = await career.snoozeFollowUp(userId(req), req.params.id, req.body || {});
    if (!application) return res.status(404).json({ error: "Application not found" });
    res.json({ application });
  } catch (err) {
    handleError(res, err, "Could not snooze follow-up");
  }
};

exports.markFollowUpHandled = async (req, res) => {
  try {
    const application = await career.markFollowUpHandled(userId(req), req.params.id);
    if (!application) return res.status(404).json({ error: "Application not found" });
    res.json({ application });
  } catch (err) {
    handleError(res, err, "Could not mark follow-up handled");
  }
};

exports.getEmailSignals = async (req, res) => {
  try {
    res.json(await career.getEmailSignals(userId(req)));
  } catch (err) {
    handleError(res, err, "Could not load career email signals");
  }
};

exports.acceptEmailSignal = async (req, res) => {
  try {
    res.json(await career.acceptEmailSignal(userId(req), req.params.id, req.body || {}));
  } catch (err) {
    handleError(res, err, "Could not accept career email signal");
  }
};

exports.ignoreEmailSignal = async (req, res) => {
  try {
    res.json(await career.ignoreEmailSignal(userId(req), req.params.id, req.body || {}));
  } catch (err) {
    handleError(res, err, "Could not ignore career email signal");
  }
};

exports.listOffers = async (req, res) => {
  try {
    res.json({ offers: await career.listOffers(userId(req)) });
  } catch (err) {
    handleError(res, err, "Could not load offers");
  }
};

exports.createOffer = async (req, res) => {
  try {
    const result = await career.createOffer(userId(req), req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, "Could not create offer");
  }
};

exports.draftOfferEmail = async (req, res) => {
  try {
    const result = await career.draftOfferEmail(userId(req), req.params.id, req.body?.type);
    if (!result) return res.status(404).json({ error: "Offer not found" });
    res.json(result);
  } catch (err) {
    handleError(res, err, "Could not draft offer email");
  }
};
