<template>
  <div class="briefing-shell">
    <section class="briefing-hero">
      <div class="briefing-topline">
        <span class="briefing-badge">{{ briefingTitle }}</span>
        <span class="briefing-date">{{ dateLabel }}</span>
      </div>

      <div class="briefing-hero-grid">
        <div class="briefing-copy">
          <div class="briefing-orb">🔭</div>
          <div>
            <h2>{{ heading }}</h2>
            <p class="briefing-kicker">{{ greeting }}</p>
            <p class="briefing-summary">{{ summaryText }}</p>
          </div>
        </div>

        <div class="briefing-stats">
          <div v-for="stat in visibleStats" :key="stat.label" class="briefing-stat">
            <span class="briefing-stat-label">{{ stat.label }}</span>
            <strong class="briefing-stat-value">{{ stat.value }}</strong>
          </div>
        </div>
      </div>

      <div v-if="connectedApps.length" class="briefing-apps">
        <span class="briefing-apps-label">Connected Apps</span>
        <button
          v-for="app in connectedApps"
          :key="app.id"
          class="briefing-app-chip briefing-app-chip-action"
          @click="triggerAction(app.action)"
        >
          <span>{{ app.icon }}</span>
          <span>{{ app.label }}</span>
        </button>
      </div>
    </section>

    <!-- <section class="briefing-section">
      <div class="briefing-section-head">
        <h3>Priority Summary</h3>
        <span>{{ items.length }} active item{{ items.length === 1 ? '' : 's' }}</span>
      </div>

      <div class="priority-summary-grid">
        <article class="priority-summary-card urgent">
          <span class="priority-summary-label">Urgent items</span>
          <strong>{{ prioritySummary.urgentCount }}</strong>
          <p>Highest-ranked work OrionAI thinks needs your attention now.</p>
        </article>
        <article class="priority-summary-card quick">
          <span class="priority-summary-label">Quick clears</span>
          <strong>{{ prioritySummary.quickClearCount }}</strong>
          <p>Fast actions you can close quickly to reduce drag across the day.</p>
        </article>
        <article class="priority-summary-card upcoming">
          <span class="priority-summary-label">Upcoming attention</span>
          <strong>{{ prioritySummary.upcomingCount }}</strong>
          <p>Work that will get harder if it sits for another hour or two.</p>
        </article>
      </div>
    </section> -->

    <div
      class="briefing-dashboard-top"
      :class="{ 'briefing-dashboard-top-single': !hasJiraPanel }"
    >
      <section class="briefing-section briefing-card-shell briefing-feed-shell">
        <div class="briefing-section-head">
          <h3>{{ feedTitle }}</h3>
          <span>One operational layer over Gmail, Calendar, Jira, and messaging</span>
        </div>

        <div v-if="briefingUpdateLabel" class="briefing-update-row">
          <button class="briefing-update-pill" @click="applyPendingDashboard">
            {{ briefingUpdateLabel }}
          </button>
        </div>

        <div class="priority-filter-row">
          <button
            v-for="filter in filters"
            :key="filter.id"
            class="priority-filter-chip"
            :class="{ active: activeFilter === filter.id }"
            @click="activeFilter = filter.id"
          >
            <span>{{ filter.label }}</span>
            <span v-if="Number(filter.count || 0) > 0" class="priority-filter-count">
              {{ filterCountLabel(filter.count) }}
            </span>
          </button>
        </div>

        <div class="briefing-feed-body">
          <div v-if="loading" class="priority-empty briefing-panel-fill">
            <strong>Building your Priority Feed...</strong>
            <p>OrionAI is ranking signals from your connected work apps.</p>
          </div>

          <div v-else-if="filteredItems.length" class="priority-feed-grid briefing-scroll-panel">
            <PriorityFeedCard
              v-for="item in filteredItems"
              :key="item.id"
              :item="item"
              :busy="pendingItemId === item.id"
              :request-reply-draft="requestReplyDraft"
              :send-reply="sendPriorityReply"
              :show-approval-suggestion="activeFilter === 'needs_approval'"
              @approve="approveItem"
              @dismiss="dismissItem"
              @snooze="snoozeItem"
              @run-action="runPrimaryAction"
              @run-secondary-action="runSecondaryAction"
            />
          </div>

          <div v-else class="priority-empty briefing-panel-fill">
            <strong>{{ emptyStateTitle }}</strong>
            <p>{{ emptyStateDescription }}</p>
          </div>
        </div>
      </section>

      <section v-if="hasJiraPanel" class="briefing-section briefing-card-shell briefing-jira-shell">
        <div class="briefing-section-head">
          <h3>Jira Overdue Insight</h3>
          <span>{{ jiraInsight.definition }}</span>
        </div>

        <div class="jira-insight-grid">
          <article class="jira-insight-card primary">
            <span class="jira-insight-label">Your tickets</span>
            <div class="jira-insight-stat-stack">
              <div class="jira-insight-stat-row">
                <span class="jira-insight-stat-copy">Total Tickets</span>
                <button
                  v-if="isInteractiveJiraCount(jiraInsight.myTotalCount)"
                  type="button"
                  class="jira-insight-count clickable"
                  @click="openJiraInsightFilter({ scope: 'mine', focus: 'my-tickets' })"
                >
                  {{ jiraInsight.myTotalCount }}
                </button>
                <strong v-else class="jira-insight-count">{{ jiraInsight.myTotalCount }}</strong>
              </div>
              <div class="jira-insight-stat-row">
                <span class="jira-insight-stat-copy">Overdue Tickets</span>
                <button
                  v-if="isInteractiveJiraCount(jiraInsight.myOverdueCount)"
                  type="button"
                  class="jira-insight-count clickable"
                  @click="openJiraInsightFilter({ scope: 'mine', overdueOnly: true, focus: 'my-overdue' })"
                >
                  {{ jiraInsight.myOverdueCount }}
                </button>
                <strong v-else class="jira-insight-count">{{ jiraInsight.myOverdueCount }}</strong>
              </div>
            </div>
            <!-- <p>Personally assigned Jira work, with overdue tickets called out separately.</p> -->
          </article>
          <article class="jira-insight-card org">
            <span class="jira-insight-label">Org overdue tickets</span>
            <button
              v-if="isInteractiveJiraCount(jiraInsight.orgOverdueCount)"
              type="button"
              class="jira-insight-count clickable"
              @click="openJiraInsightFilter({ scope: 'all', overdueOnly: true, focus: 'org-overdue' })"
            >
              {{ jiraInsight.orgOverdueCount }}
            </button>
            <strong v-else class="jira-insight-count">{{ jiraInsight.orgOverdueCount }}</strong>
            <p>Overall overdue count in the connected Jira.</p>
          </article>
          <article class="jira-insight-card compact blocked">
            <span class="jira-insight-label">Blocked overdue</span>
            <button
              v-if="isInteractiveJiraCount(jiraInsight.blockedOverdueCount)"
              type="button"
              class="jira-insight-count clickable"
              @click="openJiraInsightFilter({ scope: 'all', overdueOnly: true, blockedOnly: true, focus: 'blocked-overdue' })"
            >
              {{ jiraInsight.blockedOverdueCount }}
            </button>
            <strong v-else class="jira-insight-count">{{ jiraInsight.blockedOverdueCount }}</strong>
            <p>Overdue tickets that also look blocked or stuck.</p>
          </article>
          <article class="jira-insight-card compact high-priority">
            <span class="jira-insight-label">High-priority overdue</span>
            <button
              v-if="isInteractiveJiraCount(jiraInsight.highPriorityOverdueCount)"
              type="button"
              class="jira-insight-count clickable"
              @click="openJiraInsightFilter({ scope: 'all', overdueOnly: true, priorityBucket: 'high', focus: 'high-priority-overdue' })"
            >
              {{ jiraInsight.highPriorityOverdueCount }}
            </button>
            <strong v-else class="jira-insight-count">{{ jiraInsight.highPriorityOverdueCount }}</strong>
            <p>Overdue tickets already marked high priority.</p>
          </article>
        </div>
      </section>
    </div>

    <div
      class="briefing-dashboard-bottom"
      :class="{ 'briefing-dashboard-bottom-single': !hasRecentActions }"
    >
      <section v-if="hasRecentActions" class="briefing-section briefing-card-shell briefing-recent-shell">
        <div class="briefing-section-head">
          <h3>Recent Actions</h3>
          <span>Light audit trail</span>
        </div>

        <div class="audit-trail-list briefing-scroll-panel">
          <article v-for="entry in auditTrail" :key="entry.id" class="audit-trail-item">
            <div class="audit-trail-top">
              <span class="audit-trail-badge">
                <span>{{ entry.sourceIcon }}</span>
                <span>{{ entry.sourceLabel }}</span>
              </span>
              <span class="audit-trail-state">{{ actionStateLabel(entry.action) }}</span>
            </div>
            <strong>{{ entry.title }}</strong>
            <p v-if="entry.note">{{ entry.note }}</p>
            <span class="audit-trail-time">{{ formatActionTime(entry.createdAt) }}</span>
          </article>
        </div>
      </section>

      <section class="briefing-section briefing-card-shell briefing-suggestions-shell">
        <div class="briefing-section-head">
          <h3>Suggested Next Actions</h3>
          <span>{{ suggestedActions.length }} suggestion{{ suggestedActions.length === 1 ? '' : 's' }}</span>
        </div>

        <div class="briefing-suggestions">
          <button
            v-for="suggestion in suggestedActions"
            :key="suggestion.id"
            class="briefing-suggestion"
            @click="triggerAction(suggestion.action)"
          >
            <span class="briefing-suggestion-label">{{ suggestion.label }}</span>
            <span class="briefing-suggestion-text">{{ suggestion.description }}</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import api, { agentAPI } from '../../services/api'
