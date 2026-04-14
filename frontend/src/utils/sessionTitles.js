export function buildSessionTitle(text = "") {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "New Chat";
  return trimmed.substring(0, 40) + (trimmed.length > 40 ? "..." : "");
}

export function shouldHideDraftSession(session = {}) {
  return String(session?.title || "").trim() === "New Chat";
}

export function upsertVisibleSession(sessions = [], sessionPatch = {}) {
  const sessionId = sessionPatch?.sessionId;
  if (!sessionId) return sessions;

  const existing = sessions.find((session) => session.sessionId === sessionId) || {};
  const nextSession = {
    ...existing,
    ...sessionPatch,
    updatedAt: sessionPatch.updatedAt || new Date().toISOString(),
  };

  return [
    nextSession,
    ...sessions.filter((session) => session.sessionId !== sessionId),
  ];
}
