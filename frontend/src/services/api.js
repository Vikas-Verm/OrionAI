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
