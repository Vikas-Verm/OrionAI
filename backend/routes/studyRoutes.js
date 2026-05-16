"use strict";

const express = require("express");
const {
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
} = require("../controllers/studyController");

const router = express.Router();

router.get("/overview", getOverview);

// Goals
router.get("/goals", listGoals);
router.post("/goals", createGoal);
router.patch("/goals/:id", updateGoal);
router.post("/goals/:goalId/suggest-topics", suggestTopics);

// Topics
router.get("/topics", listTopics);
router.post("/topics", createTopic);
router.post("/topics/bulk", createTopicsBulk);
router.get("/topics/:id", getTopic);
router.patch("/topics/:id", updateTopic);
router.post("/topics/:id/complete", completeTopic);
router.post("/topics/:id/move-to-tomorrow", movePlannedTopicToTomorrow);

// Topic learning (Phase 2)
router.get("/topics/:topicId/learning", getTopicLearning);
router.post("/topics/:topicId/generate-lesson", generateLesson);
router.post("/topics/:topicId/materials", createMaterialForTopic);
router.post("/topics/:topicId/generate-questions", generatePracticeQuestionsForTopic);
router.get("/topics/:topicId/questions", listPracticeQuestions);
router.post("/topics/:topicId/generate-flashcards", generateFlashcardsForTopic);
router.post("/topics/:topicId/notes", createTopicNote);
router.patch("/topics/:topicId/progress", updateTopicProgress);
router.post("/topics/:topicId/doubt-chat", topicDoubtChat);

// Materials
router.get("/materials", listMaterials);
router.post("/materials", createMaterial);
router.patch("/materials/:id", updateMaterial);
router.delete("/materials/:id", deleteMaterial);

// Practice questions
router.patch("/questions/:id", updatePracticeQuestion);

// Flashcards
router.patch("/flashcards/:id", updateFlashcard);
router.delete("/flashcards/:id", deleteFlashcard);

// Notes
router.patch("/notes/:id", updateTopicNote);
router.delete("/notes/:id", deleteTopicNote);

// Plan
router.post("/plan/today", generatePlan);

// Revision
router.get("/revision", listRevisions);
router.post("/revision/:id/complete", completeRevision);
router.post("/revision/:id/snooze", snoozeRevision);

module.exports = router;
