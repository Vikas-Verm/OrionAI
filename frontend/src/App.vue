<template>
  <div>
    <LoginScreen v-if="!isLoggedIn" @success="onLoginSuccess" />
    <ConnectAppsOnboarding
      v-else-if="activeOnboardingRoute === 'connect-apps'"
      @complete="onOnboardingStepComplete"
    />
    <SyncingOnboarding
      v-else-if="activeOnboardingRoute === 'syncing'"
      @complete="onOnboardingStepComplete"
    />
    <div v-else-if="authBooting" class="app-auth-loading">
      <div class="app-auth-loading__glow app-auth-loading__glow--cyan" aria-hidden="true"></div>
      <div class="app-auth-loading__glow app-auth-loading__glow--violet" aria-hidden="true"></div>
      <div class="app-auth-loading__grid" aria-hidden="true"></div>
      <div class="app-auth-loading__card">
        <div class="app-auth-loading__logo">🔭</div>
        <h1>Preparing OrionAI</h1>
        <p>Checking your workspace and routing you to the right first-run experience.</p>
        <span class="app-auth-loading__spinner"></span>
      </div>
    </div>
    <div
      v-else
      class="app"
      :class="{
        'app-mobile-nav': isNavigationOverlayMode,
        'app-sidebar-open': !sidebarCollapsed,
      }"
    >
      <div class="app-aurora app-aurora-cyan" aria-hidden="true"></div>
      <div class="app-aurora app-aurora-violet" aria-hidden="true"></div>
      <div class="app-grid-glow" aria-hidden="true"></div>
      <button
        v-if="isNavigationOverlayMode && !sidebarCollapsed"
        class="sidebar-backdrop"
        type="button"
        aria-label="Close navigation"
        @click="closeSidebar"
      ></button>
      <div class="sidebar-shell" :class="{ 'sidebar-shell-collapsed': sidebarCollapsed }">
        <Sidebar
          ref="sidebarRef"
          class="sidebar-panel"
          :class="{ 'sidebar-panel-collapsed': sidebarCollapsed }"
          :activeView="activeModule || (showingIntegrations ? 'settings' : (store.mode === 'db' ? 'database' : 'agent'))"
          :showingIntegrations="showingIntegrations"
          @newChat="onNewChatRequested"
          @switchSession="switchSession"
          @deleteSession="deleteSession"
          @logout="logout"
          @openIntegrations="onOpenIntegrations"
          @openIntegration="onOpenIntegration"
          @closeSidebar="closeSidebar"
        />

        <div v-if="sidebarCollapsed" class="sidebar-float-dock">
          <button class="sidebar-float-brand" type="button" title="Open sidebar" @click="openSidebar">
            <span class="sidebar-float-brand-mark">🔭</span>
            <span class="sidebar-float-tooltip">Open sidebar</span>
          </button>

          <button
            class="sidebar-float-bell"
            :class="{ 'bell-active': unreadNotifCount > 0, 'bell-urgent': hasUrgent }"
            type="button"
            title="Open sidebar"
            @click="openSidebar"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            <span v-if="unreadNotifCount > 0" class="sidebar-float-bell-badge">
              {{ unreadNotifCount > 9 ? '9+' : unreadNotifCount }}
            </span>
          </button>
        </div>
      </div>

      <div class="main">

        <!-- ── Integration settings (inside main, sidebar stays visible) ── -->
        <IntegrationsPage v-if="showingIntegrations" :key="`integrations-${store.user?.username || 'anon'}`" :focusType="integrationsFocusType" @close="showingIntegrations = false; activeModule = null; integrationsFocusType = null"
          @connected="sidebarRef?.refreshConnected?.($event)" @openModule="onOpenModuleFromSettings" />

        <!-- ── Study Hub (URL: /study-learning and /study-learning/topics/:topicId) ── -->
        <TopicLearningPage
          v-else-if="showStudyHub && studyTopicId"
          :key="`study-topic-${studyTopicId}`"
          :topic-id="studyTopicId"
          @back="closeStudyTopic"
        />
        <StudyHubPage
          v-else-if="showStudyHub"
          @open-topic="openStudyTopic"
          @back="closeStudyHub"
        />

        <!-- ── Module pages (inside main, sidebar stays visible) ── -->
        <TelegramPage v-else-if="activeModule === 'telegram'" @close="closeModule" />
        <GmailPage v-else-if="activeModule === 'gmail'" @close="closeModule" />
        <SlackPage v-else-if="activeModule === 'slack'" @close="closeModule" />
        <JiraPage v-else-if="activeModule === 'jira'" @close="closeModule" />
        <CalendarPage v-else-if="activeModule === 'calendar' || activeModule === 'google_calendar'"
          @close="closeModule" />
        <GoogleDocsPage
          v-else-if="activeModule === 'google_docs'"
          @close="closeModule"
          @open-integrations="onOpenIntegrations"
        />
        <GoogleSheetsPage
          v-else-if="activeModule === 'google_sheets'"
          @close="closeModule"
          @open-integrations="onOpenIntegrations"
        />
        <SignalPage
          v-else-if="activeModule === 'signal'"
          @close="closeModule"
          @open-integrations="onOpenIntegrations"
        />
        <WhatsAppPage
          v-else-if="activeModule === 'whatsapp'"
          @close="closeModule"
          @open-integrations="onOpenIntegrations"
        />
        <DatabasePage
          v-else-if="activeModule === 'database'"
          @close="closeModule"
          @open-integrations="onOpenIntegrations"
          @open-data-mode="openDatabaseWorkspace"
        />
        <RazorpayPage
          v-else-if="activeModule === 'razorpay'"
          @close="closeModule"
          @open-integrations="onOpenIntegrations"
          @open-agent-prompt="openRazorpayWorkspace"
        />

        <!-- ── Normal chat view ── -->
        <template v-else>
          <MainHeader @exportPDF="exportChatPDF" @openModule="onOpenModuleFromSettings" />
          <div
            class="split-view"
            :class="{
              'split-view--with-header-actions': store.canvasCode || store.messages.length > 0,
            }"
          >
            <div class="chat-pane">
              <DocPanel />
              <MessageList ref="messageListRef" @usePrompt="usePrompt" @regenerate="onRegenerate" @disambiguate="selectDisambiguation" />
              <InputArea ref="inputAreaRef" @send="onSend" @stop="onStop" @upload="onUpload" @removeFile="removeAttachment"
                @connectDB="connectDatabase" />
              <ParamPrompt v-if="pendingParams" :pending="pendingParams" @submit="onAgentParamsSubmit"
                @cancel="pendingParams = null" />
            </div>
            <CanvasPane />
          </div>
        </template>

      </div>
      <AgentConfirmModal ref="confirmRef" />
      <NotificationToast @openModule="onOpenModuleFromSettings" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { store, clearAuth, setMode, setModuleContext, setUser } from './stores/app'
