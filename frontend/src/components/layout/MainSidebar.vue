<template>
  <div class="sidebar">

    <!-- Brand -->
    <div class="sidebar-brand">
      <span class="sidebar-brand-icon">🔭</span>
      <span class="sidebar-brand-name">OrionAI</span>
      <span class="sidebar-beta">BETA</span>
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
                <div class="bell-history-meta">{{ n.label }} · {{ bellTimeAgo(n.time) }}</div>
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
    <!-- Search -->
    <div class="search-box">
      <input v-model="searchQuery" ref="searchInputRef" placeholder="Search chats..." class="search-input"
        @input="onSearch" />
    </div>

    <!-- New Chat -->
    <div class="new-chat-wrap">
      <button class="new-chat-btn" @click="emit('newChat')">+ New Chat</button>
    </div>

    <!-- Sessions -->
    <div class="sessions-list">
      <div v-for="session in store.sessions" :key="session.sessionId"
        :class="['session-item', session.sessionId === store.currentSessionId ? 'active' : '']"
        @click="emit('switchSession', session.sessionId)">
        <span class="session-icon">
          {{ session.mode === 'db' ? '🗄️' : session.mode === 'rag' ? '📄' : session.mode === 'agent' ? '🤖' : '💬' }}
        </span>
        <span class="session-title">{{ session.title }}</span>
        <button class="delete-session-btn" @click.stop="emit('deleteSession', session.sessionId)">✕</button>
      </div>
    </div>

    <!-- ── INTEGRATIONS SECTION ── -->
    <div class="int-section">

      <!-- Header -->
      <div class="int-header" @click="intOpen = !intOpen">
        <span class="int-label">Connected Apps</span>
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
            <component :is="app.icon" :size="16" />
            <span v-if="app.unread > 0" class="int-badge-pill" :style="{ background: app.color }">
              {{ formatCount(app.unread) }}
            </span>
          </div>
        </template>
      </div>

      <!-- ── EXPANDED: full rows ── -->
      <div v-if="intOpen" class="int-list">
        <div v-if="connectedApps.length === 0" class="int-empty">No integrations connected</div>
        <div v-for="app in connectedApps" :key="app.id" class="int-row" :style="activeView === app.id
          ? { background: app.color + '18', borderColor: app.color + '30' }
          : { background: 'transparent', borderColor: 'transparent' }">
          <div class="int-row-inner" @click="openApp(app.id)">
            <component :is="app.icon" :size="16" />
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
        <!-- Reconnect banners for any broken integrations -->
        <div v-for="app in connectedApps.filter(a => getStatus(a.apiType) === 'error')" :key="app.id + '-error'"
          class="reconnect-banner" :style="{ borderLeftColor: app.color }">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>{{ app.label }} disconnected</span>
          <button @click="emit('openIntegrations')">Fix →</button>
        </div>
        <!-- AI summary strip -->
        <div v-if="anySummary" class="int-ai-summary">
          <span class="int-ai-icon">✨</span>
          <span class="int-ai-text">{{ firstSummary }}</span>
        </div>
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
            <div class="popup-section-label">Theme</div>
            <div class="popup-theme-options">
              <button v-for="opt in themeOptions" :key="opt.value"
                :class="['popup-theme-btn', theme === opt.value ? 'active' : '']" @click="setTheme(opt.value)">
                <span class="popup-theme-icon">{{ opt.icon }}</span>
                <span>{{ opt.label }}</span>
              </button>
            </div>
            <div class="popup-divider"></div>
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
import { ref, computed, onMounted, onUnmounted, reactive, defineComponent, h } from 'vue'
import { store } from '../../stores/app'
import { useSession } from '../../composables/useSession'
import { useTheme } from '../../composables/useTheme'
import { useWebSocket } from '../../composables/useWebSocket'
import api from '../../services/api'
import { useIntegrationHealth } from '../../composables/useIntegrationHealth'


const emit = defineEmits([
  'newChat', 'switchSession', 'deleteSession', 'logout',
  'openIntegrations', 'openIntegration'
])

const props = defineProps({
  activeView: { type: String, default: 'agent' },
  showingIntegrations: { type: Boolean, default: false },
})

const { loadSessions } = useSession()
const { theme, setTheme } = useTheme()
const {
  unreadByApp, startPolling, stopPolling, markSeen,
  unreadNotifCount, hasUrgent, notifications: bellNotifications,
  markRead, dismissNotification, markAllRead,
} = useWebSocket()

const searchQuery = ref('')
const searchInputRef = ref(null)
const showUserMenu = ref(false)
const intOpen = ref(true)   // collapsed by default — shows icon grid
const connectedMap = reactive({})
const bellOpen = ref(false)

