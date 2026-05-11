<template>
  <div class="sidebar">

    <!-- Brand -->
    <div class="sidebar-brand">
      <span class="sidebar-brand-icon">🔭</span>
      <span class="sidebar-brand-name">OrionAI</span>
      <span class="sidebar-beta">BETA</span>
      <div class="sidebar-brand-actions">
        <button class="sidebar-bell" :class="{ 'bell-active': unreadNotifCount > 0, 'bell-urgent': hasUrgent }"
          @click.stop="bellOpen = !bellOpen" title="Notifications">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          <span v-if="unreadNotifCount > 0" class="sidebar-bell-badge">
            {{ unreadNotifCount > 9 ? '9+' : unreadNotifCount }}
          </span>
        </button>
        <button class="sidebar-close" @click.stop="closeSidebar" title="Close sidebar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
    </div>
    <!-- Bell dropdown panel (positioned relative to sidebar) -->
    <Transition name="bell-panel">
      <div v-if="bellOpen" class="bell-panel" @click.stop>
        <div class="bell-panel-head">
          <span class="bell-panel-title">Notifications</span>
          <div style="display:flex;gap:6px;align-items:center;">
            <button v-if="unreadNotifCount > 0" class="bell-btn-text" @click="markAllRead">
              Mark all read
            </button>
            <button class="bell-btn-close" @click="bellOpen = false">✕</button>
          </div>
        </div>

        <!-- History -->
        <div v-if="bellNotifications.length">
          <div class="bell-section-label">RECENT</div>
          <div v-for="n in bellNotifications.slice(0, 15)" :key="n.id" class="bell-history-row"
            :class="{ 'bell-unread': !n.read }">
            <div class="bell-history-main" @click="openBellNotification(n)">
              <span class="bell-history-icon">{{ n.icon }}</span>
              <div class="bell-history-body">
                <div class="bell-history-text">{{ n.summary }}</div>
                <div class="bell-history-meta">{{ bellMeta(n) }}</div>
              </div>
            </div>
            <button class="bell-history-dismiss" @click.stop="dismissBellNotification(n.id)" title="Clear notification">✕</button>
          </div>
        </div>

        <div v-if="!bellNotifications.length" class="bell-empty">
          🔔 All caught up!
        </div>
      </div>
    </Transition>
    <div class="sidebar-quickbar" @click.stop>
      <div class="sidebar-search-inline" :class="{ open: searchExpanded }">
        <button
          v-if="!searchExpanded"
          class="sidebar-quick-btn"
          type="button"
          data-tooltip="Search"
          aria-label="Search"
          @click="focusSearch"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </button>

        <Transition name="sidebar-search-expand">
          <div v-if="searchExpanded" class="sidebar-search-shell">
            <svg class="sidebar-search-shell-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              placeholder="Search chats..."
              class="sidebar-search-field"
              @input="onSearch"
              @keydown.enter.prevent="runChatSearch"
              @blur="handleSearchBlur"
            />
            <button
              v-if="searchQuery"
              class="sidebar-search-inline-btn"
              type="button"
              aria-label="Clear search"
              title="Clear search"
              @click="clearSearch"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
            <button
              class="sidebar-search-inline-btn"
              type="button"
              aria-label="Close search"
              title="Close search"
              @click="closeSearch({ clear: true })"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
        </Transition>
      </div>

      <button
        class="sidebar-quick-btn sidebar-quick-btn-primary"
        type="button"
        data-tooltip="New Chat"
        aria-label="New Chat"
        @click="emit('newChat')"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>

    <!-- Sessions -->
    <div class="sessions-list">
      <div v-for="session in visibleSessions" :key="session.sessionId"
        :class="['session-item', session.sessionId === store.currentSessionId ? 'active' : '']"
        @click="emit('switchSession', session.sessionId)">
        <span class="session-icon">
          {{ session.mode === 'db' ? '🗄️' : session.mode === 'rag' ? '📄' : session.mode === 'agent' ? '🤖' : '💬' }}
        </span>
        <span class="session-title">{{ displaySessionTitle(session) }}</span>
        <button class="delete-session-btn" @click.stop="emit('deleteSession', session.sessionId)">✕</button>
      </div>
    </div>

    <!-- ── INTEGRATIONS SECTION ── -->
    <div class="int-section">

      <!-- Header -->
      <div class="int-header" @click="intOpen = !intOpen">
        <span class="int-label">Connected Apps</span>
        <span v-if="hasErrorApps" class="int-error-dot" title="Some apps need attention"></span>
        <span v-if="totalUnread > 0" class="int-total-pill">{{ formatCount(totalUnread) }}</span>
        <svg class="int-chevron" :class="{ open: intOpen }" width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      <!-- ── COLLAPSED: all apps as icon grid, unread badge on top ── -->
      <div v-if="!intOpen" class="int-collapsed">
        <span v-if="collapsedApps.length === 0" class="int-no-msg">No active notifications</span>
        <template v-else>
          <div v-for="app in collapsedApps" :key="app.id" class="int-badge"
            :class="{ 'int-badge-active': activeView === app.id, 'int-badge-unread': app.unread > 0 }" :style="{
              background: activeView === app.id ? app.color + '22' : 'rgba(255,255,255,0.05)',
              borderColor: app.unread > 0
                ? app.color + '70'
                : activeView === app.id
                  ? app.color + '40'
                  : 'rgba(255,255,255,0.08)'
            }"
            :title="`${app.label}${app.unread > 0 ? ': ' + formatCount(app.unread) + ' active' : ''}${appSummary(app.id) ? '\n' + appSummary(app.id) : ''}`"
            @click="openApp(app.id)">
            <img
              v-if="useRealIconFor(app) && !brokenSidebarIconIds.has(app.id)"
              :src="getAppIconUrl(app.id)"
              :alt="app.label"
              class="int-app-img"
              loading="lazy"
              @error="brokenSidebarIconIds.add(app.id)"
            />
            <component v-else :is="app.icon" :size="16" />
            <span v-if="app.unread > 0" class="int-badge-pill" :style="{ background: app.color }">
              {{ formatCount(app.unread) }}
            </span>
          </div>
          <span v-if="collapsedAppsOverflow > 0" class="int-collapsed-more">+{{ collapsedAppsOverflow }}</span>
        </template>
      </div>

      <!-- ── EXPANDED: full rows ── -->
      <div v-if="intOpen" class="int-list">
        <div v-if="connectedApps.length === 0" class="int-empty">No integrations connected</div>
        <template v-else>
          <div class="int-search-wrap" @click.stop>
            <svg class="int-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input v-model="connectedAppQuery" class="int-search-input" type="search"
              placeholder="Search connected apps..." @click.stop />
          </div>
          <div class="int-list-scroll">
            <div v-if="filteredConnectedApps.length === 0" class="int-empty">No connected apps match your search</div>
            <template v-else>
              <!-- Reconnect banners first so broken apps stay visible without scrolling -->
              <div v-for="app in filteredConnectedApps.filter(a => getStatus(a.apiType) === 'error')" :key="app.id + '-error'"
                class="reconnect-banner" :style="{ borderLeftColor: app.color }">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>{{ app.label }} disconnected</span>
                <button @click="emit('openIntegrations', app.apiType)">Fix →</button>
              </div>
              <div v-for="app in filteredConnectedApps" :key="app.id" class="int-row" :style="activeView === app.id
                ? { background: app.color + '18', borderColor: app.color + '30' }
                : { background: 'transparent', borderColor: 'transparent' }">
                <div class="int-row-inner" @click="openApp(app.id)">
                  <img
                    v-if="useRealIconFor(app) && !brokenSidebarIconIds.has(app.id)"
                    :src="getAppIconUrl(app.id)"
                    :alt="app.label"
                    class="int-app-img"
                    loading="lazy"
                    @error="brokenSidebarIconIds.add(app.id)"
                  />
                  <component v-else :is="app.icon" :size="16" />
                  <span class="int-row-name"
                    :style="{ color: activeView === app.id ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: activeView === app.id ? 600 : 400 }">
                    {{ app.label }}
                  </span>
                  <span v-if="app.unread > 0" class="int-row-unread" :style="{ background: app.color }">
                    {{ formatCount(app.unread) }}
                  </span>
                  <span class="app-health-dot" :class="getStatus(app.apiType)"
                    :title="getErrorMessage(app.apiType) || 'Connected'"></span>
                </div>
                <button class="int-row-x" @click.stop="removeApp(app.id)">×</button>
              </div>
            </template>
            <!-- AI summary strip -->
            <div v-if="filteredFirstSummary" class="int-ai-summary">
              <span class="int-ai-icon">✨</span>
              <span class="int-ai-text">{{ filteredFirstSummary }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- ── FOOTER ── -->
    <div class="sidebar-footer">
      <div class="shortcuts-hint">
        <span>⌘K new chat</span>
        <span>⌘/ search</span>
      </div>

      <div class="int-settings-row" :class="{ active: showingIntegrations }" @click="emit('openIntegrations')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2" />
        </svg>
        <span>Integrations</span>
        <span v-if="connectedApps.length > 0" class="int-settings-count">{{ connectedApps.length }}</span>
      </div>

      <div class="user-row-wrapper">
        <transition name="menu-pop">
          <div v-if="showUserMenu" class="user-popup" @click.stop>
            <!-- <div class="popup-section-label">Theme</div>
            <div class="popup-theme-options">
              <button v-for="opt in themeOptions" :key="opt.value"
                :class="['popup-theme-btn', theme === opt.value ? 'active' : '']" @click="setTheme(opt.value)">
                <span class="popup-theme-icon">{{ opt.icon }}</span>
                <span>{{ opt.label }}</span>
              </button>
            </div> -->
            <!-- <div class="popup-divider"></div> -->
            <button class="popup-item danger" @click="emit('logout'); showUserMenu = false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Log out
            </button>
          </div>
        </transition>
        <div class="user-info" @click.stop="showUserMenu = !showUserMenu">
          <span class="user-avatar">{{ initials }}</span>
          <span class="username">{{ store.user?.username }}</span>
          <svg class="user-chevron" :class="{ rotated: showUserMenu }" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, reactive, defineComponent, h, nextTick } from 'vue'
