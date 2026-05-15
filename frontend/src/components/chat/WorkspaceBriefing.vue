<template>
  <div class="briefing-shell">
    <section class="today-hero panel">
      <div class="today-hero__top">
        <div class="today-hero__copy">
          <span class="today-hero__eyebrow">Today Briefing</span>
          <h2>{{ heroTitle }}</h2>
          <p class="today-hero__subtitle">Here’s what needs your attention today.</p>
          <p class="today-hero__support">
            OrionAI checked your connected apps and prepared a clear view of messages,
            meetings, documents, follow-ups, and suggested actions.
          </p>
        </div>

        <div class="today-hero__side">
          <div class="today-hero__sync">
            <span>{{ lastSyncLabel }}</span>
            <button
              class="ghost-button"
              type="button"
              :disabled="loading || refreshingDashboard"
              @click="refreshDashboard"
            >
              {{ loading && !dashboard ? 'Loading...' : refreshingDashboard ? 'Refreshing...' : 'Refresh' }}
            </button>
          </div>

          <div class="today-hero__apps">
            <div class="today-hero__apps-head">
              <span class="today-hero__apps-label">Connected apps</span>
              <span class="today-hero__apps-count">
                {{ connectedApps.length }}
              </span>
            </div>

            <div v-if="connectedApps.length" class="today-hero__chips">
              <button
                v-for="app in connectedApps"
                :key="app.id"
                class="app-chip"
                type="button"
                @click="triggerAction(app.action)"
              >
                <img
                  v-if="iconUrlFor(app.id) && !brokenIconIds.has(app.id)"
                  :src="iconUrlFor(app.id)"
                  :alt="app.label || app.id"
                  class="app-chip__img"
                  loading="lazy"
                  @error="brokenIconIds.add(app.id)"
                />
                <span v-else class="app-chip__emoji">{{ fallbackEmojiFor(app.id) }}</span>
                <span>{{ app.label }}</span>
              </button>
            </div>

            <p v-else class="today-hero__empty-apps">
              Connect Gmail, Calendar, Docs, Sheets, or messaging apps to build your daily view.
            </p>
          </div>
        </div>
      </div>

      <div class="today-hero__stats">
        <article
          v-for="stat in heroStats"
          :key="stat.label"
          class="hero-stat"
        >
          <span class="hero-stat__label">{{ stat.label }}</span>
          <strong class="hero-stat__value">{{ stat.value }}</strong>
          <p class="hero-stat__hint">{{ stat.hint }}</p>
        </article>
      </div>

      <p v-if="allHeroStatsZero" class="today-hero__note">
        No urgent items found yet.
      </p>
    </section>

    <div class="today-layout">
      <div class="today-main">
        <section class="dashboard-section panel">
          <div class="section-head">
            <div>
              <h3>Today’s Priorities</h3>
              <p>Top items from your connected apps.</p>
            </div>
            <span class="section-meta">{{ prioritiesMeta }}</span>
          </div>

          <div v-if="briefingUpdateLabel" class="update-row">
            <button class="update-pill" type="button" @click="applyPendingDashboard">
              {{ briefingUpdateLabel }}
            </button>
          </div>

          <div v-if="filters.length > 1" class="filter-row">
            <button
              v-for="filter in filters"
              :key="filter.id"
              class="filter-chip"
              :class="{ active: activeFilter === filter.id }"
              type="button"
              @click="activeFilter = filter.id"
            >
              <span>{{ filter.label }}</span>
              <span v-if="Number(filter.count || 0) > 0" class="filter-chip__count">
                {{ filterCountLabel(filter.count) }}
              </span>
            </button>
          </div>

          <div v-if="loading && !dashboard" class="section-empty">
            <strong>Preparing your priorities...</strong>
            <p>OrionAI is reviewing messages, meetings, and follow-ups from your connected apps.</p>
          </div>

          <div v-else-if="hasPriorityCards" class="priority-grid">
            <PriorityFeedCard
              v-for="item in displayedPriorityItems"
              :key="item.id"
              :item="item"
              :busy="pendingItemId === item.id"
              :request-reply-draft="requestReplyDraft"
              :send-reply="sendPriorityReply"
              :show-approval-suggestion="activeFilter === ACTION_STATES.NEEDS_APPROVAL"
              @card-opened="recordOpenTelemetry"
              @approve="approveItem"
              @dismiss="dismissItem"
              @snooze="snoozeItem"
              @run-action="runPrimaryAction"
              @run-secondary-action="runSecondaryAction"
            />

            <article
              v-for="card in prioritySuggestionCards"
              :key="card.id"
              class="priority-card priority-card--suggestion"
            >
              <div class="card-top">
                <span class="source-badge source-badge--suggestion">
                  <span class="source-badge__emoji">✨</span>
                  <span>Suggestion</span>
                </span>
              </div>
              <h4>{{ card.title }}</h4>
              <p class="card-copy">{{ card.description }}</p>
              <div class="card-actions">
                <button class="action-button" type="button" @click="triggerAction(card.action)">
                  {{ card.actionLabel }}
                </button>
              </div>
            </article>
          </div>

          <div v-else class="section-empty">
            <strong>No urgent items found yet.</strong>
            <p>Connect more apps to unlock a richer daily priority view.</p>
          </div>
        </section>

        <section ref="messagesSectionRef" class="dashboard-section panel">
          <div class="section-head">
            <div>
              <h3>Important Messages</h3>
              <p>Messages that look like they need your attention.</p>
            </div>
            <span class="section-meta">{{ importantMessagesMeta }}</span>
          </div>

          <template v-if="hasMessageAppsConnected">
            <div v-if="messageGroups.length" class="stacked-groups">
              <div
                v-for="group in messageGroups"
                :key="group.key"
                class="group-block"
              >
                <div class="group-head">
                  <h4>{{ group.title }}</h4>
                  <span>{{ group.items.length }}</span>
                </div>

                <div class="list-grid">
                  <article
                    v-for="item in group.items"
                    :key="`${group.key}:${item.id}`"
                    class="list-card"
                  >
                    <div class="card-top">
                      <span class="source-badge">
                        <img
                          v-if="iconUrlFor(item.sourceApp) && !brokenIconIds.has(item.sourceApp)"
                          :src="iconUrlFor(item.sourceApp)"
                          :alt="item.sourceLabel || item.sourceApp || 'App'"
                          class="source-badge__img"
                          loading="lazy"
                          @error="brokenIconIds.add(item.sourceApp)"
                        />
                        <span v-else class="source-badge__emoji">
                          {{ fallbackEmojiFor(item.sourceApp) }}
                        </span>
                        <span>{{ item.sourceLabel || item.sourceApp || 'App' }}</span>
                      </span>
                      <span class="list-card__time">{{ itemTimeline(item) }}</span>
                    </div>

                    <h5>{{ item.title }}</h5>
                    <p class="card-copy">{{ priorityReasonLine(item) }}</p>

                    <div class="card-actions">
                      <button class="action-button" type="button" @click="openItem(item)">
                        Open
                      </button>
                      <button
                        v-if="canDraftReply(item)"
                        class="action-button action-button--subtle"
                        type="button"
                        @click="draftReply(item)"
                      >
                        Draft reply
                      </button>
                      <button
                        class="action-button action-button--subtle"
                        type="button"
                        :disabled="pendingItemId === item.id"
                        @click="snoozeDefault(item)"
                      >
                        Snooze
                      </button>
                      <button
                        class="action-button action-button--subtle"
                        type="button"
                        :disabled="pendingItemId === item.id"
                        @click="markHandled(item)"
                      >
                        Mark handled
                      </button>
                    </div>
                  </article>
                </div>
              </div>
            </div>

            <div v-else class="section-empty">
              <strong>No important messages found yet.</strong>
              <p>OrionAI will show important messages here as they appear.</p>
            </div>
          </template>

          <div v-else class="section-empty">
            <strong>No message apps connected yet.</strong>
            <p>Connect Gmail, WhatsApp, Telegram, or Slack to find important messages.</p>
            <button
              class="action-button"
              type="button"
              @click="triggerAction({ kind: 'integrations', focusType: 'gmail' })"
            >
              Open integrations
            </button>
          </div>
        </section>

        <section ref="documentsSectionRef" class="dashboard-section panel">
          <div class="section-head">
            <div>
              <h3>Bills &amp; Documents</h3>
              <p>Recent documents, finance-related items, and useful file context.</p>
            </div>
            <span class="section-meta">{{ documentsMeta }}</span>
          </div>

          <div v-if="documentsLoading" class="section-empty">
            <strong>Checking your latest documents...</strong>
            <p>Pulling recent files from your connected Google apps.</p>
          </div>

          <template v-else-if="hasDocumentAppsConnected">
            <div v-if="documentCards.length" class="list-grid documents-grid">
              <article
                v-for="item in documentCards"
                :key="item.id"
                class="list-card documents-card"
              >
                <div class="card-top">
                  <span class="source-badge">
                    <img
                      v-if="iconUrlFor(item.sourceApp) && !brokenIconIds.has(item.sourceApp)"
                      :src="iconUrlFor(item.sourceApp)"
                      :alt="item.sourceLabel || item.sourceApp || 'App'"
                      class="source-badge__img"
                      loading="lazy"
                      @error="brokenIconIds.add(item.sourceApp)"
                    />
                    <span v-else class="source-badge__emoji">
                      {{ fallbackEmojiFor(item.sourceApp) }}
                    </span>
                    <span>{{ item.sourceLabel }}</span>
                  </span>

                  <span class="status-pill status-pill--soft">
                    {{ item.kindLabel }}
                  </span>
                </div>

                <h5>{{ item.title }}</h5>
                <p class="card-copy">{{ item.reason }}</p>
                <p class="card-meta">{{ itemTimeline(item) }}</p>

                <div class="card-actions">
                  <button class="action-button" type="button" @click="triggerAction(item.action)">
                    Open
                  </button>
                </div>
              </article>
            </div>

            <div v-else class="section-empty">
              <strong>No documents or bills found yet.</strong>
              <p>OrionAI will show documents and bills here.</p>
            </div>
          </template>

          <div v-else class="section-empty">
            <strong>No document sources connected yet.</strong>
            <p>Connect Gmail, Google Docs, or Google Sheets to track bills, documents, receipts, and renewals.</p>
            <button
              class="action-button"
              type="button"
              @click="triggerAction({ kind: 'integrations', focusType: 'google_docs' })"
            >
              Open integrations
            </button>
          </div>
        </section>

        <section ref="followUpsSectionRef" class="dashboard-section panel">
          <div class="section-head">
            <div>
              <h3>Follow-Ups</h3>
              <p>Things you said you would revisit, reply to later, or close out.</p>
            </div>
            <span class="section-meta">{{ followUpsMeta }}</span>
          </div>

          <div v-if="followUpItems.length" class="list-grid">
            <article
              v-for="item in followUpItems"
              :key="item.id"
              class="list-card"
            >
              <div class="card-top">
                <span class="source-badge">
                  <img
                    v-if="iconUrlFor(item.sourceApp) && !brokenIconIds.has(item.sourceApp)"
                    :src="iconUrlFor(item.sourceApp)"
                    :alt="item.sourceLabel || item.sourceApp || 'App'"
                    class="source-badge__img"
                    loading="lazy"
                    @error="brokenIconIds.add(item.sourceApp)"
                  />
                  <span v-else class="source-badge__emoji">
                    {{ fallbackEmojiFor(item.sourceApp) }}
                  </span>
                  <span>{{ item.sourceLabel || item.sourceApp || 'App' }}</span>
                </span>

                <span class="status-pill status-pill--attention">
                  {{ priorityStatusLabel(item) }}
                </span>
              </div>

              <h5>{{ item.title }}</h5>
              <p class="card-copy">{{ priorityReasonLine(item) }}</p>
              <p class="card-meta">{{ itemTimeline(item) }}</p>

              <div class="card-actions">
                <button class="action-button" type="button" @click="createReminder(item)">
                  Create reminder
                </button>
                <button
                  class="action-button action-button--subtle"
                  type="button"
                  :disabled="pendingItemId === item.id"
                  @click="snoozeDefault(item)"
                >
                  Snooze
                </button>
                <button class="action-button action-button--subtle" type="button" @click="openItem(item)">
                  Open source
                </button>
                <button
                  class="action-button action-button--subtle"
                  type="button"
                  :disabled="pendingItemId === item.id"
                  @click="markHandled(item)"
                >
                  Mark handled
                </button>
              </div>
            </article>
          </div>

          <div v-else class="section-empty">
            <strong>No follow-ups found yet.</strong>
            <p>OrionAI will show follow-ups here.</p>
          </div>
        </section>
      </div>

      <aside class="today-rail">
        <section v-if="hasJiraPanel" class="dashboard-section panel jira-panel">
          <div class="section-head jira-panel__head">
            <h3>Jira Overdue Insight</h3>
            <span class="section-meta">{{ jiraInsight.definition }}</span>
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
              <p>Personally assigned Jira work, with overdue tickets called out separately.</p>
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
              <p>Overall overdue count in the connected Jira workspace scope.</p>
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
              <p>Overdue tickets already marked high or highest priority.</p>
            </article>
          </div>
        </section>

        <section class="dashboard-section panel">
          <div class="section-head">
            <div>
              <h3>Suggested Next Actions</h3>
              <p>Useful actions based on what OrionAI can see right now.</p>
            </div>
            <span class="section-meta">{{ suggestedActions.length }}</span>
          </div>

          <div class="suggestion-list">
            <button
              v-for="suggestion in suggestedActions"
              :key="suggestion.id"
              class="suggestion-card"
              type="button"
              @click="triggerAction(suggestion.action)"
            >
              <span class="suggestion-card__title">{{ suggestion.title }}</span>
              <span class="suggestion-card__copy">{{ suggestion.description }}</span>
              <span class="suggestion-card__cta">{{ suggestion.actionLabel }}</span>
            </button>
          </div>
        </section>

        <section ref="focusAreasSectionRef" class="dashboard-section panel">
          <div class="section-head">
            <div>
              <h3>Personalize OrionAI</h3>
              <p>Tell OrionAI what to pay more attention to. You can change this anytime.</p>
            </div>
          </div>

          <div v-if="showSavedFocusAreas && !focusAreasEditing" class="focus-summary">
            <div class="focus-chip-list">
              <span
                v-for="area in savedFocusAreas"
                :key="area"
                class="focus-chip focus-chip--selected"
              >
                {{ area }}
              </span>
            </div>

            <div class="focus-actions">
              <button class="action-button" type="button" @click="beginFocusAreasEdit">
                Edit priorities
              </button>
            </div>
          </div>

          <div v-else class="focus-editor">
            <div class="focus-chip-list">
              <button
                v-for="area in FOCUS_AREA_OPTIONS"
                :key="area"
                class="focus-chip"
                :class="{ 'focus-chip--selected': focusAreaDraft.includes(area) }"
                type="button"
                @click="toggleFocusArea(area)"
              >
                {{ area }}
              </button>
            </div>

            <div class="focus-actions">
              <button
                class="action-button"
                type="button"
                :disabled="focusAreasSaving"
                @click="saveFocusAreasSelection"
              >
                {{ focusAreasSaving ? 'Saving...' : 'Save priorities' }}
              </button>
              <button
                class="action-button action-button--subtle"
                type="button"
                :disabled="focusAreasSaving"
                @click="skipFocusAreas"
              >
                Skip
              </button>
              <button
                v-if="showSavedFocusAreas"
                class="action-button action-button--subtle"
                type="button"
                :disabled="focusAreasSaving"
                @click="cancelFocusAreasEdit"
              >
                Cancel
              </button>
            </div>
          </div>

          <p
            v-if="focusAreaNotice.text"
            class="section-note"
            :class="{ 'section-note--error': focusAreaNotice.type === 'error' }"
          >
            {{ focusAreaNotice.text }}
          </p>
        </section>

        <section class="dashboard-section panel panel--compact">
          <div class="section-head">
            <div>
              <h3>Recent Actions</h3>
              <p>Light audit trail.</p>
            </div>
            <span class="section-meta">{{ recentActionEntries.length }}</span>
          </div>

          <div v-if="recentActionEntries.length" class="recent-actions">
            <article
              v-for="entry in recentActionEntries"
              :key="entry.id"
              class="recent-action"
            >
              <div class="card-top">
                <span class="source-badge">
                  <img
                    v-if="iconUrlFor(entry.sourceApp) && !brokenIconIds.has(entry.sourceApp)"
                    :src="iconUrlFor(entry.sourceApp)"
                    :alt="entry.sourceLabel || entry.sourceApp || 'App'"
                    class="source-badge__img"
                    loading="lazy"
                    @error="brokenIconIds.add(entry.sourceApp)"
                  />
                  <span v-else class="source-badge__emoji">
                    {{ fallbackEmojiFor(entry.sourceApp) }}
                  </span>
                  <span>{{ entry.sourceLabel }}</span>
                </span>

                <span class="status-pill status-pill--soft">
                  {{ actionStateLabel(entry.action) }}
                </span>
              </div>

              <strong>{{ entry.title }}</strong>
              <p v-if="entry.note" class="card-copy">{{ entry.note }}</p>
              <p class="card-meta">{{ formatActionTime(entry.createdAt) }}</p>
            </article>
          </div>

          <div v-else class="section-empty section-empty--compact">
            <strong>No actions handled yet.</strong>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import api, { agentAPI, googleDocsAPI, googleSheetsAPI, onboardingAPI } from '../../services/api'
