<template>
  <article class="priority-card" :class="[`priority-${priorityTone}`, expanded && 'priority-card-expanded']">
    <div class="priority-card-top" @click="expanded = !expanded">
      <div class="priority-card-meta">
        <span class="priority-source">
          <span>{{ item.sourceIcon }}</span>
          <span>{{ item.sourceLabel }}</span>
        </span>
        <span v-if="showStatusChips && item.actionStateLabel" class="priority-state-chip">{{ item.actionStateLabel }}</span>
        <span v-if="showStatusChips" class="priority-level" :class="`level-${priorityTone}`">{{ item.priority }}</span>
      </div>

      <div class="priority-card-headline">
        <h4>{{ item.title }}</h4>
        <button class="priority-expand-btn" @click.stop="expanded = !expanded">
          {{ expanded ? 'Hide details' : 'Open details' }}
        </button>
      </div>

      <p class="priority-reason">{{ displayReason }}</p>
      <p class="priority-why"><strong>Why this matters</strong> {{ displayWhyThisMatters }}</p>
      <div class="priority-next">
        <span class="priority-next-label">Next action</span>
        <span class="priority-next-text">{{ item.action?.label || item.suggestedNextAction }}</span>
      </div>
    </div>

    <div class="priority-controls">
      <button class="priority-control approve" :disabled="busy" @click.stop="emit('approve', item)">{{ approveLabel }}</button>
      <button class="priority-control" :disabled="busy" @click.stop="toggleEdit">Edit</button>
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

    <div v-if="expanded || editing" class="priority-panel">
      <p class="priority-panel-copy">{{ item.suggestedNextAction }}</p>

      <div v-if="editing" class="priority-edit-panel">
        <label :for="editInputId">Adjust the plan before approving</label>
        <textarea
          :id="editInputId"
          v-model="editText"
          rows="3"
          :disabled="busy"
        />
        <div class="priority-panel-actions">
          <button class="priority-primary-action" :disabled="busy || !editText.trim()" @click.stop="emitEditedApproval">
            Approve edited action
          </button>
          <button class="priority-secondary-action" :disabled="busy" @click.stop="editing = false">Cancel</button>
        </div>
      </div>

      <div v-else class="priority-panel-actions">
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
  </article>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  item: { type: Object, required: true },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits([
  'approve',
  'dismiss',
  'snooze',
  'edited-approve',
  'run-action',
  'run-secondary-action',
])

const expanded = ref(false)
const editing = ref(false)
const showSnoozeOptions = ref(false)
const editText = ref(props.item.suggestedNextAction || '')
const nowTick = ref(Date.now())
let relativeTimer = null

const snoozeOptions = [
  { label: '1h', minutes: 60 },
  { label: '3h', minutes: 180 },
  { label: 'Tomorrow', minutes: 16 * 60 },
]

const priorityTone = computed(() => String(props.item.priority || 'low').toLowerCase())
const showStatusChips = computed(() =>
  props.item?.sourceApp !== 'google_calendar' && props.item?.category !== 'meetings'
)
const approveLabel = computed(() =>
  props.item?.actionState === 'needs_approval' ? 'Handled' : 'Mark done'
)
const editInputId = computed(() => `priority-edit-${String(props.item.id || 'item').replace(/[^a-zA-Z0-9_-]/g, '-')}`)
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

watch(
  () => props.item,
  (nextItem) => {
    editText.value = nextItem?.suggestedNextAction || ''
    expanded.value = false
    editing.value = false
    showSnoozeOptions.value = false
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

function toggleEdit() {
  expanded.value = true
  editing.value = !editing.value
  showSnoozeOptions.value = false
}

function toggleSnooze() {
  expanded.value = true
  editing.value = false
  showSnoozeOptions.value = !showSnoozeOptions.value
}

function emitEditedApproval() {
  emit('edited-approve', { item: props.item, note: editText.value.trim() })
}
</script>

<style scoped>
.priority-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: 28px;
  border: 1px solid rgba(176, 201, 255, 0.1);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015)),
    rgba(8, 14, 30, 0.8);
  box-shadow: 0 28px 64px rgba(2, 6, 23, 0.22);
  backdrop-filter: blur(20px);
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.priority-card:hover {
  transform: translateY(-2px);
  border-color: rgba(176, 201, 255, 0.16);
}

