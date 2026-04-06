<template>
  <div>
    <LoginScreen v-if="!isLoggedIn" @success="onLoginSuccess" />
    <div v-else class="app">
      <div class="app-aurora app-aurora-cyan" aria-hidden="true"></div>
      <div class="app-aurora app-aurora-violet" aria-hidden="true"></div>
      <div class="app-grid-glow" aria-hidden="true"></div>
      <OnboardingFlow ref="onboardingRef" @done="() => { }" @openIntegrations="onOpenIntegrations"
        @runCommand="onOnboardingCommand" />
      <Sidebar ref="sidebarRef" :activeView="activeModule || (showingIntegrations ? 'settings' : (store.mode === 'db' ? 'database' : 'agent'))"
        :showingIntegrations="showingIntegrations"
        @newChat="() => { activeModule = null; showingIntegrations = false; setMode('chat'); store.webMode = false; startNewChat() }"
        @switchSession="switchSession" @deleteSession="deleteSession" @logout="logout"
        @openIntegrations="onOpenIntegrations" @openIntegration="onOpenIntegration" />
       

      <div class="main">

        <!-- ── Integration settings (inside main, sidebar stays visible) ── -->
        <IntegrationsPage v-if="showingIntegrations" :key="`integrations-${store.user?.username || 'anon'}`" @close="showingIntegrations = false; activeModule = null"
          @connected="sidebarRef?.refreshConnected?.($event)" @openModule="onOpenModuleFromSettings" />

        <!-- ── Module pages (inside main, sidebar stays visible) ── -->
        <TelegramPage v-else-if="activeModule === 'telegram'" @close="closeModule" />
        <GmailPage v-else-if="activeModule === 'gmail'" @close="closeModule" />
        <SlackPage v-else-if="activeModule === 'slack'" @close="closeModule" />
        <JiraPage v-else-if="activeModule === 'jira'" @close="closeModule" />
        <CalendarPage v-else-if="activeModule === 'calendar' || activeModule === 'google_calendar'"
          @close="closeModule" />
        <SignalPage
          v-else-if="activeModule === 'signal'"
          @close="closeModule"
          @open-integrations="onOpenIntegrations"
        />
        <WhatsAppPage v-else-if="activeModule === 'whatsapp'" @close="closeModule" />
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
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { store, clearAuth, setMode, setModuleContext } from './stores/app'
import { useSession } from './composables/useSession'
import { useChat } from './composables/useChat'
import { useFiles } from './composables/useFiles'
import { useAgent } from './composables/useAgent'
import { useWebSocket } from './composables/useWebSocket'
import api from './services/api'
import html2pdf from 'html2pdf.js'

// Layout
import LoginScreen from './components/auth/LoginScreen.vue'
import Sidebar from './components/layout/MainSidebar.vue'
import MainHeader from './components/layout/MainHeader.vue'

// Chat
import MessageList from './components/chat/MessageList.vue'
import InputArea from './components/input/InputArea.vue'
import DocPanel from './components/rag/DocPanel.vue'
import CanvasPane from './components/canvas/CanvasPane.vue'
import ParamPrompt from './components/agent/ParamPrompt.vue'
import OnboardingFlow from './components/onboarding/OnboardingFlow.vue'

// Integrations & modules
import IntegrationsPage from './components/integrations/IntegrationsPage.vue'
import NotificationToast from './components/notification/NotificationToast.vue'
import TelegramPage from './views/TelegramPage.vue'
import GmailPage from './views/GmailPage.vue'
import SlackPage from './views/SlackPage.vue'
import JiraPage from './views/JiraPage.vue'
import CalendarPage from './views/CalendarPage.vue'
import SignalPage from './views/SignalPage.vue'
import WhatsAppPage from './views/WhatsAppPage.vue'
import DatabasePage from './views/DatabasePage.vue'
import RazorpayPage from './views/RazorpayPage.vue'

import AgentConfirmModal from './components/agent/AgentConfirmModal.vue'
//Notifications