import PriorityFeedCard from '../home/PriorityFeedCard.vue'
import { useWebSocket } from '../../composables/useWebSocket'
import { emitCommunicationPriorityRefresh } from '../../composables/useCommunicationActions'

const props = defineProps({
  fallbackTitle: { type: String, default: 'Daily Briefing' },
})

const emit = defineEmits(['usePrompt'])

const loading = ref(true)
const dashboard = ref(null)
const items = ref([])
const auditTrail = ref([])
const activeFilter = ref('all')
const pendingItemId = ref(null)
const pendingDashboard = ref(null)
const briefingUpdateLabel = ref('')
const pendingUpdateCount = ref(0)
const { unreadByApp } = useWebSocket()
const replyDraftCache = new Map()
const replyDraftRequests = new Map()
let refreshTimer = null
let liveRefreshTimer = null
let latestLoadRequestId = 0

const fallbackSuggestions = [
  {
    id: 'fallback-plan',
    label: 'Plan my day',
    description: 'Help me plan the highest-impact work for today.',
    action: { kind: 'prompt', prompt: 'Help me plan the highest-impact work for today.', mode: 'chat' },
  },
  {
    id: 'fallback-ideas',
    label: 'Put OrionAI to work',
    description: 'Give me three meaningful ways to use OrionAI today.',
    action: { kind: 'prompt', prompt: 'Give me three meaningful ways to use OrionAI today.', mode: 'chat' },
  },
]

const LIVE_CHAT_SOURCE_APPS = new Set(['signal', 'telegram', 'slack', 'whatsapp'])

const dailyBriefing = computed(() => dashboard.value?.dailyBriefing || {})
const filterDefinitions = computed(() => dashboard.value?.priorityFeed?.filters?.map((filter) => ({
  id: filter.id,
  label: filter.label,
})) || [
  { id: 'all', label: 'All', count: 0 },
  { id: 'urgent', label: 'Urgent', count: 0 },
  { id: 'communication', label: 'Communication', count: 0 },
  { id: 'needs_approval', label: 'Approvals', count: 0 },
  { id: 'needs_follow_up', label: 'Follow-ups', count: 0 },
  { id: 'meetings', label: 'Meetings', count: 0 },
  { id: 'tasks', label: 'Tasks', count: 0 },
])
const filters = computed(() =>
  filterDefinitions.value.map((filter) => ({
    ...filter,
    count: countItemsForFilter(visiblePriorityItems.value, filter.id),
  }))
)

const briefingTitle = computed(() => dailyBriefing.value.title || props.fallbackTitle)
const dateLabel = computed(() => dailyBriefing.value.dateLabel || 'Now')
const heading = computed(() =>
  dailyBriefing.value.timeOfDay === 'morning'
    ? 'Good morning'
    : dailyBriefing.value.timeOfDay === 'afternoon'
      ? 'Welcome back'
      : 'Ready for a quick reset?'
)
const greeting = computed(() =>
  dailyBriefing.value.greeting || 'OrionAI is acting like your work chief of staff.'
)
const summaryText = computed(() =>
  dailyBriefing.value.summary || 'Connect your apps and OrionAI will decide what matters before you ask.'
)
const visibleStats = computed(() =>
  dailyBriefing.value.stats?.length
    ? dailyBriefing.value.stats
    : [
        { label: 'Urgent now', value: '0' },
        { label: 'Quick clears', value: '0' },
        { label: 'Upcoming', value: '0' },
      ]
)
const connectedApps = computed(() => dailyBriefing.value.connectedApps || [])
const feedTitle = computed(() => dashboard.value?.priorityFeed?.title || 'Priority Feed')
const jiraInsight = computed(() => dailyBriefing.value.jiraInsight || null)
const emptyStateTitle = computed(() => dashboard.value?.priorityFeed?.emptyState?.title || "You're clear right now.")
const emptyStateDescription = computed(() => dashboard.value?.priorityFeed?.emptyState?.description || 'No urgent replies or personal blockers were detected across your connected work apps.')

function getFeedItemActivityTime(item = {}) {
  const candidates = [
    item?.meta?.latestMessageAt,
    item?.meta?.latestInboundAt,
    item?.meta?.lastMessageAt,
    item?.meta?.updatedAt,
    item?.meta?.startsAt,
    item?.updatedAt,
    item?.createdAt,
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    const timestamp = new Date(candidate).getTime()
    if (Number.isFinite(timestamp) && timestamp > 0) return timestamp
  }

  return 0
}

function sortFeedItemsByActivity(feedItems = []) {
  return [...feedItems].sort((left, right) => {
    const activityDelta = getFeedItemActivityTime(right) - getFeedItemActivityTime(left)
    if (activityDelta !== 0) return activityDelta

    if ((Number(right?.priorityScore || 0) || 0) !== (Number(left?.priorityScore || 0) || 0)) {
      return (Number(right?.priorityScore || 0) || 0) - (Number(left?.priorityScore || 0) || 0)
    }

    return String(left?.title || '').localeCompare(String(right?.title || ''))
  })
}

