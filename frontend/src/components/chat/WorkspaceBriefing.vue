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

    <section v-if="jiraInsight" class="briefing-section">
      <div class="briefing-section-head">
        <h3>Jira Overdue Insight</h3>
        <span>{{ jiraInsight.definition }}</span>
      </div>

      <div class="jira-insight-grid">
        <article class="jira-insight-card primary">
          <span class="jira-insight-label">Your overdue tickets</span>
          <strong>{{ jiraInsight.myOverdueCount }}</strong>
          <p>Personally assigned Jira work that is already overdue.</p>
        </article>
        <article class="jira-insight-card org">
          <span class="jira-insight-label">Org overdue tickets</span>
          <strong>{{ jiraInsight.orgOverdueCount }}</strong>
          <p>Overall overdue count in the connected Jira workspace scope.</p>
        </article>
        <article class="jira-insight-card compact blocked">
          <span class="jira-insight-label">Blocked overdue</span>
          <strong>{{ jiraInsight.blockedOverdueCount }}</strong>
          <p>Overdue tickets that also look blocked or stuck.</p>
        </article>
        <article class="jira-insight-card compact high-priority">
          <span class="jira-insight-label">High-priority overdue</span>
          <strong>{{ jiraInsight.highPriorityOverdueCount }}</strong>
          <p>Overdue tickets already marked high or highest priority.</p>
        </article>
      </div>

      <div class="jira-insight-actions">
        <button
          v-for="action in jiraInsight.quickActions || []"
          :key="action.id"
          class="briefing-suggestion jira-insight-action"
          @click="triggerAction(action.action)"
        >
          <span class="briefing-suggestion-label">{{ action.label }}</span>
        </button>
      </div>
    </section>

    <section class="briefing-section">
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
          {{ filter.label }}
        </button>
      </div>

      <div v-if="loading" class="priority-empty">
        <strong>Building your Priority Feed...</strong>
        <p>OrionAI is ranking signals from your connected work apps.</p>
      </div>

      <div v-else-if="filteredItems.length" class="priority-feed-grid">
        <PriorityFeedCard
          v-for="item in filteredItems"
          :key="item.id"
          :item="item"
          :busy="pendingItemId === item.id"
          @approve="approveItem"
          @dismiss="dismissItem"
          @snooze="snoozeItem"
          @edited-approve="approveEditedItem"
          @run-action="runPrimaryAction"
          @run-secondary-action="runSecondaryAction"
        />
      </div>

      <div v-else class="priority-empty">
        <strong>{{ emptyStateTitle }}</strong>
        <p>{{ emptyStateDescription }}</p>
      </div>
    </section>

    <section class="briefing-section">
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

    <section v-if="auditTrail.length" class="briefing-section">
      <div class="briefing-section-head">
        <h3>Recent Feed Actions</h3>
        <span>Light audit trail</span>
      </div>

      <div class="audit-trail-list">
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
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import api from '../../services/api'
import PriorityFeedCard from '../home/PriorityFeedCard.vue'

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
let refreshTimer = null

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

const dailyBriefing = computed(() => dashboard.value?.dailyBriefing || {})
const filters = computed(() => dashboard.value?.priorityFeed?.filters || [
  { id: 'all', label: 'All' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'replies', label: 'Replies' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'tasks', label: 'Tasks' },
])

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

// const prioritySummary = computed(() => ({
//   urgentCount: items.value.filter((item) => item.priority === 'High').length,
//   quickClearCount: items.value.filter((item) => item.canClearQuickly).length,
//   upcomingCount: items.value.filter(
//     (item) => item.category === 'meetings' || (item.category === 'tasks' && item.needsAttentionSoon)
//   ).length,
// }))

const filteredItems = computed(() => {
  if (activeFilter.value === 'all') return items.value
  if (activeFilter.value === 'urgent') return items.value.filter((item) => item.priority === 'High')
  return items.value.filter((item) => item.category === activeFilter.value)
})

const suggestedActions = computed(() => {
  if (!items.value.length) return fallbackSuggestions
  return items.value.slice(0, 4).map((item) => ({
    id: `suggestion:${item.id}`,
    label: item.action?.label || 'Review now',
    description: item.title,
    action: item.action,
  }))
})

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

function runPrimaryAction(item) {
  triggerAction(item.action)
}

