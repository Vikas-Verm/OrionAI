<template>
  <section class="comm-panel" :class="{ compact }">
    <div class="comm-head">
      <div>
        <span class="comm-kicker">{{ title }}</span>
        <h3>{{ headlineText }}</h3>
      </div>
      <button class="comm-refresh" :disabled="loading" @click="$emit('refresh')">
        Refresh
      </button>
    </div>

    <p v-if="summaryText" class="comm-summary">{{ summaryText }}</p>

    <div class="comm-filters">
      <button
        v-for="group in filterGroups"
        :key="group.id"
        class="comm-filter-chip"
        :class="{ active: activeFilter === group.id }"
        @click="setActiveFilter(group.id)"
      >
        <span>{{ group.label }}</span>
        <strong>{{ group.count }}</strong>
      </button>
    </div>

    <div v-if="loading" class="comm-empty">
      <strong>Scanning conversations…</strong>
      <p>OrionAI is checking which threads truly need you.</p>
    </div>

    <div v-else-if="filteredItems.length" class="comm-list">
      <article
        v-for="item in filteredItems"
        :key="item.id"
        class="comm-card"
        :class="[
          `state-${item.actionState}`,
          String(item.conversationId) === String(selectedConversationId || '') && 'selected',
          itemUnreadCount(item) > 0 && 'unread',
        ]"
      >
        <div class="comm-card-top">
          <span class="comm-card-source">
            <img
              v-if="appIconUrlFor(item) && !brokenIconIds.has(item.id)"
              :src="appIconUrlFor(item)"
              :alt="item.sourceLabel || item.sourceApp || 'App'"
              class="comm-card-source-img"
              loading="lazy"
              @error="brokenIconIds.add(item.id)"
            />
            <span v-else>{{ item.sourceIcon }}</span>
            <span>{{ item.sourceLabel }}</span>
          </span>
          <span v-if="itemUnreadCount(item) > 0" class="comm-card-unread-badge">
            {{ itemUnreadCount(item) > 9 ? '9+' : itemUnreadCount(item) }}
          </span>
          <span v-if="showStateBadge(item)" class="comm-card-state">{{ item.actionStateLabel }}</span>
        </div>

        <div class="comm-card-title">{{ item.conversationTitle }}</div>
        <div v-if="item.participantLabel" class="comm-card-participant">{{ item.participantLabel }}</div>
        <p class="comm-card-reason">{{ item.actionReason }}</p>

        <div class="comm-card-meta">
          <span>{{ confidenceLabel(item.confidenceBand) }}</span>
          <span v-if="relativeTime(item.latestMessageTimestamp)">{{ relativeTime(item.latestMessageTimestamp) }}</span>
        </div>

        <div class="comm-card-actions">
          <button class="comm-primary" @click="$emit('open', item)">Open</button>
          <button
            v-if="item.actionState !== 'waiting_on_others' && item.actionState !== 'no_action_needed'"
            class="comm-secondary"
            @click="$emit('draft', item)"
          >
            Draft
          </button>
          <button class="comm-ghost" @click="$emit('done', item)">Done</button>
          <button class="comm-ghost" @click="$emit('snooze', item)">1h</button>
          <button class="comm-ghost danger" @click="$emit('dismiss', item)">Dismiss</button>
        </div>
      </article>
    </div>

    <div v-else class="comm-empty">
      <strong>No action-heavy conversations here right now.</strong>
      <p>OrionAI is only surfacing threads that look genuinely tied to you.</p>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { getAppIconUrl } from '../../utils/appIcons'

const props = defineProps({
  title: { type: String, default: 'Reply / Action Required' },
  headline: { type: String, default: '' },
  summaryText: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  groups: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  selectedConversationId: { type: [String, Number], default: null },
  activeFilter: { type: String, default: 'all' },
})

const emit = defineEmits(['refresh', 'open', 'draft', 'done', 'snooze', 'dismiss', 'filter-change'])

const activeFilter = ref(props.activeFilter || 'all')

const visibleItems = computed(() =>
  props.items.filter((item) => item.actionState !== 'no_action_needed')
)

const visibleGroups = computed(() =>
  props.groups.filter((group) => group.id !== 'no_action_needed')
)

const filterGroups = computed(() => [
  { id: 'all', label: 'All', count: visibleItems.value.length },
  ...visibleGroups.value.filter((group) => group.count > 0),
])

const filteredItems = computed(() => {
  if (activeFilter.value === 'all') return visibleItems.value
  return visibleItems.value.filter((item) => item.actionState === activeFilter.value)
})

const headlineText = computed(() => {
  if (props.headline) return props.headline
  const firstActionable = visibleGroups.value.find((group) =>
    ['waiting_on_your_reply', 'needs_approval', 'needs_follow_up'].includes(group.id) && group.count > 0
  )
  return firstActionable
    ? `${firstActionable.count} conversation${firstActionable.count === 1 ? '' : 's'} currently need judgment`
    : 'One execution layer over your conversations'
})

watch(
  visibleGroups,
  (nextGroups) => {
    if (activeFilter.value !== 'all' && !nextGroups.some((group) => group.id === activeFilter.value && group.count > 0)) {
      const nextDefault = nextGroups.find((group) =>
        ['waiting_on_your_reply', 'needs_approval', 'needs_follow_up'].includes(group.id) && group.count > 0
      )
      setActiveFilter(nextDefault?.id || 'all')
    }
  },
  { immediate: true, deep: true }
)