import { store } from '../../stores/app'
import { useSession } from '../../composables/useSession'
import { useWebSocket } from '../../composables/useWebSocket'
import api from '../../services/api'
import { getAppIconUrl } from '../../utils/appIcons'
import { useIntegrationHealth } from '../../composables/useIntegrationHealth'
import { buildSessionTitle, shouldHideDraftSession } from '../../utils/sessionTitles'
import { useDisclosure } from '../../composables/useDisclosure'


const emit = defineEmits([
  'newChat', 'switchSession', 'deleteSession', 'logout',
  'openIntegrations', 'openIntegration', 'closeSidebar'
])

const props = defineProps({
  activeView: { type: String, default: 'agent' },
  showingIntegrations: { type: Boolean, default: false },
})

const { loadSessions } = useSession()
const {
  unreadByApp, startPolling, stopPolling, markSeen,
  unreadNotifCount, hasUrgent, notifications: bellNotifications,
  markRead, dismissNotification, markAllRead,
} = useWebSocket()

const searchQuery = ref('')
const searchInputRef = ref(null)
const connectedAppQuery = ref('')
const showUserMenu = ref(false)
const intOpen = ref(false)   // collapsed by default — shows icon grid
const connectedMap = reactive({})
const bellOpen = ref(false)
const { isOpen: searchExpanded, open: openSearchDisclosure, close: closeSearchDisclosure } = useDisclosure(false)