function normalizeIdentity(value = '') {
  return String(value || '').trim().toLowerCase()
}

function getPriorityConversationIdentifiers(item = {}) {
  const openContext = item?.meta?.openContext || {}
  return new Set(
    [
      item?.id,
      item?.meta?.conversationId,
      item?.meta?.threadId,
      item?.meta?.latestMessageId,
      openContext.dialogId,
      openContext.roomId,
      openContext.channelId,
      openContext.chatId,
      openContext.threadId,
    ]
      .map((value) => normalizeIdentity(value))
      .filter(Boolean)
  )
}

function liveUnreadItemMatchesPriorityItem(liveItem = {}, priorityItem = {}) {
  const identifiers = getPriorityConversationIdentifiers(priorityItem)
  if (!identifiers.size) return false

  return [
    liveItem?.id,
    liveItem?.conversationId,
    liveItem?.threadId,
    liveItem?.chatId,
    liveItem?.roomId,
    liveItem?.dialogId,
    liveItem?.channelId,
    liveItem?.latestMessageId,
    liveItem?.messageId,
  ]
    .map((value) => normalizeIdentity(value))
    .filter(Boolean)
    .some((value) => identifiers.has(value))
}

function shouldRenderPriorityItem(item = {}) {
  const sourceApp = String(item?.sourceApp || '').trim().toLowerCase()
  if (!LIVE_CHAT_SOURCE_APPS.has(sourceApp)) return true

  const liveEntry = unreadByApp[sourceApp]
  if (!liveEntry) return true

  const liveDisplayCount = Number(
    liveEntry?.displayCount ?? liveEntry?.rawCount ?? liveEntry?.count ?? 0
  ) || 0
  if (liveDisplayCount <= 0) return false

  const liveItems = Array.isArray(liveEntry?.items) ? liveEntry.items : []

  if (liveItems.length > 0) {
    return liveItems.some((liveItem) =>
      liveUnreadItemMatchesPriorityItem(liveItem, item)
    )
  }

  return true
}

const visiblePriorityItems = computed(() =>
  sortFeedItemsByActivity(
    items.value.filter((item) => shouldRenderPriorityItem(item))
  )
)

// const prioritySummary = computed(() => ({
//   urgentCount: items.value.filter((item) => item.priority === 'High').length,
//   quickClearCount: items.value.filter((item) => item.canClearQuickly).length,
//   upcomingCount: items.value.filter(
//     (item) => item.category === 'meetings' || (item.category === 'tasks' && item.needsAttentionSoon)
//   ).length,
// }))

const filteredItems = computed(() => {
  const sortedItems = visiblePriorityItems.value
  if (activeFilter.value === 'all') return sortedItems
  if (activeFilter.value === 'urgent') {
    return sortedItems.filter(
      (item) => item.priority === 'High' && item.category !== 'meetings'
    )
  }
  if (['waiting_on_your_reply', 'needs_approval', 'needs_follow_up', 'waiting_on_others'].includes(activeFilter.value)) {
    return sortedItems.filter((item) => item.actionState === activeFilter.value)
  }
  return sortedItems.filter((item) => item.category === activeFilter.value)
})

watch(
  filters,
  (nextFilters) => {
    if (nextFilters.some((filter) => filter.id === activeFilter.value)) return
    activeFilter.value = 'all'
  },
  { immediate: true }
)

const suggestedActions = computed(() => {
  if (!visiblePriorityItems.value.length) return fallbackSuggestions
  return visiblePriorityItems.value.slice(0, 4).map((item) => ({
    id: `suggestion:${item.id}`,
    label: item.action?.label || 'Review now',
    description: item.title,
    action: item.action,
  }))
})
const hasJiraPanel = computed(() => Boolean(jiraInsight.value))
const hasRecentActions = computed(() => auditTrail.value.length > 0)

function actionStateLabel(value) {
  return {
    approved: 'Approved',
    dismissed: 'Dismissed',
    snoozed: 'Snoozed',
    edited_approved: 'Edited + approved',
  }[value] || value
}

function formatActionTime(value) {
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return 'Recently'
  }
}

function triggerAction(action) {
  if (!action) return
  if (action.kind === 'module') {
    document.dispatchEvent(new CustomEvent('orion:open-module', {
      detail: {
        module: action.module,
        context: action.context || null,
      },
    }))
    return
  }
  emit('usePrompt', { prompt: action.prompt || '', mode: action.mode || 'agent' })
}

function isInteractiveJiraCount(value) {
  return Number(value || 0) > 0
}

function buildJiraInsightAction(context = {}) {
  return {
    kind: 'module',
    module: 'jira',
    context: {
      activeTab: 'list',
      ...context,
    },
  }
}

function openJiraInsightFilter(context = {}) {
  triggerAction(buildJiraInsightAction(context))
}

function runPrimaryAction(item) {
  triggerAction(item.action)
}

function runSecondaryAction(item) {
  triggerAction(item.secondaryAction)
}

function buildReplyDraftCacheKey(item = {}) {
  return [
    String(item?.id || ''),
    String(item?.meta?.latestMessageId || ''),
    String(item?.meta?.latestMessageAt || ''),
  ].join('::')
}

function getItemOpenContext(item = {}) {
  return item?.meta?.openContext || {}
}

function getItemConversationId(item = {}) {
  const openContext = getItemOpenContext(item)
  return (
    item?.meta?.conversationId ||
    openContext.dialogId ||
    openContext.roomId ||
    openContext.channelId ||
    openContext.chatId ||
    openContext.threadId ||
    item?.meta?.threadId ||
    item?.id
  )
}

function clearReplyDraftCache(item = {}) {
  const cacheKey = buildReplyDraftCacheKey(item)
  if (!cacheKey) return
  replyDraftCache.delete(cacheKey)
  replyDraftRequests.delete(cacheKey)
}

async function requestReplyDraft(item) {
  const cacheKey = buildReplyDraftCacheKey(item)
  if (cacheKey && replyDraftCache.has(cacheKey)) {
    return replyDraftCache.get(cacheKey)
  }
  if (cacheKey && replyDraftRequests.has(cacheKey)) {
    return replyDraftRequests.get(cacheKey)
  }

  const request = api
    .post('/api/briefing/priority-feed/draft-reply', { item })
    .then(({ data }) => {
      const suggested = String(data?.suggested || '').trim()
      if (cacheKey && suggested) {
        replyDraftCache.set(cacheKey, suggested)
      }
      return suggested
    })
    .finally(() => {
      if (cacheKey) replyDraftRequests.delete(cacheKey)
    })

  if (cacheKey) replyDraftRequests.set(cacheKey, request)
  return request
}

