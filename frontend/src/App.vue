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
    <div v-else class="app">
      <div class="app-aurora app-aurora-cyan" aria-hidden="true"></div>
      <div class="app-aurora app-aurora-violet" aria-hidden="true"></div>
      <div class="app-grid-glow" aria-hidden="true"></div>
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
          @closeSidebar="sidebarCollapsed = true"
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
          <div class="split-view">
            <div class="chat-pane">
              <DocPanel />
              <MessageList ref="messageListRef" @usePrompt="usePrompt" @regenerate="onRegenerate" />
              <InputArea ref="inputAreaRef" @send="onSend" @upload="onUpload" @removeFile="removeAttachment"
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
const { sendMessage, regenerate } = useChat()
const { handleFileSelect, removeAttachment, connectDatabase } = useFiles()
const { handleAgentMessage, provideMissingParams, pendingParams } = useAgent()
const { start, stop, unreadNotifCount, hasUrgent } = useWebSocket()
// Refs
const sidebarRef = ref(null)
const sidebarCollapsed = ref(false)

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
  window.copyCode = (btn) => {
    const code = btn.closest('.code-block').querySelector('code').innerText
    navigator.clipboard.writeText(code)
    btn.textContent = 'Copied!'
    setTimeout(() => btn.textContent = 'Copy', 2000)
  }
  document.addEventListener('keydown', handleKeyboard)
  document.addEventListener('click', () => inputAreaRef.value?.closeMenus())
  window.addEventListener('popstate', handlePopState)
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
  stop()
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
  sidebarCollapsed.value = false
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
  integrationsFocusType.value = focusType || null
  showingIntegrations.value = true
  setModuleContext(null)
  activeModule.value = null
}

function onOpenIntegration(id) {
  dismissStudyHubSurface()
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
  activeModule.value = null
  showingIntegrations.value = false
  setModuleContext(null)
  setMode('db')
  store.webMode = false
  nextTick(() => inputAreaRef.value?.focusInput?.())
}

function openRazorpayWorkspace(prompt = '') {
  dismissStudyHubSurface()
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
  background:
    radial-gradient(circle at top, rgba(82, 212, 255, 0.14), transparent 34%),
    linear-gradient(180deg, #040713 0%, #050816 48%, #070d1c 100%);
}

.app-auth-loading__glow,
.app-auth-loading__grid {
  position: absolute;
  pointer-events: none;
}

.app-auth-loading__glow {
  width: 40rem;
  height: 40rem;
  border-radius: 999px;
  filter: blur(96px);
  opacity: 0.3;
}

.app-auth-loading__glow--cyan {
  top: -12rem;
  right: 12%;
  background: radial-gradient(circle, rgba(82, 212, 255, 0.28) 0%, rgba(82, 212, 255, 0.08) 38%, transparent 72%);
}

.app-auth-loading__glow--violet {
  bottom: -16rem;
  left: 12%;
  background: radial-gradient(circle, rgba(139, 125, 255, 0.26) 0%, rgba(139, 125, 255, 0.08) 34%, transparent 72%);
}

.app-auth-loading__grid {
  display: none;
}

.app-auth-loading__card {
  position: relative;
  z-index: 1;
  width: min(480px, 100%);
  padding: 40px 34px;
  border-radius: 30px;
  border: 1px solid rgba(137, 157, 213, 0.18);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
    rgba(9, 14, 30, 0.88);
  box-shadow: 0 30px 80px rgba(2, 6, 23, 0.42);
  backdrop-filter: blur(28px);
  text-align: center;
}

.app-auth-loading__logo {
  width: 72px;
  height: 72px;
  margin: 0 auto 18px;
  border-radius: 24px;
  display: grid;
  place-items: center;
  font-size: 34px;
  background:
    radial-gradient(circle at 40% 35%, rgba(210, 234, 255, 0.96), rgba(196, 201, 255, 0.78) 28%, rgba(111, 142, 255, 0.16) 32%, transparent 56%),
    linear-gradient(180deg, rgba(62, 129, 255, 0.22), rgba(85, 104, 255, 0.1)),
    rgba(24, 36, 72, 0.92);
  border: 1px solid rgba(93, 139, 255, 0.24);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 20px 34px rgba(44, 90, 255, 0.16);
}

.app-auth-loading__card h1 {
  margin: 0;
  color: #f8fbff;
  font-size: clamp(28px, 4vw, 38px);
  line-height: 1.05;
}

.app-auth-loading__card p {
  margin: 14px auto 0;
  max-width: 32ch;
  color: rgba(207, 217, 238, 0.76);
  font-size: 15px;
  line-height: 1.65;
}

.app-auth-loading__spinner {
  width: 34px;
  height: 34px;
  margin-top: 22px;
  border-radius: 999px;
  border: 2px solid rgba(168, 190, 255, 0.16);
  border-top-color: rgba(108, 210, 255, 0.92);
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
  height: 100vh;
  overflow: hidden;
  background: var(--bg-base);
  position: relative;
  isolation: isolate;
}

.sidebar-shell {
  position: relative;
  flex-shrink: 0;
  z-index: 2;
  transition: width 180ms ease;
}

.sidebar-shell-collapsed {
  width: 0;
}

.sidebar-shell-collapsed + .main {
  padding-left: 124px;
}

.main {
  transition: padding-left 180ms ease;
}

.sidebar-panel {
  position: relative;
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
  position: absolute;
  top: 14px;
  left: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 12;
}

.sidebar-float-brand,
.sidebar-float-bell {
  position: relative;
  border: 1px solid rgba(176, 201, 255, 0.16);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015)),
    rgba(8, 14, 30, 0.88);
  color: var(--text-primary);
  box-shadow: 0 18px 42px rgba(2, 6, 23, 0.28);
  backdrop-filter: blur(24px);
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.sidebar-float-brand:hover,
.sidebar-float-bell:hover {
  transform: translateY(-1px);
  border-color: rgba(82, 212, 255, 0.24);
}

