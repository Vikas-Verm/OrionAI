<template>
  <div class="sg-page">
    <aside class="sg-sidebar">
      <div class="sg-sidebar-head">
        <button
          class="sg-brand sg-brand-btn"
          type="button"
          :disabled="!status.connected"
          title="View your Signal profile"
          @click="showProfilePanel = !showProfilePanel"
        >
          <div class="sg-brand-icon">
            <img
              v-if="status.profile?.avatarUrl && !isImageBroken(status.profile.avatarUrl)"
              :src="authMediaUrl(status.profile.avatarUrl)"
              :alt="status.profile?.displayName || 'Signal profile'"
              class="sg-brand-avatar"
              @error="markImageBroken(status.profile?.avatarUrl)"
            />
            <span v-else-if="status.connected" class="sg-avatar-fallback">
              {{ avatarInitials(status.profile?.displayName || status.profile?.phone || 'Signal') }}
            </span>
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="12" fill="#3b82f6" />
              <path d="M12 5.2a6.8 6.8 0 0 0-6.8 6.8c0 1.34.39 2.6 1.07 3.65l-.7 2.92 3-.67A6.8 6.8 0 1 0 12 5.2Z" fill="white" opacity="0.92" />
              <path d="M12 7.35a4.65 4.65 0 1 0 0 9.3 4.65 4.65 0 0 0 0-9.3Zm0 8.1a3.45 3.45 0 1 1 0-6.9 3.45 3.45 0 0 1 0 6.9Z" fill="#3b82f6" />
            </svg>
          </div>
          <div class="sg-brand-copy">
            <strong>Signal</strong>
            <span>{{ status.connected ? (status.profile?.displayName || 'Connected') : 'Connect Signal in Integrations' }}</span>
          </div>
        </button>
        <div class="sg-head-actions">
          <button class="sg-icon-btn" title="Refresh Signal" :disabled="refreshing" @click="refreshAll">
            <span v-if="refreshing" class="sg-spinner sg-spinner-sm"></span>
            <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10" />
              <path d="M1 14l4.6 4.4A9 9 0 0 0 20.5 15" />
            </svg>
          </button>
          <button class="sg-icon-btn" title="Back to integrations" @click="emit('close')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5" />
              <path d="m12 5-7 7 7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div v-if="showProfilePanel && status.connected" class="sg-profile-popover">
        <div class="sg-profile-card">
          <div class="sg-profile-actions">
            <button class="sg-icon-btn sg-icon-btn--ghost" title="Close profile" @click="showProfilePanel = false">
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <div class="sg-profile-hero">
            <div class="sg-profile-avatar">
              <img
                v-if="status.profile?.avatarUrl && !isImageBroken(status.profile.avatarUrl)"
                :src="authMediaUrl(status.profile.avatarUrl)"
                :alt="status.profile?.displayName || 'Signal profile'"
                @error="markImageBroken(status.profile?.avatarUrl)"
              />
              <span v-else>{{ avatarInitials(status.profile?.displayName || status.profile?.phone || 'Signal') }}</span>
            </div>
            <div class="sg-profile-copy">
              <strong>{{ status.profile?.displayName || 'Signal profile' }}</strong>
              <span>{{ status.profile?.phone || 'Linked on this device' }}</span>
            </div>
          </div>

          <div class="sg-info-grid">
            <div class="sg-info-item">
              <span>Chats</span>
              <strong>{{ rooms.length }}</strong>
            </div>
            <div class="sg-info-item">
              <span>Unread</span>
              <strong>{{ status.unreadCount || 0 }}</strong>
            </div>
            <div class="sg-info-item">
              <span>Status</span>
              <strong>{{ status.loginState || 'connected' }}</strong>
            </div>
            <div class="sg-info-item">
              <span>Linked</span>
              <strong>{{ status.connectedAt ? formatDateDivider(status.connectedAt) : 'Now' }}</strong>
            </div>
          </div>

          <div class="sg-info-actions">
            <button class="sg-chip-btn" @click="showProfilePanel = false">Close</button>
            <button class="sg-chip-btn" @click="emit('open-integrations')">Open Integrations</button>
          </div>
        </div>
      </div>

      <div v-if="status.connected" class="sg-action-panel-wrap">
        <CommunicationInsightsWidget
          title="OrionAI insights"
          panel-title="Reply / Action Required"
          :panel-headline="'Signal conversations OrionAI believes are truly waiting on you'"
          :summary-text="signalActionSummary"
          :counts="signalActionCounts"
          :items="signalActionItems"
          :groups="signalActionGroups"
          :loading="signalActionsLoading"
          :selected-conversation-id="selectedRoom?.roomId"
          @refresh="refreshSignalActions"
          @open="openSignalActionConversation"
          @draft="draftSignalActionConversation"
          @done="completeSignalAction"
          @snooze="snoozeSignalAction"
          @dismiss="dismissSignalAction"
        />
      </div>

      <div class="sg-search-wrap">
        <input
          v-model="roomQuery"
          class="sg-search"
          :disabled="!status.connected"
          placeholder="Search Signal chats..."
        />
      </div>

      <div v-if="loadingRooms" class="sg-state">
        <span class="sg-spinner"></span>
        <span>Loading Signal rooms...</span>
      </div>

      <div v-else-if="!status.connected" class="sg-empty">
        <div class="sg-empty-icon">🛡️</div>
        <strong>Signal is not connected</strong>
        <p>{{ status.lastError || status.error || 'Connect Signal in Integrations to load conversations.' }}</p>
        <button class="sg-empty-btn" @click="emit('open-integrations')">Open Integrations</button>
      </div>

      <div v-else-if="filteredRooms.length === 0" class="sg-empty sg-empty--rooms">
        <div class="sg-empty-icon">💬</div>
        <strong>{{ roomQuery ? 'No matching rooms' : 'No Signal rooms yet' }}</strong>
        <p>
          {{ roomQuery
            ? 'Try a different search term.'
            : 'If you just linked Signal, give OrionAI a moment to finish syncing your chats.' }}
        </p>
      </div>

      <div v-else class="sg-room-list">
        <button
          v-for="room in filteredRooms"
          :key="room.roomId"
          class="sg-room-item"
          :class="{ active: selectedRoom?.roomId === room.roomId }"
          @click="selectRoom(room)"
        >
          <div class="sg-room-avatar">
            <img
              v-if="room.avatarUrl && !isImageBroken(room.avatarUrl)"
              :src="authMediaUrl(room.avatarUrl)"
              :alt="room.name"
              @error="markImageBroken(room.avatarUrl)"
            />
            <span v-else>{{ avatarInitials(room.name) }}</span>
          </div>
          <div class="sg-room-body">
            <div class="sg-room-top">
              <strong>{{ room.name }}</strong>
              <span class="sg-room-time">{{ formatRoomTime(room.lastMessageAt) }}</span>
            </div>
            <p class="sg-room-preview">{{ room.lastMessage || 'No messages yet' }}</p>
          </div>
          <div class="sg-room-meta">
            <span v-if="room.unreadCount" class="sg-room-badge">{{ room.unreadCount }}</span>
          </div>
        </button>
      </div>
    </aside>

    <main class="sg-main">
      <div v-if="!selectedRoom" class="sg-empty sg-empty--main">
        <div class="sg-empty-icon">💬</div>
        <strong>{{ status.connected ? 'Select a conversation' : 'Signal is waiting for setup' }}</strong>
        <p>
          {{ status.connected
            ? 'Choose a chat from the left to open your Signal timeline, upload files, and manage replies.'
            : 'Once connected, notifications, urgent WorkspaceBriefing items, and the full Signal workspace will appear here.' }}
        </p>
      </div>

      <template v-else>
        <header class="sg-chat-head">
          <button class="sg-chat-head-main sg-chat-head-main-btn" type="button" @click="showInfoPanel = !showInfoPanel">
            <div class="sg-room-avatar sg-room-avatar--head">
              <img
                v-if="selectedRoom.avatarUrl && !isImageBroken(selectedRoom.avatarUrl)"
                :src="authMediaUrl(selectedRoom.avatarUrl)"
                :alt="selectedRoom.name"
                @error="markImageBroken(selectedRoom.avatarUrl)"
              />
              <span v-else>{{ avatarInitials(selectedRoom.name) }}</span>
            </div>
            <div>
              <strong>{{ selectedRoom.name }}</strong>
              <span>{{ selectedRoomSubline }}</span>
            </div>
          </button>
          <div class="sg-chat-actions">
            <button class="sg-icon-btn" :class="{ active: messageSearchOpen }" title="Search messages" @click="toggleMessageSearch">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
            <button class="sg-icon-btn" :class="{ active: showInfoPanel }" title="Room info" @click="showInfoPanel = !showInfoPanel">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </button>
            <button class="sg-icon-btn" title="Refresh room" :disabled="loadingMessages" @click="refreshSelectedRoom">
              <span v-if="loadingMessages" class="sg-spinner sg-spinner-sm"></span>
              <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10" />
                <path d="M1 14l4.6 4.4A9 9 0 0 0 20.5 15" />
              </svg>
            </button>
          </div>
        </header>

        <div v-if="messageSearchOpen" class="sg-message-search">
          <input
            v-model="messageQuery"
            class="sg-message-search-input"
            placeholder="Search this conversation..."
          />
          <span class="sg-message-search-count">
            {{ visibleMessages.length === messages.length ? `${messages.length} shown` : `${visibleMessages.length} match${visibleMessages.length === 1 ? '' : 'es'}` }}
          </span>
        </div>

        <div class="sg-chat-layout">
          <section class="sg-thread">
            <div v-if="prevBatch" class="sg-load-earlier">
              <button class="sg-load-btn" :disabled="loadingOlder" @click="loadOlderMessages">
                <span v-if="loadingOlder" class="sg-spinner sg-spinner-sm"></span>
                <span v-else>Load earlier messages</span>
              </button>
            </div>

            <div ref="messagesEl" class="sg-messages">
              <div v-if="loadingMessages && messages.length === 0" class="sg-state sg-state--inline">
                <span class="sg-spinner"></span>
                <span>Loading conversation...</span>
              </div>

              <template v-else>
                <template v-for="(message, index) in visibleMessages" :key="message.id">
                  <div v-if="showDateDivider(message, index)" class="sg-date-divider">
                    <span>{{ formatDateDivider(message.timestamp) }}</span>
                  </div>

                  <div class="sg-message-row" :class="{ 'from-me': message.fromMe }">
                    <div v-if="!message.fromMe" class="sg-message-avatar">
                      <img
                        v-if="message.senderAvatarUrl && !isImageBroken(message.senderAvatarUrl)"
                        :src="authMediaUrl(message.senderAvatarUrl)"
                        :alt="message.senderName"
                        @error="markImageBroken(message.senderAvatarUrl)"
                      />
                      <span v-else>{{ avatarInitials(message.senderName) }}</span>
                    </div>

                    <div class="sg-bubble-wrap">
                      <div class="sg-message-tools">
                        <button class="sg-tool-btn" title="Reply" @click="startReply(message)">Reply</button>
                        <button class="sg-tool-btn" title="React" @click="toggleReactionPicker(message.id)">React</button>
                        <button v-if="message.canEdit && !message.deleted" class="sg-tool-btn" title="Edit" @click="startEdit(message)">Edit</button>
                        <button v-if="message.canDelete" class="sg-tool-btn sg-tool-btn--danger" title="Delete" @click="removeMessage(message)">Delete</button>
                        <button class="sg-tool-btn" title="Copy" @click="copyMessage(message)">Copy</button>
                        <button v-if="message.media?.url" class="sg-tool-btn" title="Download" @click="downloadMedia(message)">Download</button>
                      </div>

                      <div class="sg-message-bubble" :class="{ deleted: message.deleted }">
                        <div v-if="!message.fromMe && !selectedRoom?.isDirect" class="sg-sender-name">{{ message.senderName }}</div>

                        <div v-if="message.replyPreview" class="sg-reply-preview">
                          <strong>{{ message.replyPreview.senderName }}</strong>
                          <span>{{ message.replyPreview.text }}</span>
                        </div>

                        <div v-if="reactionPickerFor === message.id" class="sg-reaction-picker">
                          <button
                            v-for="reaction in REACTIONS"
                            :key="reaction"
                            class="sg-reaction-option"
                            @click="reactToMessage(message, reaction)"
                          >
                            {{ reaction }}
                          </button>
                        </div>

                        <div v-if="message.deleted" class="sg-message-deleted">Message deleted</div>

                        <template v-else>
                          <div
                            v-if="message.media?.type === 'image' && !isImageBroken(message.media.url)"
                            class="sg-media-card sg-media-card--image"
                          >
                            <img
                              :src="authMediaUrl(message.media.url)"
                              :alt="message.media.body || message.media.fileName"
                              @click="openImage(message.media)"
                              @error="markImageBroken(message.media?.url)"
                            />
                          </div>

                          <div v-else-if="message.media?.type === 'video'" class="sg-media-card">
                            <video :src="authMediaUrl(message.media.url)" controls preload="metadata"></video>
                          </div>

                          <div v-else-if="message.media?.type === 'audio'" class="sg-media-card sg-media-card--audio">
                            <audio :src="authMediaUrl(message.media.url)" controls preload="metadata"></audio>
                          </div>

                          <a
                            v-else-if="message.media?.type === 'location'"
                            class="sg-file-card"
                            :href="signalLocationUrl(message.media)"
                            target="_blank"
                            rel="noopener"
                          >
                            <span class="sg-file-icon">📍</span>
                            <span>Open location</span>
                          </a>

                          <a
                            v-else-if="message.media?.url"
                            class="sg-file-card"
                            :href="authMediaUrl(message.media.url)"
                            target="_blank"
                            rel="noopener"
                          >
                            <span class="sg-file-icon">📎</span>
                            <span class="sg-file-text">
                              <strong>{{ message.media.fileName || message.media.body || 'Attachment' }}</strong>
                              <small>{{ readableSize(message.media.size) }}</small>
                            </span>
                          </a>

                          <div v-if="message.text" class="sg-message-text">{{ message.text }}</div>
                        </template>

                        <div class="sg-message-footer">
                          <span>{{ message.timeLabel || formatMessageTime(message.timestamp) }}</span>
                          <span v-if="message.edited && !message.deleted">edited</span>
                        </div>
                      </div>

                      <div v-if="message.reactions?.length && !message.deleted" class="sg-reactions">
                        <button
                          v-for="reaction in message.reactions"
                          :key="`${message.id}-${reaction.key}`"
                          class="sg-reaction-chip"
                          :class="{ mine: reaction.byMe }"
                          @click="reactToMessage(message, reaction.key)"
                        >
                          <span>{{ reaction.key }}</span>
                          <span>{{ reaction.count }}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </template>

                <div v-if="!visibleMessages.length" class="sg-empty sg-empty--thread">
                  <div class="sg-empty-icon">🔎</div>
                  <strong>{{ messageQuery ? 'No messages found' : 'No messages yet' }}</strong>
                  <p>{{ messageQuery ? 'Try another search in this conversation.' : 'This Signal room has no visible messages right now.' }}</p>
                </div>
              </template>
            </div>
          </section>

          <aside v-if="showInfoPanel" class="sg-info-panel">
            <div class="sg-info-head">
              <strong>Contact info</strong>
              <button class="sg-icon-btn sg-icon-btn--ghost" title="Close profile" @click="showInfoPanel = false">
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <div class="sg-info-card">
              <div class="sg-info-avatar">
                <img
                  v-if="selectedRoom.avatarUrl && !isImageBroken(selectedRoom.avatarUrl)"
                  :src="authMediaUrl(selectedRoom.avatarUrl)"
                  :alt="selectedRoom.name"
                  @error="markImageBroken(selectedRoom.avatarUrl)"
                />
                <span v-else>{{ avatarInitials(selectedRoom.name) }}</span>
              </div>
              <strong>{{ selectedRoom.name }}</strong>
              <span>{{ selectedRoomSubline }}</span>
            </div>

            <div class="sg-info-grid">
              <div class="sg-info-item">
                <span>Unread</span>
                <strong>{{ selectedRoom.unreadCount || 0 }}</strong>
              </div>
              <div class="sg-info-item">
                <span>Highlights</span>
                <strong>{{ selectedRoom.highlightCount || 0 }}</strong>
              </div>
              <div class="sg-info-item">
                <span>Contact</span>
                <strong>{{ selectedRoom.phoneNumber || selectedRoom.signalIdentifier || 'Not available' }}</strong>
              </div>
              <div class="sg-info-item">
                <span>Type</span>
                <strong>{{ selectedRoom.isDirect ? 'Direct' : 'Group' }}</strong>
              </div>
            </div>

            <div class="sg-info-section">
              <span class="sg-info-label">Sync</span>
              <p>
                Live Signal chats are loaded on demand, and notifications continue updating in OrionAI.
              </p>
            </div>

            <div class="sg-info-actions">
              <button class="sg-chip-btn" @click="markCurrentRoomRead">Mark read</button>
              <button class="sg-chip-btn" @click="refreshSelectedRoom">Refresh room</button>
            </div>
          </aside>
        </div>

        <div v-if="replyTarget || editingMessage || pendingUploads.length || isRecordingVoice" class="sg-compose-top">
          <div v-if="replyTarget" class="sg-compose-banner">
            <span class="sg-compose-banner-label">Replying to {{ replyTarget.senderName }}</span>
            <span class="sg-compose-banner-text">{{ replyTarget.text || replyTarget.media?.fileName || 'Attachment' }}</span>
            <button @click="replyTarget = null">✕</button>
          </div>
          <div v-if="editingMessage" class="sg-compose-banner">
            <span class="sg-compose-banner-label">Editing message</span>
            <span class="sg-compose-banner-text">{{ editingMessage.text }}</span>
            <button @click="cancelEdit">✕</button>
          </div>
          <div v-if="pendingUploads.length" class="sg-upload-strip">
            <div v-for="upload in pendingUploads" :key="upload.id" class="sg-upload-chip">
              <span>{{ upload.label || upload.file.name }}</span>
              <button @click="removePendingUpload(upload.id)">✕</button>
            </div>
          </div>
          <div v-if="isRecordingVoice" class="sg-compose-banner sg-compose-banner--recording">
            <span class="sg-compose-banner-label">Recording voice note</span>
            <span class="sg-compose-banner-text">{{ formatRecordingDuration(voiceRecordingSeconds) }}</span>
            <button @click="stopVoiceRecording">Stop</button>
          </div>
        </div>

        <footer class="sg-compose">
          <input ref="fileInputEl" type="file" multiple hidden @change="handleFileSelect" />
          <button class="sg-compose-btn" title="Attach files" @click="fileInputEl?.click()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.44 11.05 12.25 20.24a5.5 5.5 0 0 1-7.78-7.78l9.2-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.19 9.2a1.5 1.5 0 1 1-2.12-2.13l8.49-8.48" />
            </svg>
          </button>
          <button
            class="sg-compose-btn"
            :class="{ 'is-recording': isRecordingVoice }"
            :disabled="!canRecordVoice"
            :title="isRecordingVoice ? 'Stop voice recording' : 'Record a voice message'"
            @click="toggleVoiceRecording"
          >
            <span v-if="isRecordingVoice" class="sg-recording-dot"></span>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z" />
              <path d="M19 11a7 7 0 0 1-14 0" />
              <path d="M12 18v3" />
            </svg>
          </button>
          <textarea
            ref="composerEl"
            v-model="draft"
            class="sg-compose-input"
            rows="1"
            :placeholder="editingMessage ? 'Update your message...' : pendingUploads.length ? 'Add a caption or send the files...' : 'Type a Signal message...'"
            @keydown.enter.exact.prevent="sendDraft"
            @input="autoResize"
          ></textarea>
          <button
            class="sg-compose-send"
            :disabled="isRecordingVoice || sending || (!draft.trim() && !pendingUploads.length)"
            @click="sendDraft"
          >
            <span v-if="sending" class="sg-spinner sg-spinner-sm"></span>
            <svg v-else width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </footer>
      </template>
    </main>

    <div v-if="lightboxUrl" class="sg-lightbox" @click="closeLightbox">
      <img :src="authMediaUrl(lightboxUrl)" :alt="lightboxName" class="sg-lightbox-img" @click.stop />
      <button class="sg-lightbox-close" @click="closeLightbox">✕</button>
      <a class="sg-lightbox-download" :href="authMediaUrl(lightboxUrl)" :download="lightboxName" @click.stop>Download</a>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import api, { API_BASE } from '../services/api'
