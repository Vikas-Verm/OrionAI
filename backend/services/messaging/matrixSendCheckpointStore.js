"use strict";

const CHECKPOINT_SEND_STATUSES = Object.freeze({
  MATRIX_ACCEPTED: "MATRIX_ACCEPTED",
  BRIDGE_RECEIVED: "BRIDGE_RECEIVED",
  REMOTE_SENT: "REMOTE_SENT",
  REMOTE_FAILED: "REMOTE_FAILED",
  REMOTE_TIMEOUT: "REMOTE_TIMEOUT",
});

const DEFAULT_TTL_MS = 45_000;
const pendingSends = new Map();
let cleanupTimer = null;

function normalizeString(value = "") {
  return String(value || "").trim();
}

function nowMs() {
  return Date.now();
}

function scheduleCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setTimeout(() => {
    cleanupTimer = null;
    cleanupExpired();
  }, 10_000);
  if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();
}

function cleanupExpired() {
  const current = nowMs();
  for (const [eventId, entry] of pendingSends.entries()) {
    if (entry.expiresAt <= current) {
      if (entry.timeout) clearTimeout(entry.timeout);
      pendingSends.delete(eventId);
      entry.resolve?.({
        status: CHECKPOINT_SEND_STATUSES.REMOTE_TIMEOUT,
        matrixAccepted: true,
        remoteSent: false,
        timedOut: true,
      });
    }
  }
  if (pendingSends.size > 0) scheduleCleanup();
}

function normalizeStep(step = "") {
  return normalizeString(step).toUpperCase();
}

function normalizePayload(raw = {}) {
  const payload = raw && typeof raw === "object" ? raw : {};
  const eventId = normalizeString(
    payload.event_id ||
      payload.eventID ||
      payload.eventId ||
      payload.event?.event_id ||
      payload.message?.event_id
  );
  const roomId = normalizeString(
    payload.room_id ||
      payload.roomID ||
      payload.roomId ||
      payload.event?.room_id ||
      payload.message?.room_id
  );
  const step = normalizeStep(payload.step || payload.checkpoint_step);
  const status = normalizeString(
    payload.status || payload.event_status || payload.checkpoint_status
  ).toUpperCase();
  const success =
    payload.success === true ||
    status === "SUCCESS" ||
    status === "OK" ||
    status === "SENT" ||
    status === "DELIVERED";
  const failed =
    payload.success === false ||
    Boolean(payload.error || payload.errcode) ||
    [
      "FAIL",
      "FAILED",
      "FAILURE",
      "PERM_FAILURE",
      "UNSUPPORTED",
      "TIMEOUT",
      "DELIVERY_FAILED",
    ].includes(status);

  return {
    eventId,
    roomId,
    step,
    status,
    success,
    failed,
    errorCode: normalizeString(payload.errcode || payload.error_code),
    error: payload.error ? normalizeString(payload.error).slice(0, 180) : "",
    timestamp: normalizeString(payload.timestamp || payload.ts),
  };
}

function statusFromCheckpoint(checkpoint = {}) {
  if (checkpoint.step === "REMOTE" && checkpoint.failed) {
    return CHECKPOINT_SEND_STATUSES.REMOTE_FAILED;
  }
  if (checkpoint.step === "REMOTE" && checkpoint.success) {
    return CHECKPOINT_SEND_STATUSES.REMOTE_SENT;
  }
  if (checkpoint.failed) return CHECKPOINT_SEND_STATUSES.REMOTE_FAILED;
  if (checkpoint.step === "BRIDGE" && checkpoint.success) {
    return CHECKPOINT_SEND_STATUSES.BRIDGE_RECEIVED;
  }
  return "";
}

