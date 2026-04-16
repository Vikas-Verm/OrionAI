<template>
  <div class="wa-shell">
    <aside class="wa-sidebar">
      <div class="wa-sidebar-head">
        <button class="wa-brand" type="button" @click="selectedChat = null">
          <span class="wa-brand-icon">💬</span>
          <span class="wa-brand-copy">
            <strong>WhatsApp</strong>
            <span>{{ isConnected ? 'Live in OrionAI' : 'Hidden bridge setup' }}</span>
          </span>
        </button>

        <div class="wa-head-actions">
          <button class="wa-icon-btn" :disabled="refreshing" title="Refresh WhatsApp" @click="refreshAll">
            <span v-if="refreshing" class="wa-spinner wa-spinner--sm"></span>
            <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10" />
              <path d="M1 14l4.6 4.4A9 9 0 0 0 20.5 15" />
            </svg>
          </button>
          <button class="wa-icon-btn" title="Back" @click="emit('close')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5" />
              <path d="m12 5-7 7 7 7" />
            </svg>
          </button>
        </div>
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
          :selected-conversation-id="selectedChat?.roomId || selectedChat?.id"
          @refresh="refreshWhatsAppActions"
          @open="openWhatsAppActionConversation"
          @draft="draftWhatsAppActionConversation"
          @done="completeWhatsAppAction"
          @snooze="snoozeWhatsAppAction"
          @dismiss="dismissWhatsAppAction"
        />
      </div>

      <div class="wa-search-wrap">
        <svg class="wa-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          v-model="chatQuery"
          class="wa-search"
          :disabled="!isConnected"
          type="search"
          placeholder="Search chats"
        />
      </div>

      <div class="wa-filter-row">
        <button
          v-for="filter in CHAT_FILTERS"
          :key="filter.id"
          class="wa-filter-chip"
          :class="{ active: activeFilter === filter.id }"
          :disabled="!isConnected"
          @click="activeFilter = filter.id"
        >
          {{ filter.label }}
        </button>
      </div>

      <div v-if="loadingChats && chats.length === 0" class="wa-list-state">
        <div v-for="n in 5" :key="`chat-skeleton-${n}`" class="wa-chat-skeleton">
          <span class="wa-chat-skeleton-avatar"></span>
          <span class="wa-chat-skeleton-lines">
            <span></span>
            <span></span>
          </span>
        </div>
      </div>

      <div v-else-if="!isConnected" class="wa-list-empty">
        <div class="wa-empty-orb">
          <span>QR</span>
        </div>
        <strong>
          {{ status.loginState === 'pending_qr' ? 'Finish linking WhatsApp' : 'WhatsApp is not connected' }}
        </strong>
        <p v-if="status.loginState === 'pending_qr'">
          OrionAI already requested a QR code. Open Integrations to scan it from Linked Devices on your phone.
        </p>
        <p v-else>
          {{ status.lastError || 'Connect WhatsApp in Integrations to load your live chats inside OrionAI.' }}
        </p>
        <button class="wa-primary-btn" @click="emit('open-integrations')">Open Integrations</button>
      </div>

      <div v-else-if="filteredChats.length === 0" class="wa-list-empty">
        <div class="wa-empty-orb">
          <span>0</span>
        </div>
        <strong>{{ chatQuery ? 'No chats match your search' : 'No chats synced yet' }}</strong>
        <p>
          {{ chatQuery
            ? 'Try a different name, message preview, or filter.'
            : 'If you just linked WhatsApp, give OrionAI a moment to finish syncing your rooms.' }}
        </p>
      </div>

      <div v-else class="wa-chat-list">
        <button
          v-for="chat in filteredChats"
          :key="chat.roomId || chat.id"
          class="wa-chat-row"
          :class="{ active: currentRoomId(chat) === currentRoomId(selectedChat) }"
          @click="selectChat(chat)"
        >
          <div class="wa-chat-avatar">
            <img
              v-if="chat.avatarUrl && !isImageBroken(chat.avatarUrl)"
              :src="authMediaUrl(chat.avatarUrl)"
              :alt="chat.title || chat.name"
              @error="markImageBroken(chat.avatarUrl)"
            />
            <span v-else>{{ avatarInitials(chat.title || chat.name) }}</span>
          </div>

          <div class="wa-chat-copy">
            <div class="wa-chat-title-row">
              <strong>{{ chat.title || chat.name }}</strong>
              <span>{{ formatChatTime(chat.lastMessageAt) }}</span>
            </div>
            <div class="wa-chat-preview-row">
              <p>{{ chat.lastMessagePreview || 'No messages yet' }}</p>
              <span v-if="chat.isPinned" class="wa-chat-flag" title="Pinned">Pin</span>
              <span v-if="chat.isMuted" class="wa-chat-flag" title="Muted">Mute</span>
            </div>
          </div>

          <div class="wa-chat-meta">
            <span v-if="chat.unreadCount" class="wa-chat-badge">{{ chat.unreadCount }}</span>
            <span class="wa-chat-kind">{{ chat.isGroup ? 'Group' : 'Direct' }}</span>
          </div>
        </button>
      </div>
    </aside>

    <main class="wa-main">
      <template v-if="!isConnected">
        <section class="wa-state-panel">
          <div class="wa-state-hero">
            <div class="wa-state-illustration">
              <span class="wa-state-circle wa-state-circle--one"></span>
              <span class="wa-state-circle wa-state-circle--two"></span>
              <div class="wa-state-card">
                <div class="wa-state-card-head">
                  <span class="wa-state-card-dot"></span>
                  <span>{{ status.loginState === 'pending_qr' ? 'Awaiting QR scan' : 'Bridge offline' }}</span>
                </div>
                <div v-if="status.loginState === 'pending_qr' && status.qrImageUrl" class="wa-state-qr">
                  <img :src="status.qrImageUrl" alt="WhatsApp QR code" />
                </div>
                <div v-else class="wa-state-lines">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
            <div class="wa-state-copy">
              <strong>
                {{ status.loginState === 'pending_qr' ? 'Scan the QR in Integrations' : 'WhatsApp lives here once linked' }}
              </strong>
              <p>
                {{ status.loginState === 'pending_qr'
                  ? 'OrionAI already provisioned your hidden Matrix session and asked the bridge for a QR. Open Integrations to finish linking from Linked Devices.'
                  : status.lastError || 'Chats and messages stay live in Matrix and are proxied into OrionAI without storing personal history in MongoDB.' }}
              </p>
              <button class="wa-primary-btn" @click="emit('open-integrations')">Go to Integrations</button>
            </div>
          </div>
        </section>
      </template>

      <template v-else-if="!selectedChat">
        <section class="wa-state-panel">
          <div class="wa-state-hero">
            <div class="wa-state-illustration">
              <span class="wa-state-circle wa-state-circle--one"></span>
              <span class="wa-state-circle wa-state-circle--two"></span>
              <div class="wa-state-card">
                <div class="wa-state-card-head">
                  <span class="wa-state-card-dot"></span>
                  <span>Choose a conversation</span>
                </div>
                <div class="wa-state-lines">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
            <div class="wa-state-copy">
              <strong>Your WhatsApp workspace is ready</strong>
              <p>Select a chat on the left to read messages, send files, record a voice note, and reply without leaving OrionAI.</p>
            </div>
          </div>
        </section>
      </template>

      <template v-else>
        <header class="wa-chat-head">
          <button class="wa-chat-head-main" type="button" @click="searchInChatOpen = false">
            <div class="wa-chat-head-avatar">
              <img
                v-if="selectedChat.avatarUrl && !isImageBroken(selectedChat.avatarUrl)"
                :src="authMediaUrl(selectedChat.avatarUrl)"
                :alt="selectedChat.title || selectedChat.name"
                @error="markImageBroken(selectedChat.avatarUrl)"
              />
              <span v-else>{{ avatarInitials(selectedChat.title || selectedChat.name) }}</span>
            </div>
            <div class="wa-chat-head-copy">
              <strong>{{ selectedChat.title || selectedChat.name }}</strong>
              <span>{{ selectedChatSubtitle }}</span>
            </div>
          </button>

          <div class="wa-chat-actions">
            <button class="wa-icon-btn" :class="{ active: searchInChatOpen }" title="Search in chat" @click="toggleMessageSearch">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
            <button class="wa-icon-btn wa-icon-btn--ghost" title="Calls coming soon" disabled>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72l.33 2.53a2 2 0 0 1-.57 1.72l-1.1 1.1a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 1.72-.57l2.53.33A2 2 0 0 1 22 16.92Z" />
              </svg>
            </button>
            <button class="wa-icon-btn wa-icon-btn--ghost" title="Video coming soon" disabled>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m22 8-6 4 6 4V8Z" />
                <rect x="2" y="6" width="14" height="12" rx="2" />
              </svg>
            </button>
            <button class="wa-icon-btn" :disabled="loadingMessages" title="Refresh chat" @click="loadSelectedConversation">
              <span v-if="loadingMessages" class="wa-spinner wa-spinner--sm"></span>
              <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10" />
                <path d="M1 14l4.6 4.4A9 9 0 0 0 20.5 15" />
              </svg>
            </button>
          </div>
        </header>

        <div v-if="searchInChatOpen" class="wa-chat-search">
          <input
            v-model="messageQuery"
            class="wa-chat-search-input"
            type="search"
            placeholder="Search this conversation"
          />
          <span class="wa-chat-search-meta">
            {{ visibleMessages.length === messages.length ? `${messages.length} shown` : `${visibleMessages.length} matches` }}
          </span>
        </div>

        <section ref="messagesEl" class="wa-thread">
          <div v-if="loadingMessages && messages.length === 0" class="wa-thread-loading">
            <div v-for="n in 4" :key="`msg-skeleton-${n}`" class="wa-msg-skeleton" :class="{ 'is-out': n % 2 === 0 }">
              <span></span>
            </div>
          </div>

          <template v-else>
            <template v-for="(message, index) in visibleMessages" :key="message.id">
              <div v-if="showDateDivider(message, index)" class="wa-date-divider">
                <span>{{ formatDateDivider(message.timestamp) }}</span>
              </div>

              <div class="wa-message-row" :class="{ 'from-me': message.direction === 'outbound' || message.fromMe }">
                <div v-if="message.direction !== 'outbound' && !message.fromMe" class="wa-message-avatar">
                  {{ avatarInitials(message.senderName) }}
                </div>

                <div class="wa-message-stack">
                  <div class="wa-message-actions">
                    <button class="wa-mini-btn" @click="startReply(message)">Reply</button>
                    <button class="wa-mini-btn" @click="copyMessage(message)">Copy</button>
                    <button
                      v-if="firstAttachment(message)?.url"
                      class="wa-mini-btn"
                      @click="downloadAttachment(firstAttachment(message))"
                    >
                      Download
                    </button>
                  </div>

                  <div class="wa-bubble" :class="{ deleted: message.deleted }">
                    <div v-if="message.direction !== 'outbound' && !message.fromMe && selectedChat.isGroup" class="wa-message-sender">
                      {{ message.senderName }}
                    </div>

                    <div v-if="message.replyPreview" class="wa-reply-preview">
                      <strong>{{ message.replyPreview.senderName }}</strong>
                      <span>{{ message.replyPreview.text }}</span>
                    </div>

                    <div v-if="message.deleted" class="wa-deleted-copy">Message deleted</div>

                    <template v-else>
                      <div v-if="firstAttachment(message)?.type === 'image'" class="wa-media-card wa-media-card--image">
                        <img
                          :src="authMediaUrl(firstAttachment(message).url)"
                          :alt="firstAttachment(message).fileName"
                          @click="openLightbox(firstAttachment(message))"
                        />
                      </div>

                      <div v-else-if="firstAttachment(message)?.type === 'audio'" class="wa-media-card wa-media-card--audio">
                        <div class="wa-audio-pill">
                          <span class="wa-audio-wave"></span>
                          <span>{{ message.isVoice ? 'Voice message' : 'Audio attachment' }}</span>
                        </div>
                        <audio :src="authMediaUrl(firstAttachment(message).url)" controls preload="metadata"></audio>
                      </div>

                      <div v-else-if="firstAttachment(message)?.url" class="wa-media-card">
                        <div class="wa-file-card">
                          <div>
                            <strong>{{ firstAttachment(message).fileName }}</strong>
                            <span>{{ readableSize(firstAttachment(message).size) || firstAttachment(message).mimeType || 'Attachment' }}</span>
                          </div>
                          <button class="wa-mini-btn" @click="downloadAttachment(firstAttachment(message))">Open</button>
                        </div>
                      </div>

                      <p v-if="message.text" class="wa-message-text">{{ message.text }}</p>

                      <div v-if="message.reactions?.length" class="wa-reaction-row">
                        <span v-for="reaction in message.reactions" :key="`${message.id}-${reaction.key}`" class="wa-reaction-pill">
                          {{ reaction.key }} {{ reaction.count }}
                        </span>
                      </div>
                    </template>

                    <div class="wa-message-meta">
                      <span>{{ message.timeLabel || formatChatTime(message.timestamp) }}</span>
                      <span v-if="message.direction === 'outbound' || message.fromMe">Sent</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <div v-if="visibleMessages.length === 0" class="wa-thread-empty">
              <strong>{{ messageQuery ? 'No messages match your search' : 'No messages yet' }}</strong>
              <p>{{ messageQuery ? 'Try a different search phrase.' : 'Start the conversation from OrionAI.' }}</p>
            </div>
          </template>
        </section>

        <section class="wa-composer-shell">
          <div v-if="replyTarget" class="wa-reply-bar">
            <div class="wa-reply-chip">
              <strong>Replying to {{ replyTarget.senderName }}</strong>
              <span>{{ replyTarget.text || firstAttachment(replyTarget)?.fileName || 'Attachment' }}</span>
            </div>
            <button class="wa-icon-btn" title="Cancel reply" @click="clearReply">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          <div v-if="composerNotice" class="wa-composer-notice">
            <span>{{ composerNotice }}</span>
            <button type="button" @click="composerNotice = ''">Dismiss</button>
          </div>

          <div v-if="draftAttachments.length" class="wa-draft-strip">
            <div v-for="(draft, index) in draftAttachments" :key="draft.id" class="wa-draft-card">
              <div class="wa-draft-preview">
                <img v-if="draft.previewType === 'image' && draft.previewUrl" :src="draft.previewUrl" :alt="draft.fileName" />
                <span v-else>{{ draft.previewLabel }}</span>
              </div>
              <div class="wa-draft-copy">
                <strong>{{ draft.fileName }}</strong>
                <span>{{ readableSize(draft.size) || draft.mimeType || 'Attachment' }}</span>
              </div>
              <button class="wa-mini-btn" @click="removeDraftAttachment(index)">Remove</button>
            </div>
          </div>

          <div v-if="emojiPanelOpen" class="wa-quick-panel">
            <button
              v-for="emoji in EMOJI_OPTIONS"
              :key="emoji"
              class="wa-emoji-btn"
              @click="insertEmoji(emoji)"
            >
              {{ emoji }}
            </button>
          </div>

          <div v-if="gifPanelOpen" class="wa-quick-panel wa-quick-panel--gif">
            <div class="wa-panel-head">
              <strong>GIF picker</strong>
              <span>UI scaffolded for a provider hookup</span>
            </div>
            <div class="wa-gif-grid">
              <button
                v-for="prompt in GIF_PLACEHOLDERS"
                :key="prompt"
                class="wa-gif-card"
                @click="useGifPlaceholder(prompt)"
              >
                <span>{{ prompt }}</span>
                <small>Provider setup pending</small>
              </button>
            </div>
          </div>

          <div v-if="recording" class="wa-recording-banner">
            <div class="wa-record-dot"></div>
            <strong>Recording voice note</strong>
            <span>{{ formatRecordingTime(recordingSeconds) }}</span>
            <button class="wa-mini-btn" @click="stopVoiceRecording()">Save</button>
            <button class="wa-mini-btn wa-mini-btn--danger" @click="cancelVoiceRecording">Cancel</button>
          </div>

          <div class="wa-composer">
            <input ref="fileInputEl" class="wa-hidden-input" type="file" multiple @change="handleFilePick" />

            <button class="wa-icon-btn" :disabled="composerDisabled" title="Attach files" @click="openAttachmentPicker">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m21.44 11.05-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l9.2-9.19a3.5 3.5 0 1 1 4.95 4.95l-9.19 9.2a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48" />
              </svg>
            </button>
            <button class="wa-icon-btn" :disabled="composerDisabled" title="Emoji picker" @click="toggleEmojiPanel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <path d="M9 9h.01" />
                <path d="M15 9h.01" />
              </svg>
            </button>
            <button class="wa-icon-btn" :disabled="composerDisabled" title="GIF picker" @click="toggleGifPanel">
              GIF
            </button>

            <textarea
              ref="composerEl"
              v-model="composer"
              class="wa-composer-input"
              :disabled="!isConnected"
              :placeholder="composerPlaceholder"
              rows="1"
              @input="autoResize"
              @keydown.enter.exact.prevent="sendMessage"
            ></textarea>

            <button
              class="wa-icon-btn"
              :disabled="composerDisabled || !canRecordVoice || recording"
              :title="canRecordVoice ? 'Record voice message' : 'Voice recording not supported in this browser'"
              @click="startVoiceRecording"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                <path d="M12 18v4" />
              </svg>
            </button>
            <button class="wa-send-btn" :disabled="sendDisabled" @click="sendMessage">
              <span v-if="sending" class="wa-spinner wa-spinner--sm"></span>
              <svg v-else width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </section>
      </template>
    </main>

    <transition name="wa-fade">
      <div v-if="lightbox" class="wa-lightbox" @click="closeLightbox">
        <div class="wa-lightbox-card" @click.stop>
          <img :src="authMediaUrl(lightbox.url)" :alt="lightbox.fileName" />
          <div class="wa-lightbox-actions">
            <span>{{ lightbox.fileName }}</span>
            <button class="wa-mini-btn" @click="downloadAttachment(lightbox)">Download</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import api, { API_BASE } from '../services/api'