import { store, setUser } from '../../stores/app'
import PriorityFeedCard from '../home/PriorityFeedCard.vue'
import { emitCommunicationPriorityRefresh } from '../../composables/useCommunicationActions'
import { useWebSocket } from '../../composables/useWebSocket'
import { getAppFallbackEmoji, getAppIconUrl, getAppLabel } from '../../utils/appIcons'

const emit = defineEmits(['usePrompt'])

const ACTION_STATES = Object.freeze({
  WAITING_ON_YOUR_REPLY: 'waiting_on_your_reply',
  NEEDS_APPROVAL: 'needs_approval',
  NEEDS_FOLLOW_UP: 'needs_follow_up',
  WAITING_ON_OTHERS: 'waiting_on_others',
})

const LIVE_CHAT_SOURCE_APPS = new Set(['signal', 'telegram', 'slack', 'whatsapp'])
const MESSAGE_SOURCE_APPS = new Set(['gmail', 'slack', 'telegram', 'signal', 'whatsapp'])
const DOCUMENT_SOURCE_APPS = new Set(['gmail', 'google_docs', 'google_sheets'])
const DOCUMENT_RULES = [
  { key: 'bill', label: 'Bill due soon', pattern: /\b(invoice|bill|statement|payment due|balance due)\b/i },
  { key: 'receipt', label: 'Receipt received', pattern: /\b(receipt|paid|payment confirmation)\b/i },
  { key: 'renewal', label: 'Renewal / date item', pattern: /\b(renewal|renews|subscription|expires|expiry|expiring)\b/i },
]
const FOCUS_AREA_OPTIONS = [
  'My Day',
  'Messages',
  'Bills & Documents',
  'Study & Learning',
  'Career & Interviews',
  'Home & Family',
  'Customers & Payments',
  'Clients & Projects',
  'Classes & Students',
  'Content & Ideas',
  'Team & Work',
  'Engineering & Releases',
]
const MESSAGE_GROUP_DEFINITIONS = [
  { key: ACTION_STATES.WAITING_ON_YOUR_REPLY, title: 'Needs your reply' },
  { key: ACTION_STATES.NEEDS_APPROVAL, title: 'Needs approval' },
  { key: ACTION_STATES.NEEDS_FOLLOW_UP, title: 'Needs follow-up' },
  { key: ACTION_STATES.WAITING_ON_OTHERS, title: 'Waiting on others' },
]

