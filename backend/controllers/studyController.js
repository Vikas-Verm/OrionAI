"use strict";

const mongoose = require("mongoose");

const StudyGoal = require("../models/StudyGoal");
const StudyTopic = require("../models/StudyTopic");
const RevisionItem = require("../models/RevisionItem");
const StudySession = require("../models/StudySession");
const TopicLesson = require("../models/TopicLesson");
const StudyMaterial = require("../models/StudyMaterial");
const PracticeQuestion = require("../models/PracticeQuestion");
const Flashcard = require("../models/Flashcard");
const TopicNote = require("../models/TopicNote");
const {
  generateTodaysPlan,
  scheduleNextRevisionForTopic,
  getOverviewForUser,
  computeGoalProgress,
  startOfDay,
  endOfDay,
  addDays,
} = require("../services/studyPlanService");
const studyAIService = require("../services/studyAIService");

function getUserId(req) {
  return req.user?.username || req.user?.userId || "";
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asObjectId(value) {
  if (!value) return null;
  try {
    return new mongoose.Types.ObjectId(String(value));
  } catch {
    return null;
  }
}

function buildGoalPayload(body = {}, { allowMissingTitle = false } = {}) {
  const payload = {};
  if ("title" in body) {
    const title = cleanString(body.title);
    if (!title && !allowMissingTitle) return { error: "title is required" };
    if (title) payload.title = title;
  }
  if ("purpose" in body) {
    const purpose = cleanString(body.purpose);
    if (purpose && !StudyGoal.PURPOSE_VALUES.includes(purpose)) {
      return { error: `Invalid purpose. Allowed: ${StudyGoal.PURPOSE_VALUES.join(", ")}` };
    }
    if (purpose) payload.purpose = purpose;
  }
  if ("targetDate" in body) {
    if (!body.targetDate) {
      payload.targetDate = null;
    } else {
      const date = new Date(body.targetDate);
      if (Number.isNaN(date.getTime())) return { error: "Invalid targetDate" };
      payload.targetDate = date;
    }
  }
  if ("dailyTimeMinutes" in body) {
    const minutes = Number(body.dailyTimeMinutes);
    if (body.dailyTimeMinutes === null || body.dailyTimeMinutes === "") {
      payload.dailyTimeMinutes = null;
    } else if (!Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) {
      return { error: "dailyTimeMinutes must be a number between 0 and 1440" };
    } else {
      payload.dailyTimeMinutes = minutes;
    }
  }
  if ("level" in body) {
    const level = cleanString(body.level);
    if (level && !StudyGoal.LEVEL_VALUES.includes(level)) {
      return { error: `Invalid level. Allowed: ${StudyGoal.LEVEL_VALUES.join(", ")}` };
    }
    if (level) payload.level = level;
  }
  if ("preferredStudyTime" in body) {
    payload.preferredStudyTime = cleanString(body.preferredStudyTime);
  }
  if ("preferredLearningStyle" in body) {
    const style = cleanString(body.preferredLearningStyle);
    if (style && !StudyGoal.LEARNING_STYLE_VALUES.includes(style)) {
      return {
        error: `Invalid preferredLearningStyle. Allowed: ${StudyGoal.LEARNING_STYLE_VALUES.join(", ")}`,
      };
    }
    payload.preferredLearningStyle = style;
  }
  if ("status" in body) {
    const status = cleanString(body.status);
    if (status && !StudyGoal.STATUS_VALUES.includes(status)) {
      return { error: `Invalid status. Allowed: ${StudyGoal.STATUS_VALUES.join(", ")}` };
    }
    if (status) payload.status = status;
  }
  return { payload };
}

function buildTopicPayload(body = {}, { allowMissingTitle = false } = {}) {
  const payload = {};
  if ("title" in body) {
    const title = cleanString(body.title);
    if (!title && !allowMissingTitle) return { error: "title is required" };
    if (title) payload.title = title;
  }
  if ("subject" in body) payload.subject = cleanString(body.subject);
  if ("category" in body) payload.category = cleanString(body.category);
  if ("difficulty" in body) {
    const difficulty = cleanString(body.difficulty);
    if (difficulty && !StudyTopic.DIFFICULTY_VALUES.includes(difficulty)) {
      return {
        error: `Invalid difficulty. Allowed: ${StudyTopic.DIFFICULTY_VALUES.join(", ")}`,
      };
    }
    if (difficulty) payload.difficulty = difficulty;
  }
  if ("status" in body) {
    const status = cleanString(body.status);
    if (status && !StudyTopic.STATUS_VALUES.includes(status)) {
      return {
        error: `Invalid status. Allowed: ${StudyTopic.STATUS_VALUES.join(", ")}`,
      };
    }
    if (status) payload.status = status;
  }
  if ("estimatedMinutes" in body) {
    if (body.estimatedMinutes === null || body.estimatedMinutes === "") {
      payload.estimatedMinutes = null;
    } else {
      const minutes = Number(body.estimatedMinutes);
      if (!Number.isFinite(minutes) || minutes < 0) {
        return { error: "estimatedMinutes must be a non-negative number" };
      }
      payload.estimatedMinutes = minutes;
    }
  }
  if ("order" in body) {
    const order = Number(body.order);
    if (Number.isFinite(order)) payload.order = order;
  }
  return { payload };
}

// ── Overview ──────────────────────────────────────────────────────────────
async function getOverview(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const overview = await getOverviewForUser(userId);

    const focusAreas = Array.isArray(req.user?.focusAreas)
      ? req.user.focusAreas
      : null;
    // We don't have focus areas in JWT — frontend already knows, but expose
    // a stable shape so workspace briefing can rely on it.
    res.json({
      ...overview,
      focusAreaSelected: focusAreas
        ? focusAreas.includes("Study & Learning")
        : null,
    });
  } catch (err) {
    console.error("Study overview error:", err.message);
    res.status(500).json({ error: "Could not load study overview" });
  }
}

