<template>
  <article
    class="priority-card"
    :class="[
      `priority-${priorityTone}`,
      expanded && 'priority-card-expanded',
      isUnread && 'priority-card-unread',
    ]"
  >
    <div class="priority-card-top" :aria-expanded="expanded" @click="toggleExpanded">
      <div class="priority-card-meta">
        <span class="priority-source priority-source-icon" :title="item.sourceLabel">
          <img
            v-if="appIconUrl && !appIconBroken"
            :src="appIconUrl"
            :alt="item.sourceLabel || item.sourceApp || 'App'"
            class="priority-source-img"
            loading="lazy"
            @error="appIconBroken = true"
          />
          <span v-else>{{ item.sourceIcon }}</span>
        </span>
        <span v-if="isUnread" class="priority-unread-badge" :title="`${unreadCount} unread`">
          {{ unreadCount > 9 ? '9+' : unreadCount }}
        </span>
        <span v-if="showPriorityBadge" class="priority-level" :class="`level-${priorityTone}`">{{ item.priority }}</span>
        <button
          class="priority-expand-btn"
          type="button"
          :aria-label="expanded ? 'Collapse details' : 'Expand details'"
          @click.stop="toggleExpanded"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path :d="expanded ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'" />
          </svg>
        </button>
      </div>

      <div class="priority-card-headline">
        <div class="priority-card-headline-main">
          <h4>{{ item.title }}</h4>
          <span v-if="collapsedTimeLabel" class="priority-card-time">{{ collapsedTimeLabel }}</span>
        </div>
        <p v-if="conversationMetaLabel" class="priority-card-context">
          {{ conversationMetaLabel }}
        </p>
      </div>

      <p v-if="!expanded && collapsedPreviewText" class="priority-collapsed-preview">
        {{ collapsedPreviewText }}
      </p>

      <div v-if="!expanded && collapsedCountLabel" class="priority-collapsed-footer">
        <span class="priority-collapsed-count">{{ collapsedCountLabel }}</span>
      </div>
    </div>

    <Transition name="priority-expand">
      <div v-if="expanded" class="priority-card-body">
        <div v-if="showMessagePreview" class="priority-message-stack">
          <div class="priority-message-stack-head">
            <div class="priority-message-stack-summary">
              <span class="priority-message-label">Latest message</span>
              <span v-if="messageCountLabel" class="priority-message-count">
                {{ messageCountLabel }}
              </span>
            </div>
            <button
              v-if="hasAdditionalPreviewMessages"
              class="priority-message-toggle"
              @click.stop="showAllChatMessages = !showAllChatMessages"
            >
              {{ showAllChatMessages ? 'Hide messages' : moreMessagesLabel }}
            </button>
          </div>

          <div v-if="showAllChatMessages" class="priority-message-list">
            <article
              v-for="(message, index) in expandedMessages"
              :key="message.id || `${item.id}-message-${index}`"
              class="priority-message-card"
              :class="{
                latest: index === expandedMessages.length - 1,
                outbound: message.direction === 'outbound',
              }"
            >
              <div class="priority-message-meta-line">
                <span class="priority-message-sender">{{ messageSenderLabel(message) }}</span>
                <span v-if="messageTimeLabel(message)" class="priority-message-time">
                  {{ messageTimeLabel(message) }}
                </span>
              </div>
              <p class="priority-message-line">{{ message.text }}</p>
            </article>
          </div>

          <article v-else class="priority-message-card priority-message-card--single latest">
            <div class="priority-message-meta-line">
              <span class="priority-message-sender">
                {{ messageSenderLabel(primaryPreviewMessage) }}
              </span>
              <span v-if="messageTimeLabel(primaryPreviewMessage)" class="priority-message-time">
                {{ messageTimeLabel(primaryPreviewMessage) }}
              </span>
            </div>
            <p class="priority-message-preview">{{ primaryPreviewMessage?.text }}</p>
          </article>

          <div v-if="showReplyComposer" class="priority-reply-composer priority-reply-composer-inline" @click.stop>
            <span class="priority-next-label">{{ replyPanelLabel }}</span>

            <div class="priority-reply-input-shell">
              <button
                class="priority-reply-icon"
                type="button"
                title="Attachments coming soon"
                aria-label="Attachments coming soon"
                @click.stop.prevent
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M21.4 11.1l-8.49 8.49a5 5 0 0 1-7.07-7.07l8.84-8.84a3.5 3.5 0 0 1 4.95 4.95l-8.84 8.84a2 2 0 1 1-2.83-2.83l7.78-7.78" />
                </svg>
              </button>

              <textarea
                ref="replyTextareaRef"
                v-model="replyText"
                class="priority-reply-textarea"
                rows="1"
                :disabled="busy || replyDrafting || replySending"
                :placeholder="replyPlaceholder"
                @input="resizeReplyTextarea"
                @keydown.enter.exact.prevent="sendInlineReply"
                @keydown.shift.enter.prevent="replyText += '\n'"
              />

            </div>

            <p v-if="replyStatusText && !replyError" class="priority-reply-meta">{{ replyStatusText }}</p>
            <p v-if="replyError" class="priority-reply-error">{{ replyError }}</p>

            <div class="priority-reply-footer">
              <button
                class="priority-message-action priority-message-action--subtle"
                type="button"
                :disabled="busy || replySending"
                @click.stop="closeReplyComposer"
              >
                Cancel
              </button>
              <button
                class="priority-message-action"
                type="button"
                :disabled="busy || replySending || !replyText.trim()"
                @click.stop="sendInlineReply"
              >
                {{ replySending ? 'Sending...' : 'Send reply' }}
              </button>
            </div>
          </div>

          <div v-if="showMessageActionRow" class="priority-message-actions">
            <button
              v-if="supportsInlineReply"
              class="priority-message-action"
              :class="{ active: showReplyComposer }"
              :disabled="busy || replySending"
              type="button"
              @click.stop="toggleReplyComposer"
            >
              {{ showReplyComposer ? 'Close reply' : 'Reply' }}
            </button>

            <button
              v-if="supportsInlineReply"
              class="priority-message-action priority-message-action--subtle"
              :disabled="busy || replyDrafting || replySending"
              type="button"
              @click.stop="draftAgentReply"
            >
              {{ replyDrafting ? 'Drafting...' : 'Agent reply' }}
            </button>

            <button
              v-if="showOpenConversationAction"
              class="priority-message-action priority-message-action--subtle"
              :disabled="busy || replySending"
              type="button"
              @click.stop="emit('run-secondary-action', item)"
            >
              {{ openConversationShortLabel }}
            </button>
          </div>
        </div>

        <template v-else>
          <p class="priority-reason">{{ displayReason }}</p>
          <p class="priority-why"><strong>Why this matters</strong> {{ displayWhyThisMatters }}</p>
          <div class="priority-next">
            <span class="priority-next-label">Next action</span>
            <span class="priority-next-text">{{ item.action?.label || item.suggestedNextAction }}</span>
          </div>
        </template>

        <div v-if="showExternalActionRow" class="priority-chat-actions">
          <button
            v-if="showMeetingPrimaryAction"
            class="priority-primary-action priority-chat-action"
            :disabled="busy"
            @click.stop="emit('run-action', item)"
          >
            {{ item.action?.label || 'Prep meeting' }}
          </button>
          <button
            v-if="showMeetButton"
            class="priority-secondary-action priority-chat-action priority-meet-action"
            :disabled="busy"
            @click.stop="joinGoogleMeet"
          >
            Join with Google Meet
          </button>
        </div>

        <div class="priority-controls">
          <button class="priority-control approve" :disabled="busy" @click.stop="emit('approve', item)">{{ approveLabel }}</button>
          <button class="priority-control" :disabled="busy" @click.stop="emit('dismiss', item)">Dismiss</button>
          <button class="priority-control" :disabled="busy" @click.stop="toggleSnooze">Snooze</button>
        </div>

        <div v-if="showSnoozeOptions" class="priority-snooze-row">
          <button
            v-for="option in snoozeOptions"
            :key="option.minutes"
            class="priority-mini-action"
            :disabled="busy"
            @click.stop="emit('snooze', { item, minutes: option.minutes })"
          >
            {{ option.label }}
          </button>
        </div>

        <div class="priority-panel">
          <p class="priority-panel-copy">{{ item.suggestedNextAction }}</p>

          <div v-if="showExpandedPanelActions" class="priority-panel-actions">
            <button class="priority-primary-action" :disabled="busy" @click.stop="emit('run-action', item)">
              {{ item.action?.label || 'Review now' }}
            </button>
            <button
              v-if="item.secondaryAction"
              class="priority-secondary-action"
              :disabled="busy"
              @click.stop="emit('run-secondary-action', item)"
            >
              {{ item.secondaryAction.label }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </article>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useDisclosure } from '../../composables/useDisclosure'