import { store, setModuleContext } from '../stores/app'
import { useWebSocket } from '../composables/useWebSocket'
import CommunicationInsightsWidget from '../components/communications/CommunicationInsightsWidget.vue'
import { useCommunicationActions, emitCommunicationPriorityRefresh } from '../composables/useCommunicationActions'

const emit = defineEmits(['close', 'open-integrations'])

const status = ref({
  connected: false,
  roomCount: 0,
  unreadCount: 0,
  profile: null,
})
const rooms = ref([])
const selectedRoom = ref(null)
const messages = ref([])
const prevBatch = ref(null)
const roomQuery = ref('')
const messageQuery = ref('')
const draft = ref('')
const loadingRooms = ref(false)
const loadingMessages = ref(false)
const loadingOlder = ref(false)
const refreshing = ref(false)
const sending = ref(false)
const replyTarget = ref(null)
const editingMessage = ref(null)
const pendingUploads = ref([])
const reactionPickerFor = ref(null)
const messageSearchOpen = ref(false)
const showInfoPanel = ref(false)
const showProfilePanel = ref(false)
const canRecordVoice = ref(false)
const isRecordingVoice = ref(false)
const voiceRecordingSeconds = ref(0)
const lightboxUrl = ref('')
const lightboxName = ref('')
const messagesEl = ref(null)
const composerEl = ref(null)
const fileInputEl = ref(null)
const failedImages = ref({})
const localReadCutoffs = ref({})
let pollTimer = null
let voiceRecorder = null
let voiceStream = null
let voiceChunks = []
let voiceMimeType = ''
let voiceTimer = null