import { useSession } from './composables/useSession'
import { useChat } from './composables/useChat'
import { useFiles } from './composables/useFiles'
import { useAgent } from './composables/useAgent'
import { useWebSocket } from './composables/useWebSocket'
import api, { onboardingAPI } from './services/api'
import html2pdf from 'html2pdf.js'

// Layout
import LoginScreen from './components/auth/LoginScreen.vue'
import ConnectAppsOnboarding from './components/onboarding/ConnectAppsOnboarding.vue'
import SyncingOnboarding from './components/onboarding/SyncingOnboarding.vue'
import Sidebar from './components/layout/MainSidebar.vue'
import MainHeader from './components/layout/MainHeader.vue'

// Chat
import MessageList from './components/chat/MessageList.vue'
import InputArea from './components/input/InputArea.vue'
import DocPanel from './components/rag/DocPanel.vue'
import CanvasPane from './components/canvas/CanvasPane.vue'
import ParamPrompt from './components/agent/ParamPrompt.vue'

// Integrations & modules
import IntegrationsPage from './components/integrations/IntegrationsPage.vue'
import NotificationToast from './components/notification/NotificationToast.vue'
import TelegramPage from './views/TelegramPage.vue'
import GmailPage from './views/GmailPage.vue'
import SlackPage from './views/SlackPage.vue'
import JiraPage from './views/JiraPage.vue'
import CalendarPage from './views/CalendarPage.vue'
import GoogleDocsPage from './views/GoogleDocsPage.vue'
import GoogleSheetsPage from './views/GoogleSheetsPage.vue'
import SignalPage from './views/SignalPage.vue'
import WhatsAppPage from './views/WhatsAppPage.vue'
import DatabasePage from './views/DatabasePage.vue'
import RazorpayPage from './views/RazorpayPage.vue'
import StudyHubPage from './views/StudyHubPage.vue'
import TopicLearningPage from './views/TopicLearningPage.vue'

import AgentConfirmModal from './components/agent/AgentConfirmModal.vue'
//Notifications

const isLoggedIn = computed(() => !!store.token && !!store.user)
const authBooting = ref(Boolean(store.token))

// Composables
const { loadSessions, startNewChat, switchSession: _switchSession, deleteSession } = useSession()
const { sendMessage, regenerate, stopChat } = useChat()
const { handleFileSelect, removeAttachment, connectDatabase } = useFiles()
const { handleAgentMessage, provideMissingParams, pendingParams, disambiguateData, selectDisambiguation, stopAgent } = useAgent()
const { start, stop, unreadNotifCount, hasUrgent } = useWebSocket()
// Refs
const sidebarRef = ref(null)
const NAV_OVERLAY_BREAKPOINT = 1024
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth || 1440)
const desktopSidebarCollapsed = ref(false)
const mobileSidebarOpen = ref(false)
const isNavigationOverlayMode = computed(() => viewportWidth.value <= NAV_OVERLAY_BREAKPOINT)
const sidebarCollapsed = computed(() =>
  isNavigationOverlayMode.value ? !mobileSidebarOpen.value : desktopSidebarCollapsed.value
)