function buildReplyAuditNote(body = '') {
  const normalized = String(body || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return normalized.length > 180 ? `${normalized.slice(0, 177).trim()}...` : normalized
}

function buildGmailReplyPayload(item = {}) {
  const headers = item?.meta?.platformMetadata?.headers || {}
  const openContext = getItemOpenContext(item)
  const threadId = item?.meta?.threadId || openContext.threadId || ''
  const messageId = item?.meta?.latestMessageId || ''
  const replyTo =
    headers['Reply-To'] ||
    headers.From ||
    item?.meta?.platformMetadata?.latestFrom ||
    ''
  const subject = headers.Subject || item?.title || ''

  if (!threadId || !messageId || !replyTo || !subject) {
    throw new Error('This Gmail thread is missing reply details.')
  }

  return {
    threadId,
    messageId,
    replyTo,
    subject,
  }
}

async function sendPriorityReply(item, body) {
  const trimmedBody = String(body || '').trim()
  if (!trimmedBody) {
    throw new Error('Reply text is required.')
  }

  const sourceApp = String(item?.sourceApp || '').toLowerCase()
  const openContext = getItemOpenContext(item)
  const conversationId = getItemConversationId(item)

  pendingItemId.value = item.id

  try {
    if (sourceApp === 'gmail') {
      await agentAPI.gmailReply({
        ...buildGmailReplyPayload(item),
        body: trimmedBody,
      })
    } else if (sourceApp === 'telegram') {
      const dialogId = String(openContext.dialogId || '').trim()
      if (!dialogId) throw new Error('Telegram dialog details are missing.')

      await api.post(`/api/telegram/dialogs/${encodeURIComponent(dialogId)}/send`, {
        text: trimmedBody,
        replyToMsgId: item?.meta?.latestMessageId || undefined,
      })
    } else if (sourceApp === 'signal') {
      const roomId = String(openContext.roomId || '').trim()
      if (!roomId) throw new Error('Signal room details are missing.')

      await api.post(`/api/signal/rooms/${encodeURIComponent(roomId)}/send`, {
        text: trimmedBody,
        replyToEventId: item?.meta?.latestMessageId || undefined,
      })
    } else if (sourceApp === 'slack') {
      const channelId = String(openContext.channelId || '').trim()
      if (!channelId) throw new Error('Slack channel details are missing.')

      const threadId = String(
        openContext.threadTs ||
        item?.meta?.platformMetadata?.threadTs ||
        ''
      ).trim()

      await api.post(`/api/slack/channels/${encodeURIComponent(channelId)}/send`, {
        message: trimmedBody,
        replyTo: threadId ? { id: threadId } : null,
      })
    } else if (sourceApp === 'whatsapp') {
      const chatId = String(openContext.chatId || '').trim()
      if (!chatId) throw new Error('WhatsApp chat details are missing.')

      await api.post('/api/whatsapp/send', {
        to: chatId,
        message: trimmedBody,
      })
    } else {
      throw new Error('Inline reply is not available for this item.')
    }

    await saveFeedAction(
      item,
      'approved',
      { note: buildReplyAuditNote(trimmedBody) },
      { managePending: false }
    )
    clearReplyDraftCache(item)

    emitCommunicationPriorityRefresh('communication_replied', {
      sourceApp,
      conversationId,
    })
  } finally {
    pendingItemId.value = null
  }
}

function filterCountLabel(value) {
  const count = Number(value || 0)
  if (count <= 0) return ''
  return count > 9 ? '9+' : String(count)
}

function countItemsForFilter(feedItems = [], filterId = 'all') {
  if (filterId === 'all') return feedItems.length
  if (filterId === 'urgent') {
    return feedItems.filter(
      (item) => item.priority === 'High' && item.category !== 'meetings'
    ).length
  }
  if (filterId === 'communication') {
    return feedItems.filter((item) => item.category === 'communication').length
  }
  if (['waiting_on_your_reply', 'needs_approval', 'needs_follow_up', 'waiting_on_others'].includes(filterId)) {
    return feedItems.filter((item) => item.actionState === filterId).length
  }
  return feedItems.filter((item) => item.category === filterId).length
}

function itemIdentity(item = {}) {
  return String(
    item?.latestMessageId ||
    item?.messageId ||
    item?.eventId ||
    item?.threadId ||
    item?.chatId ||
    item?.id ||
    item?.ts ||
    item?.start ||
    item?.title ||
    item?.name ||
    ''
  )
}

const liveSignalFingerprint = computed(() =>
  Object.entries(unreadByApp)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([app, entry]) => {
      const previews = Array.isArray(entry?.items)
        ? entry.items.slice(0, 3).map((item) => itemIdentity(item)).join(',')
        : ''

      return [
        app,
        Number(entry?.rawCount ?? entry?.count ?? 0) || 0,
        Number(entry?.displayCount ?? 0) || 0,
        String(entry?.summary || ''),
        previews,
      ].join('::')
    })
    .join('||')
)

function applyActionResult(itemId, entry) {
  items.value = items.value.filter((item) => item.id !== itemId)
  auditTrail.value = [entry, ...auditTrail.value].slice(0, 8)
}

function applyDashboardSnapshot(data) {
  dashboard.value = data
  items.value = Array.isArray(data.priorityFeed?.items) ? data.priorityFeed.items : []
  auditTrail.value = Array.isArray(data.priorityFeed?.auditTrail) ? data.priorityFeed.auditTrail : []
  loading.value = false
}

function clearPendingDashboard() {
  pendingDashboard.value = null
  pendingUpdateCount.value = 0
  briefingUpdateLabel.value = ''
}

function shouldAutoApplyPendingUpdate(newItems = []) {
  return newItems.some((item) => item?.priority === 'High')
}

function applyPendingDashboard() {
  if (!pendingDashboard.value) return
  applyDashboardSnapshot(pendingDashboard.value)
  clearPendingDashboard()
}

async function saveFeedAction(item, action, extras = {}, options = {}) {
  const managePending = options.managePending !== false
  if (managePending) pendingItemId.value = item.id
  try {
    const { data } = await api.post('/api/briefing/priority-feed/actions', {
      itemId: item.id,
      sourceApp: item.sourceApp,
      title: item.title,
      action,
      actionLabel: item.action?.label || item.suggestedNextAction,
      ...extras,
    })
    applyActionResult(item.id, data.entry)
    await loadDashboard({ silent: true, mode: 'replace' })
  } catch (err) {
    console.error('Priority Feed action failed:', err.message)
  } finally {
    if (managePending) pendingItemId.value = null
  }
}

function approveItem(item) {
  return saveFeedAction(item, 'approved')
}

function dismissItem(item) {
  return saveFeedAction(item, 'dismissed')
}

function snoozeItem({ item, minutes }) {
  return saveFeedAction(item, 'snoozed', { snoozeMinutes: minutes })
}

async function loadDashboard({ silent = false, mode = 'replace' } = {}) {
  const requestId = ++latestLoadRequestId
  if (!silent) loading.value = true
  try {
    const { data } = await api.get('/api/briefing/home')
    if (requestId !== latestLoadRequestId) return
    if (mode === 'pending') {
      const nextItems = Array.isArray(data.priorityFeed?.items) ? data.priorityFeed.items : []
      const currentIds = new Set(items.value.map((item) => item.id))
      const newItems = nextItems.filter((item) => !currentIds.has(item.id))

      if (shouldAutoApplyPendingUpdate(newItems)) {
        applyDashboardSnapshot(data)
        clearPendingDashboard()
        return
      }

      pendingDashboard.value = data
      pendingUpdateCount.value = newItems.length
      briefingUpdateLabel.value = newItems.length
        ? `${newItems.length} new priority item${newItems.length === 1 ? '' : 's'}`
        : 'Briefing updated'
      return
    }

    applyDashboardSnapshot(data)
    clearPendingDashboard()
  } catch (err) {
    if (requestId !== latestLoadRequestId) return
    console.debug('Workspace briefing unavailable:', err.message)
  } finally {
    if (requestId === latestLoadRequestId && (!silent || dashboard.value)) {
      loading.value = false
    }
  }
}

