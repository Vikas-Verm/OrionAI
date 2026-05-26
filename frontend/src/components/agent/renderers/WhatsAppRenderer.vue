<template>
    <!-- ── WhatsApp: message sent ─────────────────────── -->
    <div v-if="step.whatsappSent" class="wa-sent-card">
      <div class="wa-card-header">
        <span class="wa-logo">💬</span>
        <span>Message sent to <strong>{{ step.whatsappTo }}</strong></span>
      </div>
      <div class="wa-sent-body">{{ step.whatsappMessage }}</div>
      <div class="wa-sent-meta">via WhatsApp</div>
    </div>
  
    <!-- ── WhatsApp: unread summary ───────────────────── -->
    <div v-else-if="step.richWhatsAppUnread?.length" class="wa-unread-card">
      <div class="wa-card-header">
        <span class="wa-logo">💬</span>
        <span>{{ step.summary || `${step.richWhatsAppUnread.length} chats with unread` }}</span>
      </div>
      <div class="wa-unread-list">
        <div
          v-for="chat in step.richWhatsAppUnread"
          :key="chat.chatId"
          class="wa-unread-row"
        >
          <div class="wa-chat-avatar" :class="{ 'is-group': chat.isGroup }">
            {{ chat.chatName?.slice(0, 2).toUpperCase() || '?' }}
          </div>
          <div class="wa-chat-info">
            <div class="wa-chat-name">{{ chat.chatName }}</div>
            <div class="wa-chat-preview">{{ chat.lastMessage || (chat.isGroup ? 'Group' : 'Contact') }}</div>
          </div>
          <span class="wa-unread-badge">{{ chat.unreadCount }}</span>
        </div>
      </div>
    </div>
  
    <!-- ── WhatsApp: message list ─────────────────────── -->
    <div v-else-if="step.richWhatsAppMessages?.length" class="wa-msgs-card">
      <div class="wa-card-header">
        <span class="wa-logo">💬</span>
        <span>{{ step.whatsappChatName || 'WhatsApp' }}</span>
        <span class="wa-msg-count">{{ step.richWhatsAppMessages.length }} messages</span>
      </div>
      <div class="wa-msgs-list">
        <div
          v-for="msg in step.richWhatsAppMessages"
          :key="msg.id"
          :class="['wa-msg-row', msg.fromMe ? 'me' : '']"
        >
          <div v-if="!msg.fromMe" class="wa-msg-avatar">
            {{ msg.from?.slice(0, 1).toUpperCase() || '?' }}
          </div>
          <div class="wa-msg-body">
            <div v-if="!msg.fromMe" class="wa-msg-sender">{{ msg.from }}</div>
            <div class="wa-msg-bubble" :class="msg.fromMe ? 'out' : 'in'">
              {{ msg.message }}
            </div>
            <div class="wa-msg-time">{{ msg.timestamp }}</div>
          </div>
        </div>
      </div>
  
      <!-- Inline reply box -->
      <div class="wa-reply-box">
        <input
          v-model="replyText"
          class="wa-reply-input"
          placeholder="Type a reply..."
          @keydown.enter.exact.prevent="sendReply"
        />
        <button
          class="wa-reply-send"
          :disabled="!replyText.trim() || sending"
          @click="sendReply"
        >
          <span v-if="sending" class="wa-spinner-sm"></span>
          <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      <div v-if="sentOk" class="wa-sent-ok">✅ Sent!</div>
    </div>
  
    <!-- ── WhatsApp: chat list ────────────────────────── -->
    <div v-else-if="step.richWhatsAppChats?.length" class="wa-chats-card">
      <div class="wa-card-header">
        <span class="wa-logo">💬</span>
        <span>{{ step.richWhatsAppChats.length }} WhatsApp chats</span>
      </div>
      <div class="wa-chats-list">
        <div
          v-for="chat in step.richWhatsAppChats.slice(0, 10)"
          :key="chat.id"
          class="wa-chat-row"
        >
          <div class="wa-chat-avatar" :class="{ 'is-group': chat.isGroup }">
            {{ chat.name?.slice(0, 2).toUpperCase() || '?' }}
          </div>
          <div class="wa-chat-info">
            <div class="wa-chat-name">{{ chat.name }}</div>
            <div class="wa-chat-preview">{{ chat.lastMessage || (chat.isGroup ? 'Group' : 'Contact') }}</div>
          </div>
          <span v-if="chat.unread > 0" class="wa-unread-badge">{{ chat.unread }}</span>
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue'
  import api from '../../../services/api'
  
  const props = defineProps({
    steps: { type: Array, default: () => [] },
    msg:   { type: Object, default: () => ({}) },
  })
  
  // Find the most relevant WhatsApp step
  const step = computed(() => {
    const WA_TOOLS = [
      'whatsapp_send_message', 'whatsapp_get_messages',
      'whatsapp_get_unread', 'whatsapp_list_chats',
    ]
    return props.steps.find(s => WA_TOOLS.includes(s.tool) && s.status === 'done') || {}
  })
  
  import { computed } from 'vue'
  
  const replyText = ref('')
  const sending   = ref(false)
  const sentOk    = ref(false)
  
  async function sendReply() {
    const text = replyText.value.trim()
    if (!text || sending.value || !step.value.whatsappChatId) return
  
    sending.value = true
    try {
      await api.post('/api/whatsapp/send', {
        to:      step.value.whatsappChatId,
        message: text,
      })
      replyText.value = ''
      sentOk.value    = true
      setTimeout(() => { sentOk.value = false }, 3000)
    } catch (err) {
      console.error('WhatsApp reply failed:', err)
    } finally {
      sending.value = false
    }
  }
  </script>
  
  <style scoped>
  /* ── Card base ───────────────────────────────────────────────────────────── */
  .wa-sent-card,
  .wa-unread-card,
  .wa-msgs-card,
  .wa-chats-card {
    background: rgba(37,211,102,0.06);
    border: 1px solid rgba(37,211,102,0.2);
    border-radius: 12px;
    overflow: hidden;
    margin-top: 6px;
  }
  
  .wa-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: rgba(37,211,102,0.08);
    border-bottom: 1px solid rgba(37,211,102,0.15);
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }
  .wa-logo       { font-size: 16px; }
  .wa-msg-count  { margin-left: auto; font-size: 11px; color: var(--text-muted); font-weight: 400; }
  
  /* ── Sent card ───────────────────────────────────────────────────────────── */
  .wa-sent-body {
    padding: 10px 14px;
    font-size: 13px;
    color: var(--text-primary);
    line-height: 1.5;
  }
  .wa-sent-meta {
    padding: 0 14px 10px;
    font-size: 11px;
    color: var(--text-muted);
  }
  
  /* ── Unread list ─────────────────────────────────────────────────────────── */
  .wa-unread-list { padding: 6px 0; }
  .wa-unread-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .wa-unread-row:last-child { border-bottom: none; }
  
  /* ── Chats list ──────────────────────────────────────────────────────────── */
  .wa-chats-list { padding: 6px 0; }
  .wa-chat-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .wa-chat-row:last-child { border-bottom: none; }
  
  /* ── Avatar ──────────────────────────────────────────────────────────────── */
  .wa-chat-avatar {
    width: 34px; height: 34px;
    border-radius: 50%;
    background: linear-gradient(135deg, #25D366, #128C7E);
    color: white;
    font-size: 12px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .wa-chat-avatar.is-group { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
  
  .wa-chat-info  { flex: 1; min-width: 0; }
  .wa-chat-name  { font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wa-chat-preview { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
  
  .wa-unread-badge {
    background: #25D366; color: white;
    font-size: 10px; font-weight: 700;
    min-width: 20px; height: 20px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    padding: 0 5px; flex-shrink: 0;
  }
  
  /* ── Messages ────────────────────────────────────────────────────────────── */
  .wa-msgs-list {
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
  }
  .wa-msg-row {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }
  .wa-msg-row.me { flex-direction: row-reverse; }
  
  .wa-msg-avatar {
    width: 28px; height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, #25D366, #128C7E);
    color: white; font-size: 11px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .wa-msg-body { display: flex; flex-direction: column; max-width: 75%; }
  .wa-msg-sender { font-size: 10px; font-weight: 600; color: #25D366; margin-bottom: 2px; }
  .wa-msg-bubble {
    padding: 7px 11px;
    border-radius: 12px;
    font-size: 12.5px; line-height: 1.4;
    word-break: break-word;
  }
  .wa-msg-bubble.out { background: #25D366; color: white; border-bottom-right-radius: 3px; }
  .wa-msg-bubble.in  { background: var(--bg-elevated); color: var(--text-primary); border-bottom-left-radius: 3px; }
  .wa-msg-time { font-size: 10px; color: var(--text-muted); margin-top: 2px; }
  .wa-msg-row.me .wa-msg-time { text-align: right; }
  
  /* ── Reply box ───────────────────────────────────────────────────────────── */
  .wa-reply-box {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 12px;
    border-top: 1px solid rgba(37,211,102,0.15);
  }
  .wa-reply-input {
    flex: 1;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 7px 12px;
    color: var(--text-primary);
    font-size: 12px;
    outline: none;
  }
  .wa-reply-input::placeholder { color: var(--text-muted); }
  
  .wa-reply-send {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: #25D366;
    border: none; cursor: pointer; color: white;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: background 0.15s;
  }
  .wa-reply-send:hover:not(:disabled) { background: #128C7E; }
  .wa-reply-send:disabled { opacity: 0.5; cursor: not-allowed; }
  .wa-sent-ok { padding: 6px 14px 8px; font-size: 12px; color: #25D366; }
  
  .wa-spinner-sm {
    width: 12px; height: 12px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  </style>