const ONBOARDING_ROUTE_TO_PATH = Object.freeze({
  'connect-apps': '/onboarding/connect-apps',
  syncing: '/onboarding/syncing',
})
const ONBOARDING_PATH_TO_ROUTE = Object.freeze(
  Object.fromEntries(Object.entries(ONBOARDING_ROUTE_TO_PATH).map(([route, path]) => [path, route]))
)
const WORKSPACE_BRIEFING_PATH = '/workspace-briefing'
const STUDY_HUB_PATH = '/study-learning'
const STUDY_TOPIC_PATH_RE = /^\/study-learning\/topics\/([^/]+)$/
const HOME_PATHS = new Set(['/', '', WORKSPACE_BRIEFING_PATH])

// URL-based routing without vue-router. Pathnames map to UI state:
//   - /              →  fresh new chat (always — never restores a session)
//   - /c/{sessionId} →  specific AI chat session (Mongo session id)
//   - /integrations  →  Integrations page
//   - /workspace-briefing → OrionAI home / briefing surface
//   - /onboarding/*  → first-run onboarding flow
//   - /<module>      →  module page (gmail, whatsapp, telegram, slack, etc.)
//
// On refresh we read the pathname and restore that view. On login we push
// "/" so a fresh session lands on the new-chat view regardless of what the
// previous user had open.
const MODULE_ROUTES = {
  telegram: 'telegram',
  gmail: 'gmail',
  slack: 'slack',
  jira: 'jira',
  signal: 'signal',
  whatsapp: 'whatsapp',
  google_calendar: 'calendar',
  calendar: 'calendar',
  google_docs: 'google-docs',
  google_sheets: 'google-sheets',
  database: 'database',
  razorpay: 'razorpay',
}
const ROUTE_TO_MODULE = Object.fromEntries(
  Object.entries(MODULE_ROUTES).map(([id, slug]) => [slug, id])
)
// Some module ids share a route ("calendar" maps to "google_calendar"); keep
// the canonical id for state so existing component routing keeps working.
ROUTE_TO_MODULE.calendar = 'google_calendar'

function normalizePathname(pathname = '/') {
  return String(pathname || '/').replace(/\/+$/, '') || '/'
}

function updateViewportWidth() {
  if (typeof window === 'undefined') return
  viewportWidth.value = window.innerWidth || 1440
}

function pathFor({ module = null, integrations = false, sessionId = null } = {}) {
  if (integrations) return '/integrations'
  if (module && MODULE_ROUTES[module]) return `/${MODULE_ROUTES[module]}`
  if (sessionId) return `/c/${encodeURIComponent(sessionId)}`
  return '/'
}

function readInitialRouteFromLocation() {
  if (typeof window === 'undefined')
    return {
      module: null,
      integrations: false,
      sessionId: null,
      isNewChat: true,
      onboardingRoute: null,
      isWorkspaceBriefingHome: false,
      studyHub: false,
      studyTopicId: null,
    }
  const pathname = normalizePathname(window.location?.pathname || '/')
  const onboardingRoute = ONBOARDING_PATH_TO_ROUTE[pathname]
  if (onboardingRoute) {
    return {
      module: null,
      integrations: false,
      sessionId: null,
      isNewChat: false,
      onboardingRoute,
      isWorkspaceBriefingHome: false,
      studyHub: false,
      studyTopicId: null,
    }
  }
  if (pathname === WORKSPACE_BRIEFING_PATH) {
    return {
      module: null,
      integrations: false,
      sessionId: null,
      isNewChat: true,
      onboardingRoute: null,
      isWorkspaceBriefingHome: true,
      studyHub: false,
      studyTopicId: null,
    }
  }
  const studyTopicMatch = pathname.match(STUDY_TOPIC_PATH_RE)
  if (studyTopicMatch) {
    let topicId = studyTopicMatch[1]
    try { topicId = decodeURIComponent(topicId) } catch {}
    return {
      module: null,
      integrations: false,
      sessionId: null,
      isNewChat: false,
      onboardingRoute: null,
      isWorkspaceBriefingHome: false,
      studyHub: true,
      studyTopicId: topicId,
    }
  }
  if (pathname === STUDY_HUB_PATH) {
    return {
      module: null,
      integrations: false,
      sessionId: null,
      isNewChat: false,
      onboardingRoute: null,
      isWorkspaceBriefingHome: false,
      studyHub: true,
      studyTopicId: null,
    }
  }
  if (pathname === '/integrations') {
    return {
      module: null,
      integrations: true,
      sessionId: null,
      isNewChat: false,
      onboardingRoute: null,
      isWorkspaceBriefingHome: false,
      studyHub: false,
      studyTopicId: null,
    }
  }
  // /c/{id} — decode and restore that chat session.
  const chatMatch = pathname.match(/^\/c\/([^/]+)$/)
  if (chatMatch) {
    let sessionId = chatMatch[1]
    try { sessionId = decodeURIComponent(sessionId) } catch {}
    return {
      module: null,
      integrations: false,
      sessionId,
      isNewChat: false,
      onboardingRoute: null,
      isWorkspaceBriefingHome: false,
      studyHub: false,
      studyTopicId: null,
    }
  }
  const slug = pathname.startsWith('/') ? pathname.slice(1) : pathname
  if (slug && ROUTE_TO_MODULE[slug]) {
    return {
      module: ROUTE_TO_MODULE[slug],
      integrations: false,
      sessionId: null,
      isNewChat: false,
      onboardingRoute: null,
      isWorkspaceBriefingHome: false,
      studyHub: false,
      studyTopicId: null,
    }
  }
  // "/" or any unknown route → fresh new chat home.
  return {
    module: null,
    integrations: false,
    sessionId: null,
    isNewChat: true,
    onboardingRoute: null,
    isWorkspaceBriefingHome: false,
    studyHub: false,
    studyTopicId: null,
  }
}