function scheduleLiveRefresh() {
  clearTimeout(liveRefreshTimer)
  liveRefreshTimer = setTimeout(() => {
    loadDashboard({ silent: true, mode: 'replace' })
  }, 180)
}

function onPriorityRefreshNeeded(event) {
  const reason = event.detail?.reason || ''
  if (reason === 'incoming_high_signal') {
    scheduleLiveRefresh()
    return
  }

  if (reason === 'gmail_read' || reason === 'gmail_replied') {
    loadDashboard({ silent: true, mode: 'replace' })
    return
  }

  if (reason === 'communication_replied' || reason === 'communication_action_recorded' || reason === 'communication_read') {
    loadDashboard({ silent: true, mode: 'replace' })
  }
}

watch(
  liveSignalFingerprint,
  (nextValue, previousValue) => {
    if (!nextValue || nextValue === previousValue) return
    if (loading.value && !dashboard.value) return
    scheduleLiveRefresh()
  }
)

onMounted(() => {
  loadDashboard()
  document.addEventListener('orion:priority-refresh-needed', onPriorityRefreshNeeded)
})

onUnmounted(() => {
  clearTimeout(refreshTimer)
  clearTimeout(liveRefreshTimer)
  document.removeEventListener('orion:priority-refresh-needed', onPriorityRefreshNeeded)
})
</script>

<style scoped>
.briefing-shell {
  --briefing-hero-bg:
    radial-gradient(circle at 14% 14%, rgba(82, 212, 255, 0.16), transparent 28%),
    radial-gradient(circle at 88% 18%, rgba(139, 125, 255, 0.2), transparent 28%),
    linear-gradient(135deg, rgba(9, 16, 34, 0.98), rgba(10, 20, 43, 0.94));
  --briefing-hero-border: rgba(176, 201, 255, 0.12);
  --briefing-hero-shadow: 0 36px 96px rgba(0, 4, 18, 0.42);
  --briefing-badge-bg: rgba(242, 198, 109, 0.12);
  --briefing-badge-border: rgba(242, 198, 109, 0.2);
  --briefing-badge-text: var(--accent-warm);
  --briefing-date-text: rgba(200, 210, 228, 0.7);
  --briefing-orb-bg: linear-gradient(135deg, rgba(82, 212, 255, 0.16), rgba(139, 125, 255, 0.16));
  --briefing-orb-border: rgba(176, 201, 255, 0.14);
  --briefing-heading: #f8fafc;
  --briefing-kicker: rgba(226, 232, 240, 0.86);
  --briefing-summary: rgba(200, 210, 228, 0.72);
  --briefing-stat-bg: rgba(255, 255, 255, 0.04);
  --briefing-stat-border: rgba(176, 201, 255, 0.1);
  --briefing-stat-label: rgba(127, 140, 166, 0.92);
  --briefing-stat-value: #f8fafc;
  --briefing-chip-bg: rgba(255, 255, 255, 0.045);
  --briefing-chip-border: rgba(176, 201, 255, 0.1);
  --briefing-chip-text: #e2e8f0;
  --briefing-panel-bg:
    linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(9, 16, 34, 0.88));
  --briefing-panel-border: rgba(176, 201, 255, 0.1);
  --briefing-panel-shadow: 0 28px 72px rgba(0, 4, 18, 0.28);
  --briefing-top-card-height: clamp(470px, 58vh, 600px);
  width: min(980px, 100%);
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 8px 0 8px;
}

.briefing-hero {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  padding: 24px;
  background: var(--briefing-hero-bg);
  border: 1px solid var(--briefing-hero-border);
  box-shadow: var(--briefing-hero-shadow);
  backdrop-filter: blur(24px);
}

.briefing-topline,
.briefing-apps,
.briefing-section-head,
.audit-trail-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.briefing-topline {
  margin-bottom: 18px;
}

.briefing-badge,
.briefing-app-chip,
.priority-filter-chip,
.audit-trail-badge,
.audit-trail-state {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border-radius: 999px;
}

.briefing-badge {
  padding: 7px 12px;
  background: var(--briefing-badge-bg);
  border: 1px solid var(--briefing-badge-border);
  color: var(--briefing-badge-text);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 700;
}

.briefing-date,
.briefing-apps-label,
.briefing-section-head span,
.audit-trail-time {
  font-size: 11px;
  color: var(--briefing-date-text);
}

.briefing-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(220px, 0.9fr);
  gap: 18px;
}

.briefing-copy {
  display: flex;
  gap: 16px;
}

.briefing-orb {
  width: 62px;
  height: 62px;
  border-radius: 22px;
  display: grid;
  place-items: center;
  font-size: 24px;
  background: var(--briefing-orb-bg);
  border: 1px solid var(--briefing-orb-border);
  flex-shrink: 0;
  box-shadow: 0 18px 38px rgba(82, 212, 255, 0.12);
}

.briefing-copy h2,
.briefing-section-head h3,
.priority-summary-card strong,
.audit-trail-item strong {
  color: var(--text-primary);
}

.briefing-copy h2 {
  font-size: 33px;
  line-height: 1.08;
  margin-bottom: 10px;
}

.briefing-kicker,
.briefing-summary,
.priority-summary-card p,
.priority-empty p,
.audit-trail-item p {
  line-height: 1.65;
}

.briefing-kicker {
  color: var(--briefing-kicker);
  margin-bottom: 8px;
}

.briefing-summary {
  color: var(--briefing-summary);
}

.briefing-stats {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 12px;
}

.briefing-stat,
.priority-summary-card,
.jira-insight-card,
.priority-empty,
.audit-trail-item,
.briefing-suggestion {
  border-radius: 24px;
  border: 1px solid rgba(176, 201, 255, 0.1);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.012));
  backdrop-filter: blur(18px);
}

.briefing-stat {
  padding: 16px;
  background: var(--briefing-stat-bg);
  border: 1px solid var(--briefing-stat-border);
}

.briefing-stat-label,
.priority-summary-label,
.briefing-suggestion-label,
.audit-trail-state {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 700;
}

.briefing-stat-label {
  color: var(--briefing-stat-label);
}

.briefing-stat-value {
  margin-top: 6px;
  display: block;
  color: var(--briefing-stat-value);
  font-size: 25px;
  line-height: 1;
}

.briefing-apps {
  margin-top: 16px;
}

.briefing-app-chip {
  padding: 8px 12px;
  background: var(--briefing-chip-bg);
  border: 1px solid var(--briefing-chip-border);
  color: var(--briefing-chip-text);
  font-size: 12px;
}

.briefing-app-chip-action {
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.briefing-app-chip-action:hover {
  transform: translateY(-1px);
  border-color: rgba(99, 102, 241, 0.24);
  background: rgba(99, 102, 241, 0.12);
}

.briefing-app-chip-action:active {
  transform: translateY(0);
}

.briefing-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.briefing-card-shell {
  min-width: 0;
  padding: 20px;
  border-radius: 28px;
  border: 1px solid var(--briefing-panel-border);
  background: var(--briefing-panel-bg);
  box-shadow: var(--briefing-panel-shadow);
  backdrop-filter: blur(24px);
}

.briefing-dashboard-top,
.briefing-dashboard-bottom {
  display: grid;
  gap: 18px;
}

.briefing-dashboard-top {
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.92fr);
  align-items: stretch;
}