import { getAppIconUrl } from '../../utils/appIcons'

const props = defineProps({
  item: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  requestReplyDraft: { type: Function, default: null },
  sendReply: { type: Function, default: null },
  showApprovalSuggestion: { type: Boolean, default: false },
})

const emit = defineEmits([
  'approve',
  'dismiss',
  'snooze',
  'reclassify',
  'run-action',
  'run-secondary-action',
  'card-opened',
])

const { isOpen: expanded, open: openExpanded, close: closeExpanded, toggle: toggleExpanded } = useDisclosure(false)
const showSnoozeOptions = ref(false)
const showAllChatMessages = ref(false)
const nowTick = ref(Date.now())
let relativeTimer = null

const INLINE_REPLY_SOURCE_APPS = new Set(['gmail', 'slack', 'telegram', 'signal', 'whatsapp'])

const snoozeOptions = [
  { label: '1h', minutes: 60 },
  { label: '3h', minutes: 180 },
  { label: 'Tomorrow', minutes: 16 * 60 },
]

const priorityTone = computed(() => String(props.item.priority || 'low').toLowerCase())
const unreadCount = computed(() => {
  const candidates = [
    props.item?.meta?.sourceMetadata?.unreadCount,
    props.item?.meta?.platformMetadata?.unreadCount,
    props.item?.meta?.unread,
    props.item?.unread,
  ]
  for (const value of candidates) {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return numeric
  }
  return 0
})
const isUnread = computed(() => unreadCount.value > 0)
const appIconBroken = ref(false)
const appIconUrl = computed(() =>
  getAppIconUrl(props.item?.sourceApp || props.item?.module || '')
)
watch(
  () => props.item?.sourceApp,
  () => {
    appIconBroken.value = false
  }
)
const showPriorityBadge = computed(() =>
  props.item?.category !== 'meetings' && sourceApp.value !== 'google_calendar'
)
const approveLabel = computed(() =>
  props.item?.actionState === 'needs_approval' ? 'Handled' : 'Mark done'
)
const liveMessageTimestamp = computed(() =>
  props.item?.meta?.latestMessageAt ||
  props.item?.meta?.lastMessageAt ||
  null
)
const liveAgeLabel = computed(() => {
  nowTick.value
  const source = liveMessageTimestamp.value
  if (!source) return ''

  const diffMs = Date.now() - new Date(source).getTime()
  if (!Number.isFinite(diffMs)) return ''
  if (diffMs < 60 * 1000) return 'just now'

  const totalMinutes = Math.floor(diffMs / 60000)
  if (totalMinutes < 60) return `${totalMinutes}m ago`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours < 24) {
    return minutes > 0 ? `${hours}h ${minutes}m ago` : `${hours}h ago`
  }

  const days = Math.floor(hours / 24)
  return `${days}d ago`
})
const displayReason = computed(() =>
  applyLiveAgeToReason(props.item?.reason || '', liveAgeLabel.value)
)
const displayWhyThisMatters = computed(() =>
  applyLiveAgeToWhy(props.item?.whyThisMatters || '', liveAgeLabel.value)
)
const sourceApp = computed(() => String(props.item?.sourceApp || '').toLowerCase())
const openContext = computed(() => props.item?.meta?.openContext || {})
const replyTextareaRef = ref(null)
const showReplyComposer = ref(false)
const replyText = ref('')
const replyDrafting = ref(false)
const replySending = ref(false)
const replyError = ref('')
const approvalSuggestionLoaded = ref(false)
const participantLabel = computed(() =>
  String(props.item?.meta?.participantLabel || '').trim()
)
const messageFallbackSender = computed(() =>
  participantLabel.value ||
  String(props.item?.title || props.item?.sourceLabel || 'Contact').trim()
)
const recentMessages = computed(() =>
  normalizePreviewMessages(
    Array.isArray(props.item?.meta?.recentMessages) ? props.item.meta.recentMessages : [],
    messageFallbackSender.value
  )
)
const recentInboundMessages = computed(() =>
  recentMessages.value.filter((message) => message.direction === 'inbound')
)
const previewMessages = computed(() => {
  const latestPreviewText = String(props.item?.meta?.previewText || '').trim()
  const latestInboundMessages = normalizePreviewMessages(
    Array.isArray(props.item?.meta?.latestInboundBurst) ? props.item.meta.latestInboundBurst : [],
    messageFallbackSender.value
  )

  if (latestInboundMessages.length) {
    return latestInboundMessages
  }

  if (recentInboundMessages.value.length) {
    return recentInboundMessages.value.slice(-4)
  }

  if (recentMessages.value.length) {
    return recentMessages.value
  }

  return latestPreviewText
    ? normalizePreviewMessages(
        [{
          text: latestPreviewText,
          direction: 'inbound',
          timestamp: liveMessageTimestamp.value,
          senderName: messageFallbackSender.value,
        }],
        messageFallbackSender.value
      )
    : []
})
const expandedMessages = computed(() => {
  if (recentMessages.value.length > 1) {
    return recentMessages.value
  }
  return previewMessages.value
})
const primaryPreviewMessage = computed(() => {
  const messages = previewMessages.value
  return messages[messages.length - 1] || null
})
const collapsedPreviewText = computed(() =>
  primaryPreviewMessage.value?.text ||
  String(props.item?.meta?.previewText || '').trim() ||
  String(props.item?.reason || '').trim() ||
  String(props.item?.suggestedNextAction || '').trim() ||
  String(props.item?.whyThisMatters || '').trim()
)
const hasAdditionalPreviewMessages = computed(() =>
  expandedMessages.value.length > 1
)
const moreMessagesLabel = computed(() => {
  const extraCount = Math.max(expandedMessages.value.length - 1, 0)
  if (!extraCount) return ''
  return previewMessages.value.length > 1
    ? `View ${extraCount} other new message${extraCount === 1 ? '' : 's'}`
    : `View ${extraCount} recent message${extraCount === 1 ? '' : 's'}`
})
const showMessagePreview = computed(() =>
  props.item?.category === 'communication' && Boolean(primaryPreviewMessage.value?.text)
)
const collapsedSenderLabel = computed(() => {
  const sender = String(primaryPreviewMessage.value?.senderName || participantLabel.value || '').trim()
  const title = String(props.item?.title || '').trim().toLowerCase()
  if (!sender || sender.toLowerCase() === title) return ''
  return sender
})
const collapsedTimeLabel = computed(() =>
  formatMessageTimestamp(primaryPreviewMessage.value?.timestamp) || liveAgeLabel.value
)
const conversationMetaLabel = computed(() => collapsedSenderLabel.value)
const totalVisibleMessageCount = computed(() => {
  const unreadBurstCount = Number(props.item?.meta?.latestInboundBurstCount || 0)
  if (unreadBurstCount > 0) return unreadBurstCount
  if (expandedMessages.value.length > 0) return expandedMessages.value.length
  return previewMessages.value.length
})
const collapsedCountLabel = computed(() => {
  if (unreadCount.value > 0) {
    return unreadCount.value === 1 ? '1 new' : `${unreadCount.value} unread`
  }
  if (totalVisibleMessageCount.value > 1) {
    return `${totalVisibleMessageCount.value} messages`
  }
  return ''
})
const messageCountLabel = computed(() =>
  collapsedCountLabel.value || (primaryPreviewMessage.value?.text ? 'Latest update' : '')
)
const gmailReplySupported = computed(() =>
  sourceApp.value === 'gmail' &&
  Boolean(props.item?.meta?.latestMessageId) &&
  Boolean(props.item?.meta?.threadId || openContext.value.threadId)
)
const slackReplySupported = computed(() =>
  sourceApp.value === 'slack' && Boolean(openContext.value.channelId)
)
const telegramReplySupported = computed(() =>
  sourceApp.value === 'telegram' && Boolean(openContext.value.dialogId)
)
const signalReplySupported = computed(() =>
  sourceApp.value === 'signal' && Boolean(openContext.value.roomId)
)
const whatsappReplySupported = computed(() =>
  sourceApp.value === 'whatsapp' && Boolean(openContext.value.chatId)
)
const supportsInlineReply = computed(() =>
  props.item?.category === 'communication' &&
  INLINE_REPLY_SOURCE_APPS.has(sourceApp.value) &&
  props.item?.actionState !== 'waiting_on_others' &&
  typeof props.requestReplyDraft === 'function' &&
  typeof props.sendReply === 'function' &&
  (
    gmailReplySupported.value ||
    slackReplySupported.value ||
    telegramReplySupported.value ||
    signalReplySupported.value ||
    whatsappReplySupported.value
  )
)
const showMeetButton = computed(() =>
  props.item?.category === 'meetings' &&
  sourceApp.value === 'google_calendar' &&
  Boolean(props.item?.meta?.meetLink)
)
const showMeetingPrimaryAction = computed(() =>
  showMeetButton.value && Boolean(props.item?.action)
)
const showOpenConversationAction = computed(() =>
  Boolean(props.item?.secondaryAction) && (supportsInlineReply.value || showMessagePreview.value)
)
const showMessageActionRow = computed(() =>
  showMessagePreview.value && (supportsInlineReply.value || showOpenConversationAction.value)
)
const showExternalActionRow = computed(() =>
  !showMessagePreview.value && (showMeetingPrimaryAction.value || showMeetButton.value)
)
const showExpandedPanelActions = computed(() =>
  !showMessagePreview.value
)
const openConversationLabel = computed(() =>
  props.item?.secondaryAction?.label || 'Open Conversation'
)
const openConversationShortLabel = computed(() =>
  showOpenConversationAction.value ? 'Open' : openConversationLabel.value
)
const replyPlaceholder = computed(() => {
  if (sourceApp.value === 'gmail') return 'Write your email reply...'
  return 'Write your reply...'
})
const replyPanelLabel = computed(() =>
  props.showApprovalSuggestion && props.item?.actionState === 'needs_approval'
    ? 'Suggested reply'
    : 'Reply draft'
)
const replyStatusText = computed(() => {
  if (replyDrafting.value) return 'OrionAI is drafting a reply from the latest context.'
  if (props.showApprovalSuggestion && showReplyComposer.value && replyText.value.trim()) {
    return 'You can edit this suggestion before sending.'
  }
  return ''
})

