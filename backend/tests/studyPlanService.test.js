"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const RevisionItem = require("../models/RevisionItem");
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