// ── Goals ─────────────────────────────────────────────────────────────────
async function createGoal(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { error, payload } = buildGoalPayload(req.body || {});
    if (error) return res.status(400).json({ error });
    if (!payload.title) return res.status(400).json({ error: "title is required" });
    const goal = await StudyGoal.create({ ...payload, userId });
    res.status(201).json({ goal });
  } catch (err) {
    console.error("Create study goal error:", err.message);
    res.status(500).json({ error: "Could not create study goal" });
  }
}

async function listGoals(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const status = cleanString(req.query?.status);
    const filter = { userId };
    if (status && StudyGoal.STATUS_VALUES.includes(status)) {
      filter.status = status;
    }
    const goals = await StudyGoal.find(filter).sort({ updatedAt: -1 });
    const goalIds = goals.map((g) => g._id);
    const topics = await StudyTopic.find({
      userId,
      goalId: { $in: goalIds },
    });
    const topicsByGoal = new Map();
    for (const topic of topics) {
      const key = String(topic.goalId);
      if (!topicsByGoal.has(key)) topicsByGoal.set(key, []);
      topicsByGoal.get(key).push(topic);
    }

    const dueRevisions = await RevisionItem.aggregate([
      {
        $match: {
          userId,
          status: "due",
          goalId: { $in: goalIds },
          dueAt: { $lte: endOfDay() },
        },
      },
      { $group: { _id: "$goalId", count: { $sum: 1 } } },
    ]);
    const dueByGoal = new Map(
      dueRevisions.map((entry) => [String(entry._id), entry.count])
    );

    res.json({
      goals: goals.map((goal) => {
        const goalTopics = topicsByGoal.get(String(goal._id)) || [];
        const total = goalTopics.length;
        const completed = goalTopics.filter((t) => t.status === "completed")
          .length;
        return {
          ...goal.toObject(),
          stats: {
            totalTopics: total,
            completedTopics: completed,
            completionPercent:
              total > 0 ? Math.round((completed / total) * 100) : 0,
            dueRevisions: dueByGoal.get(String(goal._id)) || 0,
          },
        };
      }),
    });
  } catch (err) {
    console.error("List study goals error:", err.message);
    res.status(500).json({ error: "Could not load study goals" });
  }
}

async function updateGoal(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid goal id" });
    const { error, payload } = buildGoalPayload(req.body || {}, {
      allowMissingTitle: true,
    });
    if (error) return res.status(400).json({ error });
    const goal = await StudyGoal.findOneAndUpdate(
      { _id: id, userId },
      { $set: payload },
      { new: true }
    );
    if (!goal) return res.status(404).json({ error: "Goal not found" });
    res.json({ goal });
  } catch (err) {
    console.error("Update study goal error:", err.message);
    res.status(500).json({ error: "Could not update study goal" });
  }
}

// ── Topics ────────────────────────────────────────────────────────────────
async function createTopic(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const goalId = asObjectId(req.body?.goalId);
    if (!goalId) return res.status(400).json({ error: "goalId is required" });
    const goal = await StudyGoal.findOne({ _id: goalId, userId });
    if (!goal) return res.status(404).json({ error: "Goal not found" });

    const { error, payload } = buildTopicPayload(req.body || {});
    if (error) return res.status(400).json({ error });
    if (!payload.title) return res.status(400).json({ error: "title is required" });

    if (!Number.isFinite(payload.order)) {
      const count = await StudyTopic.countDocuments({ userId, goalId });
      payload.order = count;
    }

    const topic = await StudyTopic.create({ ...payload, userId, goalId });
    res.status(201).json({ topic });
  } catch (err) {
    console.error("Create study topic error:", err.message);
    res.status(500).json({ error: "Could not create study topic" });
  }
}

async function listTopics(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const filter = { userId };
    if (req.query?.goalId) {
      const goalId = asObjectId(req.query.goalId);
      if (!goalId) return res.status(400).json({ error: "Invalid goalId" });
      filter.goalId = goalId;
    }
    const topics = await StudyTopic.find(filter).sort({ order: 1, createdAt: 1 });
    res.json({ topics });
  } catch (err) {
    console.error("List study topics error:", err.message);
    res.status(500).json({ error: "Could not load study topics" });
  }
}