const isLoggedIn = computed(() => !!store.token && !!store.user)

// Composables
const { loadSessions, startNewChat, switchSession: _switchSession, deleteSession } = useSession()
const { sendMessage, regenerate } = useChat()
const { handleFileSelect, removeAttachment, connectDatabase } = useFiles()
const { handleAgentMessage, provideMissingParams, pendingParams } = useAgent()
const { start, stop } = useWebSocket()
// Refs
const sidebarRef = ref(null)
const showingIntegrations = ref(false)
const activeModule = ref(null)   // null | 'telegram' | 'gmail' | 'slack' | 'jira' | 'calendar'
const messageListRef = ref(null)
const inputAreaRef = ref(null)
const onboardingRef = ref(null)
const confirmRef = ref(null)
let openTelegramListener = null
let openModuleListener = null

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
  // Listen for TelegramRenderer "Open chat" button
  openTelegramListener = (e) => {
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
    showingIntegrations.value = false
    const module = e.detail?.module || null
    setModuleContext(module ? {
      module,
      ...(e.detail?.context || {}),
    } : null)
    activeModule.value = module
  }
  document.addEventListener('orion:open-module', openModuleListener)

  if (store.token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${store.token}`
    try {
      await api.get('/auth/me')
      await loadSessions()
      if (store.sessions.length === 0) await startNewChat()
      else {
        store.currentSessionId = store.sessions[0].sessionId
        await switchSession(store.currentSessionId)
      }
      start()
    } catch { logout() }
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyboard)
  if (openTelegramListener) document.removeEventListener('orion:open-telegram', openTelegramListener)
  if (openModuleListener) document.removeEventListener('orion:open-module', openModuleListener)
  stop()
})

// ── Auth ──────────────────────────────────────────────────
async function onLoginSuccess() {
  api.defaults.headers.common['Authorization'] = `Bearer ${store.token}`
  await loadSessions()
  if (store.sessions.length === 0) await startNewChat()
  else {
    store.currentSessionId = store.sessions[0].sessionId
    await switchSession(store.currentSessionId)
  }
  start()
}

function logout() {
  stop()
  clearAuth()
  delete api.defaults.headers.common['Authorization']
}

// ── Navigation ────────────────────────────────────────────
function onOpenIntegrations() {
  showingIntegrations.value = true
  setModuleContext(null)
  activeModule.value = null
}

function onOpenIntegration(id) {
  showingIntegrations.value = false
  setModuleContext(null)
  activeModule.value = id
}

function onOpenModuleFromSettings(id) {
  onOpenIntegration(id)
}

function closeModule() {
  activeModule.value = null
  setModuleContext(null)
  showingIntegrations.value = true   // go back to integrations settings
}

function openDatabaseWorkspace() {
  activeModule.value = null
  showingIntegrations.value = false
  setModuleContext(null)
  setMode('db')
  store.webMode = false
  nextTick(() => inputAreaRef.value?.focusInput?.())
}

function openRazorpayWorkspace(prompt = '') {
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
  activeModule.value = null   // ← close any open module
  showingIntegrations.value = false  // ← close settings too
  setModuleContext(null)
  await _switchSession(sessionId)
  await nextTick()
  messageListRef.value?.scrollToBottom()
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
    sidebarRef.value?.searchInputRef?.focus()
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

function onOnboardingCommand(command) {
  // Close any open modules, go to chat
  activeModule.value = null
  showingIntegrations.value = false

  // Wait for next tick then fire the command in agent mode
  nextTick(() => {
    inputAreaRef.value?.setMode?.('agent')
    inputAreaRef.value?.setTextAndSend?.(command)
      // Fallback if setTextAndSend not available — just prefill
      || (inputAreaRef.value?.setText?.(command))
  })
}

// function showOnboarding() {
//   onboardingRef.value?.show()
// }
</script>

<style>
.app {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-base);
  position: relative;
  isolation: isolate;
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