function createPendingSend({
  provider,
  userId,
  connectionId = "",
  roomId,
  eventId,
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  const normalizedEventId = normalizeString(eventId);
  const normalizedRoomId = normalizeString(roomId);
  if (!normalizedEventId || !normalizedRoomId) {
    throw new Error("eventId and roomId are required for checkpoint tracking.");
  }

  const expiresAt = nowMs() + Math.max(1_000, Number(ttlMs || DEFAULT_TTL_MS));
  const promise = new Promise((resolve) => {
    const timeout = setTimeout(() => {
      const entry = pendingSends.get(normalizedEventId);
      if (!entry) return;
      pendingSends.delete(normalizedEventId);
      resolve({
        status: CHECKPOINT_SEND_STATUSES.REMOTE_TIMEOUT,
        matrixAccepted: true,
        remoteSent: false,
        timedOut: true,
      });
    }, Math.max(1_000, Number(ttlMs || DEFAULT_TTL_MS)));

    pendingSends.set(normalizedEventId, {
      provider: normalizeString(provider),
      userId: normalizeString(userId),
      connectionId: normalizeString(connectionId),
      roomId: normalizedRoomId,
      eventId: normalizedEventId,
      status: CHECKPOINT_SEND_STATUSES.MATRIX_ACCEPTED,
      checkpoints: [],
      createdAt: nowMs(),
      expiresAt,
      resolve,
      timeout,
    });
  });

  scheduleCleanup();
  return {
    eventId: normalizedEventId,
    expiresAt,
    promise,
  };
}

function recordCheckpoint(rawPayload = {}) {
  const checkpoint = normalizePayload(rawPayload);
  if (!checkpoint.eventId || !checkpoint.roomId || !checkpoint.step) {
    return {
      accepted: false,
      reason: "malformed_checkpoint",
      checkpoint,
    };
  }

  const entry = pendingSends.get(checkpoint.eventId);
  if (!entry) {
    return {
      accepted: false,
      reason: "unknown_event",
      checkpoint,
    };
  }

  if (entry.roomId !== checkpoint.roomId || entry.provider !== "whatsapp") {
    return {
      accepted: false,
      reason: "checkpoint_mismatch",
      checkpoint,
    };
  }

  entry.checkpoints.push({
    step: checkpoint.step,
    status: checkpoint.status,
    success: checkpoint.success,
    failed: checkpoint.failed,
    errorCode: checkpoint.errorCode,
    error: checkpoint.error,
    receivedAt: nowMs(),
  });

  const nextStatus = statusFromCheckpoint(checkpoint);
  if (nextStatus) entry.status = nextStatus;

  if (
    nextStatus === CHECKPOINT_SEND_STATUSES.REMOTE_SENT ||
    nextStatus === CHECKPOINT_SEND_STATUSES.REMOTE_FAILED
  ) {
    if (entry.timeout) clearTimeout(entry.timeout);
    pendingSends.delete(checkpoint.eventId);
    entry.resolve?.({
      status: nextStatus,
      matrixAccepted: true,
      remoteSent: nextStatus === CHECKPOINT_SEND_STATUSES.REMOTE_SENT,
      errorCode: checkpoint.errorCode,
      error: checkpoint.error,
    });
  }

  return {
    accepted: true,
    reason: "recorded",
    status: entry.status,
    provider: entry.provider,
    userId: entry.userId,
    connectionId: entry.connectionId,
    roomId: entry.roomId,
    eventId: entry.eventId,
    checkpoint,
  };
}

function getPendingCount() {
  cleanupExpired();
  return pendingSends.size;
}

function resetForTests() {
  for (const entry of pendingSends.values()) {
    if (entry.timeout) clearTimeout(entry.timeout);
  }
  pendingSends.clear();
  if (cleanupTimer) clearTimeout(cleanupTimer);
  cleanupTimer = null;
}

module.exports = {
  CHECKPOINT_SEND_STATUSES,
  DEFAULT_TTL_MS,
  createPendingSend,
  recordCheckpoint,
  normalizePayload,
  getPendingCount,
  resetForTests,
};
