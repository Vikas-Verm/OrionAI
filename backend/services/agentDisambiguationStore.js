"use strict";

const pending = new Map();

function buildKey(sessionId, tool) {
  return `${sessionId || "default"}:${tool}`;
}

function waitForDisambiguation(sessionId, tool, timeoutMs = 5 * 60 * 1000) {
  const key = buildKey(sessionId, tool);
  const existing = pending.get(key);
  if (existing) {
    clearTimeout(existing.timeoutId);
    existing.resolve(null);
    pending.delete(key);
  }

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      pending.delete(key);
      resolve(null);
    }, timeoutMs);

    pending.set(key, {
      timeoutId,
      resolve: (selection) => {
        clearTimeout(timeoutId);
        pending.delete(key);
        resolve(selection);
      },
    });
  });
}

function resolveDisambiguation(sessionId, tool, selection) {
  const entry = pending.get(buildKey(sessionId, tool));
  if (!entry) return false;
  entry.resolve(selection || null);
  return true;
}

module.exports = { waitForDisambiguation, resolveDisambiguation };