async function getTopic(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid topic id" });
    const topic = await StudyTopic.findOne({ _id: id, userId });
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    const goal = await StudyGoal.findOne({ _id: topic.goalId, userId });
    res.json({ topic, goal });
  } catch (err) {
    console.error("Get study topic error:", err.message);
    res.status(500).json({ error: "Could not load study topic" });
  }
}

async function updateTopic(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid topic id" });
    const { error, payload } = buildTopicPayload(req.body || {}, {
      allowMissingTitle: true,
    });
    if (error) return res.status(400).json({ error });
    const topic = await StudyTopic.findOneAndUpdate(
      { _id: id, userId },
      { $set: payload },
      { new: true }
    );
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    res.json({ topic });
  } catch (err) {
    console.error("Update study topic error:", err.message);
    res.status(500).json({ error: "Could not update study topic" });
  }
}

async function completeTopic(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid topic id" });
    const topic = await StudyTopic.findOne({ _id: id, userId });
    if (!topic) return res.status(404).json({ error: "Topic not found" });

    const now = new Date();
    topic.status = "completed";
    topic.lastStudiedAt = now;
    await topic.save();

    // Mark any in-progress revision items for this topic as completed so we
    // don't keep stale due rows around after a fresh completion.
    await RevisionItem.updateMany(
      { userId, topicId: topic._id, status: { $in: ["due", "snoozed"] } },
      { $set: { status: "completed" } }
    );

    const revision = await scheduleNextRevisionForTopic({
      userId,
      goalId: topic.goalId,
      topicId: topic._id,
    });

    topic.nextRevisionAt = revision?.dueAt || null;
    await topic.save();

    // Mark topic completed in today's session if it was planned.
    const today = startOfDay();
    const todayEnd = endOfDay();
    const session = await StudySession.findOne({
      userId,
      goalId: topic.goalId,
      date: { $gte: today, $lte: todayEnd },
    });
    if (session && session.plannedTopicIds.map(String).includes(String(topic._id))) {
      const already = session.completedTopicIds.map(String);
      if (!already.includes(String(topic._id))) {
        session.completedTopicIds.push(topic._id);
        const plannedMinutes = Number(session.minutesPlanned) || 0;
        const completedSoFar = session.completedTopicIds.length;
        const totalPlanned = session.plannedTopicIds.length || 1;
        session.minutesCompleted = Math.round(
          (plannedMinutes * completedSoFar) / totalPlanned
        );
        if (completedSoFar >= totalPlanned) session.status = "completed";
        await session.save();
      }
    }

    res.json({ topic, revision });
  } catch (err) {
    console.error("Complete study topic error:", err.message);
    res.status(500).json({ error: "Could not complete study topic" });
  }
}

// ── Plan ──────────────────────────────────────────────────────────────────
async function generatePlan(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const goalId = asObjectId(req.body?.goalId);
    const plan = await generateTodaysPlan({ userId, goalId });
    if (!plan.goal) {
      return res.status(400).json({
        error: "No active study goal yet.",
        code: "no_active_goal",
        items: [],
      });
    }
    if (!plan.items.length) {
      const topicCount = await StudyTopic.countDocuments({
        userId,
        goalId: plan.goal._id,
      });
      if (topicCount === 0) {
        return res.json({
          goal: plan.goal,
          session: null,
          items: [],
          code: "no_topics",
          message:
            "Add topics first, then OrionAI can generate today’s plan.",
        });
      }
    }
    res.json({
      goal: plan.goal,
      session: plan.session,
      items: plan.items,
    });
  } catch (err) {
    console.error("Generate plan error:", err.message);
    res.status(500).json({ error: "Could not generate today's plan" });
  }
}

// ── Revisions ─────────────────────────────────────────────────────────────
async function listRevisions(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const status = cleanString(req.query?.status) || "due";
    const filter = { userId };
    if (status && RevisionItem.STATUS_VALUES.includes(status)) {
      filter.status = status;
    }
    if (req.query?.dueOnly === "true") {
      filter.dueAt = { $lte: endOfDay() };
    }
    const items = await RevisionItem.find(filter)
      .sort({ dueAt: 1 })
      .limit(50);
    const topicIds = items.map((i) => i.topicId);
    const topics = await StudyTopic.find({ _id: { $in: topicIds } });
    const topicMap = new Map(topics.map((t) => [String(t._id), t]));
    res.json({
      items: items.map((item) => {
        const topic = topicMap.get(String(item.topicId));
        return {
          ...item.toObject(),
          topic: topic
            ? {
                _id: topic._id,
                title: topic.title,
                subject: topic.subject,
                category: topic.category,
                difficulty: topic.difficulty,
                status: topic.status,
              }
            : null,
        };
      }),
    });
  } catch (err) {
    console.error("List revisions error:", err.message);
    res.status(500).json({ error: "Could not load revisions" });
  }
}