watch(
  () => props.item,
  () => {
    closeExpanded()
    showSnoozeOptions.value = false
    showAllChatMessages.value = false
    showReplyComposer.value = false
    replyText.value = ''
    replyDrafting.value = false
    replySending.value = false
    replyError.value = ''
    approvalSuggestionLoaded.value = false
  }
)

watch(
  liveMessageTimestamp,
  (value) => {
    stopRelativeTimer()
    if (value) {
      nowTick.value = Date.now()
      relativeTimer = setInterval(() => {
        nowTick.value = Date.now()
      }, 30 * 1000)
    }
  },
  { immediate: true }
)

watch(expanded, (open) => {
  if (open) emit('card-opened', props.item)
})

onMounted(() => {
  if (liveMessageTimestamp.value && !relativeTimer) {
    relativeTimer = setInterval(() => {
      nowTick.value = Date.now()
    }, 30 * 1000)
  }
})

onUnmounted(() => {
  stopRelativeTimer()
})

watch(
  [
    () => props.showApprovalSuggestion,
    () => props.item?.id,
    () => props.item?.meta?.latestMessageId,
    supportsInlineReply,
  ],
  ([enabled]) => {
    if (!enabled || !supportsInlineReply.value || props.item?.actionState !== 'needs_approval') return
    void ensureApprovalSuggestion()
  },
  { immediate: true }
)