const initialRoute = readInitialRouteFromLocation()
const activeOnboardingRoute = ref(initialRoute.onboardingRoute)
const showingIntegrations = ref(initialRoute.integrations)
const integrationsFocusType = ref(null)
const activeModule = ref(initialRoute.module)
const showStudyHub = ref(initialRoute.studyHub === true)
const studyTopicId = ref(initialRoute.studyTopicId || null)

function pushRouteIfChanged(targetPath) {
  if (typeof window === 'undefined') return
  const current = normalizePathname(window.location?.pathname || '/')
  if (current === normalizePathname(targetPath)) return
  try {
    window.history.pushState({}, '', targetPath)
  } catch {
    // pushState can throw in certain sandboxed contexts. Best-effort only.
  }
}

watch(
  [activeModule, showingIntegrations],
  ([moduleVal, integrationsVal]) => {
    if (activeOnboardingRoute.value) return
    // Only push module / integrations URLs from this watcher. Chat-session
    // URLs are pushed explicitly when switchSession() / startNewChat() runs
    // so we don't clobber /c/{id} every time a module ref toggles.
    if (moduleVal || integrationsVal) {
      pushRouteIfChanged(
        pathFor({ module: moduleVal, integrations: integrationsVal })
      )
    }
  }
)

// Track the currently-routed chat session so popstate can restore it.
function pushChatSessionRoute(sessionId) {
  pushRouteIfChanged(sessionId ? `/c/${encodeURIComponent(sessionId)}` : '/')
}

// Upgrade "/" → "/c/{sessionId}" once a draft chat actually has messages.
// This gives every real chat a stable URL the user can reload back into,
// while empty drafts stay at the home "/" route.
watch(
  [() => store.currentSessionId, () => store.messages.length],
  ([sessionId, messageCount]) => {
    if (!sessionId) return
    if (messageCount <= 0) return
    if (activeOnboardingRoute.value) return
    if (activeModule.value || showingIntegrations.value) return
    if (showStudyHub.value) return
    const currentPath = normalizePathname(window.location?.pathname || '/')
    if (HOME_PATHS.has(currentPath)) {
      pushRouteIfChanged(`/c/${encodeURIComponent(sessionId)}`)
    }
  }
)

// Browser back/forward — sync state to the new URL so the UI updates.
async function handlePopState() {
  const next = readInitialRouteFromLocation()
  if (next.onboardingRoute) {
    activeOnboardingRoute.value = next.onboardingRoute
    showingIntegrations.value = false
    activeModule.value = null
    integrationsFocusType.value = null
    showStudyHub.value = false
    studyTopicId.value = null
    setModuleContext(null)
    return
  }
  activeOnboardingRoute.value = null
  showingIntegrations.value = next.integrations
  activeModule.value = next.module
  showStudyHub.value = next.studyHub === true
  studyTopicId.value = next.studyTopicId || null
  if (next.studyHub) {
    setModuleContext(null)
    return
  }
  if (next.sessionId && next.sessionId !== store.currentSessionId) {
    try {
      await _switchSession(next.sessionId)
    } catch {
      // If the session is gone, fall through to home.
      pushRouteIfChanged('/')
    }
  } else if (next.isNewChat && !next.module && !next.integrations) {
    // Hitting / via back/forward starts a fresh chat (or reuses a blank draft).
    await startNewChat().catch(() => {})
    if (next.isWorkspaceBriefingHome) {
      await maybeMarkFirstBriefingSeen()
    }
  }
}
const messageListRef = ref(null)
const inputAreaRef = ref(null)
const confirmRef = ref(null)
let openTelegramListener = null
let openModuleListener = null
let openIntegrationsListener = null
let openStudyHubListener = null

function resetSurfaceState() {
  activeOnboardingRoute.value = null
  showingIntegrations.value = false
  integrationsFocusType.value = null
  activeModule.value = null
  showStudyHub.value = false
  studyTopicId.value = null
  setModuleContext(null)
}

function openOnboardingRoute(routeKey) {
  activeOnboardingRoute.value = routeKey
  showingIntegrations.value = false
  integrationsFocusType.value = null
  activeModule.value = null
  showStudyHub.value = false
  studyTopicId.value = null
  setModuleContext(null)
  const path = ONBOARDING_ROUTE_TO_PATH[routeKey]
  if (path) pushRouteIfChanged(path)
}

function openStudyHub() {
  resetSurfaceState()
  showStudyHub.value = true
  studyTopicId.value = null
  pushRouteIfChanged(STUDY_HUB_PATH)
}