async function completeRevision(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid revision id" });
    const revision = await RevisionItem.findOne({ _id: id, userId });
    if (!revision) return res.status(404).json({ error: "Revision not found" });
    revision.status = "completed";
    await revision.save();
    const next = await scheduleNextRevisionForTopic({
      userId,
      goalId: revision.goalId,
      topicId: revision.topicId,
    });
    await StudyTopic.findOneAndUpdate(
      { _id: revision.topicId, userId },
      { $set: { lastStudiedAt: new Date(), nextRevisionAt: next?.dueAt || null } }
    );
    res.json({ revision, next });
  } catch (err) {
    console.error("Complete revision error:", err.message);
    res.status(500).json({ error: "Could not complete revision" });
  }
}

async function snoozeRevision(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid revision id" });
    const days = Math.max(
      1,
      Math.min(7, Number(req.body?.days) || 1)
    );
    const revision = await RevisionItem.findOneAndUpdate(
      { _id: id, userId },
      {
        $set: {
          status: "snoozed",
          dueAt: addDays(startOfDay(), days),
        },
      },
      { new: true }
    );
    if (!revision) return res.status(404).json({ error: "Revision not found" });
    res.json({ revision });
  } catch (err) {
    console.error("Snooze revision error:", err.message);
    res.status(500).json({ error: "Could not snooze revision" });
  }
}

// ── Bulk topic create ─────────────────────────────────────────────────────
async function createTopicsBulk(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const goalId = asObjectId(req.body?.goalId);
    if (!goalId) return res.status(400).json({ error: "goalId is required" });
    const goal = await StudyGoal.findOne({ _id: goalId, userId });
    if (!goal) return res.status(404).json({ error: "Goal not found" });

    const inputTopics = Array.isArray(req.body?.topics) ? req.body.topics : [];
    if (!inputTopics.length) {
      return res.status(400).json({ error: "topics array is required" });
    }

    const existingTopics = await StudyTopic.find({ userId, goalId }).select(
      "title"
    );
    const existingKeys = new Set(
      existingTopics
        .map((t) => studyAIService.normalizeTitleKey(t.title))
        .filter(Boolean)
    );
    const seenInPayload = new Set();

    const docs = [];
    let nextOrder = existingTopics.length;
    let skippedDuplicates = 0;
    for (const entry of inputTopics) {
      const { error, payload } = buildTopicPayload(entry || {});
      if (error || !payload.title) continue;
      const key = studyAIService.normalizeTitleKey(payload.title);
      if (!key || existingKeys.has(key) || seenInPayload.has(key)) {
        skippedDuplicates++;
        continue;
      }
      seenInPayload.add(key);
      docs.push({
        ...payload,
        userId,
        goalId,
        order: Number.isFinite(payload.order) ? payload.order : nextOrder++,
      });
    }
    if (!docs.length) {
      return res.status(400).json({
        error:
          skippedDuplicates > 0
            ? "All topics already exist for this goal."
            : "No valid topics in payload",
      });
    }
    const created = await StudyTopic.insertMany(docs);
    res.status(201).json({
      topics: created,
      createdCount: created.length,
      skippedDuplicates,
    });
  } catch (err) {
    console.error("Create topics bulk error:", err.message);
    res.status(500).json({ error: "Could not create topics" });
  }
}

// ── Move planned topic to tomorrow ────────────────────────────────────────
// Drops the topic from today's plan and (re)inserts it into tomorrow's
// session. Will not create duplicate plan entries.
async function movePlannedTopicToTomorrow(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const topicId = asObjectId(req.params.id);
    if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
    const topic = await StudyTopic.findOne({ _id: topicId, userId });
    if (!topic) return res.status(404).json({ error: "Topic not found" });

    const today = startOfDay();
    const todayEnd = endOfDay();
    const tomorrow = addDays(today, 1);
    const tomorrowEnd = addDays(todayEnd, 1);

    let plannedMinutes = 0;
    const todaySession = await StudySession.findOne({
      userId,
      goalId: topic.goalId,
      date: { $gte: today, $lte: todayEnd },
    });
    if (todaySession) {
      const wasPlanned = todaySession.plannedTopicIds.some(
        (id) => String(id) === String(topic._id)
      );
      if (wasPlanned) {
        // Estimate per-topic minutes proportionally if available.
        const totalPlanned = todaySession.plannedTopicIds.length || 1;
        const perTopic = Math.round(
          (Number(todaySession.minutesPlanned) || 0) / totalPlanned
        );
        plannedMinutes = perTopic > 0 ? perTopic : 0;

        todaySession.plannedTopicIds = todaySession.plannedTopicIds.filter(
          (id) => String(id) !== String(topic._id)
        );
        // Recompute minutesPlanned to reflect remaining items.
        const remaining = todaySession.plannedTopicIds.length;
        todaySession.minutesPlanned = perTopic > 0 ? perTopic * remaining : 0;
        await todaySession.save();
      }
    }
    if (!plannedMinutes) {
      plannedMinutes =
        Number.isFinite(topic.estimatedMinutes) && topic.estimatedMinutes > 0
          ? topic.estimatedMinutes
          : 30;
    }

    let tomorrowSession = await StudySession.findOne({
      userId,
      goalId: topic.goalId,
      date: { $gte: tomorrow, $lte: tomorrowEnd },
    });
    let alreadyOnTomorrow = false;
    if (tomorrowSession) {
      alreadyOnTomorrow = tomorrowSession.plannedTopicIds.some(
        (id) => String(id) === String(topic._id)
      );
      if (!alreadyOnTomorrow) {
        tomorrowSession.plannedTopicIds.push(topic._id);
        tomorrowSession.minutesPlanned =
          (Number(tomorrowSession.minutesPlanned) || 0) + plannedMinutes;
        if (tomorrowSession.status === "missed") {
          tomorrowSession.status = "planned";
        }
        await tomorrowSession.save();
      }
    } else {
      tomorrowSession = await StudySession.create({
        userId,
        goalId: topic.goalId,
        date: tomorrow,
        plannedTopicIds: [topic._id],
        completedTopicIds: [],
        minutesPlanned: plannedMinutes,
        minutesCompleted: 0,
        status: "planned",
      });
    }

    res.json({
      success: true,
      message: alreadyOnTomorrow
        ? "This topic is already planned for tomorrow."
        : "Moved to tomorrow.",
      alreadyOnTomorrow,
      tomorrowSessionId: tomorrowSession._id,
    });
  } catch (err) {
    console.error("Move to tomorrow error:", err.message);
    res.status(500).json({ error: "Could not move topic to tomorrow" });
  }
}

