"use strict";

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const dns = require("dns/promises");
const net = require("net");
const mongoose = require("mongoose");
const pdf = require("pdf-parse-new");
const mammoth = require("mammoth");
const { google } = require("googleapis");

const JobApplication = require("../models/JobApplication");
const InterviewEvent = require("../models/InterviewEvent");
const CareerDocument = require("../models/CareerDocument");
const InterviewPracticeSession = require("../models/InterviewPracticeSession");
const CareerEmailSignal = require("../models/CareerEmailSignal");
const CareerOffer = require("../models/CareerOffer");
const CareerMemory = require("../models/CareerMemory");
const Integration = require("../models/Integration");
const { chatComplete } = require("./llmService");
const { toolGmailSearchEmails, toolGmailGetEmail } = require("./tools/toolGmail");
const { calendarGetEvents } = require("./tools/toolCalendar");
const {
  GOOGLE_DOCS_MIME,
  getAuthorizedClient: getGoogleDocsAuthorizedClient,
  documentToPlainText,
  mapFilePermissions,
} = require("./googleDocsService");

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_JOB_PAGE_BYTES = 900 * 1024;
const JOB_PAGE_TIMEOUT_MS = 8000;
const JOB_PAGE_REDIRECT_LIMIT = 3;
const STORAGE_DIR = path.join(__dirname, "..", "uploads", "career-documents");
const DRIVE_READ_ERROR = "OrionAI could not read this file yet.";
const DRIVE_PERMISSION_ERROR =
  "Google Drive permission is unavailable. Reconnect Google Docs/Drive, then try again.";
const DRIVE_SUPPORTED_MIME_TYPES = [
  GOOGLE_DOCS_MIME,
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];
const CAREER_SEARCH_QUERY = [
  "(interview OR recruiter OR recruitment OR application OR applied OR assessment",
  "OR assignment OR offer OR rejection OR \"HR screening\" OR \"coding test\")",
  "newer_than:90d",
].join(" ");

