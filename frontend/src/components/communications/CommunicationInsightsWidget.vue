<template>
  <section class="comm-insights" :class="{ open: isOpen }">
    <div class="comm-insights-bar">
      <div class="comm-insights-copy">
        <span class="comm-insights-kicker">{{ title }}</span>
        <p class="comm-insights-summary">{{ supportingText }}</p>
      </div>

      <div class="comm-insights-side">
        <div v-if="statChips.length" class="comm-insights-stats">
          <span
            v-for="chip in statChips"
            :key="chip.id"
            class="comm-insights-chip"
            :class="`state-${chip.id}`"
          >
            <strong>{{ chip.count }}</strong>
            <span>{{ chip.label }}</span>
          </span>
        </div>
        <span v-else class="comm-insights-empty">Native list stays primary.</span>

        <div class="comm-insights-actions">
          <button class="comm-insights-btn" :disabled="loading" @click="$emit('refresh')">
            Refresh
          </button>
          <button class="comm-insights-btn comm-insights-btn--primary" @click="isOpen = !isOpen">
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
          compact
          @refresh="$emit('refresh')"
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
import { computed, ref } from 'vue'
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

const actionableCount = computed(() => Number(props.counts?.actionableCount || 0))

const statChips = computed(() => {
  const chips = [
    {
      id: 'waiting_on_your_reply',
      count: Number(props.counts?.replyRequiredCount || 0),
      label: 'reply',
    },
    {
      id: 'needs_approval',
      count: Number(props.counts?.approvalCount || 0),
      label: 'approval',
    },
    {
      id: 'needs_follow_up',
      count: Number(props.counts?.followUpCount || 0),
      label: 'follow-up',
    },
  ]

  return chips.filter((chip) => chip.count > 0)
})

const supportingText = computed(() => {
  if (props.loading) {
    return 'Scanning for conversations that truly need your response.'
  }

  if (props.summaryText) {
    return props.summaryText
  }

  if (!actionableCount.value) {
    return 'No urgent AI priorities right now. Browse your normal inbox and chats as usual.'
  }

  return `${actionableCount.value} conversation${actionableCount.value === 1 ? '' : 's'} currently look action-worthy.`
})

const toggleLabel = computed(() => {
  if (isOpen.value) return 'Hide AI priorities'
  return actionableCount.value ? 'View AI priorities' : 'Open AI insights'
})
</script>

<style scoped>
.comm-insights {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.05), rgba(15, 23, 42, 0.02)),
    var(--bg-surface);
}

.comm-insights-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.comm-insights-copy {
  min-width: 0;
  flex: 1 1 220px;
}

.comm-insights-kicker {
  display: inline-flex;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.comm-insights-summary {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.comm-insights-side {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 10px;
  flex: 1 1 220px;
  flex-wrap: wrap;
}

.comm-insights-stats {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.comm-insights-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.14);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 600;
}

.comm-insights-chip strong {
  color: var(--text-primary);
  font-size: 11px;
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

.comm-insights-empty {
  font-size: 11px;
  color: var(--text-muted);
}

.comm-insights-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.comm-insights-btn {
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border-radius: 10px;
  padding: 7px 10px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
}

.comm-insights-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.comm-insights-btn--primary {
  border-color: rgba(59, 130, 246, 0.26);
  background: rgba(59, 130, 246, 0.12);
  color: var(--text-primary);
}

.comm-insights-panel {
  padding-top: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
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
</style>