function runSecondaryAction(item) {
  triggerAction(item.secondaryAction)
}

function applyActionResult(itemId, entry) {
  items.value = items.value.filter((item) => item.id !== itemId)
  auditTrail.value = [entry, ...auditTrail.value].slice(0, 8)
}

function applyDashboardSnapshot(data) {
  dashboard.value = data
  items.value = Array.isArray(data.priorityFeed?.items) ? data.priorityFeed.items : []
  auditTrail.value = Array.isArray(data.priorityFeed?.auditTrail) ? data.priorityFeed.auditTrail : []
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

async function saveFeedAction(item, action, extras = {}) {
  pendingItemId.value = item.id
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
  } catch (err) {
    console.error('Priority Feed action failed:', err.message)
  } finally {
    pendingItemId.value = null
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

function approveEditedItem({ item, note }) {
  return saveFeedAction(item, 'edited_approved', { note })
}

async function loadDashboard({ silent = false, mode = 'replace' } = {}) {
  if (!silent) loading.value = true
  try {
    const { data } = await api.get('/api/briefing/home')
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
    console.debug('Workspace briefing unavailable:', err.message)
  } finally {
    if (!silent) loading.value = false
  }
}

function schedulePendingRefresh() {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    loadDashboard({ silent: true, mode: 'pending' })
  }, 350)
}

function onPriorityRefreshNeeded(event) {
  const reason = event.detail?.reason || ''
  const sourceApp = event.detail?.sourceApp || ''
  if (reason === 'incoming_high_signal') {
    if (['slack', 'telegram', 'google_calendar'].includes(sourceApp)) {
      loadDashboard({ silent: true, mode: 'replace' })
      return
    }
    schedulePendingRefresh()
    return
  }

  if (reason === 'gmail_read' || reason === 'gmail_replied') {
    loadDashboard({ silent: true, mode: 'replace' })
  }
}

onMounted(() => {
  loadDashboard()
  document.addEventListener('orion:priority-refresh-needed', onPriorityRefreshNeeded)
})

onUnmounted(() => {
  clearTimeout(refreshTimer)
  document.removeEventListener('orion:priority-refresh-needed', onPriorityRefreshNeeded)
})
</script>

<style scoped>
.briefing-shell {
  --briefing-hero-bg:
    radial-gradient(circle at top left, rgba(251, 191, 36, 0.28), transparent 36%),
    radial-gradient(circle at 82% 18%, rgba(45, 212, 191, 0.18), transparent 26%),
    linear-gradient(135deg, rgba(20, 29, 40, 0.98), rgba(13, 38, 40, 0.94));
  --briefing-hero-border: rgba(255, 255, 255, 0.08);
  --briefing-hero-shadow: 0 24px 80px rgba(3, 7, 18, 0.35);
  --briefing-badge-bg: rgba(251, 191, 36, 0.14);
  --briefing-badge-border: rgba(251, 191, 36, 0.22);
  --briefing-badge-text: #fcd34d;
  --briefing-date-text: rgba(226, 232, 240, 0.66);
  --briefing-orb-bg: linear-gradient(135deg, rgba(251, 191, 36, 0.22), rgba(45, 212, 191, 0.12));
  --briefing-orb-border: rgba(255, 255, 255, 0.12);
  --briefing-heading: #f8fafc;
  --briefing-kicker: rgba(226, 232, 240, 0.82);
  --briefing-summary: rgba(226, 232, 240, 0.7);
  --briefing-stat-bg: rgba(255, 255, 255, 0.05);
  --briefing-stat-border: rgba(255, 255, 255, 0.08);
  --briefing-stat-label: rgba(148, 163, 184, 0.78);
  --briefing-stat-value: #f8fafc;
  --briefing-chip-bg: rgba(255, 255, 255, 0.06);
  --briefing-chip-border: rgba(255, 255, 255, 0.08);
  --briefing-chip-text: #e2e8f0;
  width: min(920px, 100%);
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px 0 8px;
}