import CommunicationInsightsWidget from '../components/communications/CommunicationInsightsWidget.vue'
import { useCommunicationActions, emitCommunicationPriorityRefresh } from '../composables/useCommunicationActions'
import { store, setModuleContext } from '../stores/app'

const emit = defineEmits(['close', 'open-integrations'])

const CHAT_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'groups', label: 'Groups' },
]
const EMOJI_OPTIONS = ['😀', '😂', '🙏', '👍', '🔥', '✅', '🎉', '❤️', '👀', '💡']
const GIF_PLACEHOLDERS = ['Celebrate', 'Thanks', 'Follow up', 'On my way', 'Approved']

const status = ref({
  connected: false,
  loginState: 'disconnected',
  lastError: '',
  qrImageUrl: null,
  profile: null,
})
const chats = ref([])
const messages = ref([])
const selectedChat = ref(null)
const chatQuery = ref('')
const messageQuery = ref('')
const activeFilter = ref('all')
const composer = ref('')
const replyTarget = ref(null)
const loadingChats = ref(false)
const loadingMessages = ref(false)
const refreshing = ref(false)
const sending = ref(false)
const emojiPanelOpen = ref(false)
const gifPanelOpen = ref(false)
const searchInChatOpen = ref(false)
const composerNotice = ref('')
const draftAttachments = ref([])
const recording = ref(false)
const recordingSeconds = ref(0)
const lightbox = ref(null)
const failedImages = ref({})

