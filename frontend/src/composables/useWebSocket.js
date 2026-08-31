/**
 * useWebSocket.js
 * 📁 frontend/src/composables/useWebSocket.js
 *
 * Connected app counts come from the backend and reflect the current
 * source-of-truth attention state for each connected app. Notification history
 * remains local so the bell only shows what arrived recently.
 */

import { reactive, computed } from "vue";
import api from "../services/api";

const NOTIFICATION_HISTORY_LIMIT = 50;
const MAX_SEEN_ITEM_IDS = 100;
const PRIORITY_REFRESH_REASONS = new Set([
  "communication_read",
  "communication_replied",
  "communication_action_recorded",
  "gmail_read",
  "gmail_replied",
]);
const ITEM_BASED_APPS = new Set([
  "gmail",
  "slack",
  "telegram",
  "signal",
  "whatsapp",
  "google_calendar",
]);

// ── Singleton state ───────────────────────────────────────────────────────
const state = reactive({
  connected: false,

  // Live app attention counts from backend (can go up or down)
  unreadByApp: {},

  notifications: [], // history list (max 50)
  toasts: [], // active slide-in toasts
});

function normalizedAppKey(appKey = "") {
  const value = String(appKey || "").trim().toLowerCase();
  if (value === "calendar") return "google_calendar";
  return value;
}

