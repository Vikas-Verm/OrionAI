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

function computeDisplayCount(entry = {}) {
  const rawCount = Number(entry.rawCount ?? entry.count ?? 0) || 0;
  const seenCount = Number(entry.seenCount || 0) || 0;
  if (rawCount <= 0) return 0;
  return Math.max(rawCount - seenCount, 0);
}

const APP_META = {
  gmail: { label: "Gmail", icon: "📧", color: "#EA4335", route: "gmail" },
  slack: { label: "Slack", icon: "💬", color: "#E01E5A", route: "slack" },
  telegram: { label: "Telegram", icon: "✈️", color: "#229ED9", route: "telegram" },
};

const PRIORITY_COLOR = {
  urgent: "#ef4444",
  normal: "#6366f1",
  info: "#64748b",
};

let ws = null;
let reconnectTimer = null;
let pingInterval = null;
let isStarted = false;
let activeUserKey = null;
const pendingCbs = new Map();

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

      // Always update the live backend count (used for connected app state)
      if (!state.unreadByApp[app]) state.unreadByApp[app] = {};
      state.unreadByApp[app].rawCount = count;
      if (!Number.isFinite(Number(state.unreadByApp[app].seenCount))) {
        state.unreadByApp[app].seenCount = 0;
      }
      if ((Number(count) || 0) <= 0) {
        state.unreadByApp[app].seenCount = 0;
      }
      state.unreadByApp[app].count = count;
      state.unreadByApp[app].displayCount = computeDisplayCount(
        state.unreadByApp[app]
      );
      state.unreadByApp[app].items = items;
      state.unreadByApp[app].summary =
        state.unreadByApp[app].displayCount > 0
          ? summary || ai?.summary || state.unreadByApp[app].summary || null
          : null;
      state.unreadByApp[app].ai = ai || null;

      if (isFirst) continue; // no toast/history on first load

      // New messages arrived AFTER first load — add to inbox and notify
      if (isNew && newCount > 0 && !isFirst) {
        const meta = APP_META[app];
        if (!meta) continue;

        const color = ai?.priority ? PRIORITY_COLOR[ai.priority] : meta.color;
        const id = Date.now() + Math.random();

        // Add to notification history
        state.notifications.unshift({
          id,
          app,
          icon: meta.icon,
          color,
          label: meta.label,
          count: newCount,
          summary: ai?.summary || `${newCount} new in ${meta.label}`,
          priority: ai?.priority || "normal",
          action: ai?.action || "Open",
          route: meta.route,
          items: items || [],
          time: new Date(),
          read: false,
        });
        if (state.notifications.length > 50) state.notifications.splice(50);
        // ── TOAST — add to array and auto-dismiss ────────────────────────
        const toastItem = {
          id,
          app,
          icon: meta.icon,
          color,
          label: meta.label,
          count: newCount,
          summary: ai?.summary || `${newCount} new in ${meta.label}`,
          priority: ai?.priority || "normal",
          action: ai?.action || "Open",
          route: meta.route,
        };
        state.toasts.splice(state.toasts.length, 0, toastItem);

        const duration = ai?.priority === "urgent" ? 10_000 : 6_000;
        setTimeout(() => {
          const i = state.toasts.findIndex((t) => t.id === id);
          if (i !== -1) state.toasts.splice(i, 1);
        }, duration);
        setTimeout(() => dismissToast(id), duration);

        // Browser notification
        showBrowserNotif(app, ai, newCount, meta);
      }
    }
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
    if (n) n.read = true;
  }

  function markAllRead() {
    state.notifications.forEach((n) => (n.read = true));
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
      entry.displayCount = 0;
      entry.summary = null;
    }
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

    if (activeUserKey && activeUserKey !== currentUser) {
      stop();
    }

    if (isStarted && activeUserKey === currentUser) return;

    isStarted = true;
    activeUserKey = currentUser;
    resetState();

    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    // REST call for immediate badge population on page load
    try {
      const { data } = await api.get("/api/notifications/unread", {
        params: { _: Date.now() },
        headers: { "Cache-Control": "no-cache" },
      });
      for (const [appKey, appData] of Object.entries(data.apps || {})) {
        state.unreadByApp[appKey] = {
          rawCount: appData?.count || 0,
          count: appData?.count || 0,
          displayCount: appData?.count || 0,
          seenCount: 0,
          items: appData.previews || [],
          summary: appData.summary || null,
          ai: null,
        };
      }
    } catch {
      console.error("Failed to fetch initial unread counts");
    }

    connect();
  }

  function stop() {
    isStarted = false;
    activeUserKey = null;
    clearInterval(pingInterval);
    clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
    pendingCbs.clear();
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
    dismissToast,
    markRead,
    markAllRead,
  };
}