function stopRelativeTimer() {
  if (relativeTimer) {
    clearInterval(relativeTimer)
    relativeTimer = null
  }
}

function applyLiveAgeToReason(text, liveAge) {
  if (!text || !liveAge) return text
  const reasonAge = liveAge === 'just now' ? 'fresh' : `${liveAge.replace(/ ago$/, '')} old`
  return text.replace(/\b\d+h old\b/i, reasonAge)
}

function applyLiveAgeToWhy(text, liveAge) {
  if (!text || !liveAge) return text
  return text
    .replace(/\bless than an hour ago\b/i, liveAge)
    .replace(/\b\d+\s+hours?\s+ago\b/i, liveAge)
    .replace(/\b\d+\s+days?\s+ago\b/i, liveAge)
    .replace(/\bis\s+less than an hour old\b/i, liveAge === 'just now' ? 'is only moments old' : `is ${liveAge.replace(/ ago$/, '')} old`)
    .replace(/\bis\s+\d+\s+hours?\s+old\b/i, liveAge === 'just now' ? 'is only moments old' : `is ${liveAge.replace(/ ago$/, '')} old`)
    .replace(/\bis\s+\d+\s+days?\s+old\b/i, liveAge === 'just now' ? 'is only moments old' : `is ${liveAge.replace(/ ago$/, '')} old`)
}