// const themeOptions = [
//   { value: 'dark', icon: '🌙', label: 'Dark' },
//   { value: 'light', icon: '☀️', label: 'Light' },
//   { value: 'system', icon: '💻', label: 'System' },
// ]

const initials = computed(() => (store.user?.username || '?').slice(0, 2).toUpperCase())

function formatCount(value) {
  const count = Number(value || 0)
  if (count < 1000) return String(count)
  return new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: count >= 10000 ? 0 : 1,
  }).format(count)
}

// ── Inline SVG icon components ────────────────────────────────────────────
function ic(fn) {
  return defineComponent({ props: { size: { default: 16 } }, render() { return fn(this.size) } })
}

const TelegramIcon = ic(s => h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none' }, [
  h('circle', { cx: 12, cy: 12, r: 12, fill: '#229ED9' }),
  h('path', { d: 'M5.4 11.9l10.2-3.9c.47-.18.88.11.73.8l-1.74 8.2c-.13.58-.47.72-.95.45l-2.63-1.94-1.27 1.22c-.14.14-.26.26-.53.26l.19-2.69 4.87-4.4c.21-.19-.05-.29-.32-.1L7.47 13.9 4.87 13.1c-.56-.17-.57-.56.53-1.2z', fill: 'white' }),
]))
const SignalIcon = ic(s => h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none' }, [
  h('circle', { cx: 12, cy: 12, r: 12, fill: '#3b82f6' }),
  h('path', { d: 'M12 5.2a6.8 6.8 0 0 0-6.8 6.8c0 1.34.39 2.6 1.07 3.65l-.7 2.92 3-.67A6.8 6.8 0 1 0 12 5.2Z', fill: 'white', opacity: 0.92 }),
  h('path', { d: 'M12 7.35a4.65 4.65 0 1 0 0 9.3 4.65 4.65 0 0 0 0-9.3Zm0 8.1a3.45 3.45 0 1 1 0-6.9 3.45 3.45 0 0 1 0 6.9Z', fill: '#3b82f6' }),
]))
const WhatsAppIcon = ic(s => h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none' }, [
  h('circle', { cx: 12, cy: 12, r: 12, fill: '#25D366' }),
  h('path', { d: 'M6.6 8.4A2.4 2.4 0 0 1 9 6h5.8a2.4 2.4 0 0 1 2.4 2.4v3.55a2.4 2.4 0 0 1-2.4 2.4h-3.2l-2.7 2.15a.5.5 0 0 1-.82-.39v-1.76H9a2.4 2.4 0 0 1-2.4-2.4V8.4Z', fill: 'white', opacity: 0.95 }),
  h('path', { d: 'M10.1 9.8h3.8M10.1 12h2.35', stroke: '#25D366', 'stroke-width': 1.5, 'stroke-linecap': 'round' }),
]))
const GmailIcon = ic(s => h('svg', { width: s, height: s, viewBox: '0 0 24 24' }, [
  h('path', { fill: '#EA4335', d: 'M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z' }),
]))
const GoogleDocsIcon = ic(s => h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none' }, [
  h('path', { d: 'M8 2h7l5 5v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z', fill: '#4285F4' }),
  h('path', { d: 'M15 2v5h5', fill: '#8AB4F8' }),
  h('path', { d: 'M10 11h6M10 14h6M10 17h4', stroke: 'white', 'stroke-width': 1.6, 'stroke-linecap': 'round' }),
]))
const GoogleSheetsIcon = ic(s => h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none' }, [
  h('path', { d: 'M8 2h7l5 5v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z', fill: '#34A853' }),
  h('path', { d: 'M15 2v5h5', fill: '#7BD48F' }),
  h('path', { d: 'M9.5 11.25h7M9.5 14.5h7M9.5 17.75h7M12.25 9v10M15.5 9v10', stroke: 'white', 'stroke-width': 1.4, 'stroke-linecap': 'round' }),
]))
const SlackIcon = ic(s => h('svg', { width: s, height: s, viewBox: '0 0 24 24' }, [
  h('path', { fill: '#E01E5A', d: 'M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.527 2.527 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.527 2.527 0 012.521 2.521 2.527 2.527 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.527 2.527 0 01-2.522 2.521h-2.522V8.834zM17.688 8.834a2.527 2.527 0 01-2.521 2.521 2.527 2.527 0 01-2.521-2.521V2.522A2.528 2.528 0 0115.167 0a2.528 2.528 0 012.521 2.522v6.312zM15.167 18.956a2.528 2.528 0 012.521 2.522A2.528 2.528 0 0115.167 24a2.527 2.527 0 01-2.521-2.522v-2.522h2.521zM15.167 17.688a2.527 2.527 0 01-2.521-2.523 2.527 2.527 0 012.521-2.52h6.313A2.528 2.528 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.311z' }),
]))
const JiraIcon = ic(s => h('svg', { width: s, height: s, viewBox: '0 0 24 24' }, [
  h('path', { fill: '#0052CC', d: 'M11.571 11.513H0a5.218 5.218 0 005.232 5.215h2.13v2.057A5.215 5.215 0 0012.575 24V12.518a1.005 1.005 0 00-1.004-1.005zm5.723-5.756H5.757a5.215 5.215 0 005.215 5.214h2.129v2.058a5.218 5.218 0 005.215 5.214V6.762a1.005 1.005 0 00-1.022-1.005zM23.013 0H11.455a5.215 5.215 0 005.215 5.215h2.129v2.057A5.215 5.215 0 0024.019 12.49V1.005A1.001 1.001 0 0023.013 0z' }),
]))
const CalendarIcon = ic(s => h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none' }, [
  h('rect', { x: 2, y: 4, width: 20, height: 18, rx: 3, fill: '#1a73e8' }),
  h('rect', { x: 2, y: 4, width: 20, height: 7, rx: 3, fill: '#4285F4' }),
  h('text', { x: 12, y: 18, 'text-anchor': 'middle', fill: 'white', 'font-size': 8, 'font-weight': 'bold' }, String(new Date().getDate())),
]))
const NotionIcon = ic(s => h('svg', { width: s, height: s, viewBox: '0 0 24 24' }, [
  h('path', { fill: 'currentColor', d: 'M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.934zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z' }),
]))
const DatabaseIcon = ic(s => h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none' }, [
  h('ellipse', { cx: 12, cy: 5, rx: 8, ry: 3.5, fill: '#0ea5e9' }),
  h('path', { d: 'M4 5v6c0 1.93 3.58 3.5 8 3.5s8-1.57 8-3.5V5', stroke: '#0ea5e9', 'stroke-width': 2 }),
  h('path', { d: 'M4 11v6c0 1.93 3.58 3.5 8 3.5s8-1.57 8-3.5v-6', stroke: '#38bdf8', 'stroke-width': 2 }),
]))
const RazorpayIcon = ic(s => h('svg', { width: s, height: s, viewBox: '0 0 24 24' }, [
  h('circle', { cx: 12, cy: 12, r: 12, fill: '#072654' }),
  h('text', { x: 12, y: 16, 'text-anchor': 'middle', fill: 'white', 'font-size': 11, 'font-weight': 'bold' }, '₹'),
]))

