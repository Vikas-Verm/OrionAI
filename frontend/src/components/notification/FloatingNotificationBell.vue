<template>
    <!-- Fixed bell — always visible regardless of which view is open -->
    <div class="floating-bell-wrap" ref="wrapRef">
  
      <!-- Bell button -->
      <button
        class="floating-bell"
        :class="{
          'has-unread': unreadNotifCount > 0,
          'has-urgent': hasUrgent,
        }"
        @click="toggle"
        title="Notifications"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        <span v-if="unreadNotifCount > 0" class="bell-badge">
          {{ unreadNotifCount > 9 ? "9+" : unreadNotifCount }}
        </span>
        <span v-if="hasUrgent" class="bell-pulse"></span>
      </button>
  
      <!-- Notification panel -->
      <Transition name="panel">
        <div v-if="open" class="notif-panel" @click.stop>
  
          <!-- Header -->
          <div class="panel-head">
            <span class="panel-title">Notifications</span>
            <div class="panel-head-actions">
              <button v-if="unreadNotifCount > 0" class="btn-text" @click="markAllRead">
                Mark all read
              </button>
              <button class="btn-close" @click="open = false">✕</button>
            </div>
          </div>
  
          <!-- Live unread apps -->
          <div v-if="liveItems.length">
            <div class="section-label">LIVE</div>
            <div class="live-list">
              <div
                v-for="item in liveItems"
                :key="item.app"
                class="live-card"
                :style="{ borderLeftColor: item.color }"
                @click="openApp(item.route)"
              >
                <div class="live-top">
                  <span class="live-icon">{{ item.icon }}</span>
                  <span class="live-label">{{ item.label }}</span>
                  <span class="live-count" :style="{ background: item.color }">
                    {{ item.count }}
                  </span>
                  <span v-if="item.ai?.priority === 'urgent'" class="tag-urgent">🔴 Urgent</span>
                </div>
                <div class="live-summary">{{ item.summary }}</div>
                <div v-if="item.items?.length" class="live-previews">
                  <span v-for="p in item.items.slice(0,2)" :key="p.id||p.name" class="preview-chip">
                    {{ chipText(item.app, p) }}
                  </span>
                </div>
                <button v-if="item.ai?.action" class="live-action">
                  {{ item.ai.action }} →
                </button>
              </div>
            </div>
          </div>
  
          <!-- History -->
          <div v-if="notifications.length">
            <div class="section-label">RECENT</div>
            <div
              v-for="n in notifications.slice(0, 20)"
              :key="n.id"
              class="history-row"
              :class="{ unread: !n.read }"
              @click="openAndRead(n)"
            >
              <span class="history-icon">{{ n.icon }}</span>
              <div class="history-body">
                <div class="history-text">{{ n.summary }}</div>
                <div class="history-meta">{{ n.label }} · {{ timeAgo(n.time) }}</div>
              </div>
              <div v-if="!n.read" class="unread-dot" :style="{ background: n.color }"></div>
            </div>
          </div>
  
          <!-- Empty state -->
          <div v-if="!liveItems.length && !notifications.length" class="empty-state">
            <div class="empty-icon">🔔</div>
            <div class="empty-title">All caught up!</div>
            <div class="empty-sub">Notifications will appear here</div>
          </div>
  
        </div>
      </Transition>
  
      <!-- Toasts — always visible, teleported to body -->
      <Teleport to="body">
        <div class="toast-stack">
          <TransitionGroup name="toast">
            <div
              v-for="toast in toasts"
              :key="toast.id"
              class="toast"
              :class="'toast-' + (toast.priority || 'normal')"
              :style="{ '--c': toast.color }"
              @click="onToastClick(toast)"
            >
              <div class="toast-icon-wrap">
                <span class="toast-icon">{{ toast.icon }}</span>
              </div>
              <div class="toast-content">
                <div class="toast-row">
                  <span class="toast-label">{{ toast.label }}</span>
                  <span class="toast-count" :style="{ background: toast.color }">
                    +{{ toast.count }}
                  </span>
                  <span v-if="toast.priority === 'urgent'" class="toast-urgent">URGENT</span>
                </div>
                <div class="toast-summary">{{ toast.summary }}</div>
                <button v-if="toast.action" class="toast-cta">{{ toast.action }} →</button>
              </div>
              <button class="toast-x" @click.stop="dismissToast(toast.id)">✕</button>
            </div>
          </TransitionGroup>
        </div>
      </Teleport>
  
    </div>
  </template>
  
  <script setup>
  import { ref, computed, onMounted, onUnmounted } from 'vue'
  import { useWebSocket } from '../../composables/useWebSocket'
  const emit = defineEmits(['openModule'])
  
  const {
    unreadByApp,      // this is actually state.inbox from useWebSocket
    unreadNotifCount,
    hasUrgent,
    notifications,
    toasts,
    dismissToast,
    markRead,
    markAllRead,
    markSeen,
  } = useWebSocket()
  
  const open    = ref(false)
  const wrapRef = ref(null)
  
  const APP_META = {
    gmail:    { label: 'Gmail',    icon: '📧', color: '#EA4335', route: 'gmail'    },
    slack:    { label: 'Slack',    icon: '💬', color: '#E01E5A', route: 'slack'    },
    telegram: { label: 'Telegram', icon: '✈️', color: '#229ED9', route: 'telegram' },
    signal:   { label: 'Signal',   icon: '🛡️', color: '#3b82f6', route: 'signal'   },
  }
  
  // Build live items from inbox
  const liveItems = computed(() =>
    Object.entries(unreadByApp)
      .map(([app, v]) => ({
        app,
        displayCount: Number(v?.displayCount ?? v?.count ?? 0) || 0,
        entry: v || {},
      }))
      .filter(({ displayCount }) => displayCount > 0)
      .map(({ app, displayCount, entry: v }) => ({
        app,
        count:   displayCount,
        items:   v.items || [],
        summary: v.summary || `${displayCount} unread`,
        ai:      v.ai || null,
        ...(APP_META[app] || { label: app, icon: '🔔', color: '#6366f1', route: app }),
      }))
      .sort((a, b) => {
        const p = { urgent: 0, normal: 1, info: 2 }
        return (p[a.ai?.priority] ?? 1) - (p[b.ai?.priority] ?? 1)
      })
  )
  
  function toggle() { open.value = !open.value }
  
  function openApp(route) {
    open.value = false
    markSeen(route) // clear inbox badge for this app
    emit('openModule', route)
    document.dispatchEvent(new CustomEvent('orion:open-module', {
      bubbles: true, detail: { module: route },
    }))
  }
  
  function openAndRead(n) {
    markRead(n.id)
    openApp(n.route)
  }
  
  function onToastClick(toast) {
    dismissToast(toast.id)
    openApp(toast.route)
  }
  
  function chipText(app, item) {
    if (app === 'gmail')    return (item.subject || item.from || '').slice(0, 36) + '…'
    if (app === 'telegram') return `${item.name}: ${item.unread} msg${item.unread > 1 ? 's' : ''}`
    if (app === 'signal')   return `${item.name}: ${item.unread} unread`
    if (app === 'slack')    return `${item.type === 'DM' ? '@' : '#'}${item.name}: ${item.unread}`
    return ''
  }
  
  function timeAgo(date) {
    if (!date) return ''
    const diff = Date.now() - new Date(date).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1)  return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }
  
  function onOutside(e) {
    if (!wrapRef.value?.contains(e.target)) open.value = false
  }
  onMounted(()  => document.addEventListener('click', onOutside))
  onUnmounted(() => document.removeEventListener('click', onOutside))
  </script>
  
  <style scoped>
  /* ── Fixed position — visible across all views ─────────────────────────────── */
  .floating-bell-wrap {
  position: fixed;
  top: 14px;
  right: 130px;   /* ← push left to clear Export PDF button */
  z-index: 800;
}
  
  /* ── Bell button ────────────────────────────────────────────────────────────── */
  .floating-bell {
    position: relative;
    width: 38px; height: 38px;
    border-radius: 12px;
    background: var(--bg-elevated, #1e1f2e);
    border: 1px solid rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.5);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    transition: all 0.15s;
  }
  .floating-bell:hover {
    background: var(--bg-hover, #252636);
    color: #e2e8f0;
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.4);
  }
  .floating-bell.has-unread {
    border-color: rgba(99,102,241,0.5);
    color: #818cf8;
  }
  .floating-bell.has-urgent {
    border-color: rgba(239,68,68,0.5);
    color: #f87171;
  }
  
  .bell-badge {
    position: absolute; top: -6px; right: -6px;
    background: #6366f1; color: white;
    font-size: 9px; font-weight: 700;
    min-width: 17px; height: 17px; border-radius: 9px;
    display: flex; align-items: center; justify-content: center; padding: 0 3px;
    border: 2px solid var(--bg-surface, #0f1117);
    animation: pop 0.3s cubic-bezier(0.34,1.56,0.64,1);
  }
  @keyframes pop { from { transform: scale(0); } to { transform: scale(1); } }
  
  .bell-pulse {
    position: absolute; inset: -3px; border-radius: 15px;
    border: 2px solid #ef4444;
    animation: pulse 1.5s ease-out infinite;
    pointer-events: none;
  }
  @keyframes pulse {
    0%   { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.45); }
  }
  
  /* ── Notification panel ─────────────────────────────────────────────────────── */
  .notif-panel {
    position: absolute; top: calc(100% + 10px); right: 0;
    width: 360px; max-height: 540px;
    background: #1a1b2e;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.7);
    overflow-y: auto; scrollbar-width: thin;
    z-index: 1000;
  }
  
  .panel-head {
    display: flex; align-items: center;
    padding: 14px 16px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    position: sticky; top: 0;
    background: #1a1b2e; z-index: 1;
  }
  .panel-title { flex: 1; font-size: 14px; font-weight: 700; color: #e2e8f0; }
  .panel-head-actions { display: flex; align-items: center; gap: 8px; }
  .btn-text {
    font-size: 11px; color: #818cf8;
    background: none; border: none; cursor: pointer;
    padding: 3px 8px; border-radius: 6px;
  }
  .btn-text:hover { background: rgba(99,102,241,0.1); }
  .btn-close {
    background: none; border: none;
    color: rgba(255,255,255,0.3); cursor: pointer; font-size: 14px;
  }
  
  .section-label {
    font-size: 10px; font-weight: 700; letter-spacing: 0.8px;
    color: rgba(255,255,255,0.25);
    padding: 10px 16px 4px;
  }
  
  /* ── Live cards ─────────────────────────────────────────────────────────────── */
  .live-list { padding: 4px 10px 8px; }
  .live-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-left: 3px solid transparent;
    border-radius: 10px; padding: 10px 12px;
    margin-bottom: 8px; cursor: pointer;
    transition: background 0.15s;
  }
  .live-card:hover { background: rgba(255,255,255,0.07); }
  .live-top { display: flex; align-items: center; gap: 7px; margin-bottom: 5px; }
  .live-icon  { font-size: 16px; }
  .live-label { font-size: 13px; font-weight: 600; color: #e2e8f0; flex: 1; }
  .live-count {
    color: white; font-size: 10px; font-weight: 700;
    padding: 1px 7px; border-radius: 10px;
  }
  .tag-urgent {
    font-size: 9px; font-weight: 700;
    background: rgba(239,68,68,0.15); color: #f87171;
    padding: 2px 6px; border-radius: 5px;
  }
  .live-summary { font-size: 12px; color: rgba(255,255,255,0.6); line-height: 1.4; margin-bottom: 6px; }
  .live-previews { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
  .preview-chip {
    font-size: 10.5px; color: rgba(255,255,255,0.45);
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px; padding: 2px 7px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px;
  }
  .live-action {
    font-size: 11px; font-weight: 600; color: #818cf8;
    background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2);
    border-radius: 6px; padding: 3px 10px; cursor: pointer;
  }
  
  /* ── History ────────────────────────────────────────────────────────────────── */
  .history-row {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 9px 16px; cursor: pointer;
    border-top: 1px solid rgba(255,255,255,0.04);
    transition: background 0.12s;
  }
  .history-row:hover  { background: rgba(255,255,255,0.04); }
  .history-row.unread { background: rgba(99,102,241,0.04); }
  .history-icon { font-size: 15px; flex-shrink: 0; margin-top: 1px; }
  .history-body { flex: 1; min-width: 0; }
  .history-text { font-size: 12.5px; color: #e2e8f0; line-height: 1.35; margin-bottom: 2px; }
  .history-meta { font-size: 11px; color: rgba(255,255,255,0.35); }
  .unread-dot   { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
  
  /* ── Empty ──────────────────────────────────────────────────────────────────── */
  .empty-state { padding: 40px 20px; text-align: center; }
  .empty-icon  { font-size: 32px; margin-bottom: 8px; }
  .empty-title { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.4); }
  .empty-sub   { font-size: 11px; color: rgba(255,255,255,0.25); margin-top: 4px; }
  
  /* ── Panel transition ───────────────────────────────────────────────────────── */
  .panel-enter-active { transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1); }
  .panel-leave-active { transition: all 0.15s ease; }
  .panel-enter-from   { opacity: 0; transform: translateY(-8px) scale(0.97); }
  .panel-leave-to     { opacity: 0; transform: translateY(-4px); }
  
  /* ── Toasts ─────────────────────────────────────────────────────────────────── */
  .toast-stack {
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    display: flex; flex-direction: column-reverse; gap: 10px;
    pointer-events: none;
  }
  .toast {
    display: flex; align-items: flex-start; gap: 12px;
    background: #1e1e30;
    border: 1px solid rgba(255,255,255,0.1);
    border-left: 3px solid var(--c, #6366f1);
    border-radius: 14px; padding: 12px 14px;
    min-width: 300px; max-width: 360px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    cursor: pointer; pointer-events: all;
    transition: transform 0.15s;
  }
  .toast:hover { transform: translateY(-2px); }
  .toast-urgent { border-left-color: #ef4444 !important; }
  
  .toast-icon  { font-size: 22px; flex-shrink: 0; }
  .toast-content { flex: 1; min-width: 0; }
  .toast-row   { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
  .toast-label { font-size: 13px; font-weight: 700; color: #e2e8f0; }
  .toast-count {
    color: white; font-size: 10px; font-weight: 700;
    padding: 1px 6px; border-radius: 8px;
  }
  .toast-urgent { font-size: 9px; font-weight: 800; color: #f87171; margin-left: auto; }
  .toast-summary { font-size: 12px; color: rgba(255,255,255,0.6); line-height: 1.4; margin-bottom: 5px; }
  .toast-cta {
    font-size: 11px; font-weight: 600; color: #818cf8;
    background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.2);
    border-radius: 6px; padding: 3px 10px; cursor: pointer;
  }
  .toast-x {
    background: none; border: none;
    color: rgba(255,255,255,0.3); cursor: pointer; font-size: 13px; padding: 0; flex-shrink: 0;
  }
  .toast-x:hover { color: rgba(255,255,255,0.6); }
  
  /* Toast transitions */
  .toast-enter-active { transition: all 0.35s cubic-bezier(0.34,1.56,0.64,1); }
  .toast-leave-active { transition: all 0.2s ease; }
  .toast-enter-from   { transform: translateX(120%); opacity: 0; }
  .toast-leave-to     { transform: translateX(120%); opacity: 0; }
  </style>
