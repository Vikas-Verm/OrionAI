import axios from "axios";

export const API_BASE = "http://localhost:3000";

const api = axios.create({ baseURL: API_BASE });

// Inject token on every request
api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// ── Auth ──────────────────────────────────────────────────
export const authAPI = {
  login: (data) => api.post("/auth/login", data),
  register: (data) => api.post("/auth/register", data),
  me: () => api.get("/auth/me"),
};

export const onboardingAPI = {
  status: () => api.get("/api/onboarding/status"),
  update: (data) => api.patch("/api/onboarding", data),
};

// ── Sessions ──────────────────────────────────────────────
export const sessionsAPI = {
  list: (search) => api.get("/sessions", { params: { search } }),
  create: (mode) => api.post("/sessions/new", { mode }),
  messages: (id) => api.get(`/sessions/${id}/messages`),
  export: (sessionId, format = "json") =>
    api.get(`/sessions/${sessionId}/export`, {
      params: { format },
      responseType: format === "json" ? "json" : "text",
    }),
  feedback: (sessionId, messageIndex, rating) =>
    api.post(`/sessions/${sessionId}/messages/${messageIndex}/feedback`, { rating }),
  delete: (id) => api.delete(`/sessions/${id}`),
};

// ── Files ─────────────────────────────────────────────────
export const filesAPI = {
  list: (sessionId) => api.get(`/files/${sessionId}`),
  uploadPDF: (formData) =>
    api.post("/files/upload/pdf", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  uploadCSV: (formData) =>
    api.post("/files/upload/csv", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  delete: (fileId, session) => api.delete(`/files/${fileId}`, { data: { sessionId: session } }),
};

// ── RAG ───────────────────────────────────────────────────
export const ragAPI = {
  ingestText: (text, filename) => api.post("/rag/ingest", { text, filename }),
  ingestPDF: (formData) =>
    api.post("/rag/ingest-pdf", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  chat: (message, sessionId) => api.post("/rag/chat", { message, sessionId }),
};

// ── DB Chat ───────────────────────────────────────────────
export const dbAPI = {
  chat: (message, sessionId) => api.post("/db-chat", { message, sessionId }),
  extractChart: (replyText) => api.post("/chart/extract-chart", { replyText }),
};

// ── Streaming chat (returns raw fetch Response) ───────────
export function streamChat(message, sessionId, webSearch = false, signal) {
  const token = localStorage.getItem("token");
  return fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, sessionId, webSearch }),
    signal,
  });
}

// ── Agent ─────────────────────────────────────────────────
export const agentAPI = {
  parse: (message, history) => api.post("/api/agent/parse", { message, history }),

  gmailSuggestReply: ({ subject, from, body, snippet }) =>
    api.post("/api/agent/gmail-suggest-reply", { subject, from, body, snippet }),

  gmailReply: ({ threadId, messageId, replyTo, subject, body }) =>
    api.post("/api/agent/gmail-reply", { threadId, messageId, replyTo, subject, body }),
};

export const communicationAPI = {
  actionStates: (source = "all") =>
    api.get("/api/communications/action-states", { params: { source } }),
};

export const googleDocsAPI = {
  list: (limit = 12) => api.get("/api/google-docs", { params: { limit } }),
  create: (payload) => api.post("/api/google-docs", payload),
  get: (documentId) => api.get(`/api/google-docs/${documentId}`),
  update: (documentId, payload) => api.patch(`/api/google-docs/${documentId}`, payload),
  delete: (documentId) => api.delete(`/api/google-docs/${documentId}`),
  ai: (documentId, payload) => api.post(`/api/google-docs/${documentId}/ai`, payload),
  share: (documentId, payload) => api.post(`/api/google-docs/${documentId}/share`, payload),
  export: (documentId, payload) =>
    api.post(`/api/google-docs/${documentId}/export`, payload, { responseType: "blob" }),
};

export const googleSheetsAPI = {
  list: (limit = 12) => api.get("/api/google-sheets", { params: { limit } }),
  create: (payload) => api.post("/api/google-sheets", payload),
  get: (spreadsheetId, sheetId) =>
    api.get(`/api/google-sheets/${spreadsheetId}`, {
      params: sheetId ? { sheetId } : {},
    }),
  update: (spreadsheetId, payload) =>
    api.patch(`/api/google-sheets/${spreadsheetId}`, payload),
  duplicate: (spreadsheetId, payload) =>
    api.post(`/api/google-sheets/${spreadsheetId}/duplicate`, payload),
  mutate: (spreadsheetId, payload) =>
    api.post(`/api/google-sheets/${spreadsheetId}/mutations`, payload),
  delete: (spreadsheetId) => api.delete(`/api/google-sheets/${spreadsheetId}`),
  ai: (spreadsheetId, payload) =>
    api.post(`/api/google-sheets/${spreadsheetId}/ai`, payload),
  share: (spreadsheetId, payload) =>
    api.post(`/api/google-sheets/${spreadsheetId}/share`, payload),
  export: (spreadsheetId, payload) =>
    api.post(`/api/google-sheets/${spreadsheetId}/export`, payload, {
      responseType: "blob",
    }),
};

