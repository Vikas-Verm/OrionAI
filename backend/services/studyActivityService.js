"use strict";

const StudyActivity = require("../models/StudyActivity");

const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "Asia/Kolkata";

function safeTimezone(value) {
  const tz = String(value || "").trim() || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function dateKeyFor(date = new Date(), timezone = DEFAULT_TIMEZONE) {
  const tz = safeTimezone(timezone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateFromKey(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function scoreForDelta(delta = {}) {
  return (
    (Number(delta.minutes) || 0) +
    (Number(delta.lessonCount) || 0) * 10 +
    (Number(delta.practiceQuestionCount) || 0) * 4 +
    (Number(delta.flashcardReviewCount) || 0) * 2 +
    (Number(delta.revisionCount) || 0) * 12 +
    (Number(delta.completedPlanItemCount) || 0) * 8 +
    (Number(delta.noteCount) || 0) * 3
  );
}

function intensityFor(day = {}) {
  const score = Number(day.activityScore) || 0;
  if (score <= 0) return 0;
  if (score < 20) return 1;
  if (score < 45) return 2;
  if (score < 80) return 3;
  return 4;
}

async function recordStudyActivity({
  userId,
  topicId = null,
  minutes = 0,
  lessonCount = 0,
  practiceQuestionCount = 0,
  flashcardReviewCount = 0,
  revisionCount = 0,
  completedPlanItemCount = 0,
  noteCount = 0,
  date = new Date(),
  timezone = DEFAULT_TIMEZONE,
  activityKey,
} = {}) {
  if (!userId || !activityKey) return null;
  const tz = safeTimezone(timezone);
  const dateKey = dateKeyFor(date, tz);
  let activity = await StudyActivity.findOne({ userId, dateKey });
  if (!activity) {
    activity = await StudyActivity.create({
      userId,
      dateKey,
      date: dateFromKey(dateKey),
      timezone: tz,
      activityKeys: [],
    });
  }
  if (activity.activityKeys.includes(activityKey)) return activity;

  activity.activityKeys.push(activityKey);
  activity.totalMinutes += Math.max(0, Math.round(Number(minutes) || 0));
  if (topicId && !activity.topicIds.map(String).includes(String(topicId))) {
    activity.topicIds.push(topicId);
  }
  activity.lessonCount += Math.max(0, Math.round(Number(lessonCount) || 0));
  activity.practiceQuestionCount += Math.max(
    0,
    Math.round(Number(practiceQuestionCount) || 0)
  );
  activity.flashcardReviewCount += Math.max(
    0,
    Math.round(Number(flashcardReviewCount) || 0)
  );
  activity.revisionCount += Math.max(0, Math.round(Number(revisionCount) || 0));
  activity.completedPlanItemCount += Math.max(
    0,
    Math.round(Number(completedPlanItemCount) || 0)
  );
  activity.noteCount += Math.max(0, Math.round(Number(noteCount) || 0));
  activity.activityScore += scoreForDelta({
    minutes,
    lessonCount,
    practiceQuestionCount,
    flashcardReviewCount,
    revisionCount,
    completedPlanItemCount,
    noteCount,
  });
  await activity.save();
  return activity;
}

function rangeBounds(range = "12_weeks", timezone = DEFAULT_TIMEZONE) {
  const now = new Date();
  const toKey = dateKeyFor(now, timezone);
  const to = dateFromKey(toKey);
  let days = 84;
  if (range === "30_days") days = 30;
  if (range === "6_months") days = 183;
  if (range === "year") {
    const year = Number(toKey.slice(0, 4));
    return {
      fromKey: `${year}-01-01`,
      toKey,
      from: dateFromKey(`${year}-01-01`),
      to,
    };
  }
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days + 1);
  return {
    fromKey: from.toISOString().slice(0, 10),
    toKey,
    from,
    to,
  };
}

function eachDateKey(fromKey, toKey) {
  const keys = [];
  const cursor = dateFromKey(fromKey);
  const end = dateFromKey(toKey);
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function calculateStreaks(days = [], toKey) {
  const active = new Set(
    days.filter((d) => (Number(d.activityScore) || 0) > 0).map((d) => d.date)
  );
  let currentStreak = 0;
  for (const cursor = dateFromKey(toKey); ; cursor.setUTCDate(cursor.getUTCDate() - 1)) {
    const key = cursor.toISOString().slice(0, 10);
    if (!active.has(key)) break;
    currentStreak += 1;
  }

  let longestStreak = 0;
  let run = 0;
  for (const day of days) {
    if ((Number(day.activityScore) || 0) > 0) {
      run += 1;
      longestStreak = Math.max(longestStreak, run);
    } else {
      run = 0;
    }
  }
  return { currentStreak, longestStreak };
}

async function getConsistency({ userId, range = "12_weeks", timezone } = {}) {
  const tz = safeTimezone(timezone);
  const { fromKey, toKey, from, to } = rangeBounds(range, tz);
  const records = await StudyActivity.find({
    userId,
    dateKey: { $gte: fromKey, $lte: toKey },
  }).lean();
  const byKey = new Map(records.map((r) => [r.dateKey, r]));
  const days = eachDateKey(fromKey, toKey).map((key) => {
    const record = byKey.get(key) || {};
    return {
      date: key,
      totalMinutes: Number(record.totalMinutes) || 0,
      activityScore: Number(record.activityScore) || 0,
      intensity: intensityFor(record),
      topicCount: Array.isArray(record.topicIds) ? record.topicIds.length : 0,
      lessonCount: Number(record.lessonCount) || 0,
      practiceQuestionCount: Number(record.practiceQuestionCount) || 0,
      flashcardReviewCount: Number(record.flashcardReviewCount) || 0,
      revisionCount: Number(record.revisionCount) || 0,
      completedPlanItemCount: Number(record.completedPlanItemCount) || 0,
      noteCount: Number(record.noteCount) || 0,
    };
  });
  const activeDays = days.filter((d) => d.activityScore > 0).length;
  const totalMinutes = days.reduce((sum, d) => sum + d.totalMinutes, 0);
  const { currentStreak, longestStreak } = calculateStreaks(days, toKey);
  return {
    range: { from: fromKey, to: toKey, timezone: tz },
    currentStreak,
    longestStreak,
    activeDays,
    totalMinutes,
    averageMinutesPerActiveDay:
      activeDays > 0 ? Math.round(totalMinutes / activeDays) : 0,
    days,
  };
}

module.exports = {
  DEFAULT_TIMEZONE,
  safeTimezone,
  dateKeyFor,
  recordStudyActivity,
  getConsistency,
  calculateStreaks,
  intensityFor,
};