.priority-card-expanded {
  border-color: rgba(82, 212, 255, 0.24);
  box-shadow: 0 28px 72px rgba(82, 212, 255, 0.12);
}

.priority-high {
  background:
    radial-gradient(circle at top right, rgba(255, 107, 127, 0.18), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015)),
    rgba(9, 13, 27, 0.84);
}

.priority-medium {
  background:
    radial-gradient(circle at top right, rgba(242, 184, 79, 0.18), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015)),
    rgba(9, 13, 27, 0.84);
}

.priority-low {
  background:
    radial-gradient(circle at top right, rgba(47, 211, 157, 0.16), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015)),
    rgba(9, 13, 27, 0.84);
}

.priority-card-top {
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: pointer;
}

.priority-card-meta,
.priority-card-headline,
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
  min-height: 34px;
  padding: 0 13px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.priority-state-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.priority-source {
  border: 1px solid rgba(176, 201, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(226, 232, 240, 0.88);
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
  font-size: 19px;
  line-height: 1.35;
  color: var(--text-primary);
}

.priority-expand-btn {
  border: 0;
  background: transparent;
  color: rgba(191, 226, 255, 0.82);
  font-size: 12px;
  cursor: pointer;
}

.priority-reason,
.priority-why,
.priority-panel-copy {
  color: rgba(226, 232, 240, 0.74);
  font-size: 13px;
  line-height: 1.6;
}

.priority-why strong {
  color: var(--text-primary);
  margin-right: 6px;
}

.priority-next {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 15px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(176, 201, 255, 0.1);
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
  font-size: 13px;
  line-height: 1.6;
}

.priority-control,
.priority-mini-action,
.priority-secondary-action {
  border: 1px solid rgba(176, 201, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(226, 232, 240, 0.82);
  border-radius: 14px;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.priority-control.approve,
.priority-primary-action {
  border: 1px solid rgba(82, 212, 255, 0.22);
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.2), rgba(139, 125, 255, 0.2));
  color: #eef2ff;
  border-radius: 14px;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.priority-control:hover:not(:disabled),
.priority-mini-action:hover:not(:disabled),
.priority-secondary-action:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(176, 201, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
}

.priority-control.approve:hover:not(:disabled),
.priority-primary-action:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(82, 212, 255, 0.3);
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.26), rgba(139, 125, 255, 0.24));
}

.priority-panel,
.priority-edit-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.priority-edit-panel label {
  color: rgba(226, 232, 240, 0.78);
  font-size: 12px;
  font-weight: 600;
}

.priority-edit-panel textarea {
  width: 100%;
  resize: vertical;
  border-radius: 16px;
  border: 1px solid rgba(176, 201, 255, 0.1);
  background: rgba(5, 10, 22, 0.68);
  color: var(--text-primary);
  padding: 12px 14px;
  font: inherit;
  min-height: 92px;
}

.priority-edit-panel textarea:focus {
  outline: none;
  border-color: rgba(82, 212, 255, 0.26);
  box-shadow: 0 0 0 4px rgba(82, 212, 255, 0.08);
}

button:disabled {
  opacity: 0.55;
  cursor: wait;
}

:global([data-theme="light"]) .priority-card {
  border-color: rgba(148, 163, 184, 0.22);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(244, 247, 255, 0.92)),
    rgba(255, 255, 255, 0.9);
  box-shadow: 0 18px 34px rgba(148, 163, 184, 0.16);
}

:global([data-theme="light"]) .priority-source,
:global([data-theme="light"]) .priority-control,
:global([data-theme="light"]) .priority-mini-action,
:global([data-theme="light"]) .priority-secondary-action,
:global([data-theme="light"]) .priority-next,
:global([data-theme="light"]) .priority-edit-panel textarea {
  border-color: rgba(148, 163, 184, 0.2);
  background: rgba(255, 255, 255, 0.84);
  color: rgba(15, 23, 42, 0.86);
}

@media (max-width: 720px) {
  .priority-card {
    padding: 16px;
    border-radius: 20px;
  }
}
</style>
