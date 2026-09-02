"use strict";

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
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
  if (doc?.sourceUnavailable) {
    return `${label} source is unavailable. Reconnect Google Docs/Drive or reattach the file.`;
  }
  return `${label} text is not available`;
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
    const gaps = (match?.missingEvidence || []).map((item) => cleanString(item.jdRequirement, 220)).filter(Boolean);
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

function buildDeterministicResumeMatch({ resumeText = "", jdText = "" } = {}) {
  const requirements = extractRequirements(jdText);
  const strongMatches = [];
  const partialMatches = [];
  const missingEvidence = [];
  for (const requirement of requirements) {
    const result = evidenceForRequirement(requirement, resumeText);
    const entry = {
      jdRequirement: requirement,
      resumeEvidence: result.evidence || "No clear evidence found",
      assessment:
        result.assessment === "strong"
          ? "Strong evidence"
          : result.assessment === "partial"
            ? "Partial evidence"
            : "Not found in current resume",
      keywords: result.keywords,
    };
    if (result.assessment === "strong") strongMatches.push(entry);
    else if (result.assessment === "partial") partialMatches.push(entry);
    else missingEvidence.push(entry);
  }
  return {
    strongMatches,
    partialMatches,
    missingEvidence,
    suggestedImprovements: missingEvidence.slice(0, 5).map((item) =>
      `If you truly have experience with "${item.jdRequirement}", add specific, truthful evidence to the resume.`
    ),
    interviewRiskAreas: [...missingEvidence, ...partialMatches].slice(0, 5).map((item) => item.jdRequirement),
    grounding: {
      resume: Boolean(cleanString(resumeText)),
      jobDescription: Boolean(cleanString(jdText)),
      generalKnowledge: false,
    },
  };
}

async function resumeMatch(userId, applicationId, body = {}) {
  const application = await assertApplicationOwnership(userId, applicationId);
  const resumeId = objectId(body.resumeId) || application.resumeId;
  const jdId = objectId(body.jobDescriptionId) || application.jobDescriptionId;
  const [resume, jd] = await Promise.all([
    assertDocumentOwnership(userId, resumeId, ["resume"]),
    assertDocumentOwnership(userId, jdId, ["job_description"]),
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
            "Return JSON: {strongMatches:[], partialMatches:[], missingEvidence:[], suggestedImprovements:[], interviewRiskAreas:[]}.",
            "Each match needs jdRequirement, resumeEvidence, assessment.",
            `Resume:\n${resume.extractedText.slice(0, 18000)}`,
            `JD:\n${jd.extractedText.slice(0, 14000)}`,
          ].join("\n\n"),
        },
      ],
      1800,
      0.2
    );
    const parsed = JSON.parse(String(raw || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
    const match = {
      ...deterministic,
      ...parsed,
      grounding: deterministic.grounding,
    };
    await rememberResumeMatchGaps(userId, application._id, match);
    return { match };
  } catch {
    await rememberResumeMatchGaps(userId, application._id, deterministic);
    return { match: deterministic };
  }
}

function buildFallbackPrep({ application, interview, resume, jd, memories = [] }) {
  const jdRequirements = extractRequirements(jd?.extractedText || "");
  const resumeTokens = [...tokenize(resume?.extractedText || "")].slice(0, 18);
  const memoryLines = memoryPrepLines(memories);
  return {
    roleSummary: jd?.extractedText
      ? `This role appears to emphasize ${jdRequirements.slice(0, 3).join("; ") || "the responsibilities described in the supplied JD"}.`
      : "Add the job description for a stronger role-specific summary.",
    whatToPrepare: [...memoryLines, ...jdRequirements.slice(0, 8)].slice(0, 10),
    resumeBasedQuestions: resumeTokens.slice(0, 8).map((token) => `Can you explain your practical experience with ${token}?`),
    jdBasedQuestions: jdRequirements.slice(0, 8).map((req) => `How would you approach: ${req}?`),
    companyRoleQuestions: [
      {
        source: "General OrionAI knowledge",
        question: `What outcomes would define success for the ${application.role} role in the first 90 days?`,
      },
    ],
    behavioralPreparation: [
      ...memoryLines.filter((line) => /behavioral story/i.test(line)),
      "Prepare real STAR stories for conflict, ownership, ambiguity, failure, and measurable impact.",
    ],
    questionsToAskInterviewer: [
      `What are the most important problems this ${application.role} hire should solve first?`,
      "How does the team review technical quality and collaboration?",
    ],
    grounding: {
      application: true,
      interview: Boolean(interview),
      resume: Boolean(resume?.extractedText),
      jobDescription: Boolean(jd?.extractedText),
      resumeSource: resume?.sourceApp || "",
      jobDescriptionSource: jd?.sourceApp || "",
      careerMemory: memories.length > 0,
      generalKnowledge: true,
    },
    careerMemory: memories,
  };
}