.briefing-hero {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  padding: 22px;
  background: var(--briefing-hero-bg);
  border: 1px solid var(--briefing-hero-border);
  box-shadow: var(--briefing-hero-shadow);
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
  padding: 6px 12px;
  background: var(--briefing-badge-bg);
  border: 1px solid var(--briefing-badge-border);
  color: var(--briefing-badge-text);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

.briefing-date,
.briefing-apps-label,
.briefing-section-head span,
.audit-trail-time {
  font-size: 12px;
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
  border-radius: 20px;
  display: grid;
  place-items: center;
  font-size: 26px;
  background: var(--briefing-orb-bg);
  border: 1px solid var(--briefing-orb-border);
  flex-shrink: 0;
}

.briefing-copy h2,
.briefing-section-head h3,
.priority-summary-card strong,
.audit-trail-item strong {
  color: var(--text-primary);
}

.briefing-copy h2 {
  font-size: 32px;
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
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
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
  letter-spacing: 0.08em;
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
  font-size: 24px;
  line-height: 1;
}

.briefing-apps {
  margin-top: 18px;
}

.briefing-app-chip {
  padding: 8px 12px;
  background: var(--briefing-chip-bg);
  border: 1px solid var(--briefing-chip-border);
  color: var(--briefing-chip-text);
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

.priority-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.jira-insight-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.priority-summary-card,
.jira-insight-card,
.priority-empty,
.audit-trail-item,
.briefing-suggestion {
  padding: 18px;
  box-shadow: 0 18px 40px rgba(2, 6, 23, 0.16);
}

.priority-summary-card,
.jira-insight-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.priority-summary-card strong,
.jira-insight-card strong {
  font-size: 30px;
  line-height: 1;
}

.priority-summary-card.urgent {
  background:
    radial-gradient(circle at top right, rgba(239, 68, 68, 0.14), transparent 36%),
    rgba(26, 12, 19, 0.84);
}

.priority-summary-card.quick {
  background:
    radial-gradient(circle at top right, rgba(34, 197, 94, 0.14), transparent 36%),
    rgba(12, 24, 18, 0.84);
}

.priority-summary-card.upcoming {
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.14), transparent 36%),
    rgba(10, 18, 32, 0.84);
}

.jira-insight-card.primary {
  background:
    radial-gradient(circle at top right, rgba(239, 68, 68, 0.14), transparent 36%),
    rgba(26, 12, 19, 0.84);
}

.jira-insight-card.org {
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.14), transparent 36%),
    rgba(10, 18, 32, 0.84);
}

.jira-insight-card.blocked {
  background:
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.16), transparent 36%),
    rgba(32, 22, 8, 0.84);
}

.jira-insight-card.high-priority {
  background:
    radial-gradient(circle at top right, rgba(249, 115, 22, 0.16), transparent 36%),
    rgba(34, 16, 8, 0.84);
}

.jira-insight-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(191, 219, 254, 0.78);
}

.jira-insight-card p {
  color: rgba(226, 232, 240, 0.76);
  line-height: 1.55;
}

.jira-insight-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.jira-insight-action {
  min-width: auto;
}

.priority-summary-label {
  color: rgba(191, 219, 254, 0.78);
}

.briefing-update-row {
  display: flex;
  align-items: center;
}

.briefing-update-pill {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(45, 212, 191, 0.24);
  background: rgba(45, 212, 191, 0.12);
  color: #ccfbf1;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.briefing-update-pill:hover {
  transform: translateY(-1px);
  border-color: rgba(45, 212, 191, 0.36);
  background: rgba(45, 212, 191, 0.18);
}

.priority-filter-row,
.briefing-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.priority-filter-chip,
.briefing-suggestion {
  cursor: pointer;
}

.priority-filter-chip {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(226, 232, 240, 0.8);
  font-size: 12px;
  font-weight: 600;
}

.priority-filter-chip.active {
  border-color: rgba(99, 102, 241, 0.24);
  background: rgba(99, 102, 241, 0.16);
  color: #eef2ff;
}

.priority-feed-grid,
.audit-trail-list {
  display: grid;
  gap: 16px;
}