const themeOptions = [
  { value: 'dark', icon: '🌙', label: 'Dark' },
  { value: 'light', icon: '☀️', label: 'Light' },
  { value: 'system', icon: '💻', label: 'System' },
]

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
const WhatsAppIcon = ic(s => h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: '#25D366' }, [
  h('path', { d: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a4.7 4.7 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.103 1.509 5.831L0 24l6.335-1.652A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z' }),
]))
const GmailIcon = ic(s => h('svg', { width: s, height: s, viewBox: '0 0 24 24' }, [
  h('path', { fill: '#EA4335', d: 'M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z' }),
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

const ALL_APPS = [
  { id: 'telegram', label: 'Telegram', color: '#229ED9', icon: TelegramIcon, apiType: 'telegram' },
  { id: 'whatsapp', label: 'WhatsApp', color: '#25D366', icon: WhatsAppIcon, apiType: 'whatsapp' },
  { id: 'gmail', label: 'Gmail', color: '#EA4335', icon: GmailIcon, apiType: 'gmail' },
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
  unreadApps.value
)
const connectedApps = computed(() =>
  ALL_APPS
    .filter(a => connectedMap[a.apiType])
    .map(a => ({
      ...a,
      unread: unreadByApp[a.id]?.displayCount ?? unreadByApp[a.id]?.count ?? 0,
    }))
)

const totalUnread = computed(() =>
  connectedApps.value.reduce((s, a) => s + a.unread, 0)
)

const anySummary = computed(() =>
  connectedApps.value.some(a => unreadByApp[a.id]?.summary && a.unread > 0)
)
const firstSummary = computed(() => {
  const found = connectedApps.value.find(a => unreadByApp[a.id]?.summary && a.unread > 0)
  return found ? unreadByApp[found.id]?.summary : ''
})
function appSummary(appId) {
  return unreadByApp[appId]?.summary || ''
}

function openApp(appId) {
  markSeen(appId)
  emit('openIntegration', appId)
}

function hasConnectedState(int) {
  if (!int?.type) return false
  if (int.type === 'gmail') return Boolean(int.gmail?.refreshToken || int.gmail?.accessToken || int.gmail?.userEmail)
  if (int.type === 'google_calendar') return Boolean(int.googleCalendar?.refreshToken || int.googleCalendar?.accessToken || int.googleCalendar?.userEmail)
  if (int.type === 'slack') return Boolean(int.slack?.userToken || int.slack?.webhookUrl)
  if (int.type === 'telegram') return Boolean(int.telegram?.sessionString)
  if (int.type === 'whatsapp') return Boolean(int.whatsapp?.connected)
  if (int.type === 'jira') return Boolean(int.jira?.domain && int.jira?.email && int.jira?.apiToken)
  if (int.type === 'database') return Boolean(int.database?.connectionString || int.database?.filePath)
  if (int.type === 'notion') return Boolean(int.notion?.apiToken)
  if (int.type === 'razorpay') return Boolean(int.razorpay?.keyId && int.razorpay?.keySecret)
  if (int.type === 'webhook') return Boolean(int.webhook?.url)
  return int.enabled !== false
}

async function loadConnected() {
  try {
    const res = await api.get('/api/integrations')
    Object.keys(connectedMap).forEach(k => delete connectedMap[k])
    for (const int of res.data) {
      if (hasConnectedState(int)) connectedMap[int.type] = true
    }
  } catch (e) {
    console.error('Sidebar: failed to load integrations', e)
  }
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
  searchTimer = setTimeout(() => loadSessions(searchQuery.value), 300)
}
function onOutsideClick(e) {
  if (!e.target.closest('.user-row-wrapper')) showUserMenu.value = false
  if (!e.target.closest('.sidebar-brand') && !e.target.closest('.bell-panel')) {
    bellOpen.value = false
  }
}

function openAppFromBell(route) {
  bellOpen.value = false
  emit('openIntegration', route)
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

const { getStatus, getErrorMessage, startAutoCheck, stopAutoCheck } = useIntegrationHealth()
onMounted(async () => {
  document.addEventListener('click', onOutsideClick)
  window.addEventListener('orion:integrations-updated', loadConnected)
  await loadConnected()
  startPolling()
  startAutoCheck()
})
onUnmounted(() => {
  document.removeEventListener('click', onOutsideClick)
  window.removeEventListener('orion:integrations-updated', loadConnected)
  stopPolling()
  stopAutoCheck()
})

defineExpose({ searchInputRef, refreshConnected: loadConnected })
</script>

<style scoped>
.sidebar {
  width: 220px;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100vh;
  overflow: visible;
  /* allow bell panel to flow inline without clipping */
}

.sidebar-brand {
  padding: 16px 14px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.sidebar-brand-icon {
  font-size: 20px;
  line-height: 1;
}

.sidebar-brand-name {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.3px;
  color: var(--text-primary);
}

.sidebar-beta {
  margin-left: auto;
  font-size: 10px;
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
  padding: 2px 6px;
  border-radius: 20px;
  border: 1px solid rgba(99, 102, 241, 0.2);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.search-box {
  padding: 10px 12px 4px;
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 8px 10px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bg-elevated) 40%, transparent);
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent);
}

.new-chat-wrap {
  padding: 4px 12px 8px;
  flex-shrink: 0;
}

.new-chat-btn {
  width: 100%;
  padding: 8px 12px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 8px;
  color: #818cf8;
  font-weight: 600;
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.new-chat-btn:hover {
  background: rgba(99, 102, 241, 0.15);
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
  scrollbar-width: none;
  min-height: 0;
}

.sessions-list::-webkit-scrollbar {
  display: none;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 8px;
  border-radius: 7px;
  cursor: pointer;
  color: #94a3b8;
  font-size: 12px;
  transition: background 0.12s;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.session-item.active {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}

.session-icon {
  opacity: 0.5;
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
  background: none;
  border: none;
  color: #475569;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 4px;
  flex-shrink: 0;
}

.session-item:hover .delete-session-btn {
  display: block;
}

.delete-session-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

/* ── Integrations ── */
.int-section {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding: 10px 12px 6px;
  flex-shrink: 0;
}

.int-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  margin-bottom: 8px;
  user-select: none;
  padding: 1px 0;
}

.int-label {
  font-size: 10px;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  flex: 1;
}

.int-total-pill {
  background: #6366f1;
  color: white;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 9px;
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
  color: #475569;
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
  gap: 7px;
  padding: 2px 0 8px;
  align-items: center;
}

.int-no-msg {
  font-size: 11px;
  color: #334155;
}

.int-badge {
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: 1px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.int-badge:hover {
  transform: scale(1.08);
  opacity: 0.9;
}

.int-badge-active {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1);
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
  padding-bottom: 2px;
}

.int-empty {
  font-size: 11.5px;
  color: #334155;
  padding: 6px 4px;
}

.int-row {
  display: flex;
  align-items: center;
  border-radius: 8px;
  border: 1px solid transparent;
  margin-bottom: 2px;
  transition: all 0.12s;
}

.int-row:hover {
  background: rgba(255, 255, 255, 0.04) !important;
}

.int-row-inner {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  cursor: pointer;
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
  color: #475569;
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
  padding: 7px 8px;
  margin-top: 6px;
  background: rgba(99, 102, 241, 0.07);
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
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
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding: 8px 12px 10px;
  flex-shrink: 0;
}

.shortcuts-hint {
  display: flex;
  gap: 10px;
  font-size: 10px;
  color: #334155;
  padding: 2px 0 6px;
}

.int-settings-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
  color: #64748b;
  font-size: 12px;
  transition: background 0.12s;
  margin-bottom: 4px;
}

.int-settings-row:hover {
  background: rgba(255, 255, 255, 0.04);
  color: #94a3b8;
}

.int-settings-row.active {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}

.int-settings-count {
  margin-left: auto;
  background: rgba(99, 102, 241, 0.2);
  color: #818cf8;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 9px;
}

.user-row-wrapper {
  position: relative;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 8px 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.12s;
}

.user-info:hover {
  background: rgba(255, 255, 255, 0.04);
}

.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 11px;
  color: white;
  flex-shrink: 0;
}

.username {
  font-size: 12.5px;
  color: #94a3b8;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-chevron {
  color: #475569;
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
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 10px;
  z-index: 200;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
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
  gap: 4px;
  margin-bottom: 4px;
}

.popup-theme-btn {
  flex: 1;
  padding: 6px 4px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
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
  background: var(--bg-hover);
}

.popup-theme-btn.active {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.3);
  color: #818cf8;
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
  background: var(--bg-surface);
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
  margin-left: 6px;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: none;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted, rgba(255, 255, 255, 0.35));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}