async function prepareInterview(userId, interviewId) {
  const interview = await assertInterviewOwnership(userId, interviewId);
  const application = interview.applicationId
    ? await assertApplicationOwnership(userId, interview.applicationId)
    : await JobApplication.findOne({ userId, company: interview.company, status: { $ne: "archived" } });
  const [resume, jd] = await Promise.all([
    application?.resumeId
      ? CareerDocument.findOne({ _id: application.resumeId, userId, processingStatus: { $ne: "archived" } })
      : CareerDocument.findOne({ userId, type: "resume", isPrimary: true, processingStatus: { $ne: "archived" } }),
    application?.jobDescriptionId
      ? CareerDocument.findOne({ _id: application.jobDescriptionId, userId, processingStatus: { $ne: "archived" } })
      : null,
  ]);
  const usableResume = documentHasUsableText(resume) ? resume : null;
  const usableJd = documentHasUsableText(jd) ? jd : null;
  const memories = await loadRelevantCareerMemory(userId, {
    applicationId: application?._id || interview.applicationId,
    interviewId: interview._id,
  });
  const fallback = buildFallbackPrep({
    application: application || interview,
    interview,
    resume: usableResume,
    jd: usableJd,
    memories,
  });

  try {
    const raw = await chatComplete(
      [
        {
          role: "system",
          content: [
            "You are OrionAI Career & Interviews.",
            "Return only JSON with the requested sections.",
            "Separate source-grounded content from general OrionAI knowledge.",
            "Never fabricate user experience, company requirements, round type, or interview outcome.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "Return JSON with keys: roleSummary, whatToPrepare, resumeBasedQuestions, jdBasedQuestions, companyRoleQuestions, behavioralPreparation, questionsToAskInterviewer, grounding.",
            `Application: ${application?.company || interview.company} - ${application?.role || interview.role || ""}`,
            `Round: ${interview.roundType || "unknown"}`,
            `Notes: ${[application?.notes, interview.notes].filter(Boolean).join("\n").slice(0, 4000)}`,
            `Career memory summaries:\n${memories.map((memory) => `${memory.memoryType}: ${memory.title} - ${memory.content} (${memory.sourceType || "other"}:${memory.sourceRef || "none"})`).join("\n").slice(0, 5000)}`,
            `Resume source: ${usableResume?.sourceApp || "none"}`,
            `Resume text:\n${(usableResume?.extractedText || "").slice(0, 12000)}`,
            `JD source: ${usableJd?.sourceApp || "none"}`,
            `JD text:\n${(usableJd?.extractedText || "").slice(0, 10000)}`,
          ].join("\n\n"),
        },
      ],
      1800,
      0.3
    );
    const parsed = JSON.parse(String(raw || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
    interview.prepPlan = { ...fallback, ...parsed, grounding: fallback.grounding, careerMemory: memories };
  } catch {
    interview.prepPlan = fallback;
  }
  interview.prepStatus = "in_progress";
  await interview.save();
  return { preparation: interview.prepPlan, interview };
}

function nextPracticeQuestion({ application, interview, type }) {
  const base = application
    ? `${application.role} at ${application.company}`
    : `${interview?.role || "this role"} at ${interview?.company || "the company"}`;
  if (type === "behavioral") return `Tell me about a real situation where you handled ambiguity while working toward ${base}.`;
  if (type === "system_design") return `Design a system relevant to ${base}. Start with requirements and constraints.`;
  if (type === "technical" || type === "coding") return `Pick one technical project from your resume that is relevant to ${base}. What tradeoffs did you make?`;
  if (type === "hr") return `Why are you interested in ${base}, using only your actual motivations and experience?`;
  return `What makes your actual background a fit for ${base}?`;
}

async function startPractice(userId, interviewId, body = {}) {
  const interview = await assertInterviewOwnership(userId, interviewId);
  const application = interview.applicationId ? await assertApplicationOwnership(userId, interview.applicationId) : null;
  const type = validateEnum(body.type || interview.roundType || "role_specific", InterviewPracticeSession.TYPE_VALUES, "role_specific");
  const question = nextPracticeQuestion({ application, interview, type });
  const session = await InterviewPracticeSession.create({
    userId,
    applicationId: application?._id || interview.applicationId || null,
    interviewId: interview._id,
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
  if (!answer) {
    const err = new Error("answer is required");
    err.status = 400;
    throw err;
  }
  const index = Math.max(0, Math.min(Number(body.questionIndex ?? session.questions.length - 1), session.questions.length - 1));
  session.questions[index].userAnswer = answer;
  session.questions[index].feedback = buildAnswerFeedback(answer);
  session.questions[index].answeredAt = new Date();
  await rememberPracticeFeedback(userId, session, session.questions[index].feedback);
  const nextQuestion = nextPracticeQuestion({
    application: null,
    interview: { company: "the company", role: "the role", roundType: session.type },
    type: session.type,
  });
  if (body.complete === true) {
    session.status = "completed";
    session.completedAt = new Date();
    session.summary = "Practice completed. Review missing points and refine answers with real examples.";
    session.weakAreas = session.questions.flatMap((q) => q.feedback?.missing || []).slice(0, 8);
  } else if (session.questions.length < 10) {
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
  sanitizeFileName,
  inferDocumentType,
  validateUpload,
  resolveStoragePath,
  normalizeApplicationPayload,
  normalizeInterviewPayload,
  normalizeOfferPayload,
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
  resumeMatch,
  prepareInterview,
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
