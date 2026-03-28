<template>
  <section class="comm-insights" :class="[`mode-${visualMode}`, { open: isOpen }]">
    <div class="comm-insights-bar">
      <div class="comm-insights-main">
        <div class="comm-insights-heading">
          <span class="comm-insights-kicker">{{ title }}</span>
          <span v-if="visualMode === 'high'" class="comm-insights-status">Needs attention</span>
        </div>

        <p class="comm-insights-summary">{{ primaryText }}</p>
        <p v-if="secondaryText" class="comm-insights-detail">{{ secondaryText }}</p>
      </div>

      <div class="comm-insights-side">
        <div
          v-if="signalChips.length"
          class="comm-insights-filters"
          role="tablist"
          aria-label="OrionAI filters"
        >
          <button
            v-for="chip in signalChips"
            :key="chip.id"
            type="button"
            class="comm-insights-chip"
            :class="[
              `state-${chip.id}`,
              activeFilter === chip.id && 'active',
              chip.disabled && 'disabled',
            ]"
            :disabled="chip.disabled"
            :aria-pressed="activeFilter === chip.id"
            @click="openFilter(chip.id)"
          >
            <strong>{{ chip.count }}</strong>
            <span>{{ chip.label }}</span>
          </button>
        </div>

        <div v-else class="comm-insights-quiet" aria-label="OrionAI counts">
          <span
            v-for="chip in quietChips"
            :key="chip.id"
            class="comm-insights-quiet-pill"
          >
            <strong>{{ chip.count }}</strong>
            <span>{{ chip.label }}</span>
          </span>
        </div>

        <div class="comm-insights-actions">
          <button
            type="button"
            class="comm-insights-btn comm-insights-btn--icon"
            :disabled="loading"
            title="Refresh OrionAI insights"
            @click="$emit('refresh')"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
          <button
            type="button"
            class="comm-insights-btn"
            :class="[
              visualMode === 'high' && 'comm-insights-btn--primary',
              visualMode === 'zero' && 'comm-insights-btn--quiet',
            ]"
            @click="togglePanel()"
          >
            {{ toggleLabel }}
          </button>
        </div>
      </div>
    </div>

    <transition name="comm-insights-reveal">
      <div v-if="isOpen" class="comm-insights-panel">
        <CommunicationActionPanel
          :title="panelTitle"
          :headline="panelHeadline"
          :summary-text="summaryText"
          :items="items"
          :groups="groups"
          :loading="loading"
          :selected-conversation-id="selectedConversationId"
          :active-filter="activeFilter"
          compact
          @refresh="$emit('refresh')"
          @filter-change="activeFilter = $event"
          @open="$emit('open', $event)"
          @draft="$emit('draft', $event)"
          @done="$emit('done', $event)"
          @snooze="$emit('snooze', $event)"
          @dismiss="$emit('dismiss', $event)"
        />
      </div>
    </transition>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import CommunicationActionPanel from './CommunicationActionPanel.vue'

const props = defineProps({
  title: { type: String, default: 'OrionAI insights' },
  panelTitle: { type: String, default: 'Reply / Action Required' },
  panelHeadline: { type: String, default: '' },
  summaryText: { type: String, default: '' },
  counts: { type: Object, default: () => ({}) },
  items: { type: Array, default: () => [] },
  groups: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  selectedConversationId: { type: [String, Number], default: null },
})

defineEmits(['refresh', 'open', 'draft', 'done', 'snooze', 'dismiss'])

const isOpen = ref(false)
const activeFilter = ref('all')

const replyCount = computed(() => Number(props.counts?.replyRequiredCount || 0))
const approvalCount = computed(() => Number(props.counts?.approvalCount || 0))
const followUpCount = computed(() => Number(props.counts?.followUpCount || 0))
const actionableCount = computed(() => Number(props.counts?.actionableCount || 0))

const visualMode = computed(() => {
  if (props.loading) return 'loading'
  if (!actionableCount.value) return 'zero'
  if (approvalCount.value > 0 || replyCount.value >= 3 || actionableCount.value >= 4) return 'high'
  return 'low'
})

const quietChips = computed(() => [
  { id: 'waiting_on_your_reply', count: replyCount.value, label: 'Waiting' },
  { id: 'needs_approval', count: approvalCount.value, label: 'Approvals' },
  { id: 'needs_follow_up', count: followUpCount.value, label: 'Follow-up' },
])

const signalChips = computed(() => {
  if (!actionableCount.value) return []

  return [
    { id: 'all', count: actionableCount.value, label: 'All', disabled: false },
    {
      id: 'waiting_on_your_reply',
      count: replyCount.value,
      label: 'Waiting',
      disabled: replyCount.value === 0,
    },
    {
      id: 'needs_approval',
      count: approvalCount.value,
      label: 'Approvals',
      disabled: approvalCount.value === 0,
    },
    {
      id: 'needs_follow_up',
      count: followUpCount.value,
      label: 'Follow-up',
      disabled: followUpCount.value === 0,
    },
  ].filter((chip) => chip.id === 'all' || chip.count > 0)
})

const countSummary = computed(() => {
  const parts = []
  if (replyCount.value) parts.push(`${replyCount.value} waiting`)
  if (approvalCount.value) parts.push(`${approvalCount.value} approval${approvalCount.value === 1 ? '' : 's'}`)
  if (followUpCount.value) parts.push(`${followUpCount.value} follow-up${followUpCount.value === 1 ? '' : 's'}`)
  return parts.join(' • ')
})

