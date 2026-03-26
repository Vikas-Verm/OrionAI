import { store, resetChat } from "../stores/app";
import { sessionsAPI, filesAPI } from "../services/api";

let creatingNewChatPromise = null;

export function useSession() {
  async function loadSessions(search = "") {
    const res = await sessionsAPI.list(search);
    store.sessions = res.data;
  }

  async function startNewChat(forceCreate = false) {
    const currentSession = store.sessions.find(
      (session) => session.sessionId === store.currentSessionId
    );
    const currentIsBlankDraft =
      !!store.currentSessionId &&
      currentSession?.title === "New Chat" &&
      store.messages.length === 0 &&
      store.attachments.length === 0;

    if (!forceCreate && currentIsBlankDraft) {
      resetChat();
      return store.currentSessionId;
    }

    if (!forceCreate) {
      const blankDrafts = store.sessions.filter(
        (session) =>
          session.title === "New Chat" &&
          session.sessionId !== store.currentSessionId
      );

      for (const draft of blankDrafts) {
        try {
          const [sessionRes, filesRes] = await Promise.all([
            sessionsAPI.messages(draft.sessionId),
            filesAPI.list(draft.sessionId),
          ]);

          const draftMessages = sessionRes.data.messages || [];
          const draftFiles = filesRes.data || [];

          if (draftMessages.length === 0 && draftFiles.length === 0) {
            store.currentSessionId = draft.sessionId;
            store.messages = [];
            store.mode = sessionRes.data.mode || draft.mode || "chat";
            store.attachments = [];
            store.chartData = null;
            store.showCanvas = false;
            store.canvasCode = "";
            return draft.sessionId;
          }
        } catch {
          // Ignore stale draft candidates and continue searching.
        }
      }
    }

    if (creatingNewChatPromise) {
      return creatingNewChatPromise;
    }

    resetChat();
    creatingNewChatPromise = (async () => {
      const res = await sessionsAPI.create(store.mode);
      store.currentSessionId = res.data.sessionId;
      store.messages = [];
      await loadSessions();
      return res.data.sessionId;
    })();

    try {
      return await creatingNewChatPromise;
    } finally {
      creatingNewChatPromise = null;
    }
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
    if (sessionId === store.currentSessionId) {
      store.currentSessionId = null;
      await startNewChat(true);
    }
    await loadSessions();
  }

  async function updateTitle(sessionId, message) {
    // title update handled by backend on first message
    // called optionally from chat composable
  }

  return { loadSessions, startNewChat, switchSession, deleteSession };
}