// Calendar keeps its dynamic SVG (which renders today's date) — every other
// app falls through to the real-vendor PNG/SVG so the sidebar matches the
// Integrations page. brokenSidebarIconIds collects per-app load failures so
// we cleanly fall back to the existing inline SVG component.
const brokenSidebarIconIds = reactive(new Set())
function useRealIconFor(app) {
  if (!app?.id) return false
  if (app.id === 'google_calendar' || app.id === 'calendar') return false
  return Boolean(getAppIconUrl(app.id))
}

const ALL_APPS = [
  { id: 'telegram', label: 'Telegram', color: '#229ED9', icon: TelegramIcon, apiType: 'telegram' },
  { id: 'signal', label: 'Signal', color: '#3b82f6', icon: SignalIcon, apiType: 'signal' },
  { id: 'whatsapp', label: 'WhatsApp', color: '#25D366', icon: WhatsAppIcon, apiType: 'whatsapp' },
  { id: 'gmail', label: 'Gmail', color: '#EA4335', icon: GmailIcon, apiType: 'gmail' },
  { id: 'google_docs', label: 'Google Docs', color: '#4285F4', icon: GoogleDocsIcon, apiType: 'google_docs' },
  { id: 'google_sheets', label: 'Google Sheets', color: '#34A853', icon: GoogleSheetsIcon, apiType: 'google_sheets' },
  { id: 'slack', label: 'Slack', color: '#E01E5A', icon: SlackIcon, apiType: 'slack' },
  { id: 'jira', label: 'Jira', color: '#0052CC', icon: JiraIcon, apiType: 'jira' },
  { id: 'google_calendar', label: 'Calendar', color: '#1a73e8', icon: CalendarIcon, apiType: 'google_calendar' },
  { id: 'notion', label: 'Notion', color: '#ffffff', icon: NotionIcon, apiType: 'notion' },
  { id: 'database', label: 'Database', color: '#0ea5e9', icon: DatabaseIcon, apiType: 'database' },
  { id: 'razorpay', label: 'Razorpay', color: '#072654', icon: RazorpayIcon, apiType: 'razorpay' },
]

const unreadApps = computed(() =>
  connectedApps.value.filter(a => a.unread > 0)
)
const collapsedApps = computed(() =>
  unreadApps.value.slice(0, 4)
)
const collapsedAppsOverflow = computed(() =>
  Math.max(unreadApps.value.length - collapsedApps.value.length, 0)
)
const connectedApps = computed(() =>
  ALL_APPS
    .filter(a => connectedMap[a.apiType])
    .map(a => ({
      ...a,
      unread: unreadByApp[a.id]?.displayCount ?? unreadByApp[a.id]?.count ?? 0,
    }))
    .sort((a, b) => {
      const aBroken = getStatus(a.apiType) === 'error' ? 0 : 1
      const bBroken = getStatus(b.apiType) === 'error' ? 0 : 1
      if (aBroken !== bBroken) return aBroken - bBroken
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    })
)
const filteredConnectedApps = computed(() => {
  const query = connectedAppQuery.value.trim().toLowerCase()
  if (!query) return connectedApps.value
  return connectedApps.value.filter(app => app.label.toLowerCase().includes(query))
})

const totalUnread = computed(() =>
  connectedApps.value.reduce((s, a) => s + a.unread, 0)
)

const hasErrorApps = computed(() =>
  connectedApps.value.some(a => getStatus(a.apiType) === 'error')
)

const filteredFirstSummary = computed(() => {
  const found = filteredConnectedApps.value.find(a => unreadByApp[a.id]?.summary && a.unread > 0)
  return found ? unreadByApp[found.id]?.summary : ''
})
const visibleSessions = computed(() =>
  store.sessions.filter((session) => {
    if (!shouldHideDraftSession(session)) return true
    if (session.sessionId !== store.currentSessionId) return false
    return store.messages.some((message) => message.role === 'user')
  })
)
function appSummary(appId) {
  return unreadByApp[appId]?.summary || ''
}

