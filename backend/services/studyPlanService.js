"use strict";

const StudyGoal = require("../models/StudyGoal");
const StudyTopic = require("../models/StudyTopic");
const StudySession = require("../models/StudySession");
const RevisionItem = require("../models/RevisionItem");

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
    default:
      return "Recommended for today.";
  }
}

async function generateTodaysPlan({ userId, goalId = null } = {}) {
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
      completedTopicIds: [],
      minutesPlanned: totalMinutes,
      minutesCompleted: 0,
      status: "planned",
    });
  } else {
    // Refresh: replace planned topics (preserve completed history).
    // Also strip out anything that's been moved to a future session in case
    // the in-memory pick above didn't already exclude it (defence in depth).
    session.plannedTopicIds = plannedTopicIds.filter(
      (id) => !futureScheduledTopicIds.has(String(id))
    );
    session.minutesPlanned = totalMinutes;
    if (session.status === "missed") session.status = "planned";
    await session.save();
  }

  const items = picks.map(({ topic, plannedMinutes }) => ({
    topicId: topic._id,
    title: topic.title,
    subject: topic.subject || "",
    category: topic.category || "",
    difficulty: topic.difficulty,
    status: topic.status,
    plannedMinutes,
    reason: reasonForTopic(topic),
    completed: session.completedTopicIds
      .map(String)
      .includes(String(topic._id)),
  }));

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
  if (todaySession && Array.isArray(todaySession.plannedTopicIds)) {
    const topics = await StudyTopic.find({
      _id: { $in: todaySession.plannedTopicIds },
    });
    const topicMap = new Map(topics.map((t) => [String(t._id), t]));
    todayItems = todaySession.plannedTopicIds
      .map((id) => topicMap.get(String(id)))
      .filter(Boolean)
      .map((topic) => ({
        topicId: topic._id,
        title: topic.title,
        status: topic.status,
        completed: todaySession.completedTopicIds
          .map(String)
          .includes(String(topic._id)),
      }));
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
  const topics = await StudyTopic.find({ userId, goalId });
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

  return {
    total,
    completed,
    inProgress,
    weak,
    notStarted,
    dueRevisions,
    completionPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

module.exports = {
  generateTodaysPlan,
  scheduleNextRevisionForTopic,
  getOverviewForUser,
  computeGoalProgress,
  startOfDay,
  endOfDay,
  addDays,
};