function openStudyTopic(topicId) {
  if (!topicId) return
  resetSurfaceState()
  showStudyHub.value = true
  studyTopicId.value = String(topicId)
  pushRouteIfChanged(`${STUDY_HUB_PATH}/topics/${encodeURIComponent(topicId)}`)
}

function closeStudyTopic() {
  studyTopicId.value = null
  pushRouteIfChanged(STUDY_HUB_PATH)
}

async function closeStudyHub() {
  showStudyHub.value = false
  studyTopicId.value = null
  activeModule.value = null
  showingIntegrations.value = false
  setModuleContext(null)
  setMode('chat')
  pushRouteIfChanged(WORKSPACE_BRIEFING_PATH)
  // Land on a fresh new-chat draft so the WorkspaceBriefing empty state shows.
  await startNewChat().catch(() => {})
}

async function refreshOnboardingStatus() {
  const { data } = await onboardingAPI.status()
  if (data?.user) setUser(data.user)
  return data
}

async function maybeMarkFirstBriefingSeen() {
  if (store.user?.onboarding?.hasSeenFirstBriefing) return
  try {
    const { data } = await onboardingAPI.update({ hasSeenFirstBriefing: true })
    if (data?.user) setUser(data.user)
  } catch (error) {
    console.debug('Unable to mark first briefing as seen:', error?.message || error)
  }
}

async function enterMainApp(route = initialRoute) {
  const nextRoute = {
    module: route?.module || null,
    integrations: route?.integrations === true,
    sessionId: route?.sessionId || null,
    isNewChat: route?.isNewChat !== false,
    onboardingRoute: null,
    isWorkspaceBriefingHome: route?.isWorkspaceBriefingHome === true,
    studyHub: route?.studyHub === true,
    studyTopicId: route?.studyTopicId || null,
  }

  activeOnboardingRoute.value = null
  showingIntegrations.value = nextRoute.integrations
  activeModule.value = nextRoute.module
  showStudyHub.value = nextRoute.studyHub
  studyTopicId.value = nextRoute.studyTopicId
  integrationsFocusType.value = null
  setModuleContext(null)

  await loadSessions()

  if (nextRoute.studyHub) {
    if (store.sessions.length > 0 && !store.currentSessionId) {
      store.currentSessionId = store.sessions[0].sessionId
    }
    stop()
    start()
    return
  }

  if (nextRoute.sessionId) {
    try {
      await _switchSession(nextRoute.sessionId)
    } catch {
      activeModule.value = null
      showingIntegrations.value = false
      pushRouteIfChanged(WORKSPACE_BRIEFING_PATH)
      await startNewChat()
      await maybeMarkFirstBriefingSeen()
    }
  } else if (nextRoute.module || nextRoute.integrations) {
    if (store.sessions.length > 0) {
      store.currentSessionId = store.sessions[0].sessionId
      await _switchSession(store.currentSessionId).catch(() => {})
    } else {
      await startNewChat()
    }
  } else {
    await startNewChat()
    pushRouteIfChanged(nextRoute.isWorkspaceBriefingHome ? WORKSPACE_BRIEFING_PATH : '/')
    if (nextRoute.isWorkspaceBriefingHome) {
      await maybeMarkFirstBriefingSeen()
    }
  }

  stop()
  start()
}

async function handleAuthenticatedEntry({
  route = readInitialRouteFromLocation(),
  preserveExplicitPath = true,
  preferWorkspaceBriefing = false,
} = {}) {
  const status = await refreshOnboardingStatus()

  if (status?.nextStep === 'connect_apps') {
    openOnboardingRoute('connect-apps')
    return status
  }

  if (status?.nextStep === 'syncing') {
    openOnboardingRoute('syncing')
    return status
  }

  const routeToUse =
    preserveExplicitPath && !route?.onboardingRoute
      ? {
          ...route,
          isWorkspaceBriefingHome:
            route?.isWorkspaceBriefingHome === true ||
            preferWorkspaceBriefing ||
            (!route?.sessionId && !route?.module && !route?.integrations),
        }
      : {
          module: null,
          integrations: false,
          sessionId: null,
          isNewChat: true,
          onboardingRoute: null,
          isWorkspaceBriefingHome: true,
        }

  await enterMainApp(routeToUse)
  return status
}

