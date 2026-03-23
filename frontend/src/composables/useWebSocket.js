/**
 * useWebSocket.js
 * 📁 frontend/src/composables/useWebSocket.js
 *
 * Key fixes in this version:
 * 1. Local "inbox" — notifications accumulate until user explicitly reads them.
 *    Badge does NOT clear just because backend poll returns 0 (Telegram marks
 *    messages as read when fetched — this was causing the 2s disappearance).
 * 2. newMessages map tracks unseen counts per app independently from backend.
 */

import { reactive, computed } from "vue";
import api from "../services/api";

// ── Singleton state ───────────────────────────────────────────────────────
const state = reactive({
  connected: false,

  // Live unread counts from backend (can go up or down)
  unreadByApp: {},

  // LOCAL inbox — only cleared when user explicitly opens the app
  // This is what drives the sidebar badge and notification bell count
  // It ACCUMULATES and never auto-clears from backend polling
  inbox: {}, // { gmail: { count: N, summary, ai }, telegram: {}, slack: {} }

  notifications: [], // history list (max 50)
  toasts: [], // active slide-in toasts
});

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
const pendingCbs = new Map();

// ── Computed ──────────────────────────────────────────────────────────────

// Total unread from LOCAL inbox (not backend) — never auto-disappears
const totalUnread = computed(() =>
  Object.values(state.inbox).reduce((s, a) => s + (a?.count || 0), 0)
);

const unreadNotifCount = computed(() => state.notifications.filter((n) => !n.read).length);

const hasUrgent = computed(() =>
  Object.values(state.inbox).some((a) => a?.ai?.priority === "urgent")
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
      const { app, count, items, ai, isNew, newCount, isFirst } = update;

      // Always update the live backend count (used for reference)
      if (!state.unreadByApp[app]) state.unreadByApp[app] = {};
      state.unreadByApp[app].count = count;
      state.unreadByApp[app].items = items;
      state.unreadByApp[app].summary = ai?.summary || null;
      state.unreadByApp[app].ai = ai;

      // ── LOCAL INBOX — only grows, never auto-shrinks ──────────────────────
      // On first load: initialise inbox with current count
      if (isFirst && count > 0) {
        if (!state.inbox[app]) {
          state.inbox[app] = {
            count: count,
            summary: ai?.summary || null,
            items: items || [],
            ai,
          };
        }
        continue; // no toast/history on first load
      }

      // New messages arrived AFTER first load — add to inbox and notify
      if (isNew && newCount > 0 && !isFirst) {
        const meta = APP_META[app];
        if (!meta) continue;

        const color = ai?.priority ? PRIORITY_COLOR[ai.priority] : meta.color;
        const id = Date.now() + Math.random();

        // Accumulate in inbox (ADD to existing count, don't replace)
        if (!state.inbox[app]) state.inbox[app] = { count: 0 };
        state.inbox[app].count += newCount;
        state.inbox[app].summary = ai?.summary || state.inbox[app].summary;
        state.inbox[app].items = items || [];
        state.inbox[app].ai = ai;

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

        // Update inbox badge
        if (!state.inbox[app]) state.inbox[app] = { count: 0 };
        state.inbox[app].count += newCount;
        state.inbox[app].summary = ai?.summary || null;
        state.inbox[app].items = items || [];
        state.inbox[app].ai = ai;
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
    // NOTE: dismissing toast does NOT clear the inbox badge
  }

  function markRead(id) {
    const n = state.notifications.find((n) => n.id === id);
    if (n) n.read = true;
  }

  function markAllRead() {
    state.notifications.forEach((n) => (n.read = true));
  }

  // ── Mark app as seen — clears inbox badge for that app ────────────────────
  // Called when user actually OPENS the app module
  function markSeen(appKey) {
    if (state.inbox[appKey]) {
      delete state.inbox[appKey];
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
    if (isStarted) return;
    isStarted = true;

    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    // REST call for immediate badge population on page load
    try {
      const { data } = await api.get("/api/notifications/unread");
      for (const [appKey, appData] of Object.entries(data.apps || {})) {
        if (!appData?.count) continue;
        state.unreadByApp[appKey] = {
          count: appData.count,
          items: appData.previews || [],
          summary: appData.summary || null,
          ai: null,
        };
        // Populate inbox with initial counts
        if (!state.inbox[appKey]) {
          state.inbox[appKey] = {
            count: appData.count,
            summary: appData.summary || null,
            items: appData.previews || [],
            ai: null,
          };
        }
      }
    } catch {
      console.error("Failed to fetch initial unread counts");
    }

    connect();
  }

  function stop() {
    isStarted = false;
    clearInterval(pingInterval);
    clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
  }

  // Backward compat aliases
  const startPolling = start;
  const stopPolling = stop;

  return {
    // State — expose inbox for sidebar badges (not unreadByApp)
    connected: state.connected,
    unreadByApp: state.inbox, // ← sidebar reads inbox, not raw backend counts
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
