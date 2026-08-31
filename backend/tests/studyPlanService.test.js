"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const RevisionItem = require("../models/RevisionItem");
const StudySession = require("../models/StudySession");
const studyPlanService = require("../services/studyPlanService");

test("RevisionItem.daysForLevel uses the expected spacing schedule", () => {
  assert.equal(RevisionItem.daysForLevel(1), 1);
  assert.equal(RevisionItem.daysForLevel(2), 3);
  assert.equal(RevisionItem.daysForLevel(3), 7);
  assert.equal(RevisionItem.daysForLevel(4), 15);
  // Beyond the configured schedule we keep the longest cadence.
  assert.equal(RevisionItem.daysForLevel(5), 15);
  assert.equal(RevisionItem.daysForLevel(50), 15);
});

test("RevisionItem.daysForLevel clamps non-positive / invalid levels to level 1", () => {
  assert.equal(RevisionItem.daysForLevel(0), 1);
  assert.equal(RevisionItem.daysForLevel(-3), 1);
  assert.equal(RevisionItem.daysForLevel("foo"), 1);
  assert.equal(RevisionItem.daysForLevel(null), 1);
});

test("studyPlanService date helpers normalize correctly", () => {
  const base = new Date("2025-01-10T15:30:00Z");
  const start = studyPlanService.startOfDay(base);
  const end = studyPlanService.endOfDay(base);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(end.getHours(), 23);
  assert.equal(end.getMinutes(), 59);

  const plusTwo = studyPlanService.addDays(start, 2);
  assert.equal(plusTwo.getDate(), start.getDate() + 2);
});

test("started study items do not count as completed learning work", () => {
  const topicA = "64f000000000000000000001";
  const topicB = "64f000000000000000000002";
  const session = new StudySession({
    userId: "learner",
    goalId: "64f000000000000000000099",
    date: new Date("2026-08-05T00:00:00Z"),
    plannedItems: [
      {
        topicId: topicA,
        plannedMinutes: 25,
        order: 0,
        type: "learn",
        status: "started",
        startedAt: new Date("2026-08-05T10:00:00Z"),
      },
      {
        topicId: topicB,
        plannedMinutes: 35,
        order: 1,
        type: "learn",
        status: "planned",
      },
    ],
  });

  studyPlanService.syncLegacySessionFields(session);

  assert.equal(session.minutesCompleted, 0);
  assert.equal(session.minutesPlanned, 60);
  assert.equal(session.status, "in_progress");
  assert.deepEqual(session.completedTopicIds.map(String), []);

  session.plannedItems[0].status = "completed";
  session.plannedItems[0].completedAt = new Date("2026-08-05T10:25:00Z");
  studyPlanService.syncLegacySessionFields(session);

  assert.equal(session.minutesCompleted, 25);
  assert.deepEqual(session.completedTopicIds.map(String), [topicA]);
});