// ── Suggest topics (OrionAI) ──────────────────────────────────────────────
async function suggestTopics(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const goalId = asObjectId(req.params.goalId);
    if (!goalId) return res.status(400).json({ error: "Invalid goal id" });
    const goal = await StudyGoal.findOne({ _id: goalId, userId });
    if (!goal) return res.status(404).json({ error: "Goal not found" });

    const excludeExisting = req.body?.excludeExisting !== false; // default true
    const limit = Math.max(3, Math.min(15, Number(req.body?.limit) || 10));

    let existingTitles = [];
    let weakTitles = [];
    let completedTitles = [];
    if (excludeExisting) {
      const topics = await StudyTopic.find({ userId, goalId }).select(
        "title status"
      );
      existingTitles = topics.map((t) => t.title);
      weakTitles = topics
        .filter((t) => t.status === "weak")
        .map((t) => t.title);
      completedTitles = topics
        .filter((t) => t.status === "completed")
        .map((t) => t.title);
    }

    let suggestedTopics = [];
    try {
      suggestedTopics = await studyAIService.suggestTopicsForGoal({
        goal,
        existingTitles,
        weakTitles,
        completedTitles,
        limit,
      });
    } catch (err) {
      console.error("Suggest topics LLM error:", err.message);
      return res.status(502).json({
        error:
          "OrionAI could not suggest topics right now. Please add topics manually.",
        suggestedTopics: [],
      });
    }

    if (!suggestedTopics.length) {
      return res.json({
        suggestedTopics: [],
        message: existingTitles.length
          ? "OrionAI couldn’t think of new topics beyond what you already saved."
          : "OrionAI couldn’t confidently suggest topics for this goal. Add topics manually.",
      });
    }

    res.json({ suggestedTopics });
  } catch (err) {
    console.error("Suggest topics error:", err.message);
    res.status(500).json({ error: "Could not suggest topics" });
  }
}

// ── Topic learning state (consolidated load for the topic page) ──────────
async function getTopicLearning(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const topicId = asObjectId(req.params.topicId);
    if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
    const topic = await StudyTopic.findOne({ _id: topicId, userId });
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    const [goal, lesson, materials, questions, flashcards, notes] =
      await Promise.all([
        StudyGoal.findOne({ _id: topic.goalId, userId }),
        TopicLesson.findOne({ topicId, userId }),
        StudyMaterial.find({
          topicId,
          userId,
          status: { $ne: "archived" },
        }).sort({ createdAt: -1 }),
        PracticeQuestion.find({ topicId, userId }).sort({ createdAt: -1 }),
        Flashcard.find({ topicId, userId }).sort({ createdAt: -1 }),
        TopicNote.find({ topicId, userId }).sort({ createdAt: -1 }),
      ]);

    res.json({
      topic,
      goal,
      lesson,
      materials,
      questions,
      flashcards,
      notes,
      counts: {
        materials: materials.length,
        questions: questions.length,
        flashcards: flashcards.length,
        notes: notes.length,
        hasLesson: !!lesson,
      },
    });
  } catch (err) {
    console.error("Get topic learning error:", err.message);
    res.status(500).json({ error: "Could not load topic learning state" });
  }
}

// ── Generate lesson ───────────────────────────────────────────────────────
async function generateLesson(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const topicId = asObjectId(req.params.topicId);
    if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
    const topic = await StudyTopic.findOne({ _id: topicId, userId });
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    const goal = await StudyGoal.findOne({ _id: topic.goalId, userId });

    let lessonPayload;
    try {
      lessonPayload = await studyAIService.generateLessonForTopic({
        goal,
        topic,
      });
    } catch (err) {
      console.error("Generate lesson LLM error:", err.message);
      return res.status(502).json({
        error: "OrionAI couldn’t generate a lesson right now. Try again.",
      });
    }

    const existing = await TopicLesson.findOne({ topicId, userId });
    let lesson;
    if (existing) {
      Object.assign(existing, lessonPayload, {
        sourceBasis: "ai_generated",
        generatedBy: "orionai",
        goalId: topic.goalId,
      });
      await existing.save();
      lesson = existing;
    } else {
      lesson = await TopicLesson.create({
        ...lessonPayload,
        userId,
        goalId: topic.goalId,
        topicId,
        sourceBasis: "ai_generated",
        generatedBy: "orionai",
      });
    }

    if (topic.status === "not_started") {
      topic.status = "in_progress";
      await topic.save();
    }

    res.json({ lesson });
  } catch (err) {
    console.error("Generate lesson error:", err.message);
    res.status(500).json({ error: "Could not generate lesson" });
  }
}