.sidebar-float-brand {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 18px;
  cursor: pointer;
}

.sidebar-float-brand-mark {
  font-size: 21px;
  line-height: 1;
  filter: drop-shadow(0 8px 16px rgba(82, 212, 255, 0.18));
}

.sidebar-float-tooltip {
  position: absolute;
  left: 18px;
  top: calc(100% + 8px);
  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid rgba(176, 201, 255, 0.14);
  background: rgba(9, 16, 34, 0.94);
  color: rgba(226, 232, 240, 0.82);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  transition: opacity 160ms ease, transform 160ms ease;
}

.sidebar-float-brand:hover .sidebar-float-tooltip {
  opacity: 1;
  transform: translateY(0);
}

.sidebar-float-bell {
  width: 46px;
  height: 46px;
  border-radius: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.sidebar-float-bell.bell-active {
  border-color: rgba(82, 212, 255, 0.28);
  color: var(--accent-hover);
}

.sidebar-float-bell.bell-urgent {
  border-color: rgba(255, 107, 127, 0.38);
  color: #ff8ea1;
}

.sidebar-float-bell-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.92), rgba(139, 125, 255, 0.84));
  color: white;
  font-size: 8px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid rgba(8, 14, 30, 0.94);
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
  position: absolute;
  inset: auto;
  pointer-events: none;
  z-index: 0;
}

.app-aurora {
  width: 44rem;
  height: 44rem;
  border-radius: 999px;
  filter: blur(90px);
  opacity: 0.34;
}

.app-aurora-cyan {
  top: -10rem;
  right: 18%;
  background: radial-gradient(circle, rgba(82, 212, 255, 0.28) 0%, rgba(82, 212, 255, 0.08) 36%, transparent 72%);
}

.app-aurora-violet {
  bottom: -16rem;
  left: 20%;
  background: radial-gradient(circle, rgba(139, 125, 255, 0.28) 0%, rgba(139, 125, 255, 0.08) 34%, transparent 72%);
}

.app-grid-glow {
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.015), transparent 24%),
    radial-gradient(circle at 58% 12%, rgba(82, 212, 255, 0.08), transparent 22%),
    radial-gradient(circle at 82% 82%, rgba(139, 125, 255, 0.08), transparent 24%);
  opacity: 0.8;
}
</style>