// ── Init ──────────────────────────────────────────────────
onMounted(async () => {
  updateViewportWidth()
  window.copyCode = (btn) => {
    const code = btn.closest('.code-block').querySelector('code').innerText
    navigator.clipboard.writeText(code)
    btn.textContent = 'Copied!'
    setTimeout(() => btn.textContent = 'Copy', 2000)
  }
  document.addEventListener('keydown', handleKeyboard)
  document.addEventListener('click', () => inputAreaRef.value?.closeMenus())
  window.addEventListener('popstate', handlePopState)
  window.addEventListener('resize', updateViewportWidth, { passive: true })
  // Listen for TelegramRenderer "Open chat" button
  openTelegramListener = (e) => {
    dismissStudyHubSurface()
    showingIntegrations.value = false
    setModuleContext({
      module: 'telegram',
      ...(e.detail?.context || {}),
    })
    activeModule.value = 'telegram'
    console.log(e)
  }
  document.addEventListener('orion:open-telegram', openTelegramListener)

  openModuleListener = (e) => {
    dismissStudyHubSurface()
    showingIntegrations.value = false
    const module = e.detail?.module || null
    setModuleContext(module ? {
      module,
      ...(e.detail?.context || {}),
    } : null)
    activeModule.value = module
  }
  document.addEventListener('orion:open-module', openModuleListener)

  openIntegrationsListener = (e) => {
    onOpenIntegrations(e.detail?.focusType || null)
  }
  document.addEventListener('orion:open-integrations', openIntegrationsListener)

  openStudyHubListener = (e) => {
    const topicId = e.detail?.topicId || null
    if (topicId) openStudyTopic(topicId)
    else openStudyHub()
  }
  document.addEventListener('orion:open-study-hub', openStudyHubListener)

  if (store.token) {
    authBooting.value = true
    api.defaults.headers.common['Authorization'] = `Bearer ${store.token}`
    try {
      await handleAuthenticatedEntry({
        route: initialRoute,
        preserveExplicitPath: true,
      })
    } catch {
      logout()
    } finally {
      authBooting.value = false
    }
  } else {
    authBooting.value = false
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyboard)
  if (openTelegramListener) document.removeEventListener('orion:open-telegram', openTelegramListener)
  if (openModuleListener) document.removeEventListener('orion:open-module', openModuleListener)
  if (openIntegrationsListener) document.removeEventListener('orion:open-integrations', openIntegrationsListener)
  if (openStudyHubListener) document.removeEventListener('orion:open-study-hub', openStudyHubListener)
  window.removeEventListener('popstate', handlePopState)
  window.removeEventListener('resize', updateViewportWidth)
  stop()
})

watch(isNavigationOverlayMode, (isOverlay) => {
  if (!isOverlay) return
  mobileSidebarOpen.value = false
})

// ── Auth ──────────────────────────────────────────────────
async function onLoginSuccess(payload = {}) {
  authBooting.value = true
  api.defaults.headers.common['Authorization'] = `Bearer ${store.token}`
  try {
    await handleAuthenticatedEntry({
      route: {
        module: null,
        integrations: false,
        sessionId: null,
        isNewChat: true,
        onboardingRoute: null,
        isWorkspaceBriefingHome: true,
      },
      preserveExplicitPath: false,
      preferWorkspaceBriefing: payload?.redirectTo === WORKSPACE_BRIEFING_PATH,
    })
  } catch {
    logout()
  } finally {
    authBooting.value = false
  }
}

function logout() {
  stop()
  clearAuth()
  delete api.defaults.headers.common['Authorization']
  authBooting.value = false
  resetSurfaceState()
  pushRouteIfChanged('/')
}

function openSidebar() {
  if (isNavigationOverlayMode.value) {
    mobileSidebarOpen.value = true
    return
  }
  desktopSidebarCollapsed.value = false
}

function closeSidebar() {
  if (isNavigationOverlayMode.value) {
    mobileSidebarOpen.value = false
    return
  }
  desktopSidebarCollapsed.value = true
}

function maybeCollapseSidebarAfterNavigation() {
  if (!isNavigationOverlayMode.value) return
  mobileSidebarOpen.value = false
}

// ── Navigation ────────────────────────────────────────────
// Sidebar / module navigation always exits the Study Hub surface, otherwise
// the v-else-if="showStudyHub" branch keeps StudyHubPage rendered.
function dismissStudyHubSurface() {
  showStudyHub.value = false
  studyTopicId.value = null
}

function onOpenIntegrations(focusType) {
  dismissStudyHubSurface()
  maybeCollapseSidebarAfterNavigation()
  integrationsFocusType.value = focusType || null
  showingIntegrations.value = true
  setModuleContext(null)
  activeModule.value = null
}

function onOpenIntegration(id) {
  dismissStudyHubSurface()
  maybeCollapseSidebarAfterNavigation()
  showingIntegrations.value = false
  setModuleContext(null)
  activeModule.value = id
}

function onOpenModuleFromSettings(id) {
  onOpenIntegration(id)
}

function closeModule() {
  dismissStudyHubSurface()
  activeModule.value = null
  setModuleContext(null)
  showingIntegrations.value = true   // go back to integrations settings
}

function openDatabaseWorkspace() {
  dismissStudyHubSurface()
  maybeCollapseSidebarAfterNavigation()
  activeModule.value = null
  showingIntegrations.value = false
  setModuleContext(null)
  setMode('db')
  store.webMode = false
  nextTick(() => inputAreaRef.value?.focusInput?.())
}

function openRazorpayWorkspace(prompt = '') {
  dismissStudyHubSurface()
  maybeCollapseSidebarAfterNavigation()
  activeModule.value = null
  showingIntegrations.value = false
  setModuleContext(null)
  setMode('agent')
  store.webMode = false
  nextTick(() => {
    if (prompt) inputAreaRef.value?.setText?.(prompt, 'agent')
    else inputAreaRef.value?.focusInput?.()
  })
}

