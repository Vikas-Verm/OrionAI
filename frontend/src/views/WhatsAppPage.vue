<template>
    <div class="wa-page">
  
      <!-- ── Sidebar: chat list ────────────────────────────────────────── -->
      <div class="wa-sidebar">
        <div class="wa-sidebar-head">
          <div class="wa-sidebar-title">
            <span style="font-size:18px">💬</span>
            WhatsApp
          </div>
          <button class="wa-icon-btn" title="Refresh" @click="loadChats">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
        </div>
  
        <!-- Search -->
        <div class="wa-search-wrap">
          <input v-model="search" class="wa-search" placeholder="Search chats..." />
        </div>

        <div v-if="isConnected" class="wa-action-panel-wrap">
          <CommunicationInsightsWidget
            title="OrionAI insights"
            panel-title="Reply / Action Required"
            :panel-headline="'WhatsApp chats OrionAI believes are truly waiting on you'"
            :summary-text="whatsappActionSummary"
            :counts="whatsappActionCounts"
            :items="whatsappActionItems"
            :groups="whatsappActionGroups"
            :loading="whatsappActionsLoading"
            :selected-conversation-id="selectedChat?.id"
            @refresh="refreshWhatsAppActions"
            @open="openWhatsAppActionConversation"
            @draft="draftWhatsAppActionConversation"
            @done="completeWhatsAppAction"
            @snooze="snoozeWhatsAppAction"
            @dismiss="dismissWhatsAppAction"
          />
        </div>
  
        <!-- Loading -->
        <div v-if="loading" class="wa-loading">
          <span class="wa-spinner"></span> Loading chats...
        </div>
  
        <!-- Not connected -->
        <div v-else-if="!isConnected" class="wa-not-connected">
          <div style="font-size:32px;margin-bottom:8px">💬</div>
          <div style="font-weight:600;margin-bottom:4px">WhatsApp not connected</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Connect WhatsApp in Integrations</div>
          <button class="wa-connect-btn" @click="$emit('close')">Go to Integrations</button>
        </div>
  
        <!-- Chat list -->
        <div v-else class="wa-chat-list">
          <div
            v-for="chat in filteredChats"
            :key="chat.id"
            class="wa-chat-item"
            :class="{ active: selectedChat?.id === chat.id }"
            @click="selectChat(chat)"
          >
            <div class="wa-chat-avatar" :class="{ 'is-group': chat.isGroup }">
              {{ avatarInitials(chat.name) }}
            </div>
            <div class="wa-chat-info">
              <div class="wa-chat-name-row">
                <div class="wa-chat-name">{{ chat.name }}</div>
                <span v-if="whatsappActionState(chat.id)" class="wa-action-chip" :class="`state-${whatsappActionState(chat.id).actionState}`">
                  {{ whatsappActionState(chat.id).actionStateLabel }}
                </span>
              </div>
              <div class="wa-chat-preview">{{ chat.lastMessage || '...' }}</div>
            </div>
            <div class="wa-chat-meta">
              <span v-if="chat.unread > 0" class="wa-unread-badge">{{ chat.unread }}</span>
              <span v-if="chat.pinned" class="wa-pin">📌</span>
            </div>
          </div>
          <div v-if="filteredChats.length === 0" class="wa-empty-chats">
            No chats found
          </div>
        </div>
      </div>
  
      <!-- ── Main: messages ────────────────────────────────────────────── -->
      <div class="wa-main">
  
        <!-- No chat selected -->
        <div v-if="!selectedChat" class="wa-no-chat">
          <div style="font-size:48px;margin-bottom:12px">💬</div>
          <div style="font-size:16px;font-weight:600;margin-bottom:6px">Select a chat</div>
          <div style="font-size:13px;color:var(--text-muted)">Choose from your conversations</div>
        </div>
  
        <!-- Chat view -->
        <template v-else>
  
          <!-- Chat header -->
          <div class="wa-chat-head">
            <div class="wa-chat-head-avatar">{{ avatarInitials(selectedChat.name) }}</div>
            <div class="wa-chat-head-info">
              <div class="wa-chat-head-name">{{ selectedChat.name }}</div>
              <div class="wa-chat-head-sub">{{ selectedChat.isGroup ? 'Group' : 'Contact' }}</div>
            </div>
            <button class="wa-icon-btn" @click="loadMessages(selectedChat)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
            </button>
          </div>
  
          <!-- Messages -->
          <div class="wa-messages" ref="messagesEl">
            <div v-if="msgsLoading" class="wa-loading" style="margin:auto">
              <span class="wa-spinner"></span>
            </div>
            <template v-else>
              <div
                v-for="msg in messages"
                :key="msg.id"
                class="wa-msg"
                :class="msg.fromMe ? 'wa-msg-out' : 'wa-msg-in'"
              >
                <div class="wa-msg-bubble">
                  <div v-if="!msg.fromMe && selectedChat.isGroup" class="wa-msg-sender">
                    {{ msg.from }}
                  </div>
                  <div class="wa-msg-text">{{ msg.message }}</div>
                  <div class="wa-msg-time">{{ msg.timestamp }}</div>
                </div>
              </div>
              <div v-if="messages.length === 0" class="wa-no-msgs">
                No messages yet
              </div>
            </template>
          </div>
  
          <!-- Reply box -->
          <div class="wa-reply-bar">
            <textarea
              v-model="replyText"
              class="wa-reply-input"
              placeholder="Type a message..."
              rows="1"
              @keydown.enter.exact.prevent="sendMessage"
              @input="autoResize"
              ref="replyInput"
            ></textarea>
            <button
              class="wa-send-btn"
              :disabled="!replyText.trim() || sending"
              @click="sendMessage"
            >
              <span v-if="sending" class="wa-spinner-sm"></span>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </template>
      </div>
  
    </div>
  </template>
  
  <script setup>
  import { ref, computed, nextTick, onMounted } from 'vue'
  import api from '../services/api'
  import CommunicationInsightsWidget from '../components/communications/CommunicationInsightsWidget.vue'
  import { useCommunicationActions, emitCommunicationPriorityRefresh } from '../composables/useCommunicationActions'
  import { store, setModuleContext } from '../stores/app'
  