function normalizePreviewText(message = {}) {
  const directText = String(message?.text || '').trim()
  if (directText) return directText

  const previewText = String(message?.previewText || '').trim()
  if (previewText) return previewText

  if (message?.hasAttachments) return 'Attachment'
  return ''
}

function normalizePreviewMessages(messages = [], fallbackSender = '') {
  return messages
    .map((message) => {
      const text = normalizePreviewText(message)
      if (!text) return null

      const direction = String(message?.direction || 'unknown').toLowerCase()
      return {
        id: message?.id ?? null,
        text,
        timestamp: message?.timestamp || null,
        direction,
        senderName:
          String(message?.senderName || '').trim() ||
          (direction === 'outbound' ? 'You' : fallbackSender),
        hasAttachments: Boolean(message?.hasAttachments),
      }
    })
    .filter(Boolean)
}

function formatMessageTimestamp(value) {
  if (!value) return ''
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return ''

  const now = new Date()
  const sameDay = timestamp.toDateString() === now.toDateString()
  if (sameDay) {
    return timestamp.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (timestamp.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  }

  return timestamp.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

function messageSenderLabel(message = null) {
  if (!message) return participantLabel.value || props.item?.sourceLabel || 'Message'
  return String(message.senderName || '').trim() || participantLabel.value || props.item?.sourceLabel || 'Message'
}

function messageTimeLabel(message = null) {
  return formatMessageTimestamp(message?.timestamp)
}

function toggleSnooze() {
  openExpanded()
  showSnoozeOptions.value = !showSnoozeOptions.value
}

function resizeReplyTextarea() {
  if (!replyTextareaRef.value) return
  replyTextareaRef.value.style.height = 'auto'
  replyTextareaRef.value.style.height = `${Math.min(replyTextareaRef.value.scrollHeight, 180)}px`
}

function openReplyComposer() {
  openExpanded()
  showSnoozeOptions.value = false
  showReplyComposer.value = true
  nextTick(() => {
    resizeReplyTextarea()
    replyTextareaRef.value?.focus()
  })
}

function closeReplyComposer() {
  showReplyComposer.value = false
  replyError.value = ''
}

function toggleReplyComposer() {
  if (!supportsInlineReply.value) return
  replyError.value = ''
  if (showReplyComposer.value) {
    closeReplyComposer()
    return
  }
  openReplyComposer()
  if (props.showApprovalSuggestion && props.item?.actionState === 'needs_approval' && !replyText.value.trim()) {
    void ensureApprovalSuggestion()
  }
}

async function ensureApprovalSuggestion() {
  if (approvalSuggestionLoaded.value || !supportsInlineReply.value) return
  approvalSuggestionLoaded.value = true
  openReplyComposer()
  await draftAgentReply()
}

async function draftAgentReply() {
  if (!supportsInlineReply.value || replyDrafting.value) return

  replyError.value = ''
  openReplyComposer()
  replyDrafting.value = true

  try {
    const suggested = await props.requestReplyDraft(props.item)
    replyText.value = String(suggested || '').trim()
    await nextTick()
    resizeReplyTextarea()
  } catch (error) {
    replyError.value =
      error?.response?.data?.error ||
      error?.message ||
      'Could not draft a reply right now.'
  } finally {
    replyDrafting.value = false
  }
}

async function sendInlineReply() {
  const body = replyText.value.trim()
  if (!body || !supportsInlineReply.value || replySending.value) return

  replyError.value = ''
  replySending.value = true

  try {
    await props.sendReply(props.item, body)
    replyText.value = ''
    showReplyComposer.value = false
  } catch (error) {
    replyError.value =
      error?.response?.data?.error ||
      error?.message ||
      'Could not send this reply.'
  } finally {
    replySending.value = false
  }
}

function joinGoogleMeet() {
  const meetLink = String(props.item?.meta?.meetLink || '').trim()
  if (!meetLink) return
  window.open(meetLink, '_blank', 'noopener,noreferrer')
}
</script>

<style scoped>
.priority-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  box-shadow: 0 24px 56px rgba(2, 6, 23, 0.22);
    transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.priority-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-default);
}