const REACTIONS = ['👍', '❤️', '😂', '🔥', '🙏', '🎉']

const { unreadByApp } = useWebSocket()
const {
  actionableItems: signalActionItems,
  counts: signalActionCounts,
  groups: signalActionGroups,
  loading: signalActionsLoading,
  summaryText: signalActionSummary,
  refresh: refreshSignalActions,
  recordAction: recordSignalAction,
} = useCommunicationActions('signal')

const filteredRooms = computed(() => {
  const query = roomQuery.value.trim().toLowerCase()
  if (!query) return rooms.value
  return rooms.value.filter((room) => {
    const haystack = [room.name, room.lastMessage, room.lastSender]
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
      message.media?.fileName,
      message.media?.body,
      message.replyPreview?.text,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(query)
  })
})

const selectedRoomSubline = computed(() => {
  if (!selectedRoom.value) return ''
  if (selectedRoom.value.isDirect) {
    return selectedRoom.value.unreadCount
      ? `${selectedRoom.value.unreadCount} unread`
      : 'Direct Signal conversation'
  }
  const unread = Number(selectedRoom.value.unreadCount || 0)
  return `${selectedRoom.value.memberCount || 0} members${unread ? ` · ${unread} unread` : ''}`
})

function avatarInitials(name = '') {
  const text = String(name || '').trim()
  if (!text) return '?'
  const wordParts = text.match(/\p{L}+/gu) || []
  if (wordParts.length >= 2) return `${wordParts[0][0]}${wordParts[1][0]}`.toUpperCase()
  if (wordParts.length === 1) return wordParts[0].slice(0, 2).toUpperCase()
  const digits = text.replace(/\D/g, '')
  if (digits) return 'SG'
  return text.slice(0, 2).toUpperCase()
}

