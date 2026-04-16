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
export function streamChat(message, sessionId, webSearch = false) {
  const token = localStorage.getItem("token");
  return fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, sessionId, webSearch }),
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

export function streamAgentRun(steps, sessionId, userMessage) {
  const token = localStorage.getItem("token");
  return fetch(`${API_BASE}/api/agent/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ steps, sessionId, userMessage }),
  });
}

export default api;