.priority-card-expanded {
  border-color: rgba(79, 140, 255, 0.24);
  box-shadow: 0 28px 72px rgba(79, 140, 255, 0.12);
}

.priority-card-unread {
  border-color: rgba(79, 140, 255, 0.32);
  box-shadow: 0 0 0 1px rgba(79, 140, 255, 0.18), 0 28px 64px rgba(2, 6, 23, 0.22);
}

.priority-card-unread .priority-card-headline h4 {
  color: #f8fbff;
  font-weight: 700;
}

.priority-unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #0b1224;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  box-shadow: 0 0 0 2px rgba(79, 140, 255, 0.18);
}

.priority-high {
  background: var(--bg-surface);
  border-left: 3px solid rgba(255, 107, 127, 0.6);
}

.priority-medium {
  background: var(--bg-surface);
  border-left: 3px solid rgba(242, 184, 79, 0.5);
}

.priority-low {
  background: var(--bg-surface);
  border-left: 3px solid rgba(47, 211, 157, 0.4);
}

.priority-card-top {
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
}

.priority-card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.priority-card-meta,
.priority-controls,
.priority-panel-actions,
.priority-snooze-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.priority-source,
.priority-level {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.priority-state-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.priority-source {
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  color: rgba(226, 232, 240, 0.88);
}

.priority-source-icon {
  width: 28px;
  min-width: 28px;
  padding: 0;
  justify-content: center;
  font-size: 13px;
}

.priority-source-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
  border-radius: 4px;
  display: block;
}