function cleanString(value, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanArray(value, maxItems = 20, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function objectId(value) {
  if (!value) return null;
  if (!mongoose.Types.ObjectId.isValid(String(value))) return null;
  return new mongoose.Types.ObjectId(String(value));
}

function parseDate(value) {
  if (value === null || value === "") return null;
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function safeUrl(value) {
  const raw = cleanString(value, 1200);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function validateEnum(value, allowed, fallback = "") {
  const cleaned = cleanString(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  return allowed.includes(cleaned) ? cleaned : fallback;
}

function normalizeApplicationPayload(body = {}, { partial = false } = {}) {
  const payload = {};
  if ("company" in body || !partial) {
    payload.company = cleanString(body.company, 180);
    if (!payload.company) return { error: "company is required" };
  }
  if ("role" in body || !partial) {
    payload.role = cleanString(body.role, 180);
    if (!payload.role) return { error: "role is required" };
  }
  if ("status" in body) {
    const status = validateEnum(body.status, JobApplication.STATUS_VALUES);
    if (!status) return { error: `Invalid status. Allowed: ${JobApplication.STATUS_VALUES.join(", ")}` };
    payload.status = status;
  } else if (!partial) {
    payload.status = "interested";
  }
  if ("source" in body) payload.source = cleanString(body.source, 160);
  if ("sourceUrl" in body || "jobUrl" in body) {
    const url = safeUrl(body.sourceUrl || body.jobUrl);
    if ((body.sourceUrl || body.jobUrl) && !url) return { error: "sourceUrl must be a valid http(s) URL" };
    payload.sourceUrl = url;
  }
  if ("location" in body) payload.location = cleanString(body.location, 180);
  if ("workMode" in body) {
    const workMode = validateEnum(body.workMode, JobApplication.WORK_MODE_VALUES, "");
    if (body.workMode && !workMode) return { error: `Invalid workMode. Allowed: remote, hybrid, onsite` };
    payload.workMode = workMode;
  }
  if ("employmentType" in body) {
    const employmentType = validateEnum(body.employmentType, JobApplication.EMPLOYMENT_TYPE_VALUES, "");
    if (body.employmentType && !employmentType) return { error: "Invalid employmentType" };
    payload.employmentType = employmentType;
  }
  if ("appliedAt" in body || "appliedDate" in body) {
    const date = parseDate(body.appliedAt || body.appliedDate);
    if (date === undefined && (body.appliedAt || body.appliedDate)) return { error: "Invalid appliedAt" };
    payload.appliedAt = date || null;
  }
  if ("nextFollowUpAt" in body || "followUpDate" in body) {
    const date = parseDate(body.nextFollowUpAt || body.followUpDate);
    if (date === undefined && (body.nextFollowUpAt || body.followUpDate)) {
      return { error: "Invalid nextFollowUpAt" };
    }
    payload.nextFollowUpAt = date || null;
    payload.followUpHandledAt = null;
  }
  if ("salaryText" in body) payload.salaryText = cleanString(body.salaryText, 500);
  if ("jobDescriptionId" in body) payload.jobDescriptionId = objectId(body.jobDescriptionId);
  if ("resumeId" in body) payload.resumeId = objectId(body.resumeId);
  if ("sourceApp" in body) {
    payload.sourceApp = validateEnum(body.sourceApp, JobApplication.SOURCE_APP_VALUES, "manual");
  }
  if ("sourceRef" in body) payload.sourceRef = cleanString(body.sourceRef, 300);
  if ("notes" in body) payload.notes = cleanString(body.notes, 10000);
  if ("tags" in body) payload.tags = cleanArray(body.tags, 20, 40);
  return { payload };
}

function normalizeInterviewPayload(body = {}, { partial = false } = {}) {
  const payload = {};
  if ("applicationId" in body) payload.applicationId = objectId(body.applicationId);
  if ("company" in body || !partial) {
    payload.company = cleanString(body.company, 180);
    if (!payload.company) return { error: "company is required" };
  }
  if ("role" in body) payload.role = cleanString(body.role, 180);
  if ("scheduledAt" in body || !partial) {
    const date = parseDate(body.scheduledAt);
    if (!date) return { error: "scheduledAt is required" };
    payload.scheduledAt = date;
  }
  if ("timezone" in body) payload.timezone = cleanString(body.timezone, 80) || "UTC";
  if ("durationMinutes" in body) {
    const minutes = Number(body.durationMinutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 24 * 60) {
      return { error: "durationMinutes must be between 1 and 1440" };
    }
    payload.durationMinutes = Math.round(minutes);
  }
  if ("roundType" in body) {
    const roundType = validateEnum(body.roundType, InterviewEvent.ROUND_TYPE_VALUES, "");
    if (body.roundType && !roundType) return { error: "Invalid roundType" };
    payload.roundType = roundType;
  }
  if ("interviewerNames" in body) payload.interviewerNames = cleanArray(body.interviewerNames, 10, 100);
  if ("meetingUrl" in body) {
    const url = safeUrl(body.meetingUrl);
    payload.meetingUrl = body.meetingUrl && !url ? cleanString(body.meetingUrl, 800) : url;
  }
  if ("location" in body) payload.location = cleanString(body.location, 500);
  if ("sourceApp" in body) payload.sourceApp = validateEnum(body.sourceApp, InterviewEvent.SOURCE_APP_VALUES, "manual");
  if ("sourceRef" in body) payload.sourceRef = cleanString(body.sourceRef, 300);
  if ("prepStatus" in body) {
    const prepStatus = validateEnum(body.prepStatus, InterviewEvent.PREP_STATUS_VALUES);
    if (!prepStatus) return { error: "Invalid prepStatus" };
    payload.prepStatus = prepStatus;
  }
  if ("notes" in body) payload.notes = cleanString(body.notes, 10000);
  if ("status" in body) {
    const status = validateEnum(body.status, InterviewEvent.STATUS_VALUES);
    if (!status) return { error: "Invalid status" };
    payload.status = status;
  }
  return { payload };
}

function normalizeOfferPayload(body = {}, { partial = false } = {}) {
  const payload = {};
  if ("applicationId" in body) payload.applicationId = objectId(body.applicationId);
  if ("company" in body || !partial) {
    payload.company = cleanString(body.company, 180);
    if (!payload.company) return { error: "company is required" };
  }
  if ("role" in body || !partial) {
    payload.role = cleanString(body.role, 180);
    if (!payload.role) return { error: "role is required" };
  }
  if ("status" in body) {
    const status = validateEnum(body.status, CareerOffer.STATUS_VALUES);
    if (!status) return { error: "Invalid offer status" };
    payload.status = status;
  }
  if ("compensationText" in body) payload.compensationText = cleanString(body.compensationText, 2000);
  if ("deadline" in body) {
    const deadline = parseDate(body.deadline);
    if (deadline === undefined && body.deadline) return { error: "Invalid deadline" };
    payload.deadline = deadline || null;
  }
  if ("notes" in body) payload.notes = cleanString(body.notes, 10000);
  if ("offerDocumentId" in body) payload.offerDocumentId = objectId(body.offerDocumentId);
  if ("followUpReminderAt" in body) {
    const date = parseDate(body.followUpReminderAt);
    if (date === undefined && body.followUpReminderAt) return { error: "Invalid followUpReminderAt" };
    payload.followUpReminderAt = date || null;
  }
  return { payload };
}

function publicDoc(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  delete obj.storageKey;
  obj.canOpenFile = obj.storageProvider === "local" && obj.processingStatus !== "archived";
  obj.canOpenSource = Boolean(obj.sourceUrl);
  return obj;
}

function publicMemory(memory) {
  if (!memory) return null;
  return typeof memory.toObject === "function" ? memory.toObject() : { ...memory };
}

function isDrivePermissionError(error) {
  const status = error?.statusCode || error?.status || error?.response?.status;
  return status === 401 || status === 403 || /permission|unauthorized|forbidden/i.test(error?.message || "");
}

function isDriveNotFoundError(error) {
  const status = error?.statusCode || error?.status || error?.response?.status;
  return status === 404;
}

function driveErrorMessage(error) {
  if (isDrivePermissionError(error)) return DRIVE_PERMISSION_ERROR;
  if (isDriveNotFoundError(error)) return "Google Drive file was not found or is no longer shared with OrionAI.";
  return "Could not load Google Drive files.";
}

function escapeDriveQuery(value = "") {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function sanitizeFileName(name = "career-document") {
  const base = path.basename(String(name || "career-document"));
  return base.replace(/[^a-zA-Z0-9._ -]+/g, "_").slice(0, 160);
}

function inferDocumentType(file = {}) {
  const name = String(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();
  if (name.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (name.endsWith(".docx") || mime.includes("wordprocessingml.document")) return "docx";
  if (name.endsWith(".txt") || mime.startsWith("text/")) return "txt";
  return "";
}

function validateUpload(file) {
  if (!file) return "No file uploaded";
  if (!file.size) return "Uploaded file is empty";
  if (file.size > MAX_FILE_SIZE) return "File is too large. Maximum size is 15MB.";
  if (!inferDocumentType(file)) return "Unsupported file type. Upload PDF, DOCX, or TXT.";
  return "";
}

async function extractTextFromUpload(file, fileType) {
  if (fileType === "txt") return cleanString(file.buffer.toString("utf8"), 200000);
  if (fileType === "pdf") {
    const parsed = await pdf(file.buffer);
    return cleanString(parsed.text || "", 200000);
  }
  if (fileType === "docx") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return cleanString(result.value || "", 200000);
  }
  return "";
}

function normalizeDriveFile(file = {}) {
  const permissions = mapFilePermissions(file);
  return {
    id: file.id || file.fileId || "",
    name: file.name || file.title || "Untitled document",
    mimeType: file.mimeType || "",
    size: Number(file.size || 0),
    modifiedTime: file.modifiedTime || null,
    webViewLink: file.webViewLink || file.webViewUrl || "",
    iconLink: file.iconLink || "",
    permissions,
    supported: DRIVE_SUPPORTED_MIME_TYPES.includes(file.mimeType || ""),
  };
}

async function makeCareerDriveClient(userId) {
  const auth = await getGoogleDocsAuthorizedClient(userId);
  const drive = google.drive({ version: "v3", auth });
  const docs = google.docs({ version: "v1", auth });

  return {
    async listFiles({ query = "", limit = 20 } = {}) {
      const mimeQuery = DRIVE_SUPPORTED_MIME_TYPES
        .map((mimeType) => `mimeType='${mimeType}'`)
        .join(" or ");
      const parts = [`trashed=false`, `(${mimeQuery})`];
      const cleanedQuery = cleanString(query, 120);
      if (cleanedQuery) parts.push(`name contains '${escapeDriveQuery(cleanedQuery)}'`);
      const response = await drive.files.list({
        q: parts.join(" and "),
        orderBy: "modifiedTime desc",
        pageSize: Math.min(Math.max(Number(limit) || 20, 1), 50),
        fields:
          "files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,capabilities(canDownload,canEdit,canModifyContent))",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      return (response.data.files || []).map(normalizeDriveFile);
    },
    async getFileMetadata(fileId) {
      const response = await drive.files.get({
        fileId,
        fields:
          "id,name,mimeType,size,modifiedTime,webViewLink,iconLink,capabilities(canDownload,canEdit,canModifyContent)",
        supportsAllDrives: true,
      });
      return normalizeDriveFile(response.data || {});
    },
    async getFileText(file) {
      const normalized = normalizeDriveFile(file);
      if (!normalized.permissions.canDownload) {
        const error = new Error("You do not have permission to download this file.");
        error.statusCode = 403;
        throw error;
      }
      if (normalized.mimeType === GOOGLE_DOCS_MIME) {
        const response = await docs.documents.get({ documentId: normalized.id });
        return documentToPlainText(response.data || {});
      }
      const response = await drive.files.get(
        { fileId: normalized.id, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" }
      );
      const buffer = Buffer.from(response.data || []);
      if (normalized.mimeType === "text/plain") return buffer.toString("utf8");
      if (normalized.mimeType === "application/pdf") {
        const parsed = await pdf(buffer);
        return parsed.text || "";
      }
      if (normalized.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const result = await mammoth.extractRawText({ buffer });
        return result.value || "";
      }
      return "";
    },
  };
}

async function hasGoogleDocsDriveConnection(userId) {
  const integration = await Integration.findOne({ userId, type: "google_docs", enabled: true });
  return Boolean(integration?.googleDocs?.accessToken || integration?.googleDocs?.refreshToken);
}

function resolveStoragePath(storageKey = "") {
  const resolved = path.resolve(STORAGE_DIR, String(storageKey || ""));
  const root = path.resolve(STORAGE_DIR);
  if (resolved !== root && resolved.startsWith(`${root}${path.sep}`)) return resolved;
  const err = new Error("Invalid document storage path");
  err.status = 400;
  throw err;
}

async function assertDocumentOwnership(userId, documentId, allowedTypes = []) {
  if (!documentId) return null;
  const filter = { _id: documentId, userId, processingStatus: { $ne: "archived" } };
  if (allowedTypes.length) filter.type = { $in: allowedTypes };
  const doc = await CareerDocument.findOne(filter);
  if (!doc) {
    const err = new Error("Document not found");
    err.status = 404;
    throw err;
  }
  return doc;
}

async function assertApplicationOwnership(userId, applicationId) {
  if (!applicationId) return null;
  const app = await JobApplication.findOne({
    _id: applicationId,
    userId,
    status: { $ne: "archived" },
  });
  if (!app) {
    const err = new Error("Application not found");
    err.status = 404;
    throw err;
  }
  return app;
}

async function assertInterviewOwnership(userId, interviewId) {
  const interview = await InterviewEvent.findOne({
    _id: interviewId,
    userId,
    status: { $ne: "archived" },
  });
  if (!interview) {
    const err = new Error("Interview not found");
    err.status = 404;
    throw err;
  }
  return interview;
}

function documentHasUsableText(doc) {
  return Boolean(doc?.extractedText && doc.processingStatus !== "failed" && !doc.sourceUnavailable);
}

function unavailableDocumentError(doc, label) {
  const noun = label.toLowerCase();
  if (!doc) return `Select a ${noun} before running this action.`;
  if (doc?.sourceUnavailable) {
    return `${label} source is unavailable. Reconnect Google Docs/Drive or reattach the file.`;
  }
  if (doc.processingStatus === "processing" || doc.processingStatus === "uploaded") {
    return `${label} is still being processed. Try again in a moment.`;
  }
  if (doc.processingStatus === "failed") {
    if (/no extractable|no readable|empty/i.test(doc.processingError || "")) {
      return `No readable text was found in this ${noun}.`;
    }
    return `OrionAI couldn't read this ${noun}. Try another file or upload it again.`;
  }
  return `No readable text was found in this ${noun}.`;
}

async function resolveResumeForApplication(userId, application, resumeId) {
  const explicitId = objectId(resumeId);
  if (explicitId) return assertDocumentOwnership(userId, explicitId, ["resume"]);
  if (application?.resumeId) return assertDocumentOwnership(userId, application.resumeId, ["resume"]);
  return CareerDocument.findOne({
    userId,
    type: "resume",
    isPrimary: true,
    processingStatus: { $ne: "archived" },
  });
}

async function resolveJobDescriptionForApplication(userId, application, jobDescriptionId) {
  const explicitId = objectId(jobDescriptionId);
  if (explicitId) return assertDocumentOwnership(userId, explicitId, ["job_description"]);
  if (application?.jobDescriptionId) {
    return assertDocumentOwnership(userId, application.jobDescriptionId, ["job_description"]);
  }
  return null;
}

async function createCareerMemory(userId, body = {}) {
  const memoryType = validateEnum(body.memoryType, CareerMemory.MEMORY_TYPE_VALUES, "");
  if (!memoryType) return { error: "Invalid memoryType" };
  const title = cleanString(body.title, 180);
  if (!title) return { error: "title is required" };
  const applicationId = objectId(body.applicationId);
  const interviewId = objectId(body.interviewId);
  if (applicationId) await assertApplicationOwnership(userId, applicationId);
  if (interviewId) await assertInterviewOwnership(userId, interviewId);
  const sourceType = validateEnum(body.sourceType || "other", CareerMemory.SOURCE_TYPE_VALUES, "other");
  const confidence = Math.max(0, Math.min(1, Number(body.confidence ?? 0.8)));
  const memory = await CareerMemory.create({
    userId,
    applicationId,
    interviewId,
    memoryType,
    title,
    content: cleanString(body.content, 4000),
    sourceType,
    sourceRef: cleanString(body.sourceRef, 500),
    confidence,
    userApproved: body.userApproved === true,
  });
  return { memory: publicMemory(memory) };
}

async function listCareerMemory(userId, params = {}) {
  const applicationId = objectId(params.applicationId);
  const filter = { userId };
  if (applicationId) {
    await assertApplicationOwnership(userId, applicationId);
    filter.applicationId = applicationId;
  }
  const memories = await CareerMemory.find(filter).sort({ updatedAt: -1 }).limit(100).lean();
  return memories.map(publicMemory);
}

async function listApplicationMemory(userId, applicationId) {
  const appId = objectId(applicationId);
  if (!appId) return [];
  await assertApplicationOwnership(userId, appId);
  return listCareerMemory(userId, { applicationId: appId });
}

async function deleteCareerMemory(userId, id) {
  const memoryId = objectId(id);
  if (!memoryId) return null;
  return CareerMemory.findOneAndDelete({ _id: memoryId, userId });
}

async function clearApplicationMemory(userId, applicationId) {
  const appId = objectId(applicationId);
  if (!appId) return { deletedCount: 0 };
  await assertApplicationOwnership(userId, appId);
  const result = await CareerMemory.deleteMany({ userId, applicationId: appId });
  return { deletedCount: result.deletedCount || 0 };
}

async function clearCareerMemory(userId) {
  const result = await CareerMemory.deleteMany({ userId });
  return { deletedCount: result.deletedCount || 0 };
}

async function loadRelevantCareerMemory(userId, { applicationId, interviewId } = {}) {
  const conditions = [{ applicationId: null, interviewId: null }];
  const appId = objectId(applicationId);
  const intId = objectId(interviewId);
  if (appId) conditions.push({ applicationId: appId });
  if (intId) conditions.push({ interviewId: intId });
  const memories = await CareerMemory.find({ userId, $or: conditions })
    .sort({ userApproved: -1, lastUsedAt: -1, updatedAt: -1 })
    .limit(12)
    .lean();
  if (memories.length) {
    await CareerMemory.updateMany(
      { userId, _id: { $in: memories.map((memory) => memory._id) } },
      { $set: { lastUsedAt: new Date() } }
    );
  }
  return memories.map(publicMemory);
}

async function rememberPracticeFeedback(userId, session, feedback) {
  try {
    const missing = (feedback?.missing || []).map((item) => cleanString(item, 220)).filter(Boolean);
    if (!missing.length) return;
    await CareerMemory.findOneAndUpdate(
      {
        userId,
        sourceType: "practice",
        sourceRef: String(session._id),
        memoryType: "interview_feedback",
      },
      {
        $set: {
          userId,
          applicationId: session.applicationId || null,
          interviewId: session.interviewId || null,
          memoryType: "interview_feedback",
          title: `Practice feedback: ${statusLabelForMemory(session.type)}`,
          content: missing.slice(0, 4).join(" "),
          sourceType: "practice",
          sourceRef: String(session._id),
          confidence: 0.85,
          userApproved: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch {
    // Memory is supplemental; practice persistence must remain the source of truth.
  }
}

async function rememberResumeMatchGaps(userId, applicationId, match) {
  try {
    const gaps = (match?.missingEvidence || [])
      .map((item) => cleanString(item.requirement || item.jdRequirement, 220))
      .filter(Boolean);
    if (!gaps.length) return;
    await CareerMemory.findOneAndUpdate(
      {
        userId,
        applicationId,
        sourceType: "resume_match",
        sourceRef: String(applicationId),
        memoryType: "jd_gap",
      },
      {
        $set: {
          userId,
          applicationId,
          memoryType: "jd_gap",
          title: "Repeated JD gaps to review",
          content: gaps.slice(0, 5).join("\n"),
          sourceType: "resume_match",
          sourceRef: String(applicationId),
          confidence: 0.75,
          userApproved: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch {
    // Matching remains grounded in documents even if supplemental memory is unavailable.
  }
}

function statusLabelForMemory(value = "") {
  return String(value || "role specific").replace(/_/g, " ");
}

function memoryPrepLines(memories = []) {
  return memories
    .map((memory) => {
      const title = cleanString(memory.title, 160);
      if (!title) return "";
      if (["weak_area", "jd_gap", "interview_feedback"].includes(memory.memoryType)) {
        return `Previous practice suggests ${title} needs another review.`;
      }
      if (memory.memoryType === "behavioral_story") {
        return `User-provided behavioral story available: ${title}. Reuse only the saved facts.`;
      }
      return `Saved career memory: ${title}.`;
    })
    .filter(Boolean)
    .slice(0, 8);
}

async function listApplications(userId, params = {}) {
  const filter = { userId };
  if (params.includeArchived !== "true") filter.status = { $ne: "archived" };
  if (params.status && JobApplication.STATUS_VALUES.includes(params.status)) filter.status = params.status;
  return JobApplication.find(filter).sort({ updatedAt: -1 }).lean();
}

async function createApplication(userId, body = {}) {
  const { error, payload } = normalizeApplicationPayload(body);
  if (error) return { error };
  if (payload.resumeId) await assertDocumentOwnership(userId, payload.resumeId, ["resume"]);
  if (payload.jobDescriptionId) await assertDocumentOwnership(userId, payload.jobDescriptionId, ["job_description"]);
  const application = await JobApplication.create({ ...payload, userId });
  return { application };
}

async function updateApplication(userId, id, body = {}) {
  const { error, payload } = normalizeApplicationPayload(body, { partial: true });
  if (error) return { error };
  if (payload.resumeId) await assertDocumentOwnership(userId, payload.resumeId, ["resume"]);
  if (payload.jobDescriptionId) await assertDocumentOwnership(userId, payload.jobDescriptionId, ["job_description"]);
  const application = await JobApplication.findOneAndUpdate(
    { _id: id, userId },
    { $set: payload },
    { new: true, runValidators: true }
  );
  if (!application) return { error: "Application not found", status: 404 };
  return { application };
}

async function archiveApplication(userId, id) {
  const application = await JobApplication.findOneAndUpdate(
    { _id: id, userId },
    { $set: { status: "archived", archivedAt: new Date() } },
    { new: true }
  );
  if (!application) return null;
  return application;
}

async function listInterviews(userId, params = {}) {
  const now = new Date();
  const filter = { userId };
  if (params.includeArchived !== "true") filter.status = { $ne: "archived" };
  if (params.upcoming === "true") {
    filter.scheduledAt = { $gte: now };
    filter.status = "scheduled";
  }
  const interviews = await InterviewEvent.find(filter).sort({ scheduledAt: 1 }).lean();
  const calendarSuggestions = await getCalendarInterviewSignals(userId).catch(() => []);
  return { interviews, calendarSuggestions };
}

async function createInterview(userId, body = {}) {
  const { error, payload } = normalizeInterviewPayload(body);
  if (error) return { error };
  if (payload.sourceApp && payload.sourceRef && payload.sourceApp !== "manual") {
    const existing = await InterviewEvent.findOne({
      userId,
      sourceApp: payload.sourceApp,
      sourceRef: payload.sourceRef,
      status: { $ne: "archived" },
    });
    if (existing) return { interview: existing, duplicate: true };
  }
  const app = await assertApplicationOwnership(userId, payload.applicationId);
  if (app) {
    payload.company = payload.company || app.company;
    payload.role = payload.role || app.role;
  }
  const interview = await InterviewEvent.create({ ...payload, userId });
  if (app && app.status !== "archived") {
    await JobApplication.updateOne(
      { _id: app._id, userId },
      { $set: { status: "interviewing" } }
    );
  }
  return { interview };
}

async function updateInterview(userId, id, body = {}) {
  const { error, payload } = normalizeInterviewPayload(body, { partial: true });
  if (error) return { error };
  if (payload.applicationId) await assertApplicationOwnership(userId, payload.applicationId);
  const interview = await InterviewEvent.findOneAndUpdate(
    { _id: id, userId },
    { $set: payload },
    { new: true, runValidators: true }
  );
  if (!interview) return { error: "Interview not found", status: 404 };
  return { interview };
}

async function archiveInterview(userId, id) {
  return InterviewEvent.findOneAndUpdate(
    { _id: id, userId },
    { $set: { status: "archived" } },
    { new: true }
  );
}

async function uploadCareerDocument(userId, file, body = {}) {
  const validation = validateUpload(file);
  if (validation) return { error: validation };
  const type = validateEnum(body.type || "resume", CareerDocument.TYPE_VALUES, "other");
  const safeName = sanitizeFileName(file.originalname);
  const storageKey = `${userId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const absolutePath = path.join(STORAGE_DIR, storageKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, file.buffer);

  let extractedText = "";
  let processingStatus = "ready";
  let processingError = "";
  try {
    extractedText = await extractTextFromUpload(file, inferDocumentType(file));
    if (!extractedText) {
      processingStatus = "failed";
      processingError = "No extractable text found.";
    }
  } catch {
    processingStatus = "failed";
    processingError = "Could not process this document.";
  }

  if (type === "resume" && body.isPrimary === "true") {
    await CareerDocument.updateMany({ userId, type: "resume" }, { $set: { isPrimary: false } });
  }

  const document = await CareerDocument.create({
    userId,
    type,
    title: cleanString(body.title, 180) || safeName,
    originalFileName: safeName,
    mimeType: file.mimetype || "",
    size: file.size || 0,
    storageProvider: "local",
    storageKey,
    sourceApp: "upload",
    extractedText,
    processingStatus,
    processingError,
    isPrimary: type === "resume" && body.isPrimary === "true",
  });

  return { document: publicDoc(document) };
}

async function listDocuments(userId, params = {}) {
  const filter = { userId, processingStatus: { $ne: "archived" } };
  if (params.type && CareerDocument.TYPE_VALUES.includes(params.type)) filter.type = params.type;
  const docs = await CareerDocument.find(filter).sort({ isPrimary: -1, updatedAt: -1 }).lean();
  return docs.map(publicDoc);
}

async function listDriveFiles(userId, params = {}, options = {}) {
  try {
    if (!(await hasGoogleDocsDriveConnection(userId))) {
      return { connected: false, files: [], error: "Google Docs/Drive is not connected." };
    }
    const client = options.driveClient || (await makeCareerDriveClient(userId));
    return {
      connected: true,
      files: await client.listFiles({
        query: params.query || params.q || "",
        limit: params.limit,
      }),
    };
  } catch (error) {
    return {
      connected: true,
      files: [],
      error: driveErrorMessage(error),
    };
  }
}

async function attachDriveDocument(userId, body = {}, options = {}) {
  const fileId = cleanString(body.fileId || body.sourceRef, 500);
  if (!fileId) return { error: "fileId is required", status: 400 };

  const type = validateEnum(body.type || "other", CareerDocument.TYPE_VALUES, "other");
  const existing = await CareerDocument.findOne({
    userId,
    sourceApp: { $in: ["google_docs", "google_drive"] },
    sourceRef: fileId,
    processingStatus: { $ne: "archived" },
  });
  if (existing) return { document: publicDoc(existing), duplicate: true };

  try {
    if (!(await hasGoogleDocsDriveConnection(userId))) {
      return { error: "Google Docs/Drive is not connected.", status: 400 };
    }
    const client = options.driveClient || (await makeCareerDriveClient(userId));
    const file = normalizeDriveFile(await client.getFileMetadata(fileId));
    if (!DRIVE_SUPPORTED_MIME_TYPES.includes(file.mimeType)) {
      return { error: "Unsupported Drive file type. Choose Google Docs, PDF, DOCX, or TXT.", status: 400 };
    }

    let extractedText = "";
    let processingStatus = "ready";
    let processingError = "";
    let sourceUnavailable = false;
    try {
      extractedText = cleanString(await client.getFileText(file), 200000);
      if (!extractedText) {
        processingStatus = "failed";
        processingError = DRIVE_READ_ERROR;
      }
    } catch (error) {
      if (isDrivePermissionError(error)) {
        sourceUnavailable = true;
        processingStatus = "failed";
        processingError = DRIVE_PERMISSION_ERROR;
      } else {
        processingStatus = "failed";
        processingError = DRIVE_READ_ERROR;
      }
    }

    if (type === "resume" && body.isPrimary === true) {
      await CareerDocument.updateMany({ userId, type: "resume" }, { $set: { isPrimary: false } });
    }

    const document = await CareerDocument.create({
      userId,
      type,
      title: cleanString(body.title, 180) || file.name,
      originalFileName: file.name,
      mimeType: file.mimeType,
      size: file.size,
      storageProvider: "google_drive",
      sourceApp: file.mimeType === GOOGLE_DOCS_MIME ? "google_docs" : "google_drive",
      sourceRef: file.id,
      sourceUrl: file.webViewLink,
      sourceUnavailable,
      lastSourceCheckedAt: new Date(),
      extractedText,
      processingStatus,
      processingError,
      isPrimary: type === "resume" && body.isPrimary === true,
    });

    return { document: publicDoc(document) };
  } catch (error) {
    return { error: driveErrorMessage(error), status: isDrivePermissionError(error) ? 403 : 400 };
  }
}

async function updateDocument(userId, id, body = {}) {
  const payload = {};
  if ("title" in body) {
    payload.title = cleanString(body.title, 180);
    if (!payload.title) return { error: "title is required" };
  }
  if ("isPrimary" in body) payload.isPrimary = body.isPrimary === true;
  if (payload.isPrimary) {
    await CareerDocument.updateMany({ userId, type: "resume", _id: { $ne: id } }, { $set: { isPrimary: false } });
  }
  const document = await CareerDocument.findOneAndUpdate(
    { _id: id, userId, processingStatus: { $ne: "archived" } },
    { $set: payload },
    { new: true, runValidators: true }
  );
  if (!document) return { error: "Document not found", status: 404 };
  return { document: publicDoc(document) };
}

async function getDocumentFile(userId, id) {
  const document = await CareerDocument.findOne({
    _id: id,
    userId,
    processingStatus: { $ne: "archived" },
  }).select("+storageKey");
  if (!document) return null;
  if (document.storageProvider !== "local" || !document.storageKey) {
    const err = new Error("No local file is available for this document.");
    err.status = 404;
    throw err;
  }
  const filePath = resolveStoragePath(document.storageKey);
  await fs.access(filePath);
  return {
    document,
    filePath,
    fileName: sanitizeFileName(document.originalFileName || document.title || "career-document"),
    mimeType: document.mimeType || "application/octet-stream",
  };
}

async function archiveDocument(userId, id) {
  const document = await CareerDocument.findOneAndUpdate(
    { _id: id, userId },
    { $set: { processingStatus: "archived", archivedAt: new Date(), isPrimary: false } },
    { new: true }
  );
  return document ? publicDoc(document) : null;
}

async function createJobDescription(userId, body = {}) {
  const title = cleanString(body.title, 180) || cleanString(body.role, 120) || "Job description";
  const text = cleanString(body.text || body.jobDescription || body.content, 120000);
  const sourceUrl = safeUrl(body.sourceUrl || body.jobUrl);
  if (!text && !sourceUrl && !body.sourceRef) return { error: "Job description text, URL, or source is required" };
  if ((body.sourceUrl || body.jobUrl) && !sourceUrl) return { error: "sourceUrl must be a valid http(s) URL" };
  const document = await CareerDocument.create({
    userId,
    type: "job_description",
    title,
    sourceApp: validateEnum(body.sourceApp || "manual", CareerDocument.SOURCE_APP_VALUES, "manual"),
    sourceRef: cleanString(body.sourceRef, 500),
    sourceUrl,
    extractedText: text,
    processingStatus: text ? "ready" : "uploaded",
  });
  if (body.applicationId) {
    await JobApplication.updateOne(
      { _id: body.applicationId, userId },
      { $set: { jobDescriptionId: document._id } }
    );
  }
  return { document: publicDoc(document) };
}

function isPrivateAddress(address = "") {
  const ipVersion = net.isIP(address);
  if (ipVersion === 4) {
    const parts = address.split(".").map((part) => Number(part));
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (ipVersion === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.") ||
      normalized.startsWith("::ffff:169.254.")
    );
  }
  return false;
}

async function validatePublicJobUrl(value, options = {}) {
  const raw = cleanString(value, 1200);
  if (!raw) return { error: "Job link is required" };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: "Enter a valid job link." };
  }
  if (url.protocol !== "https:") return { error: "Only https job links are supported." };
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal" ||
    hostname === "169.254.169.254" ||
    isPrivateAddress(hostname)
  ) {
    return { error: "This job link cannot be imported for security reasons." };
  }
  if (!options.skipDnsLookup) {
    try {
      const records = await dns.lookup(hostname, { all: true, verbatim: true });
      if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
        return { error: "This job link cannot be imported for security reasons." };
      }
    } catch {
      return { error: "OrionAI couldn't access this job page." };
    }
  }
  return { url: url.toString() };
}

function decodeHtml(value = "") {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(html = "") {
  return decodeHtml(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|div|section|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findJobPosting(value) {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  const type = value["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((item) => String(item || "").toLowerCase() === "jobposting")) return value;
  if (value["@graph"]) return findJobPosting(value["@graph"]);
  return null;
}

function extractJsonLdJobPosting(html = "") {
  const scripts = String(html || "").match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const body = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const found = findJobPosting(JSON.parse(decodeHtml(body)));
      if (found) return found;
    } catch {
      continue;
    }
  }
  return null;
}

function textFromStructured(value) {
  if (!value) return "";
  if (typeof value === "string") return htmlToText(value);
  if (Array.isArray(value)) return value.map(textFromStructured).filter(Boolean).join("\n");
  if (typeof value === "object") {
    return Object.values(value).map(textFromStructured).filter(Boolean).join("\n");
  }
  return "";
}

function titleFromHtml(html = "") {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanString(decodeHtml(match?.[1] || ""), 220);
}

function looksLikeJobListing({ html = "", text = "" } = {}) {
  if (extractJsonLdJobPosting(html)) return true;
  return /\b(job|role|position|apply|responsibilities|requirements|qualifications|employment|salary|benefits)\b/i.test(text);
}

function splitListFromText(text = "", pattern) {
  const lines = String(text || "")
    .split(/\n|•|-/)
    .map((line) => cleanString(line.replace(/\s+/g, " "), 180))
    .filter(Boolean);
  if (!pattern) return lines.slice(0, 12);
  return lines.filter((line) => pattern.test(line)).slice(0, 12);
}

function inferWorkMode(text = "") {
  if (/\bremote\b/i.test(text)) return "remote";
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (/\bonsite|on-site|office\b/i.test(text)) return "onsite";
  return "unknown";
}

function normalizeImportedJob(raw = {}, sourceUrl = "", sourceTitle = "") {
  const jobDescriptionText = cleanString(
    raw.jobDescriptionText || raw.description || raw.jobDescription || "",
    120000
  );
  return {
    company: cleanString(raw.company, 180) || "Not found",
    role: cleanString(raw.role || raw.title, 180) || "Not found",
    location: cleanString(raw.location, 180) || "Not found",
    workMode: ["remote", "hybrid", "onsite", "unknown"].includes(raw.workMode) ? raw.workMode : "unknown",
    employmentType: cleanString(raw.employmentType, 80) || "Not found",
    salaryText: cleanString(raw.salaryText, 500) || "Not found",
    experienceText: cleanString(raw.experienceText, 500) || "Not found",
    skills: cleanArray(raw.skills, 20, 60),
    responsibilities: cleanArray(raw.responsibilities, 20, 180),
    requirements: cleanArray(raw.requirements, 20, 180),
    preferredQualifications: cleanArray(raw.preferredQualifications, 20, 180),
    benefits: cleanArray(raw.benefits, 20, 180),
    jobDescriptionText,
    sourceUrl,
    sourceTitle: cleanString(raw.sourceTitle || sourceTitle, 220),
    confidence: {
      company: Number(raw.confidence?.company || 0),
      role: Number(raw.confidence?.role || 0),
      location: Number(raw.confidence?.location || 0),
    },
  };
}

function buildDeterministicJobImport({ html = "", text = "", sourceUrl = "", sourceTitle = "" } = {}) {
  const structured = extractJsonLdJobPosting(html) || {};
  const title = cleanString(structured.title, 180);
  const company = cleanString(structured.hiringOrganization?.name || structured.organization?.name, 180);
  const location = cleanString(textFromStructured(structured.jobLocation?.address || structured.jobLocation), 180);
  const description = htmlToText(structured.description || "") || cleanString(text, 120000);
  const skills = [...tokenize(description)].filter((token) => /[a-z]/i.test(token)).slice(0, 14);
  return normalizeImportedJob(
    {
      company,
      role: title,
      location,
      workMode: inferWorkMode(`${description}\n${location}`),
      employmentType: cleanString(structured.employmentType, 80),
      salaryText: textFromStructured(structured.baseSalary),
      experienceText: splitListFromText(description, /\b(year|experience)\b/i)[0] || "",
      skills,
      responsibilities: splitListFromText(description, /\b(build|design|own|lead|manage|develop|collaborate|responsible)\b/i),
      requirements: extractRequirements(description),
      preferredQualifications: splitListFromText(description, /\b(preferred|nice to have|bonus)\b/i),
      benefits: splitListFromText(description, /\b(benefit|insurance|leave|remote|wellness|equity)\b/i),
      jobDescriptionText: description,
      sourceTitle,
      confidence: { company: company ? 0.95 : 0, role: title ? 0.95 : 0, location: location ? 0.75 : 0 },
    },
    sourceUrl,
    sourceTitle
  );
}

function mergeImportedJobEvidence(base = {}, parsed = {}, sourceUrl = "", sourceTitle = "") {
  const merged = { ...base };
  for (const key of [
    "company",
    "role",
    "location",
    "employmentType",
    "salaryText",
    "experienceText",
    "jobDescriptionText",
    "sourceTitle",
  ]) {
    const value = cleanString(parsed[key], key === "jobDescriptionText" ? 120000 : 500);
    if (value) merged[key] = value;
  }
  if (["remote", "hybrid", "onsite"].includes(parsed.workMode)) merged.workMode = parsed.workMode;
  for (const key of ["skills", "responsibilities", "requirements", "preferredQualifications", "benefits"]) {
    const value = cleanArray(parsed[key], 20, key === "skills" ? 60 : 180);
    if (value.length) merged[key] = value;
  }
  if (parsed.confidence) merged.confidence = { ...merged.confidence, ...parsed.confidence };
  return normalizeImportedJob(merged, sourceUrl, sourceTitle);
}

async function fetchJobPage(url, options = {}) {
  let nextUrl = url;
  for (let redirect = 0; redirect <= JOB_PAGE_REDIRECT_LIMIT; redirect += 1) {
    const checked = await validatePublicJobUrl(nextUrl, options);
    if (checked.error) {
      const err = new Error(checked.error);
      err.status = 400;
      throw err;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || JOB_PAGE_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(checked.url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "OrionAI-Career-Importer/1.0",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
        },
      });
    } catch (error) {
      const err = new Error(error.name === "AbortError" ? "This job page took too long to respond." : "OrionAI couldn't access this job page.");
      err.status = 400;
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) break;
      nextUrl = new URL(location, checked.url).toString();
      continue;
    }
    if (response.status === 404 || response.status === 410) {
      const err = new Error("This job listing may no longer be available.");
      err.status = 404;
      throw err;
    }
    if (!response.ok) {
      const err = new Error(response.status === 401 || response.status === 403
        ? "This job listing requires sign-in. Paste the job description instead."
        : "OrionAI couldn't access this job page.");
      err.status = 400;
      throw err;
    }
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
      const err = new Error("OrionAI couldn't read this job page format.");
      err.status = 400;
      throw err;
    }
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_JOB_PAGE_BYTES) {
      const err = new Error("This job page is too large to import safely.");
      err.status = 400;
      throw err;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_JOB_PAGE_BYTES) {
      const err = new Error("This job page is too large to import safely.");
      err.status = 400;
      throw err;
    }
    const html = buffer.toString("utf8");
    return { finalUrl: response.url || checked.url, html, text: htmlToText(html), sourceTitle: titleFromHtml(html) };
  }
  const err = new Error("OrionAI couldn't access this job page.");
  err.status = 400;
  throw err;
}

async function importJobFromUrl(userId, body = {}, options = {}) {
  const validation = await validatePublicJobUrl(body.sourceUrl || body.url || body.jobUrl, options);
  if (validation.error) return { error: validation.error, status: 400 };
  let page;
  try {
    page = options.pageFetcher
      ? await options.pageFetcher(validation.url)
      : await fetchJobPage(validation.url, options);
  } catch (error) {
    return { error: error.message || "OrionAI couldn't access this job page.", status: error.status || 400 };
  }
  const html = cleanString(page.html || "", MAX_JOB_PAGE_BYTES);
  const text = cleanString(page.text || htmlToText(html), 120000);
  if (/sign in|required login|login required|create an account to view/i.test(text)) {
    return { error: "This job listing requires sign-in. Paste the job description instead.", status: 400 };
  }
  if (!looksLikeJobListing({ html, text })) {
    return { error: "OrionAI couldn't confirm this is a job listing. Paste the job description instead.", status: 400 };
  }
  const deterministic = buildDeterministicJobImport({
    html,
    text,
    sourceUrl: page.finalUrl || validation.url,
    sourceTitle: page.sourceTitle || titleFromHtml(html),
  });
  try {
    const raw = await chatComplete(
      [
        {
          role: "system",
          content: "Return only JSON. Extract job listing facts from supplied page text. Use empty strings or arrays when not found. Do not guess.",
        },
        {
          role: "user",
          content: [
            "Schema: {company,role,location,workMode,employmentType,salaryText,experienceText,skills,responsibilities,requirements,preferredQualifications,benefits,jobDescriptionText,confidence:{company,role,location}}.",
            `URL: ${page.finalUrl || validation.url}`,
            `Page title: ${page.sourceTitle || ""}`,
            text.slice(0, 26000),
          ].join("\n\n"),
        },
      ],
      1800,
      0.1
    );
    const parsed = JSON.parse(String(raw || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
    return {
      importedJob: mergeImportedJobEvidence(deterministic, parsed, page.finalUrl || validation.url, page.sourceTitle || ""),
      reviewRequired: true,
    };
  } catch {
    return { importedJob: deterministic, reviewRequired: true };
  }
}

function composeImportedJobDescription(imported = {}) {
  const blocks = [
    imported.jobDescriptionText,
    imported.responsibilities?.length ? `Responsibilities:\n${imported.responsibilities.join("\n")}` : "",
    imported.requirements?.length ? `Requirements:\n${imported.requirements.join("\n")}` : "",
    imported.preferredQualifications?.length ? `Preferred qualifications:\n${imported.preferredQualifications.join("\n")}` : "",
    imported.benefits?.length ? `Benefits:\n${imported.benefits.join("\n")}` : "",
  ];
  return cleanString(blocks.filter(Boolean).join("\n\n"), 120000);
}

async function confirmImportedJob(userId, body = {}) {
  const imported = body.importedJob || body;
  const company = cleanString(imported.company, 180);
  const role = cleanString(imported.role, 180);
  if (!company || company === "Not found") return { error: "company is required" };
  if (!role || role === "Not found") return { error: "role is required" };
  const sourceUrl = safeUrl(imported.sourceUrl || body.sourceUrl);
  if (!sourceUrl) return { error: "sourceUrl must be a valid http(s) URL" };
  const parsedSourceUrl = new URL(sourceUrl);
  if (
    parsedSourceUrl.protocol !== "https:" ||
    parsedSourceUrl.hostname === "localhost" ||
    parsedSourceUrl.hostname.endsWith(".localhost") ||
    parsedSourceUrl.hostname.endsWith(".local") ||
    isPrivateAddress(parsedSourceUrl.hostname)
  ) {
    return { error: "This job link cannot be imported for security reasons.", status: 400 };
  }
  const duplicate = await JobApplication.findOne({ userId, sourceUrl, status: { $ne: "archived" } });
  if (duplicate) return { application: duplicate, duplicate: true };

  const jdText = composeImportedJobDescription(imported);
  const document = await CareerDocument.create({
    userId,
    type: "job_description",
    title: cleanString(imported.sourceTitle, 180) || `${role} at ${company}`,
    sourceApp: "web",
    sourceUrl,
    extractedText: jdText,
    processingStatus: jdText ? "ready" : "failed",
    processingError: jdText ? "" : "No extractable text found.",
  });
  const status = validateEnum(body.status || "interested", JobApplication.STATUS_VALUES, "interested");
  const applicationBody = {
    company,
    role,
    status,
    source: "Job link",
    sourceUrl,
    location: imported.location === "Not found" ? "" : cleanString(imported.location, 180),
    workMode: imported.workMode === "unknown" ? "" : imported.workMode,
    employmentType: validateEnum(imported.employmentType, JobApplication.EMPLOYMENT_TYPE_VALUES, ""),
    salaryText: imported.salaryText === "Not found" ? "" : imported.salaryText,
    jobDescriptionId: document._id,
    resumeId: body.resumeId || null,
    sourceApp: "web",
    sourceRef: sourceUrl,
    appliedAt: status === "applied" ? body.appliedAt : null,
    nextFollowUpAt: body.nextFollowUpAt || null,
    notes: body.notes,
    tags: cleanArray(imported.skills, 12, 40),
  };
  const result = await createApplication(userId, applicationBody);
  if (result.error) return result;
  return { application: result.application, document: publicDoc(document), duplicate: false };
}

function tokenize(text = "") {
  const stop = new Set([
    "the", "and", "for", "with", "you", "our", "are", "that", "this", "from", "will", "have",
    "your", "work", "role", "team", "experience", "skills", "using", "build", "job",
  ]);
  return new Set(
    String(text || "")
      .toLowerCase()
      .match(/[a-z][a-z0-9+#.-]{1,}/g)
      ?.filter((word) => word.length > 2 && !stop.has(word))
      .slice(0, 500) || []
  );
}

function extractRequirements(jdText = "") {
  const lines = String(jdText || "")
    .split(/\n|•|-/)
    .map((line) => cleanString(line.replace(/\s+/g, " "), 240))
    .filter((line) =>
      line.length > 18 &&
      /\b(experience|design|develop|build|manage|required|must|knowledge|proficient|familiar|responsible|api|database|cloud|system|lead|communicat|python|java|node|react|aws|sql|mongodb)\b/i.test(line)
    );
  const seen = new Set();
  return lines
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function evidenceForRequirement(requirement, resumeText = "") {
  const reqTokens = tokenize(requirement);
  const resumeTokens = tokenize(resumeText);
  const hits = [...reqTokens].filter((token) => resumeTokens.has(token));
  const sentences = String(resumeText || "")
    .split(/(?<=[.!?])\s+|\n/)
    .map((line) => cleanString(line, 260))
    .filter(Boolean);
  const evidence = sentences.find((sentence) => {
    const sentenceTokens = tokenize(sentence);
    return hits.filter((token) => sentenceTokens.has(token)).length >= Math.min(3, Math.max(1, hits.length));
  });
  if (hits.length >= 4 && evidence) return { assessment: "strong", evidence, keywords: hits.slice(0, 8) };
  if (hits.length >= 2) return { assessment: "partial", evidence: evidence || `Keyword overlap: ${hits.slice(0, 6).join(", ")}`, keywords: hits.slice(0, 8) };
  return { assessment: "missing", evidence: "", keywords: hits };
}

function parseStructuredAiObject(raw) {
  const text = String(raw || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1"));
  } catch {
    return null;
  }
}

function normalizeResumeMatch(value = {}, fallback = {}, { resumeText = "", jdText = "" } = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const fallbackArray = (key) => (Array.isArray(fallback[key]) ? fallback[key] : []);
  const sourceArray = (key) => (Array.isArray(input[key]) ? input[key] : fallbackArray(key));
  const normalizeRequirement = (item) => cleanString(
    typeof item === "string" ? item : item?.requirement || item?.jdRequirement || item?.title,
    500
  );

  let strongMatches = sourceArray("strongMatches")
    .map((item) => ({
      requirement: normalizeRequirement(item),
      resumeEvidence: cleanString(item?.resumeEvidence || item?.evidence, 900),
      explanation: cleanString(item?.explanation || item?.assessment, 600),
      keywords: cleanArray(item?.keywords, 12, 80),
    }))
    .filter((item) => item.requirement && item.resumeEvidence)
    .slice(0, 12);

  let partialMatches = sourceArray("partialMatches")
    .map((item) => ({
      requirement: normalizeRequirement(item),
      resumeEvidence: cleanString(item?.resumeEvidence || item?.evidence, 900),
      missingEvidence: cleanString(item?.missingEvidence || item?.assessment, 600),
      suggestion: cleanString(item?.suggestion, 600),
      keywords: cleanArray(item?.keywords, 12, 80),
    }))
    .filter((item) => item.requirement)
    .slice(0, 12);

  let missingEvidence = sourceArray("missingEvidence")
    .map((item) => ({
      requirement: normalizeRequirement(item),
      resumeEvidence: cleanString(item?.resumeEvidence || item?.evidence, 700) || "No clear evidence found",
      evidenceStatus: "not_found",
      suggestion: cleanString(item?.suggestion || item?.assessment, 600),
      keywords: cleanArray(item?.keywords, 12, 80),
    }))
    .filter((item) => item.requirement)
    .slice(0, 12);

  let interviewRiskAreas = sourceArray("interviewRiskAreas")
    .map((item) => ({
      area: cleanString(typeof item === "string" ? item : item?.area || item?.title, 300),
      reason: cleanString(item?.reason, 600),
      preparationSuggestion: cleanString(item?.preparationSuggestion || item?.suggestion, 600),
    }))
    .filter((item) => item.area)
    .slice(0, 10);

  if (resumeText || jdText) {
    const fallbackMatch = normalizeResumeMatch({}, fallback);
    strongMatches = strongMatches.filter(
      (item) => hasSourceOverlap(item.requirement, jdText) && hasSourceOverlap(item.resumeEvidence, resumeText)
    );
    partialMatches = partialMatches.filter(
      (item) => hasSourceOverlap(item.requirement, jdText) && hasSourceOverlap(item.resumeEvidence, resumeText)
    );
    missingEvidence = missingEvidence.filter((item) => hasSourceOverlap(item.requirement, jdText));
    interviewRiskAreas = interviewRiskAreas.filter((item) => hasSourceOverlap(item.area, jdText));
    if (!strongMatches.length && fallbackMatch.strongMatches.length) strongMatches = fallbackMatch.strongMatches;
    if (!partialMatches.length && fallbackMatch.partialMatches.length) partialMatches = fallbackMatch.partialMatches;
    if (!missingEvidence.length && fallbackMatch.missingEvidence.length) missingEvidence = fallbackMatch.missingEvidence;
    if (!interviewRiskAreas.length && fallbackMatch.interviewRiskAreas.length) {
      interviewRiskAreas = fallbackMatch.interviewRiskAreas;
    }
  }

  let suggestedImprovements = cleanArray(
    Array.isArray(input.suggestedImprovements)
      ? input.suggestedImprovements
      : fallbackArray("suggestedImprovements"),
    12,
    700
  );
  if ((resumeText || jdText) && Array.isArray(input.suggestedImprovements)) {
    suggestedImprovements = suggestedImprovements.filter((item) => hasSourceOverlap(item, `${resumeText}\n${jdText}`));
    if (!suggestedImprovements.length) {
      suggestedImprovements = cleanArray(fallbackArray("suggestedImprovements"), 12, 700);
    }
  }

  return {
    summary:
      (!resumeText && !jdText ? cleanString(input.summary, 1200) : "") ||
      cleanString(fallback.summary, 1200) ||
      "OrionAI compared the supplied resume and job description using only the available document evidence.",
    strongMatches,
    partialMatches,
    missingEvidence,
    interviewRiskAreas,
    suggestedImprovements,
    grounding: fallback.grounding || input.grounding || {},
  };
}

function buildDeterministicResumeMatch({ resumeText = "", jdText = "" } = {}) {
  const requirements = extractRequirements(jdText);
  const strongMatches = [];
  const partialMatches = [];
  const missingEvidence = [];
  for (const requirement of requirements) {
    const result = evidenceForRequirement(requirement, resumeText);
    if (result.assessment === "strong") {
      strongMatches.push({
        requirement,
        resumeEvidence: result.evidence,
        explanation: "The resume contains direct evidence that overlaps this JD requirement.",
        keywords: result.keywords,
      });
    } else if (result.assessment === "partial") {
      partialMatches.push({
        requirement,
        resumeEvidence: result.evidence || "Related terms appear in the resume.",
        missingEvidence: "The resume does not show the full depth or context requested by the JD.",
        suggestion: "If you genuinely have this experience, add a specific example and outcome.",
        keywords: result.keywords,
      });
    } else {
      missingEvidence.push({
        requirement,
        resumeEvidence: "No clear evidence found",
        evidenceStatus: "not_found",
        suggestion: "Prepare to discuss only your real experience; do not add this claim without evidence.",
        keywords: result.keywords,
      });
    }
  }
  return {
    summary: `The supplied documents show ${strongMatches.length} strong match${strongMatches.length === 1 ? "" : "es"}, ${partialMatches.length} partial match${partialMatches.length === 1 ? "" : "es"}, and ${missingEvidence.length} requirement${missingEvidence.length === 1 ? "" : "s"} without clear resume evidence. Review the evidence below before changing your resume or preparing answers.`,
    strongMatches,
    partialMatches,
    missingEvidence,
    suggestedImprovements: missingEvidence.slice(0, 5).map((item) =>
      `If you truly have experience with "${item.requirement}", add a specific, truthful example and outcome.`
    ),
    interviewRiskAreas: [...missingEvidence, ...partialMatches].slice(0, 5).map((item) => ({
      area: item.requirement,
      reason: item.evidenceStatus === "not_found" ? "No clear resume evidence was found." : item.missingEvidence,
      preparationSuggestion: "Prepare a truthful explanation of your actual level of experience.",
    })),
    grounding: {
      resume: Boolean(cleanString(resumeText)),
      jobDescription: Boolean(cleanString(jdText)),
      generalKnowledge: false,
    },
  };
}

async function resumeMatch(userId, applicationId, body = {}) {
  const application = await assertApplicationOwnership(userId, applicationId);
  const [resume, jd] = await Promise.all([
    resolveResumeForApplication(userId, application, body.resumeId),
    resolveJobDescriptionForApplication(userId, application, body.jobDescriptionId),
  ]);
  if (!documentHasUsableText(resume)) return { error: unavailableDocumentError(resume, "Resume") };
  if (!documentHasUsableText(jd)) return { error: unavailableDocumentError(jd, "Job description") };

  const deterministic = buildDeterministicResumeMatch({
    resumeText: resume.extractedText,
    jdText: jd.extractedText,
  });
  deterministic.grounding = {
    ...deterministic.grounding,
    resumeSource: resume.sourceApp || "upload",
    jobDescriptionSource: jd.sourceApp || "manual",
  };

  try {
    const raw = await chatComplete(
      [
        {
          role: "system",
          content: [
            "You are OrionAI Career & Interviews.",
            "Return only JSON. Compare resume and JD using only supplied text.",
            "Never invent experience. Never provide an ATS percentage.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "Return JSON: {summary, strongMatches:[{requirement,resumeEvidence,explanation}], partialMatches:[{requirement,resumeEvidence,missingEvidence,suggestion}], missingEvidence:[{requirement,evidenceStatus,suggestion}], interviewRiskAreas:[{area,reason,preparationSuggestion}], suggestedImprovements:[]}.",
            "All resume evidence must quote or closely preserve supplied resume text. Mark unsupported requirements as not_found.",
            `Resume:\n${resume.extractedText.slice(0, 18000)}`,
            `JD:\n${jd.extractedText.slice(0, 14000)}`,
          ].join("\n\n"),
        },
      ],
      1800,
      0.2
    );
    const parsed = parseStructuredAiObject(raw);
    const match = normalizeResumeMatch(parsed, deterministic, {
      resumeText: resume.extractedText,
      jdText: jd.extractedText,
    });
    if (typeof application.save === "function") {
      application.resumeMatch = match;
      application.resumeMatchMeta = buildSourceMeta({ resume, jd });
      application.resumeMatchGeneratedAt = new Date();
      application.markModified?.("resumeMatch");
      application.markModified?.("resumeMatchMeta");
      await application.save();
    }
    await rememberResumeMatchGaps(userId, application._id, match);
    return { match };
  } catch {
    if (typeof application.save === "function") {
      application.resumeMatch = deterministic;
      application.resumeMatchMeta = buildSourceMeta({ resume, jd });
      application.resumeMatchGeneratedAt = new Date();
      application.markModified?.("resumeMatch");
      application.markModified?.("resumeMatchMeta");
      await application.save();
    }
    await rememberResumeMatchGaps(userId, application._id, deterministic);
    return { match: deterministic };
  }
}

function recordId(record) {
  return record?._id ? String(record._id) : "";
}

function isoDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function buildSourceMeta({ resume, jd, interview } = {}) {
  return {
    resumeId: recordId(resume),
    resumeUpdatedAt: isoDate(resume?.updatedAt),
    jobDescriptionId: recordId(jd),
    jobDescriptionUpdatedAt: isoDate(jd?.updatedAt),
    roundType: cleanString(interview?.roundType, 80),
  };
}

function sourceSentences(text = "", limit = 6) {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n/)
    .map((line) => cleanString(line.replace(/\s+/g, " "), 420))
    .filter((line) => line.length > 24)
    .slice(0, limit);
}

function hasSourceOverlap(value, sourceText) {
  const valueTokens = tokenize(value);
  const sourceTokens = tokenize(sourceText);
  const hits = [...valueTokens].filter((token) => sourceTokens.has(token));
  return hits.length >= Math.min(2, Math.max(1, valueTokens.size));
}

function buildFallbackPrep({ application, interview, resume, jd, memories = [] }) {
  const jdText = jd?.extractedText || "";
  const resumeText = resume?.extractedText || "";
  const jdRequirements = extractRequirements(jdText);
  const resumeEvidence = sourceSentences(resumeText, 6);
  const weakMemories = memories.filter((memory) =>
    ["weak_area", "jd_gap", "interview_feedback"].includes(memory.memoryType)
  );
  const priorityTopics = [
    ...weakMemories.slice(0, 3).map((memory) => ({
      topic: memory.title,
      reason: memory.content || "Previous Career practice marked this for review.",
      priority: "high",
      source: "Career Memory",
    })),
    ...jdRequirements.slice(0, 5).map((requirement, index) => ({
      topic: requirement,
      reason: "This appears directly in the supplied job description.",
      priority: index < 3 ? "high" : "medium",
      source: "JD",
    })),
  ].slice(0, 8);

  return {
    roleSummary: jdText
      ? `The supplied job description for ${application.role || "this role"} emphasizes ${jdRequirements.slice(0, 3).join("; ") || "the responsibilities and requirements in the saved JD"}.`
      : `This preparation uses the saved application context for ${application.role || "this role"}. Add a job description for role-specific requirements.`,
    priorityTopics,
    resumeQuestions: resumeEvidence.map((evidence) => ({
      question: `Walk me through the work described here and the decisions you personally made: “${evidence.slice(0, 180)}”`,
      resumeBasis: evidence,
    })),
    jdQuestions: jdRequirements.slice(0, 8).map((requirement) => ({
      question: `How would you approach this requirement using your actual experience: ${requirement}?`,
      jdBasis: requirement,
    })),
    behavioralQuestions: [
      "Tell me about a real situation where you took ownership through ambiguity.",
      "Describe a real disagreement at work and how you handled it.",
      "Tell me about a setback, what you learned, and what changed afterward.",
    ],
    likelyDeepDiveAreas: jdRequirements.slice(0, 5).map((area) => ({
      area,
      reason: "The supplied JD gives this requirement interview relevance.",
      source: "JD",
    })),
    weakAreasToReview: weakMemories.slice(0, 6).map((memory) => ({
      area: memory.title,
      reason: memory.content || "Saved Career Memory marked this for review.",
      source: "Career Memory",
    })),
    questionsForInterviewer: [
      `What are the most important problems this ${application.role || "role"} hire should solve first?`,
      "How will success be measured during the first 90 days?",
      "How does the team review technical quality and collaboration?",
    ],
    preparationPlan: [
      ...priorityTopics.slice(0, 4).map((item) => `Review ${item.topic} and prepare a truthful example.`),
      ...(resumeText ? ["Choose two resume projects and rehearse the decisions, tradeoffs, and outcomes."] : []),
      "Prepare one real STAR story about ownership, conflict, or learning.",
    ].slice(0, 7),
    grounding: {
      application: true,
      interview: Boolean(interview),
      resume: Boolean(resumeText),
      jobDescription: Boolean(jdText),
      resumeSource: resume?.sourceApp || "",
      jobDescriptionSource: jd?.sourceApp || "",
      careerMemory: memories.length > 0,
      generalKnowledge: true,
    },
    careerMemory: memories,
  };
}

function normalizePreparation(value = {}, fallback = {}, { resumeText = "", jdText = "" } = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalizeQuestion = (item, basisKey) => ({
    question: cleanString(typeof item === "string" ? item : item?.question, 700),
    [basisKey]: cleanString(item?.[basisKey] || item?.basis, 700),
  });
  const resumeQuestions = (Array.isArray(input.resumeQuestions)
    ? input.resumeQuestions
    : Array.isArray(input.resumeBasedQuestions)
      ? input.resumeBasedQuestions
      : [])
    .map((item) => normalizeQuestion(item, "resumeBasis"))
    .filter((item) => item.question && item.resumeBasis && hasSourceOverlap(item.resumeBasis, resumeText));
  const jdQuestions = (Array.isArray(input.jdQuestions)
    ? input.jdQuestions
    : Array.isArray(input.jdBasedQuestions)
      ? input.jdBasedQuestions
      : [])
    .map((item) => normalizeQuestion(item, "jdBasis"))
    .filter((item) => item.question && item.jdBasis && hasSourceOverlap(item.jdBasis, jdText));
  const corpus = `${resumeText}\n${jdText}`;
  const priorityTopics = (Array.isArray(input.priorityTopics) ? input.priorityTopics : [])
    .map((item) => ({
      topic: cleanString(typeof item === "string" ? item : item?.topic || item?.title, 360),
      reason: cleanString(item?.reason, 700),
      priority: validateEnum(item?.priority, ["high", "medium", "low"], "medium"),
      source: cleanString(item?.source, 80) || "OrionAI",
    }))
    .filter((item) => item.topic && hasSourceOverlap(`${item.topic} ${item.reason}`, corpus));
  const deepDiveAreas = (Array.isArray(input.likelyDeepDiveAreas) ? input.likelyDeepDiveAreas : [])
    .map((item) => ({
      area: cleanString(typeof item === "string" ? item : item?.area || item?.topic, 360),
      reason: cleanString(item?.reason, 700),
      source: cleanString(item?.source, 80) || "OrionAI",
    }))
    .filter((item) => item.area && hasSourceOverlap(`${item.area} ${item.reason}`, corpus));

  return {
    roleSummary: fallback.roleSummary,
    priorityTopics: priorityTopics.length ? priorityTopics.slice(0, 8) : fallback.priorityTopics,
    resumeQuestions: resumeQuestions.length ? resumeQuestions.slice(0, 8) : fallback.resumeQuestions,
    jdQuestions: jdQuestions.length ? jdQuestions.slice(0, 8) : fallback.jdQuestions,
    behavioralQuestions: cleanArray(
      input.behavioralQuestions || input.behavioralPreparation || fallback.behavioralQuestions,
      8,
      700
    ),
    likelyDeepDiveAreas: deepDiveAreas.length ? deepDiveAreas.slice(0, 8) : fallback.likelyDeepDiveAreas,
    weakAreasToReview: fallback.weakAreasToReview,
    questionsForInterviewer: cleanArray(
      (input.questionsForInterviewer || input.questionsToAskInterviewer || fallback.questionsForInterviewer)
        .map?.((item) => (typeof item === "string" ? item : item?.question)) || [],
      8,
      700
    ),
    preparationPlan: cleanArray(input.preparationPlan || fallback.preparationPlan, 10, 700),
    grounding: fallback.grounding,
    careerMemory: fallback.careerMemory,
  };
}

async function generatePreparation({ application, interview, resume, jd, memories }) {
  const fallback = buildFallbackPrep({ application, interview, resume, jd, memories });
  try {
    const raw = await chatComplete(
      [
        {
          role: "system",
          content: [
            "You are OrionAI Career & Interviews.",
            "Return only valid JSON matching the requested structure.",
            "Use supplied resume and JD text as the only evidence for user experience and company requirements.",
            "Career Memory is supplemental and never overrides source documents.",
            "Never fabricate user experience, requirements, interview rounds, or outcomes.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "Return JSON with: roleSummary, priorityTopics[{topic,reason,priority,source}], resumeQuestions[{question,resumeBasis}], jdQuestions[{question,jdBasis}], behavioralQuestions[], likelyDeepDiveAreas[{area,reason,source}], questionsForInterviewer[], preparationPlan[].",
            `Application: ${application.company} - ${application.role || ""}`,
            `Round: ${interview?.roundType || "unknown"}`,
            `Notes: ${[application.notes, interview?.notes].filter(Boolean).join("\n").slice(0, 4000)}`,
            `Career memory summaries:\n${memories.map((memory) => `${memory.memoryType}: ${memory.title} - ${memory.content} (${memory.sourceType || "other"}:${memory.sourceRef || "none"})`).join("\n").slice(0, 5000)}`,
            `Resume source: ${resume?.sourceApp || "none"}`,
            `Resume text:\n${(resume?.extractedText || "").slice(0, 12000)}`,
            `JD source: ${jd?.sourceApp || "none"}`,
            `JD text:\n${(jd?.extractedText || "").slice(0, 10000)}`,
          ].join("\n\n"),
        },
      ],
      2200,
      0.25
    );
    return normalizePreparation(parseStructuredAiObject(raw), fallback, {
      resumeText: resume?.extractedText || "",
      jdText: jd?.extractedText || "",
    });
  } catch {
    return fallback;
  }
}

async function prepareInterview(userId, interviewId) {
  const interview = await assertInterviewOwnership(userId, interviewId);
  const application = interview.applicationId
    ? await assertApplicationOwnership(userId, interview.applicationId)
    : await JobApplication.findOne({ userId, company: interview.company, status: { $ne: "archived" } });
  const [resume, jd] = await Promise.all([
    resolveResumeForApplication(userId, application, null),
    resolveJobDescriptionForApplication(userId, application, null),
  ]);
  const usableResume = documentHasUsableText(resume) ? resume : null;
  const usableJd = documentHasUsableText(jd) ? jd : null;
  const memories = await loadRelevantCareerMemory(userId, {
    applicationId: application?._id || interview.applicationId,
    interviewId: interview._id,
  });
  interview.prepPlan = await generatePreparation({
    application: application || interview,
    interview,
    resume: usableResume,
    jd: usableJd,
    memories,
  });
  interview.prepMeta = buildSourceMeta({ resume: usableResume, jd: usableJd, interview });
  interview.prepGeneratedAt = new Date();
  interview.prepStatus = "ready";
  interview.markModified?.("prepPlan");
  interview.markModified?.("prepMeta");
  await interview.save();
  return { preparation: interview.prepPlan, interview };
}

async function prepareApplication(userId, applicationId) {
  const application = await assertApplicationOwnership(userId, applicationId);
  const [resume, jd, interviews] = await Promise.all([
    resolveResumeForApplication(userId, application, null),
    resolveJobDescriptionForApplication(userId, application, null),
    InterviewEvent.find({
      userId,
      applicationId: application._id,
      status: "scheduled",
      scheduledAt: { $gte: new Date() },
    }).sort({ scheduledAt: 1 }).limit(3).lean(),
  ]);
  const usableResume = documentHasUsableText(resume) ? resume : null;
  const usableJd = documentHasUsableText(jd) ? jd : null;
  const memories = await loadRelevantCareerMemory(userId, { applicationId: application._id });
  const preparation = await generatePreparation({
    application,
    interview: null,
    resume: usableResume,
    jd: usableJd,
    memories,
  });
  const prepMeta = buildSourceMeta({ resume: usableResume, jd: usableJd });
  if (typeof application.save === "function") {
    application.prepPlan = preparation;
    application.prepMeta = prepMeta;
    application.prepGeneratedAt = new Date();
    application.markModified?.("prepPlan");
    application.markModified?.("prepMeta");
    await application.save();
  }
  return {
    preparation,
    application,
    interview: interviews[0] || null,
    availableInterviews: interviews,
  };
}

function nextPracticeQuestion({ application, interview, type, index = 0 }) {
  const base = application
    ? `${application.role} at ${application.company}`
    : `${interview?.role || "this role"} at ${interview?.company || "the company"}`;
  const banks = {
    behavioral: [
      `Tell me about a real situation where you handled ambiguity while working toward ${base}.`,
      "Describe a real disagreement and how you reached a useful outcome.",
      "Tell me about a setback, what you learned, and what you changed afterward.",
    ],
    system_design: [
      `Design a system relevant to ${base}. Start with requirements and constraints.`,
      "How would you identify bottlenecks and plan for scale in that design?",
      "Which reliability tradeoffs would you make, and why?",
    ],
    technical: [
      `Pick one technical project from your resume that is relevant to ${base}. What tradeoffs did you make?`,
      "Describe a difficult production issue you personally investigated and how you isolated the cause.",
      "Which architecture decision would you revisit today, and what evidence changed your view?",
    ],
    coding: [
      `Pick one implementation relevant to ${base}. How did you reason about correctness and complexity?`,
      "How do you test edge cases and failure paths before shipping a change?",
      "Describe a refactor that improved maintainability without changing behavior.",
    ],
    hr: [
      `Why are you interested in ${base}, using only your actual motivations and experience?`,
      "What kind of role and team environment helps you do your best work?",
      "Which real accomplishment best represents what you would bring to this role?",
    ],
    role_specific: [
      `What makes your actual background a fit for ${base}?`,
      "Which requirement for this role would you be most ready to discuss in depth?",
      "Where would you need the most context or ramp-up time in this role?",
    ],
  };
  const questions = banks[type] || banks.role_specific;
  return questions[index % questions.length];
}

async function startPractice(userId, interviewId, body = {}) {
  const interview = await assertInterviewOwnership(userId, interviewId);
  const application = interview.applicationId ? await assertApplicationOwnership(userId, interview.applicationId) : null;
  const type = validateEnum(body.type || interview.roundType || "role_specific", InterviewPracticeSession.TYPE_VALUES, "role_specific");
  const existing = await InterviewPracticeSession.findOne({
    userId,
    interviewId: interview._id,
    type,
    status: "active",
  });
  if (existing) {
    const pending = existing.questions.find((item) => !item.answeredAt);
    return { session: existing, question: pending?.question || "", resumed: true };
  }
  const question = nextPracticeQuestion({ application, interview, type, index: 0 });
  const session = await InterviewPracticeSession.create({
    userId,
    applicationId: application?._id || interview.applicationId || null,
    interviewId: interview._id,
    company: application?.company || interview.company || "",
    role: application?.role || interview.role || "",
    type,
    questions: [{ question }],
  });
  return { session, question };
}

function buildAnswerFeedback(answer = "") {
  const text = cleanString(answer, 10000);
  const good = [];
  const missing = [];
  if (text.length > 80) good.push("You gave enough detail to evaluate the answer.");
  else missing.push("Add a concrete example with context, action, and result.");
  if (/\b(result|impact|improved|reduced|increased|saved|learned|metric|users|revenue|latency|time)\b/i.test(text)) {
    good.push("You included impact or outcome language.");
  } else {
    missing.push("Mention the actual result or learning from the situation.");
  }
  if (/\bI\b/.test(text)) good.push("You described your own role.");
  else missing.push("Make your personal contribution clear.");
  return {
    good,
    missing,
    betterStructure: "Use: situation, task, action you personally took, result, and one reflection.",
    suggestedStrongerAnswer: "Keep your real facts, then tighten them into STAR form. Do not add achievements you did not actually have.",
  };
}

async function answerPractice(userId, sessionId, body = {}) {
  const session = await InterviewPracticeSession.findOne({ _id: sessionId, userId, status: { $ne: "archived" } });
  if (!session) return null;
  const answer = cleanString(body.answer, 10000);
  const skipped = body.skip === true;
  if (!answer && !skipped) {
    const err = new Error("answer is required");
    err.status = 400;
    throw err;
  }
  const index = Math.max(0, Math.min(Number(body.questionIndex ?? session.questions.length - 1), session.questions.length - 1));
  if (session.questions[index].answeredAt) return { session, nextQuestion: "" };
  session.questions[index].userAnswer = answer;
  session.questions[index].skipped = skipped;
  session.questions[index].feedback = skipped
    ? {
        good: [],
        missing: ["This question was skipped. Return to it when you have a real example to practice."],
        betterStructure: "Start with the context, your responsibility, your action, and the result.",
        suggestedStrongerAnswer: "Use only your real experience when you return to this question.",
      }
    : buildAnswerFeedback(answer);
  session.questions[index].answeredAt = new Date();
  if (!skipped) await rememberPracticeFeedback(userId, session, session.questions[index].feedback);
  const nextQuestion = nextPracticeQuestion({
    application: null,
    interview: { company: session.company || "the company", role: session.role || "the role" },
    type: session.type,
    index: session.questions.length,
  });
  if (body.complete === true) {
    session.status = "completed";
    session.completedAt = new Date();
    session.summary = "Practice completed. Review missing points and refine answers with real examples.";
    session.weakAreas = session.questions.flatMap((q) => q.feedback?.missing || []).slice(0, 8);
  } else if (session.questions.length < 10 && !session.questions.slice(index + 1).some((item) => !item.answeredAt)) {
    session.questions.push({ question: nextQuestion });
  }
  await session.save();
  return { session, nextQuestion: session.status === "active" ? nextQuestion : "" };
}

function classifyCareerEmail(email = {}) {
  const text = `${email.subject || ""} ${email.snippet || ""} ${email.from || ""}`.toLowerCase();
  const rules = [
    ["offer", /\boffer letter|employment offer|pleased to offer|compensation\b/i, 0.92],
    ["rejection", /\bnot moving forward|unfortunately|another candidate|reject/i, 0.86],
    ["interview_invite", /\binterview|meet with|video call|technical round|hr round|screening call\b/i, 0.9],
    ["assessment", /\bassessment|coding test|take-home|assignment|hacker(rank|earth)|codility\b/i, 0.88],
    ["application_received", /\bapplication received|thanks for applying|received your application\b/i, 0.84],
    ["recruiter_outreach", /\brecruiter|talent acquisition|opportunity|hiring for\b/i, 0.78],
    ["hr_follow_up", /\bfollow up|availability|share your resume|notice period|expected compensation\b/i, 0.76],
  ];
  const match = rules.find(([, pattern]) => pattern.test(text));
  if (!match) return null;
  const evidence = [];
  if (email.subject) evidence.push(`Subject: ${email.subject}`);
  if (email.snippet) evidence.push(`Snippet: ${email.snippet.slice(0, 220)}`);
  const domain = String(email.from || "").match(/@([A-Za-z0-9.-]+)/)?.[1] || "";
  const companyHint = domain
    .replace(/^mail\.|^careers\.|^jobs\.|^hr\./, "")
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    id: email.id,
    gmailMessageId: email.id,
    gmailThreadId: email.threadId || "",
    subject: email.subject || "",
    from: email.from || "",
    snippet: email.snippet || "",
    category: match[0],
    confidence: match[2],
    evidence,
    companyHint,
    roleHint: "",
  };
}

async function getEmailSignals(userId) {
  const integration = await Integration.findOne({ userId, type: "gmail", enabled: true });
  if (!integration?.gmail?.accessToken && !integration?.gmail?.refreshToken) {
    return { connected: false, signals: [] };
  }
  const ignored = await CareerEmailSignal.find({ userId, status: "ignored" }).lean();
  const ignoredIds = new Set(ignored.map((s) => s.gmailMessageId));
  const result = await toolGmailSearchEmails(
    { query: CAREER_SEARCH_QUERY, maxResults: 12 },
    { userId }
  );
  const existingApps = await JobApplication.find({ userId, status: { $ne: "archived" } }).lean();
  const signals = (result.emails || [])
    .map(classifyCareerEmail)
    .filter(Boolean)
    .filter((signal) => signal.confidence >= 0.75 && !ignoredIds.has(signal.gmailMessageId))
    .map((signal) => ({
      ...signal,
      matchedApplication: existingApps.find((app) =>
        signal.companyHint &&
        app.company.toLowerCase().includes(signal.companyHint.toLowerCase())
      ) || null,
    }));
  return { connected: true, signals };
}

async function acceptEmailSignal(userId, signalId, body = {}) {
  const source = body.signal || {};
  const signal = classifyCareerEmail({ ...source, id: signalId }) || {
    gmailMessageId: signalId,
    gmailThreadId: cleanString(source.gmailThreadId || source.threadId, 300),
    subject: cleanString(source.subject, 500),
    from: cleanString(source.from, 300),
    snippet: cleanString(source.snippet, 1000),
    category: "other",
    confidence: 0,
    evidence: [],
    companyHint: cleanString(source.companyHint, 180),
    roleHint: cleanString(source.roleHint, 180),
  };
  let application = null;
  if (body.applicationId) {
    application = await assertApplicationOwnership(userId, body.applicationId);
    const update = { sourceApp: "gmail", sourceRef: signal.gmailMessageId };
    if (["interview_invite", "hr_screening"].includes(signal.category)) update.status = "interviewing";
    if (signal.category === "assessment") update.status = "assignment";
    if (signal.category === "offer") update.status = "offer";
    if (signal.category === "rejection") update.status = "rejected";
    await JobApplication.updateOne({ _id: application._id, userId }, { $set: update });
  } else if (body.createApplication === true) {
    const company = cleanString(body.company || signal.companyHint, 180);
    const role = cleanString(body.role || signal.roleHint || "Role to confirm", 180);
    if (!company) {
      const err = new Error("company is required to create an application");
      err.status = 400;
      throw err;
    }
    const statusByCategory = {
      interview_invite: "interviewing",
      assessment: "assignment",
      offer: "offer",
      rejection: "rejected",
      application_received: "applied",
      recruiter_outreach: "interested",
      hr_follow_up: "hr_screening",
    };
    application = await JobApplication.create({
      userId,
      company,
      role,
      status: statusByCategory[signal.category] || "interested",
      source: "Gmail",
      sourceApp: "gmail",
      sourceRef: signal.gmailMessageId,
      notes: `Created from reviewed Gmail signal. Evidence: ${signal.evidence.join(" ")}`.slice(0, 2000),
    });
  }
  const saved = await CareerEmailSignal.findOneAndUpdate(
    { userId, gmailMessageId: signal.gmailMessageId },
    { $set: { ...signal, userId, applicationId: application?._id || body.applicationId || null, status: "accepted" } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return { signal: saved, application };
}

async function ignoreEmailSignal(userId, signalId, body = {}) {
  const saved = await CareerEmailSignal.findOneAndUpdate(
    { userId, gmailMessageId: signalId },
    {
      $set: {
        userId,
        gmailMessageId: signalId,
        gmailThreadId: cleanString(body.gmailThreadId || body.threadId, 300),
        subject: cleanString(body.subject, 500),
        from: cleanString(body.from, 300),
        snippet: cleanString(body.snippet, 1000),
        category: "other",
        confidence: 0,
        status: "ignored",
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return { signal: saved };
}

function isCareerCalendarEvent(event = {}) {
  const text = `${event.title || ""} ${event.description || ""} ${event.location || ""}`.toLowerCase();
  return /\b(interview|recruiter|hr screen|technical round|coding round|final round|assessment review)\b/.test(text);
}

async function getCalendarInterviewSignals(userId) {
  const integration = await Integration.findOne({ userId, type: "google_calendar", enabled: true });
  if (!integration?.googleCalendar?.accessToken && !integration?.googleCalendar?.refreshToken) return [];
  const now = new Date();
  const to = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const result = await calendarGetEvents(
    {
      query: "interview",
      dateFrom: now.toISOString().slice(0, 10),
      dateTo: to.toISOString().slice(0, 10),
      maxResults: 20,
    },
    { userId }
  );
  const existing = await InterviewEvent.find({
    userId,
    sourceApp: "google_calendar",
    sourceRef: { $in: (result.events || []).map((event) => event.id) },
  }).lean();
  const seen = new Set(existing.map((event) => event.sourceRef));
  return (result.events || [])
    .filter(isCareerCalendarEvent)
    .filter((event) => !seen.has(event.id))
    .map((event) => ({
      id: event.id,
      title: event.title,
      company: "",
      role: "",
      scheduledAt: event.start,
      durationMinutes: event.start && event.end
        ? Math.max(1, Math.round((new Date(event.end) - new Date(event.start)) / 60000))
        : 60,
      meetingUrl: event.meet || "",
      location: event.location || "",
      sourceApp: "google_calendar",
      sourceRef: event.id,
    }));
}

async function listFollowUps(userId) {
  const now = new Date();
  const applications = await JobApplication.find({
    userId,
    status: { $nin: ["archived", "rejected", "withdrawn"] },
    nextFollowUpAt: { $ne: null, $lte: now },
    followUpHandledAt: null,
  })
    .sort({ nextFollowUpAt: 1 })
    .lean();
  return applications.map((app) => ({
    id: String(app._id),
    applicationId: app._id,
    company: app.company,
    role: app.role,
    recruiter: "",
    lastInteraction: app.updatedAt,
    why: app.nextFollowUpAt ? "Follow-up date is due." : "This application may need a follow-up.",
    dueDate: app.nextFollowUpAt,
    application: app,
  }));
}

async function draftFollowUp(userId, applicationId) {
  const app = await assertApplicationOwnership(userId, applicationId);
  const lines = [
    "Hi,",
    "",
    `I wanted to follow up on my application for the ${app.role} role at ${app.company}.`,
    "I remain interested in the opportunity and would be grateful for any update you can share.",
    "",
    "Best,",
  ];
  return {
    draft: lines.join("\n"),
    grounding: {
      sourceGrounded: ["saved application"],
      generalKnowledge: [],
    },
  };
}

async function snoozeFollowUp(userId, applicationId, body = {}) {
  const days = Math.max(1, Math.min(30, Number(body.days || 3)));
  const next = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const application = await JobApplication.findOneAndUpdate(
    { _id: applicationId, userId },
    { $set: { nextFollowUpAt: next, followUpSnoozedUntil: next } },
    { new: true }
  );
  return application;
}

async function markFollowUpHandled(userId, applicationId) {
  return JobApplication.findOneAndUpdate(
    { _id: applicationId, userId },
    { $set: { followUpHandledAt: new Date() } },
    { new: true }
  );
}

async function getOverview(userId) {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const [applications, upcomingInterviews, followUps, primaryResume, documents, offers] = await Promise.all([
    JobApplication.find({ userId, status: { $ne: "archived" } }).sort({ updatedAt: -1 }).lean(),
    InterviewEvent.find({ userId, status: "scheduled", scheduledAt: { $gte: now } }).sort({ scheduledAt: 1 }).limit(8).lean(),
    listFollowUps(userId),
    CareerDocument.findOne({ userId, type: "resume", isPrimary: true, processingStatus: { $ne: "archived" } }).lean(),
    CareerDocument.find({ userId, processingStatus: { $ne: "archived" } }).sort({ updatedAt: -1 }).limit(8).lean(),
    CareerOffer.find({ userId, status: { $ne: "archived" } }).sort({ deadline: 1, updatedAt: -1 }).limit(8).lean(),
  ]);
  return {
    moduleId: "career_interviews",
    counts: {
      activeApplications: applications.length,
      upcomingInterviews: upcomingInterviews.length,
      followUpsDue: followUps.length,
      interviewsTomorrow: upcomingInterviews.filter((i) => new Date(i.scheduledAt) <= tomorrow).length,
      offers: offers.length,
    },
    primaryResume: publicDoc(primaryResume),
    applications,
    upcomingInterviews,
    followUps,
    documents: documents.map(publicDoc),
    offers,
  };
}

async function listOffers(userId) {
  return CareerOffer.find({ userId, status: { $ne: "archived" } }).sort({ deadline: 1, updatedAt: -1 }).lean();
}

async function createOffer(userId, body = {}) {
  const { error, payload } = normalizeOfferPayload(body);
  if (error) return { error };
  if (payload.applicationId) await assertApplicationOwnership(userId, payload.applicationId);
  if (payload.offerDocumentId) await assertDocumentOwnership(userId, payload.offerDocumentId, ["offer_letter"]);
  const offer = await CareerOffer.create({ ...payload, userId });
  if (payload.applicationId) {
    await JobApplication.updateOne({ _id: payload.applicationId, userId }, { $set: { status: "offer" } });
  }
  return { offer };
}

async function draftOfferEmail(userId, offerId, type = "clarification") {
  const offer = await CareerOffer.findOne({ _id: offerId, userId, status: { $ne: "archived" } });
  if (!offer) return null;
  const intro = type === "negotiation"
    ? `Thank you for sharing the offer for the ${offer.role} role at ${offer.company}. I am excited about the opportunity.`
    : `Thank you for sharing the details for the ${offer.role} role at ${offer.company}.`;
  const ask = type === "negotiation"
    ? "I wanted to discuss the compensation and overall package based on the role scope and expectations."
    : "I had a few clarifying questions about the offer details and next steps.";
  return {
    draft: ["Hi,", "", intro, ask, "Please let me know a convenient time to discuss.", "", "Best,"].join("\n"),
    grounding: { sourceGrounded: ["saved offer"], generalKnowledge: [] },
  };
}

module.exports = {
  MAX_FILE_SIZE,
  MAX_JOB_PAGE_BYTES,
  sanitizeFileName,
  inferDocumentType,
  validateUpload,
  extractTextFromUpload,
  isPrivateAddress,
  validatePublicJobUrl,
  htmlToText,
  buildDeterministicJobImport,
  resolveStoragePath,
  normalizeApplicationPayload,
  normalizeInterviewPayload,
  normalizeOfferPayload,
  parseStructuredAiObject,
  normalizeResumeMatch,
  normalizePreparation,
  buildSourceMeta,
  buildDeterministicResumeMatch,
  buildFallbackPrep,
  classifyCareerEmail,
  isCareerCalendarEvent,
  publicDoc,
  publicMemory,
  normalizeDriveFile,
  getOverview,
  listApplications,
  createApplication,
  updateApplication,
  archiveApplication,
  listInterviews,
  createInterview,
  updateInterview,
  archiveInterview,
  uploadCareerDocument,
  listDocuments,
  listDriveFiles,
  attachDriveDocument,
  updateDocument,
  getDocumentFile,
  archiveDocument,
  createJobDescription,
  importJobFromUrl,
  confirmImportedJob,
  resumeMatch,
  prepareInterview,
  prepareApplication,
  createCareerMemory,
  listCareerMemory,
  listApplicationMemory,
  deleteCareerMemory,
  clearApplicationMemory,
  clearCareerMemory,
  loadRelevantCareerMemory,
  startPractice,
  answerPractice,
  getEmailSignals,
  acceptEmailSignal,
  ignoreEmailSignal,
  listFollowUps,
  draftFollowUp,
  snoozeFollowUp,
  markFollowUpHandled,
  listOffers,
  createOffer,
  draftOfferEmail,
};