function displaySessionTitle(session) {
  if (
    shouldHideDraftSession(session) &&
    session?.sessionId === store.currentSessionId
  ) {
    const firstUserMessage = store.messages.find((message) => message.role === 'user')?.content
    const optimisticTitle = buildSessionTitle(firstUserMessage)
    if (optimisticTitle !== 'New Chat') return optimisticTitle
  }
  return session?.title || 'New Chat'
}

function openApp(appId) {
  markSeen(appId)
  emit('openIntegration', appId)
}

function applyConnectedIntegrations(integrations = []) {
  Object.keys(connectedMap).forEach(k => delete connectedMap[k])
  for (const int of integrations) {
    if (hasConnectedState(int)) connectedMap[int.type] = true
  }
}

function hasConnectedState(int) {
  if (!int?.type) return false
  if (int.type === 'gmail') return Boolean(int.gmail?.refreshToken || int.gmail?.accessToken || int.gmail?.userEmail)
  if (int.type === 'google_docs') return Boolean(int.googleDocs?.refreshToken || int.googleDocs?.accessToken || int.googleDocs?.userEmail)
  if (int.type === 'google_sheets') return Boolean(int.googleSheets?.refreshToken || int.googleSheets?.accessToken || int.googleSheets?.userEmail)
  if (int.type === 'google_calendar') return Boolean(int.googleCalendar?.refreshToken || int.googleCalendar?.accessToken || int.googleCalendar?.userEmail)
  if (int.type === 'slack') return Boolean(int.slack?.userToken || int.slack?.webhookUrl)
  if (int.type === 'telegram') return Boolean(int.telegram?.sessionString)
  if (int.type === 'signal') {
    return Boolean(
      (int.matrix?.loginState === 'connected' && int.connected !== false) ||
      (int.signal?.accessToken && int.signal?.homeserverUrl && int.signal?.mxid)
    )
  }
  if (int.type === 'whatsapp') {
    return Boolean(
      (int.matrix?.loginState === 'connected' && int.connected !== false) ||
      int.whatsapp?.connected
    )
  }
  if (int.type === 'jira') return Boolean(int.jira?.domain && int.jira?.email && int.jira?.apiToken)
  if (int.type === 'database') return Boolean(int.database?.connectionString || int.database?.filePath)
  if (int.type === 'notion') return Boolean(int.notion?.apiToken)
  if (int.type === 'razorpay') return Boolean(int.razorpay?.keyId && int.razorpay?.keySecret)
  if (int.type === 'webhook') return Boolean(int.webhook?.url)
  return int.enabled !== false
}

async function loadConnected(integrations) {
  if (Array.isArray(integrations)) {
    applyConnectedIntegrations(integrations)
    return
  }

  try {
    const res = await api.get('/api/integrations')
    applyConnectedIntegrations(res.data)
  } catch (e) {
    console.error('Sidebar: failed to load integrations', e)
  }
}

function handleIntegrationsUpdated(event) {
  refreshConnected(event?.detail?.integrations)
}

function removeApp(id) {
  const app = ALL_APPS.find(a => a.id === id)
  if (!app) return
  delete connectedMap[app.apiType]
  if (props.activeView === id) emit('openIntegration', 'agent')
}

let searchTimer = null
function onSearch() {
  clearTimeout(searchTimer)
  if (!searchExpanded.value) openSearchDisclosure()
  searchTimer = setTimeout(() => loadSessions(searchQuery.value), 300)
}
function runChatSearch() {
  clearTimeout(searchTimer)
  loadSessions(searchQuery.value)
}
function focusSearch() {
  openSearchDisclosure()
  nextTick(() => searchInputRef.value?.focus())
}
function clearSearch() {
  searchQuery.value = ''
  clearTimeout(searchTimer)
  loadSessions('')
  closeSearchDisclosure()
}
function closeSearch({ clear = false } = {}) {
  clearTimeout(searchTimer)
  if (clear) {
    if (searchQuery.value) loadSessions('')
    searchQuery.value = ''
  }
  if (!searchQuery.value.trim() || clear) {
    closeSearchDisclosure()
  }
}
function handleSearchBlur() {
  requestAnimationFrame(() => {
    if (searchQuery.value.trim()) return
    if (document.activeElement?.closest('.sidebar-search-inline')) return
    closeSearchDisclosure()
  })
}
function onOutsideClick(e) {
  if (!e.target.closest('.user-row-wrapper')) showUserMenu.value = false
  if (!e.target.closest('.sidebar-brand') && !e.target.closest('.bell-panel')) {
    bellOpen.value = false
  }
  if (!e.target.closest('.sidebar-quickbar') && !searchQuery.value.trim()) {
    closeSearchDisclosure()
  }
}

function openAppFromBell(route) {
  bellOpen.value = false
  emit('openIntegration', route)
}

function closeSidebar() {
  bellOpen.value = false
  emit('closeSidebar')
}

function dismissBellNotification(id) {
  dismissNotification(id)
}

function openBellNotification(notification) {
  if (!notification) return
  markRead(notification.id)
  dismissNotification(notification.id)
  openAppFromBell(notification.route)
}

function bellTimeAgo(date) {
  if (!date) return ''
  const m = Math.floor((Date.now() - new Date(date).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

function bellMeta(notification) {
  const parts = [notification?.label || 'Notification']
  if (notification?.senderName) parts.push(notification.senderName)
  const time = bellTimeAgo(notification?.time)
  if (time) parts.push(time)
  return parts.join(' · ')
}

const { getStatus, getErrorMessage, startAutoCheck, stopAutoCheck, checkHealth } = useIntegrationHealth()

async function refreshConnected(integrations) {
  await loadConnected(integrations)
  await checkHealth(true)
}

onMounted(async () => {
  document.addEventListener('click', onOutsideClick)
  window.addEventListener('orion:integrations-updated', handleIntegrationsUpdated)
  await loadConnected()
  startPolling()
  startAutoCheck()
})
onUnmounted(() => {
  document.removeEventListener('click', onOutsideClick)
  window.removeEventListener('orion:integrations-updated', handleIntegrationsUpdated)
  stopPolling()
  stopAutoCheck()
})

defineExpose({ searchInputRef, refreshConnected, focusSearch })
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.012)),
    rgba(7, 12, 26, 0.8);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100vh;
  overflow: hidden;
  padding: 14px 12px;
  gap: 10px;
  backdrop-filter: blur(24px);
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.02);
}