const fileInputEl = ref(null)
const messagesEl = ref(null)
const composerEl = ref(null)

let refreshTimer = null
let mediaRecorder = null
let recordingStream = null
let recordingTimer = null
let recordingChunks = []
let recordingMode = 'queue'

const {
  actionableItems: whatsappActionItems,
  counts: whatsappActionCounts,
  groups: whatsappActionGroups,
  loading: whatsappActionsLoading,
  summaryText: whatsappActionSummary,
  refresh: refreshWhatsAppActions,
  recordAction: recordWhatsAppAction,
} = useCommunicationActions('whatsapp')

const isConnected = computed(() =>
  Boolean(status.value.connected || status.value.loginState === 'connected')
)
const canRecordVoice = computed(() =>
  typeof window !== 'undefined' &&
  typeof MediaRecorder !== 'undefined' &&
  Boolean(navigator?.mediaDevices?.getUserMedia)
)
const composerDisabled = computed(() => !isConnected.value || sending.value)
const sendDisabled = computed(() => {
  if (composerDisabled.value) return true
  return !composer.value.trim() && draftAttachments.value.length === 0
})
const composerPlaceholder = computed(() =>
  isConnected.value
    ? 'Type a message'
    : 'Connect WhatsApp in Integrations first'
)
const selectedChatSubtitle = computed(() => {
  if (!selectedChat.value) return ''
  if (selectedChat.value.isGroup) {
    const count = Number(selectedChat.value.memberCount || 0)
    return count ? `${count} members` : 'Group conversation'
  }
  return 'Live via OrionAI'
})


