<template>
    <div class="sl-root">
  
      <!-- LEFT: Channel/DM list -->
      <div class="sl-sidebar">
        <div class="sl-sidebar-header">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.527 2.527 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.527 2.527 0 012.521 2.521 2.527 2.527 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.527 2.527 0 01-2.522 2.521h-2.522V8.834zM17.688 8.834a2.527 2.527 0 01-2.521 2.521 2.527 2.527 0 01-2.521-2.521V2.522A2.528 2.528 0 0115.167 0a2.528 2.528 0 012.521 2.522v6.312zM15.167 18.956a2.528 2.528 0 012.521 2.522A2.528 2.528 0 0115.167 24a2.527 2.527 0 01-2.521-2.522v-2.522h2.521zM15.167 17.688a2.527 2.527 0 01-2.521-2.523 2.527 2.527 0 012.521-2.52h6.313A2.528 2.528 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.311z"/>
          </svg>
          <span class="sl-workspace-name">Slack</span>
        </div>
  
        <div class="sl-search-wrap">
          <input v-model="searchQuery" class="sl-search" placeholder="Search…" />
        </div>
  
        <div class="sl-channel-list">
          <div
            v-for="ch in filteredChannels"
            :key="ch.id"
            :class="['sl-channel-item', activeChannelId === ch.id ? 'active' : '']"
            @click="openChannel(ch)">
            <div class="sl-channel-avatar" :style="{ background: avatarColor(ch.name) }">
              {{ ch.name.slice(0, 2).toUpperCase() }}
            </div>
            <div class="sl-channel-info">
              <div class="sl-channel-name">{{ ch.name }}</div>
              <div class="sl-channel-preview">{{ ch.lastMessage }}</div>
            </div>
            <span v-if="ch.unread > 0" class="sl-unread-badge">{{ ch.unread }}</span>
          </div>
        </div>
      </div>
  
      <!-- RIGHT: Messages -->
      <div class="sl-chat-pane">
        <div v-if="!activeChannel" class="sl-empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
            <path fill="#E01E5A" opacity="0.2" d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52z"/>
          </svg>
          <p>Select a chat to start messaging</p>
        </div>
  
        <template v-else>
          <div class="sl-chat-header">
            <div class="sl-channel-avatar md" :style="{ background: avatarColor(activeChannel.name) }">
              {{ activeChannel.name.slice(0, 2).toUpperCase() }}
            </div>
            <div>
              <div class="sl-chat-name">{{ activeChannel.name }}</div>
              <div class="sl-chat-type">Direct message</div>
            </div>
          </div>
  
          <div class="sl-messages" ref="messagesRef">
            <div v-if="messagesLoading" class="sl-loading">
              <span class="sl-spinner"></span>
            </div>
            <template v-else>
              <div v-for="msg in messages" :key="msg.id"
                :class="['sl-msg-row', msg.fromMe ? 'sl-msg-out' : 'sl-msg-in']">
                <div class="sl-msg-avatar" :style="{ background: avatarColor(msg.fromName) }">
                  {{ msg.fromName?.slice(0,2).toUpperCase() }}
                </div>
                <div class="sl-msg-body">
                  <div class="sl-msg-meta">
                    <span class="sl-msg-sender">{{ msg.fromName }}</span>
                    <span class="sl-msg-time">{{ formatTime(msg.date) }}</span>
                  </div>
                  <div class="sl-msg-text">{{ msg.text }}</div>
                </div>
              </div>
            </template>
          </div>
  
          <div class="sl-send-bar">
            <textarea
              v-model="sendText"
              class="sl-send-input"
              :placeholder="`Message ${activeChannel.name}…`"
              rows="1"
              ref="sendInputRef"
              @keydown.enter.exact.prevent="sendMessage"
              @input="autoResize"
            />
            <button class="sl-send-btn" :disabled="!sendText.trim() || sending" @click="sendMessage">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M22 2L15 22 11 13 2 9l20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </template>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, computed, onMounted, nextTick } from 'vue'
  import api from '../services/api'
  
  defineEmits(['close'])
  
  const channels       = ref([])
  const activeChannelId = ref(null)
  const activeChannel  = ref(null)
  const messages       = ref([])
  const messagesLoading = ref(false)
  const sendText       = ref('')
  const sending        = ref(false)
  const searchQuery    = ref('')
  const messagesRef    = ref(null)
  const sendInputRef   = ref(null)
  
  const filteredChannels = computed(() => {
    if (!searchQuery.value.trim()) return channels.value
    const q = searchQuery.value.toLowerCase()
    return channels.value.filter(c => c.name.toLowerCase().includes(q))
  })
  
  async function loadChannels() {
    try {
      const res = await api.get('/api/slack/channels')
      channels.value = res.data.channels || []
    } catch (e) {
        console.log('Slack channels load failed:', e.message)
      // Slack read not yet connected — show empty state
      channels.value = []
    }
  }
  
  async function openChannel(ch) {
    activeChannelId.value = ch.id
    activeChannel.value   = ch
    messages.value        = []
    messagesLoading.value = true
    await nextTick()
    try {
      const res = await api.get(`/api/slack/channels/${ch.id}/messages`)
      messages.value = res.data.messages || []
      await nextTick()
      scrollMessages()
    } catch (e) { console.error('Slack messages failed:', e.message) }
    finally { messagesLoading.value = false }
  }
  
  async function sendMessage() {
    if (!sendText.value.trim() || sending.value) return
    const text = sendText.value.trim()
    sending.value = true
  
    messages.value.push({
      id: `tmp_${Date.now()}`,
      text,
      date: new Date().toISOString(),
      fromMe: true,
      fromName: 'You',
    })
    sendText.value = ''
    await nextTick()
    scrollMessages()
    resetHeight()
  
    try {
      await api.post(`/api/slack/channels/${activeChannelId.value}/send`, { message: text })
    } catch (e) {
        console.error('Slack send message failed:', e.message)
      messages.value = messages.value.filter(m => !m.id.startsWith('tmp_'))
    } finally {
      sending.value = false
    }
  }
  
  function scrollMessages() {
    if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
  function autoResize(e) {
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }
  function resetHeight() {
    if (sendInputRef.value) sendInputRef.value.style.height = 'auto'
  }
  function formatTime(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  }
  const COLORS = ['#E01E5A','#36C5F0','#2EB67D','#ECB22E','#4A154B','#1264A3']
  function avatarColor(name) {
    if (!name) return '#E01E5A'
    let h = 0
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
    return COLORS[Math.abs(h) % COLORS.length]
  }
  
  onMounted(loadChannels)
  </script>
  
  <style scoped>
  .sl-root { height: 100%; display: flex; overflow: hidden; background: var(--bg-base); }
  
  .sl-sidebar {
    width: 280px; flex-shrink: 0;
    background: var(--bg-surface);
    border-right: 1px solid var(--border-subtle);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .sl-sidebar-header {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--border-subtle); flex-shrink: 0;
  }
  .sl-workspace-name { font-size: 15px; font-weight: 700; color: var(--text-primary); }
  .sl-search-wrap { padding: 10px 12px 6px; flex-shrink: 0; }
  .sl-search {
    width: 100%; padding: 7px 12px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle); border-radius: 20px;
    color: var(--text-primary); font-size: 12.5px; outline: none; box-sizing: border-box;
  }
  .sl-search::placeholder { color: var(--text-muted); }
  .sl-channel-list { flex: 1; overflow-y: auto; scrollbar-width: thin; }
  .sl-channel-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px;
    cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.025);
    transition: background 0.1s;
  }
  .sl-channel-item:hover { background: rgba(255,255,255,0.03); }
  .sl-channel-item.active { background: rgba(224,30,90,0.08); }
  .sl-channel-avatar {
    width: 36px; height: 36px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: white; flex-shrink: 0;
  }
  .sl-channel-avatar.md { width: 32px; height: 32px; border-radius: 6px; font-size: 11px; }
  .sl-channel-info { flex: 1; min-width: 0; }
  .sl-channel-name { font-size: 13px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sl-channel-preview { font-size: 11.5px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sl-unread-badge {
    background: #E01E5A; color: white; font-size: 10px; font-weight: 700;
    min-width: 18px; height: 18px; border-radius: 9px;
    display: flex; align-items: center; justify-content: center; padding: 0 4px;
  }
  
  .sl-chat-pane { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .sl-empty-state {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 12px;
    color: var(--text-muted); font-size: 14px;
  }
  .sl-chat-header {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 18px; background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle); flex-shrink: 0;
  }
  .sl-chat-name { font-size: 14px; font-weight: 700; color: var(--text-primary); }
  .sl-chat-type { font-size: 11px; color: var(--text-muted); }
  .sl-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; scrollbar-width: thin; }
  .sl-msg-row { display: flex; gap: 10px; align-items: flex-start; }
  .sl-msg-avatar {
    width: 32px; height: 32px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: white; flex-shrink: 0;
  }
  .sl-msg-body { flex: 1; }
  .sl-msg-meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 2px; }
  .sl-msg-sender { font-size: 13px; font-weight: 700; color: var(--text-primary); }
  .sl-msg-time { font-size: 10.5px; color: var(--text-muted); }
  .sl-msg-text { font-size: 13.5px; color: var(--text-primary); line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
  
  .sl-send-bar {
    display: flex; align-items: flex-end; gap: 10px;
    padding: 10px 16px 12px;
    background: var(--bg-surface);
    border-top: 1px solid var(--border-subtle); flex-shrink: 0;
  }
  .sl-send-input {
    flex: 1; padding: 10px 14px;
    background: var(--bg-elevated); border: 1px solid var(--border-default);
    border-radius: 8px; color: var(--text-primary); font-size: 13.5px;
    resize: none; outline: none; line-height: 1.4;
    min-height: 40px; max-height: 120px; box-sizing: border-box; font-family: inherit;
  }
  .sl-send-input:focus { border-color: #E01E5A50; }
  .sl-send-input::placeholder { color: var(--text-muted); }
  .sl-send-btn {
    width: 38px; height: 38px; background: #E01E5A;
    border: none; border-radius: 8px; color: white; cursor: pointer;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: opacity 0.15s;
  }
  .sl-send-btn:hover:not(:disabled) { opacity: 0.85; }
  .sl-send-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .sl-loading { display: flex; align-items: center; justify-content: center; padding: 32px; }
  .sl-spinner {
    width: 18px; height: 18px; border: 2px solid rgba(224,30,90,0.2);
    border-top-color: #E01E5A; border-radius: 50%; animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  </style>