// ── Study Hub ─────────────────────────────────────────────
export const studyAPI = {
  overview: () => api.get("/api/study/overview"),

  listGoals: (params) => api.get("/api/study/goals", { params }),
  getGoal: (goalId) => api.get(`/api/study/goals/${goalId}`),
  createGoal: (payload) => api.post("/api/study/goals", payload),
  updateGoal: (id, payload) => api.patch(`/api/study/goals/${id}`, payload),
  deleteGoal: (id) => api.delete(`/api/study/goals/${id}`),
  suggestTopics: (goalId, payload = {}) =>
    api.post(`/api/study/goals/${goalId}/suggest-topics`, payload),
  saveSuggestedTopics: (goalId, topics) =>
    api.post(`/api/study/goals/${goalId}/save-suggested-topics`, { topics }),

  listTopics: (params) => api.get("/api/study/topics", { params }),
  getTopic: (id) => api.get(`/api/study/topics/${id}`),
  createTopic: (payload) => api.post("/api/study/topics", payload),
  createTopicsBulk: (payload) => api.post("/api/study/topics/bulk", payload),
  updateTopic: (id, payload) => api.patch(`/api/study/topics/${id}`, payload),
  deleteTopic: (id) => api.delete(`/api/study/topics/${id}`),
  startTopic: (id) => api.post(`/api/study/topics/${id}/start`),
  completeTopic: (id) => api.post(`/api/study/topics/${id}/complete`),
  moveTopicToTomorrow: (id) =>
    api.post(`/api/study/topics/${id}/move-to-tomorrow`),

  // Topic learning (Phase 2)
  getTopicLearning: (topicId) =>
    api.get(`/api/study/topics/${topicId}/learning`),
  generateLesson: (topicId, payload = {}) =>
    api.post(`/api/study/topics/${topicId}/generate-lesson`, payload),
  generateQuestions: (topicId, payload = {}) =>
    api.post(`/api/study/topics/${topicId}/generate-questions`, payload),
  updateQuestion: (id, payload) =>
    api.patch(`/api/study/questions/${id}`, payload),
  checkQuestion: (id, payload) =>
    api.post(`/api/study/questions/${id}/check`, payload),
  generateFlashcards: (topicId, payload = {}) =>
    api.post(`/api/study/topics/${topicId}/generate-flashcards`, payload),
  updateFlashcard: (id, payload) =>
    api.patch(`/api/study/flashcards/${id}`, payload),
  deleteFlashcard: (id) => api.delete(`/api/study/flashcards/${id}`),
  createTopicMaterial: (topicId, payload) =>
    api.post(`/api/study/topics/${topicId}/materials`, payload),
  uploadMaterial: (formData, onUploadProgress) =>
    api.post("/api/study/materials/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress,
    }),
  listMaterials: (params) =>
    api.get("/api/study/materials", { params }),
  getMaterial: (id) => api.get(`/api/study/materials/${id}`),
  openMaterialFile: (id) =>
    api.get(`/api/study/materials/${id}/file`, { responseType: "blob" }),
  updateMaterial: (id, payload) =>
    api.patch(`/api/study/materials/${id}`, payload),
  deleteMaterial: (id) => api.delete(`/api/study/materials/${id}`),
  retryMaterial: (id) => api.post(`/api/study/materials/${id}/retry-processing`),
  listNotes: (topicId, params) =>
    api.get(`/api/study/topics/${topicId}/notes`, { params }),
  createNote: (topicId, payload) =>
    api.post(`/api/study/topics/${topicId}/notes`, payload),
  updateNote: (id, payload) => api.patch(`/api/study/notes/${id}`, payload),
  deleteNote: (id) => api.delete(`/api/study/notes/${id}`),
  updateTopicProgress: (topicId, payload) =>
    api.patch(`/api/study/topics/${topicId}/progress`, payload),
  topicDoubtChat: (topicId, payload) =>
    api.post(`/api/study/topics/${topicId}/doubt`, payload),

  generateTodaysPlan: (payload = {}) =>
    api.post("/api/study/plan/today", payload),
  completePlanItem: (itemId, payload = {}) =>
    api.post(`/api/study/plan/items/${itemId}/complete`, payload),
  skipPlanItem: (itemId) => api.post(`/api/study/plan/items/${itemId}/skip`),
  consistency: (params) => api.get("/api/study/consistency", { params }),
  consistencySummary: () => api.get("/api/study/consistency/summary"),

  listRevisions: (params) => api.get("/api/study/revision", { params }),
  completeRevision: (id) => api.post(`/api/study/revision/${id}/complete`),
  reviewLaterRevision: (id, days = 1) =>
    api.post(`/api/study/revision/${id}/review-later`, { days }),
  snoozeRevision: (id, days = 1) =>
    api.post(`/api/study/revision/${id}/snooze`, { days }),
  getTopicMemory: (topicId) => api.get(`/api/study/topics/${topicId}/memory`),
  deleteTopicMemory: (topicId, memoryId) =>
    api.delete(`/api/study/topics/${topicId}/memory/${memoryId}`),
  clearTopicMemory: (topicId) => api.delete(`/api/study/topics/${topicId}/memory`),
  getPreTopicReview: (topicId) =>
    api.get(`/api/study/topics/${topicId}/pre-topic-review`),
  generatePreTopicReview: (topicId, payload = {}) =>
    api.post(`/api/study/topics/${topicId}/pre-topic-review/generate`, payload),
  answerPreTopicReview: (reviewId, payload) =>
    api.post(`/api/study/pre-topic-review/${reviewId}/answer`, payload),
  completePreTopicReview: (reviewId) =>
    api.post(`/api/study/pre-topic-review/${reviewId}/complete`),
  skipPreTopicReview: (reviewId) =>
    api.post(`/api/study/pre-topic-review/${reviewId}/skip`),
};

