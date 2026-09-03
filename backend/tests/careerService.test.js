"use strict";

const { test, mock } = require("node:test");
const assert = require("node:assert/strict");

const career = require("../services/careerService");
const JobApplication = require("../models/JobApplication");
const InterviewEvent = require("../models/InterviewEvent");
const CareerDocument = require("../models/CareerDocument");
const InterviewPracticeSession = require("../models/InterviewPracticeSession");
const CareerOffer = require("../models/CareerOffer");
const CareerMemory = require("../models/CareerMemory");
const Integration = require("../models/Integration");

test("career application validation requires company and role", () => {
  assert.equal(career.normalizeApplicationPayload({ company: "", role: "Engineer" }).error, "company is required");
  assert.equal(career.normalizeApplicationPayload({ company: "Acme", role: "" }).error, "role is required");
  const result = career.normalizeApplicationPayload({
    company: "Acme",
    role: "Backend Engineer",
    status: "HR Screening",
    sourceUrl: "https://example.com/job",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.payload.status, "hr_screening");
});

test("application update is scoped by authenticated userId", async (t) => {
  const findOneAndUpdate = mock.method(JobApplication, "findOneAndUpdate", async (query, update) => {
    assert.equal(query.userId, "alice");
    assert.equal(String(query._id), "64f000000000000000000001");
    assert.equal(update.$set.status, "applied");
    return { _id: query._id, userId: query.userId, status: update.$set.status };
  });
  t.after(() => findOneAndUpdate.mock.restore());

  const result = await career.updateApplication("alice", "64f000000000000000000001", { status: "applied" });
  assert.equal(result.application.status, "applied");
  assert.equal(findOneAndUpdate.mock.callCount(), 1);
});

test("career Gmail classifier returns reviewable high-confidence signals only", () => {
  const interview = career.classifyCareerEmail({
    id: "m1",
    subject: "Technical interview for Backend Engineer",
    from: "Recruiter <recruiter@acme.com>",
    snippet: "Please join the interview tomorrow.",
  });
  assert.equal(interview.category, "interview_invite");
  assert.ok(interview.confidence >= 0.75);
  assert.equal(interview.companyHint, "Acme");

  const generic = career.classifyCareerEmail({
    id: "m2",
    subject: "Weekly newsletter",
    from: "news@example.com",
    snippet: "Here are generic updates.",
  });
  assert.equal(generic, null);
});

test("calendar interview duplicate prevention returns existing event", async (t) => {
  const existing = { _id: "interview1", userId: "alice", sourceApp: "google_calendar", sourceRef: "cal-1" };
  const findOne = mock.method(InterviewEvent, "findOne", async (query) => {
    assert.equal(query.userId, "alice");
    assert.equal(query.sourceApp, "google_calendar");
    assert.equal(query.sourceRef, "cal-1");
    return existing;
  });
  const create = mock.method(InterviewEvent, "create", async () => {
    throw new Error("duplicate calendar event should not be created");
  });
  t.after(() => {
    findOne.mock.restore();
    create.mock.restore();
  });

  const result = await career.createInterview("alice", {
    company: "Acme",
    role: "Backend Engineer",
    scheduledAt: new Date().toISOString(),
    sourceApp: "google_calendar",
    sourceRef: "cal-1",
  });
  assert.equal(result.duplicate, true);
  assert.equal(result.interview, existing);
  assert.equal(create.mock.callCount(), 0);
});

test("resume match does not fabricate missing resume evidence", () => {
  const match = career.buildDeterministicResumeMatch({
    resumeText: "Experience designing REST APIs for production systems. Built Node.js and Express APIs backed by MongoDB for an internal workflow tool.",
    jdText: [
      "Experience designing REST APIs for production systems.",
      "AWS production experience is required.",
    ].join("\n"),
  });
  assert.ok(match.strongMatches.some((item) => /REST APIs/i.test(item.requirement)));
  assert.ok(match.missingEvidence.some((item) => /AWS/i.test(item.requirement)));
  assert.equal(match.missingEvidence.find((item) => /AWS/i.test(item.requirement)).resumeEvidence, "No clear evidence found");
  assert.match(match.summary, /strong match/i);
});

test("malformed Resume Match AI output falls back to validated structured evidence", () => {
  const fallback = career.buildDeterministicResumeMatch({
    resumeText: "Built production Node.js REST APIs.",
    jdText: "Experience building production Node.js REST APIs is required.\nAWS Lambda experience is required.",
  });
  const parsed = career.parseStructuredAiObject("```json\n{not valid json}\n```");
  const match = career.normalizeResumeMatch(parsed, fallback);

  assert.equal(parsed, null);
  assert.ok(match.strongMatches.every((item) => item.requirement && item.resumeEvidence));
  assert.ok(match.missingEvidence.some((item) => /AWS Lambda/i.test(item.requirement)));
  assert.equal(match.missingEvidence.find((item) => /AWS Lambda/i.test(item.requirement)).evidenceStatus, "not_found");
  assert.equal(typeof match.interviewRiskAreas[0].area, "string");

  const grounded = career.normalizeResumeMatch(
    {
      strongMatches: [{ requirement: "Kubernetes operations", resumeEvidence: "Managed Kubernetes", explanation: "Direct match" }],
      suggestedImprovements: ["Add Kubernetes production work."],
    },
    fallback,
    {
      resumeText: "Built production Node.js REST APIs.",
      jdText: "Experience building production Node.js REST APIs is required. AWS Lambda experience is required.",
    }
  );
  assert.doesNotMatch(JSON.stringify(grounded), /Kubernetes/i);
});

test("practice session creation is persisted with owner scope", async (t) => {
  const interview = {
    _id: "64f000000000000000000010",
    userId: "alice",
    applicationId: null,
    company: "Acme",
    role: "Backend Engineer",
    roundType: "technical",
  };
  const findOne = mock.method(InterviewEvent, "findOne", async (query) => {
    assert.equal(query.userId, "alice");
    return interview;
  });
  const create = mock.method(InterviewPracticeSession, "create", async (payload) => {
    assert.equal(payload.userId, "alice");
    assert.equal(payload.interviewId, interview._id);
    assert.equal(payload.type, "technical");
    assert.ok(payload.questions[0].question.includes("Backend Engineer"));
    return { _id: "practice1", ...payload };
  });
  const findPractice = mock.method(InterviewPracticeSession, "findOne", async (query) => {
    assert.equal(query.userId, "alice");
    assert.equal(query.status, "active");
    return null;
  });
  t.after(() => {
    findOne.mock.restore();
    create.mock.restore();
    findPractice.mock.restore();
  });

  const result = await career.startPractice("alice", interview._id, { type: "technical" });
  assert.equal(result.session.userId, "alice");
  assert.match(result.question, /Backend Engineer/);
});

test("offer creation verifies application ownership before persistence", async (t) => {
  const appFind = mock.method(JobApplication, "findOne", async (query) => {
    assert.equal(query.userId, "alice");
    assert.equal(String(query._id), "64f000000000000000000001");
    return { _id: query._id, userId: "alice", company: "Acme", role: "Backend Engineer" };
  });
  const offerCreate = mock.method(CareerOffer, "create", async (payload) => {
    assert.equal(payload.userId, "alice");
    assert.equal(payload.company, "Acme");
    return { _id: "offer1", ...payload };
  });
  const updateOne = mock.method(JobApplication, "updateOne", async (query, update) => {
    assert.equal(query.userId, "alice");
    assert.equal(update.$set.status, "offer");
    return { modifiedCount: 1 };
  });
  t.after(() => {
    appFind.mock.restore();
    offerCreate.mock.restore();
    updateOne.mock.restore();
  });

  const result = await career.createOffer("alice", {
    applicationId: "64f000000000000000000001",
    company: "Acme",
    role: "Backend Engineer",
    compensationText: "As entered by user",
  });
  assert.equal(result.offer.userId, "alice");
  assert.equal(offerCreate.mock.callCount(), 1);
});

test("career document upload validation enforces safe file types and size", () => {
  assert.equal(career.validateUpload(null), "No file uploaded");
  assert.match(career.validateUpload({ originalname: "resume.exe", mimetype: "application/octet-stream", size: 12 }), /Unsupported/);
  assert.equal(career.validateUpload({ originalname: "resume.pdf", mimetype: "application/pdf", size: 12 }), "");
  assert.equal(career.publicDoc({ toObject: () => ({ title: "Resume", storageKey: "private/key" }) }).storageKey, undefined);
});

test("career memory list and delete are scoped by owner", async (t) => {
  const memoryId = "64f000000000000000000040";
  const find = mock.method(CareerMemory, "find", (query) => {
    assert.equal(query.userId, "alice");
    return {
      sort(sort) {
        assert.equal(sort.updatedAt, -1);
        return {
          limit(limit) {
            assert.equal(limit, 100);
            return {
              lean: async () => [{ _id: memoryId, userId: "alice", title: "MongoDB indexing", memoryType: "weak_area" }],
            };
          },
        };
      },
    };
  });
  const deleteOne = mock.method(CareerMemory, "findOneAndDelete", async (query) => {
    assert.equal(query.userId, "alice");
    assert.equal(String(query._id), memoryId);
    return { _id: memoryId };
  });
  t.after(() => {
    find.mock.restore();
    deleteOne.mock.restore();
  });

  const memories = await career.listCareerMemory("alice");
  assert.equal(memories.length, 1);
  const deleted = await career.deleteCareerMemory("alice", memoryId);
  assert.equal(deleted._id, memoryId);
});

test("clearing application and career memory stays owner-scoped", async (t) => {
  const appId = "64f000000000000000000041";
  const appFind = mock.method(JobApplication, "findOne", async (query) => {
    assert.equal(query.userId, "alice");
    assert.equal(String(query._id), appId);
    return { _id: appId, userId: "alice", status: "applied" };
  });
  const deleteMany = mock.method(CareerMemory, "deleteMany", async (query) => {
    assert.equal(query.userId, "alice");
    return { deletedCount: query.applicationId ? 2 : 5 };
  });
  t.after(() => {
    appFind.mock.restore();
    deleteMany.mock.restore();
  });

  assert.equal((await career.clearApplicationMemory("alice", appId)).deletedCount, 2);
  assert.equal((await career.clearCareerMemory("alice")).deletedCount, 5);
});

test("practice answer creates structured memory without storing transcripts", async (t) => {
  const session = {
    _id: "64f000000000000000000050",
    userId: "alice",
    applicationId: "64f000000000000000000041",
    interviewId: "64f000000000000000000042",
    type: "behavioral",
    status: "active",
    questions: [{ question: "Tell me about ambiguity." }],
    save: async () => {},
  };
  const findOne = mock.method(InterviewPracticeSession, "findOne", async (query) => {
    assert.equal(query.userId, "alice");
    return session;
  });
  const remember = mock.method(CareerMemory, "findOneAndUpdate", async (query, update) => {
    assert.equal(query.userId, "alice");
    assert.equal(query.memoryType, "interview_feedback");
    assert.equal(update.$set.sourceType, "practice");
    assert.match(update.$set.content, /result|learning|concrete example/i);
    assert.doesNotMatch(update.$set.content, /too short/i);
    return update.$set;
  });
  t.after(() => {
    findOne.mock.restore();
    remember.mock.restore();
  });

  await career.answerPractice("alice", session._id, { answer: "I handled it.", complete: true });
  assert.equal(remember.mock.callCount(), 1);
});

test("career prep can include useful scoped memory summaries", () => {
  const prep = career.buildFallbackPrep({
    application: { company: "Acme", role: "Backend Engineer" },
    interview: { roundType: "technical" },
    resume: { extractedText: "Built Node.js APIs.", sourceApp: "google_drive" },
    jd: { extractedText: "MongoDB indexing experience is required.", sourceApp: "google_docs" },
    memories: [{ memoryType: "weak_area", title: "MongoDB indexing", content: "Needs review", sourceType: "practice" }],
  });
  assert.ok(prep.priorityTopics.some((item) => /MongoDB indexing/i.test(item.topic)));
  assert.ok(prep.weakAreasToReview.some((item) => /MongoDB indexing/i.test(item.area)));
  assert.equal(prep.grounding.resumeSource, "google_drive");
  assert.equal(prep.grounding.jobDescriptionSource, "google_docs");
  assert.equal(prep.grounding.careerMemory, true);
});

test("preparation validation keeps document evidence grounded and memory supplemental", () => {
  const fallback = career.buildFallbackPrep({
    application: { company: "Acme", role: "Backend Engineer" },
    interview: { roundType: "technical" },
    resume: { extractedText: "Built Node.js APIs and improved API latency.", sourceApp: "upload" },
    jd: { extractedText: "Node.js API design experience is required.", sourceApp: "manual" },
    memories: [{ memoryType: "weak_area", title: "API latency analysis", content: "Review profiling", sourceType: "practice" }],
  });
  const prep = career.normalizePreparation(
    {
      resumeQuestions: [{ question: "Tell me about Kubernetes", resumeBasis: "Managed Kubernetes clusters" }],
      jdQuestions: [{ question: "Explain Kubernetes", jdBasis: "Kubernetes is required" }],
      priorityTopics: [{ topic: "Kubernetes", reason: "Required by the JD", priority: "high", source: "JD" }],
    },
    fallback,
    {
      resumeText: "Built Node.js APIs and improved API latency.",
      jdText: "Node.js API design experience is required.",
    }
  );

  assert.doesNotMatch(JSON.stringify(prep.resumeQuestions), /Kubernetes/i);
  assert.doesNotMatch(JSON.stringify(prep.jdQuestions), /Kubernetes/i);
  assert.doesNotMatch(JSON.stringify(prep.priorityTopics), /Kubernetes/i);
  assert.ok(prep.weakAreasToReview.some((item) => /API latency/i.test(item.area)));
});

test("interview preparation persists structured output and source metadata", async (t) => {
  const appId = "64f000000000000000000080";
  const interviewId = "64f000000000000000000081";
  const resumeId = "64f000000000000000000082";
  const jdId = "64f000000000000000000083";
  let saved = 0;
  const application = { _id: appId, userId: "alice", company: "Acme", role: "Backend Engineer", resumeId, jobDescriptionId: jdId, notes: "" };
  const interview = {
    _id: interviewId,
    userId: "alice",
    applicationId: appId,
    company: "Acme",
    role: "Backend Engineer",
    roundType: "technical",
    notes: "",
    markModified() {},
    async save() { saved += 1; return this; },
  };
  const findInterview = mock.method(InterviewEvent, "findOne", async () => interview);
  const findApplication = mock.method(JobApplication, "findOne", async () => application);
  const findDocument = mock.method(CareerDocument, "findOne", async (query) =>
    String(query._id) === resumeId
      ? { _id: resumeId, updatedAt: new Date("2026-09-01"), type: "resume", sourceApp: "upload", processingStatus: "ready", extractedText: "Built Node.js REST APIs and improved latency." }
      : { _id: jdId, updatedAt: new Date("2026-09-02"), type: "job_description", sourceApp: "manual", processingStatus: "ready", extractedText: "Node.js REST API design experience is required." }
  );
  const findMemory = mock.method(CareerMemory, "find", () => {
    const query = { sort() { return query; }, limit() { return query; }, async lean() { return []; } };
    return query;
  });
  t.after(() => {
    findInterview.mock.restore();
    findApplication.mock.restore();
    findDocument.mock.restore();
    findMemory.mock.restore();
  });

  const result = await career.prepareInterview("alice", interviewId);
  assert.equal(saved, 1);
  assert.equal(interview.prepStatus, "ready");
  assert.equal(interview.prepMeta.resumeId, resumeId);
  assert.equal(interview.prepMeta.jobDescriptionId, jdId);
  assert.ok(result.preparation.resumeQuestions.length > 0);
  assert.ok(result.preparation.jdQuestions.length > 0);
});

test("role preparation works without an interview and persists on the application", async (t) => {
  const appId = "64f000000000000000000085";
  const resumeId = "64f000000000000000000086";
  const jdId = "64f000000000000000000087";
  let saved = 0;
  const application = {
    _id: appId,
    userId: "alice",
    company: "Acme",
    role: "Backend Engineer",
    resumeId,
    jobDescriptionId: jdId,
    notes: "",
    markModified() {},
    async save() { saved += 1; return this; },
  };
  const findApplication = mock.method(JobApplication, "findOne", async () => application);
  const findDocument = mock.method(CareerDocument, "findOne", async (query) =>
    String(query._id) === resumeId
      ? { _id: resumeId, type: "resume", sourceApp: "upload", processingStatus: "ready", extractedText: "Built Node.js REST APIs." }
      : { _id: jdId, type: "job_description", sourceApp: "manual", processingStatus: "ready", extractedText: "Node.js REST API experience is required." }
  );
  const findInterviews = mock.method(InterviewEvent, "find", () => {
    const query = { sort() { return query; }, limit() { return query; }, async lean() { return []; } };
    return query;
  });
  const findMemory = mock.method(CareerMemory, "find", () => {
    const query = { sort() { return query; }, limit() { return query; }, async lean() { return []; } };
    return query;
  });
  t.after(() => {
    findApplication.mock.restore();
    findDocument.mock.restore();
    findInterviews.mock.restore();
    findMemory.mock.restore();
  });

  const result = await career.prepareApplication("alice", appId);
  assert.equal(result.interview, null);
  assert.equal(saved, 1);
  assert.ok(application.prepPlan.priorityTopics.length > 0);
  assert.equal(application.prepMeta.resumeId, resumeId);
  assert.equal(application.prepMeta.jobDescriptionId, jdId);
});

test("practice saves feedback and exposes only the next question", async (t) => {
  const session = {
    _id: "64f000000000000000000084",
    userId: "alice",
    company: "Acme",
    role: "Backend Engineer",
    type: "technical",
    status: "active",
    questions: [{ question: "Describe a relevant project." }],
    async save() { return this; },
  };
  const findPractice = mock.method(InterviewPracticeSession, "findOne", async () => session);
  t.after(() => findPractice.mock.restore());

  const result = await career.answerPractice("alice", session._id, {
    questionIndex: 0,
    answer: "I designed a Node.js API, measured latency, and reduced response time for users by profiling the slow path.",
  });
  assert.equal(result.session.questions.length, 2);
  assert.ok(result.session.questions[0].feedback.good.length > 0);
  assert.notEqual(result.session.questions[0].question, result.session.questions[1].question);
  assert.equal(result.session.questions[1].userAnswer || "", "");
});

test("Drive document attachment prevents duplicate source references", async (t) => {
  const existing = { _id: "doc1", userId: "alice", sourceApp: "google_drive", sourceRef: "drive-1", toObject: () => ({ _id: "doc1", sourceRef: "drive-1" }) };
  const findOne = mock.method(CareerDocument, "findOne", async (query) => {
    assert.equal(query.userId, "alice");
    assert.equal(query.sourceRef, "drive-1");
    return existing;
  });
  const create = mock.method(CareerDocument, "create", async () => {
    throw new Error("duplicate should not create a document");
  });
  t.after(() => {
    findOne.mock.restore();
    create.mock.restore();
  });

  const result = await career.attachDriveDocument("alice", { fileId: "drive-1", type: "resume" });
  assert.equal(result.duplicate, true);
  assert.equal(create.mock.callCount(), 0);
});

test("Drive file listing uses existing Google Docs connection and marks supported files", async (t) => {
  const integrationFind = mock.method(Integration, "findOne", async (query) => {
    assert.equal(query.userId, "alice");
    assert.equal(query.type, "google_docs");
    return { googleDocs: { accessToken: "token" } };
  });
  t.after(() => integrationFind.mock.restore());

  const result = await career.listDriveFiles(
    "alice",
    { query: "resume", limit: 5 },
    {
      driveClient: {
        listFiles: async ({ query, limit }) => {
          assert.equal(query, "resume");
          assert.equal(limit, 5);
          return [
            career.normalizeDriveFile({
              id: "doc-1",
              name: "Resume",
              mimeType: "application/pdf",
              capabilities: { canDownload: true },
            }),
            career.normalizeDriveFile({
              id: "doc-2",
              name: "Image",
              mimeType: "image/png",
              capabilities: { canDownload: true },
            }),
          ];
        },
      },
    }
  );

  assert.equal(result.connected, true);
  assert.equal(result.files[0].supported, true);
  assert.equal(result.files[1].supported, false);
});

test("Drive document attachment uses owner scope and Drive metadata", async (t) => {
  const findOne = mock.method(CareerDocument, "findOne", async (query) => {
    assert.equal(query.userId, "alice");
    assert.equal(query.sourceRef, "drive-2");
    return null;
  });
  const integrationFind = mock.method(Integration, "findOne", async (query) => {
    assert.equal(query.userId, "alice");
    assert.equal(query.type, "google_docs");
    return { googleDocs: { accessToken: "token" } };
  });
  const create = mock.method(CareerDocument, "create", async (payload) => {
    assert.equal(payload.userId, "alice");
    assert.equal(payload.type, "job_description");
    assert.equal(payload.sourceApp, "google_docs");
    assert.equal(payload.sourceRef, "drive-2");
    assert.equal(payload.processingStatus, "ready");
    return { toObject: () => payload };
  });
  t.after(() => {
    findOne.mock.restore();
    integrationFind.mock.restore();
    create.mock.restore();
  });

  const result = await career.attachDriveDocument(
    "alice",
    { fileId: "drive-2", type: "job_description" },
    {
      driveClient: {
        getFileMetadata: async () => ({
          id: "drive-2",
          name: "Backend JD",
          mimeType: "application/vnd.google-apps.document",
          webViewLink: "https://docs.google.com/document/d/drive-2/edit",
          capabilities: { canDownload: true },
        }),
        getFileText: async () => "Experience designing APIs is required.",
      },
    }
  );
  assert.equal(result.document.processingStatus, "ready");
});

test("lost Drive permission returns a clear error without creating a Career document", async (t) => {
  const findOne = mock.method(CareerDocument, "findOne", async () => null);
  const integrationFind = mock.method(Integration, "findOne", async () => ({ googleDocs: { accessToken: "token" } }));
  const create = mock.method(CareerDocument, "create", async () => {
    throw new Error("permission failure should not create");
  });
  t.after(() => {
    findOne.mock.restore();
    integrationFind.mock.restore();
    create.mock.restore();
  });

  const result = await career.attachDriveDocument(
    "alice",
    { fileId: "drive-3", type: "resume" },
    {
      driveClient: {
        getFileMetadata: async () => {
          const error = new Error("Forbidden");
          error.statusCode = 403;
          throw error;
        },
      },
    }
  );
  assert.equal(result.status, 403);
  assert.match(result.error, /Google Drive permission is unavailable/);
  assert.equal(create.mock.callCount(), 0);
});

test("failed Drive extraction stores no fabricated document text", async (t) => {
  const findOne = mock.method(CareerDocument, "findOne", async () => null);
  const integrationFind = mock.method(Integration, "findOne", async () => ({ googleDocs: { accessToken: "token" } }));
  const create = mock.method(CareerDocument, "create", async (payload) => {
    assert.equal(payload.extractedText, "");
    assert.equal(payload.processingStatus, "failed");
    assert.equal(payload.processingError, "OrionAI could not read this file yet.");
    return { toObject: () => payload };
  });
  t.after(() => {
    findOne.mock.restore();
    integrationFind.mock.restore();
    create.mock.restore();
  });

  const result = await career.attachDriveDocument(
    "alice",
    { fileId: "drive-4", type: "resume" },
    {
      driveClient: {
        getFileMetadata: async () => ({
          id: "drive-4",
          name: "Resume.pdf",
          mimeType: "application/pdf",
          webViewLink: "https://drive.google.com/file/d/drive-4/view",
          capabilities: { canDownload: true },
        }),
        getFileText: async () => {
          throw new Error("parse failed");
        },
      },
    }
  );
  assert.equal(result.document.processingStatus, "failed");
});

test("resume match refuses inaccessible Drive content instead of fabricating evidence", async (t) => {
  const appId = "64f000000000000000000060";
  const resumeId = "64f000000000000000000061";
  const jdId = "64f000000000000000000062";
  const appFind = mock.method(JobApplication, "findOne", async () => ({
    _id: appId,
    userId: "alice",
    status: "applied",
    resumeId,
    jobDescriptionId: jdId,
  }));
  const docFind = mock.method(CareerDocument, "findOne", async (query) => {
    if (String(query._id) === resumeId) {
      return {
        _id: resumeId,
        userId: "alice",
        type: "resume",
        sourceApp: "google_drive",
        sourceUnavailable: true,
        processingStatus: "failed",
        extractedText: "",
      };
    }
    return {
      _id: jdId,
      userId: "alice",
      type: "job_description",
      sourceApp: "google_docs",
      processingStatus: "ready",
      extractedText: "Node.js API experience required.",
    };
  });
  t.after(() => {
    appFind.mock.restore();
    docFind.mock.restore();
  });

  const result = await career.resumeMatch("alice", appId);
  assert.match(result.error, /Resume source is unavailable/);
});

test("interview prep fallback does not use inaccessible Drive content as evidence", () => {
  const prep = career.buildFallbackPrep({
    application: { company: "Acme", role: "Backend Engineer" },
    interview: { roundType: "technical" },
    resume: null,
    jd: null,
    memories: [],
  });

  assert.deepEqual(prep.resumeQuestions, []);
  assert.equal(prep.grounding.resume, false);
  assert.equal(prep.grounding.jobDescription, false);
});

test("uploaded TXT resume extraction produces actual text", async () => {
  const text = await career.extractTextFromUpload(
    {
      originalname: "resume.txt",
      mimetype: "text/plain",
      buffer: Buffer.from("Built Node.js APIs and MongoDB indexes."),
    },
    "txt"
  );
  assert.match(text, /Node\.js APIs/);
  assert.match(text, /MongoDB indexes/);
});

test("resume match falls back to primary resume and uses extracted text", async (t) => {
  const appId = "64f000000000000000000070";
  const jdId = "64f000000000000000000071";
  let saveCount = 0;
  const application = {
    _id: appId,
    userId: "alice",
    company: "Acme",
    role: "Backend Engineer",
    status: "applied",
    resumeId: null,
    jobDescriptionId: jdId,
    markModified() {},
    async save() {
      saveCount += 1;
      return this;
    },
  };
  const appFind = mock.method(JobApplication, "findOne", async () => application);
  const docFind = mock.method(CareerDocument, "findOne", async (query) => {
    if (query.type === "resume" && query.isPrimary === true) {
      return {
        _id: "64f000000000000000000072",
        userId: "alice",
        type: "resume",
        sourceApp: "upload",
        processingStatus: "ready",
        extractedText: "Designed REST APIs with Node.js and MongoDB for production systems.",
      };
    }
    if (String(query._id) === jdId) {
      return {
        _id: jdId,
        userId: "alice",
        type: "job_description",
        sourceApp: "manual",
        processingStatus: "ready",
        extractedText: "Experience designing REST APIs for production systems is required.",
      };
    }
    return null;
  });
  t.after(() => {
    appFind.mock.restore();
    docFind.mock.restore();
  });

  const result = await career.resumeMatch("alice", appId);
  const supportedMatches = [...result.match.strongMatches, ...result.match.partialMatches];
  assert.ok(supportedMatches.length > 0);
  assert.match(JSON.stringify(supportedMatches), /REST APIs/i);
  assert.equal(result.match.grounding.resumeSource, "upload");
  assert.equal(saveCount, 1);
  assert.deepEqual(application.resumeMatch, result.match);
  assert.equal(String(application.resumeMatchMeta.resumeId), "64f000000000000000000072");
  assert.equal(String(application.resumeMatchMeta.jobDescriptionId), jdId);
  assert.ok(application.resumeMatchGeneratedAt instanceof Date);
});

test("resume match returns friendly processing and failed extraction messages", async (t) => {
  const appId = "64f000000000000000000073";
  const jdId = "64f000000000000000000074";
  const resumeId = "64f000000000000000000075";
  const appFind = mock.method(JobApplication, "findOne", async () => ({
    _id: appId,
    userId: "alice",
    status: "applied",
    resumeId,
    jobDescriptionId: jdId,
  }));
  const docFind = mock.method(CareerDocument, "findOne", async (query) => {
    if (String(query._id) === resumeId) {
      return { _id: resumeId, type: "resume", processingStatus: "processing", extractedText: "" };
    }
    return { _id: jdId, type: "job_description", processingStatus: "ready", extractedText: "Node.js required." };
  });
  t.after(() => {
    appFind.mock.restore();
    docFind.mock.restore();
  });

  const processing = await career.resumeMatch("alice", appId);
  assert.equal(processing.error, "Resume is still being processed. Try again in a moment.");

  docFind.mock.mockImplementation(async (query) => {
    if (String(query._id) === resumeId) {
      return {
        _id: resumeId,
        type: "resume",
        processingStatus: "failed",
        processingError: "No extractable text found.",
        extractedText: "",
      };
    }
    return { _id: jdId, type: "job_description", processingStatus: "ready", extractedText: "Node.js required." };
  });
  const failed = await career.resumeMatch("alice", appId);
  assert.equal(failed.error, "No readable text was found in this resume.");
});

test("job URL importer blocks local/private URLs before fetch", async () => {
  assert.equal(career.isPrivateAddress("127.0.0.1"), true);
  assert.equal(career.isPrivateAddress("10.0.0.2"), true);
  const local = await career.validatePublicJobUrl("https://127.0.0.1/jobs/1", { skipDnsLookup: true });
  assert.match(local.error, /security/);
  const protocol = await career.validatePublicJobUrl("file:///etc/passwd", { skipDnsLookup: true });
  assert.match(protocol.error, /https/);
});

test("job URL importer extracts job details for user review without saving", async () => {
  const html = `
    <html><head><title>Backend Engineer - Acme</title>
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"JobPosting","title":"Backend Engineer","hiringOrganization":{"name":"Acme"},"jobLocation":{"address":{"addressLocality":"Remote"}},"employmentType":"FULL_TIME","description":"Build REST APIs. MongoDB indexing experience required. Remote role."}
    </script></head><body>Apply for this job.</body></html>`;
  const result = await career.importJobFromUrl(
    "alice",
    { sourceUrl: "https://jobs.example.com/backend" },
    {
      skipDnsLookup: true,
      pageFetcher: async (url) => ({ finalUrl: url, html, text: career.htmlToText(html), sourceTitle: "Backend Engineer - Acme" }),
    }
  );

  assert.equal(result.reviewRequired, true);
  assert.equal(result.importedJob.company, "Acme");
  assert.equal(result.importedJob.role, "Backend Engineer");
  assert.equal(result.importedJob.workMode, "remote");
});

test("confirm imported job creates reviewed application and JD once", async (t) => {
  const appId = "64f000000000000000000076";
  const jdId = "64f000000000000000000077";
  const appFind = mock.method(JobApplication, "findOne", async () => null);
  const docCreate = mock.method(CareerDocument, "create", async (payload) => ({
    _id: jdId,
    ...payload,
    toObject: () => ({ _id: jdId, ...payload }),
  }));
  const docFind = mock.method(CareerDocument, "findOne", async (query) => {
    assert.equal(query.userId, "alice");
    return { _id: jdId, userId: "alice", type: "job_description", processingStatus: "ready" };
  });
  const appCreate = mock.method(JobApplication, "create", async (payload) => ({
    _id: appId,
    ...payload,
  }));
  t.after(() => {
    appFind.mock.restore();
    docCreate.mock.restore();
    docFind.mock.restore();
    appCreate.mock.restore();
  });

  const result = await career.confirmImportedJob("alice", {
    importedJob: {
      company: "Acme",
      role: "Backend Engineer",
      location: "Remote",
      workMode: "remote",
      employmentType: "full_time",
      salaryText: "Not found",
      sourceUrl: "https://jobs.example.com/backend",
      jobDescriptionText: "MongoDB indexing experience required.",
      skills: ["mongodb"],
    },
    status: "interested",
  });

  assert.equal(result.application.company, "Acme");
  assert.equal(result.application.sourceApp, "web");
  assert.equal(String(result.application.jobDescriptionId), jdId);
  assert.equal(docCreate.mock.callCount(), 1);
  assert.equal(appCreate.mock.callCount(), 1);
});