.briefing-dashboard-top-single,
.briefing-dashboard-bottom-single {
  grid-template-columns: minmax(0, 1fr);
}

.briefing-dashboard-bottom {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.briefing-dashboard-top:not(.briefing-dashboard-top-single) > .briefing-feed-shell,
.briefing-dashboard-top:not(.briefing-dashboard-top-single) > .briefing-jira-shell {
  min-height: var(--briefing-top-card-height);
  height: var(--briefing-top-card-height);
}

.briefing-feed-shell,
.briefing-jira-shell,
.briefing-recent-shell,
.briefing-suggestions-shell {
  min-width: 0;
}

.briefing-feed-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.briefing-panel-fill {
  display: flex;
  flex-direction: column;
  flex: 1;
  justify-content: center;
}

.briefing-panel-fill,
.briefing-feed-body > .priority-feed-grid,
.briefing-jira-shell .jira-insight-grid,
.briefing-recent-shell .audit-trail-list {
  min-height: 0;
}

.briefing-scroll-panel {
  overflow-y: auto;
  padding-right: 6px;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(139, 125, 255, 0.45) transparent;
}

.briefing-scroll-panel::-webkit-scrollbar {
  width: 6px;
}

.briefing-scroll-panel::-webkit-scrollbar-track {
  background: transparent;
}

.briefing-scroll-panel::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(139, 125, 255, 0.45);
}

.briefing-jira-shell .jira-insight-grid {
  flex: 1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  align-items: stretch;
}

.briefing-jira-shell .jira-insight-card {
  min-height: 0;
  padding: 16px;
  gap: 8px;
  overflow: hidden;
}

.briefing-jira-shell .jira-insight-stat-stack {
  gap: 10px;
}

.briefing-jira-shell .jira-insight-stat-row {
  align-items: flex-start;
  gap: 12px;
}

.briefing-jira-shell .jira-insight-label {
  font-size: 10px;
  line-height: 1.3;
  letter-spacing: 0.06em;
  overflow-wrap: anywhere;
}

.briefing-jira-shell .jira-insight-stat-copy {
  display: block;
  font-size: 11px;
  line-height: 1.3;
  max-width: 84px;
}

.briefing-jira-shell .jira-insight-count {
  font-size: 30px;
  line-height: 0.95;
}

.briefing-jira-shell .jira-insight-card p {
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.briefing-recent-shell,
.briefing-suggestions-shell {
  min-height: 320px;
}

.briefing-recent-shell .audit-trail-list {
  flex: 1;
  max-height: 360px;
}

.briefing-suggestions {
  align-content: start;
}

.priority-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.jira-insight-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.priority-summary-card,
.jira-insight-card,
.priority-empty,
.audit-trail-item,
.briefing-suggestion {
  padding: 18px;
  box-shadow: 0 24px 54px rgba(2, 6, 23, 0.2);
}

.priority-summary-card,
.jira-insight-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.priority-summary-card strong,
.jira-insight-card strong,
.jira-insight-count {
  font-size: 31px;
  line-height: 1;
}

.priority-summary-card.urgent {
  background:
    radial-gradient(circle at top right, rgba(255, 107, 127, 0.18), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.012)),
    rgba(17, 11, 24, 0.9);
}

.priority-summary-card.quick {
  background:
    radial-gradient(circle at top right, rgba(47, 211, 157, 0.16), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.012)),
    rgba(8, 19, 24, 0.9);
}

.priority-summary-card.upcoming {
  background:
    radial-gradient(circle at top right, rgba(82, 212, 255, 0.16), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.012)),
    rgba(9, 18, 34, 0.9);
}

.jira-insight-card.primary {
  background:
    radial-gradient(circle at top right, rgba(82, 212, 255, 0.22), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.012)),
    rgba(7, 18, 38, 0.9);
}

.jira-insight-card.org {
  background:
    radial-gradient(circle at top right, rgba(248, 113, 113, 0.22), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.012)),
    rgba(37, 10, 18, 0.9);
}

.jira-insight-card.blocked {
  background:
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.24), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.012)),
    rgba(35, 21, 5, 0.9);
}

.jira-insight-card.high-priority {
  background:
    radial-gradient(circle at top right, rgba(192, 132, 252, 0.24), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.012)),
    rgba(26, 12, 40, 0.9);
}

.jira-insight-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(191, 226, 255, 0.82);
}

.jira-insight-stat-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.jira-insight-stat-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
}

.jira-insight-stat-copy {
  color: rgba(200, 210, 228, 0.8);
  font-size: 13px;
  line-height: 1.4;
}

.jira-insight-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-weight: 700;
  text-align: right;
}

.jira-insight-count.clickable {
  cursor: pointer;
  transition: transform 160ms ease, opacity 160ms ease;
}

.jira-insight-count.clickable:hover {
  transform: translateY(-1px);
  opacity: 0.86;
}

.jira-insight-count.clickable:active {
  transform: translateY(0);
}

.jira-insight-card p {
  color: rgba(200, 210, 228, 0.78);
  line-height: 1.55;
}

.priority-summary-label {
  color: rgba(191, 226, 255, 0.82);
}

.briefing-update-row {
  display: flex;
  align-items: center;
}

.briefing-update-pill {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(82, 212, 255, 0.24);
  background: rgba(82, 212, 255, 0.1);
  color: var(--accent-hover);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.briefing-update-pill:hover {
  transform: translateY(-1px);
  border-color: rgba(82, 212, 255, 0.34);
  background: rgba(82, 212, 255, 0.16);
}

.priority-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.briefing-suggestions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.priority-filter-chip,
.briefing-suggestion {
  cursor: pointer;
}

.priority-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(176, 201, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(226, 232, 240, 0.8);
  font-size: 11.5px;
  font-weight: 600;
}

.priority-filter-chip.active {
  border-color: rgba(82, 212, 255, 0.24);
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.12), rgba(139, 125, 255, 0.12));
  color: #eef2ff;
}

.priority-filter-count {
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.92), rgba(139, 125, 255, 0.82));
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
  border: 1.5px solid var(--bg-surface, #0f1117);
}

.priority-filter-chip.active .priority-filter-count {
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.92), rgba(139, 125, 255, 0.82));
}

.priority-feed-grid,
.audit-trail-list {
  display: grid;
  gap: 14px;
}