.priority-level.level-high {
  background: rgba(255, 107, 127, 0.14);
  color: #ffc3cf;
  border: 1px solid rgba(255, 107, 127, 0.24);
}

.priority-level.level-medium {
  background: rgba(242, 184, 79, 0.14);
  color: #ffe1a3;
  border: 1px solid rgba(242, 184, 79, 0.24);
}

.priority-level.level-low {
  background: rgba(47, 211, 157, 0.14);
  color: #bff8df;
  border: 1px solid rgba(47, 211, 157, 0.22);
}

.priority-card-headline h4 {
  font-size: 15px;
  line-height: 1.35;
  color: var(--text-primary);
  margin: 0;
}

.priority-card-headline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.priority-card-headline-main {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.priority-card-time,
.priority-card-context {
  color: rgba(148, 163, 184, 0.82);
  font-size: 11px;
}

.priority-card-time {
  white-space: nowrap;
}

.priority-card-context {
  margin: 0;
}

.priority-collapsed-preview {
  margin: 0;
  color: rgba(226, 232, 240, 0.7);
  font-size: 12.5px;
  line-height: 1.5;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  word-break: break-word;
}

.priority-collapsed-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.priority-collapsed-count {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  background: rgba(79, 140, 255, 0.08);
  color: rgba(191, 226, 255, 0.92);
  font-size: 11px;
  font-weight: 700;
}

.priority-expand-btn {
  width: 28px;
  height: 28px;
  margin-left: auto;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-elevated);
  color: rgba(191, 226, 255, 0.82);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.priority-expand-btn:hover,
.priority-expand-btn:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(79, 140, 255, 0.24);
  background: rgba(79, 140, 255, 0.1);
  outline: none;
}

.priority-reason,
.priority-why,
.priority-panel-copy {
  color: rgba(226, 232, 240, 0.74);
  font-size: 12.5px;
  line-height: 1.55;
}

.priority-message-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 13px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}

.priority-message-stack-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.priority-message-stack-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.priority-message-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.82);
}

.priority-message-count {
  color: rgba(191, 226, 255, 0.92);
  font-size: 11px;
  font-weight: 700;
}

.priority-message-toggle {
  border: 0;
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  background: var(--bg-elevated);
  color: rgba(191, 226, 255, 0.86);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: background 160ms ease, transform 160ms ease;
}

.priority-message-toggle:hover {
  background: rgba(79, 140, 255, 0.12);
  transform: translateY(-1px);
}

.priority-message-preview,
.priority-message-line {
  margin: 0;
  color: var(--text-primary);
  font-size: 12.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.priority-message-preview {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.priority-message-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.priority-message-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 11px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: rgba(6, 12, 24, 0.36);
}

.priority-message-card.latest {
  border-color: rgba(79, 140, 255, 0.2);
  background: rgba(79, 140, 255, 0.06);
}

.priority-message-card.outbound {
  border-color: rgba(79, 140, 255, 0.18);
}

.priority-message-card--single {
  padding: 12px 13px;
}

.priority-message-meta-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.priority-message-sender,
.priority-message-time {
  font-size: 11px;
}

.priority-message-sender {
  color: rgba(191, 226, 255, 0.96);
  font-weight: 700;
}

.priority-message-time {
  color: rgba(148, 163, 184, 0.82);
}

.priority-message-actions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  margin-top: 2px;
  flex-wrap: wrap;
}

.priority-message-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 13px;
  border-radius: 12px;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  color: rgba(226, 232, 240, 0.84);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, color 160ms ease;
}

