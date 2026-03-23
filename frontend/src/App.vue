<template>
  <div>
    <LoginScreen v-if="!isLoggedIn" @success="onLoginSuccess" />

    <div v-else class="app">
      <Sidebar ref="sidebarRef"
        :activeView="activeModule || (showingIntegrations ? 'settings' : 'agent')"
        :showingIntegrations="showingIntegrations"
        @newChat="() => { activeModule = null; showingIntegrations = false; startNewChat() }"
        @switchSession="switchSession"
        @deleteSession="deleteSession"
        @logout="logout"
        @openIntegrations="onOpenIntegrations"
        @openIntegration="onOpenIntegration" />

      <div class="main">

        <!-- ── Integration settings (inside main, sidebar stays visible) ── -->
        <IntegrationsPage
          v-if="showingIntegrations"
          @close="showingIntegrations = false; activeModule = null"
          @connected="sidebarRef?.refreshConnected?.()"
          @openModule="onOpenModuleFromSettings" />

        <!-- ── Module pages (inside main, sidebar stays visible) ── -->
        <TelegramPage  v-else-if="activeModule === 'telegram'"  @close="closeModule" />
        <GmailPage     v-else-if="activeModule === 'gmail'"     @close="closeModule" />
        <SlackPage     v-else-if="activeModule === 'slack'"     @close="closeModule" />
        <JiraPage      v-else-if="activeModule === 'jira'"      @close="closeModule" />
        <CalendarPage  v-else-if="activeModule === 'calendar' || activeModule === 'google_calendar'" @close="closeModule" />
        <WhatsAppPage v-else-if="activeModule === 'whatsapp'" @close="closeModule" />

        <!-- ── Normal chat view ── -->
        <template v-else>
          <MainHeader @exportPDF="exportChatPDF" @openModule="onOpenModuleFromSettings" />
          <div class="split-view">
            <div class="chat-pane">
              <DocPanel />
              <MessageList ref="messageListRef"
                @usePrompt="usePrompt"
                @regenerate="onRegenerate" />
              <InputArea ref="inputAreaRef"
                @send="onSend"
                @upload="onUpload"
                @removeFile="removeAttachment"
                @connectDB="connectDatabase" />
              <ParamPrompt
                v-if="pendingParams"
                :pending="pendingParams"
                @submit="onAgentParamsSubmit"
                @cancel="pendingParams = null" />
            </div>
            <CanvasPane />
          </div>
        </template>

      </div>
      <!-- Floating notification bell — visible across all views -->
      <!-- <FloatingNotificationBell @openModule="onOpenModuleFromSettings" /> -->
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { store, clearAuth, setMode } from './stores/app'
import { useSession } from './composables/useSession'
import { useChat } from './composables/useChat'
import { useFiles }  from './composables/useFiles'
import { useAgent }  from './composables/useAgent'
import { useWebSocket } from './composables/useWebSocket'
import api from './services/api'
import html2pdf from 'html2pdf.js'

// Layout
import LoginScreen from './components/auth/LoginScreen.vue'
import Sidebar     from './components/layout/MainSidebar.vue'
import MainHeader  from './components/layout/MainHeader.vue'

// Chat
import MessageList from './components/chat/MessageList.vue'
import InputArea   from './components/input/InputArea.vue'
import DocPanel    from './components/rag/DocPanel.vue'
import CanvasPane  from './components/canvas/CanvasPane.vue'
import ParamPrompt from './components/agent/ParamPrompt.vue'

// Integrations & modules
import IntegrationsPage from './components/integrations/IntegrationsPage.vue'
// import FloatingNotificationBell from './components/notification/FloatingNotificationBell.vue'
import TelegramPage  from './views/TelegramPage.vue'
import GmailPage     from './views/GmailPage.vue'
import SlackPage     from './views/SlackPage.vue'
import JiraPage      from './views/JiraPage.vue'
import CalendarPage  from './views/CalendarPage.vue'
import WhatsAppPage from './views/WhatsAppPage.vue'

//Notifications

const isLoggedIn = computed(() => !!store.token && !!store.user)

// Composables
const { loadSessions, startNewChat, switchSession: _switchSession, deleteSession } = useSession()
const { sendMessage, regenerate } = useChat()
const { handleFileSelect, removeAttachment, connectDatabase } = useFiles()
const { handleAgentMessage, provideMissingParams, pendingParams } = useAgent()
const { start, stop } = useWebSocket()
// Refs
const sidebarRef          = ref(null)
const showingIntegrations = ref(false)
const activeModule        = ref(null)   // null | 'telegram' | 'gmail' | 'slack' | 'jira' | 'calendar'
const messageListRef      = ref(null)
const inputAreaRef        = ref(null)

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
  document.addEventListener('orion:open-telegram', (e) => {
    showingIntegrations.value = false
    activeModule.value = 'telegram'
    console.log(e)
  })

  document.addEventListener('orion:open-module', (e) => {
    showingIntegrations.value = false
    activeModule.value = e.detail?.module || null
  })

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
  document.removeEventListener('orion:open-telegram', () => {})
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
  clearAuth()
  delete api.defaults.headers.common['Authorization']
}

// ── Navigation ────────────────────────────────────────────
function onOpenIntegrations() {
  showingIntegrations.value = true
  activeModule.value = null
}

function onOpenIntegration(id) {
  showingIntegrations.value = false
  activeModule.value = id
}

function onOpenModuleFromSettings(id) {
  showingIntegrations.value = false
  activeModule.value = id
}

function closeModule() {
  activeModule.value = null
  showingIntegrations.value = true   // go back to integrations settings
}

// ── Session ───────────────────────────────────────────────
async function switchSession(sessionId) {
  activeModule.value        = null   // ← close any open module
  showingIntegrations.value = false  // ← close settings too
  await _switchSession(sessionId)
  await nextTick()
  messageListRef.value?.scrollToBottom()
}

// ── Chat ──────────────────────────────────────────────────
async function onSend(message) {
  if (store.mode === 'agent') {
    const result = await handleAgentMessage(
      message,
      () => messageListRef.value?.scrollToBottom()
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
  await provideMissingParams(values, () => messageListRef.value?.scrollToBottom())
}

async function onRegenerate() {
  await regenerate(
    () => messageListRef.value?.scrollToBottom(),
    () => messageListRef.value?.scrollDuringStream()
  )
}

function usePrompt(prompt) {
  setMode(prompt.mode)
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
      <p style="margin:4px 0 0;color:#666;font-size:13px;">${title} · Exported ${new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</p>
    </div>
    ${store.messages.map(m => `
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;font-weight:600;color:${m.role==='user'?'#6366f1':'#666'};text-transform:uppercase;margin-bottom:6px;">
          ${m.role === 'user' ? '👤 You' : '🔭 OrionAI'}
        </div>
        <div style="background:${m.role==='user'?'#f0f4ff':'#f8f8f8'};border-radius:8px;padding:12px 16px;font-size:13px;line-height:1.7;white-space:pre-wrap;">
          ${m.content.replace(/</g,'&lt;').replace(/>/g,'&gt;')}
        </div>
      </div>`).join('')}`

  await html2pdf().set({
    margin: [10, 10],
    filename: `${title.replace(/[^a-z0-9]/gi,'_')}_${Date.now()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(content).save()
}
</script>

<style>
.app {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-base);
}
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
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
}
</style>