.sidebar-bell:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.sidebar-bell.bell-active {
  border-color: rgba(99, 102, 241, 0.4);
  color: #818cf8;
}

.sidebar-bell.bell-urgent {
  border-color: rgba(239, 68, 68, 0.5);
  color: #ef4444;
}

.sidebar-bell-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #6366f1;
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
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  flex-shrink: 0;
  scrollbar-width: thin;
}

.bell-panel-head {
  display: flex;
  align-items: center;
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--border-subtle);
  position: sticky;
  top: 0;
  background: var(--bg-elevated);
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
  color: #818cf8;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 5px;
}

.bell-btn-text:hover {
  background: rgba(99, 102, 241, 0.1);
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
  color: rgba(255, 255, 255, 0.25);
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
  background: rgba(255, 255, 255, 0.04);
}

.bell-history-row.bell-unread {
  background: rgba(99, 102, 241, 0.06);
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
  background: #10b981;
  box-shadow: 0 0 4px rgba(16, 185, 129, 0.5);
}

.app-health-dot.error {
  background: #ef4444;
  box-shadow: 0 0 4px rgba(239, 68, 68, 0.5);
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
  padding: 6px 10px;
  margin: 4px 0 2px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-left: 3px solid #ef4444;
  border-radius: 8px;
  font-size: 11px;
  color: #f87171;
}

.reconnect-banner span {
  flex: 1;
}

.reconnect-banner button {
  background: none;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 5px;
  color: #f87171;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
}

.reconnect-banner button:hover {
  background: rgba(239, 68, 68, 0.12);
}
</style>
