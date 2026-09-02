"use strict";

const express = require("express");
const multer = require("multer");
const {
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
} = require("../controllers/studyController");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.get("/overview", getOverview);
router.get("/consistency", getConsistencyGraph);
router.get("/consistency/summary", getConsistencySummary);

// Goals
router.get("/goals", listGoals);
router.post("/goals", createGoal);
router.get("/goals/:goalId", getGoal);
router.patch("/goals/:id", updateGoal);
router.delete("/goals/:goalId", deleteGoal);
router.post("/goals/:goalId/suggest-topics", suggestTopics);
router.post("/goals/:goalId/save-suggested-topics", createTopicsBulk);

// Topics
router.get("/topics", listTopics);
router.post("/topics", createTopic);
router.post("/topics/bulk", createTopicsBulk);
router.get("/topics/:id", getTopic);
router.patch("/topics/:id", updateTopic);
router.delete("/topics/:topicId", deleteTopic);
router.post("/topics/:id/start", startTopic);
router.post("/topics/:id/complete", completeTopic);
router.post("/topics/:id/move-to-tomorrow", movePlannedTopicToTomorrow);
router.get("/topics/:topicId/pre-topic-review", getPreTopicReview);
router.post("/topics/:topicId/pre-topic-review/generate", generatePreTopicReview);

// Topic learning (Phase 2)
router.get("/topics/:topicId/learning", getTopicLearning);
router.post("/topics/:topicId/generate-lesson", generateLesson);
router.post("/topics/:topicId/materials", createMaterialForTopic);
router.post("/topics/:topicId/generate-questions", generatePracticeQuestionsForTopic);
router.get("/topics/:topicId/questions", listPracticeQuestions);
router.post("/topics/:topicId/generate-flashcards", generateFlashcardsForTopic);
router.get("/topics/:topicId/notes", listTopicNotes);
router.post("/topics/:topicId/notes", createTopicNote);
router.patch("/topics/:topicId/progress", updateTopicProgress);
router.post("/topics/:topicId/doubt", topicDoubtChat);
router.post("/topics/:topicId/doubt-chat", topicDoubtChat);
router.get("/topics/:topicId/memory", listTopicMemory);
router.delete("/topics/:topicId/memory", deleteTopicMemory);
router.delete("/topics/:topicId/memory/:memoryId", deleteTopicMemory);

// Materials
router.get("/materials", listMaterials);
router.post("/materials", createMaterial);
router.post("/materials/upload", upload.single("file"), uploadMaterial);
router.get("/materials/:materialId/file", openMaterialFile);
router.get("/materials/:materialId", getMaterial);
router.patch("/materials/:id", updateMaterial);
router.delete("/materials/:id", deleteMaterial);
router.post("/materials/:materialId/retry-processing", retryMaterial);

// Practice questions
router.patch("/questions/:id", updatePracticeQuestion);
router.post("/questions/:questionId/check", checkPracticeQuestion);

// Flashcards
router.patch("/flashcards/:id", updateFlashcard);
router.delete("/flashcards/:id", deleteFlashcard);

// Notes
router.patch("/notes/:id", updateTopicNote);
router.delete("/notes/:id", deleteTopicNote);

// Plan
router.post("/plan/today", generatePlan);
router.post("/plan/move-to-tomorrow", movePlannedTopicToTomorrow);
router.post("/plan/items/:itemId/complete", completePlanItem);
router.post("/plan/items/:itemId/skip", skipPlanItem);

// Revision
router.get("/revision", listRevisions);
router.post("/revision/:id/complete", completeRevision);
router.post("/revision/:id/snooze", snoozeRevision);
router.post("/revision/:id/review-later", snoozeRevision);

// Pre-topic review
router.post("/pre-topic-review/:reviewId/answer", answerPreTopicReview);
router.post("/pre-topic-review/:reviewId/complete", completePreTopicReview);
router.post("/pre-topic-review/:reviewId/skip", skipPreTopicReview);

module.exports = router;