.priority-empty strong {
  display: block;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.briefing-suggestion {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
}

.briefing-suggestion-label {
  color: rgba(191, 226, 255, 0.86);
}

.briefing-suggestion-text {
  color: rgba(200, 210, 228, 0.8);
  line-height: 1.5;
  font-size: 12.5px;
}

.audit-trail-badge,
.audit-trail-state {
  font-size: 11px;
  color: rgba(191, 226, 255, 0.8);
}

.audit-trail-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

:global([data-theme="light"]) .briefing-shell {
  --briefing-hero-bg:
    radial-gradient(circle at top left, rgba(251, 191, 36, 0.18), transparent 36%),
    radial-gradient(circle at 82% 18%, rgba(45, 212, 191, 0.12), transparent 26%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(240, 247, 255, 0.96));
  --briefing-hero-border: rgba(148, 163, 184, 0.24);
  --briefing-hero-shadow: 0 12px 28px rgba(148, 163, 184, 0.12);
  --briefing-badge-bg: rgba(251, 191, 36, 0.12);
  --briefing-badge-border: rgba(245, 158, 11, 0.2);
  --briefing-badge-text: #b45309;
  --briefing-date-text: rgba(30, 41, 59, 0.72);
  --briefing-orb-bg: linear-gradient(135deg, rgba(251, 191, 36, 0.16), rgba(45, 212, 191, 0.08));
  --briefing-orb-border: rgba(148, 163, 184, 0.22);
  --briefing-heading: #0f172a;
  --briefing-kicker: rgba(15, 23, 42, 0.78);
  --briefing-summary: rgba(15, 23, 42, 0.68);
  --briefing-stat-bg: rgba(255, 255, 255, 0.84);
  --briefing-stat-border: rgba(148, 163, 184, 0.2);
  --briefing-stat-label: rgba(71, 85, 105, 0.82);
  --briefing-stat-value: #0f172a;
  --briefing-chip-bg: rgba(255, 255, 255, 0.86);
  --briefing-chip-border: rgba(148, 163, 184, 0.18);
  --briefing-chip-text: #1e293b;
  --briefing-panel-bg: rgba(255, 255, 255, 0.96);
  --briefing-panel-border: rgba(148, 163, 184, 0.28);
  --briefing-panel-shadow: 0 14px 34px rgba(148, 163, 184, 0.14);
}

:global([data-theme="light"]) .briefing-hero {
  box-shadow: var(--briefing-hero-shadow);
}

:global([data-theme="light"]) .priority-summary-card,
:global([data-theme="light"]) .jira-insight-card,
:global([data-theme="light"]) .priority-empty,
:global([data-theme="light"]) .briefing-card-shell,
:global([data-theme="light"]) .audit-trail-item,
:global([data-theme="light"]) .briefing-suggestion,
:global([data-theme="light"]) .priority-filter-chip {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 10px 24px rgba(148, 163, 184, 0.12);
}

:global([data-theme="light"]) .jira-insight-card.primary {
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.12), transparent 38%),
    rgba(241, 247, 255, 0.92);
}

:global([data-theme="light"]) .jira-insight-card.org {
  background:
    radial-gradient(circle at top right, rgba(239, 68, 68, 0.12), transparent 38%),
    rgba(255, 245, 245, 0.92);
}

:global([data-theme="light"]) .jira-insight-card.blocked {
  background:
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.14), transparent 38%),
    rgba(255, 249, 235, 0.92);
}

:global([data-theme="light"]) .jira-insight-card.high-priority {
  background:
    radial-gradient(circle at top right, rgba(168, 85, 247, 0.14), transparent 38%),
    rgba(249, 245, 255, 0.92);
}

:global([data-theme="light"]) .briefing-update-pill {
  color: #0f766e;
  background: rgba(20, 184, 166, 0.12);
  border-color: rgba(20, 184, 166, 0.24);
}

:global([data-theme="light"]) .briefing-section-head h3,
:global([data-theme="light"]) .priority-empty strong,
:global([data-theme="light"]) .audit-trail-item strong,
:global([data-theme="light"]) .jira-insight-card strong,
:global([data-theme="light"]) .jira-insight-count {
  color: #0f172a;
}

:global([data-theme="light"]) .briefing-section-head span,
:global([data-theme="light"]) .briefing-apps-label,
:global([data-theme="light"]) .audit-trail-time {
  color: rgba(71, 85, 105, 0.84);
}

:global([data-theme="light"]) .jira-insight-label,
:global([data-theme="light"]) .jira-insight-stat-copy,
:global([data-theme="light"]) .priority-summary-label,
:global([data-theme="light"]) .briefing-suggestion-label,
:global([data-theme="light"]) .audit-trail-badge,
:global([data-theme="light"]) .audit-trail-state {
  color: #334155;
}

:global([data-theme="light"]) .briefing-suggestion,
:global([data-theme="light"]) .jira-insight-action {
  color: #0f172a;
}

:global([data-theme="light"]) .briefing-suggestion-label,
:global([data-theme="light"]) .audit-trail-badge,
:global([data-theme="light"]) .audit-trail-state {
  background: rgba(241, 245, 249, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.22);
}

:global([data-theme="light"]) .jira-insight-card p,
:global([data-theme="light"]) .priority-empty p,
:global([data-theme="light"]) .audit-trail-item p,
:global([data-theme="light"]) .briefing-suggestion-text {
  color: rgba(15, 23, 42, 0.82);
}

:global([data-theme="light"]) .priority-filter-chip {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(248, 250, 255, 0.96);
  color: rgba(51, 65, 85, 0.94);
}

:global([data-theme="light"]) .priority-filter-chip.active {
  border-color: rgba(99, 102, 241, 0.28);
  background: rgba(99, 102, 241, 0.18);
  color: #3730a3;
}