//   const emit = defineEmits(['close'])
  
  const chats       = ref([])
  const search      = ref('')
  const selectedChat = ref(null)
  const messages    = ref([])
  const replyText   = ref('')
  const loading     = ref(false)
  const msgsLoading = ref(false)
  const sending     = ref(false)
  const isConnected = ref(false)
  const messagesEl  = ref(null)
  const replyInput  = ref(null)
  const {
    actionableItems: whatsappActionItems,
    counts: whatsappActionCounts,
    groups: whatsappActionGroups,
    loading: whatsappActionsLoading,
    summaryText: whatsappActionSummary,
    stateByConversationId: whatsappActionMap,
    refresh: refreshWhatsAppActions,
    recordAction: recordWhatsAppAction,
  } = useCommunicationActions('whatsapp')
  
  const filteredChats = computed(() =>
    search.value
      ? chats.value.filter(c => c.name.toLowerCase().includes(search.value.toLowerCase()))
      : chats.value
  )
  
  onMounted(async () => {
    await checkStatus()
    if (isConnected.value) {
      await loadChats()
      await refreshWhatsAppActions()
      await applyModuleContext()
    }
  })
  
  async function checkStatus() {
    try {
      const { data } = await api.get('/api/whatsapp/status')
      isConnected.value = data.status === 'connected'
    } catch {
      isConnected.value = false
    }
  }
  
  async function loadChats() {
    loading.value = true
    try {
      const { data } = await api.get('/api/whatsapp/chats')
      chats.value = data.chats || []
    } catch (err) {
      console.error('Failed to load chats:', err)
    } finally {
      loading.value = false
    }
  }

  function whatsappActionState(conversationId) {
    return whatsappActionMap.value[String(conversationId)] || null
  }

  async function applyModuleContext() {
    const context = store.moduleContext
    if (!context || context.module !== 'whatsapp') return

    if (context.chatId) {
      const chat = chats.value.find((item) => String(item.id) === String(context.chatId))
      if (chat) {
        await selectChat(chat)
      }
    }

    setModuleContext(null)
  }
  
  async function selectChat(chat) {
    selectedChat.value = chat
    await loadMessages(chat)
  }
  
  async function loadMessages(chat) {
    msgsLoading.value = true
    messages.value    = []
    try {
      const { data } = await api.post('/api/whatsapp/messages', {
        chatId: chat.id,
        limit:  30,
      })
      messages.value = data.messages || []
      await nextTick()
      scrollToBottom()
    } catch (err) {
      console.error('Failed to load messages:', err)
    } finally {
      msgsLoading.value = false
    }
  }

  async function openWhatsAppActionConversation(state) {
    let chat = chats.value.find((item) => String(item.id) === String(state.conversationId))
    if (!chat) {
      await loadChats()
      chat = chats.value.find((item) => String(item.id) === String(state.conversationId))
    }
    if (chat) {
      await selectChat(chat)
    }
  }

  async function draftWhatsAppActionConversation(state) {
    await openWhatsAppActionConversation(state)
    nextTick(() => replyInput.value?.focus())
  }

  async function completeWhatsAppAction(state) {
    try {
      await recordWhatsAppAction(state, 'approved')
    } catch (err) {
      console.error('Failed to complete WhatsApp action:', err.message)
    }
  }

  async function snoozeWhatsAppAction(state) {
    try {
      await recordWhatsAppAction(state, 'snoozed', { snoozeMinutes: 60 })
    } catch (err) {
      console.error('Failed to snooze WhatsApp action:', err.message)
    }
  }

  async function dismissWhatsAppAction(state) {
    try {
      await recordWhatsAppAction(state, 'dismissed')
    } catch (err) {
      console.error('Failed to dismiss WhatsApp action:', err.message)
    }
  }
  
  async function sendMessage() {
    const text = replyText.value.trim()
    if (!text || sending.value || !selectedChat.value) return
  
    sending.value = true
    try {
      await api.post('/api/whatsapp/send', {
        to:      selectedChat.value.id,
        message: text,
      })
      // Optimistically add message
      messages.value.push({
        id:        Date.now(),
        from:      'You',
        message:   text,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        fromMe:    true,
      })
      replyText.value = ''
      await nextTick()
      scrollToBottom()
      emitCommunicationPriorityRefresh('communication_replied', {
        sourceApp: 'whatsapp',
        conversationId: selectedChat.value.id,
      })
      refreshWhatsAppActions({ silent: true }).catch(() => {})
    } catch (err) {
      console.error('Send failed:', err)
    } finally {
      sending.value = false
    }
  }
  
  function scrollToBottom() {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
  }
  
  function autoResize(e) {
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }
  
  function avatarInitials(name) {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()
  }
  </script>
  
  <style scoped>
  .wa-page {
    display: flex;
    height: 100%;
    background: var(--bg-base);
    overflow: hidden;
  }
  
  /* ── Sidebar ─────────────────────────────────────────────────────────────── */
  .wa-sidebar {
    width: 300px;
    flex-shrink: 0;
    border-right: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
  }
  
  .wa-sidebar-head {
    display: flex;
    align-items: center;
    padding: 16px 14px 10px;
    border-bottom: 1px solid var(--border-subtle);
    gap: 8px;
  }
  .wa-sidebar-title {
    flex: 1;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .wa-icon-btn {
    background: none;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 6px;
    cursor: pointer;
    color: var(--text-secondary);
    display: flex; align-items: center; justify-content: center;
  }
  .wa-icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  
  .wa-search-wrap { padding: 8px 12px; }
  .wa-action-panel-wrap { padding: 0 12px 8px; }
  .wa-sidebar :deep(.comm-insights) { background: var(--bg-base); }
  .wa-sidebar :deep(.comm-panel) { background: var(--bg-base); }
  .wa-search {
    width: 100%;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 7px 10px;
    color: var(--text-primary);
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }
  .wa-search::placeholder { color: var(--text-muted); }
  
  .wa-chat-list { flex: 1; overflow-y: auto; }
  
  .wa-chat-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    cursor: pointer;
    transition: background 0.12s;
    border-bottom: 1px solid rgba(255,255,255,0.03);
  }
  .wa-chat-item:hover  { background: var(--bg-hover); }
  .wa-chat-item.active { background: rgba(37,211,102,0.08); border-left: 3px solid #25D366; }
  
  .wa-chat-avatar {
    width: 38px; height: 38px;
    border-radius: 50%;
    background: linear-gradient(135deg, #25D366, #128C7E);
    color: white;
    font-size: 13px;
    font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .wa-chat-avatar.is-group { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
  
  .wa-chat-info { flex: 1; min-width: 0; }
  .wa-chat-name-row {
    display:flex;
    align-items:center;
    gap:8px;
  }
  .wa-chat-name {
    font-size: 13px; font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .wa-action-chip {
    display:inline-flex; align-items:center; justify-content:center;
    padding:3px 7px; border-radius:999px;
    font-size:9px; font-weight:700;
    background:rgba(148,163,184,.16);
    color:var(--text-secondary);
  }
  .wa-action-chip.state-waiting_on_your_reply { background:rgba(245,158,11,.14); color:#b45309; }
  .wa-action-chip.state-needs_approval { background:rgba(239,68,68,.14); color:#b91c1c; }
  .wa-action-chip.state-needs_follow_up { background:rgba(14,165,233,.14); color:#0369a1; }
  .wa-action-chip.state-waiting_on_others { background:rgba(16,185,129,.14); color:#047857; }
  .wa-chat-preview {
    font-size: 11px; color: var(--text-muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    margin-top: 2px;
  }
  .wa-chat-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .wa-unread-badge {
    background: #25D366; color: white;
    font-size: 10px; font-weight: 700;
    min-width: 18px; height: 18px;
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    padding: 0 4px;
  }
  .wa-pin { font-size: 10px; }
  
  /* ── Main ────────────────────────────────────────────────────────────────── */
  .wa-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .wa-no-chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }
  
  .wa-chat-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    flex-shrink: 0;
  }
  .wa-chat-head-avatar {
    width: 36px; height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, #25D366, #128C7E);
    color: white; font-size: 13px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }
  .wa-chat-head-info { flex: 1; }
  .wa-chat-head-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
  .wa-chat-head-sub  { font-size: 11px; color: var(--text-muted); }
  
  /* ── Messages ────────────────────────────────────────────────────────────── */
  .wa-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--bg-base);
  }
  
  .wa-msg { display: flex; }
  .wa-msg-out { justify-content: flex-end; }
  .wa-msg-in  { justify-content: flex-start; }
  
  .wa-msg-bubble {
    max-width: 70%;
    padding: 8px 12px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.4;
  }
  .wa-msg-out .wa-msg-bubble {
    background: #25D366;
    color: white;
    border-bottom-right-radius: 4px;
  }
  .wa-msg-in .wa-msg-bubble {
    background: var(--bg-elevated);
    color: var(--text-primary);
    border-bottom-left-radius: 4px;
  }
  .wa-msg-sender { font-size: 10px; font-weight: 700; color: #25D366; margin-bottom: 3px; }
  .wa-msg-text   { word-break: break-word; }
  .wa-msg-time   { font-size: 10px; opacity: 0.6; margin-top: 3px; text-align: right; }
  
  .wa-no-msgs {
    text-align: center; color: var(--text-muted);
    font-size: 13px; margin: auto;
  }
  
  /* ── Reply bar ───────────────────────────────────────────────────────────── */
  .wa-reply-bar {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-surface);
  }
  .wa-reply-input {
    flex: 1;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: 20px;
    padding: 8px 14px;
    color: var(--text-primary);
    font-size: 13px;
    outline: none;
    resize: none;
    max-height: 120px;
    line-height: 1.4;
  }
  .wa-reply-input::placeholder { color: var(--text-muted); }
  .wa-send-btn {
    width: 36px; height: 36px;
    border-radius: 50%;
    background: #25D366;
    border: none;
    color: white;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .wa-send-btn:hover:not(:disabled) { background: #128C7E; }
  .wa-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  
  /* ── Loading / states ────────────────────────────────────────────────────── */
  .wa-loading {
    display: flex; align-items: center; gap: 8px;
    padding: 20px; color: var(--text-muted); font-size: 13px;
  }
  .wa-spinner {
    width: 16px; height: 16px;
    border: 2px solid rgba(255,255,255,0.2);
    border-top-color: #25D366;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  .wa-spinner-sm {
    width: 12px; height: 12px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  
  .wa-not-connected {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center; padding: 20px;
    color: var(--text-primary); font-size: 13px;
  }
  .wa-connect-btn {
    background: #25D366; color: white;
    border: none; border-radius: 8px;
    padding: 8px 16px; font-size: 13px;
    font-weight: 600; cursor: pointer;
  }
  .wa-empty-chats {
    text-align: center; padding: 20px;
    color: var(--text-muted); font-size: 13px;
  }
  </style>