.priority-empty strong {
  display: block;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.briefing-suggestion {
  min-width: min(280px, 100%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
}

.briefing-suggestion-label {
  color: rgba(191, 219, 254, 0.82);
}

.briefing-suggestion-text {
  color: rgba(226, 232, 240, 0.76);
  line-height: 1.55;
}

.audit-trail-badge,
.audit-trail-state {
  font-size: 11px;
  color: rgba(191, 219, 254, 0.76);
}

.audit-trail-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
}

:global([data-theme="light"]) .briefing-hero {
  box-shadow: var(--briefing-hero-shadow);
}

:global([data-theme="light"]) .priority-summary-card,
:global([data-theme="light"]) .jira-insight-card,
:global([data-theme="light"]) .priority-empty,
:global([data-theme="light"]) .audit-trail-item,
:global([data-theme="light"]) .briefing-suggestion,
:global([data-theme="light"]) .priority-filter-chip {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 10px 24px rgba(148, 163, 184, 0.12);
}

:global([data-theme="light"]) .jira-insight-card.primary {
  background:
    radial-gradient(circle at top right, rgba(239, 68, 68, 0.12), transparent 38%),
    rgba(255, 245, 245, 0.92);
}

:global([data-theme="light"]) .jira-insight-card.org {
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.12), transparent 38%),
    rgba(241, 247, 255, 0.92);
}

:global([data-theme="light"]) .jira-insight-card.blocked {
  background:
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.14), transparent 38%),
    rgba(255, 249, 235, 0.92);
}

:global([data-theme="light"]) .jira-insight-card.high-priority {
  background:
    radial-gradient(circle at top right, rgba(249, 115, 22, 0.14), transparent 38%),
    rgba(255, 244, 238, 0.92);
}

:global([data-theme="light"]) .briefing-update-pill {
  color: #0f766e;
  background: rgba(20, 184, 166, 0.12);
  border-color: rgba(20, 184, 166, 0.24);
}

:global([data-theme="light"]) .briefing-section-head h3,
:global([data-theme="light"]) .priority-empty strong,
:global([data-theme="light"]) .audit-trail-item strong,
:global([data-theme="light"]) .jira-insight-card strong {
  color: #0f172a;
}

:global([data-theme="light"]) .briefing-section-head span,
:global([data-theme="light"]) .briefing-apps-label,
:global([data-theme="light"]) .audit-trail-time {
  color: rgba(71, 85, 105, 0.84);
}

:global([data-theme="light"]) .jira-insight-label,
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
  }

  :global([data-theme="system"]) .briefing-hero {
    box-shadow: var(--briefing-hero-shadow);
  }

  :global([data-theme="system"]) .priority-summary-card,
  :global([data-theme="system"]) .jira-insight-card,
  :global([data-theme="system"]) .priority-empty,
  :global([data-theme="system"]) .audit-trail-item,
  :global([data-theme="system"]) .briefing-suggestion,
  :global([data-theme="system"]) .priority-filter-chip {
    border-color: rgba(148, 163, 184, 0.28);
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 10px 24px rgba(148, 163, 184, 0.12);
  }

  :global([data-theme="system"]) .jira-insight-card.primary {
    background:
      radial-gradient(circle at top right, rgba(239, 68, 68, 0.12), transparent 38%),
      rgba(255, 245, 245, 0.92);
  }

  :global([data-theme="system"]) .jira-insight-card.org {
    background:
      radial-gradient(circle at top right, rgba(59, 130, 246, 0.12), transparent 38%),
      rgba(241, 247, 255, 0.92);
  }

  :global([data-theme="system"]) .jira-insight-card.blocked {
    background:
      radial-gradient(circle at top right, rgba(245, 158, 11, 0.14), transparent 38%),
      rgba(255, 249, 235, 0.92);
  }

  :global([data-theme="system"]) .jira-insight-card.high-priority {
    background:
      radial-gradient(circle at top right, rgba(249, 115, 22, 0.14), transparent 38%),
      rgba(255, 244, 238, 0.92);
  }

  :global([data-theme="system"]) .briefing-update-pill {
    color: #0f766e;
    background: rgba(20, 184, 166, 0.12);
    border-color: rgba(20, 184, 166, 0.24);
  }

  :global([data-theme="system"]) .briefing-section-head h3,
  :global([data-theme="system"]) .priority-empty strong,
  :global([data-theme="system"]) .audit-trail-item strong,
  :global([data-theme="system"]) .jira-insight-card strong {
    color: #0f172a;
  }

  :global([data-theme="system"]) .briefing-section-head span,
  :global([data-theme="system"]) .briefing-apps-label,
  :global([data-theme="system"]) .audit-trail-time {
    color: rgba(71, 85, 105, 0.84);
  }

  :global([data-theme="system"]) .jira-insight-label,
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
  .jira-insight-grid {
    grid-template-columns: 1fr;
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