@media (prefers-color-scheme: light) {
  :global([data-theme="system"]) .briefing-shell {
    --briefing-hero-bg:
      radial-gradient(circle at top left, rgba(251, 191, 36, 0.18), transparent 36%),
      radial-gradient(circle at 82% 18%, rgba(45, 212, 191, 0.12), transparent 26%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(240, 247, 255, 0.96));
    --briefing-hero-border: rgba(148, 163, 184, 0.24);
    --briefing-hero-shadow: 0 12px 28px rgba(148, 163, 184, 0.12);
    --briefing-badge-bg: rgba(251, 191, 36, 0.12);
    --briefing-badge-border: rgba(245, 158, 11, 0.2);
    --briefing-badge-text: #b45309;
    --briefing-date-text: rgba(30, 41, 59, 0.72);
    --briefing-orb-bg: linear-gradient(135deg, rgba(251, 191, 36, 0.16), rgba(45, 212, 191, 0.08));
    --briefing-orb-border: rgba(148, 163, 184, 0.22);
    --briefing-heading: #0f172a;
    --briefing-kicker: rgba(15, 23, 42, 0.78);
    --briefing-summary: rgba(15, 23, 42, 0.68);
    --briefing-stat-bg: rgba(255, 255, 255, 0.84);
    --briefing-stat-border: rgba(148, 163, 184, 0.2);
    --briefing-stat-label: rgba(71, 85, 105, 0.82);
    --briefing-stat-value: #0f172a;
    --briefing-chip-bg: rgba(255, 255, 255, 0.86);
    --briefing-chip-border: rgba(148, 163, 184, 0.18);
    --briefing-chip-text: #1e293b;
    --briefing-panel-bg: rgba(255, 255, 255, 0.96);
    --briefing-panel-border: rgba(148, 163, 184, 0.28);
    --briefing-panel-shadow: 0 14px 34px rgba(148, 163, 184, 0.14);
  }

  :global([data-theme="system"]) .briefing-hero {
    box-shadow: var(--briefing-hero-shadow);
  }

  :global([data-theme="system"]) .priority-summary-card,
  :global([data-theme="system"]) .jira-insight-card,
  :global([data-theme="system"]) .priority-empty,
  :global([data-theme="system"]) .briefing-card-shell,
  :global([data-theme="system"]) .audit-trail-item,
  :global([data-theme="system"]) .briefing-suggestion,
  :global([data-theme="system"]) .priority-filter-chip {
    border-color: rgba(148, 163, 184, 0.28);
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 10px 24px rgba(148, 163, 184, 0.12);
  }

  :global([data-theme="system"]) .jira-insight-card.primary {
    background:
      radial-gradient(circle at top right, rgba(59, 130, 246, 0.12), transparent 38%),
      rgba(241, 247, 255, 0.92);
  }

  :global([data-theme="system"]) .jira-insight-card.org {
    background:
      radial-gradient(circle at top right, rgba(239, 68, 68, 0.12), transparent 38%),
      rgba(255, 245, 245, 0.92);
  }

  :global([data-theme="system"]) .jira-insight-card.blocked {
    background:
      radial-gradient(circle at top right, rgba(245, 158, 11, 0.14), transparent 38%),
      rgba(255, 249, 235, 0.92);
  }

  :global([data-theme="system"]) .jira-insight-card.high-priority {
    background:
      radial-gradient(circle at top right, rgba(168, 85, 247, 0.14), transparent 38%),
      rgba(249, 245, 255, 0.92);
  }

  :global([data-theme="system"]) .briefing-update-pill {
    color: #0f766e;
    background: rgba(20, 184, 166, 0.12);
    border-color: rgba(20, 184, 166, 0.24);
  }

  :global([data-theme="system"]) .briefing-section-head h3,
  :global([data-theme="system"]) .priority-empty strong,
  :global([data-theme="system"]) .audit-trail-item strong,
  :global([data-theme="system"]) .jira-insight-card strong,
  :global([data-theme="system"]) .jira-insight-count {
    color: #0f172a;
  }

  :global([data-theme="system"]) .briefing-section-head span,
  :global([data-theme="system"]) .briefing-apps-label,
  :global([data-theme="system"]) .audit-trail-time {
    color: rgba(71, 85, 105, 0.84);
  }

  :global([data-theme="system"]) .jira-insight-label,
  :global([data-theme="system"]) .jira-insight-stat-copy,
  :global([data-theme="system"]) .priority-summary-label,
  :global([data-theme="system"]) .briefing-suggestion-label,
  :global([data-theme="system"]) .audit-trail-badge,
  :global([data-theme="system"]) .audit-trail-state {
    color: #334155;
  }

  :global([data-theme="system"]) .briefing-suggestion,
  :global([data-theme="system"]) .jira-insight-action {
    color: #0f172a;
  }

  :global([data-theme="system"]) .briefing-suggestion-label,
  :global([data-theme="system"]) .audit-trail-badge,
  :global([data-theme="system"]) .audit-trail-state {
    background: rgba(241, 245, 249, 0.94);
    border: 1px solid rgba(148, 163, 184, 0.22);
  }

  :global([data-theme="system"]) .jira-insight-card p,
  :global([data-theme="system"]) .priority-empty p,
  :global([data-theme="system"]) .audit-trail-item p,
  :global([data-theme="system"]) .briefing-suggestion-text {
    color: rgba(15, 23, 42, 0.82);
  }

  :global([data-theme="system"]) .priority-filter-chip {
    border-color: rgba(148, 163, 184, 0.28);
    background: rgba(248, 250, 255, 0.96);
    color: rgba(51, 65, 85, 0.94);
  }

  :global([data-theme="system"]) .priority-filter-chip.active {
    border-color: rgba(99, 102, 241, 0.28);
    background: rgba(99, 102, 241, 0.18);
    color: #3730a3;
  }
}

@media (max-width: 860px) {
  .briefing-shell {
    width: 100%;
  }

  .briefing-hero {
    padding: 20px;
  }

  .briefing-hero-grid,
  .priority-summary-grid,
  .briefing-dashboard-top,
  .briefing-dashboard-bottom,
  .jira-insight-grid {
    grid-template-columns: 1fr;
  }

  .briefing-jira-shell .jira-insight-grid {
    grid-template-rows: none;
  }

  .briefing-dashboard-top:not(.briefing-dashboard-top-single) > .briefing-feed-shell,
  .briefing-dashboard-top:not(.briefing-dashboard-top-single) > .briefing-jira-shell,
  .briefing-recent-shell .audit-trail-list {
    min-height: 0 !important;
    height: auto !important;
    max-height: none;
  }
}
</style>

<style>
[data-theme="light"] .briefing-shell .briefing-section-head span,
[data-theme="light"] .briefing-shell .briefing-apps-label,
[data-theme="light"] .briefing-shell .audit-trail-time {
  color: rgba(51, 65, 85, 0.84) !important;
}

[data-theme="light"] .briefing-shell .briefing-suggestion,
[data-theme="light"] .briefing-shell .jira-insight-action {
  color: #0f172a !important;
  background: rgba(255, 255, 255, 0.96) !important;
  border-color: rgba(148, 163, 184, 0.28) !important;
  box-shadow: 0 10px 24px rgba(148, 163, 184, 0.12) !important;
}

[data-theme="light"] .briefing-shell .briefing-suggestion-label,
[data-theme="light"] .briefing-shell .briefing-suggestion-text {
  color: rgba(15, 23, 42, 0.84) !important;
}

[data-theme="light"] .briefing-shell .priority-filter-chip {
  color: rgba(51, 65, 85, 0.94) !important;
  background: rgba(248, 250, 255, 0.96) !important;
  border-color: rgba(148, 163, 184, 0.28) !important;
}

[data-theme="light"] .briefing-shell .priority-filter-chip.active {
  color: #3730a3 !important;
  background: rgba(99, 102, 241, 0.18) !important;
  border-color: rgba(99, 102, 241, 0.28) !important;
}

[data-theme="light"] .briefing-shell .audit-trail-badge,
[data-theme="light"] .briefing-shell .audit-trail-state {
  color: #334155 !important;
  background: rgba(241, 245, 249, 0.94) !important;
  border: 1px solid rgba(148, 163, 184, 0.22) !important;
}

@media (prefers-color-scheme: light) {
  [data-theme="system"] .briefing-shell .briefing-section-head span,
  [data-theme="system"] .briefing-shell .briefing-apps-label,
  [data-theme="system"] .briefing-shell .audit-trail-time {
    color: rgba(51, 65, 85, 0.84) !important;
  }

  [data-theme="system"] .briefing-shell .briefing-suggestion,
  [data-theme="system"] .briefing-shell .jira-insight-action {
    color: #0f172a !important;
    background: rgba(255, 255, 255, 0.96) !important;
    border-color: rgba(148, 163, 184, 0.28) !important;
    box-shadow: 0 10px 24px rgba(148, 163, 184, 0.12) !important;
  }

  [data-theme="system"] .briefing-shell .briefing-suggestion-label,
  [data-theme="system"] .briefing-shell .briefing-suggestion-text {
    color: rgba(15, 23, 42, 0.84) !important;
  }

  [data-theme="system"] .briefing-shell .priority-filter-chip {
    color: rgba(51, 65, 85, 0.94) !important;
    background: rgba(248, 250, 255, 0.96) !important;
    border-color: rgba(148, 163, 184, 0.28) !important;
  }

  [data-theme="system"] .briefing-shell .priority-filter-chip.active {
    color: #3730a3 !important;
    background: rgba(99, 102, 241, 0.18) !important;
    border-color: rgba(99, 102, 241, 0.28) !important;
  }

  [data-theme="system"] .briefing-shell .audit-trail-badge,
  [data-theme="system"] .briefing-shell .audit-trail-state {
    color: #334155 !important;
    background: rgba(241, 245, 249, 0.94) !important;
    border: 1px solid rgba(148, 163, 184, 0.22) !important;
  }
}
</style>
