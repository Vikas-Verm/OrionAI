/**
 * useNotifications.js
 * 📁 frontend/src/composables/useNotifications.js
 *
 * Polls /api/notifications/unread every 60 seconds.
 * Emits browser notifications for new messages.
 * Exposes unread counts per app for the sidebar.
 */

import { ref, computed, readonly } from "vue";
import api from "../services/api";

// ── Singleton state (shared across all components) ─────────────────────────
const unreadByApp = ref({}); // { gmail: { count, summary, previews }, slack: {...}, telegram: {...} }
const toasts = ref([]); // active in-app toast notifications
const totalUnread = computed(() =>
  Object.values(unreadByApp.value).reduce((s, a) => s + (a?.count || 0), 0)
);

let pollTimer = null;
let lastSeenCounts = {}; // { gmail: N, slack: N, telegram: N }
let notifPermission = false;

const APP_META = {
  gmail: { label: "Gmail", icon: "📧", color: "#EA4335", route: "gmail" },
  slack: { label: "Slack", icon: "💬", color: "#4A154B", route: "slack" },
  telegram: { label: "Telegram", icon: "✈️", color: "#229ED9", route: "telegram" },
};

export function useNotifications() {
  // ── Request browser notification permission ───────────────────────────────
  async function requestPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      notifPermission = true;
    } else if (Notification.permission !== "denied") {
      const result = await Notification.requestPermission();
      notifPermission = result === "granted";
    } else {
      notifPermission = false;
    }
  }

  // ── Fetch unread counts from backend ─────────────────────────────────────
  async function fetchUnread() {
    try {
      const { data } = await api.get("/api/notifications/unread", {
        params: { _: Date.now() },
        headers: { "Cache-Control": "no-cache" },
      });
      const apps = data.apps || {};
      console.log("📬 Unread data:", JSON.stringify(apps));
      // Check each app for NEW messages since last poll
      for (const [appKey, appData] of Object.entries(apps)) {
        if (!appData || appData.count === 0) continue;

        const prev = lastSeenCounts[appKey] || 0;
        const curr = appData.count;

        if (curr > prev) {
          // New messages arrived — show notification
          const newCount = curr - prev;
          showNotification(appKey, appData, newCount);
          showToast(appKey, appData, newCount);
        }
        lastSeenCounts[appKey] = curr;
      }

      unreadByApp.value = apps;
    } catch (err) {
      // Silent fail — notifications are non-critical
      console.debug("Notification poll failed:", err.message);
    }
  }

  // ── Browser notification ──────────────────────────────────────────────────
  function showNotification(appKey, appData, newCount) {
    if (!notifPermission) return;
    const meta = APP_META[appKey] || { label: appKey, icon: "🔔" };
    const title = `${meta.icon} ${newCount} new in ${meta.label}`;
    const body = appData.summary || `${appData.count} unread messages`;

    try {
      const notif = new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: appKey, // replaces previous notification for same app
        silent: false,
      });
      notif.onclick = () => {
        window.focus();
        // Dispatch event so App.vue can open the right module
        document.dispatchEvent(
          new CustomEvent("orion:open-module", {
            bubbles: true,
            detail: { module: meta.route },
          })
        );
        notif.close();
      };
    } catch {
      console.debug("Failed to show notification:");
    }
  }

  // ── In-app toast ──────────────────────────────────────────────────────────
  function showToast(appKey, appData, newCount) {
    const meta = APP_META[appKey] || { label: appKey, icon: "🔔", color: "#6366f1" };
    const id = Date.now();

    toasts.value.push({
      id,
      appKey,
      icon: meta.icon,
      color: meta.color,
      label: meta.label,
      count: newCount,
      summary: appData.summary || `${appData.count} unread`,
      route: meta.route,
    });

    // Auto-dismiss after 6 seconds
    setTimeout(() => dismissToast(id), 6000);
  }

  function dismissToast(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  // ── Start / stop polling ──────────────────────────────────────────────────
  async function startPolling() {
    await requestPermission();
    await fetchUnread(); // immediate first fetch
    pollTimer = setInterval(fetchUnread, 30_000); // then every 60s
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // ── Mark app as seen (called when user opens the module) ─────────────────
  function markSeen(appKey) {
    const curr = unreadByApp[appKey]?.count || 0;
    lastSeenCounts[appKey] = curr;
  }

  return {
    unreadByApp: readonly(unreadByApp),
    totalUnread,
    toasts: readonly(toasts),
    startPolling,
    stopPolling,
    markSeen,
    dismissToast,
    fetchUnread,
  };
}
