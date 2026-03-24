import { ref, reactive, onMounted, onUnmounted } from "vue";
import api from "../services/api";

// Singleton — shared across all components
const state = reactive({
  statuses: {}, // { gmail: { healthy: true/false, error: null }, ... }
  lastChecked: null,
  checking: false,
});

let checkTimer = null;

export function useIntegrationHealth() {
  async function checkHealth(force = false) {
    if (state.checking) return;
    // Only re-check every 30 minutes unless forced
    if (!force && state.lastChecked && Date.now() - state.lastChecked < 30 * 60 * 1000) return;

    state.checking = true;
    try {
      const res = await api.get("/api/health/integrations");
      state.statuses = res.data.statuses || {};
      state.lastChecked = Date.now();
    } catch {
      console.log("Health check failed, keeping previous statuses");
    } finally {
      state.checking = false;
    }
  }

  function getStatus(type) {
    const s = state.statuses[type];
    if (!s) return "unknown"; // never checked
    if (s.healthy === true) return "healthy";
    if (s.healthy === false) return "error";
    return "unknown";
  }

  function getStatusDot(type) {
    const s = getStatus(type);
    return {
      healthy: "🟢",
      error: "🔴",
      unknown: "⚪",
    }[s];
  }

  function getErrorMessage(type) {
    return state.statuses[type]?.error || null;
  }

  function startAutoCheck() {
    checkHealth();
    checkTimer = setInterval(() => checkHealth(), 30 * 60 * 1000);
  }

  function stopAutoCheck() {
    if (checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }
  }

  return {
    statuses: state.statuses,
    checking: state.checking,
    lastChecked: state.lastChecked,
    checkHealth,
    getStatus,
    getStatusDot,
    getErrorMessage,
    startAutoCheck,
    stopAutoCheck,
  };
}