const filteredChats = computed(() => {
  const query = chatQuery.value.trim().toLowerCase()
  return chats.value
    .filter((chat) => {
      if (activeFilter.value === 'unread' && !Number(chat.unreadCount || 0)) return false
      if (activeFilter.value === 'groups' && !chat.isGroup) return false
      if (!query) return true
      const haystack = [
        chat.title,
        chat.name,
        chat.lastMessagePreview,
        chat.lastSender,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
})
const visibleMessages = computed(() => {
  const query = messageQuery.value.trim().toLowerCase()
  if (!query) return messages.value
  return messages.value.filter((message) => {
    const haystack = [
      message.text,
      message.senderName,
      firstAttachment(message)?.fileName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(query)
  })
})

function currentRoomId(chat = null) {
  return String(chat?.roomId || chat?.id || '')
}

function authMediaUrl(url = '') {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (/^(data:|blob:|https?:\/\/)/i.test(raw)) return raw

  const token = localStorage.getItem('token') || ''
  const resolved = raw.startsWith('http') ? raw : `${API_BASE}${raw}`

  try {
    const urlObject = new URL(resolved)
    if (token && !urlObject.searchParams.has('token')) {
      urlObject.searchParams.set('token', `Bearer ${token}`)
    }
    return urlObject.toString()
  } catch {
    return resolved
  }
}

function avatarInitials(name = '') {
  const value = String(name || '').trim()
  if (!value) return '?'
  const parts = value.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return value.slice(0, 2).toUpperCase()
}

function readableSize(bytes = 0) {
  const value = Number(bytes || 0)
  if (!value) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatChatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function formatDateDivider(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function showDateDivider(message, index) {
  if (!message || index === 0) return true
  const previous = visibleMessages.value[index - 1]
  if (!previous?.timestamp) return true
  return new Date(previous.timestamp).toDateString() !== new Date(message.timestamp).toDateString()
}

function autoResize(event) {
  const element = event?.target || composerEl.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 150)}px`
}

function isNearBottom() {
  const element = messagesEl.value
  if (!element) return true
  return element.scrollHeight - element.scrollTop - element.clientHeight < 96
}

function scrollToBottom() {
  const element = messagesEl.value
  if (!element) return
  element.scrollTop = element.scrollHeight
}

function mergeMessages(existing = [], incoming = []) {
  const byId = new Map()
  for (const message of [...existing, ...incoming]) {
    if (!message?.id) continue
    byId.set(String(message.id), message)
  }
  return [...byId.values()].sort(
    (left, right) => new Date(left.timestamp || 0).getTime() - new Date(right.timestamp || 0).getTime()
  )
}

function firstAttachment(message = {}) {
  return Array.isArray(message.attachments) ? message.attachments[0] || null : null
}

function isImageBroken(url = '') {
  const key = String(url || '').trim()
  return Boolean(key && failedImages.value[key])
}

function markImageBroken(url = '') {
  const key = String(url || '').trim()
  if (!key || failedImages.value[key]) return
  failedImages.value = {
    ...failedImages.value,
    [key]: true,
  }
}

async function loadStatus() {
  const { data } = await api.get('/api/whatsapp/status')
  status.value = data || {
    connected: false,
    loginState: 'disconnected',
    lastError: '',
  }
}
function isValidWhatsAppChat(chat) {
  const title = String(chat?.title || chat?.name || "").toLowerCase();
  return (
    chat &&
    chat.source === "whatsapp" &&
    !title.includes("signal bridge bot")
  );
}

function syncSelectedChatFromList() {
  if (!selectedChat.value) return
  const fresh = chats.value.find((chat) => currentRoomId(chat) === currentRoomId(selectedChat.value))
  if (fresh) {
    selectedChat.value = fresh
  } else {
    selectedChat.value = null
  }
}

async function loadChats({ silent = false } = {}) {
  if (!silent) loadingChats.value = true
  try {
    const { data } = await api.get('/api/whatsapp/chats')

    const incomingChats = Array.isArray(data?.chats) ? data.chats : []
    chats.value = incomingChats.filter(isValidWhatsAppChat)

    if (
      selectedChat.value &&
      !chats.value.some((chat) => currentRoomId(chat) === currentRoomId(selectedChat.value))
    ) {
      selectedChat.value = null
    }

    syncSelectedChatFromList()
  } finally {
    loadingChats.value = false
  }
}

async function markCurrentRoomRead(roomId = '', eventId = '') {
  const targetRoomId = String(roomId || '').trim()
  if (!targetRoomId) return
  await api.post(`/api/whatsapp/rooms/${encodeURIComponent(targetRoomId)}/read`, {
    eventId: eventId || undefined,
  }).catch(() => {})
}

async function loadSelectedConversation({ silent = false } = {}) {
  if (!selectedChat.value) return
  const roomId = currentRoomId(selectedChat.value)
  if (!roomId) return

  const shouldStick = isNearBottom()
  if (!silent) loadingMessages.value = true

  try {
    const { data } = await api.get(`/api/whatsapp/rooms/${encodeURIComponent(roomId)}/messages`, {
      params: { limit: 90 },
    })
    const incoming = Array.isArray(data?.messages) ? data.messages : []
    messages.value = silent ? mergeMessages(messages.value, incoming) : incoming

    const latestMessage = [...messages.value].reverse().find((message) => message?.id) || null
    if (Number(selectedChat.value?.unreadCount || 0) > 0 || Number(data?.room?.unreadCount || 0) > 0) {
      await markCurrentRoomRead(roomId, latestMessage?.id || '')
      chats.value = chats.value.map((chat) =>
        currentRoomId(chat) === roomId
          ? { ...chat, unreadCount: 0 }
          : chat
      )
      selectedChat.value = {
        ...(selectedChat.value || {}),
        unreadCount: 0,
      }
      emitCommunicationPriorityRefresh('communication_read', {
        sourceApp: 'whatsapp',
        conversationId: roomId,
      })
      refreshWhatsAppActions({ silent: true }).catch(() => {})
    }

    await nextTick()
    if (shouldStick || !silent) scrollToBottom()
  } finally {
    loadingMessages.value = false
  }
}

async function selectChat(chat) {
  selectedChat.value = chat
  searchInChatOpen.value = false
  messageQuery.value = ''
  await loadSelectedConversation()
}

async function refreshAll() {
  refreshing.value = true
  try {
    await loadStatus()
    if (isConnected.value) {
      await loadChats()
      await applyModuleContext()
      if (selectedChat.value) {
        await loadSelectedConversation({ silent: true })
      }
      await refreshWhatsAppActions()
    } else {
      chats.value = []
      messages.value = []
      selectedChat.value = null
    }
  } finally {
    refreshing.value = false
  }
}

function startPolling() {
  stopPolling()
  refreshTimer = window.setInterval(async () => {
    try {
      await loadStatus()
      if (!isConnected.value) return
      await loadChats({ silent: true })
      if (selectedChat.value) {
        await loadSelectedConversation({ silent: true })
      }
    } catch {
      // Keep the page usable during background polling failures.
    }
  }, 10000)
}

function stopPolling() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

async function applyModuleContext() {
  const context = store.moduleContext
  if (!context || context.module !== 'whatsapp') return

  const targetRoomId = String(
    context.chatId || context.roomId || context.conversationId || ''
  ).trim()
  if (!targetRoomId) {
    setModuleContext(null)
    return
  }

  const chat = chats.value.find((entry) => currentRoomId(entry) === targetRoomId)
  if (chat) {
    await selectChat(chat)
  }

  setModuleContext(null)
}

async function openWhatsAppActionConversation(state) {
  const targetRoomId = String(
    state?.conversationId ||
      state?.openContext?.chatId ||
      state?.openContext?.roomId ||
      ''
  ).trim()
  if (!targetRoomId) return

  let chat = chats.value.find((entry) => currentRoomId(entry) === targetRoomId)
  if (!chat) {
    await loadChats()
    chat = chats.value.find((entry) => currentRoomId(entry) === targetRoomId)
  }
  if (chat) await selectChat(chat)
}

async function draftWhatsAppActionConversation(state) {
  await openWhatsAppActionConversation(state)
  await nextTick()
  composerEl.value?.focus()
}

async function completeWhatsAppAction(state) {
  try {
    await recordWhatsAppAction(state, 'approved')
  } catch (error) {
    console.error('Failed to complete WhatsApp action:', error.message)
  }
}

async function snoozeWhatsAppAction(state) {
  try {
    await recordWhatsAppAction(state, 'snoozed', { snoozeMinutes: 60 })
  } catch (error) {
    console.error('Failed to snooze WhatsApp action:', error.message)
  }
}

async function dismissWhatsAppAction(state) {
  try {
    await recordWhatsAppAction(state, 'dismissed')
  } catch (error) {
    console.error('Failed to dismiss WhatsApp action:', error.message)
  }
}

function clearReply() {
  replyTarget.value = null
}

function startReply(message) {
  replyTarget.value = message
  composerEl.value?.focus()
}

async function copyMessage(message) {
  try {
    await navigator.clipboard.writeText(
      message.text || firstAttachment(message)?.fileName || ''
    )
    composerNotice.value = 'Message copied.'
  } catch {
    composerNotice.value = 'Copy is not available in this browser.'
  }
}

function openAttachmentPicker() {
  fileInputEl.value?.click()
}

function makeDraftId() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createDraftAttachment(file, source = 'file') {
  const mimeType = file?.type || 'application/octet-stream'
  const previewType = mimeType.startsWith('image/')
    ? 'image'
    : mimeType.startsWith('audio/')
      ? 'audio'
      : mimeType.startsWith('video/')
        ? 'video'
        : 'file'

  return {
    id: makeDraftId(),
    source,
    file,
    fileName: file?.name || 'Attachment',
    mimeType,
    size: Number(file?.size || 0) || 0,
    previewType,
    previewUrl:
      previewType === 'image' || previewType === 'audio' || previewType === 'video'
        ? URL.createObjectURL(file)
        : '',
    previewLabel:
      source === 'voice'
        ? 'Voice'
        : previewType === 'file'
          ? 'File'
          : previewType.toUpperCase(),
  }
}

function revokeDraftAttachment(draft) {
  if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl)
}

function removeDraftAttachment(index) {
  const next = [...draftAttachments.value]
  const [removed] = next.splice(index, 1)
  revokeDraftAttachment(removed)
  draftAttachments.value = next
}

function clearDraftAttachments() {
  draftAttachments.value.forEach(revokeDraftAttachment)
  draftAttachments.value = []
}

function handleFilePick(event) {
  const files = Array.from(event?.target?.files || [])
  if (!files.length) return
  draftAttachments.value = [
    ...draftAttachments.value,
    ...files.map((file) => createDraftAttachment(file, 'file')),
  ]
  if (event?.target) event.target.value = ''
}

function toggleEmojiPanel() {
  emojiPanelOpen.value = !emojiPanelOpen.value
  if (emojiPanelOpen.value) gifPanelOpen.value = false
}

function toggleGifPanel() {
  gifPanelOpen.value = !gifPanelOpen.value
  if (gifPanelOpen.value) emojiPanelOpen.value = false
}

function insertEmoji(emoji) {
  composer.value = `${composer.value}${emoji}`
  emojiPanelOpen.value = false
  nextTick(() => composerEl.value?.focus())
}

function useGifPlaceholder(prompt) {
  gifPanelOpen.value = false
  composerNotice.value = `GIF picker scaffolded. Connect a GIF provider to send "${prompt}" as a real media result.`
}

function stopRecordingTimer() {
  if (recordingTimer) {
    clearInterval(recordingTimer)
    recordingTimer = null
  }
}

function releaseRecordingStream() {
  if (recordingStream) {
    recordingStream.getTracks().forEach((track) => track.stop())
    recordingStream = null
  }
}

async function startVoiceRecording() {
  if (!canRecordVoice.value || recording.value) return

  composerNotice.value = ''
  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const preferredType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
    mediaRecorder = new MediaRecorder(recordingStream, { mimeType: preferredType })
    recordingChunks = []
    recordingMode = 'queue'

    mediaRecorder.ondataavailable = (event) => {
      if (event.data?.size) recordingChunks.push(event.data)
    }

    mediaRecorder.onstop = () => {
      const mimeType = mediaRecorder?.mimeType || 'audio/webm'
      const shouldQueue = recordingMode === 'queue'
      const blob = new Blob(recordingChunks, { type: mimeType })
      recording.value = false
      stopRecordingTimer()
      releaseRecordingStream()
      mediaRecorder = null
      recordingChunks = []

      if (!shouldQueue || !blob.size) return

      const extension = mimeType.includes('ogg') ? 'ogg' : 'webm'
      const file = new File([blob], `voice-note-${Date.now()}.${extension}`, {
        type: mimeType,
      })
      draftAttachments.value = [
        ...draftAttachments.value,
        createDraftAttachment(file, 'voice'),
      ]
      composerNotice.value = 'Voice note ready to send.'
    }

    mediaRecorder.start(250)
    recording.value = true
    recordingSeconds.value = 0
    recordingTimer = window.setInterval(() => {
      recordingSeconds.value += 1
    }, 1000)
  } catch (error) {
    composerNotice.value =
      error?.message || 'Microphone access is required to record voice messages.'
    releaseRecordingStream()
  }
}

function stopVoiceRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return
  recordingMode = 'queue'
  mediaRecorder.stop()
}

function cancelVoiceRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return
  recordingMode = 'discard'
  mediaRecorder.stop()
}

function formatRecordingTime(value = 0) {
  const minutes = Math.floor(Number(value || 0) / 60)
  const seconds = Number(value || 0) % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

async function sendMessage() {
  if (!selectedChat.value || sendDisabled.value) return

  const roomId = currentRoomId(selectedChat.value)
  const text = composer.value.trim()
  const replyToEventId = replyTarget.value?.id || null

  sending.value = true
  composerNotice.value = ''

  try {
    if (draftAttachments.value.length > 0) {
      const drafts = [...draftAttachments.value]
      for (let index = 0; index < drafts.length; index += 1) {
        const draft = drafts[index]
        const formData = new FormData()
        formData.append('file', draft.file, draft.fileName)
        if (index === 0 && text) formData.append('caption', text)
        if (index === 0 && replyToEventId) formData.append('replyToEventId', replyToEventId)
        await api.post(
          `/api/whatsapp/rooms/${encodeURIComponent(roomId)}/upload`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        )
      }
    } else {
      await api.post(`/api/whatsapp/rooms/${encodeURIComponent(roomId)}/send`, {
        text,
        replyToEventId: replyToEventId || undefined,
      })
    }

    composer.value = ''
    clearReply()
    clearDraftAttachments()
    emojiPanelOpen.value = false
    gifPanelOpen.value = false

    await Promise.all([
      loadChats({ silent: true }),
      loadSelectedConversation({ silent: true }),
    ])

    emitCommunicationPriorityRefresh('communication_replied', {
      sourceApp: 'whatsapp',
      conversationId: roomId,
    })
    refreshWhatsAppActions({ silent: true }).catch(() => {})
    nextTick(() => {
      composerEl.value?.focus()
      autoResize({ target: composerEl.value })
    })
  } catch (error) {
    composerNotice.value =
      error?.response?.data?.error || error?.message || 'Unable to send the message right now.'
  } finally {
    sending.value = false
  }
}

function toggleMessageSearch() {
  searchInChatOpen.value = !searchInChatOpen.value
  if (!searchInChatOpen.value) messageQuery.value = ''
}

function openLightbox(attachment) {
  if (!attachment?.url) return
  lightbox.value = attachment
}

function closeLightbox() {
  lightbox.value = null
}

function downloadAttachment(attachment) {
  if (!attachment?.url) return
  window.open(authMediaUrl(attachment.url), '_blank', 'noopener')
}

onMounted(async () => {
  await refreshAll()
  startPolling()
})

onUnmounted(() => {
  stopPolling()
  stopRecordingTimer()
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    recordingMode = 'discard'
    mediaRecorder.stop()
  }
  releaseRecordingStream()
  clearDraftAttachments()
})
</script>

<style scoped>
.wa-shell {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  height: 100%;
  background:
    radial-gradient(circle at 8% 10%, rgba(69, 211, 152, 0.14), transparent 22%),
    radial-gradient(circle at 88% 12%, rgba(82, 212, 255, 0.12), transparent 24%),
    linear-gradient(180deg, rgba(10, 16, 28, 0.96), rgba(6, 11, 21, 1));
  overflow: hidden;
}

.wa-sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(7, 12, 22, 0.78);
  backdrop-filter: blur(22px);
}

.wa-sidebar-head,
.wa-chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.wa-brand,
.wa-chat-head-main {
  display: flex;
  align-items: center;
  gap: 12px;
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0;
  text-align: left;
}

.wa-brand-icon,
.wa-chat-head-avatar,
.wa-chat-avatar,
.wa-message-avatar {
  width: 42px;
  height: 42px;
  border-radius: 16px;
  background: linear-gradient(145deg, rgba(37, 211, 102, 0.24), rgba(9, 192, 156, 0.22));
  border: 1px solid rgba(95, 255, 170, 0.22);
  color: #dfffea;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  overflow: hidden;
  flex-shrink: 0;
}

.wa-chat-head-avatar,
.wa-chat-avatar {
  border-radius: 18px;
}

.wa-brand-icon {
  font-size: 18px;
}

.wa-chat-head-avatar img,
.wa-chat-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.wa-brand-copy,
.wa-chat-head-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.wa-brand-copy strong,
.wa-chat-head-copy strong {
  color: var(--text-primary);
  font-size: 14px;
}

.wa-brand-copy span,
.wa-chat-head-copy span {
  color: var(--text-muted);
  font-size: 12px;
}

.wa-head-actions,
.wa-chat-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wa-action-panel-wrap {
  padding: 0 14px 10px;
}

.wa-sidebar :deep(.comm-insights),
.wa-sidebar :deep(.comm-panel) {
  background: rgba(10, 17, 28, 0.84);
}

.wa-search-wrap {
  position: relative;
  padding: 0 14px 10px;
}

.wa-search-icon {
  position: absolute;
  left: 26px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.wa-search,
.wa-chat-search-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
  border-radius: 999px;
  outline: none;
}

.wa-search {
  padding: 11px 14px 11px 38px;
}

.wa-search:focus,
.wa-chat-search-input:focus,
.wa-composer-input:focus {
  border-color: rgba(95, 255, 170, 0.36);
  box-shadow: 0 0 0 4px rgba(69, 211, 152, 0.08);
}

.wa-filter-row {
  display: flex;
  gap: 8px;
  padding: 0 14px 12px;
  overflow-x: auto;
}

.wa-filter-chip,
.wa-mini-btn,
.wa-icon-btn,
.wa-primary-btn,
.wa-send-btn,
.wa-gif-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.wa-filter-chip {
  padding: 8px 12px;
  border-radius: 999px;
  white-space: nowrap;
  font-size: 12px;
}

.wa-filter-chip.active {
  color: #e6fff1;
  border-color: rgba(95, 255, 170, 0.34);
  background: rgba(69, 211, 152, 0.14);
}

.wa-chat-list,
.wa-thread {
  overflow: auto;
}

.wa-chat-row {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  text-align: left;
  padding: 12px 16px;
  border: 0;
  color: inherit;
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.wa-chat-row:hover,
.wa-chat-row.active {
  background: linear-gradient(90deg, rgba(69, 211, 152, 0.12), rgba(82, 212, 255, 0.08));
}

.wa-chat-copy {
  min-width: 0;
}

.wa-chat-title-row,
.wa-chat-preview-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.wa-chat-title-row {
  justify-content: space-between;
  margin-bottom: 4px;
}

.wa-chat-title-row strong {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wa-chat-title-row span,
.wa-chat-kind {
  font-size: 11px;
  color: var(--text-muted);
}

.wa-chat-preview-row p {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wa-chat-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.wa-chat-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: #29cf77;
  color: #05230f;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wa-chat-flag {
  font-size: 10px;
  color: #b4f0cb;
  border: 1px solid rgba(95, 255, 170, 0.16);
  border-radius: 999px;
  padding: 2px 6px;
}

.wa-list-state,
.wa-list-empty,
.wa-state-panel,
.wa-thread-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.wa-list-empty {
  flex: 1;
  flex-direction: column;
  gap: 10px;
  padding: 28px 22px;
}

.wa-list-state,
.wa-thread-empty {
  flex-direction: column;
}

.wa-list-state {
  flex: 1;
  padding: 12px 0;
}

.wa-list-empty strong,
.wa-state-copy strong,
.wa-thread-empty strong {
  color: var(--text-primary);
  font-size: 17px;
}

.wa-list-empty p,
.wa-state-copy p,
.wa-thread-empty p {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
  max-width: 420px;
}

.wa-empty-orb {
  width: 76px;
  height: 76px;
  border-radius: 26px;
  background: linear-gradient(145deg, rgba(69, 211, 152, 0.2), rgba(82, 212, 255, 0.12));
  border: 1px solid rgba(95, 255, 170, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #dfffea;
  font-size: 22px;
  font-weight: 700;
}

.wa-chat-skeleton {
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 12px;
  padding: 12px 16px;
}

.wa-chat-skeleton-avatar,
.wa-chat-skeleton-lines span,
.wa-msg-skeleton span,
.wa-state-lines span {
  display: block;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.07));
  background-size: 200% 100%;
  animation: wa-shimmer 1.4s linear infinite;
}

.wa-chat-skeleton-avatar {
  width: 42px;
  height: 42px;
  border-radius: 16px;
}

.wa-chat-skeleton-lines {
  display: grid;
  gap: 8px;
  align-content: center;
}

.wa-chat-skeleton-lines span:first-child {
  width: 68%;
  height: 12px;
  border-radius: 999px;
}

.wa-chat-skeleton-lines span:last-child {
  width: 92%;
  height: 10px;
  border-radius: 999px;
}

.wa-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(rgba(5, 11, 19, 0.86), rgba(5, 11, 19, 0.92)),
    radial-gradient(circle at 50% 20%, rgba(69, 211, 152, 0.08), transparent 28%),
    radial-gradient(circle at 70% 80%, rgba(82, 212, 255, 0.08), transparent 24%);
}

.wa-state-panel {
  flex: 1;
  padding: 34px;
}

.wa-state-hero {
  display: grid;
  grid-template-columns: minmax(280px, 420px) minmax(260px, 420px);
  gap: 32px;
  align-items: center;
  justify-content: center;
  min-height: 100%;
}

.wa-state-illustration {
  position: relative;
  min-height: 300px;
}

.wa-state-circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(10px);
}

.wa-state-circle--one {
  width: 180px;
  height: 180px;
  background: rgba(69, 211, 152, 0.12);
  top: 14px;
  left: 18px;
}

.wa-state-circle--two {
  width: 220px;
  height: 220px;
  background: rgba(82, 212, 255, 0.09);
  right: 8px;
  bottom: 10px;
}

.wa-state-card {
  position: absolute;
  inset: 48px 28px 28px 48px;
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(13, 20, 33, 0.84);
  backdrop-filter: blur(20px);
  padding: 22px;
  display: grid;
  gap: 18px;
}

.wa-state-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 13px;
}

.wa-state-card-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #29cf77;
  box-shadow: 0 0 0 8px rgba(41, 207, 119, 0.12);
}

.wa-state-lines {
  display: grid;
  gap: 12px;
}

.wa-state-lines span:nth-child(1) {
  width: 84%;
  height: 16px;
  border-radius: 999px;
}

.wa-state-lines span:nth-child(2) {
  width: 68%;
  height: 16px;
  border-radius: 999px;
}

.wa-state-lines span:nth-child(3) {
  width: 92%;
  height: 88px;
  border-radius: 20px;
}

.wa-state-qr img {
  width: 210px;
  height: 210px;
  padding: 14px;
  background: white;
  border-radius: 24px;
}

.wa-chat-search {
  padding: 10px 18px 0;
}

.wa-chat-search-input {
  padding: 11px 14px;
}

.wa-chat-search-meta {
  display: inline-flex;
  margin-top: 8px;
  color: var(--text-muted);
  font-size: 12px;
}

.wa-thread {
  flex: 1;
  padding: 20px 26px 10px;
}

.wa-thread-loading {
  display: grid;
  gap: 16px;
}

.wa-msg-skeleton {
  display: flex;
}

.wa-msg-skeleton.is-out {
  justify-content: flex-end;
}

.wa-msg-skeleton span {
  width: min(320px, 62%);
  height: 74px;
  border-radius: 24px;
}

.wa-date-divider {
  display: flex;
  justify-content: center;
  margin: 18px 0 12px;
}

.wa-date-divider span {
  padding: 7px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
  font-size: 11px;
  letter-spacing: 0.02em;
}

.wa-message-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 14px;
}

.wa-message-row.from-me {
  justify-content: flex-end;
}

.wa-message-avatar {
  width: 34px;
  height: 34px;
  border-radius: 14px;
  font-size: 11px;
}

.wa-message-stack {
  max-width: min(72%, 740px);
}

.wa-message-actions {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.wa-message-row:hover .wa-message-actions {
  opacity: 1;
  transform: translateY(0);
}

.wa-mini-btn {
  padding: 5px 9px;
  border-radius: 999px;
  font-size: 11px;
}

.wa-mini-btn--danger {
  color: #ffc9c9;
  border-color: rgba(255, 138, 138, 0.2);
}

.wa-bubble {
  padding: 12px 14px 10px;
  border-radius: 24px;
  border-bottom-left-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.wa-message-row.from-me .wa-bubble {
  background: linear-gradient(145deg, rgba(69, 211, 152, 0.2), rgba(18, 181, 143, 0.16));
  border-color: rgba(95, 255, 170, 0.18);
  border-bottom-right-radius: 10px;
  border-bottom-left-radius: 24px;
}

.wa-bubble.deleted {
  opacity: 0.75;
}

.wa-message-sender {
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #97f3c3;
}

.wa-reply-preview {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  border-left: 3px solid rgba(95, 255, 170, 0.42);
  margin-bottom: 8px;
}

.wa-reply-preview strong {
  font-size: 11px;
}

.wa-reply-preview span {
  color: var(--text-muted);
  font-size: 12px;
}

.wa-media-card {
  margin-bottom: 8px;
}

.wa-media-card--image img {
  max-width: min(360px, 100%);
  display: block;
  border-radius: 18px;
  cursor: zoom-in;
}

.wa-media-card--audio audio {
  width: min(280px, 100%);
}

.wa-audio-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.wa-audio-wave {
  width: 42px;
  height: 12px;
  border-radius: 999px;
  background:
    linear-gradient(90deg, rgba(95, 255, 170, 0.2), rgba(95, 255, 170, 0.9), rgba(95, 255, 170, 0.2));
}

.wa-file-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
}

.wa-file-card strong,
.wa-draft-copy strong {
  display: block;
  color: var(--text-primary);
  font-size: 13px;
}

.wa-file-card span,
.wa-draft-copy span {
  display: block;
  color: var(--text-muted);
  font-size: 11px;
}

.wa-message-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.wa-reaction-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.wa-reaction-pill {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-secondary);
}

.wa-message-meta {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
  font-size: 10px;
  color: var(--text-muted);
}

.wa-deleted-copy {
  color: var(--text-muted);
  font-style: italic;
  font-size: 13px;
}

.wa-composer-shell {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(7, 12, 22, 0.78);
  backdrop-filter: blur(20px);
  padding: 12px 18px 18px;
}

.wa-reply-bar,
.wa-recording-banner,
.wa-composer-notice,
.wa-draft-strip,
.wa-quick-panel {
  margin-bottom: 12px;
}

.wa-reply-bar,
.wa-recording-banner,
.wa-composer-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
}

.wa-reply-chip {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.wa-reply-chip strong {
  font-size: 12px;
  color: var(--text-primary);
}

.wa-reply-chip span {
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wa-record-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ff5f74;
  box-shadow: 0 0 0 7px rgba(255, 95, 116, 0.14);
}

.wa-composer-notice {
  justify-content: space-between;
  color: var(--text-secondary);
  font-size: 12px;
}

.wa-composer-notice button {
  background: transparent;
  border: 0;
  color: #b4f0cb;
}

.wa-draft-strip {
  display: flex;
  gap: 10px;
  overflow-x: auto;
}

.wa-draft-card {
  display: grid;
  grid-template-columns: 52px minmax(120px, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 260px;
  padding: 10px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
}

.wa-draft-preview {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  overflow: hidden;
}

.wa-draft-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.wa-quick-panel {
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(13, 20, 33, 0.88);
  padding: 12px;
}

.wa-quick-panel--gif {
  display: grid;
  gap: 12px;
}

.wa-panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-muted);
  font-size: 12px;
}

.wa-panel-head strong {
  color: var(--text-primary);
}

.wa-emoji-btn {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  border: 0;
  background: rgba(255, 255, 255, 0.05);
  font-size: 20px;
}

.wa-gif-grid,
.wa-quick-panel:not(.wa-quick-panel--gif) {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.wa-gif-card {
  min-width: 120px;
  padding: 10px 12px;
  border-radius: 18px;
  text-align: left;
}

.wa-gif-card span {
  display: block;
  color: var(--text-primary);
  font-size: 13px;
  margin-bottom: 4px;
}

.wa-gif-card small {
  color: var(--text-muted);
}

.wa-composer {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: end;
}

.wa-icon-btn,
.wa-send-btn {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wa-icon-btn--ghost {
  opacity: 0.6;
}

.wa-icon-btn.active,
.wa-icon-btn:hover:not(:disabled),
.wa-mini-btn:hover,
.wa-filter-chip:hover,
.wa-primary-btn:hover,
.wa-gif-card:hover {
  transform: translateY(-1px);
  border-color: rgba(95, 255, 170, 0.22);
  background: rgba(69, 211, 152, 0.12);
  color: var(--text-primary);
}

.wa-icon-btn:disabled,
.wa-send-btn:disabled,
.wa-filter-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wa-composer-input {
  min-height: 46px;
  max-height: 150px;
  resize: none;
  box-sizing: border-box;
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
  font: inherit;
  line-height: 1.45;
  outline: none;
}

.wa-send-btn {
  background: linear-gradient(145deg, rgba(69, 211, 152, 0.9), rgba(22, 191, 155, 0.92));
  color: #04210f;
  border-color: rgba(95, 255, 170, 0.3);
}

.wa-primary-btn {
  padding: 11px 16px;
  border-radius: 14px;
  color: var(--text-primary);
}

.wa-hidden-input {
  display: none;
}

.wa-spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.24);
  border-top-color: #9cf4c4;
  animation: wa-spin 0.8s linear infinite;
}

.wa-spinner--sm {
  width: 12px;
  height: 12px;
}

.wa-lightbox {
  position: fixed;
  inset: 0;
  background: rgba(4, 8, 14, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 40;
}

.wa-lightbox-card {
  max-width: min(84vw, 920px);
  max-height: 86vh;
  padding: 14px;
  border-radius: 28px;
  background: rgba(11, 18, 29, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.wa-lightbox-card img {
  max-width: 100%;
  max-height: calc(86vh - 90px);
  border-radius: 20px;
  display: block;
}

.wa-lightbox-actions {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  color: var(--text-secondary);
  font-size: 12px;
}

.wa-fade-enter-active,
.wa-fade-leave-active {
  transition: opacity 0.18s ease;
}

.wa-fade-enter-from,
.wa-fade-leave-to {
  opacity: 0;
}

@keyframes wa-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes wa-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

@media (max-width: 1180px) {
  .wa-shell {
    grid-template-columns: 320px minmax(0, 1fr);
  }

  .wa-state-hero {
    grid-template-columns: 1fr;
    justify-items: center;
  }
}

@media (max-width: 860px) {
  .wa-shell {
    grid-template-columns: 1fr;
  }

  .wa-sidebar {
    min-height: 42vh;
    border-right: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .wa-composer {
    grid-template-columns: auto auto auto minmax(0, 1fr) auto auto;
  }
}

@media (max-width: 640px) {
  .wa-chat-row {
    padding-inline: 12px;
  }

  .wa-thread {
    padding: 16px 14px 8px;
  }

  .wa-composer-shell {
    padding: 12px 12px 16px;
  }

  .wa-composer {
    grid-template-columns: auto auto auto minmax(0, 1fr);
  }

  .wa-composer-input {
    grid-column: 1 / -1;
    order: 2;
  }

  .wa-send-btn,
  .wa-icon-btn:last-child {
    order: 3;
  }
}
</style>