watch(
  () => props.activeFilter,
  (nextValue) => {
    const nextFilter = nextValue || 'all'
    if (nextFilter !== activeFilter.value) {
      activeFilter.value = nextFilter
    }
  }
)

function confidenceLabel(value) {
  if (value === 'high') return 'High confidence'
  if (value === 'medium') return 'Medium confidence'
  return 'Lower confidence'
}

function relativeTime(timestamp) {
  if (!timestamp) return ''
  const diffMs = Date.now() - new Date(timestamp).getTime()
  if (!Number.isFinite(diffMs)) return ''
  if (diffMs < 60_000) return 'just now'

  const totalMinutes = Math.floor(diffMs / 60_000)
  if (totalMinutes < 60) return `${totalMinutes}m ago`

  const hours = Math.floor(totalMinutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function showStateBadge(item) {
  return Boolean(item?.actionStateLabel) && item?.actionState !== 'waiting_on_others'
}

// Track per-item icon-load failures so we don't keep retrying broken URLs
// across re-renders, and so we cleanly fall back to the emoji glyph.
const brokenIconIds = reactive(new Set())

function appIconUrlFor(item) {
  if (!item) return ''
  return getAppIconUrl(item.sourceApp || item.module || '')
}

function itemUnreadCount(item) {
  const candidates = [
    item?.sourceMetadata?.unreadCount,
    item?.platformMetadata?.unreadCount,
    item?.meta?.sourceMetadata?.unreadCount,
    item?.meta?.platformMetadata?.unreadCount,
    item?.unreadCount,
    item?.unread,
  ]
  for (const value of candidates) {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return numeric
  }
  return 0
}

function setActiveFilter(filterId) {
  const nextFilter = filterId || 'all'
  activeFilter.value = nextFilter
  emit('filter-change', nextFilter)
}
</script>

<style scoped>
.comm-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 24px;
  border: 1px solid rgba(176, 201, 255, 0.12);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.015)),
    rgba(9, 16, 34, 0.74);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(18px);
}

.comm-panel.compact {
  padding: 12px;
  gap: 10px;
}

.comm-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.comm-kicker {
  display: inline-flex;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(242, 198, 109, 0.12);
  color: var(--accent-warm);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.comm-head h3 {
  margin: 8px 0 0;
  font-size: 15px;
  color: var(--text-primary);
}

.comm-refresh {
  border: 1px solid var(--border-default);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  border-radius: 12px;
  padding: 8px 11px;
  cursor: pointer;
  font-size: 12px;
}

.comm-summary {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.comm-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.comm-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-default);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
}

.comm-filter-chip strong {
  color: var(--text-primary);
}

.comm-filter-chip.active {
  border-color: rgba(82, 212, 255, 0.24);
  color: var(--text-primary);
  background: rgba(82, 212, 255, 0.1);
}

.comm-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 420px;
  overflow-y: auto;
  padding-right: 2px;
}

.comm-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 20px;
  border: 1px solid rgba(176, 201, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
}

.comm-card.selected {
  border-color: rgba(82, 212, 255, 0.24);
  box-shadow: 0 0 0 1px rgba(82, 212, 255, 0.12);
}

.comm-card.unread {
  border-color: rgba(82, 212, 255, 0.32);
  box-shadow: 0 0 0 1px rgba(82, 212, 255, 0.18);
}

.comm-card.unread .comm-card-title {
  color: #f8fbff;
  font-weight: 700;
}

.comm-card-source-img {
  width: 16px;
  height: 16px;
  object-fit: contain;
  border-radius: 3px;
  display: inline-block;
  margin-right: 6px;
  vertical-align: middle;
}

.comm-card-unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: linear-gradient(135deg, #52d4ff, #8b7dff);
  color: #0b1224;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.02em;
  margin-left: auto;
}

.comm-card-top,
.comm-card-meta,
.comm-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.comm-card-source,
.comm-card-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.comm-card-state {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  font-weight: 700;
}

.comm-card.state-waiting_on_your_reply .comm-card-state {
  background: rgba(242, 184, 79, 0.14);
  color: #ffe1a3;
}

.comm-card.state-needs_approval .comm-card-state {
  background: rgba(255, 107, 127, 0.14);
  color: #ffc3cf;
}

.comm-card.state-needs_follow_up .comm-card-state {
  background: rgba(82, 212, 255, 0.14);
  color: #bdefff;
}

.comm-card.state-waiting_on_others .comm-card-state {
  background: rgba(47, 211, 157, 0.14);
  color: #bff8df;
}

.comm-card-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.comm-card-participant,
.comm-card-reason,
.comm-card-meta {
  font-size: 12px;
  color: var(--text-secondary);
}

.comm-card-reason {
  margin: 0;
  line-height: 1.45;
}

.comm-primary,
.comm-secondary,
.comm-ghost {
  border-radius: 12px;
  padding: 8px 11px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
}

.comm-primary {
  border: none;
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.18), rgba(139, 125, 255, 0.16));
  color: var(--text-primary);
}

.comm-secondary,
.comm-ghost {
  border: 1px solid var(--border-default);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary);
}

.comm-ghost.danger {
  color: #ffb4c1;
}

.comm-empty {
  padding: 18px 12px;
  border-radius: 18px;
  border: 1px dashed rgba(176, 201, 255, 0.18);
  text-align: center;
  color: var(--text-secondary);
}

.comm-empty strong {
  display: block;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.comm-empty p {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
}
</style>