.priority-message-action:hover:not(:disabled),
.priority-message-action:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(79, 140, 255, 0.26);
  background: rgba(79, 140, 255, 0.1);
  color: #f8fbff;
}

.priority-message-action.active {
  border-color: rgba(79, 140, 255, 0.28);
  background: rgba(79, 140, 255, 0.12);
  color: #eef2ff;
}

.priority-message-action--subtle {
  color: rgba(191, 226, 255, 0.84);
}

.priority-message-line {
  color: rgba(226, 232, 240, 0.82);
}

.priority-message-card.latest .priority-message-line {
  color: var(--text-primary);
}

.priority-reply-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.priority-why strong {
  color: var(--text-primary);
  margin-right: 6px;
}

.priority-next {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 13px;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
}

.priority-next-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.82);
}

.priority-next-text {
  color: var(--text-primary);
  font-size: 12.5px;
  line-height: 1.55;
}

.priority-chat-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.priority-chat-action {
  flex: 1 1 180px;
  justify-content: center;
}

.priority-meet-action {
  flex-basis: 220px;
}

.priority-control,
.priority-mini-action,
.priority-secondary-action {
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  color: rgba(226, 232, 240, 0.82);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.priority-control.approve,
.priority-primary-action {
  border: 1px solid rgba(79, 140, 255, 0.22);
  background: rgba(79, 140, 255, 0.16);
  color: #eef2ff;
  border-radius: var(--radius-md);
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.priority-control:hover:not(:disabled),
.priority-mini-action:hover:not(:disabled),
.priority-secondary-action:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: var(--border-default);
  background: var(--bg-elevated);
}

.priority-control.approve:hover:not(:disabled),
.priority-primary-action:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(79, 140, 255, 0.3);
  background: rgba(79, 140, 255, 0.16);
}

.priority-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.priority-reply-composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 11px 12px 12px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(79, 140, 255, 0.16);
  background: var(--bg-surface);
  }

.priority-reply-composer-inline {
  margin-top: 2px;
}

.priority-reply-input-shell {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 8px 8px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
}

.priority-reply-icon {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  color: rgba(226, 232, 240, 0.82);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.priority-reply-icon:hover:not(:disabled),
.priority-reply-icon:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(79, 140, 255, 0.28);
  background: rgba(79, 140, 255, 0.1);
  outline: none;
}

.priority-reply-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.priority-reply-toggle {
  border: 0;
  background: transparent;
  color: rgba(191, 226, 255, 0.82);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.priority-reply-textarea {
  width: 100%;
  min-height: 40px;
  max-height: 180px;
  resize: none;
  border-radius: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  padding: 8px 4px 8px 0;
  font: inherit;
  line-height: 1.5;
}

.priority-reply-textarea:focus {
  outline: none;
}

.priority-reply-meta,
.priority-reply-error {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
}

.priority-reply-meta {
  color: rgba(191, 226, 255, 0.72);
}

.priority-reply-error {
  color: #fda4af;
}

.priority-reply-actions {
  justify-content: flex-start;
}

.priority-expand-enter-active,
.priority-expand-leave-active {
  overflow: hidden;
  transition: max-height 220ms ease, opacity 180ms ease, transform 180ms ease;
}

.priority-expand-enter-from,
.priority-expand-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-6px);
}

.priority-expand-enter-to,
.priority-expand-leave-from {
  max-height: 1200px;
  opacity: 1;
  transform: translateY(0);
}

button:disabled {
  opacity: 0.55;
  cursor: wait;
}

:global([data-theme="light"]) .priority-card {
  border-color: rgba(148, 163, 184, 0.22);
  background:
    rgba(255, 255, 255, 0.9);
  box-shadow: 0 18px 34px rgba(148, 163, 184, 0.16);
}

:global([data-theme="light"]) .priority-source,
:global([data-theme="light"]) .priority-control,
:global([data-theme="light"]) .priority-mini-action,
:global([data-theme="light"]) .priority-secondary-action,
:global([data-theme="light"]) .priority-next,
:global([data-theme="light"]) .priority-reply-textarea {
  border-color: rgba(148, 163, 184, 0.2);
  background: rgba(255, 255, 255, 0.84);
  color: rgba(15, 23, 42, 0.86);
}

@media (max-width: 720px) {
  .priority-card {
    padding: 16px;
    border-radius: var(--radius-md);
  }
}
</style>
