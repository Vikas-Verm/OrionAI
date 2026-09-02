"use strict";

const { test } = require("node:test");
const { mock } = require("node:test");
const assert = require("node:assert/strict");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/careerController");
const career = require("../services/careerService");

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("career APIs require authentication", async () => {
  const req = { headers: {}, query: {} };
  const res = makeRes();
  let nextCalled = false;
  authenticate(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "No token provided" });
});

test("calendar duplicate interview link returns existing record with non-create status", async (t) => {
  let calls = 0;
  const createInterview = mock.method(career, "createInterview", async (_userId, body) => {
    calls += 1;
    assert.equal(body.sourceApp, "google_calendar");
    assert.equal(body.sourceRef, "cal-1");
    if (calls === 1) {
      return { interview: { _id: "interview-1", sourceApp: "google_calendar", sourceRef: "cal-1" } };
    }
    return {
      interview: { _id: "interview-1", sourceApp: "google_calendar", sourceRef: "cal-1" },
      duplicate: true,
    };
  });
  t.after(() => createInterview.mock.restore());

  const req = {
    user: { username: "alice" },
    body: { company: "Acme", scheduledAt: new Date().toISOString(), sourceApp: "google_calendar", sourceRef: "cal-1" },
  };
  const first = makeRes();
  await controller.createInterview(req, first);
  assert.equal(first.statusCode, 201);
  assert.equal(first.body.interview._id, "interview-1");

  const second = makeRes();
  await controller.createInterview(req, second);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(second.body.interview._id, "interview-1");
  assert.equal(createInterview.mock.callCount(), 2);
});