const loading = ref(true)
const dashboard = ref(null)
const items = ref([])
const auditTrail = ref([])
const activeFilter = ref('all')
const pendingItemId = ref(null)
const pendingDashboard = ref(null)
const briefingUpdateLabel = ref('')
const brokenIconIds = reactive(new Set())
const replyDraftCache = new Map()
const replyDraftRequests = new Map()
const documentsLoading = ref(false)
const fetchedDocuments = ref([])
const focusAreaDraft = ref([])
const focusAreasSaving = ref(false)
const focusAreasEditing = ref(false)
const focusAreaNotice = ref({ type: '', text: '' })
const messagesSectionRef = ref(null)
const documentsSectionRef = ref(null)
const followUpsSectionRef = ref(null)
const focusAreasSectionRef = ref(null)
const refreshingDashboard = ref(false)
const { unreadByApp, refreshUnreadState, acknowledgeConversation } = useWebSocket()
let liveRefreshTimer = null
let latestLoadRequestId = 0
let latestDocumentsRequestId = 0

const dailyBriefing = computed(() => dashboard.value?.dailyBriefing || {})
const prioritySummary = computed(() => dashboard.value?.prioritySummary || {})
const connectedApps = computed(() => dailyBriefing.value.connectedApps || [])
const connectedAppIds = computed(() => connectedApps.value.map((app) => String(app.id || '').trim()).filter(Boolean))
const connectedAppSignature = computed(() => [...connectedAppIds.value].sort().join('|'))
const currentTimeOfDay = computed(() => {
  if (dailyBriefing.value.timeOfDay) return dailyBriefing.value.timeOfDay
  const hours = new Date().getHours()
  if (hours < 12) return 'morning'
  if (hours < 17) return 'afternoon'
  return 'evening'
})
const displayName = computed(() =>
  store.user?.displayName ||
  store.user?.fullName ||
  store.user?.username ||
  'there'
)
const heroTitle = computed(() => `Good ${currentTimeOfDay.value}, ${displayName.value}`)
const hasJiraPanel = computed(() => Boolean(dailyBriefing.value.jiraInsight))
const jiraInsight = computed(() => dailyBriefing.value.jiraInsight || null)
const savedFocusAreas = computed(() => {
  const areas = Array.isArray(store.user?.onboarding?.focusAreas)
    ? store.user.onboarding.focusAreas
    : []
  return areas.filter(Boolean)
})
const showSavedFocusAreas = computed(() => savedFocusAreas.value.length > 0)
const messageAppsConnected = computed(() =>
  connectedAppIds.value.some((id) => MESSAGE_SOURCE_APPS.has(id))
)
const documentAppsConnected = computed(() =>
  connectedAppIds.value.some((id) => DOCUMENT_SOURCE_APPS.has(id))
)
const hasMessageAppsConnected = computed(() => messageAppsConnected.value)
const hasDocumentAppsConnected = computed(() => documentAppsConnected.value)

const filterDefinitions = computed(() => dashboard.value?.priorityFeed?.filters?.map((filter) => ({
  id: filter.id,
  label: filter.label,
})) || [
  { id: 'all', label: 'All' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'communication', label: 'Messages' },
  { id: ACTION_STATES.NEEDS_APPROVAL, label: 'Approvals' },
  { id: ACTION_STATES.NEEDS_FOLLOW_UP, label: 'Follow-ups' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'tasks', label: 'Tasks' },
])