const primaryText = computed(() => {
  if (props.loading) return 'Scanning OrionAI insights'
  if (!actionableCount.value) return 'No urgent replies right now'
  if (approvalCount.value) {
    return `${approvalCount.value} approval request${approvalCount.value === 1 ? '' : 's'} needs attention`
  }
  if (replyCount.value) {
    return `${replyCount.value} conversation${replyCount.value === 1 ? '' : 's'} waiting on your reply`
  }
  if (followUpCount.value) {
    return `${followUpCount.value} follow-up${followUpCount.value === 1 ? '' : 's'} suggested`
  }
  return 'OrionAI found conversations worth a look'
})

const secondaryText = computed(() => {
  if (props.loading) return 'Checking for reply, approval, and follow-up signals.'
  // if (!actionableCount.value) {
  //   return '0 waiting • 0 approvals • 0 follow-ups'
  // }
  if (countSummary.value) return countSummary.value
  if (props.summaryText) return props.summaryText
  return ''
})

const toggleLabel = computed(() => {
  if (isOpen.value) return 'Hide'
  if (!actionableCount.value) return 'AI insights'
  if (visualMode.value === 'high') return 'Open AI priorities'
  return 'View AI insights'
})

watch(actionableCount, (nextCount) => {
  if (!nextCount && activeFilter.value !== 'all') {
    activeFilter.value = 'all'
  }
})

function openFilter(filterId) {
  if (!filterId || props.loading) return
  activeFilter.value = filterId
  isOpen.value = true
}

function togglePanel() {
  isOpen.value = !isOpen.value
  if (isOpen.value && !actionableCount.value) {
    activeFilter.value = 'all'
  }
}
</script>

<style scoped>
.comm-insights {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.015)),
    var(--bg-surface);
  transition:
    padding 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.comm-insights.mode-zero {
  gap: 6px;
  padding: 7px 10px;
  border-color: rgba(148, 163, 184, 0.08);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.015), rgba(15, 23, 42, 0)),
    var(--bg-surface);
}

.comm-insights.mode-low {
  padding: 8px 10px;
}

.comm-insights.mode-high {
  padding: 10px 11px;
  border-color: rgba(59, 130, 246, 0.18);
  background:
    linear-gradient(180deg, rgba(59, 130, 246, 0.05), rgba(15, 23, 42, 0.015)),
    var(--bg-surface);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
}

.comm-insights-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px 12px;
  flex-wrap: wrap;
}

.comm-insights-main {
  min-width: 0;
  flex: 1 1 190px;
}

.comm-insights-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.comm-insights-kicker {
  display: inline-flex;
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.1);
  color: #1d4ed8;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.comm-insights-status {
  display: inline-flex;
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.1);
  color: #b91c1c;
  font-size: 9.5px;
  font-weight: 700;
}

.comm-insights-summary {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-primary);
}

.comm-insights.mode-zero .comm-insights-summary {
  margin-top: 3px;
}

.comm-insights-detail {
  margin: 3px 0 0;
  font-size: 10.5px;
  line-height: 1.35;
  color: var(--text-muted);
}

.comm-insights.mode-zero .comm-insights-detail {
  font-size: 10px;
  color: var(--text-secondary);
}

.comm-insights-side {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 1 1 220px;
  flex-wrap: wrap;
}

.comm-insights-filters,
.comm-insights-quiet {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.comm-insights-chip,
.comm-insights-quiet-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 600;
}

.comm-insights-chip {
  border: 1px solid transparent;
  background: rgba(148, 163, 184, 0.14);
  color: var(--text-secondary);
  cursor: pointer;
}

.comm-insights-chip strong,
.comm-insights-quiet-pill strong {
  font-size: 10px;
  color: var(--text-primary);
}

.comm-insights-chip.active {
  border-color: rgba(59, 130, 246, 0.28);
  background: rgba(59, 130, 246, 0.14);
  color: var(--text-primary);
}

.comm-insights-chip.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.comm-insights-chip.state-waiting_on_your_reply {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.comm-insights-chip.state-needs_approval {
  background: rgba(239, 68, 68, 0.14);
  color: #b91c1c;
}

.comm-insights-chip.state-needs_follow_up {
  background: rgba(14, 165, 233, 0.14);
  color: #0369a1;
}

.comm-insights-quiet-pill {
  background: rgba(148, 163, 184, 0.08);
  color: var(--text-muted);
}

.comm-insights-quiet-pill strong {
  color: var(--text-secondary);
}

.comm-insights-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.comm-insights-btn {
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border-radius: 9px;
  padding: 6px 9px;
  cursor: pointer;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1;
}

.comm-insights-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.comm-insights-btn--icon {
  width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.comm-insights-btn--primary {
  border-color: rgba(59, 130, 246, 0.3);
  background: rgba(59, 130, 246, 0.14);
  color: var(--text-primary);
}

.comm-insights-btn--quiet {
  background: transparent;
  color: var(--text-secondary);
}

.comm-insights-panel {
  padding-top: 8px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.comm-insights.mode-zero .comm-insights-panel {
  padding-top: 7px;
}

.comm-insights-reveal-enter-active,
.comm-insights-reveal-leave-active {
  transition: all 0.18s ease;
}

.comm-insights-reveal-enter-from,
.comm-insights-reveal-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 720px) {
  .comm-insights-side {
    width: 100%;
    justify-content: space-between;
  }

  .comm-insights-filters,
  .comm-insights-quiet {
    justify-content: flex-start;
  }

  .comm-insights-actions {
    margin-left: 0;
  }
}
</style>