.sidebar-brand {
  padding: 12px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-default);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.035);
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
  min-width: 0;
}

.sidebar-brand-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sidebar-brand-icon {
  font-size: 22px;
  line-height: 1;
  filter: drop-shadow(0 8px 16px rgba(82, 212, 255, 0.18));
}

.sidebar-brand-name {
  font-family: var(--font-brand);
  font-size: 17px;
  letter-spacing: -0.45px;
  color: var(--text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-beta {
  font-size: 10px;
  background: rgba(242, 198, 109, 0.12);
  color: var(--accent-warm);
  padding: 4px 8px;
  border-radius: 20px;
  border: 1px solid rgba(242, 198, 109, 0.18);
  font-weight: 700;
  letter-spacing: 0.12em;
}

.sidebar-quickbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 2px;
  flex-shrink: 0;
}

.sidebar-search-inline {
  flex: 1;
  min-width: 0;
  display: flex;
}

.sidebar-search-inline.open {
  flex: 1;
}

.sidebar-quick-btn {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 16px;
  border: 1px solid rgba(176, 201, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(226, 232, 240, 0.88);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.sidebar-quick-btn::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%) translateY(4px);
  opacity: 0;
  pointer-events: none;
  white-space: nowrap;
  padding: 5px 8px;
  border-radius: 999px;
  border: 1px solid rgba(176, 201, 255, 0.14);
  background: rgba(8, 14, 28, 0.95);
  color: rgba(226, 232, 240, 0.84);
  font-size: 10px;
  font-weight: 700;
  transition: opacity 140ms ease, transform 140ms ease;
}

.sidebar-quick-btn:hover,
.sidebar-quick-btn:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(82, 212, 255, 0.24);
  background: rgba(82, 212, 255, 0.12);
  box-shadow: 0 10px 20px rgba(4, 8, 20, 0.24);
  outline: none;
}

.sidebar-quick-btn:hover::after,
.sidebar-quick-btn:focus-visible::after {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.sidebar-quick-btn-primary {
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.16), rgba(139, 125, 255, 0.14));
  border-color: rgba(82, 212, 255, 0.22);
}

.sidebar-search-shell {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 40px;
  padding: 0 8px 0 12px;
  border-radius: 16px;
  border: 1px solid rgba(176, 201, 255, 0.14);
  background: rgba(255, 255, 255, 0.045);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.sidebar-search-shell-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.sidebar-search-field {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  color: var(--text-primary);
  font-size: 12.5px;
  outline: none;
}

.sidebar-search-field::placeholder {
  color: var(--text-muted);
}

.sidebar-search-inline-btn {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
}

.sidebar-search-inline-btn:hover,
.sidebar-search-inline-btn:focus-visible {
  border-color: rgba(82, 212, 255, 0.18);
  background: rgba(82, 212, 255, 0.08);
  color: var(--text-primary);
  outline: none;
}

.sidebar-search-expand-enter-active,
.sidebar-search-expand-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.sidebar-search-expand-enter-from,
.sidebar-search-expand-leave-to {
  opacity: 0;
  transform: scaleX(0.96);
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 2px;
  scrollbar-width: none;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sessions-list::-webkit-scrollbar {
  display: none;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 16px;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.02);
  color: var(--text-secondary);
  font-size: 11.5px;
  background: rgba(255, 255, 255, 0.02);
  transition: background 0.12s, border-color 0.12s, transform 0.12s, box-shadow 0.12s;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(176, 201, 255, 0.1);
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(4, 8, 20, 0.16);
}

.session-item.active {
  background:
    linear-gradient(135deg, rgba(82, 212, 255, 0.08), rgba(139, 125, 255, 0.08)),
    rgba(255, 255, 255, 0.04);
  border-color: rgba(82, 212, 255, 0.18);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

.session-icon {
  opacity: 0.78;
  flex-shrink: 0;
}

.session-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-session-btn {
  display: none;
  width: 22px;
  height: 22px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
  color: var(--text-faint);
  cursor: pointer;
  font-size: 11px;
  padding: 0;
  border-radius: 8px;
  flex-shrink: 0;
}

.session-item:hover .delete-session-btn {
  display: block;
}

.delete-session-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.18);
}

/* ── Integrations ── */
.int-section {
  border: 1px solid var(--border-default);
  padding: 12px 12px 8px;
  flex-shrink: 0;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.03);
  box-shadow: var(--shadow-sm);
}

.int-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  margin-bottom: 10px;
  user-select: none;
  padding: 1px 0;
}

.int-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--accent-warm);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  flex: 1;
}

.int-total-pill {
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.92), rgba(139, 125, 255, 0.82));
  color: white;
  font-size: 9px;
  font-weight: 700;
  padding: 3px 7px;
  border-radius: 999px;
  min-width: 14px;
  text-align: center;
  animation: pulse-badge 2s infinite;
}

@keyframes pulse-badge {

  0%,
  100% {
    opacity: 1
  }

  50% {
    opacity: 0.65
  }
}

.int-chevron {
  color: var(--text-faint);
  transition: transform 0.2s;
  flex-shrink: 0;
}

.int-chevron.open {
  transform: rotate(0deg);
}

.int-chevron:not(.open) {
  transform: rotate(-90deg);
}

/* ── Collapsed: icon grid ── */
.int-collapsed {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 2px 0 8px;
  align-items: center;
}

