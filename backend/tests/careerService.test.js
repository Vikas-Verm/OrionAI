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
  assert.ok(match.strongMatches.some((item) => /REST APIs/i.test(item.jdRequirement)));
  assert.ok(match.missingEvidence.some((item) => /AWS/i.test(item.jdRequirement)));
  assert.equal(match.missingEvidence.find((item) => /AWS/i.test(item.jdRequirement)).resumeEvidence, "No clear evidence found");
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
  t.after(() => {
    findOne.mock.restore();
    create.mock.restore();
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
  assert.ok(prep.whatToPrepare.some((item) => /MongoDB indexing needs another review/i.test(item)));
  assert.equal(prep.grounding.resumeSource, "google_drive");
  assert.equal(prep.grounding.jobDescriptionSource, "google_docs");
  assert.equal(prep.grounding.careerMemory, true);
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

  assert.deepEqual(prep.resumeBasedQuestions, []);
  assert.equal(prep.grounding.resume, false);
  assert.equal(prep.grounding.jobDescription, false);
});
