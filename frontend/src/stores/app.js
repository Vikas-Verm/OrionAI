import { reactive, computed } from "vue";

export const store = reactive({
  // Auth
  token: localStorage.getItem("token"),
  user: JSON.parse(localStorage.getItem("user") || "null"),

  // Mode
  mode: "chat",
  webMode: false,

  // Session
  sessions: [],
  currentSessionId: null,
  messages: [],
  loading: false,

  // Attachments
  attachments: [],

  // RAG
  documentIngested: false,
  chunkCount: 0,
  ingestedFileName: "",

  // Canvas
  showCanvas: false,
  canvasCode: "",
  canvasLang: "",

  // Chart
  chartData: null,
});

// ── Computed helpers ──────────────────────────────────────
export const isLoggedIn = computed(() => !!store.token && !!store.user);

export const greeting = computed(() => {
  const h = new Date().getHours();
  const name = store.user?.username || "there";
  if (h < 5) return `Hello, ${name}`;
  if (h < 12) return `Good Morning, ${name}`;
  if (h < 17) return `Good Afternoon, ${name}`;
  return `Good Evening, ${name}`;
});

export const inputPlaceholder = computed(() => {
  if (store.webMode) return "Search the web...";
  if (store.mode === "rag" && !store.documentIngested) return "Ingest a document first...";
  if (store.mode === "db") return "Ask about your business data...";
  if (store.mode === "agent") return "What would you like me to do?";
  return "Ask a question...";
});

// ── Auth actions ──────────────────────────────────────────
export function setAuth(token, user) {
  store.token = token;
  store.user = user;
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
}

export function clearAuth() {
  store.token = null;
  store.user = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  store.sessions = [];
  store.messages = [];
  store.currentSessionId = null;
  store.attachments = [];
}

export function setMode(mode) {
  store.mode = mode;
  if (mode !== "chat" && mode !== "agent") store.webMode = false;
}

export function toggleWebMode() {
  store.webMode = !store.webMode;
  store.mode = "chat";
}

export function resetCanvas() {
  store.showCanvas = false;
  store.canvasCode = "";
  store.canvasLang = "";
}

export function resetChat() {
  store.messages = [];
  store.attachments = [];
  store.chartData = null;
  resetCanvas();
}