.int-collapsed-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  height: 38px;
  padding: 0 10px;
  border-radius: 14px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.02);
}

.int-no-msg {
  font-size: 11px;
  color: var(--text-faint);
}

.int-badge {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: 14px;
  border: 1px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  backdrop-filter: blur(14px);
}

.int-badge:hover {
  transform: translateY(-1px) scale(1.03);
  opacity: 1;
}

.int-badge-active {
  box-shadow: 0 0 0 1px rgba(82, 212, 255, 0.18), 0 14px 28px rgba(82, 212, 255, 0.1);
}

/* Glow pulse when has unread */
.int-badge-unread {
  animation: badge-glow 2.5s ease-in-out infinite;
}

@keyframes badge-glow {

  0%,
  100% {
    box-shadow: none;
  }

  50% {
    box-shadow: 0 0 8px var(--app-glow, rgba(255, 255, 255, 0.2));
  }
}

.int-badge-pill {
  position: absolute;
  top: -5px;
  right: -5px;
  color: white;
  font-size: 8px;
  font-weight: 700;
  min-width: 15px;
  height: 15px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  border: 1.5px solid var(--bg-surface, #0f1117);
}

/* ── Expanded: rows ── */
.int-list {
  padding-bottom: 4px;
}

.int-search-wrap {
  position: relative;
  margin-bottom: 10px;
}

.int-search-icon {
  position: absolute;
  top: 50%;
  left: 12px;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.int-search-input {
  width: 100%;
  padding: 9px 12px 9px 34px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

.int-search-input::placeholder {
  color: var(--text-muted);
}

.int-search-input:focus {
  border-color: rgba(82, 212, 255, 0.22);
  box-shadow: 0 0 0 4px rgba(82, 212, 255, 0.06);
}

.int-list-scroll {
  max-height: 164px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-width: thin;
  scrollbar-color: rgba(139, 125, 255, 0.35) transparent;
}

.int-list-scroll::-webkit-scrollbar {
  width: 6px;
}

.int-list-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.int-list-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(82, 212, 255, 0.36), rgba(139, 125, 255, 0.36));
}

.int-empty {
  font-size: 11.5px;
  color: var(--text-faint);
  padding: 6px 4px;
}

.int-row {
  display: flex;
  align-items: center;
  border-radius: 16px;
  border: 1px solid transparent;
  margin-bottom: 6px;
  background: rgba(255, 255, 255, 0.025);
  transition: all 0.12s;
}

.int-row:hover {
  background: rgba(255, 255, 255, 0.05) !important;
}

.int-row-inner {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  min-width: 0;
  padding: 9px 10px;
  cursor: pointer;
}

.int-app-img {
  width: 16px;
  height: 16px;
  object-fit: contain;
  border-radius: 3px;
  display: inline-block;
  flex-shrink: 0;
}

.int-row-name {
  font-size: 12.5px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.int-row-unread {
  color: white;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 9px;
  min-width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.int-row-x {
  background: none;
  border: none;
  color: var(--text-faint);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.12s;
  flex-shrink: 0;
}

.int-row:hover .int-row-x {
  opacity: 1;
}

.int-row-x:hover {
  color: #ef4444;
}

.int-ai-summary {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 12px;
  margin-top: 6px;
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.08), rgba(139, 125, 255, 0.08));
  border: 1px solid rgba(82, 212, 255, 0.16);
  border-radius: 18px;
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.int-ai-icon {
  flex-shrink: 0;
}

.int-ai-text {
  flex: 1;
}

/* ── Footer ── */
.sidebar-footer {
  border: 1px solid var(--border-default);
  padding: 10px;
  flex-shrink: 0;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.03);
  box-shadow: var(--shadow-sm);
}

.shortcuts-hint {
  display: flex;
  gap: 10px;
  font-size: 10px;
  color: var(--text-faint);
  padding: 0 0 8px;
}

.int-settings-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 14px;
  cursor: pointer;
  border: 1px solid transparent;
  color: var(--text-secondary);
  font-size: 12px;
  transition: background 0.12s;
  margin-bottom: 4px;
}

.int-settings-row:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--border-subtle);
  color: var(--text-primary);
}

.int-settings-row.active {
  background: rgba(82, 212, 255, 0.08);
  border-color: rgba(82, 212, 255, 0.18);
  color: var(--text-primary);
}

.int-settings-count {
  margin-left: auto;
  background: rgba(82, 212, 255, 0.16);
  color: var(--accent-hover);
  font-size: 9px;
  font-weight: 700;
  padding: 3px 7px;
  border-radius: 999px;
}

.user-row-wrapper {
  position: relative;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  border-radius: 16px;
  transition: background 0.12s;
}

.user-info:hover {
  background: rgba(255, 255, 255, 0.05);
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.94), rgba(139, 125, 255, 0.84));
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 11px;
  color: white;
  flex-shrink: 0;
  box-shadow: 0 14px 24px rgba(82, 212, 255, 0.22);
}

.username {
  font-size: 12.5px;
  color: var(--text-secondary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-chevron {
  color: var(--text-faint);
  transition: transform 0.2s;
  flex-shrink: 0;
}

.user-chevron.rotated {
  transform: rotate(180deg);
}

.user-popup {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--surface-glass-strong);
  border: 1px solid var(--border-default);
  border-radius: 22px;
  padding: 12px;
  z-index: 200;
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(24px);
}

.popup-section-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
  padding: 0 4px;
}

.popup-theme-options {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}

.popup-theme-btn {
  flex: 1;
  padding: 8px 4px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--border-default);
  border-radius: 14px;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  transition: all 0.12s;
}

.popup-theme-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}