// ── Career & Interviews ───────────────────────────────────
export const careerAPI = {
  overview: () => api.get("/api/career/overview"),
  listApplications: (params) => api.get("/api/career/applications", { params }),
  createApplication: (payload) => api.post("/api/career/applications", payload),
  getApplication: (id) => api.get(`/api/career/applications/${id}`),
  updateApplication: (id, payload) => api.patch(`/api/career/applications/${id}`, payload),
  deleteApplication: (id) => api.delete(`/api/career/applications/${id}`),
  listInterviews: (params) => api.get("/api/career/interviews", { params }),
  createInterview: (payload) => api.post("/api/career/interviews", payload),
  updateInterview: (id, payload) => api.patch(`/api/career/interviews/${id}`, payload),
  deleteInterview: (id) => api.delete(`/api/career/interviews/${id}`),
  listFollowUps: () => api.get("/api/career/follow-ups"),
  draftFollowUp: (id) => api.post(`/api/career/applications/${id}/follow-up-draft`),
  snoozeFollowUp: (id, days = 3) => api.post(`/api/career/applications/${id}/snooze-follow-up`, { days }),
  markFollowUpHandled: (id) => api.post(`/api/career/applications/${id}/mark-follow-up-handled`),
  listMemory: (params) => api.get("/api/career/memory", { params }),
  listApplicationMemory: (applicationId) => api.get(`/api/career/applications/${applicationId}/memory`),
  deleteMemory: (id) => api.delete(`/api/career/memory/${id}`),
  clearApplicationMemory: (applicationId) => api.delete(`/api/career/applications/${applicationId}/memory`),
  clearMemory: () => api.delete("/api/career/memory"),
  listDocuments: (params) => api.get("/api/career/documents", { params }),
  listDriveFiles: (params) => api.get("/api/career/drive/files", { params }),
  attachDriveDocument: (payload) => api.post("/api/career/documents/drive", payload),
  uploadDocument: (formData, onUploadProgress) =>
    api.post("/api/career/documents/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress,
    }),
  updateDocument: (id, payload) => api.patch(`/api/career/documents/${id}`, payload),
  openDocumentFile: (id) => api.get(`/api/career/documents/${id}/file`, { responseType: "blob" }),
  deleteDocument: (id) => api.delete(`/api/career/documents/${id}`),
  createJobDescription: (payload) => api.post("/api/career/job-descriptions", payload),
  resumeMatch: (id, payload = {}) => api.post(`/api/career/applications/${id}/resume-match`, payload),
  prepareInterview: (id) => api.post(`/api/career/interviews/${id}/prepare`),
  startPractice: (id, payload = {}) => api.post(`/api/career/interviews/${id}/practice`, payload),
  answerPractice: (sessionId, payload) => api.post(`/api/career/practice/${sessionId}/answer`, payload),
  emailSignals: () => api.get("/api/career/email-signals"),
  acceptEmailSignal: (id, payload) => api.post(`/api/career/email-signals/${id}/accept`, payload),
  ignoreEmailSignal: (id, payload = {}) => api.post(`/api/career/email-signals/${id}/ignore`, payload),
  listOffers: () => api.get("/api/career/offers"),
  createOffer: (payload) => api.post("/api/career/offers", payload),
  draftOfferEmail: (id, type = "clarification") => api.post(`/api/career/offers/${id}/draft-email`, { type }),
};

export function streamAgentRun(steps, sessionId, userMessage, signal) {
  const token = localStorage.getItem("token");
  return fetch(`${API_BASE}/api/agent/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ steps, sessionId, userMessage }),
    signal,
  });
}

export default api;
