"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateStreaks,
  dateKeyFor,
  intensityFor,
  safeTimezone,
} = require("../services/studyActivityService");

test("study activity streaks only count days with real activity score", () => {
  const days = [
    { date: "2026-08-01", activityScore: 0 },
    { date: "2026-08-02", activityScore: 12 },
    { date: "2026-08-03", activityScore: 24 },
    { date: "2026-08-04", activityScore: 0 },
    { date: "2026-08-05", activityScore: 40 },
  ];

  assert.deepEqual(calculateStreaks(days, "2026-08-05"), {
    currentStreak: 1,
    longestStreak: 2,
  });
});

test("study activity date keys respect the learner timezone", () => {
  const lateUtc = new Date("2026-08-04T20:00:00Z");

  assert.equal(dateKeyFor(lateUtc, "Asia/Kolkata"), "2026-08-05");
  assert.equal(dateKeyFor(lateUtc, "UTC"), "2026-08-04");
  assert.equal(safeTimezone("Not/AZone"), "Asia/Kolkata");
});

test("study activity intensity tiers remain stable", () => {
  assert.equal(intensityFor({ activityScore: 0 }), 0);
  assert.equal(intensityFor({ activityScore: 12 }), 1);
  assert.equal(intensityFor({ activityScore: 30 }), 2);
  assert.equal(intensityFor({ activityScore: 60 }), 3);
  assert.equal(intensityFor({ activityScore: 120 }), 4);
});