function getFeedItemActivityTime(item = {}) {
  const candidates = [
    item?.meta?.latestMessageAt,
    item?.meta?.latestInboundAt,
    item?.meta?.lastMessageAt,
    item?.meta?.updatedAt,
    item?.meta?.startsAt,
    item?.meta?.dueDate,
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
  if (!liveItems.length) return true

  return liveItems.some((liveItem) => liveUnreadItemMatchesPriorityItem(liveItem, item))
}

const visiblePriorityItems = computed(() =>
  sortFeedItemsByActivity(
    items.value.filter((item) => shouldRenderPriorityItem(item))
  )
)

function countItemsForFilter(feedItems = [], filterId = 'all') {
  // Jira tasks have their own "Tasks" filter — don't include them in the
  // "All" count or list so the default view stays focused.
  if (filterId === 'all') {
    return feedItems.filter((item) => item.category !== 'tasks').length
  }
  if (filterId === 'urgent') {
    // Jira tickets live under the dedicated "Tasks" filter — don't recount
    // them here even if their priority is High.
    return feedItems.filter(
      (item) =>
        item.priority === 'High' &&
        item.category !== 'meetings' &&
        item.category !== 'tasks'
    ).length
  }
  if (filterId === 'communication') {
    return feedItems.filter((item) => item.category === 'communication').length
  }
  if (Object.values(ACTION_STATES).includes(filterId)) {
    return feedItems.filter((item) => effectiveMessageStateKey(item) === filterId).length
  }
  return feedItems.filter((item) => item.category === filterId).length
}

const filters = computed(() =>
  filterDefinitions.value
    .map((filter) => ({
      ...filter,
      count: countItemsForFilter(visiblePriorityItems.value, filter.id),
    }))
    .filter(
      (filter) =>
        filter.id === 'all' ||
        filter.id === activeFilter.value ||
        Number(filter.count || 0) > 0
    )
)

const filteredItems = computed(() => {
  const sortedItems = visiblePriorityItems.value
  if (activeFilter.value === 'all') {
    // Jira tasks live under the dedicated "Tasks" filter — keep "All" tidy.
    return sortedItems.filter((item) => item.category !== 'tasks')
  }
  if (activeFilter.value === 'urgent') {
    // Jira tasks are reachable via the dedicated "Tasks" filter, so keep
    // Urgent focused on communications/meetings-adjacent items only.
    return sortedItems.filter(
      (item) =>
        item.priority === 'High' &&
        item.category !== 'meetings' &&
        item.category !== 'tasks'
    )
  }
  if (Object.values(ACTION_STATES).includes(activeFilter.value)) {
    return sortedItems.filter((item) => effectiveMessageStateKey(item) === activeFilter.value)
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

function isToday(value) {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  return date.toDateString() === now.toDateString()
}

function countDueToday(feedItems = []) {
  return feedItems.filter((item) => {
    if (item?.meta?.startsAt) return isToday(item.meta.startsAt)
    if (item?.meta?.dueDate) return isToday(item.meta.dueDate)
    return /\bdue today\b|\btoday\b/i.test(String(item?.reason || '')) && item.category !== 'communication'
  }).length
}

const heroCounts = computed(() => ({
  waitingOnYou: Number(
    prioritySummary.value.waitingOnYouCount ||
    visiblePriorityItems.value.filter((item) => effectiveMessageStateKey(item) === ACTION_STATES.WAITING_ON_YOUR_REPLY).length
  ),
  dueToday: countDueToday(visiblePriorityItems.value),
  followUps: Number(
    prioritySummary.value.followUpCount ||
    visiblePriorityItems.value.filter((item) => {
      const state = actionStateValue(item)
      return state === ACTION_STATES.NEEDS_FOLLOW_UP || state === ACTION_STATES.WAITING_ON_OTHERS
    }).length
  ),
}))

const heroStats = computed(() => [
  {
    label: 'Waiting on you',
    value: String(heroCounts.value.waitingOnYou || 0),
    hint: heroCounts.value.waitingOnYou ? 'Messages and tasks that still need a move from you.' : 'No urgent items found yet.',
  },
  {
    label: 'Due today',
    value: String(heroCounts.value.dueToday || 0),
    hint: heroCounts.value.dueToday ? 'Meetings and due items that land today.' : 'Nothing due today yet.',
  },
  {
    label: 'Follow-ups',
    value: String(heroCounts.value.followUps || 0),
    hint: heroCounts.value.followUps ? 'Pending follow-ups and waiting-on-others threads.' : 'No follow-ups queued yet.',
  },
])

const allHeroStatsZero = computed(() =>
  heroStats.value.every((stat) => Number(stat.value || 0) === 0)
)

const displayedPriorityItems = computed(() => filteredItems.value.slice(0, 30))
const hasPriorityCards = computed(() =>
  displayedPriorityItems.value.length > 0 || prioritySuggestionCards.value.length > 0
)
const prioritiesMeta = computed(() => {
  const count = displayedPriorityItems.value.length
  return `${count} ${count === 1 ? 'item' : 'items'}`
})

function buildSuggestionCard(id, title, description, action, actionLabel) {
  return { id, title, description, action, actionLabel }
}

const prioritySuggestionCards = computed(() => {
  if (displayedPriorityItems.value.length >= 2) return []

  const cards = []

  if (!messageAppsConnected.value) {
    cards.push(
      buildSuggestionCard(
        'priority-connect-messages',
        'Connect Gmail or messaging apps',
        'Unlock more daily priorities from reply-needed emails and chats.',
        { kind: 'integrations', focusType: 'gmail' },
        'Open integrations'
      )
    )
  }

  if (!documentAppsConnected.value) {
    cards.push(
      buildSuggestionCard(
        'priority-connect-docs',
        'Connect Docs or Sheets',
        'Pull documents, receipts, and bill-related files into your daily view.',
        { kind: 'integrations', focusType: 'google_docs' },
        'Connect apps'
      )
    )
  }

  if (!showSavedFocusAreas.value) {
    cards.push(
      buildSuggestionCard(
        'priority-focus-areas',
        'Personalize OrionAI priorities',
        'Tell OrionAI what matters most so your dashboard feels more personal.',
        { kind: 'focus_areas' },
        'Choose focus areas'
      )
    )
  }

  if (!cards.length) {
    cards.push(
      buildSuggestionCard(
        'priority-ask-orion',
        'Ask OrionAI anything',
        'Use the chat box below to plan your day, summarize messages, or draft your next move.',
        {
          kind: 'prompt',
          prompt: 'Help me decide what needs my attention first today.',
          mode: 'chat',
        },
        'Ask OrionAI'
      )
    )
  }

  return cards.slice(0, displayedPriorityItems.value.length ? 1 : 2)
})

function actionStateValue(item = {}) {
  return String(item?.actionState || item?.meta?.actionState || '').trim().toLowerCase()
}

function effectiveMessageStateKey(item = {}) {
  const state = actionStateValue(item)
  if (state) return state
  return isMessageItem(item) ? ACTION_STATES.WAITING_ON_YOUR_REPLY : ''
}

function isMessageItem(item = {}) {
  if (MESSAGE_SOURCE_APPS.has(String(item?.sourceApp || '').toLowerCase())) return true
  return item?.category === 'communication'
}

const messageItems = computed(() =>
  visiblePriorityItems.value.filter((item) => isMessageItem(item))
)

const messageGroups = computed(() =>
  MESSAGE_GROUP_DEFINITIONS
    .map((group) => ({
      ...group,
      items: messageItems.value
        .filter((item) => effectiveMessageStateKey(item) === group.key)
        .slice(0, 3),
    }))
    .filter((group) => group.items.length > 0)
)

const importantMessagesMeta = computed(() => {
  const count = messageItems.value.length
  return `${count} ${count === 1 ? 'message' : 'messages'}`
})

function detectDocumentKind(text = '') {
  for (const rule of DOCUMENT_RULES) {
    if (rule.pattern.test(String(text || ''))) return rule
  }
  return { key: 'document', label: 'Document received' }
}

function buildModuleAction(label, module, context = null) {
  return {
    label,
    kind: 'module',
    module,
    context: context || undefined,
  }
}

function createDocumentCardFromDriveItem(sourceApp, payload = {}) {
  const kind = detectDocumentKind(payload.title)
  const owner = payload.ownerName || payload.ownerEmail || 'your workspace'
  const timeLabel =
    sourceApp === 'google_sheets'
      ? 'Updated in Google Sheets'
      : 'Updated in Google Docs'

  return {
    id: `${sourceApp}:${payload.documentId || payload.spreadsheetId || payload.title}`,
    sourceApp,
    sourceLabel: getAppLabel(sourceApp),
    title: payload.title || 'Untitled',
    kindKey: kind.key,
    kindLabel: kind.label,
    reason: `${timeLabel} by ${owner}.`,
    occurredAt: payload.modifiedTime || null,
    action:
      sourceApp === 'google_sheets'
        ? buildModuleAction('Open Google Sheets', 'google_sheets', {
            spreadsheetId: payload.spreadsheetId,
          })
        : buildModuleAction('Open Google Docs', 'google_docs', {
            documentId: payload.documentId,
          }),
  }
}

function buildDocumentCardFromGmailItem(item = {}) {
  const text = `${item.title || ''} ${item.meta?.snippet || ''} ${item.meta?.previewText || ''}`
  const kind = detectDocumentKind(text)
  const from = item.meta?.from || item.meta?.participantLabel || 'Gmail'

  return {
    id: `gmail-doc:${item.id}`,
    sourceApp: 'gmail',
    sourceLabel: 'Gmail',
    title: item.title,
    kindKey: kind.key,
    kindLabel: kind.label,
    reason: `${kind.label} from ${from}.`,
    occurredAt: item.meta?.latestMessageAt || item.meta?.updatedAt || null,
    action: getOpenAction(item) || item.action,
  }
}

function compareOccurredDesc(left, right) {
  const leftTime = new Date(left?.occurredAt || 0).getTime()
  const rightTime = new Date(right?.occurredAt || 0).getTime()
  return rightTime - leftTime
}

const gmailDocumentCards = computed(() =>
  visiblePriorityItems.value
    .filter((item) => String(item?.sourceApp || '').toLowerCase() === 'gmail')
    .filter((item) => detectDocumentKind(`${item.title || ''} ${item.meta?.snippet || ''} ${item.meta?.previewText || ''}`).key !== 'document')
    .map((item) => buildDocumentCardFromGmailItem(item))
    .slice(0, 3)
)

const documentCards = computed(() => {
  const merged = [...fetchedDocuments.value, ...gmailDocumentCards.value]
  const seen = new Set()

  return merged
    .sort(compareOccurredDesc)
    .filter((item) => {
      const key = `${item.sourceApp}:${item.title}:${item.occurredAt || ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 6)
})

const documentsMeta = computed(() => {
  const count = documentCards.value.length
  return `${count} ${count === 1 ? 'item' : 'items'}`
})

const followUpItems = computed(() =>
  visiblePriorityItems.value
    .filter((item) => {
      const state = actionStateValue(item)
      return state === ACTION_STATES.NEEDS_FOLLOW_UP || state === ACTION_STATES.WAITING_ON_OTHERS
    })
    .slice(0, 6)
)

const followUpsMeta = computed(() => {
  const count = followUpItems.value.length
  return `${count} ${count === 1 ? 'item' : 'items'}`
})

function pushUniqueSuggestion(list, suggestion) {
  if (!list.some((entry) => entry.id === suggestion.id)) {
    list.push(suggestion)
  }
}

const suggestedActions = computed(() => {
  const suggestions = []
  const topMeeting = visiblePriorityItems.value.find((item) => item.category === 'meetings')
  const topMessage = messageItems.value[0]
  const topDocument = documentCards.value[0]

  if (topMeeting) {
    pushUniqueSuggestion(suggestions, {
      id: 'suggestion-meeting',
      title: 'Prepare for upcoming meeting',
      description: `${topMeeting.title} is on your radar today.`,
      action: topMeeting.action || getOpenAction(topMeeting),
      actionLabel: topMeeting.action?.label || 'Prep now',
    })
  }

  if (topMessage) {
    pushUniqueSuggestion(suggestions, {
      id: 'suggestion-messages',
      title: 'Review important messages',
      description: `${messageItems.value.length} message${messageItems.value.length === 1 ? '' : 's'} may need a reply, approval, or follow-up.`,
      action: { kind: 'scroll', target: 'messages' },
      actionLabel: 'View messages',
    })
  } else if (!messageAppsConnected.value) {
    pushUniqueSuggestion(suggestions, {
      id: 'suggestion-connect-gmail',
      title: 'Connect Gmail to find reply-needed emails',
      description: 'Bring inbox context into OrionAI so it can find the messages that need you.',
      action: { kind: 'integrations', focusType: 'gmail' },
      actionLabel: 'Open integrations',
    })
  }

  if (topDocument) {
    pushUniqueSuggestion(suggestions, {
      id: 'suggestion-docs',
      title: 'Review recent documents',
      description: `${topDocument.title} is one of the latest files OrionAI found.`,
      action: { kind: 'scroll', target: 'documents' },
      actionLabel: 'View documents',
    })
  } else if (!documentAppsConnected.value) {
    pushUniqueSuggestion(suggestions, {
      id: 'suggestion-connect-docs',
      title: 'Connect Docs or Sheets',
      description: 'Bring files into OrionAI to spot recent documents, receipts, and due items.',
      action: { kind: 'integrations', focusType: 'google_docs' },
      actionLabel: 'Connect apps',
    })
  }

  if (followUpItems.value.length) {
    pushUniqueSuggestion(suggestions, {
      id: 'suggestion-followups',
      title: 'Clear follow-ups',
      description: `${followUpItems.value.length} follow-up item${followUpItems.value.length === 1 ? '' : 's'} still look active.`,
      action: { kind: 'scroll', target: 'followups' },
      actionLabel: 'View follow-ups',
    })
  }

  if (!showSavedFocusAreas.value) {
    pushUniqueSuggestion(suggestions, {
      id: 'suggestion-focus-areas',
      title: 'Personalize OrionAI priorities',
      description: 'Choose what OrionAI should pay more attention to.',
      action: { kind: 'focus_areas' },
      actionLabel: 'Choose focus areas',
    })
  }

  if (connectedApps.value.length < 3) {
    pushUniqueSuggestion(suggestions, {
      id: 'suggestion-connect-more',
      title: 'Connect more apps',
      description: 'Add more context now, or come back later from Integrations.',
      action: { kind: 'integrations', focusType: null },
      actionLabel: 'Open integrations',
    })
  }

  pushUniqueSuggestion(suggestions, {
    id: 'suggestion-ask-orion',
    title: 'Ask OrionAI anything',
    description: 'Get help planning the day, summarizing updates, or drafting your next move.',
    action: {
      kind: 'prompt',
      prompt: 'Help me decide what needs my attention first today.',
      mode: 'chat',
    },
    actionLabel: 'Open chat',
  })

  return suggestions.slice(0, 5)
})

const recentActionEntries = computed(() => auditTrail.value.slice(0, 3))

function iconUrlFor(appKey = '') {
  return getAppIconUrl(appKey)
}

function fallbackEmojiFor(appKey = '') {
  return getAppFallbackEmoji(appKey)
}

function filterCountLabel(value) {
  const count = Number(value || 0)
  if (count <= 0) return ''
  return count > 9 ? '9+' : String(count)
}

function relativeTimeFromNow(value) {
  if (!value) return 'just now'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'just now'

  const deltaMinutes = Math.round((Date.now() - timestamp) / 60000)
  if (deltaMinutes <= 1) return 'just now'
  if (deltaMinutes < 60) return `${deltaMinutes} min ago`

  const deltaHours = Math.round(deltaMinutes / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`

  const deltaDays = Math.round(deltaHours / 24)
  if (deltaDays === 1) return 'yesterday'
  if (deltaDays < 7) return `${deltaDays}d ago`

  try {
    return new Date(value).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return 'recently'
  }
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

const lastSyncLabel = computed(() => {
  const value = dashboard.value?.lastSyncAt || dashboard.value?.generatedAt
  return value ? `Last checked ${relativeTimeFromNow(value)}` : 'Ready when you are'
})

function priorityStatusLabel(item = {}) {
  const state = actionStateValue(item)
  if (state === ACTION_STATES.WAITING_ON_YOUR_REPLY) return 'Needs your reply'
  if (state === ACTION_STATES.NEEDS_APPROVAL) return 'Approval needed'
  if (state === ACTION_STATES.NEEDS_FOLLOW_UP) return 'Follow-up pending'
  if (state === ACTION_STATES.WAITING_ON_OTHERS) return 'Waiting on others'
  if (item?.category === 'meetings') return 'Meeting starts soon'
  if (item?.category === 'tasks' && item?.meta?.dueDate) return 'Due today'
  if (isMessageItem(item)) return 'Needs your reply'
  return item?.priority === 'High' ? 'Needs attention' : 'On your radar'
}

function statusToneClass(item = {}) {
  const state = actionStateValue(item)
  if (state === ACTION_STATES.NEEDS_APPROVAL) return 'status-pill--warning'
  if (state === ACTION_STATES.NEEDS_FOLLOW_UP) return 'status-pill--attention'
  if (state === ACTION_STATES.WAITING_ON_YOUR_REPLY) return 'status-pill--critical'
  if (item?.category === 'meetings') return 'status-pill--info'
  if (item?.priority === 'High') return 'status-pill--critical'
  return 'status-pill--soft'
}

function priorityReasonLine(item = {}) {
  if (item?.reason) return item.reason
  if (item?.whyThisMatters) return item.whyThisMatters
  return 'This looks like it may need your attention.'
}

function itemTimeline(item = {}) {
  if (item?.occurredAt) return `Updated ${relativeTimeFromNow(item.occurredAt)}`
  if (item?.meta?.startsAt) {
    try {
      const start = new Date(item.meta.startsAt)
      return `Starts ${start.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })}`
    } catch {
      return 'Starts soon'
    }
  }
  if (item?.meta?.dueDate) {
    try {
      return `Due ${new Date(item.meta.dueDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
      })}`
    } catch {
      return 'Due soon'
    }
  }
  const latest =
    item?.meta?.latestMessageAt ||
    item?.meta?.latestInboundAt ||
    item?.meta?.updatedAt ||
    item?.updatedAt ||
    item?.createdAt
  return latest ? `Updated ${relativeTimeFromNow(latest)}` : 'Updated recently'
}

function actionStateLabel(value) {
  return {
    approved: 'Handled',
    handled: 'Handled',
    dismissed: 'Dismissed',
    snoozed: 'Snoozed',
    edited_approved: 'Edited + handled',
  }[String(value || '').toLowerCase()] || 'Updated'
}

function getOpenAction(item = {}) {
  if (item?.secondaryAction?.kind === 'module') return item.secondaryAction
  if (item?.action?.kind === 'module') return item.action

  if (String(item?.sourceApp || '').toLowerCase() === 'jira' && item?.meta?.ticketKey) {
    return buildModuleAction('Open Jira', 'jira', {
      activeTab: 'list',
      searchQuery: item.meta.ticketKey,
      focus: 'my-ticket',
    })
  }

  return item?.secondaryAction || item?.action || null
}

function canDraftReply(item = {}) {
  return item?.action?.kind === 'prompt'
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

  if (action.kind === 'integrations') {
    document.dispatchEvent(new CustomEvent('orion:open-integrations', {
      detail: {
        focusType: action.focusType || null,
      },
    }))
    return
  }

  if (action.kind === 'focus_areas') {
    beginFocusAreasEdit()
    scrollToSection('focus')
    return
  }

  if (action.kind === 'scroll') {
    scrollToSection(action.target)
    return
  }

  if (action.kind === 'refresh') {
    refreshDashboard()
    return
  }

  emit('usePrompt', {
    prompt: action.prompt || '',
    mode: action.mode || 'agent',
  })
}

function scrollToElement(targetRef) {
  const element = targetRef?.value
  if (!element?.scrollIntoView) return
  element.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function scrollToSection(target = '') {
  if (target === 'messages') return scrollToElement(messagesSectionRef)
  if (target === 'documents') return scrollToElement(documentsSectionRef)
  if (target === 'followups') return scrollToElement(followUpsSectionRef)
  if (target === 'focus') return scrollToElement(focusAreasSectionRef)
}

async function recordOpenTelemetry(item, origin = 'workspace-briefing') {
  try {
    await api.post('/api/briefing/priority-feed/telemetry', {
      kind: 'open',
      itemId: item?.id || '',
      sourceApp: item?.sourceApp || '',
      conversationId: item?.meta?.conversationId || '',
      threadId: item?.meta?.threadId || '',
      origin,
    })
  } catch (err) {
    console.debug('Priority feed open telemetry failed:', err.message)
  }
}

function openItem(item = {}) {
  if (item?.id) {
    recordOpenTelemetry(item)
  }
  triggerAction(getOpenAction(item))
}

function draftReply(item = {}) {
  triggerAction(item.action)
}

function runPrimaryAction(item) {
  triggerAction(item?.action)
}

function runSecondaryAction(item) {
  triggerAction(item?.secondaryAction)
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

    // Optimistically clear the unread badge for this conversation so the
    // count drops everywhere immediately. The backend will confirm via
    // the next notification push.
    try {
      acknowledgeConversation(sourceApp, {
        conversationId,
        threadId: openContext.threadId || item?.meta?.threadId,
        chatId: openContext.chatId,
        roomId: openContext.roomId,
        dialogId: openContext.dialogId,
        channelId: openContext.channelId,
        latestMessageId: item?.meta?.latestMessageId,
        itemId: item.id,
      })
    } catch (_) { /* optimistic only — never fail the send */ }

    clearReplyDraftCache(item)

    // Fire-and-forget the audit/persistence + cross-component refresh so
    // the reply-send round-trip is bounded by the actual send API only.
    saveFeedAction(
      item,
      'approved',
      { note: buildReplyAuditNote(trimmedBody) },
      { managePending: false }
    ).catch(() => {})

    emitCommunicationPriorityRefresh('communication_replied', {
      sourceApp,
      conversationId,
    })
  } finally {
    pendingItemId.value = null
  }
}

function createReminder(item = {}) {
  emit('usePrompt', {
    mode: 'chat',
    prompt: `Create a short reminder plan for "${item.title}". Tell me when I should follow up, what I should do next, and a simple reminder message I can reuse.`,
  })
}

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
    const openContext = item?.meta?.openContext || item?.openContext || {}
    const latestMessageId = item?.meta?.latestMessageId || item?.latestMessageId || ''
    const { data } = await api.post('/api/briefing/priority-feed/actions', {
      itemId: item.id,
      sourceApp: item.sourceApp,
      title: item.title,
      action,
      actionLabel: item.action?.label || item.suggestedNextAction || '',
      fromActionState: item.actionState || item.meta?.actionState || '',
      openContext,
      latestMessageId,
      ...extras,
    })

    applyActionResult(item.id, data.entry)
    // Reconcile with the backend in the background so the UI returns control
    // to the user instantly — the optimistic applyActionResult above already
    // removed the item from view.
    loadDashboard({ silent: true, mode: 'replace' }).catch(() => {})
  } catch (err) {
    console.error('Priority feed action failed:', err.message)
  } finally {
    if (managePending) pendingItemId.value = null
  }
}

function markHandled(item) {
  return saveFeedAction(item, 'handled')
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

function snoozeDefault(item) {
  return saveFeedAction(item, 'snoozed', { snoozeMinutes: 60 })
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

async function refreshDashboard() {
  if (refreshingDashboard.value) return
  refreshingDashboard.value = true
  try {
    await Promise.allSettled([
      refreshUnreadState(),
      loadDashboard({ silent: true, mode: 'replace' }),
      loadSupportingDocuments(),
    ])
  } finally {
    refreshingDashboard.value = false
  }
}

function scheduleLiveRefresh() {
  clearTimeout(liveRefreshTimer)
  // 30 ms is enough to coalesce a burst of WebSocket events arriving in the
  // same tick, but short enough that the priority feed appears to update
  // the moment a notification toast pops.
  liveRefreshTimer = setTimeout(() => {
    loadDashboard({ silent: true, mode: 'replace' })
  }, 30)
}

function onPriorityRefreshNeeded(event) {
  const reason = event.detail?.reason || ''
  if (reason === 'incoming_high_signal') {
    scheduleLiveRefresh()
    return
  }

  if (
    reason === 'gmail_read' ||
    reason === 'gmail_replied' ||
    reason === 'communication_replied' ||
    reason === 'communication_action_recorded' ||
    reason === 'communication_read'
  ) {
    loadDashboard({ silent: true, mode: 'replace' })
  }
}

const liveSignalFingerprint = computed(() =>
  Object.entries(unreadByApp)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([app, entry]) => {
      const previews = Array.isArray(entry?.items)
        ? entry.items.slice(0, 3).map((item) => {
            return String(
              item?.latestMessageId ||
              item?.messageId ||
              item?.threadId ||
              item?.chatId ||
              item?.id ||
              ''
            )
          }).join(',')
        : ''

      return [
        app,
        Number(entry?.rawCount ?? entry?.count ?? 0) || 0,
        Number(entry?.displayCount ?? 0) || 0,
        previews,
      ].join('::')
    })
    .join('||')
)

watch(
  liveSignalFingerprint,
  (nextValue, previousValue) => {
    if (!nextValue || nextValue === previousValue) return
    if (loading.value && !dashboard.value) return
    scheduleLiveRefresh()
  }
)

async function loadSupportingDocuments() {
  const requestId = ++latestDocumentsRequestId
  const shouldLoadDocs = connectedAppIds.value.includes('google_docs')
  const shouldLoadSheets = connectedAppIds.value.includes('google_sheets')

  if (!shouldLoadDocs && !shouldLoadSheets) {
    fetchedDocuments.value = []
    documentsLoading.value = false
    return
  }

  documentsLoading.value = true

  try {
    const [docsResult, sheetsResult] = await Promise.allSettled([
      shouldLoadDocs ? googleDocsAPI.list(4) : Promise.resolve({ data: { documents: [] } }),
      shouldLoadSheets ? googleSheetsAPI.list(4) : Promise.resolve({ data: { spreadsheets: [] } }),
    ])

    if (requestId !== latestDocumentsRequestId) return

    const documents =
      docsResult.status === 'fulfilled'
        ? (Array.isArray(docsResult.value?.data?.documents) ? docsResult.value.data.documents : [])
        : []
    const spreadsheets =
      sheetsResult.status === 'fulfilled'
        ? (Array.isArray(sheetsResult.value?.data?.spreadsheets) ? sheetsResult.value.data.spreadsheets : [])
        : []

    fetchedDocuments.value = [
      ...documents.map((item) => createDocumentCardFromDriveItem('google_docs', item)),
      ...spreadsheets.map((item) => createDocumentCardFromDriveItem('google_sheets', item)),
    ]
      .sort(compareOccurredDesc)
      .slice(0, 6)
  } catch (err) {
    if (requestId !== latestDocumentsRequestId) return
    console.debug('Supporting documents unavailable:', err.message)
    fetchedDocuments.value = []
  } finally {
    if (requestId === latestDocumentsRequestId) {
      documentsLoading.value = false
    }
  }
}

watch(
  connectedAppSignature,
  () => {
    loadSupportingDocuments()
  },
  { immediate: true }
)

watch(
  savedFocusAreas,
  (areas) => {
    if (focusAreasEditing.value) return
    focusAreaDraft.value = [...areas]
  },
  { immediate: true }
)

function beginFocusAreasEdit() {
  focusAreaDraft.value = [...savedFocusAreas.value]
  focusAreasEditing.value = true
  focusAreaNotice.value = { type: '', text: '' }
}

function cancelFocusAreasEdit() {
  focusAreaDraft.value = [...savedFocusAreas.value]
  focusAreasEditing.value = false
  focusAreaNotice.value = { type: '', text: '' }
}

function toggleFocusArea(area) {
  if (focusAreaDraft.value.includes(area)) {
    focusAreaDraft.value = focusAreaDraft.value.filter((value) => value !== area)
    return
  }
  focusAreaDraft.value = [...focusAreaDraft.value, area]
}

async function saveFocusAreasSelection() {
  if (!focusAreaDraft.value.length) {
    focusAreaNotice.value = {
      type: 'error',
      text: 'Select at least one focus area or skip for now.',
    }
    return
  }

  focusAreasSaving.value = true
  focusAreaNotice.value = { type: '', text: '' }

  try {
    const { data } = await onboardingAPI.update({
      focusAreas: focusAreaDraft.value,
      hasSelectedFocusAreas: true,
      skippedFocusAreas: false,
    })
    if (data?.user) setUser(data.user)
    focusAreasEditing.value = false
    focusAreaNotice.value = {
      type: 'success',
      text: 'Your priorities were saved.',
    }
  } catch (err) {
    focusAreaNotice.value = {
      type: 'error',
      text: err?.response?.data?.error || 'Could not save your priorities.',
    }
  } finally {
    focusAreasSaving.value = false
  }
}

async function skipFocusAreas() {
  focusAreasSaving.value = true
  focusAreaNotice.value = { type: '', text: '' }

  try {
    const { data } = await onboardingAPI.update({
      focusAreas: [],
      hasSelectedFocusAreas: false,
      skippedFocusAreas: true,
    })
    if (data?.user) setUser(data.user)
    focusAreasEditing.value = false
    focusAreaDraft.value = []
    focusAreaNotice.value = {
      type: 'success',
      text: 'You can add focus areas anytime.',
    }
  } catch (err) {
    focusAreaNotice.value = {
      type: 'error',
      text: err?.response?.data?.error || 'Could not update your focus areas.',
    }
  } finally {
    focusAreasSaving.value = false
  }
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

onMounted(() => {
  loadDashboard()
  document.addEventListener('orion:priority-refresh-needed', onPriorityRefreshNeeded)
})

onUnmounted(() => {
  clearTimeout(liveRefreshTimer)
  document.removeEventListener('orion:priority-refresh-needed', onPriorityRefreshNeeded)
})
</script>

<style scoped>
.briefing-shell {
  width: min(1180px, 100%);
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 8px 0 144px;
  box-sizing: border-box;
}

.panel {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  padding: 22px;
  border: 1px solid rgba(176, 201, 255, 0.1);
  background:
    radial-gradient(circle at 12% 16%, rgba(82, 212, 255, 0.12), transparent 26%),
    radial-gradient(circle at 88% 12%, rgba(139, 125, 255, 0.16), transparent 24%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(9, 16, 34, 0.9));
  box-shadow: 0 28px 72px rgba(0, 4, 18, 0.28);
  backdrop-filter: blur(24px);
}

.today-hero__top,
.section-head,
.card-top,
.group-head,
.today-hero__apps-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.today-hero {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.today-hero__top {
  align-items: flex-start;
}

.today-hero__copy {
  max-width: 720px;
}

.today-hero__eyebrow,
.hero-stat__label,
.status-pill,
.source-badge,
.filter-chip,
.suggestion-card__cta,
.today-hero__apps-label {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 700;
}

.today-hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(242, 198, 109, 0.12);
  border: 1px solid rgba(242, 198, 109, 0.2);
  color: var(--accent-warm);
  margin-bottom: 16px;
}

.today-hero h2 {
  font-size: clamp(34px, 5vw, 48px);
  line-height: 1.02;
  margin-bottom: 10px;
  color: var(--text-primary);
}

.today-hero__subtitle {
  font-size: 19px;
  font-weight: 600;
  color: rgba(240, 245, 255, 0.94);
  margin-bottom: 10px;
}

.today-hero__support,
.section-head p,
.card-copy,
.card-meta,
.today-hero__empty-apps,
.section-empty p,
.hero-stat__hint,
.suggestion-card__copy,
.section-note {
  color: rgba(200, 210, 228, 0.74);
  line-height: 1.65;
}

.today-hero__side {
  width: min(320px, 100%);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.today-hero__sync {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(176, 201, 255, 0.1);
  color: rgba(214, 224, 244, 0.72);
  font-size: 12px;
}

.today-hero__apps {
  padding: 14px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(176, 201, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.today-hero__apps-count {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  background: rgba(82, 212, 255, 0.1);
  color: #c9f2ff;
  font-size: 12px;
  font-weight: 700;
}

.today-hero__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.app-chip,
.source-badge,
.filter-chip,
.status-pill,
.ghost-button,
.action-button,
.suggestion-card,
.focus-chip,
.update-pill {
  border-radius: 999px;
}

.app-chip,
.source-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.app-chip {
  border: 1px solid rgba(176, 201, 255, 0.1);
  background: rgba(255, 255, 255, 0.045);
  color: #e2e8f0;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.app-chip:hover,
.ghost-button:hover:not(:disabled),
.action-button:hover:not(:disabled),
.filter-chip:hover,
.suggestion-card:hover,
.focus-chip:hover,
.update-pill:hover {
  transform: translateY(-1px);
}

.app-chip:hover {
  border-color: rgba(99, 102, 241, 0.24);
  background: rgba(99, 102, 241, 0.12);
}

.app-chip__img,
.source-badge__img {
  width: 16px;
  height: 16px;
  object-fit: contain;
  border-radius: 4px;
  flex-shrink: 0;
}

.app-chip__emoji,
.source-badge__emoji {
  font-size: 15px;
  line-height: 1;
}

.today-hero__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.hero-stat,
.priority-card,
.list-card,
.jira-insight-card,
.recent-action,
.section-empty,
.suggestion-card {
  border-radius: 24px;
  border: 1px solid rgba(176, 201, 255, 0.1);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.012));
  backdrop-filter: blur(18px);
}

.hero-stat {
  padding: 16px;
}

.hero-stat__label {
  color: rgba(127, 140, 166, 0.92);
}

.hero-stat__value {
  display: block;
  margin-top: 8px;
  font-size: 28px;
  color: var(--text-primary);
}

.hero-stat__hint {
  margin-top: 10px;
  font-size: 13px;
}

.today-hero__note {
  margin: 0;
  color: #d8e7ff;
  font-size: 13px;
}

.today-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.88fr);
  gap: 18px;
  align-items: start;
}

.today-main,
.today-rail {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.dashboard-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.section-head {
  align-items: flex-start;
}

.section-head h3,
.group-head h4,
.priority-card h4,
.list-card h5,
.recent-action strong {
  color: var(--text-primary);
}

.section-head h3 {
  font-size: 22px;
}

.section-head p,
.section-meta,
.card-meta,
.list-card__time {
  font-size: 12px;
}

.section-meta,
.list-card__time {
  color: rgba(200, 210, 228, 0.64);
}

.update-row {
  display: flex;
  justify-content: flex-start;
}

.update-pill,
.filter-chip,
.ghost-button,
.action-button {
  border: 1px solid rgba(176, 201, 255, 0.12);
  background: rgba(255, 255, 255, 0.045);
  color: #e7eefc;
}

.update-pill,
.ghost-button,
.action-button {
  font-size: 12px;
  font-weight: 600;
  padding: 10px 14px;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, opacity 160ms ease;
}

.update-pill:hover,
.ghost-button:hover:not(:disabled),
.action-button:hover:not(:disabled) {
  border-color: rgba(99, 102, 241, 0.24);
  background: rgba(99, 102, 241, 0.12);
}

.ghost-button:disabled,
.action-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.filter-chip.active {
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.18), rgba(139, 125, 255, 0.18));
  border-color: rgba(127, 179, 255, 0.28);
}

.filter-chip__count {
  font-size: 11px;
  color: rgba(240, 245, 255, 0.9);
}

.priority-grid,
.list-grid,
.jira-insight-grid {
  display: grid;
  gap: 12px;
}

.priority-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  /* Show ~3 rows (6 cards) before scrolling — keeps the briefing scannable. */
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 6px;
}

.priority-grid::-webkit-scrollbar {
  width: 8px;
}

.priority-grid::-webkit-scrollbar-thumb {
  background: rgba(176, 201, 255, 0.18);
  border-radius: 999px;
}

.priority-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(176, 201, 255, 0.28);
}

@media (max-width: 720px) {
  .priority-grid {
    grid-template-columns: 1fr;
  }
}

.list-grid {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

/* Bills & Documents — compact, scrollable variant of the shared list grid. */
.documents-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  max-height: 360px;
  overflow-y: auto;
  padding-right: 6px;
}

.documents-grid::-webkit-scrollbar {
  width: 8px;
}

.documents-grid::-webkit-scrollbar-thumb {
  background: rgba(176, 201, 255, 0.18);
  border-radius: 999px;
}

.documents-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(176, 201, 255, 0.28);
}

.documents-card {
  padding: 12px !important;
  gap: 8px !important;
  border-radius: 16px;
}

.documents-card h5 {
  font-size: 13px;
  line-height: 1.35;
  margin: 0;
}

.documents-card .card-copy {
  font-size: 11.5px;
  line-height: 1.45;
}

.documents-card .card-meta {
  font-size: 10.5px;
}

.documents-card .source-badge {
  padding: 4px 8px;
  font-size: 10.5px;
}

.documents-card .status-pill {
  font-size: 10px;
  padding: 3px 8px;
}

.documents-card .action-button {
  padding: 6px 12px;
  font-size: 11.5px;
}

.priority-card,
.list-card,
.recent-action {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.priority-card--suggestion {
  justify-content: space-between;
  border-style: dashed;
}

.source-badge {
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(176, 201, 255, 0.1);
  color: #d9e5fb;
}

.source-badge--suggestion {
  background: rgba(255, 255, 255, 0.03);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 11px;
  border: 1px solid rgba(176, 201, 255, 0.08);
}

.status-pill--critical {
  color: #ffe0e6;
  background: rgba(244, 63, 94, 0.16);
  border-color: rgba(244, 63, 94, 0.24);
}

.status-pill--warning {
  color: #ffe9c4;
  background: rgba(245, 158, 11, 0.16);
  border-color: rgba(245, 158, 11, 0.24);
}

.status-pill--attention {
  color: #d7e8ff;
  background: rgba(96, 165, 250, 0.14);
  border-color: rgba(96, 165, 250, 0.22);
}

.status-pill--info {
  color: #c8f6ff;
  background: rgba(34, 211, 238, 0.14);
  border-color: rgba(34, 211, 238, 0.24);
}

.status-pill--soft {
  color: #d3def5;
  background: rgba(255, 255, 255, 0.055);
}

.priority-card h4,
.list-card h5 {
  font-size: 18px;
  line-height: 1.32;
}

.card-copy {
  font-size: 14px;
}

.card-meta {
  margin-top: auto;
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.action-button {
  min-height: 40px;
}

.action-button--subtle {
  background: rgba(255, 255, 255, 0.03);
}

.stacked-groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.group-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-head h4 {
  font-size: 15px;
}

.group-head span {
  color: rgba(200, 210, 228, 0.64);
  font-size: 12px;
}

.section-empty {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 144px;
  justify-content: center;
}

.section-empty strong {
  color: var(--text-primary);
}

.section-empty--compact {
  min-height: auto;
}

.jira-insight-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.jira-insight-card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.jira-insight-card.primary {
  background:
    radial-gradient(circle at top right, rgba(255, 107, 127, 0.18), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.012)),
    rgba(17, 11, 24, 0.9);
}

.jira-insight-card.org {
  background:
    radial-gradient(circle at top right, rgba(82, 212, 255, 0.18), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.012)),
    rgba(9, 18, 34, 0.9);
}

.jira-insight-card.blocked {
  background:
    radial-gradient(circle at top right, rgba(242, 184, 79, 0.18), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.012)),
    rgba(26, 18, 8, 0.9);
}

.jira-insight-card.high-priority {
  background:
    radial-gradient(circle at top right, rgba(139, 125, 255, 0.18), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.012)),
    rgba(19, 12, 31, 0.9);
}

.jira-insight-label {
  color: rgba(127, 140, 166, 0.92);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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
  font-size: 30px;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
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

.suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.suggestion-card {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  text-align: left;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.suggestion-card:hover {
  border-color: rgba(99, 102, 241, 0.24);
  background: rgba(99, 102, 241, 0.1);
}

.suggestion-card__title {
  color: var(--text-primary);
  font-weight: 600;
}

.suggestion-card__cta {
  color: #b9d6ff;
}

.focus-editor,
.focus-summary {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.focus-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.focus-chip {
  border: 1px solid rgba(176, 201, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
  color: #dbe6fb;
  padding: 10px 14px;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.focus-chip--selected {
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.16), rgba(139, 125, 255, 0.18));
  border-color: rgba(127, 179, 255, 0.28);
  color: #f5f9ff;
}

.focus-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.section-note {
  font-size: 13px;
}

.section-note--error {
  color: #ffc4d0;
}

.panel--compact .recent-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recent-action {
  padding: 16px;
}

@media (max-width: 1080px) {
  .today-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .today-hero__top {
    flex-direction: column;
  }

  .today-hero__side {
    width: 100%;
  }
}

@media (max-width: 760px) {
  .briefing-shell {
    padding-bottom: 168px;
  }

  .panel {
    padding: 18px;
    border-radius: 24px;
  }

  .today-hero__stats,
  .jira-insight-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .priority-grid,
  .list-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .section-head,
  .card-top,
  .group-head,
  .today-hero__apps-head,
  .today-hero__sync {
    flex-direction: column;
    align-items: flex-start;
  }

  .status-pill,
  .source-badge {
    max-width: 100%;
  }
}
</style>
