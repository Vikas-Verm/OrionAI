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
const StudyMemory = require("../models/StudyMemory");
const StudyActivity = require("../models/StudyActivity");
const PreTopicReview = require("../models/PreTopicReview");
const {
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
} = require("../services/studyPlanService");
const studyAIService = require("../services/studyAIService");
const {
  recordStudyActivity,
  getConsistency,
  safeTimezone,
} = require("../services/studyActivityService");
const {
  createUploadedMaterial,
  getUploadedMaterialFile,
  retryMaterialProcessing,
  materialPublic,
} = require("../services/studyMaterialService");
const preTopicReviewService = require("../services/preTopicReviewService");
const { gradePracticeAnswer } = require("../services/studyPracticeService");

function getUserId(req) {
  return req.user?.username || req.user?.userId || "";
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanTags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => cleanString(tag).slice(0, 40))
    .filter(Boolean)
    .slice(0, 20);
}

function getTimezone(req) {
  return safeTimezone(
    req.body?.timezone || req.query?.timezone || req.headers["x-timezone"]
  );
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
    const style = cleanString(body.preferredLearningStyle).replace(/[\s-]+/g, "_");
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
  if ("description" in body) payload.description = cleanString(body.description).slice(0, 2000);
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
  if ("tags" in body) payload.tags = cleanTags(body.tags);
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
    } else if (req.query?.includeArchived !== "true") {
      filter.status = { $ne: "archived" };
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
    const progressEntries = await Promise.all(
      goals.map(async (goal) => [
        String(goal._id),
        await computeGoalProgress({ userId, goalId: goal._id }),
      ])
    );
    const progressByGoal = new Map(progressEntries);

    res.json({
      goals: goals.map((goal) => {
        const goalTopics = topicsByGoal.get(String(goal._id)) || [];
        const total = goalTopics.length;
        const completed = goalTopics.filter((t) => t.status === "completed")
          .length;
        const progressStats = progressByGoal.get(String(goal._id)) || {};
        return {
          ...goal.toObject(),
          stats: {
            ...progressStats,
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

async function getGoal(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const goalId = asObjectId(req.params.goalId || req.params.id);
    if (!goalId) return res.status(400).json({ error: "Invalid goal id" });
    const goal = await StudyGoal.findOne({ _id: goalId, userId });
    if (!goal) return res.status(404).json({ error: "Goal not found" });
    const progress = await computeGoalProgress({ userId, goalId });
    res.json({ goal: { ...goal.toObject(), stats: progress } });
  } catch (err) {
    console.error("Get study goal error:", err.message);
    res.status(500).json({ error: "Could not load study goal" });
  }
}

async function updateGoal(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.id || req.params.goalId);
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

async function deleteGoal(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const goalId = asObjectId(req.params.goalId || req.params.id);
    if (!goalId) return res.status(400).json({ error: "Invalid goal id" });
    const goal = await StudyGoal.findOneAndUpdate(
      { _id: goalId, userId },
      { $set: { status: "archived" } },
      { new: true }
    );
    if (!goal) return res.status(404).json({ error: "Goal not found" });
    await StudyTopic.updateMany(
      { userId, goalId, status: { $ne: "archived" } },
      { $set: { status: "archived" } }
    );
    res.json({ ok: true, goal });
  } catch (err) {
    console.error("Delete study goal error:", err.message);
    res.status(500).json({ error: "Could not archive study goal" });
  }
}

// ── Topics ────────────────────────────────────────────────────────────────
async function createTopic(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const goalId = asObjectId(req.body?.goalId || req.params.goalId);
    if (!goalId) return res.status(400).json({ error: "goalId is required" });
    const goal = await StudyGoal.findOne({ _id: goalId, userId });
    if (!goal) return res.status(404).json({ error: "Goal not found" });

    const { error, payload } = buildTopicPayload(req.body || {});
    if (error) return res.status(400).json({ error });
    if (!payload.title) return res.status(400).json({ error: "title is required" });

    const existingTopics = await StudyTopic.find({ userId, goalId }).select("title status");
    const duplicate = existingTopics.find(
      (topic) =>
        topic.status !== "archived" &&
        studyAIService.normalizeTitleKey(topic.title) ===
          studyAIService.normalizeTitleKey(payload.title)
    );
    if (duplicate) {
      return res.status(409).json({ error: "This topic already exists for this goal." });
    }

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
    const status = cleanString(req.query?.status);
    if (status && StudyTopic.STATUS_VALUES.includes(status)) filter.status = status;
    else if (req.query?.includeArchived !== "true") filter.status = { $ne: "archived" };
    const difficulty = cleanString(req.query?.difficulty);
    if (difficulty && StudyTopic.DIFFICULTY_VALUES.includes(difficulty)) {
      filter.difficulty = difficulty;
    }
    const search = cleanString(req.query?.search);
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }
    const sortKey = cleanString(req.query?.sort) || "order";
    const sort =
      sortKey === "updated"
        ? { updatedAt: -1 }
        : sortKey === "difficulty"
          ? { difficulty: 1, order: 1 }
          : sortKey === "status"
            ? { status: 1, order: 1 }
            : { order: 1, createdAt: 1 };
    const topics = await StudyTopic.find(filter).sort(sort);
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

async function deleteTopic(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const topicId = asObjectId(req.params.topicId || req.params.id);
    if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
    const topic = await StudyTopic.findOneAndUpdate(
      { _id: topicId, userId },
      { $set: { status: "archived" } },
      { new: true }
    );
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    res.json({ ok: true, topic });
  } catch (err) {
    console.error("Delete study topic error:", err.message);
    res.status(500).json({ error: "Could not archive study topic" });
  }
}

async function startTopic(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid topic id" });
    const topic = await StudyTopic.findOne({ _id: id, userId });
    if (!topic) return res.status(404).json({ error: "Topic not found" });

    if (topic.status === "not_started") {
      topic.status = "in_progress";
      await topic.save();
    }

    const session = await markSessionTopicStarted({
      userId,
      goalId: topic.goalId,
      topicId: topic._id,
    });

    res.json({
      topic,
      session,
      message:
        "Topic started. Streak and completed minutes update after real learning work is completed.",
    });
  } catch (err) {
    console.error("Start study topic error:", err.message);
    res.status(500).json({ error: "Could not start study topic" });
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

    const session = await markSessionTopicCompleted({
      userId,
      goalId: topic.goalId,
      topicId: topic._id,
      fallbackMinutes: Number(topic.estimatedMinutes) || 30,
    });
    const item = session?.plannedItems?.find(
      (entry) => String(entry.topicId) === String(topic._id)
    );
    await recordStudyActivity({
      userId,
      topicId: topic._id,
      minutes: Number(item?.plannedMinutes) || Number(topic.estimatedMinutes) || 30,
      completedPlanItemCount: 1,
      timezone: getTimezone(req),
      activityKey: `topic-complete:${topic._id}:${new Date().toISOString().slice(0, 10)}`,
    });

    res.json({ topic, revision, session });
  } catch (err) {
    console.error("Complete study topic error:", err.message);
    res.status(500).json({ error: "Could not complete study topic" });
  }
}

async function completePlanItem(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const itemId = cleanString(req.params.itemId);
    if (!itemId) return res.status(400).json({ error: "Invalid plan item id" });
    const session = await StudySession.findOne({
      userId,
      "plannedItems._id": itemId,
    });
    if (!session) return res.status(404).json({ error: "Plan item not found" });
    const item = session.plannedItems.id(itemId);
    if (!item) return res.status(404).json({ error: "Plan item not found" });
    const topic = await StudyTopic.findOne({ _id: item.topicId, userId });
    if (!topic) return res.status(404).json({ error: "Topic not found" });

    if (item.status !== "completed") {
      item.status = "completed";
      item.startedAt = item.startedAt || new Date();
      item.completedAt = new Date();
    }
    syncLegacySessionFields(session);
    await session.save();

    await recordStudyActivity({
      userId,
      topicId: topic._id,
      minutes: Number(item.plannedMinutes) || Number(topic.estimatedMinutes) || 30,
      completedPlanItemCount: 1,
      timezone: getTimezone(req),
      activityKey: `plan-item-complete:${session._id}:${item._id}`,
    });

    res.json({ session, item, topic });
  } catch (err) {
    console.error("Complete study plan item error:", err.message);
    res.status(500).json({ error: "Could not complete study plan item" });
  }
}

async function skipPlanItem(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const itemId = cleanString(req.params.itemId);
    if (!itemId) return res.status(400).json({ error: "Invalid plan item id" });
    const session = await StudySession.findOne({
      userId,
      "plannedItems._id": itemId,
    });
    if (!session) return res.status(404).json({ error: "Plan item not found" });
    const item = session.plannedItems.id(itemId);
    if (!item) return res.status(404).json({ error: "Plan item not found" });
    if (item.status !== "completed") item.status = "skipped";
    syncLegacySessionFields(session);
    await session.save();
    res.json({ session, item });
  } catch (err) {
    console.error("Skip study plan item error:", err.message);
    res.status(500).json({ error: "Could not skip study plan item" });
  }
}

// ── Plan ──────────────────────────────────────────────────────────────────
async function generatePlan(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const goalId = asObjectId(req.body?.goalId || req.params.goalId);
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
    revision.completedAt = new Date();
    const result = cleanString(req.body?.result);
    if (["known", "weak", "partial"].includes(result)) revision.result = result;
    await revision.save();
    const topic = await StudyTopic.findOne({ _id: revision.topicId, userId });
    const next = await scheduleNextRevisionForTopic({
      userId,
      goalId: revision.goalId,
      topicId: revision.topicId,
    });
    if (revision.result === "weak" && next) {
      next.dueAt = addDays(startOfDay(), 1);
      await next.save();
    }
    await StudyTopic.findOneAndUpdate(
      { _id: revision.topicId, userId },
      { $set: { lastStudiedAt: new Date(), nextRevisionAt: next?.dueAt || null } }
    );
    const session = await markSessionTopicCompleted({
      userId,
      goalId: revision.goalId,
      topicId: revision.topicId,
      fallbackMinutes: Number(topic?.estimatedMinutes) || 15,
      type: "revise",
    });
    const item = session?.plannedItems?.find(
      (entry) => String(entry.topicId) === String(revision.topicId)
    );
    await recordStudyActivity({
      userId,
      topicId: revision.topicId,
      minutes: Number(item?.plannedMinutes) || Number(topic?.estimatedMinutes) || 15,
      revisionCount: 1,
      completedPlanItemCount: 1,
      timezone: getTimezone(req),
      activityKey: `revision-complete:${revision._id}`,
    });
    res.json({ revision, next, session });
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
    const goalId = asObjectId(req.body?.goalId || req.params.goalId);
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
    const topicId = asObjectId(req.params.id || req.body?.topicId);
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
      const todayItems = getSessionPlannedItems(todaySession).map((item) =>
        typeof item.toObject === "function" ? item.toObject() : { ...item }
      );
      const existingItem = todayItems.find(
        (item) => String(item.topicId) === String(topic._id)
      );
      const wasPlanned =
        existingItem &&
        !["completed", "moved", "skipped"].includes(existingItem.status);
      if (wasPlanned) {
        plannedMinutes = Number(existingItem.plannedMinutes) || 0;
        todaySession.plannedItems = todayItems.map((item) =>
          String(item.topicId) === String(topic._id)
            ? { ...item, status: "moved" }
            : item
        );
        syncLegacySessionFields(todaySession);
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
      const tomorrowItems = getSessionPlannedItems(tomorrowSession).map((item) =>
        typeof item.toObject === "function" ? item.toObject() : { ...item }
      );
      alreadyOnTomorrow = tomorrowItems.some(
        (item) =>
          String(item.topicId) === String(topic._id) &&
          !["moved", "skipped"].includes(item.status)
      );
      if (!alreadyOnTomorrow) {
        tomorrowItems.push({
          topicId: topic._id,
          plannedMinutes,
          order: tomorrowItems.length,
          type: "learn",
          status: "planned",
          startedAt: null,
          completedAt: null,
        });
        tomorrowSession.plannedItems = tomorrowItems;
        syncLegacySessionFields(tomorrowSession);
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
        plannedItems: [
          {
            topicId: topic._id,
            plannedMinutes,
            order: 0,
            type: "learn",
            status: "planned",
          },
        ],
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

async function resolveMaterialContext({
  userId,
  goalId,
  topicId,
  materialIds = [],
  contextMode = "topic",
  question = "",
} = {}) {
  const filter = {
    userId,
    status: { $nin: ["archived"] },
    processingStatus: { $in: ["ready", "uploaded", null] },
  };
  if (Array.isArray(materialIds) && materialIds.length) {
    const ids = materialIds.map(asObjectId).filter(Boolean);
    filter._id = { $in: ids };
  } else if (contextMode === "goal") {
    filter.goalId = goalId;
  } else if (contextMode === "general") {
    return [];
  } else {
    filter.topicId = topicId;
  }
  const materials = await StudyMaterial.find(filter).limit(12);
  const terms = String(question || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2)
    .slice(0, 12);
  return materials
    .map((material) => {
      const text = String(material.extractedText || material.contentText || "").trim();
      const haystack = text.toLowerCase();
      const score = terms.reduce(
        (sum, term) => sum + (haystack.includes(term) ? 1 : 0),
        0
      );
      return {
        material,
        score,
        title: material.title,
        text: text.slice(0, 1800),
      };
    })
    .filter((entry) => entry.text)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
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
    const [notes, weakMemories, recentReview] = await Promise.all([
      TopicNote.find({ userId, topicId }).sort({ pinned: -1, createdAt: -1 }).limit(5),
      StudyMemory.find({
        userId,
        topicId,
        memoryType: "weak_area",
        dismissed: false,
      }).sort({ updatedAt: -1 }).limit(5),
      PreTopicReview.findOne({
        userId,
        newTopicId: topicId,
        status: "completed",
      }).sort({ completedAt: -1 }),
    ]);
    const materialContext = await resolveMaterialContext({
      userId,
      goalId: topic.goalId,
      topicId,
      materialIds: req.body?.materialIds || [],
      contextMode: req.body?.useMaterials ? "topic" : "general",
    });

    let lessonPayload;
    try {
      lessonPayload = await studyAIService.generateLessonForTopic({
        goal,
        topic,
        notes,
        materials: materialContext,
        weakMemories,
        preTopicReview: recentReview,
        mode: cleanString(req.body?.mode),
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
        sourceBasis: materialContext.length ? "mixed" : "ai_generated",
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
        sourceBasis: materialContext.length ? "mixed" : "ai_generated",
        generatedBy: "orionai",
      });
    }

    if (topic.status === "not_started") {
      topic.status = "in_progress";
      await topic.save();
    }
    await markSessionTopicStarted({
      userId,
      goalId: topic.goalId,
      topicId: topic._id,
    });

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
  if ("extractedText" in body) payload.extractedText = String(body.extractedText || "");
  if ("summary" in body) payload.summary = String(body.summary || "");
  if ("tags" in body) payload.tags = cleanTags(body.tags);
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
    if (goalId) {
      const goal = await StudyGoal.findOne({ _id: goalId, userId });
      if (!goal) return res.status(404).json({ error: "Goal not found" });
    }
    if (topicId) {
      const topic = await StudyTopic.findOne({ _id: topicId, userId });
      if (!topic) return res.status(404).json({ error: "Topic not found" });
      if (goalId && String(topic.goalId) !== String(goalId)) {
        return res.status(400).json({ error: "Topic does not belong to this goal" });
      }
    }
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
      sourceApp: payload.sourceApp || "manual",
      status: payload.status || "ready",
      processingStatus: payload.processingStatus || "ready",
      extractionStatus: payload.contentText || payload.extractedText ? "ready" : "not_applicable",
    });
    res.status(201).json({ material: materialPublic(material) });
  } catch (err) {
    console.error("Create material error:", err.message);
    res.status(500).json({ error: "Could not save material" });
  }
}

async function uploadMaterial(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const goalId = asObjectId(req.body?.goalId);
    const topicId = asObjectId(req.body?.topicId);
    if (goalId) {
      const goal = await StudyGoal.findOne({ _id: goalId, userId });
      if (!goal) return res.status(404).json({ error: "Goal not found" });
    }
    if (topicId) {
      const topic = await StudyTopic.findOne({ _id: topicId, userId });
      if (!topic) return res.status(404).json({ error: "Topic not found" });
      if (goalId && String(topic.goalId) !== String(goalId)) {
        return res.status(400).json({ error: "Topic does not belong to this goal" });
      }
    }
    const material = await createUploadedMaterial({
      userId,
      goalId: goalId || null,
      topicId: topicId || null,
      file: req.file,
      title: req.body?.title,
    });
    res.status(201).json({ material: materialPublic(material) });
  } catch (err) {
    console.error("Upload study material error:", err.message);
    res.status(err.status || 500).json({
      error: err.status ? err.message : "Could not upload study material",
    });
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
    res.json({ materials: materials.map(materialPublic) });
  } catch (err) {
    console.error("List materials error:", err.message);
    res.status(500).json({ error: "Could not load materials" });
  }
}