function normalizeTimestamp(value) {
  if (!value) return 0
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) return numeric
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function formatRecordingDuration(totalSeconds = 0) {
  const seconds = Math.max(0, Number(totalSeconds || 0))
  const minutes = Math.floor(seconds / 60)
  const remainder = String(seconds % 60).padStart(2, '0')
  return `${minutes}:${remainder}`
}

function formatRoomTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const sameDay = new Date().toDateString() === date.toDateString()
  return sameDay
    ? date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function formatMessageTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateDivider(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function showDateDivider(message, index) {
  if (!message || index === 0) return true
  const previous = visibleMessages.value[index - 1]
  if (!previous) return true
  return new Date(previous.timestamp).toDateString() !== new Date(message.timestamp).toDateString()
}

function readableSize(bytes = 0) {
  const value = Number(bytes || 0)
  if (!value) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function signalLocationUrl(media = {}) {
  if (!media?.geoUri) return '#'
  const match = String(media.geoUri).match(/geo:([-0-9.]+),([-0-9.]+)/i)
  if (!match) return '#'
  return `https://www.google.com/maps/place/${match[1]},${match[2]}`
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

function setLocalReadCutoff(roomId = '', timestamp = 0) {
  const key = String(roomId || '').trim()
  if (!key) return
  localReadCutoffs.value = {
    ...localReadCutoffs.value,
    [key]: normalizeTimestamp(timestamp || Date.now()),
  }
}

function clearLocalReadCutoff(roomId = '') {
  const key = String(roomId || '').trim()
  if (!key || !(key in localReadCutoffs.value)) return
  const next = { ...localReadCutoffs.value }
  delete next[key]
  localReadCutoffs.value = next
}

function getLocalReadCutoff(roomId = '') {
  return Number(localReadCutoffs.value[String(roomId || '').trim()] || 0)
}

function normalizeRoomReadState(room = null) {
  if (!room?.roomId) return room
  const roomId = String(room.roomId)
  const latestTimestamp = normalizeTimestamp(room.lastMessageTs || room.lastMessageAt)
  const localCutoff = getLocalReadCutoff(roomId)
  const isOpenRoom = String(selectedRoom.value?.roomId || '') === roomId

  if (localCutoff && latestTimestamp > localCutoff) {
    clearLocalReadCutoff(roomId)
  }

  if (isOpenRoom || (localCutoff && (!latestTimestamp || latestTimestamp <= localCutoff))) {
    return {
      ...room,
      unreadCount: 0,
      highlightCount: 0,
    }
  }

  return room
}

function buildMediaUrlFromMxc(mxc = '') {
  const raw = String(mxc || '').trim()
  return raw ? `/api/signal/media?mxc=${encodeURIComponent(raw)}` : ''
}

function autoResize(event) {
  const element = event?.target || composerEl.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 160)}px`
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

function mergeMessages(existing, incoming) {
  const byId = new Map()
  ;[...(existing || []), ...(incoming || [])].forEach((message) => {
    if (!message?.id) return
    byId.set(String(message.id), message)
  })
  return [...byId.values()].sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
}

function updateSelectedRoomFromList() {
  if (!selectedRoom.value) return
  const fresh = rooms.value.find((room) => String(room.roomId) === String(selectedRoom.value.roomId))
  if (fresh) selectedRoom.value = fresh
}

function buildOptimisticMessage({
  eventId,
  roomId,
  text = '',
  media = null,
  replyToEventId = null,
  timestamp = Date.now(),
}) {
  const displayName = status.value.profile?.displayName || 'You'
  return {
    id: String(eventId || `local-${timestamp}`),
    eventId: String(eventId || `local-${timestamp}`),
    roomId: String(roomId),
    sender: 'me',
    senderName: 'You',
    senderAvatarUrl: status.value.profile?.avatarUrl || '',
    timestamp,
    isoTimestamp: new Date(timestamp).toISOString(),
    timeLabel: formatMessageTime(timestamp),
    fromMe: true,
    text: String(text || '').trim(),
    previewText: String(text || '').trim() || media?.body || media?.fileName || 'Attachment',
    replyToEventId: replyToEventId || null,
    replyPreview: replyToEventId
      ? (() => {
          const target = messages.value.find((message) => String(message.id) === String(replyToEventId))
          return target
            ? {
                eventId: target.id,
                senderName: target.senderName || displayName,
                text: target.text || target.media?.fileName || 'Attachment',
              }
            : null
        })()
      : null,
    reactions: [],
    edited: false,
    deleted: false,
    redactionEventId: null,
    media,
    messageType: media?.type === 'image'
      ? 'm.image'
      : media?.type === 'video'
        ? 'm.video'
        : media?.type === 'audio'
          ? 'm.audio'
          : media?.type
            ? 'm.file'
            : 'm.text',
    canEdit: !media,
    canDelete: true,
  }
}

function applyOptimisticRoomState(message) {
  if (!message?.roomId) return
  const roomId = String(message.roomId)
  const isoTimestamp = message.isoTimestamp || new Date(message.timestamp || Date.now()).toISOString()
  const preview = message.previewText || message.text || message.media?.body || message.media?.fileName || 'Attachment'

  rooms.value = rooms.value.map((room) =>
    String(room.roomId) === roomId
      ? {
          ...room,
          lastEventId: message.id,
          lastMessage: preview,
          lastSender: 'You',
          lastMessageFromMe: true,
          lastMessageAt: isoTimestamp,
          lastMessageTs: Number(message.timestamp || Date.now()),
        }
      : room
  )

  if (selectedRoom.value?.roomId === roomId) {
    selectedRoom.value = {
      ...selectedRoom.value,
      lastEventId: message.id,
      lastMessage: preview,
      lastSender: 'You',
      lastMessageFromMe: true,
      lastMessageAt: isoTimestamp,
      lastMessageTs: Number(message.timestamp || Date.now()),
    }
  }
}

function appendOptimisticMessages(nextMessages = []) {
  const validMessages = (nextMessages || []).filter(Boolean)
  if (!validMessages.length) return
  messages.value = mergeMessages(messages.value, validMessages)
  validMessages.forEach((message) => applyOptimisticRoomState(message))
}

async function loadStatus() {
  const { data } = await api.get('/api/signal/status')
  status.value = data || { connected: false }
  if (!status.value.connected) {
    stopPolling()
    showProfilePanel.value = false
    rooms.value = []
    messages.value = []
    selectedRoom.value = null
    prevBatch.value = null
  }
}

async function loadRooms({ silent = false } = {}) {
  if (!silent) loadingRooms.value = true
  try {
    const { data } = await api.get('/api/signal/rooms', {
      params: { limit: 120 },
    })
    rooms.value = (Array.isArray(data.rooms) ? data.rooms : []).map((room) => normalizeRoomReadState(room))
    updateSelectedRoomFromList()
  } catch (err) {
    console.error('Failed to load Signal rooms:', err.message)
  } finally {
    if (!silent) loadingRooms.value = false
  }
}

async function loadMessages(room, { from = '', append = false, silent = false } = {}) {
  if (!room?.roomId) return

  const previousHeight = messagesEl.value?.scrollHeight || 0
  const shouldStickToBottom = !append && isNearBottom()
  const sameRoomHistory = messages.value.every(
    (message) => String(message.roomId) === String(room.roomId)
  )

  if (append) loadingOlder.value = true
  else if (!silent) loadingMessages.value = true

  try {
    const { data } = await api.get(`/api/signal/rooms/${encodeURIComponent(room.roomId)}/messages`, {
      params: {
        limit: 50,
        ...(from ? { from } : {}),
      },
    })

    const incomingMessages = Array.isArray(data.messages) ? data.messages : []
    const latestVisibleTimestamp =
      [...incomingMessages].reverse().find((message) => !message?.fromMe && message?.id)?.timestamp ||
      [...incomingMessages].reverse().find((message) => message?.id)?.timestamp ||
      0
    prevBatch.value = data.prevBatch || null
    selectedRoom.value = normalizeRoomReadState(data.room || room)

    if (append) {
      messages.value = mergeMessages(incomingMessages, messages.value)
      await nextTick()
      if (messagesEl.value) {
        const delta = messagesEl.value.scrollHeight - previousHeight
        messagesEl.value.scrollTop += delta
      }
    } else {
      messages.value = sameRoomHistory
        ? mergeMessages(messages.value, incomingMessages)
        : incomingMessages
      await nextTick()
      if (shouldStickToBottom) scrollToBottom()
    }

    if (String(selectedRoom.value?.roomId || '') === String(room.roomId) && latestVisibleTimestamp) {
      setLocalReadCutoff(room.roomId, latestVisibleTimestamp)
      const unreadCount = Number((data.room || room)?.unreadCount || 0)
      if (unreadCount > 0) {
        markRoomRead(data.room || room).catch((err) => {
          console.debug('Signal auto-read sync failed:', err?.message || err)
        })
      }
    }
  } catch (err) {
    console.error('Failed to load Signal messages:', err.message)
  } finally {
    if (append) loadingOlder.value = false
    else if (!silent) loadingMessages.value = false
  }
}

async function markRoomRead(room = selectedRoom.value) {
  if (!room?.roomId) return
  try {
    const latestVisible = [...messages.value].reverse().find((message) => message?.id)
    const readTimestamp =
      normalizeTimestamp(latestVisible?.timestamp || room.lastMessageTs || room.lastMessageAt) || Date.now()
    setLocalReadCutoff(room.roomId, readTimestamp)
    await api.post(`/api/signal/rooms/${encodeURIComponent(room.roomId)}/read`, {
      eventId: latestVisible?.id || room.lastEventId || '',
    })
    emitCommunicationPriorityRefresh('communication_read', {
      sourceApp: 'signal',
      conversationId: room.roomId,
    })
    await refreshSignalActions({ silent: true })
    rooms.value = rooms.value.map((entry) =>
      entry.roomId === room.roomId
        ? normalizeRoomReadState({ ...entry, unreadCount: 0, highlightCount: 0 })
        : entry
    )
    if (selectedRoom.value?.roomId === room.roomId) {
      selectedRoom.value = normalizeRoomReadState({
        ...selectedRoom.value,
        unreadCount: 0,
        highlightCount: 0,
      })
    }
  } catch (err) {
    console.debug('Failed to mark Signal room as read:', err.message)
  }
}

async function selectRoom(room) {
  if (!room?.roomId) return
  const unreadBeforeOpen = Number(room.unreadCount || 0)
  const switchingRooms = String(selectedRoom.value?.roomId || '') !== String(room.roomId)
  setLocalReadCutoff(room.roomId, room.lastMessageTs || room.lastMessageAt || Date.now())
  selectedRoom.value = normalizeRoomReadState(room)
  showProfilePanel.value = false
  replyTarget.value = null
  editingMessage.value = null
  reactionPickerFor.value = null
  if (switchingRooms) {
    messages.value = []
    prevBatch.value = null
  }
  await loadMessages(room)
  if (unreadBeforeOpen > 0) {
    await markRoomRead(room)
  }
}

async function refreshSelectedRoom() {
  if (!selectedRoom.value?.roomId) return
  await loadMessages(selectedRoom.value, { silent: false })
  await loadRooms({ silent: true })
}

async function refreshAll() {
  refreshing.value = true
  try {
    await loadStatus()
    if (status.value.connected) {
      await Promise.all([
        loadRooms({ silent: false }),
        refreshSignalActions({ silent: false }),
      ])
      if (selectedRoom.value?.roomId) {
        await loadMessages(selectedRoom.value, { silent: true })
      }
    }
  } finally {
    refreshing.value = false
  }
}

async function loadOlderMessages() {
  if (!selectedRoom.value?.roomId || !prevBatch.value || loadingOlder.value) return
  await loadMessages(selectedRoom.value, { from: prevBatch.value, append: true })
}

function focusComposer() {
  nextTick(() => composerEl.value?.focus())
}

function resetComposerState() {
  replyTarget.value = null
  editingMessage.value = null
  reactionPickerFor.value = null
}

function cancelEdit() {
  editingMessage.value = null
  draft.value = ''
  focusComposer()
}

function startReply(message) {
  replyTarget.value = message
  editingMessage.value = null
  focusComposer()
}

function startEdit(message) {
  editingMessage.value = message
  replyTarget.value = null
  draft.value = message.text || ''
  focusComposer()
}

function toggleReactionPicker(messageId) {
  reactionPickerFor.value = reactionPickerFor.value === messageId ? null : messageId
}

async function reactToMessage(message, reaction) {
  if (!selectedRoom.value?.roomId || !message?.id) return
  try {
    await api.post(
      `/api/signal/rooms/${encodeURIComponent(selectedRoom.value.roomId)}/messages/${encodeURIComponent(message.id)}/react`,
      { key: reaction }
    )
    reactionPickerFor.value = null
    await loadMessages(selectedRoom.value, { silent: true })
  } catch (err) {
    console.error('Failed to toggle reaction:', err.message)
  }
}

async function copyMessage(message) {
  try {
    await navigator.clipboard.writeText(message.text || message.media?.fileName || '')
  } catch (err) {
    console.debug('Failed to copy Signal message:', err?.message || err)
  }
}

async function removeMessage(message) {
  if (!selectedRoom.value?.roomId || !message?.id) return
  const okay = window.confirm('Delete this message from the Signal timeline?')
  if (!okay) return
  try {
    await api.delete(
      `/api/signal/rooms/${encodeURIComponent(selectedRoom.value.roomId)}/messages/${encodeURIComponent(message.id)}`
    )
    await loadMessages(selectedRoom.value, { silent: true })
    await loadRooms({ silent: true })
  } catch (err) {
    console.error('Failed to delete Signal message:', err.message)
  }
}

function openImage(media) {
  lightboxUrl.value = media?.url || ''
  lightboxName.value = media?.fileName || 'signal-image'
}

function closeLightbox() {
  lightboxUrl.value = ''
  lightboxName.value = ''
}

function downloadMedia(message) {
  if (!message?.media?.url) return
  window.open(authMediaUrl(message.media.url), '_blank', 'noopener')
}

function removePendingUpload(id) {
  pendingUploads.value = pendingUploads.value.filter((upload) => upload.id !== id)
}

function handleFileSelect(event) {
  const files = Array.from(event.target?.files || [])
  if (!files.length) return
  pendingUploads.value = [
    ...pendingUploads.value,
    ...files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
    })),
  ]
  event.target.value = ''
  focusComposer()
}

function stopVoiceStream() {
  if (voiceStream?.getTracks) {
    voiceStream.getTracks().forEach((track) => track.stop())
  }
  voiceStream = null
}

function resetVoiceRecorder() {
  if (voiceTimer) {
    clearInterval(voiceTimer)
    voiceTimer = null
  }
  voiceRecorder = null
  voiceChunks = []
  voiceMimeType = ''
  isRecordingVoice.value = false
  voiceRecordingSeconds.value = 0
  stopVoiceStream()
}

function pickVoiceMimeType() {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return ''
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
    'audio/ogg',
  ]
  return candidates.find((type) => window.MediaRecorder.isTypeSupported?.(type)) || ''
}

async function startVoiceRecording() {
  if (isRecordingVoice.value || !canRecordVoice.value) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = pickVoiceMimeType()
    const recorder = mimeType ? new window.MediaRecorder(stream, { mimeType }) : new window.MediaRecorder(stream)
    voiceStream = stream
    voiceRecorder = recorder
    voiceChunks = []
    voiceMimeType = recorder.mimeType || mimeType || 'audio/webm'

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        voiceChunks.push(event.data)
      }
    }

    recorder.onstop = () => {
      const recordedBlob = new Blob(voiceChunks, { type: voiceMimeType || 'audio/webm' })
      if (recordedBlob.size > 0) {
        const extension = voiceMimeType.includes('ogg') ? 'ogg' : 'webm'
        const file = new File([recordedBlob], `Voice message.${extension}`, {
          type: voiceMimeType || 'audio/webm',
        })
        pendingUploads.value = [
          ...pendingUploads.value,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            file,
            label: `Voice message ${formatRecordingDuration(voiceRecordingSeconds.value)}`,
            kind: 'voice',
          },
        ]
      }
      resetVoiceRecorder()
      focusComposer()
    }

    recorder.onerror = () => {
      resetVoiceRecorder()
    }

    recorder.start()
    isRecordingVoice.value = true
    voiceRecordingSeconds.value = 0
    voiceTimer = window.setInterval(() => {
      voiceRecordingSeconds.value += 1
    }, 1000)
  } catch (err) {
    console.error('Failed to start Signal voice recording:', err?.message || err)
    resetVoiceRecorder()
  }
}

function stopVoiceRecording() {
  if (!voiceRecorder) return
  if (voiceTimer) {
    clearInterval(voiceTimer)
    voiceTimer = null
  }
  isRecordingVoice.value = false
  voiceRecorder.stop()
}

function toggleVoiceRecording() {
  if (isRecordingVoice.value) {
    stopVoiceRecording()
    return
  }
  startVoiceRecording()
}

async function sendDraft() {
  if (!selectedRoom.value?.roomId || sending.value) return
  const text = draft.value.trim()
  const uploads = [...pendingUploads.value]
  if (!text && !uploads.length) return

  sending.value = true
  try {
    const optimisticMessages = []
    if (editingMessage.value?.id) {
      await api.post(
        `/api/signal/rooms/${encodeURIComponent(selectedRoom.value.roomId)}/messages/${encodeURIComponent(editingMessage.value.id)}/edit`,
        { text }
      )
    } else if (uploads.length) {
      for (let index = 0; index < uploads.length; index += 1) {
        const upload = uploads[index]
        const payload = new FormData()
        payload.append('file', upload.file)
        if (index === 0 && text) payload.append('caption', text)
        if (replyTarget.value?.id) payload.append('replyToEventId', replyTarget.value.id)

        const { data } = await api.post(
          `/api/signal/rooms/${encodeURIComponent(selectedRoom.value.roomId)}/upload`,
          payload
        )
        const uploadType = upload.file.type || 'application/octet-stream'

        optimisticMessages.push(
          buildOptimisticMessage({
            eventId: data?.eventId,
            roomId: selectedRoom.value.roomId,
            media: {
              type: uploadType.startsWith('image/')
                ? 'image'
                : uploadType.startsWith('video/')
                  ? 'video'
                  : uploadType.startsWith('audio/')
                    ? 'audio'
                    : 'file',
              mxc: data?.contentUri || '',
              url: buildMediaUrlFromMxc(data?.contentUri),
              thumbnailUrl: '',
              fileName: upload.label || upload.file.name,
              body: upload.file.name,
              mimeType: uploadType,
              size: upload.file.size || 0,
            },
            replyToEventId: replyTarget.value?.id || null,
          })
        )

        if (index === 0 && text && data?.captionEventId) {
          optimisticMessages.push(
            buildOptimisticMessage({
              eventId: data.captionEventId,
              roomId: selectedRoom.value.roomId,
              text,
              replyToEventId: replyTarget.value?.id || null,
            })
          )
        }
      }
    } else {
      const { data } = await api.post(
        `/api/signal/rooms/${encodeURIComponent(selectedRoom.value.roomId)}/send`,
        {
          text,
          replyToEventId: replyTarget.value?.id || null,
        }
      )
      optimisticMessages.push(
        buildOptimisticMessage({
          eventId: data?.eventId,
          roomId: selectedRoom.value.roomId,
          text,
          replyToEventId: replyTarget.value?.id || null,
        })
      )
    }

    draft.value = ''
    pendingUploads.value = []
    resetComposerState()
    appendOptimisticMessages(optimisticMessages)
    emitCommunicationPriorityRefresh('communication_replied', {
      sourceApp: 'signal',
      conversationId: selectedRoom.value.roomId,
    })
    await nextTick()
    scrollToBottom()
    Promise.all([
      loadMessages(selectedRoom.value, { silent: true }),
      loadRooms({ silent: true }),
      refreshSignalActions({ silent: true }),
    ]).catch((err) => {
      console.debug('Signal refresh after send failed:', err?.message || err)
    })
  } catch (err) {
    console.error('Failed to send Signal message:', err.message)
  } finally {
    sending.value = false
  }
}

function applyUnreadHints() {
  const entry = unreadByApp.signal
  const liveItems = Array.isArray(entry?.items) ? entry.items : []
  if (!liveItems.length || !rooms.value.length) return

  const liveMap = new Map(
    liveItems
      .filter((item) => item?.chatId || item?.id)
      .map((item) => [String(item.chatId || item.id), item])
  )

  rooms.value = rooms.value.map((room) => {
    const live = liveMap.get(String(room.roomId))
    if (!live) return room
    const latestLiveTimestamp = normalizeTimestamp(live.latestMessageAt)
    const localCutoff = getLocalReadCutoff(room.roomId)
    if (
      String(selectedRoom.value?.roomId || '') === String(room.roomId) ||
      (localCutoff && latestLiveTimestamp && latestLiveTimestamp <= localCutoff)
    ) {
      return normalizeRoomReadState({
        ...room,
        lastMessage: live.preview || room.lastMessage,
        lastEventId: live.latestMessageId || room.lastEventId,
        lastMessageAt: live.latestMessageAt || room.lastMessageAt,
        lastMessageTs: normalizeTimestamp(live.latestMessageAt || room.lastMessageTs),
      })
    }
    const nextUnread = Math.max(
      Number(room.unreadCount || 0),
      Number(live.unread || 0)
    )
    return normalizeRoomReadState({
      ...room,
      unreadCount: nextUnread,
      lastMessage: live.preview || room.lastMessage,
      lastEventId: live.latestMessageId || room.lastEventId,
      lastMessageAt: live.latestMessageAt || room.lastMessageAt,
      highlightCount: Math.max(Number(room.highlightCount || 0), Number(live.highlight || 0)),
    })
  })
  updateSelectedRoomFromList()
}

async function applyModuleContext() {
  const context = store.moduleContext
  if (!context || context.module !== 'signal') return

  const targetRoomId = context.roomId || context.conversationId || null
  if (targetRoomId) {
    let room = rooms.value.find((entry) => String(entry.roomId) === String(targetRoomId))
    if (!room) {
      await loadRooms({ silent: true })
      room = rooms.value.find((entry) => String(entry.roomId) === String(targetRoomId))
    }
    if (room) {
      await selectRoom(room)
    }
  }

  setModuleContext(null)
}

async function openSignalActionConversation(state) {
  if (!state?.conversationId) return
  let room = rooms.value.find((entry) => String(entry.roomId) === String(state.conversationId))
  if (!room) {
    await loadRooms({ silent: true })
    room = rooms.value.find((entry) => String(entry.roomId) === String(state.conversationId))
  }
  if (room) await selectRoom(room)
}

async function draftSignalActionConversation(state) {
  await openSignalActionConversation(state)
  focusComposer()
}

async function completeSignalAction(state) {
  try {
    await recordSignalAction(state, 'approved')
  } catch (err) {
    console.error('Failed to complete Signal action:', err.message)
  }
}

async function snoozeSignalAction(state) {
  try {
    await recordSignalAction(state, 'snoozed', { snoozeMinutes: 60 })
  } catch (err) {
    console.error('Failed to snooze Signal action:', err.message)
  }
}

async function dismissSignalAction(state) {
  try {
    await recordSignalAction(state, 'dismissed')
  } catch (err) {
    console.error('Failed to dismiss Signal action:', err.message)
  }
}

async function markCurrentRoomRead() {
  await markRoomRead(selectedRoom.value)
}

function toggleMessageSearch() {
  messageSearchOpen.value = !messageSearchOpen.value
  if (!messageSearchOpen.value) {
    messageQuery.value = ''
  } else {
    nextTick(() => {
      const input = document.querySelector('.sg-message-search-input')
      input?.focus()
    })
  }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(async () => {
    if (!status.value.connected) return
    try {
      await loadRooms({ silent: true })
      if (selectedRoom.value?.roomId) {
        await loadMessages(selectedRoom.value, { silent: true })
      }
    } catch (err) {
      console.debug('Signal poll refresh failed:', err?.message || err)
    }
  }, 15000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

watch(
  () => unreadByApp.signal?.items,
  () => {
    applyUnreadHints()
  }
)

watch(
  () => store.moduleContext,
  async () => {
    await applyModuleContext()
  }
)

onMounted(async () => {
  canRecordVoice.value = Boolean(
    typeof window !== 'undefined' &&
      window.MediaRecorder &&
      navigator?.mediaDevices?.getUserMedia
  )
  try {
    await loadStatus()
    if (status.value.connected) {
      await Promise.all([
        loadRooms(),
        refreshSignalActions(),
      ])
      await applyModuleContext()
      startPolling()
    }
  } catch (err) {
    console.error('Failed to initialize Signal page:', err.message)
  }
})

onUnmounted(() => {
  stopPolling()
  resetVoiceRecorder()
  pendingUploads.value = []
})
</script>

<style scoped>
.sg-page {
  display: flex;
  height: 100%;
  background:
    radial-gradient(circle at 14% 10%, rgba(59, 130, 246, 0.1), transparent 24%),
    radial-gradient(circle at 86% 14%, rgba(14, 165, 233, 0.08), transparent 22%),
    linear-gradient(180deg, rgba(6, 11, 24, 0.98), rgba(7, 12, 25, 1));
  overflow: hidden;
}

.sg-sidebar {
  position: relative;
  width: 342px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 14px 14px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(4, 9, 22, 0.74);
  backdrop-filter: blur(22px);
}

.sg-sidebar-head,
.sg-chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.sg-head-actions {
  display: flex;
  gap: 8px;
}

.sg-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.sg-brand-btn,
.sg-chat-head-main-btn {
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.sg-brand-btn:disabled {
  cursor: default;
}

.sg-brand-icon {
  width: 42px;
  height: 42px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.24), rgba(14, 165, 233, 0.2));
  border: 1px solid rgba(59, 130, 246, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 16px 28px rgba(7, 12, 30, 0.22);
}

.sg-brand-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}

.sg-avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 13px;
  font-weight: 700;
  color: white;
}

.sg-brand-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sg-brand-copy strong {
  font-size: 15px;
  color: var(--text-primary);
}

.sg-brand-copy span {
  font-size: 11.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sg-icon-btn--ghost {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}

.sg-profile-popover {
  position: absolute;
  top: 72px;
  left: 14px;
  right: 14px;
  z-index: 4;
}

.sg-profile-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  background: rgba(8, 13, 28, 0.96);
  border: 1px solid rgba(59, 130, 246, 0.16);
  border-radius: 22px;
  box-shadow: 0 28px 48px rgba(3, 8, 20, 0.42);
  backdrop-filter: blur(18px);
}

.sg-profile-actions {
  display: flex;
  justify-content: flex-end;
}

.sg-profile-hero {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sg-profile-avatar {
  width: 56px;
  height: 56px;
  border-radius: 20px;
  overflow: hidden;
  flex-shrink: 0;
  background: linear-gradient(135deg, #3b82f6, #0ea5e9);
  color: white;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sg-profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sg-profile-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.sg-profile-copy strong {
  color: var(--text-primary);
  font-size: 15px;
}

.sg-profile-copy span {
  color: var(--text-secondary);
  font-size: 11.5px;
  line-height: 1.4;
}

.sg-chat-head-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.sg-icon-btn,
.sg-chip-btn,
.sg-empty-btn,
.sg-load-btn,
.sg-console-send,
.sg-compose-btn,
.sg-compose-send,
.sg-tool-btn,
.sg-reaction-chip,
.sg-reaction-option {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
}

.sg-icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sg-icon-btn:hover,
.sg-chip-btn:hover,
.sg-empty-btn:hover,
.sg-load-btn:hover,
.sg-console-send:hover,
.sg-compose-btn:hover,
.sg-compose-send:hover,
.sg-tool-btn:hover,
.sg-reaction-chip:hover,
.sg-reaction-option:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.18);
  transform: translateY(-1px);
}

.sg-icon-btn.active {
  background: rgba(59, 130, 246, 0.16);
  border-color: rgba(59, 130, 246, 0.24);
}

.sg-bridge-console,
.sg-message-search,
.sg-info-card,
.sg-info-section,
.sg-compose-top,
.sg-action-panel-wrap :deep(.comm-insights),
.sg-action-panel-wrap :deep(.comm-panel) {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  backdrop-filter: blur(16px);
}

.sg-info-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}

.sg-info-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.sg-info-head strong {
  color: var(--text-primary);
  font-size: 14px;
}

.sg-info-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.sg-chip-btn,
.sg-empty-btn,
.sg-load-btn {
  padding: 9px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.sg-bridge-console {
  padding: 12px 13px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sg-console-head {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.sg-console-head strong {
  font-size: 13px;
  color: var(--text-primary);
}

.sg-console-head span,
.sg-console-copy,
.sg-empty p,
.sg-info-section p {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-secondary);
  margin: 0;
}

.sg-console-copy code,
.sg-info-section code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-primary);
}

.sg-console-row,
.sg-compose {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.sg-console-input,
.sg-search,
.sg-message-search-input,
.sg-compose-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 16px;
  color: var(--text-primary);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.sg-console-input,
.sg-message-search-input,
.sg-search {
  padding: 11px 13px;
  font-size: 12px;
}

.sg-compose-input {
  min-height: 46px;
  max-height: 160px;
  resize: none;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.45;
}

.sg-console-input:focus,
.sg-search:focus,
.sg-message-search-input:focus,
.sg-compose-input:focus {
  border-color: rgba(59, 130, 246, 0.26);
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.08);
}

.sg-console-log {
  max-height: 136px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sg-console-entry {
  font-size: 11.5px;
  border-radius: 12px;
  padding: 9px 10px;
}

.sg-console-entry.request {
  background: rgba(59, 130, 246, 0.12);
  color: #bfdbfe;
}

.sg-console-entry.response {
  background: rgba(16, 185, 129, 0.12);
  color: #bbf7d0;
}

.sg-console-entry.error {
  background: rgba(248, 113, 113, 0.12);
  color: #fecaca;
}

.sg-search-wrap {
  padding-top: 2px;
}

.sg-state,
.sg-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  padding: 18px 14px;
  color: var(--text-secondary);
}

.sg-state--inline {
  min-height: 160px;
}

.sg-empty strong {
  color: var(--text-primary);
  font-size: 14px;
}

.sg-empty-icon {
  font-size: 30px;
}

.sg-room-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  padding: 4px 0 0;
  scrollbar-width: thin;
}

.sg-room-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 8px 12px;
  border-radius: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.sg-room-item:hover {
  background: rgba(255, 255, 255, 0.055);
}

.sg-room-item.active {
  background: rgba(59, 130, 246, 0.12);
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.18);
}

.sg-room-avatar,
.sg-message-avatar,
.sg-info-avatar {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #0ea5e9);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: white;
  font-weight: 700;
  flex-shrink: 0;
}

.sg-room-avatar img,
.sg-message-avatar img,
.sg-info-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sg-room-avatar--head {
  width: 48px;
  height: 48px;
  border-radius: 50%;
}

.sg-room-body {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sg-room-top,
.sg-room-sub {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sg-room-top {
  justify-content: space-between;
}

.sg-room-top strong {
  font-size: 13.5px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sg-room-time,
.sg-room-sub {
  font-size: 11px;
  color: var(--text-muted);
}

.sg-room-preview {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sg-room-chip {
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
}

.sg-room-chip.state-waiting_on_your_reply {
  background: rgba(245, 158, 11, 0.14);
  color: #fbbf24;
}

.sg-room-chip.state-needs_approval {
  background: rgba(248, 113, 113, 0.14);
  color: #fca5a5;
}

.sg-room-chip.state-needs_follow_up {
  background: rgba(56, 189, 248, 0.14);
  color: #7dd3fc;
}

.sg-room-chip.state-waiting_on_others {
  background: rgba(34, 197, 94, 0.14);
  color: #86efac;
}

.sg-room-meta {
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
}

.sg-room-badge {
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: #3b82f6;
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
}

.sg-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sg-chat-head {
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(5, 9, 21, 0.7);
  backdrop-filter: blur(20px);
}

.sg-chat-head-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.sg-chat-head-main strong {
  display: block;
  font-size: 15px;
  color: var(--text-primary);
}

.sg-chat-head-main span {
  display: block;
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--text-secondary);
}

.sg-chat-actions {
  display: flex;
  gap: 8px;
}

.sg-message-search {
  margin: 14px 18px 0;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.sg-message-search-count {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.sg-chat-layout {
  flex: 1;
  display: flex;
  min-height: 0;
}

.sg-thread {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.sg-load-earlier {
  padding: 14px 18px 0;
  display: flex;
  justify-content: center;
}

.sg-messages {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sg-date-divider {
  display: flex;
  justify-content: center;
  margin: 8px 0;
}

.sg-date-divider span {
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-muted);
  font-size: 10.5px;
  letter-spacing: 0.04em;
}

.sg-message-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.sg-message-row.from-me {
  justify-content: flex-end;
}

.sg-message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 12px;
}

.sg-bubble-wrap {
  max-width: min(720px, 76%);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sg-message-row.from-me .sg-bubble-wrap {
  align-items: flex-end;
}

.sg-message-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.15s;
}

.sg-message-row:hover .sg-message-tools,
.sg-message-row:focus-within .sg-message-tools {
  opacity: 1;
}

.sg-tool-btn {
  padding: 5px 8px;
  border-radius: 999px;
  font-size: 10.5px;
}

.sg-tool-btn--danger {
  color: #fca5a5;
}

.sg-message-bubble {
  width: 100%;
  border-radius: 22px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 16px 28px rgba(3, 8, 18, 0.18);
}

.sg-message-row.from-me .sg-message-bubble {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(14, 165, 233, 0.74));
  border-color: rgba(125, 211, 252, 0.2);
  color: white;
}

.sg-message-bubble.deleted {
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-muted);
}

.sg-sender-name {
  font-size: 10px;
  font-weight: 700;
  margin-bottom: 6px;
  color: rgba(125, 211, 252, 0.98);
}

.sg-message-row.from-me .sg-sender-name {
  color: rgba(255, 255, 255, 0.82);
}

.sg-reply-preview {
  border-left: 3px solid rgba(125, 211, 252, 0.9);
  padding-left: 10px;
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.sg-message-row.from-me .sg-reply-preview {
  border-left-color: rgba(255, 255, 255, 0.92);
}

.sg-reply-preview strong,
.sg-reply-preview span {
  font-size: 11px;
}

.sg-reaction-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.sg-reaction-option {
  padding: 6px 8px;
  border-radius: 999px;
  font-size: 13px;
}

.sg-message-deleted {
  font-size: 12px;
  opacity: 0.8;
  font-style: italic;
}

.sg-message-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.5;
}

.sg-media-card {
  margin-bottom: 10px;
  overflow: hidden;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.16);
}

.sg-media-card--image img,
.sg-media-card video {
  width: 100%;
  max-height: 420px;
  object-fit: cover;
  display: block;
}

.sg-media-card--image img {
  cursor: zoom-in;
}

.sg-media-card--audio {
  padding: 10px;
}

.sg-media-card--audio audio {
  width: 100%;
}

.sg-file-card {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  padding: 11px 12px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.14);
  color: inherit;
  text-decoration: none;
}

.sg-file-icon {
  font-size: 20px;
}

.sg-file-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.sg-file-text strong {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sg-file-text small {
  font-size: 10px;
  opacity: 0.7;
}

.sg-message-footer {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  font-size: 10.5px;
  opacity: 0.74;
}

.sg-reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sg-reaction-chip {
  padding: 5px 8px;
  border-radius: 999px;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.sg-reaction-chip.mine {
  background: rgba(59, 130, 246, 0.16);
  border-color: rgba(59, 130, 246, 0.24);
}

.sg-info-panel {
  width: 286px;
  flex-shrink: 0;
  padding: 18px 18px 18px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.sg-info-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
}

.sg-info-avatar {
  width: 64px;
  height: 64px;
  border-radius: 22px;
}

.sg-info-card strong {
  font-size: 15px;
  color: var(--text-primary);
}

.sg-info-card span {
  font-size: 11.5px;
  color: var(--text-secondary);
}

.sg-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.sg-info-item {
  padding: 13px 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.sg-info-item span {
  display: block;
  font-size: 10.5px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.sg-info-item strong {
  font-size: 14px;
  color: var(--text-primary);
}

.sg-info-section {
  padding: 13px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sg-info-section code {
  overflow-wrap: anywhere;
}

.sg-compose-top {
  margin: 0 18px 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sg-compose-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(255, 255, 255, 0.035);
  border-radius: 14px;
  padding: 10px 12px;
}

.sg-compose-banner--recording {
  border: 1px solid rgba(248, 113, 113, 0.18);
  background: rgba(127, 29, 29, 0.16);
}

.sg-compose-banner-label {
  font-size: 10px;
  font-weight: 700;
  color: #93c5fd;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  flex-shrink: 0;
}

.sg-compose-banner-text {
  flex: 1;
  min-width: 0;
  color: var(--text-secondary);
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sg-compose-banner button,
.sg-upload-chip button {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
}

.sg-upload-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sg-upload-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.12);
  color: #bfdbfe;
  font-size: 11px;
}

.sg-compose {
  padding: 0 18px 18px;
}

.sg-compose-btn,
.sg-compose-send,
.sg-console-send {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sg-compose-btn.is-recording {
  color: #fca5a5;
  border-color: rgba(248, 113, 113, 0.24);
  background: rgba(127, 29, 29, 0.24);
}

.sg-recording-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #ef4444;
  box-shadow: 0 0 0 6px rgba(239, 68, 68, 0.16);
}

.sg-compose-send {
  background: linear-gradient(135deg, #3b82f6, #0ea5e9);
  border-color: rgba(125, 211, 252, 0.22);
  color: white;
}

.sg-compose-btn:disabled,
.sg-compose-send:disabled,
.sg-console-send:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.sg-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.22);
  border-top-color: currentColor;
  border-radius: 50%;
  display: inline-block;
  animation: sg-spin 0.7s linear infinite;
}

.sg-spinner-sm {
  width: 14px;
  height: 14px;
}

@keyframes sg-spin {
  to {
    transform: rotate(360deg);
  }
}

.sg-lightbox {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(4, 6, 14, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 36px;
}

.sg-lightbox-img {
  max-width: min(92vw, 1100px);
  max-height: 84vh;
  border-radius: 20px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.3);
}

.sg-lightbox-close,
.sg-lightbox-download {
  position: absolute;
  top: 22px;
  right: 24px;
  padding: 10px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: white;
  text-decoration: none;
  cursor: pointer;
}

.sg-lightbox-download {
  right: 86px;
}

@media (max-width: 1080px) {
  .sg-sidebar {
    width: 304px;
  }

  .sg-info-panel {
    display: none;
  }
}

@media (max-width: 860px) {
  .sg-page {
    flex-direction: column;
  }

  .sg-sidebar {
    width: 100%;
    max-height: 46vh;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .sg-main {
    min-height: 0;
  }

  .sg-bubble-wrap {
    max-width: 88%;
  }
}
</style>