// ── Session ───────────────────────────────────────────────
async function switchSession(sessionId) {
  dismissStudyHubSurface()
  maybeCollapseSidebarAfterNavigation()
  activeModule.value = null   // ← close any open module
  showingIntegrations.value = false  // ← close settings too
  setModuleContext(null)
  await _switchSession(sessionId)
  pushChatSessionRoute(sessionId)
  await nextTick()
  messageListRef.value?.scrollToBottom()
}

async function onNewChatRequested() {
  dismissStudyHubSurface()
  maybeCollapseSidebarAfterNavigation()
  activeModule.value = null
  showingIntegrations.value = false
  activeOnboardingRoute.value = null
  setMode('chat')
  store.webMode = false
  // Push "/" first so the URL reflects the home/new-chat view immediately,
  // even before startNewChat() finishes hitting the server.
  pushRouteIfChanged('/')
  await startNewChat()
}

// ── Chat ──────────────────────────────────────────────────
async function onSend(message) {
  if (store.mode === 'agent') {
    const result = await handleAgentMessage(
      message,
      () => messageListRef.value?.scrollToBottom(),
      (preview) => confirmRef.value?.show(preview)
    )
    if (result === true || result === 'needs_params') return
    await sendMessage(
      message,
      () => messageListRef.value?.scrollToBottom(),
      () => messageListRef.value?.scrollDuringStream(),
      true
    )
    return
  }
  await sendMessage(
    message,
    () => messageListRef.value?.scrollToBottom(),
    () => messageListRef.value?.scrollDuringStream()
  )
}

async function onAgentParamsSubmit(values) {
  await provideMissingParams(
    values,
    () => messageListRef.value?.scrollToBottom(),
    (preview) => confirmRef.value?.show(preview)
  )
}

async function onRegenerate() {
  await regenerate(
    () => messageListRef.value?.scrollToBottom(),
    () => messageListRef.value?.scrollDuringStream()
  )
}

function onStop() {
  stopAgent()
  stopChat()
}

function usePrompt(prompt) {
  const mode = prompt.mode || 'chat'
  const text = prompt.prompt || prompt.text || ''

  setMode(mode)

  if (text) {
    if (prompt.sendNow) inputAreaRef.value?.setTextAndSend?.(text, mode)
    else inputAreaRef.value?.setText?.(text, mode)
    return
  }

  inputAreaRef.value?.focusInput()
}

async function onUpload({ file, type }) {
  await handleFileSelect(file, type)
}

// ── Keyboard shortcuts ────────────────────────────────────
function handleKeyboard(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    startNewChat()
  }
  if ((e.metaKey || e.ctrlKey) && e.key === '/') {
    e.preventDefault()
    if (sidebarCollapsed.value) {
      openSidebar()
      nextTick(() => sidebarRef.value?.focusSearch?.())
      return
    }
    sidebarRef.value?.focusSearch?.()
  }
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'E') {
    e.preventDefault()
    if (store.messages.length) exportChatPDF()
  }
  if (e.key === 'Escape') {
    inputAreaRef.value?.closeMenus()
  }
}