// ── Materials ─────────────────────────────────────────────────────────────
function buildMaterialPayload(body = {}) {
  const payload = {};
  if ("title" in body) payload.title = cleanString(body.title);
  if ("type" in body) {
    const type = cleanString(body.type);
    if (type && !StudyMaterial.TYPE_VALUES.includes(type)) {
      return { error: `Invalid type. Allowed: ${StudyMaterial.TYPE_VALUES.join(", ")}` };
    }
    if (type) payload.type = type;
  }
  if ("url" in body) payload.url = cleanString(body.url);
  if ("sourceApp" in body) {
    const sourceApp = cleanString(body.sourceApp);
    if (sourceApp && !StudyMaterial.SOURCE_APP_VALUES.includes(sourceApp)) {
      return {
        error: `Invalid sourceApp. Allowed: ${StudyMaterial.SOURCE_APP_VALUES.join(", ")}`,
      };
    }
    if (sourceApp) payload.sourceApp = sourceApp;
  }
  if ("sourceRef" in body) payload.sourceRef = cleanString(body.sourceRef);
  if ("contentText" in body) payload.contentText = String(body.contentText || "");
  if ("summary" in body) payload.summary = String(body.summary || "");
  if ("status" in body) {
    const status = cleanString(body.status);
    if (status && !StudyMaterial.STATUS_VALUES.includes(status)) {
      return {
        error: `Invalid status. Allowed: ${StudyMaterial.STATUS_VALUES.join(", ")}`,
      };
    }
    if (status) payload.status = status;
  }
  return { payload };
}

async function createMaterial(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const goalId = asObjectId(req.body?.goalId);
    const topicId = asObjectId(req.body?.topicId);
    const { error, payload } = buildMaterialPayload(req.body || {});
    if (error) return res.status(400).json({ error });
    if (!payload.title && !payload.url && !payload.contentText) {
      return res
        .status(400)
        .json({ error: "Provide at least a title, link, or content" });
    }
    const material = await StudyMaterial.create({
      ...payload,
      title: payload.title || (payload.url ? payload.url : "Untitled material"),
      userId,
      goalId: goalId || null,
      topicId: topicId || null,
    });
    res.status(201).json({ material });
  } catch (err) {
    console.error("Create material error:", err.message);
    res.status(500).json({ error: "Could not save material" });
  }
}

async function createMaterialForTopic(req, res) {
  const topicId = asObjectId(req.params.topicId);
  if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
  req.body = { ...(req.body || {}), topicId };
  const userId = getUserId(req);
  if (userId) {
    const topic = await StudyTopic.findOne({ _id: topicId, userId });
    if (topic) req.body.goalId = String(topic.goalId);
  }
  return createMaterial(req, res);
}

async function listMaterials(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const filter = { userId };
    if (req.query?.topicId) {
      const topicId = asObjectId(req.query.topicId);
      if (!topicId) return res.status(400).json({ error: "Invalid topicId" });
      filter.topicId = topicId;
    }
    if (req.query?.goalId) {
      const goalId = asObjectId(req.query.goalId);
      if (!goalId) return res.status(400).json({ error: "Invalid goalId" });
      filter.goalId = goalId;
    }
    const includeArchived = req.query?.includeArchived === "true";
    if (!includeArchived) filter.status = { $ne: "archived" };
    const materials = await StudyMaterial.find(filter).sort({ createdAt: -1 });
    res.json({ materials });
  } catch (err) {
    console.error("List materials error:", err.message);
    res.status(500).json({ error: "Could not load materials" });
  }
}

async function updateMaterial(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid material id" });
    const { error, payload } = buildMaterialPayload(req.body || {});
    if (error) return res.status(400).json({ error });
    const material = await StudyMaterial.findOneAndUpdate(
      { _id: id, userId },
      { $set: payload },
      { new: true }
    );
    if (!material) return res.status(404).json({ error: "Material not found" });
    res.json({ material });
  } catch (err) {
    console.error("Update material error:", err.message);
    res.status(500).json({ error: "Could not update material" });
  }
}

async function deleteMaterial(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid material id" });
    const result = await StudyMaterial.findOneAndDelete({ _id: id, userId });
    if (!result) return res.status(404).json({ error: "Material not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete material error:", err.message);
    res.status(500).json({ error: "Could not delete material" });
  }
}

