import { store, resetChat } from "../stores/app";
import { sessionsAPI, filesAPI } from "../services/api";

export function useSession() {
  async function loadSessions(search = "") {
    const res = await sessionsAPI.list(search);
    store.sessions = res.data;
  }

  async function startNewChat() {
    resetChat();
    const res = await sessionsAPI.create(store.mode);
    store.currentSessionId = res.data.sessionId;
    store.messages = [];
    await loadSessions();
  }

  async function switchSession(sessionId) {
    store.currentSessionId = sessionId;
    store.chartData = null;
    store.showCanvas = false;
    store.canvasCode = "";

    const [sessionRes, filesRes] = await Promise.all([
      sessionsAPI.messages(sessionId),
      filesAPI.list(sessionId),
    ]);

    store.messages = sessionRes.data.messages || [];
    store.mode = sessionRes.data.mode || "chat";
    store.attachments = filesRes.data.map((f) => ({
      id: f.fileId,
      fileId: f.fileId,
      name: f.filename,
      type: f.fileType,
      status: "ready",
      totalChunks: f.totalChunks,
    }));
  }

  async function deleteSession(sessionId) {
    await sessionsAPI.delete(sessionId);
    if (sessionId === store.currentSessionId) await startNewChat();
    await loadSessions();
  }

  async function updateTitle(sessionId, message) {
    // title update handled by backend on first message
    // called optionally from chat composable
  }

  return { loadSessions, startNewChat, switchSession, deleteSession };
}
