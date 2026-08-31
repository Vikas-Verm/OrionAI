"use strict";

const StudyGoal = require("../models/StudyGoal");
const StudyTopic = require("../models/StudyTopic");
const StudySession = require("../models/StudySession");
const RevisionItem = require("../models/RevisionItem");
const PracticeQuestion = require("../models/PracticeQuestion");

const DEFAULT_BLOCK_MINUTES = 30;
const MIN_BLOCK_MINUTES = 15;
const STATUS_PRIORITY = {
  in_progress: 0,
  weak: 1,
  revision_due: 2,
  not_started: 3,
  completed: 99,
};

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function localDateKey(date = new Date()) {
  const d = startOfDay(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function topicSortKey(topic) {
  const statusRank = STATUS_PRIORITY[topic.status] ?? 50;
  const orderRank = Number.isFinite(topic.order) ? topic.order : 0;
  return [statusRank, orderRank];
}

function pickTopicsForPlan({ topics, dailyTimeMinutes }) {
  const candidates = topics
    .filter((t) => t.status !== "completed")
    .sort((a, b) => {
      const [aStatus, aOrder] = topicSortKey(a);
      const [bStatus, bOrder] = topicSortKey(b);
      if (aStatus !== bStatus) return aStatus - bStatus;
      return aOrder - bOrder;
    });

  const target =
    Number.isFinite(dailyTimeMinutes) && dailyTimeMinutes > 0
      ? dailyTimeMinutes
      : DEFAULT_BLOCK_MINUTES * 2;

  const picked = [];
  let minutes = 0;
  for (const topic of candidates) {
    const estimated =
      Number.isFinite(topic.estimatedMinutes) && topic.estimatedMinutes > 0
        ? topic.estimatedMinutes
        : DEFAULT_BLOCK_MINUTES;
    if (minutes + estimated > target && picked.length > 0) break;
    picked.push({ topic, plannedMinutes: estimated });
    minutes += estimated;
    if (minutes >= target) break;
  }

  if (picked.length === 0 && candidates.length > 0) {
    const topic = candidates[0];
    const plannedMinutes = Math.max(
      MIN_BLOCK_MINUTES,
      Number.isFinite(topic.estimatedMinutes) && topic.estimatedMinutes > 0
        ? topic.estimatedMinutes
        : DEFAULT_BLOCK_MINUTES
    );
    picked.push({ topic, plannedMinutes });
    minutes = plannedMinutes;
  }

  return { picks: picked, totalMinutes: minutes };
}

function reasonForTopic(topic) {
  switch (topic.status) {
    case "weak":
      return "Marked weak — needs another pass.";
    case "revision_due":
      return "Revision due — quick refresh.";
    case "in_progress":
      return "Continue what you started.";
    case "not_started":
      return "Next topic in your goal.";
    case "completed":
      return "Completed today.";
    default:
      return "Recommended for today.";
  }
}

function planItemTypeForTopic(topic) {
  return topic.status === "revision_due" ? "revise" : "learn";
}

function plannedMinutesForTopic(topic) {
  return Number.isFinite(topic?.estimatedMinutes) && topic.estimatedMinutes > 0
    ? topic.estimatedMinutes
    : DEFAULT_BLOCK_MINUTES;
}

function buildPlannedItemsFromPicks(picks = []) {
  return picks.map(({ topic, plannedMinutes }, index) => ({
    topicId: topic._id,
    plannedMinutes:
      Number.isFinite(plannedMinutes) && plannedMinutes > 0
        ? plannedMinutes
        : plannedMinutesForTopic(topic),
    order: index,
    type: planItemTypeForTopic(topic),
    status: "planned",
    startedAt: null,
    completedAt: null,
  }));
}

function getSessionPlannedItems(session) {
  if (!session) return [];
  const plannedItems = Array.isArray(session.plannedItems)
    ? session.plannedItems
    : [];
  if (plannedItems.length) return plannedItems;

  const plannedTopicIds = Array.isArray(session.plannedTopicIds)
    ? session.plannedTopicIds
    : [];
  const completedIds = new Set((session.completedTopicIds || []).map(String));
  const perTopic =
    plannedTopicIds.length > 0
      ? Math.round((Number(session.minutesPlanned) || 0) / plannedTopicIds.length)
      : 0;
  return plannedTopicIds.map((topicId, index) => ({
    topicId,
    plannedMinutes: perTopic,
    order: index,
    type: "learn",
    status: completedIds.has(String(topicId)) ? "completed" : "planned",
    startedAt: null,
    completedAt: null,
  }));
}

function syncLegacySessionFields(session) {
  const items = getSessionPlannedItems(session);
  session.plannedTopicIds = items
    .filter((item) => item.status !== "moved" && item.status !== "skipped")
    .map((item) => item.topicId);
  session.completedTopicIds = items
    .filter((item) => item.status === "completed")
    .map((item) => item.topicId);
  session.minutesPlanned = items
    .filter((item) => item.status !== "moved" && item.status !== "skipped")
    .reduce((sum, item) => sum + (Number(item.plannedMinutes) || 0), 0);
  session.minutesCompleted = items
    .filter((item) => item.status === "completed")
    .reduce((sum, item) => sum + (Number(item.plannedMinutes) || 0), 0);

  const activeItems = items.filter(
    (item) => item.status !== "moved" && item.status !== "skipped"
  );
  const completedCount = activeItems.filter(
    (item) => item.status === "completed"
  ).length;
  const startedCount = activeItems.filter((item) =>
    ["started", "completed"].includes(item.status)
  ).length;

  if (activeItems.length > 0 && completedCount >= activeItems.length) {
    session.status = "completed";
  } else if (startedCount > 0 || session.minutesCompleted > 0) {
    session.status = "in_progress";
  } else if (session.status !== "missed") {
    session.status = "planned";
  }
}

async function markSessionTopicStarted({
  userId,
  goalId,
  topicId,
  date = new Date(),
} = {}) {
  if (!userId || !goalId || !topicId) return null;
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const session = await StudySession.findOne({
    userId,
    goalId,
    date: { $gte: dayStart, $lte: dayEnd },
  });
  if (!session) return null;

  const items = getSessionPlannedItems(session).map((item) =>
    typeof item.toObject === "function" ? item.toObject() : { ...item }
  );
  const item = items.find((entry) => String(entry.topicId) === String(topicId));
  if (!item || item.status === "completed") return session;

  item.status = "started";
  item.startedAt = item.startedAt || new Date();
  session.plannedItems = items;
  syncLegacySessionFields(session);
  await session.save();
  return session;
}

async function markSessionTopicCompleted({
  userId,
  goalId,
  topicId,
  fallbackMinutes = DEFAULT_BLOCK_MINUTES,
  type = "learn",
  date = new Date(),
} = {}) {
  if (!userId || !goalId || !topicId) return null;
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  let session = await StudySession.findOne({
    userId,
    goalId,
    date: { $gte: dayStart, $lte: dayEnd },
  });

  const now = new Date();
  if (!session) {
    const plannedMinutes =
      Number.isFinite(fallbackMinutes) && fallbackMinutes > 0
        ? fallbackMinutes
        : DEFAULT_BLOCK_MINUTES;
    session = await StudySession.create({
      userId,
      goalId,
      date: dayStart,
      plannedTopicIds: [topicId],
      completedTopicIds: [topicId],
      plannedItems: [
        {
          topicId,
          plannedMinutes,
          order: 0,
          type,
          status: "completed",
          startedAt: now,
          completedAt: now,
        },
      ],
      minutesPlanned: plannedMinutes,
      minutesCompleted: plannedMinutes,
      status: "completed",
    });
    return session;
  }

  const items = getSessionPlannedItems(session).map((item) =>
    typeof item.toObject === "function" ? item.toObject() : { ...item }
  );
  let item = items.find((entry) => String(entry.topicId) === String(topicId));
  if (!item) {
    item = {
      topicId,
      plannedMinutes:
        Number.isFinite(fallbackMinutes) && fallbackMinutes > 0
          ? fallbackMinutes
          : DEFAULT_BLOCK_MINUTES,
      order: items.length,
      type,
      status: "planned",
      startedAt: null,
      completedAt: null,
    };
    items.push(item);
  }

  if (item.status !== "completed") {
    item.status = "completed";
    item.startedAt = item.startedAt || now;
    item.completedAt = now;
  }
  session.plannedItems = items;
  syncLegacySessionFields(session);
  await session.save();
  return session;
}

async function generateTodaysPlan({
  userId,
  goalId = null,
  retryOnVersionConflict = true,
} = {}) {
  if (!userId) throw new Error("userId required");

  let goal = null;
  if (goalId) {
    goal = await StudyGoal.findOne({ _id: goalId, userId });
  }
  if (!goal) {
    goal = await StudyGoal.findOne({ userId, status: "active" }).sort({
      updatedAt: -1,
    });
  }
  if (!goal) {
    return { goal: null, session: null, items: [] };
  }

  const today = startOfDay();
  const todayEnd = endOfDay();
  const tomorrow = addDays(today, 1);

  // Pull all topics for the goal once so we can mark revision-due topics.
  const allTopics = await StudyTopic.find({ userId, goalId: goal._id });

  // Revision items that are due today/overdue → bump matching topic to
  // revision_due (in-memory only) so they bubble up in plan selection.
  const dueRevisions = await RevisionItem.find({
    userId,
    goalId: goal._id,
    status: "due",
    dueAt: { $lte: todayEnd },
  });
  const dueTopicIdSet = new Set(dueRevisions.map((r) => String(r.topicId)));

  // Topics already scheduled in future sessions (tomorrow onward) for this
  // goal must not bubble back into today's plan when the user regenerates —
  // otherwise "Move to tomorrow" appears to do nothing.
  const futureSessions = await StudySession.find({
    userId,
    goalId: goal._id,
    date: { $gte: tomorrow },
  }).select("plannedTopicIds");
  const futureScheduledTopicIds = new Set();
  for (const sess of futureSessions) {
    for (const id of sess.plannedTopicIds || []) {
      futureScheduledTopicIds.add(String(id));
    }
  }

  const candidateTopics = allTopics
    .filter((topic) => !futureScheduledTopicIds.has(String(topic._id)))
    .map((topic) => {
      if (dueTopicIdSet.has(String(topic._id)) && topic.status !== "completed") {
        return { ...topic.toObject(), status: "revision_due", _origRef: topic };
      }
      return { ...topic.toObject(), _origRef: topic };
    });

  const { picks, totalMinutes } = pickTopicsForPlan({
    topics: candidateTopics,
    dailyTimeMinutes: goal.dailyTimeMinutes,
  });

  const plannedTopicIds = picks.map((p) => p.topic._id);
  const plannedItems = buildPlannedItemsFromPicks(picks);

  let session = await StudySession.findOne({
    userId,
    goalId: goal._id,
    date: { $gte: today, $lte: todayEnd },
  });

  if (!session) {
    session = await StudySession.create({
      userId,
      goalId: goal._id,
      date: today,
      plannedTopicIds,
      plannedItems,
      completedTopicIds: [],
      minutesPlanned: totalMinutes,
      minutesCompleted: 0,
      status: "planned",
    });
  } else {
    // Refresh: replace planned topics (preserve completed history).
    // Also strip out anything that's been moved to a future session in case
    // the in-memory pick above didn't already exclude it (defence in depth).
    const previousItems = getSessionPlannedItems(session).map((item) =>
      typeof item.toObject === "function" ? item.toObject() : { ...item }
    );
    const completedIds = new Set((session.completedTopicIds || []).map(String));
    const startedByTopic = new Map(
      previousItems.map((item) => [String(item.topicId), item])
    );
    const newItemTopicIds = new Set(plannedItems.map((item) => String(item.topicId)));
    const completedCarryForward = previousItems.filter(
      (item) =>
        item.status === "completed" &&
        !newItemTopicIds.has(String(item.topicId)) &&
        !futureScheduledTopicIds.has(String(item.topicId))
    );
    session.plannedItems = [
      ...completedCarryForward,
      ...plannedItems
        .filter((item) => !futureScheduledTopicIds.has(String(item.topicId)))
        .map((item) => {
          const previous = startedByTopic.get(String(item.topicId));
          const wasCompleted =
            completedIds.has(String(item.topicId)) ||
            previous?.status === "completed";
          if (wasCompleted) {
            return {
              ...item,
              status: "completed",
              startedAt:
                previous?.startedAt || previous?.completedAt || new Date(),
              completedAt: previous?.completedAt || new Date(),
            };
          }
          if (previous?.status === "started") {
            return {
              ...item,
              status: "started",
              startedAt: previous.startedAt || new Date(),
            };
          }
          return item;
        }),
    ].map((item, index) => ({ ...item, order: index }));
    syncLegacySessionFields(session);
    if (session.status === "missed") session.status = "planned";
    try {
      await session.save();
    } catch (err) {
      if (err?.name === "VersionError" && retryOnVersionConflict) {
        return generateTodaysPlan({
          userId,
          goalId: goal._id,
          retryOnVersionConflict: false,
        });
      }
      throw err;
    }
  }

  const visibleSessionItems = getSessionPlannedItems(session)
    .filter(
      (item) =>
        item.status !== "moved" &&
        item.status !== "skipped" &&
        item.status !== "completed"
    )
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const sessionTopicIds = visibleSessionItems.map((item) => item.topicId);
  const sessionTopics = await StudyTopic.find({
    userId,
    _id: { $in: sessionTopicIds },
  });
  const sessionTopicById = new Map(
    sessionTopics.map((topic) => [String(topic._id), topic])
  );
  const items = visibleSessionItems
    .map((item) => {
      const topic = sessionTopicById.get(String(item.topicId));
      if (!topic) return null;
      const displayStatus =
        dueTopicIdSet.has(String(topic._id)) && topic.status !== "completed"
          ? "revision_due"
          : topic.status;
      return {
        itemId: item._id,
        topicId: topic._id,
        title: topic.title,
        subject: topic.subject || "",
        category: topic.category || "",
        difficulty: topic.difficulty,
        status: displayStatus,
        plannedMinutes: Number(item.plannedMinutes) || plannedMinutesForTopic(topic),
        reason:
          item.status === "completed"
            ? "Completed today."
            : reasonForTopic({ ...topic.toObject(), status: displayStatus }),
        itemType: item.type || planItemTypeForTopic({ status: displayStatus }),
        itemStatus: item.status || "planned",
        started: item.status === "started",
        completed: item.status === "completed",
      };
    })
    .filter(Boolean);

  return { goal, session, items };
}

async function scheduleNextRevisionForTopic({ userId, goalId, topicId }) {
  // Find latest completed revision for this topic to determine next level.
  const latest = await RevisionItem.findOne({ userId, topicId })
    .sort({ revisionLevel: -1, createdAt: -1 })
    .lean();
  const nextLevel = latest ? Math.min(latest.revisionLevel + 1, 4) : 1;
  const days = RevisionItem.daysForLevel(nextLevel);
  const dueAt = addDays(startOfDay(), days);

  // Avoid creating duplicate "due" rows for the same topic.
  const existingDue = await RevisionItem.findOne({
    userId,
    topicId,
    status: "due",
  });
  if (existingDue) {
    existingDue.revisionLevel = nextLevel;
    existingDue.dueAt = dueAt;
    await existingDue.save();
    return existingDue;
  }

  return RevisionItem.create({
    userId,
    goalId,
    topicId,
    dueAt,
    revisionLevel: nextLevel,
    status: "due",
  });
}

async function getOverviewForUser(userId) {
  if (!userId) throw new Error("userId required");

  const today = startOfDay();
  const todayEnd = endOfDay();

  const [activeGoals, todaySession, dueRevisionCount, upcomingGoals] =
    await Promise.all([
      StudyGoal.find({ userId, status: "active" }).sort({ updatedAt: -1 }),
      StudySession.findOne({
        userId,
        date: { $gte: today, $lte: todayEnd },
      }).sort({ updatedAt: -1 }),
      RevisionItem.countDocuments({
        userId,
        status: "due",
        dueAt: { $lte: todayEnd },
      }),
      StudyGoal.find({
        userId,
        status: "active",
        targetDate: { $ne: null, $gte: today },
      })
        .sort({ targetDate: 1 })
        .limit(3),
    ]);

  const primaryGoal = activeGoals[0] || null;

  let todayItems = [];
  if (todaySession) {
    const sessionItems = getSessionPlannedItems(todaySession);
    const plannedTopicIds = sessionItems
      .filter(
        (item) =>
          item.status !== "moved" &&
          item.status !== "skipped" &&
          item.status !== "completed"
      )
      .map((item) => item.topicId);
    const topics = await StudyTopic.find({
      _id: { $in: plannedTopicIds },
    });
    const topicMap = new Map(topics.map((t) => [String(t._id), t]));
    todayItems = sessionItems
      .filter(
        (item) =>
          item.status !== "moved" &&
          item.status !== "skipped" &&
          item.status !== "completed"
      )
      .map((item) => {
        const topic = topicMap.get(String(item.topicId));
        if (!topic) return null;
        return {
          topicId: topic._id,
          title: topic.title,
          status: topic.status,
          itemType: item.type || "learn",
          itemStatus: item.status || "planned",
          completed: item.status === "completed",
        };
      })
      .filter(Boolean);
  }

  const progress = primaryGoal
    ? await computeGoalProgress({ userId, goalId: primaryGoal._id })
    : null;

  return {
    activeGoals: activeGoals.map((g) => g.toObject()),
    primaryGoalId: primaryGoal ? String(primaryGoal._id) : null,
    todaySession: todaySession ? todaySession.toObject() : null,
    todayItems,
    dueRevisionCount,
    upcomingDeadlines: upcomingGoals.map((g) => ({
      goalId: g._id,
      title: g.title,
      targetDate: g.targetDate,
    })),
    progress,
  };
}

async function computeGoalProgress({ userId, goalId }) {
  const [topics, sessions, revisionsCompleted, answeredQuestions] =
    await Promise.all([
      StudyTopic.find({ userId, goalId }),
      StudySession.find({ userId, goalId }).sort({ date: -1 }).lean(),
      RevisionItem.countDocuments({ userId, goalId, status: "completed" }),
      PracticeQuestion.find({
        userId,
        goalId,
        answeredCorrectly: { $ne: null },
      })
        .select("answeredCorrectly")
        .lean(),
    ]);
  const total = topics.length;
  const completed = topics.filter((t) => t.status === "completed").length;
  const inProgress = topics.filter((t) => t.status === "in_progress").length;
  const weak = topics.filter((t) => t.status === "weak").length;
  const notStarted = topics.filter((t) => t.status === "not_started").length;

  const dueRevisions = await RevisionItem.countDocuments({
    userId,
    goalId,
    status: "due",
    dueAt: { $lte: endOfDay() },
  });

  const completedWorkDates = new Set(
    sessions
      .filter((session) => {
        if ((Number(session.minutesCompleted) || 0) > 0) return true;
        const items = Array.isArray(session.plannedItems) ? session.plannedItems : [];
        if (items.some((item) => item.status === "completed")) return true;
        return (
          Array.isArray(session.completedTopicIds) &&
          session.completedTopicIds.length > 0
        );
      })
      .map((session) => localDateKey(session.date))
  );
  let studyStreakDays = 0;
  for (let cursor = startOfDay(); ; cursor = addDays(cursor, -1)) {
    const key = localDateKey(cursor);
    if (!completedWorkDates.has(key)) break;
    studyStreakDays += 1;
  }
  const minutesStudied = sessions.reduce(
    (sum, session) => sum + (Number(session.minutesCompleted) || 0),
    0
  );
  const answeredCount = answeredQuestions.length;
  const correctCount = answeredQuestions.filter((q) => q.answeredCorrectly === true)
    .length;

  return {
    total,
    completed,
    inProgress,
    weak,
    notStarted,
    dueRevisions,
    studyStreakDays,
    minutesStudied,
    revisionsCompleted,
    practiceAccuracy:
      answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : null,
    answeredQuestions: answeredCount,
    completionPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

module.exports = {
  generateTodaysPlan,
  scheduleNextRevisionForTopic,
  getOverviewForUser,
  computeGoalProgress,
  getSessionPlannedItems,
  markSessionTopicStarted,
  markSessionTopicCompleted,
  syncLegacySessionFields,
  startOfDay,
  endOfDay,
  addDays,
  localDateKey,
};