// ── Practice questions ────────────────────────────────────────────────────
async function generatePracticeQuestionsForTopic(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const topicId = asObjectId(req.params.topicId);
    if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
    const topic = await StudyTopic.findOne({ _id: topicId, userId });
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    const goal = await StudyGoal.findOne({ _id: topic.goalId, userId });

    const count = Number(req.body?.count) || 5;
    const difficulty = cleanString(req.body?.difficulty) || "medium";
    const questionType = cleanString(req.body?.questionType) || "auto";

    let suggestions = [];
    try {
      suggestions = await studyAIService.generatePracticeQuestions({
        goal,
        topic,
        count,
        difficulty,
        questionType,
      });
    } catch (err) {
      console.error("Practice questions LLM error:", err.message);
      return res.status(502).json({
        error: "OrionAI couldn’t generate questions right now. Try again.",
      });
    }
    if (!suggestions.length) {
      return res.json({ questions: [], message: "No questions generated." });
    }

    const docs = suggestions.map((entry) => ({
      ...entry,
      userId,
      goalId: topic.goalId,
      topicId: topic._id,
      source: "generated",
    }));
    const created = await PracticeQuestion.insertMany(docs);
    res.json({ questions: created });
  } catch (err) {
    console.error("Generate questions error:", err.message);
    res.status(500).json({ error: "Could not generate questions" });
  }
}

async function listPracticeQuestions(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const topicId = asObjectId(req.params.topicId);
    if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
    const questions = await PracticeQuestion.find({ userId, topicId }).sort({
      createdAt: -1,
    });
    res.json({ questions });
  } catch (err) {
    console.error("List questions error:", err.message);
    res.status(500).json({ error: "Could not load questions" });
  }
}

async function updatePracticeQuestion(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid question id" });
    const update = {};
    if ("userAnswer" in req.body) update.userAnswer = String(req.body.userAnswer || "");
    if ("userMarkedWeak" in req.body) update.userMarkedWeak = req.body.userMarkedWeak === true;
    if ("answeredCorrectly" in req.body) {
      const val = req.body.answeredCorrectly;
      update.answeredCorrectly = val === null ? null : val === true;
    }
    const question = await PracticeQuestion.findOneAndUpdate(
      { _id: id, userId },
      { $set: update },
      { new: true }
    );
    if (!question) return res.status(404).json({ error: "Question not found" });
    res.json({ question });
  } catch (err) {
    console.error("Update question error:", err.message);
    res.status(500).json({ error: "Could not update question" });
  }
}

// ── Flashcards ────────────────────────────────────────────────────────────
async function generateFlashcardsForTopic(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const topicId = asObjectId(req.params.topicId);
    if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
    const topic = await StudyTopic.findOne({ _id: topicId, userId });
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    const goal = await StudyGoal.findOne({ _id: topic.goalId, userId });
    const lesson = await TopicLesson.findOne({ topicId, userId });

    const count = Number(req.body?.count) || 8;

    let cards = [];
    try {
      cards = await studyAIService.generateFlashcards({
        goal,
        topic,
        lesson,
        count,
      });
    } catch (err) {
      console.error("Flashcards LLM error:", err.message);
      return res.status(502).json({
        error: "OrionAI couldn’t generate flashcards right now. Try again.",
      });
    }
    if (!cards.length) {
      return res.json({ flashcards: [], message: "No flashcards generated." });
    }

    const docs = cards.map((card) => ({
      ...card,
      userId,
      goalId: topic.goalId,
      topicId: topic._id,
      status: "learning",
    }));
    const created = await Flashcard.insertMany(docs);
    res.json({ flashcards: created });
  } catch (err) {
    console.error("Generate flashcards error:", err.message);
    res.status(500).json({ error: "Could not generate flashcards" });
  }
}

