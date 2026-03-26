"use strict";

const pendingConfirmations = new Map();

function buildKey(sessionId, tool) {
  return `${sessionId || "default"}:${tool}`;
}

function waitForConfirmation(sessionId, tool, preview = null, timeoutMs = 5 * 60 * 1000) {
  const key = buildKey(sessionId, tool);
  const existing = pendingConfirmations.get(key);

  if (existing) {
    clearTimeout(existing.timeoutId);
    existing.resolve(false);
    pendingConfirmations.delete(key);
  }

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      pendingConfirmations.delete(key);
      resolve(false);
    }, timeoutMs);

    pendingConfirmations.set(key, {
      sessionId,
      tool,
      preview,
      createdAt: new Date(),
      timeoutId,
      resolve: (approved) => {
        clearTimeout(timeoutId);
        pendingConfirmations.delete(key);
        resolve(Boolean(approved));
      },
    });
  });
}

function resolveConfirmation(sessionId, tool, approved) {
  const pending = pendingConfirmations.get(buildKey(sessionId, tool));
  if (!pending) return false;
  pending.resolve(Boolean(approved));
  return true;
}

function getPendingConfirmation(sessionId, tool) {
  return pendingConfirmations.get(buildKey(sessionId, tool)) || null;
}

module.exports = {
  waitForConfirmation,
  resolveConfirmation,
  getPendingConfirmation,
};
