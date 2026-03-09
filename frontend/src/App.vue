<template>
  <div>
    <LoginScreen v-if="!isLoggedIn" @success="onLoginSuccess" />

    <div v-else class="app">
      <Sidebar ref="sidebarRef" @newChat="startNewChat" @switchSession="switchSession" @deleteSession="deleteSession"
        @logout="logout" @openIntegrations="showIntegrations = true" />

      <div class="main">
        <MainHeader @exportPDF="exportChatPDF" />

        <div class="split-view">
          <div class="chat-pane">
            <DocPanel />

            <MessageList ref="messageListRef" @usePrompt="usePrompt" @regenerate="onRegenerate" />

            <InputArea ref="inputAreaRef" @send="onSend" @upload="onUpload" @removeFile="removeAttachment"
              @connectDB="connectDatabase" />

            <!-- Agent param prompt — appears when email/WA recipient is missing -->
            <ParamPrompt v-if="pendingParams" :pending="pendingParams" @submit="onAgentParamsSubmit"
              @cancel="pendingParams = null" />
          </div>

          <CanvasPane />
          <IntegrationsPage v-if="showIntegrations" @close="showIntegrations = false" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { store, clearAuth, setMode } from './stores/app'
import { useSession } from './composables/useSession'
import { useChat } from './composables/useChat'
import { useFiles } from './composables/useFiles'
import { useAgent } from './composables/useAgent'
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
import IntegrationsPage from './components/integrations/IntegrationsPage.vue'
const isLoggedIn = computed(() => !!store.token && !!store.user)

// Composables
const { loadSessions, startNewChat, switchSession: _switchSession, deleteSession } = useSession()
const { sendMessage, regenerate } = useChat()
const { handleFileSelect, removeAttachment, connectDatabase } = useFiles()
const { handleAgentMessage, provideMissingParams, pendingParams } = useAgent()

// Refs
const sidebarRef = ref(null)
const messageListRef = ref(null)
const inputAreaRef = ref(null)
const showIntegrations = ref(false)
// ── Init ──────────────────────────────────────────────────
onMounted(async () => {
  // Global copy function for code blocks
  window.copyCode = (btn) => {
    const code = btn.closest('.code-block').querySelector('code').innerText
    navigator.clipboard.writeText(code)
    btn.textContent = 'Copied!'
    setTimeout(() => btn.textContent = 'Copy', 2000)
  }

  document.addEventListener('keydown', handleKeyboard)
  document.addEventListener('click', () => inputAreaRef.value?.closeMenus())

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
    } catch { logout() }
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyboard)
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
}

function logout() {
  clearAuth()
  delete api.defaults.headers.common['Authorization']
}

// ── Session wrapper with scroll ─────────────────────────────
async function switchSession(sessionId) {
  await _switchSession(sessionId)
  await nextTick()
  messageListRef.value?.scrollToBottom()
}

// ── Chat actions ──────────────────────────────────────────
async function onSend(message) {
  // Agent mode — check intent first
  if (store.mode === 'agent') {
    const result = await handleAgentMessage(
      message,
      () => messageListRef.value?.scrollToBottom()
    )
    if (result === true || result === 'needs_params') return
    // result === false = not an agent task, but user msg already pushed
    // pass true to sendMessage to skip pushing user msg again
    await sendMessage(
      message,
      () => messageListRef.value?.scrollToBottom(),
      () => messageListRef.value?.scrollDuringStream(),
      true  // skipUserMessage — already added by useAgent
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
    () => messageListRef.value?.scrollToBottom()
  )
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
  // pre-fill input via event — InputArea handles its own state
  // simplest: emit to InputArea to set its input value
}

// ── Files ─────────────────────────────────────────────────
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
</script>