async function updateFlashcard(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid flashcard id" });
    const update = {};
    if ("status" in req.body) {
      const status = cleanString(req.body.status);
      if (status && !Flashcard.STATUS_VALUES.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Allowed: ${Flashcard.STATUS_VALUES.join(", ")}`,
        });
      }
      if (status) update.status = status;
    }
    if ("front" in req.body) update.front = String(req.body.front || "").slice(0, 240);
    if ("back" in req.body) update.back = String(req.body.back || "").slice(0, 320);
    if ("nextReviewAt" in req.body) {
      if (req.body.nextReviewAt === null) update.nextReviewAt = null;
      else {
        const d = new Date(req.body.nextReviewAt);
        if (!Number.isNaN(d.getTime())) update.nextReviewAt = d;
      }
    }
    const flashcard = await Flashcard.findOneAndUpdate(
      { _id: id, userId },
      { $set: update, $inc: { reviewCount: update.status ? 1 : 0 } },
      { new: true }
    );
    if (!flashcard) return res.status(404).json({ error: "Flashcard not found" });
    res.json({ flashcard });
  } catch (err) {
    console.error("Update flashcard error:", err.message);
    res.status(500).json({ error: "Could not update flashcard" });
  }
}

async function deleteFlashcard(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid flashcard id" });
    const result = await Flashcard.findOneAndDelete({ _id: id, userId });
    if (!result) return res.status(404).json({ error: "Flashcard not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete flashcard error:", err.message);
    res.status(500).json({ error: "Could not delete flashcard" });
  }
}

// ── Topic notes ───────────────────────────────────────────────────────────
async function createTopicNote(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const topicId = asObjectId(req.params.topicId);
    if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
    const topic = await StudyTopic.findOne({ _id: topicId, userId });
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    const content = cleanString(req.body?.content);
    if (!content) return res.status(400).json({ error: "content is required" });
    const sourceRaw = cleanString(req.body?.source) || "manual";
    const source = TopicNote.SOURCE_VALUES.includes(sourceRaw)
      ? sourceRaw
      : "manual";
    const note = await TopicNote.create({
      userId,
      goalId: topic.goalId,
      topicId,
      content: content.slice(0, 4000),
      source,
    });
    res.status(201).json({ note });
  } catch (err) {
    console.error("Create note error:", err.message);
    res.status(500).json({ error: "Could not save note" });
  }
}

async function updateTopicNote(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid note id" });
    const update = {};
    if ("content" in req.body) {
      const content = cleanString(req.body.content);
      if (!content) return res.status(400).json({ error: "content is required" });
      update.content = content.slice(0, 4000);
    }
    if ("source" in req.body) {
      const source = cleanString(req.body.source);
      if (source && !TopicNote.SOURCE_VALUES.includes(source)) {
        return res.status(400).json({
          error: `Invalid source. Allowed: ${TopicNote.SOURCE_VALUES.join(", ")}`,
        });
      }
      if (source) update.source = source;
    }
    const note = await TopicNote.findOneAndUpdate(
      { _id: id, userId },
      { $set: update },
      { new: true }
    );
    if (!note) return res.status(404).json({ error: "Note not found" });
    res.json({ note });
  } catch (err) {
    console.error("Update note error:", err.message);
    res.status(500).json({ error: "Could not update note" });
  }
}

async function deleteTopicNote(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid note id" });
    const result = await TopicNote.findOneAndDelete({ _id: id, userId });
    if (!result) return res.status(404).json({ error: "Note not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete note error:", err.message);
    res.status(500).json({ error: "Could not delete note" });
  }
}

// ── Topic progress patch ──────────────────────────────────────────────────
async function updateTopicProgress(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const topicId = asObjectId(req.params.topicId);
    if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
    const update = {};
    if ("status" in req.body) {
      const status = cleanString(req.body.status);
      if (status && !StudyTopic.STATUS_VALUES.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Allowed: ${StudyTopic.STATUS_VALUES.join(", ")}`,
        });
      }
      if (status) update.status = status;
    }
    if (req.body?.touchLastStudied === true) {
      update.lastStudiedAt = new Date();
    }
    if (!Object.keys(update).length) {
      return res.status(400).json({ error: "Nothing to update" });
    }
    const topic = await StudyTopic.findOneAndUpdate(
      { _id: topicId, userId },
      { $set: update },
      { new: true }
    );
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    res.json({ topic });
  } catch (err) {
    console.error("Update topic progress error:", err.message);
    res.status(500).json({ error: "Could not update topic progress" });
  }
}

// ── Doubt chat (topic-scoped) ─────────────────────────────────────────────
async function topicDoubtChat(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const topicId = asObjectId(req.params.topicId);
    if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
    const question = cleanString(req.body?.question);
    if (!question) return res.status(400).json({ error: "question is required" });
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const topic = await StudyTopic.findOne({ _id: topicId, userId });
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    const goal = await StudyGoal.findOne({ _id: topic.goalId, userId });
    const lesson = await TopicLesson.findOne({ topicId, userId });

    let structured;
    try {
      structured = await studyAIService.answerTopicDoubt({
        goal,
        topic,
        lesson,
        history,
        question,
      });
    } catch (err) {
      console.error("Doubt chat LLM error:", err.message);
      return res.status(502).json({
        error: "OrionAI couldn’t answer right now. Try again.",
      });
    }

    // Backwards-compatible shape: `reply` is the plain explanation string,
    // `answer` is the structured object the new UI consumes.
    res.json({
      reply: structured.explanation,
      answer: structured,
      label: structured.usedAttachedMaterial
        ? "Based on attached material"
        : structured.answerType || "OrionAI explanation",
    });
  } catch (err) {
    console.error("Doubt chat error:", err.message);
    res.status(500).json({ error: "Could not answer doubt" });
  }
}

module.exports = {
  getOverview,
  createGoal,
  listGoals,
  updateGoal,
  createTopic,
  createTopicsBulk,
  listTopics,
  getTopic,
  updateTopic,
  completeTopic,
  generatePlan,
  movePlannedTopicToTomorrow,
  listRevisions,
  completeRevision,
  snoozeRevision,
  suggestTopics,
  getTopicLearning,
  generateLesson,
  createMaterial,
  createMaterialForTopic,
  listMaterials,
  updateMaterial,
  deleteMaterial,
  generatePracticeQuestionsForTopic,
  listPracticeQuestions,
  updatePracticeQuestion,
  generateFlashcardsForTopic,
  updateFlashcard,
  deleteFlashcard,
  createTopicNote,
  updateTopicNote,
  deleteTopicNote,
  updateTopicProgress,
  topicDoubtChat,
  computeGoalProgress,
};