.popup-theme-btn.active {
  background: rgba(82, 212, 255, 0.1);
  border-color: rgba(82, 212, 255, 0.22);
  color: var(--accent-hover);
}

.popup-theme-icon {
  font-size: 14px;
}

.popup-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 8px 0;
}

.popup-item {
  width: 100%;
  padding: 8px 10px;
  background: none;
  border: none;
  border-radius: 8px;
  font-size: 12.5px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  transition: background 0.12s;
  color: var(--text-secondary);
}

.popup-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.popup-item.danger:hover {
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
}

.menu-pop-enter-active,
.menu-pop-leave-active {
  transition: all 0.15s ease;
}

.menu-pop-enter-from,
.menu-pop-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.97);
}

/* ── Sidebar bell ──────────────────────────────────────────────────────────── */
.sidebar-bell {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-default);
  color: var(--text-muted, rgba(255, 255, 255, 0.35));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}

.sidebar-close {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid var(--border-default);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-muted, rgba(255, 255, 255, 0.35));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}

.sidebar-bell:hover {
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-primary);
}

.sidebar-close:hover {
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-primary);
  border-color: rgba(176, 201, 255, 0.18);
}

.sidebar-bell.bell-active {
  border-color: rgba(82, 212, 255, 0.28);
  color: var(--accent-hover);
}

.sidebar-bell.bell-urgent {
  border-color: rgba(255, 107, 127, 0.4);
  color: var(--danger);
}

.sidebar-bell-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.92), rgba(139, 125, 255, 0.82));
  color: white;
  font-size: 8px;
  font-weight: 700;
  min-width: 14px;
  height: 14px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 2px;
  border: 1.5px solid var(--bg-surface, #0f1117);
}

/* ── Bell panel ────────────────────────────────────────────────────────────── */
.bell-panel {
  width: calc(100% - 24px);
  margin: 0 12px 4px;
  max-height: 420px;
  overflow-y: auto;
  background: var(--surface-glass-strong);
  border: 1px solid var(--border-default);
  border-radius: 24px;
  box-shadow: var(--shadow-lg);
  flex-shrink: 0;
  scrollbar-width: thin;
  backdrop-filter: blur(24px);
}

.bell-panel-head {
  display: flex;
  align-items: center;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border-subtle);
  position: sticky;
  top: 0;
  background: rgba(10, 17, 36, 0.92);
  z-index: 1;
}

.bell-panel-title {
  flex: 1;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.bell-btn-text {
  font-size: 10px;
  color: var(--accent-hover);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 5px;
}

.bell-btn-text:hover {
  background: rgba(82, 212, 255, 0.1);
}

.bell-btn-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  font-size: 13px;
}

.bell-section-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.8px;
  color: var(--accent-warm);
  padding: 8px 14px 3px;
}

.bell-live-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid transparent;
  border-radius: 9px;
  padding: 9px 11px;
  margin: 4px 10px;
  cursor: pointer;
  transition: background 0.15s;
}

.bell-live-card:hover {
  background: rgba(255, 255, 255, 0.07);
}

.bell-live-top {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.bell-live-icon {
  font-size: 14px;
}

.bell-live-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
}

.bell-live-count {
  color: white;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 8px;
}

.bell-live-summary {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
  margin-bottom: 5px;
}

.bell-live-action {
  font-size: 10px;
  font-weight: 600;
  color: #818cf8;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 5px;
  padding: 2px 8px;
  cursor: pointer;
}

.bell-history-row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  justify-content: space-between;
  padding: 8px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 0.12s;
}

.bell-history-main {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.bell-history-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.bell-history-row.bell-unread {
  background: rgba(82, 212, 255, 0.08);
}

.bell-history-icon {
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 1px;
}

.bell-history-body {
  flex: 1;
  min-width: 0;
}

.bell-history-text {
  font-size: 11.5px;
  color: var(--text-primary);
  line-height: 1.3;
  margin-bottom: 2px;
}

.bell-history-meta {
  font-size: 10px;
  color: var(--text-muted);
}

.bell-history-dismiss {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  line-height: 1;
  transition: background 0.12s ease, color 0.12s ease;
}

.bell-history-dismiss:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.bell-empty {
  padding: 28px 14px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

/* Bell panel transition */
.bell-panel-enter-active {
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.bell-panel-leave-active {
  transition: all 0.15s ease;
}

.bell-panel-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}

.bell-panel-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.app-health-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 0.3s;
}

.app-health-dot.healthy {
  background: var(--success);
  box-shadow: 0 0 8px rgba(47, 211, 157, 0.42);
}

.app-health-dot.error {
  background: var(--danger);
  box-shadow: 0 0 8px rgba(255, 107, 127, 0.4);
  animation: health-pulse 2s infinite;
}

.app-health-dot.unknown {
  background: rgba(255, 255, 255, 0.2);
}

@keyframes health-pulse {

  0%,
  100% {
    opacity: 1
  }

  50% {
    opacity: 0.4
  }
}

.reconnect-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  margin: 4px 0 2px;
  background: rgba(255, 107, 127, 0.08);
  border: 1px solid rgba(255, 107, 127, 0.18);
  border-left: 3px solid var(--danger);
  border-radius: 16px;
  font-size: 11px;
  color: #ffb4c1;
}

.reconnect-banner span {
  flex: 1;
}

.reconnect-banner button {
  background: none;
  border: 1px solid rgba(255, 107, 127, 0.28);
  border-radius: 999px;
  color: #ffb4c1;
  font-size: 10px;
  font-weight: 600;
  padding: 4px 9px;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
}

.reconnect-banner button:hover {
  background: rgba(255, 107, 127, 0.12);
}

.int-error-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--danger);
  flex-shrink: 0;
  box-shadow: 0 0 8px rgba(255, 107, 127, 0.6);
  animation: health-pulse 2s infinite;
}
</style>
