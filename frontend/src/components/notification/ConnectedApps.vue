<template>
    <div class="connected-apps">
  
      <!-- ── Header ─────────────────────────────────────────────────────────── -->
      <button class="apps-toggle" @click="expanded = !expanded">
        <span class="apps-toggle-label">CONNECTED APPS</span>
        <span v-if="totalUnread > 0 && !expanded" class="apps-total-badge">
          {{ totalUnread }}
        </span>
        <svg
          class="apps-toggle-chevron"
          :class="{ open: expanded }"
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2.5"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
  
      <!-- ── App list ────────────────────────────────────────────────────────── -->
      <div class="apps-list">
        <template v-for="app in visibleApps" :key="app.id">
          <button
            class="app-row"
            :class="{ active: activeModule === app.id }"
            @click="openApp(app)"
          >
            <!-- Icon -->
            <span class="app-icon">{{ app.icon }}</span>
  
            <!-- Name -->
            <span class="app-name">{{ app.label }}</span>
  
            <!-- Unread badge -->
            <span
              v-if="appUnread(app.id) > 0"
              class="app-unread-badge"
              :style="{ background: app.color }"
            >
              {{ appUnread(app.id) }}
            </span>
  
            <!-- Connected dot -->
            <span v-else class="app-dot"></span>
          </button>
        </template>
  
        <!-- Show more when collapsed and all apps have 0 unread -->
        <button
          v-if="!expanded && visibleApps.length === 0"
          class="apps-show-all"
          @click="expanded = true"
        >
          Show all apps
        </button>
      </div>
  
      <!-- ── AI summary strip (when there are unreads) ───────────────────────── -->
      <div v-if="totalUnread > 0 && anySummary" class="apps-summary-strip">
        <span class="apps-summary-icon">✨</span>
        <span class="apps-summary-text">{{ firstSummary }}</span>
      </div>
  
    </div>
  </template>
  
  <script setup>
  import { ref, computed } from 'vue'
  import { useNotifications } from '../../composables/useNotifications'
  
  const props = defineProps({
    connectedApps: { type: Array, default: () => [] }, // from parent/sidebar
    activeModule:  { type: String,  default: null    },
  })
  
  const emit = defineEmits(['openApp'])
  
  const { unreadByApp, totalUnread } = useNotifications()
  
  const expanded = ref(false)
  
  // App metadata — merge connected apps from props with unread data
  const ALL_APPS = [
    { id: 'gmail',    label: 'Gmail',    icon: '📧', color: '#EA4335' },
    { id: 'slack',    label: 'Slack',    icon: '💬', color: '#4A154B' },
    { id: 'telegram', label: 'Telegram', icon: '✈️', color: '#229ED9' },
    { id: 'jira',     label: 'Jira',     icon: '🔷', color: '#0052CC' },
    { id: 'calendar', label: 'Calendar', icon: '📅', color: '#4285F4' },
  ]
  
  // Only show apps the user has connected
  const connectedIds = computed(() =>
    new Set(props.connectedApps.map(a => a.type || a.id || a))
  )
  
  const connectedList = computed(() =>
    ALL_APPS.filter(a => connectedIds.value.has(a.id))
  )
  
  // When collapsed: show only apps with unread messages
  // When expanded: show all connected apps
  const visibleApps = computed(() => {
    if (expanded.value) return connectedList.value
    return connectedList.value.filter(a => appUnread(a.id) > 0)
  })
  
  function appUnread(appId) {
    return unreadByApp.value[appId]?.count || 0
  }
  
  const anySummary  = computed(() => Object.values(unreadByApp.value).some(a => a?.summary))
  const firstSummary = computed(() => {
    const entry = Object.values(unreadByApp.value).find(a => a?.summary && a.count > 0)
    return entry?.summary || ''
  })
  
  function openApp(app) {
  emit('openApp', app.id)
}
  </script>
  
  <style scoped>
  .connected-apps {
    padding: 8px 0 4px;
    border-top: 1px solid rgba(255,255,255,0.06);
    margin-top: 8px;
  }
  
  /* ── Header toggle ────────────────────────────────────────────────────────── */
  .apps-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 16px;
    background: none;
    border: none;
    cursor: pointer;
    margin-bottom: 4px;
  }
  .apps-toggle-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.8px;
    color: rgba(255,255,255,0.35);
    flex: 1;
    text-align: left;
  }
  .apps-total-badge {
    background: #6366f1;
    color: white;
    font-size: 10px;
    font-weight: 700;
    min-width: 18px;
    height: 18px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 5px;
  }
  .apps-toggle-chevron {
    color: rgba(255,255,255,0.3);
    transition: transform 0.2s;
    flex-shrink: 0;
  }
  .apps-toggle-chevron.open {
    transform: rotate(180deg);
  }
  
  /* ── App rows ─────────────────────────────────────────────────────────────── */
  .apps-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .app-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 16px;
    background: none;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    color: rgba(255,255,255,0.75);
    font-size: 13px;
    transition: background 0.15s;
    text-align: left;
  }
  .app-row:hover,
  .app-row.active {
    background: rgba(255,255,255,0.07);
    color: #e2e8f0;
  }
  .app-icon { font-size: 15px; flex-shrink: 0; }
  .app-name  { flex: 1; font-weight: 500; }
  
  .app-unread-badge {
    color: white;
    font-size: 11px;
    font-weight: 700;
    min-width: 20px;
    height: 20px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
    flex-shrink: 0;
  }
  .app-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #22c55e;
    flex-shrink: 0;
  }
  
  .apps-show-all {
    width: 100%;
    background: none;
    border: none;
    color: rgba(255,255,255,0.35);
    font-size: 12px;
    padding: 6px 16px;
    cursor: pointer;
    text-align: left;
  }
  .apps-show-all:hover { color: rgba(255,255,255,0.6); }
  
  /* ── AI summary strip ─────────────────────────────────────────────────────── */
  .apps-summary-strip {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 8px 14px;
    margin: 6px 8px 2px;
    background: rgba(99,102,241,0.08);
    border: 1px solid rgba(99,102,241,0.2);
    border-radius: 8px;
    font-size: 11.5px;
    color: rgba(255,255,255,0.6);
    line-height: 1.4;
  }
  .apps-summary-icon { flex-shrink: 0; font-size: 12px; }
  .apps-summary-text { flex: 1; }
  </style>