async function getMaterial(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.materialId || req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid material id" });
    const material = await StudyMaterial.findOne({ _id: id, userId });
    if (!material) return res.status(404).json({ error: "Material not found" });
    res.json({ material: materialPublic(material) });
  } catch (err) {
    console.error("Get material error:", err.message);
    res.status(500).json({ error: "Could not load material" });
  }
}

async function openMaterialFile(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.materialId || req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid material id" });
    const file = await getUploadedMaterialFile({ userId, materialId: id });
    if (!file) return res.status(404).json({ error: "Material not found" });

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${file.fileName.replace(/"/g, "")}"`
    );
    res.sendFile(file.filePath);
  } catch (err) {
    console.error("Open material file error:", err.message);
    res.status(err.status || 500).json({
      error: err.status ? err.message : "Could not open material file",
    });
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
    res.json({ material: materialPublic(material) });
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
    const material = await StudyMaterial.findOneAndUpdate(
      { _id: id, userId },
      {
        $set: {
          status: "archived",
          processingStatus: "archived",
          extractedText: "",
          contentText: "",
        },
      },
      { new: true }
    );
    if (!material) return res.status(404).json({ error: "Material not found" });
    res.json({ ok: true, material: materialPublic(material) });
  } catch (err) {
    console.error("Delete material error:", err.message);
    res.status(500).json({ error: "Could not delete material" });
  }
}

async function retryMaterial(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.materialId || req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid material id" });
    const material = await retryMaterialProcessing({ userId, materialId: id });
    if (!material) return res.status(404).json({ error: "Material not found" });
    res.json({ material: materialPublic(material) });
  } catch (err) {
    console.error("Retry material error:", err.message);
    res.status(500).json({ error: "Could not retry material processing" });
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

async function checkPracticeQuestion(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = asObjectId(req.params.questionId || req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid question id" });
    const userAnswer = String(req.body?.answer ?? req.body?.userAnswer ?? "").trim();
    if (!userAnswer) return res.status(400).json({ error: "answer is required" });
    const question = await PracticeQuestion.findOne({ _id: id, userId });
    if (!question) return res.status(404).json({ error: "Question not found" });

    const [topic, goal] = await Promise.all([
      StudyTopic.findOne({ _id: question.topicId, userId }).select(
        "title subject category difficulty"
      ),
      StudyGoal.findOne({ _id: question.goalId, userId }).select(
        "title purpose level preferredLearningStyle"
      ),
    ]);
    const grade = await gradePracticeAnswer({
      question,
      userAnswer,
      goal,
      topic,
    });
    const answeredCorrectly = grade.answeredCorrectly;
    question.userAnswer = userAnswer.slice(0, 1000);
    question.answeredCorrectly = answeredCorrectly;
    question.grading = grade.grading;
    await question.save();

    await recordStudyActivity({
      userId,
      topicId: question.topicId,
      practiceQuestionCount: 1,
      timezone: getTimezone(req),
      activityKey: `question-check:${question._id}:${userAnswer.toLowerCase().slice(0, 120)}`,
    });

    if (grade.shouldCreateWeakMemory) {
      const memoryPrefix =
        grade.grading?.verdict === "partially_correct"
          ? "Partially correct practice answer"
          : "Missed practice question";
      await StudyMemory.create({
        userId,
        goalId: question.goalId,
        topicId: question.topicId,
        memoryType: "weak_area",
        content: `${memoryPrefix}: ${question.question.slice(0, 180)}`,
        sourceType: "practice",
        sourceRef: String(question._id),
        importance: 2,
        confidence: grade.grading?.confidence ?? 0.5,
        userApproved: false,
      });
    }

    res.json({
      question,
      feedback: {
        answeredCorrectly,
        grading: grade.grading,
        explanation: question.explanation || "",
        correctAnswer: question.correctAnswer || "",
        message:
          grade.grading?.verdict === "needs_review"
            ? "Couldn’t confidently grade this answer."
            : grade.grading?.verdict === "partially_correct"
              ? "Almost there."
              : answeredCorrectly
              ? "Correct."
              : "Not quite. Review the explanation and try again.",
      },
    });
  } catch (err) {
    console.error("Check question error:", err.message);
    res.status(500).json({ error: "Could not check answer" });
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
    if (update.status) {
      await recordStudyActivity({
        userId,
        topicId: flashcard.topicId,
        flashcardReviewCount: 1,
        timezone: getTimezone(req),
        activityKey: `flashcard-review:${flashcard._id}:${flashcard.reviewCount}`,
      });
      if (update.status === "weak") {
        await StudyMemory.create({
          userId,
          goalId: flashcard.goalId,
          topicId: flashcard.topicId,
          memoryType: "weak_area",
          content: `Weak flashcard: ${flashcard.front.slice(0, 180)}`,
          sourceType: "flashcard",
          sourceRef: String(flashcard._id),
          importance: 2,
          confidence: 0.45,
          userApproved: false,
        });
      }
    }
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
async function listTopicNotes(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const topicId = asObjectId(req.params.topicId);
    if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
    const topic = await StudyTopic.findOne({ _id: topicId, userId });
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    const filter = { userId, topicId };
    const search = cleanString(req.query?.search);
    if (search) filter.content = { $regex: search, $options: "i" };
    const notes = await TopicNote.find(filter).sort({ pinned: -1, createdAt: -1 });
    res.json({ notes });
  } catch (err) {
    console.error("List notes error:", err.message);
    res.status(500).json({ error: "Could not load notes" });
  }
}

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
    const sourceMaterialId = asObjectId(req.body?.sourceMaterialId);
    if (sourceMaterialId) {
      const material = await StudyMaterial.findOne({ _id: sourceMaterialId, userId });
      if (!material) return res.status(404).json({ error: "Source material not found" });
    }
    const note = await TopicNote.create({
      userId,
      goalId: topic.goalId,
      topicId,
      content: content.slice(0, 4000),
      source,
      sourceMaterialId: sourceMaterialId || null,
      pinned: req.body?.pinned === true,
    });
    await recordStudyActivity({
      userId,
      topicId,
      noteCount: 1,
      timezone: getTimezone(req),
      activityKey: `note-create:${note._id}`,
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
    if ("pinned" in req.body) update.pinned = req.body.pinned === true;
    if ("sourceMaterialId" in req.body) {
      update.sourceMaterialId = asObjectId(req.body.sourceMaterialId) || null;
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
    if (
      req.body?.touchLastStudied === true &&
      (req.body?.completedWork === true || update.status === "completed")
    ) {
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
    if (req.body?.completedWork === true || update.status === "completed") {
      await markSessionTopicCompleted({
        userId,
        goalId: topic.goalId,
        topicId: topic._id,
        fallbackMinutes: Number(topic.estimatedMinutes) || 30,
      });
    } else if (update.status === "in_progress") {
      await markSessionTopicStarted({
        userId,
        goalId: topic.goalId,
        topicId: topic._id,
      });
    }
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
    const contextMode = cleanString(req.body?.contextMode) || "topic";
    const materialContext = await resolveMaterialContext({
      userId,
      goalId: topic.goalId,
      topicId,
      materialIds: req.body?.materialIds || req.body?.selectedMaterialIds || [],
      contextMode,
      question,
    });

    let structured;
    try {
      structured = await studyAIService.answerTopicDoubt({
        goal,
        topic,
        lesson,
        history,
        question,
        materialContext,
        allowGeneralKnowledge: contextMode !== "materials_only",
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
      sources: materialContext.map((entry) => ({
        materialId: entry.material._id,
        title: entry.material.title,
        sourceApp: entry.material.sourceApp,
      })),
      label: structured.usedAttachedMaterial
        ? "Based on attached material"
        : structured.answerType || "OrionAI explanation",
    });
  } catch (err) {
    console.error("Doubt chat error:", err.message);
    res.status(500).json({ error: "Could not answer doubt" });
  }
}

async function getConsistencyGraph(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const range = cleanString(req.query?.range) || "12_weeks";
    const data = await getConsistency({
      userId,
      range,
      timezone: getTimezone(req),
    });
    res.json(data);
  } catch (err) {
    console.error("Study consistency error:", err.message);
    res.status(500).json({ error: "Could not load consistency" });
  }
}

async function getConsistencySummary(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const data = await getConsistency({
      userId,
      range: "12_weeks",
      timezone: getTimezone(req),
    });
    const { days, ...summary } = data;
    res.json(summary);
  } catch (err) {
    console.error("Study consistency summary error:", err.message);
    res.status(500).json({ error: "Could not load consistency summary" });
  }
}

async function listTopicMemory(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const topicId = asObjectId(req.params.topicId);
    if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
    const topic = await StudyTopic.findOne({ _id: topicId, userId });
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    const memories = await StudyMemory.find({
      userId,
      topicId,
      dismissed: false,
    }).sort({ importance: -1, updatedAt: -1 });
    res.json({ memories });
  } catch (err) {
    console.error("List study memory error:", err.message);
    res.status(500).json({ error: "Could not load study memory" });
  }
}

async function deleteTopicMemory(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const topicId = asObjectId(req.params.topicId);
    if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
    const topic = await StudyTopic.findOne({ _id: topicId, userId });
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    const memoryId = asObjectId(req.params.memoryId);
    if (memoryId) {
      const memory = await StudyMemory.findOneAndUpdate(
        { _id: memoryId, userId, topicId },
        { $set: { dismissed: true } },
        { new: true }
      );
      if (!memory) return res.status(404).json({ error: "Memory not found" });
      return res.json({ ok: true, memory });
    }
    await StudyMemory.updateMany(
      { userId, topicId },
      { $set: { dismissed: true } }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete study memory error:", err.message);
    res.status(500).json({ error: "Could not update study memory" });
  }
}

async function getPreTopicReview(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const topicId = asObjectId(req.params.topicId);
    if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
    const result = await preTopicReviewService.getReviewRecommendation({
      userId,
      topicId,
    });
    if (!result) return res.status(404).json({ error: "Topic not found" });
    res.json(result);
  } catch (err) {
    console.error("Pre-topic review get error:", err.message);
    res.status(500).json({ error: "Could not load quick review" });
  }
}

async function generatePreTopicReview(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const topicId = asObjectId(req.params.topicId);
    if (!topicId) return res.status(400).json({ error: "Invalid topic id" });
    const result = await preTopicReviewService.generateReview({
      userId,
      topicId,
      maxQuestions: Number(req.body?.maxQuestions) || 5,
    });
    if (!result) return res.status(404).json({ error: "Topic not found" });
    res.json(result);
  } catch (err) {
    console.error("Pre-topic review generate error:", err.message);
    res.status(500).json({ error: "Could not generate quick review" });
  }
}

async function answerPreTopicReview(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const reviewId = asObjectId(req.params.reviewId);
    if (!reviewId) return res.status(400).json({ error: "Invalid review id" });
    const review = await preTopicReviewService.answerReviewQuestion({
      userId,
      reviewId,
      questionId: cleanString(req.body?.questionId),
      userAnswer: req.body?.userAnswer || req.body?.answer || "",
    });
    if (!review) return res.status(404).json({ error: "Review not found" });
    res.json({ review });
  } catch (err) {
    console.error("Pre-topic review answer error:", err.message);
    res.status(500).json({ error: "Could not save quick review answer" });
  }
}

async function completePreTopicReview(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const reviewId = asObjectId(req.params.reviewId);
    if (!reviewId) return res.status(400).json({ error: "Invalid review id" });
    const review = await preTopicReviewService.completeReview({ userId, reviewId });
    if (!review) return res.status(404).json({ error: "Review not found" });
    await recordStudyActivity({
      userId,
      topicId: review.newTopicId,
      practiceQuestionCount: review.questions.filter((q) => q.answeredAt).length,
      timezone: getTimezone(req),
      activityKey: `pre-topic-review-complete:${review._id}`,
    });
    res.json({ review });
  } catch (err) {
    console.error("Pre-topic review complete error:", err.message);
    res.status(500).json({ error: "Could not complete quick review" });
  }
}

async function skipPreTopicReview(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const reviewId = asObjectId(req.params.reviewId);
    if (!reviewId) return res.status(400).json({ error: "Invalid review id" });
    const review = await preTopicReviewService.skipReview({ userId, reviewId });
    if (!review) return res.status(404).json({ error: "Review not found" });
    res.json({ review });
  } catch (err) {
    console.error("Pre-topic review skip error:", err.message);
    res.status(500).json({ error: "Could not skip quick review" });
  }
}

module.exports = {
  getOverview,
  getConsistencyGraph,
  getConsistencySummary,
  createGoal,
  listGoals,
  getGoal,
  updateGoal,
  deleteGoal,
  createTopic,
  createTopicsBulk,
  listTopics,
  getTopic,
  updateTopic,
  deleteTopic,
  startTopic,
  completeTopic,
  completePlanItem,
  skipPlanItem,
  generatePlan,
  movePlannedTopicToTomorrow,
  listRevisions,
  completeRevision,
  snoozeRevision,
  suggestTopics,
  getTopicLearning,
  generateLesson,
  createMaterial,
  uploadMaterial,
  createMaterialForTopic,
  listMaterials,
  getMaterial,
  openMaterialFile,
  updateMaterial,
  deleteMaterial,
  retryMaterial,
  generatePracticeQuestionsForTopic,
  listPracticeQuestions,
  updatePracticeQuestion,
  checkPracticeQuestion,
  generateFlashcardsForTopic,
  updateFlashcard,
  deleteFlashcard,
  listTopicNotes,
  createTopicNote,
  updateTopicNote,
  deleteTopicNote,
  updateTopicProgress,
  topicDoubtChat,
  listTopicMemory,
  deleteTopicMemory,
  getPreTopicReview,
  generatePreTopicReview,
  answerPreTopicReview,
  completePreTopicReview,
  skipPreTopicReview,
  computeGoalProgress,
};