function dedupeFingerprints(values = [], limit = MAX_SEEN_ITEM_IDS) {
  const seen = new Set();
  const result = [];
  for (const rawValue of values || []) {
    const value = String(rawValue || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  if (result.length <= limit) return result;
  return result.slice(result.length - limit);
}

function computeDisplayCount(entry = {}) {
  const rawCount = Number(entry.rawCount ?? entry.count ?? 0) || 0;
  const seenCount = Number(entry.seenCount || 0) || 0;
  if (supportsItemBasedDisplayCount(entry)) {
    const currentFingerprints = getItemFingerprints(entry?.items || []);
    if (currentFingerprints.length) {
      return computeUnseenItemCount(entry);
    }
    if (rawCount <= 0) return 0;
  }
  const unseenItemCount = computeUnseenItemCount(entry);
  if (rawCount <= 0) return unseenItemCount;
  return Math.max(rawCount - seenCount, 0);
}

function buildUnreadItemFingerprint(item = {}) {
  return String(
    item?.latestMessageId ||
      item?.messageId ||
      item?.id ||
      item?.threadId ||
      item?.chatId ||
      item?.subject ||
      item?.name ||
      ""
  ).trim();
}

function getItemFingerprints(items = []) {
  return dedupeFingerprints(
    (items || []).map((item) => buildUnreadItemFingerprint(item)).filter(Boolean)
  );
}

function supportsItemBasedDisplayCount(entry = {}) {
  return ITEM_BASED_APPS.has(normalizedAppKey(entry?.app || ""));
}

function computeUnseenItemCount(entry = {}) {
  if (!supportsItemBasedDisplayCount(entry)) return 0;

  const seenSet = new Set(
    dedupeFingerprints(Array.isArray(entry?.seenItemIds) ? entry.seenItemIds : [])
  );
  const currentFingerprints = getItemFingerprints(entry?.items || []);

  if (!currentFingerprints.length) return 0;
  if (!seenSet.size) return currentFingerprints.length;
  return currentFingerprints.filter((fingerprint) => !seenSet.has(fingerprint)).length;
}

function countNewItemFingerprints(previousItems = [], nextItems = [], seenItemIds = []) {
  const previousSet = new Set(getItemFingerprints(previousItems));
  const seenSet = new Set(dedupeFingerprints(seenItemIds));

  return getItemFingerprints(nextItems).filter(
    (fingerprint) => !previousSet.has(fingerprint) && !seenSet.has(fingerprint)
  ).length;
}

function normalizeNotificationIdentity(value = "") {
  return String(value || "").trim().toLowerCase();
}

function buildConversationIdentifierSet(detail = {}) {
  return new Set(
    [
      detail?.conversationId,
      detail?.threadId,
      detail?.chatId,
      detail?.roomId,
      detail?.dialogId,
      detail?.channelId,
      detail?.emailId,
      detail?.itemId,
      detail?.latestMessageId,
    ]
      .map((value) => normalizeNotificationIdentity(value))
      .filter(Boolean)
  );
}

function itemMatchesConversation(item = {}, identifiers = new Set()) {
  if (!identifiers.size) return false;
  return [
    item?.id,
    item?.conversationId,
    item?.threadId,
    item?.chatId,
    item?.roomId,
    item?.dialogId,
    item?.channelId,
    item?.emailId,
    item?.latestMessageId,
    item?.messageId,
  ]
    .map((value) => normalizeNotificationIdentity(value))
    .filter(Boolean)
    .some((value) => identifiers.has(value));
}

function buildNotificationEventId(app, items = []) {
  const itemKey = (items || [])
    .map((item) => item.latestMessageId || item.messageId || item.id)
    .filter(Boolean)
    .join("|");
  return `${app}:${itemKey || Date.now()}`;
}

function buildNotificationGroupKey(app, items = []) {
  if (app !== "telegram") return null;
  const firstItem = Array.isArray(items) ? items[0] || null : null;
  const actorKey = normalizeNotificationIdentity(
    firstItem?.senderKey ||
      firstItem?.chatId ||
      firstItem?.id ||
      firstItem?.name
  );
  return actorKey ? `${app}:${actorKey}` : null;
}

function buildNotificationSenderName(app, items = [], existingSenderName = "") {
  if (app !== "telegram") return existingSenderName || "";
  const firstItem = Array.isArray(items) ? items[0] || null : null;
  return String(firstItem?.name || existingSenderName || "").trim();
}

function buildHistorySummary({
  app,
  items = [],
  count = 1,
  fallbackSummary = "",
  senderName = "",
}) {
  if (app !== "telegram") return fallbackSummary;

  const firstItem = Array.isArray(items) ? items[0] || null : null;
  const preview = String(firstItem?.preview || "").trim();
  const label = senderName || firstItem?.name || "Unknown";

  if (count <= 1 && preview) return preview;
  return `Messages from ${label}: ${count} messages`;
}

const APP_META = {
  gmail: { label: "Gmail", icon: "📧", color: "#EA4335", route: "gmail" },
  slack: { label: "Slack", icon: "💬", color: "#E01E5A", route: "slack" },
  telegram: { label: "Telegram", icon: "✈️", color: "#229ED9", route: "telegram" },
  signal: { label: "Signal", icon: "🛡️", color: "#3b82f6", route: "signal" },
  whatsapp: { label: "WhatsApp", icon: "🟢", color: "#25D366", route: "whatsapp" },
  google_calendar: { label: "Calendar", icon: "📅", color: "#1a73e8", route: "google_calendar" },
};

const PRIORITY_COLOR = {
  urgent: "#ef4444",
  normal: "#6366f1",
  info: "#64748b",
};

let ws = null;
let reconnectTimer = null;
let pingInterval = null;
let unreadSyncTimer = null;
let isStarted = false;
let activeUserKey = null;
let activeToken = null;
let refreshListenerAttached = false;
const pendingCbs = new Map();

function getPersistedStateKey(userKey) {
  return `orion:websocket-state:${userKey}`;
}

function restorePersistedState(userKey) {
  if (!userKey) return null;
  try {
    const raw = localStorage.getItem(getPersistedStateKey(userKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      notifications: Array.isArray(parsed.notifications)
        ? parsed.notifications.slice(0, NOTIFICATION_HISTORY_LIMIT).map((entry) => ({
            ...entry,
            time: entry.time || new Date().toISOString(),
            read: Boolean(entry.read),
          }))
        : [],
      seenByApp:
        parsed.seenByApp && typeof parsed.seenByApp === "object"
          ? parsed.seenByApp
          : {},
      seenItemIdsByApp:
        parsed.seenItemIdsByApp && typeof parsed.seenItemIdsByApp === "object"
          ? parsed.seenItemIdsByApp
          : {},
    };
  } catch {
    return null;
  }
}

function persistState() {
  if (!activeUserKey) return;
  try {
    const seenByApp = {};
    const seenItemIdsByApp = {};
    for (const [appKey, entry] of Object.entries(state.unreadByApp)) {
      seenByApp[appKey] = Number(entry?.seenCount || 0) || 0;
      if (Array.isArray(entry?.seenItemIds) && entry.seenItemIds.length) {
        seenItemIdsByApp[appKey] = dedupeFingerprints(entry.seenItemIds);
      }
    }

    localStorage.setItem(
      getPersistedStateKey(activeUserKey),
      JSON.stringify({
        notifications: state.notifications
          .slice(0, NOTIFICATION_HISTORY_LIMIT)
          .map((entry) => ({
            ...entry,
            time:
              entry.time instanceof Date
                ? entry.time.toISOString()
                : entry.time || new Date().toISOString(),
          })),
        seenByApp,
        seenItemIdsByApp,
      })
    );
  } catch (err) {
    console.debug("Failed to persist websocket state:", err?.message || err);
  }
}

function resetState() {
  state.connected = false;
  Object.keys(state.unreadByApp).forEach((key) => delete state.unreadByApp[key]);
  state.notifications.splice(0, state.notifications.length);
  state.toasts.splice(0, state.toasts.length);
}

// ── Computed ──────────────────────────────────────────────────────────────

// Total current attention count from the live backend signals
const totalUnread = computed(() =>
  Object.values(state.unreadByApp).reduce(
    (s, a) => s + ((a?.displayCount ?? a?.count) || 0),
    0
  )
);

const unreadNotifCount = computed(() => state.notifications.filter((n) => !n.read).length);

const hasUrgent = computed(() =>
  state.notifications.some((n) => !n.read && n.priority === "urgent")
);

// ─────────────────────────────────────────────────────────────────────────────
export function useWebSocket() {
  // ── WebSocket connect ─────────────────────────────────────────────────────
  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    const base = (api.defaults.baseURL || "http://localhost:3000")
      .replace("https://", "wss://")
      .replace("http://", "ws://");

    ws = new WebSocket(`${base}/ws?token=${token}`);

    ws.onopen = () => {
      state.connected = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 30_000);
    };

    ws.onmessage = (e) => {
      try {
        handleMessage(JSON.parse(e.data));
      } catch {
        console.log("Failed to parse WS message:");
      }
    };

    ws.onclose = () => {
      state.connected = false;
      clearInterval(pingInterval);
      if (isStarted) reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws?.close();
  }

  // ── Handle incoming WS messages ───────────────────────────────────────────
  function handleMessage(msg) {
    switch (msg.type) {
      case "pong":
        break;
      case "connected":
        break;

      case "notification_update":
        processUpdates(msg.updates || []);
        break;

      case "telegram_sent":
      case "slack_sent": {
        const cb = pendingCbs.get(msg.reqId);
        if (cb) {
          cb.resolve(msg);
          pendingCbs.delete(msg.reqId);
        }
        break;
      }

      case "error": {
        const cb = pendingCbs.get(msg.reqId);
        if (cb) {
          cb.reject(new Error(msg.error));
          pendingCbs.delete(msg.reqId);
        }
        break;
      }

      default:
        document.dispatchEvent(
          new CustomEvent(`ws:${msg.type}`, {
            detail: msg,
            bubbles: true,
          })
        );
    }
  }

  // ── Process notification updates from backend ─────────────────────────────
  function processUpdates(updates) {
    for (const update of updates) {
      const { app, count, items, summary, ai, isNew, newCount, isFirst } = update;
      const normalizedApp = normalizedAppKey(app);
      const currentEntry = state.unreadByApp[normalizedApp] || {};
      const previousRawCount = Number(
        currentEntry.rawCount ?? currentEntry.count ?? 0
      ) || 0;
      const previousItems = Array.isArray(currentEntry.items)
        ? currentEntry.items
        : [];
      const previousSeenItemIds = Array.isArray(currentEntry.seenItemIds)
        ? currentEntry.seenItemIds
        : [];
      const itemBasedApp = supportsItemBasedDisplayCount({ app: normalizedApp });
      const countIncrease = !isFirst && Math.max((Number(count) || 0) - previousRawCount, 0);
      const detectedNewCount =
        itemBasedApp &&
        !isFirst &&
        (previousItems.length > 0 || previousRawCount <= 0)
          ? countNewItemFingerprints(previousItems, items || [], previousSeenItemIds)
          : 0;
      const effectiveIsNew = itemBasedApp
        ? Boolean(isNew || detectedNewCount > 0 || countIncrease > 0)
        : Boolean(isNew || detectedNewCount > 0 || countIncrease > 0);
      const effectiveNewCount = effectiveIsNew
        ? Math.max(Number(newCount || 0) || 0, detectedNewCount, countIncrease)
        : 0;

      // Always update the live backend count (used for connected app state)
      if (!state.unreadByApp[normalizedApp]) state.unreadByApp[normalizedApp] = {};
      state.unreadByApp[normalizedApp].app = normalizedApp;
      state.unreadByApp[normalizedApp].rawCount = count;
      if (!Number.isFinite(Number(state.unreadByApp[normalizedApp].seenCount))) {
        state.unreadByApp[normalizedApp].seenCount = 0;
      }
      if (!Array.isArray(state.unreadByApp[normalizedApp].seenItemIds)) {
        state.unreadByApp[normalizedApp].seenItemIds = [];
      }
      if ((Number(count) || 0) <= 0) {
        state.unreadByApp[normalizedApp].seenCount = 0;
      }
      state.unreadByApp[normalizedApp].count = count;
      state.unreadByApp[normalizedApp].items = Array.isArray(items) ? items : [];
      state.unreadByApp[normalizedApp].seenItemIds = dedupeFingerprints(
        state.unreadByApp[normalizedApp].seenItemIds
      );
      state.unreadByApp[normalizedApp].displayCount = computeDisplayCount(
        state.unreadByApp[normalizedApp]
      );
      state.unreadByApp[normalizedApp].summary =
        state.unreadByApp[normalizedApp].displayCount > 0
          ? summary || ai?.summary || state.unreadByApp[normalizedApp].summary || null
          : null;
      state.unreadByApp[normalizedApp].ai = ai || null;

      if (isFirst) continue; // no toast/history on first load

      // New messages arrived AFTER first load — add to inbox and notify
      if (effectiveIsNew && effectiveNewCount > 0 && !isFirst) {
        const meta = APP_META[normalizedApp];
        if (!meta) continue;
        const shouldTriggerBriefingRefresh =
          Number(update.highSignalCount || 0) > 0 ||
          (normalizedApp === "gmail" && (ai?.priority || "normal") !== "info") ||
          ["slack", "telegram", "signal", "whatsapp", "google_calendar"].includes(normalizedApp);

        const color = ai?.priority ? PRIORITY_COLOR[ai.priority] : meta.color;
        const eventId = buildNotificationEventId(normalizedApp, items);
        const groupKey = buildNotificationGroupKey(normalizedApp, items);
        const senderName = buildNotificationSenderName(normalizedApp, items);
        const fallbackSummary =
          ai?.summary || `${effectiveNewCount} new in ${meta.label}`;
        const existingIndex =
          normalizedApp === "telegram" && groupKey
            ? state.notifications.findIndex((entry) => entry.groupKey === groupKey)
            : state.notifications.findIndex((entry) => entry.id === eventId);
        const existingEntry = existingIndex !== -1 ? state.notifications[existingIndex] : null;

        if (existingIndex !== -1) {
          state.notifications.splice(existingIndex, 1);
        }

        const mergedCount =
          normalizedApp === "telegram" && existingEntry
            ? Number(existingEntry.count || 0) + effectiveNewCount
            : effectiveNewCount;
        const notificationId =
          normalizedApp === "telegram" && groupKey ? groupKey : eventId;
        const notificationSummary = buildHistorySummary({
          app: normalizedApp,
          items,
          count: mergedCount,
          fallbackSummary,
          senderName: senderName || existingEntry?.senderName || "",
        });

        // Add to notification history
        state.notifications.unshift({
          ...(existingEntry || {}),
          id: notificationId,
          groupKey: groupKey || null,
          app: normalizedApp,
          icon: meta.icon,
          color,
          label: meta.label,
          count: mergedCount,
          summary: notificationSummary,
          priority: ai?.priority || "normal",
          action: ai?.action || "Open",
          route: meta.route,
          items: items || [],
          time: new Date(),
          read: false,
          highSignal: shouldTriggerBriefingRefresh,
          senderName: senderName || existingEntry?.senderName || "",
        });
        if (state.notifications.length > NOTIFICATION_HISTORY_LIMIT) {
          state.notifications.splice(NOTIFICATION_HISTORY_LIMIT);
        }
        // ── TOAST — add to array and auto-dismiss ────────────────────────
        const toastItem = {
          id: eventId,
          app: normalizedApp,
          icon: meta.icon,
          color,
          label: meta.label,
          count: effectiveNewCount,
          summary: fallbackSummary,
          priority: ai?.priority || "normal",
          action: ai?.action || "Open",
          route: meta.route,
        };
        state.toasts.splice(state.toasts.length, 0, toastItem);

        const duration = ai?.priority === "urgent" ? 10_000 : 6_000;
        setTimeout(() => {
          const i = state.toasts.findIndex((t) => t.id === eventId);
          if (i !== -1) state.toasts.splice(i, 1);
        }, duration);
        setTimeout(() => dismissToast(eventId), duration);

        // Browser notification
        showBrowserNotif(normalizedApp, ai, effectiveNewCount, meta);

        if (shouldTriggerBriefingRefresh) {
          document.dispatchEvent(
            new CustomEvent("orion:priority-refresh-needed", {
              detail: {
                reason: "incoming_high_signal",
                sourceApp: normalizedApp,
                count: Number(update.highSignalCount || effectiveNewCount || 1),
                summary:
                  ai?.summary ||
                  summary ||
                  `${effectiveNewCount} new item${effectiveNewCount === 1 ? "" : "s"}`,
              },
            })
          );
        }
      }
    }

    persistState();
  }

  async function refreshUnreadState({ isFirst = false } = {}) {
    const { data } = await api.get("/api/notifications/unread", {
      params: { _: Date.now() },
      headers: { "Cache-Control": "no-cache" },
    });

    const updates = Object.entries(data.apps || {}).map(([appKey, appData]) => ({
      app: appKey,
      count: Number(appData?.count || 0) || 0,
      items: Array.isArray(appData?.previews) ? appData.previews : [],
      summary: appData?.summary || null,
      ai: null,
      isNew: false,
      newCount: 0,
      highSignalCount: 0,
      isFirst,
    }));

    processUpdates(updates);
    return data;
  }

  function acknowledgeConversation(appKey, detail = {}) {
    const normalized = normalizedAppKey(appKey);
    if (!normalized) return;

    const entry = state.unreadByApp[normalized];
    const identifiers = buildConversationIdentifierSet(detail);
    if (!entry || !identifiers.size) return;

    const currentItems = Array.isArray(entry.items) ? entry.items : [];
    const matchedItems = currentItems.filter((item) =>
      itemMatchesConversation(item, identifiers)
    );
    if (!matchedItems.length) return;

    const matchedFingerprints = dedupeFingerprints(
      matchedItems.map((item) => buildUnreadItemFingerprint(item)).filter(Boolean)
    );
    if (!matchedFingerprints.length) return;

    entry.seenCount = Math.min(
      Number(entry.rawCount ?? entry.count ?? 0) || 0,
      (Number(entry.seenCount || 0) || 0) + matchedFingerprints.length
    );
    entry.seenItemIds = dedupeFingerprints([
      ...(Array.isArray(entry.seenItemIds) ? entry.seenItemIds : []),
      ...matchedFingerprints,
    ]);
    entry.items = currentItems.filter(
      (item) => !matchedFingerprints.includes(buildUnreadItemFingerprint(item))
    );
    entry.displayCount = computeDisplayCount(entry);
    if (entry.displayCount <= 0) {
      entry.summary = null;
    }

    for (const notification of state.notifications) {
      if (notification.app !== normalized && notification.route !== normalized) continue;
      if (
        Array.isArray(notification.items) &&
        notification.items.some((item) => itemMatchesConversation(item, identifiers))
      ) {
        notification.read = true;
      }
    }

    persistState();
  }

  function handlePriorityRefreshEvent(event) {
    const detail = event?.detail || {};
    const reason = String(detail.reason || "").trim();
    if (!PRIORITY_REFRESH_REASONS.has(reason)) return;

    const appKey =
      detail.sourceApp ||
      (reason.startsWith("gmail_") ? "gmail" : "");
    if (!appKey) return;
    acknowledgeConversation(appKey, detail);
  }

  function showBrowserNotif(app, ai, count, meta) {
    if (Notification.permission !== "granted") return;
    try {
      const n = new Notification(
        `${ai?.priority === "urgent" ? "🔴 " : ""}${meta.icon} ${meta.label}`,
        { body: ai?.summary || `${count} new message${count > 1 ? "s" : ""}`, tag: app }
      );
      n.onclick = () => {
        window.focus();
        document.dispatchEvent(
          new CustomEvent("orion:open-module", {
            bubbles: true,
            detail: { module: meta.route },
          })
        );
        n.close();
      };
    } catch {
      console.error("Failed to show notification");
    }
  }

  // ── Toast helpers ─────────────────────────────────────────────────────────
  function dismissToast(id) {
    const i = state.toasts.findIndex((t) => t.id === id);
    if (i !== -1) state.toasts.splice(i, 1);
  }

  function markRead(id) {
    const n = state.notifications.find((n) => n.id === id);
    if (n) {
      n.read = true;
      persistState();
    }
  }

  function dismissNotification(id) {
    const index = state.notifications.findIndex((n) => n.id === id);
    if (index !== -1) {
      state.notifications.splice(index, 1);
      persistState();
    }
  }

  function markAllRead() {
    state.notifications.forEach((n) => (n.read = true));
    persistState();
  }

  // ── Mark app as seen — clears recent notification history for that app ────
  function markSeen(appKey) {
    const normalized = normalizedAppKey(appKey);
    state.notifications.forEach((n) => {
      if (n.app === normalized || n.route === appKey || n.route === normalized) {
        n.read = true;
      }
    });
    const entry = state.unreadByApp[normalized];
    if (entry) {
      entry.seenCount = Number(entry.rawCount ?? entry.count ?? 0) || 0;
      entry.seenItemIds = Array.isArray(entry.items)
        ? dedupeFingerprints(
            entry.items
              .map((item) => buildUnreadItemFingerprint(item))
              .filter(Boolean)
          )
        : [];
      entry.displayCount = 0;
      entry.summary = null;
    }
    persistState();
  }

  // ── Send helpers ──────────────────────────────────────────────────────────
  function wsSend(payload) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }
      const reqId = `${Date.now()}-${Math.random()}`;
      pendingCbs.set(reqId, { resolve, reject });
      ws.send(JSON.stringify({ ...payload, reqId }));
      setTimeout(() => {
        if (pendingCbs.has(reqId)) {
          pendingCbs.delete(reqId);
          reject(new Error("WebSocket request timed out"));
        }
      }, 10_000);
    });
  }

  function sendTelegram(contact, message) {
    return wsSend({ type: "send_telegram", contact, message });
  }
  function sendSlack(channel, message) {
    return wsSend({ type: "send_slack", channel, message });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async function start() {
    const token = localStorage.getItem("token");
    const currentUser =
      JSON.parse(localStorage.getItem("user") || "null")?.username || null;

    if (!token || !currentUser) {
      stop();
      return;
    }

    if (
      activeUserKey &&
      (activeUserKey !== currentUser || (activeToken && activeToken !== token))
    ) {
      stop();
    }

    if (isStarted && activeUserKey === currentUser && activeToken === token) return;

    isStarted = true;
    activeUserKey = currentUser;
    activeToken = token;
    resetState();

    const restored = restorePersistedState(currentUser);
    if (restored?.notifications?.length) {
      state.notifications.splice(0, state.notifications.length, ...restored.notifications);
    }
    if (restored?.seenByApp) {
      for (const [appKey, seenCount] of Object.entries(restored.seenByApp)) {
        if (!state.unreadByApp[appKey]) state.unreadByApp[appKey] = {};
        state.unreadByApp[appKey].seenCount = Number(seenCount || 0) || 0;
      }
    }
    if (restored?.seenItemIdsByApp) {
      for (const [appKey, seenItemIds] of Object.entries(restored.seenItemIdsByApp)) {
        if (!state.unreadByApp[appKey]) state.unreadByApp[appKey] = {};
        state.unreadByApp[appKey].seenItemIds = Array.isArray(seenItemIds)
          ? dedupeFingerprints(seenItemIds)
          : [];
      }
    }

    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    // REST call for immediate badge population on page load
    try {
      await refreshUnreadState({ isFirst: true });
    } catch {
      console.error("Failed to fetch initial unread counts");
    }

    if (unreadSyncTimer) {
      clearInterval(unreadSyncTimer);
    }
    unreadSyncTimer = setInterval(() => {
      refreshUnreadState().catch(() => {});
    }, 30000);

    if (!refreshListenerAttached) {
      document.addEventListener(
        "orion:priority-refresh-needed",
        handlePriorityRefreshEvent
      );
      refreshListenerAttached = true;
    }

    connect();
  }

  function stop() {
    isStarted = false;
    activeUserKey = null;
    activeToken = null;
    clearInterval(pingInterval);
    clearInterval(unreadSyncTimer);
    clearTimeout(reconnectTimer);
    unreadSyncTimer = null;
    ws?.close();
    ws = null;
    pendingCbs.clear();
    if (refreshListenerAttached) {
      document.removeEventListener(
        "orion:priority-refresh-needed",
        handlePriorityRefreshEvent
      );
      refreshListenerAttached = false;
    }
    resetState();
  }

  // Backward compat aliases
  const startPolling = start;
  const stopPolling = stop;

  return {
    // State
    connected: state.connected,
    unreadByApp: state.unreadByApp,
    totalUnread,
    unreadNotifCount,
    hasUrgent,
    toasts: state.toasts,
    notifications: state.notifications,

    // Actions
    start,
    stop,
    startPolling,
    stopPolling,
    sendTelegram,
    sendSlack,
    markSeen,
    acknowledgeConversation,
    refreshUnreadState,
    dismissToast,
    markRead,
    dismissNotification,
    markAllRead,
  };
}