// ── Export PDF ────────────────────────────────────────────
async function exportChatPDF() {
  const title = store.sessions.find(s => s.sessionId === store.currentSessionId)?.title || 'OrionAI Chat'
  const content = document.createElement('div')
  content.style.cssText = 'font-family:-apple-system,sans-serif;padding:40px;color:#1a1a1a;max-width:800px;'
  content.innerHTML = `
    <div style="border-bottom:2px solid #6366f1;padding-bottom:16px;margin-bottom:24px;">
      <h1 style="margin:0;font-size:20px;">🔭 OrionAI</h1>
      <p style="margin:4px 0 0;color:#666;font-size:13px;">${title} · Exported ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
    </div>
    ${store.messages.map(m => `
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;font-weight:600;color:${m.role === 'user' ? '#6366f1' : '#666'};text-transform:uppercase;margin-bottom:6px;">
          ${m.role === 'user' ? '👤 You' : '🔭 OrionAI'}
        </div>
        <div style="background:${m.role === 'user' ? '#f0f4ff' : '#f8f8f8'};border-radius:8px;padding:12px 16px;font-size:13px;line-height:1.7;white-space:pre-wrap;">
          ${m.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </div>
      </div>`).join('')}`

  await html2pdf().set({
    margin: [10, 10],
    filename: `${title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(content).save()
}

async function onOnboardingStepComplete(status = null) {
  const nextStatus = status?.nextStep ? status : await refreshOnboardingStatus()

  if (nextStatus?.user) {
    setUser(nextStatus.user)
  }

  if (nextStatus?.nextStep === 'connect_apps') {
    openOnboardingRoute('connect-apps')
    return
  }

  if (nextStatus?.nextStep === 'syncing') {
    openOnboardingRoute('syncing')
    return
  }

  await enterMainApp({
    module: null,
    integrations: false,
    sessionId: null,
    isNewChat: true,
    onboardingRoute: null,
    isWorkspaceBriefingHome: true,
  })
}
</script>

<style>
.app-auth-loading {
  min-height: 100vh;
  min-height: 100svh;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-base, #0B0D12);
}

.app-auth-loading__glow,
.app-auth-loading__grid {
  display: none;
}

.app-auth-loading__card {
  position: relative;
  z-index: 1;
  width: min(440px, 100%);
  padding: 40px 34px;
  border-radius: 12px;
  border: 1px solid var(--border-default, #232834);
  background: var(--bg-surface, #111318);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  text-align: center;
}

.app-auth-loading__logo {
  width: 64px;
  height: 64px;
  margin: 0 auto 18px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: 30px;
  background: var(--bg-elevated, #181A22);
  border: 1px solid var(--border-default, #232834);
}

.app-auth-loading__card h1 {
  margin: 0;
  color: var(--text-primary, #F5F7FA);
  font-size: clamp(24px, 4vw, 32px);
  font-weight: 600;
  line-height: 1.1;
}

.app-auth-loading__card p {
  margin: 12px auto 0;
  max-width: 32ch;
  color: var(--text-secondary, #9CA3AF);
  font-size: 14px;
  line-height: 1.6;
}

.app-auth-loading__spinner {
  width: 28px;
  height: 28px;
  margin-top: 20px;
  border-radius: 999px;
  border: 2px solid var(--border-default, #232834);
  border-top-color: var(--accent, #4F8CFF);
  display: inline-block;
  animation: app-auth-spin 0.85s linear infinite;
}

@keyframes app-auth-spin {
  to {
    transform: rotate(360deg);
  }
}

.app {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  background: var(--bg-base);
  position: relative;
  isolation: isolate;
  min-width: 0;
}

.sidebar-shell {
  position: relative;
  flex-shrink: 0;
  width: var(--sidebar-width);
  z-index: 2;
  transition: width 180ms ease;
}

.sidebar-shell-collapsed {
  width: 0;
}

.sidebar-shell-collapsed + .main {
  padding-left: var(--sidebar-dock-offset);
}

.main {
  transition: padding-left 180ms ease;
}

.sidebar-panel {
  position: relative;
  height: 100%;
  transition: transform 180ms ease, opacity 180ms ease;
}

.sidebar-panel-collapsed {
  position: absolute;
  top: 0;
  left: 0;
  opacity: 0;
  pointer-events: none;
  transform: translateX(calc(-100% - 18px));
}

.sidebar-float-dock {
  position: fixed;
  top: calc(env(safe-area-inset-top) + 14px);
  left: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 12;
}

.sidebar-float-brand,
.sidebar-float-bell {
  position: relative;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow: var(--shadow-md);
  transition: background 150ms ease, border-color 150ms ease;
}

.sidebar-float-brand:hover,
.sidebar-float-bell:hover {
  background: var(--bg-elevated);
  border-color: var(--accent);
}

.sidebar-float-brand {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 10px;
  cursor: pointer;
}

.sidebar-float-brand-mark {
  font-size: 20px;
  line-height: 1;
}

.sidebar-float-tooltip {
  position: absolute;
  left: 18px;
  top: calc(100% + 8px);
  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  transition: opacity 150ms ease, transform 150ms ease;
}

.sidebar-float-brand:hover .sidebar-float-tooltip {
  opacity: 1;
  transform: translateY(0);
}

.sidebar-float-bell {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.sidebar-float-bell.bell-active {
  border-color: var(--accent);
  color: var(--accent);
}

.sidebar-float-bell.bell-urgent {
  border-color: var(--danger);
  color: var(--danger);
}

.sidebar-float-bell-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: 999px;
  background: var(--accent);
  color: white;
  font-size: 8px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--bg-base);
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.sidebar-backdrop {
  position: absolute;
  inset: 0;
  z-index: 20;
  border: 0;
  background: rgba(0, 0, 0, 0.5);
  cursor: pointer;
}

.split-view {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.chat-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  position: relative;
}

.app-aurora,
.app-grid-glow {
  display: none;
}

@media (max-width: 1024px) {
  .sidebar-shell,
  .sidebar-shell-collapsed {
    position: absolute;
    inset: 0 auto 0 0;
    width: auto;
    z-index: 30;
  }

  .sidebar-shell-collapsed + .main {
    padding-left: 0;
  }

  .sidebar-panel {
    width: min(var(--sidebar-mobile-width), calc(100vw - 16px));
    border-radius: 0 12px 12px 0;
    box-shadow: var(--shadow-lg);
  }

  .sidebar-float-dock {
    top: calc(env(safe-area-inset-top) + 12px);
    left: 12px;
  }
}

@media (max-width: 640px) {
  .sidebar-panel {
    width: min(var(--sidebar-mobile-width), calc(100vw - 12px));
    border-radius: 0 12px 12px 0;
  }

  .sidebar-float-brand,
  .sidebar-float-bell {
    width: 38px;
    height: 38px;
    border-radius: 8px;
  }

  .sidebar-float-brand-mark {
    font-size: 17px;
  }
}
</style>
