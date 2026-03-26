<template>
  <article class="priority-card" :class="[`priority-${priorityTone}`, expanded && 'priority-card-expanded']">
    <div class="priority-card-top" @click="expanded = !expanded">
      <div class="priority-card-meta">
        <span class="priority-source">
          <span>{{ item.sourceIcon }}</span>
          <span>{{ item.sourceLabel }}</span>
        </span>
        <span class="priority-level" :class="`level-${priorityTone}`">{{ item.priority }}</span>
      </div>

      <div class="priority-card-headline">
        <h4>{{ item.title }}</h4>
        <button class="priority-expand-btn" @click.stop="expanded = !expanded">
          {{ expanded ? 'Hide details' : 'Open details' }}
        </button>
      </div>

      <p class="priority-reason">{{ item.reason }}</p>
      <p class="priority-why"><strong>Why this matters</strong> {{ item.whyThisMatters }}</p>
      <div class="priority-next">
        <span class="priority-next-label">Next action</span>
        <span class="priority-next-text">{{ item.action?.label || item.suggestedNextAction }}</span>
      </div>
    </div>

    <div class="priority-controls">
      <button class="priority-control approve" :disabled="busy" @click.stop="emit('approve', item)">Approve</button>
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
import { computed, ref, watch } from 'vue'

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

const snoozeOptions = [
  { label: '1h', minutes: 60 },
  { label: '3h', minutes: 180 },
  { label: 'Tomorrow', minutes: 16 * 60 },
]

const priorityTone = computed(() => String(props.item.priority || 'low').toLowerCase())
const editInputId = computed(() => `priority-edit-${String(props.item.id || 'item').replace(/[^a-zA-Z0-9_-]/g, '-')}`)

watch(
  () => props.item,
  (nextItem) => {
    editText.value = nextItem?.suggestedNextAction || ''
    expanded.value = false
    editing.value = false
    showSnoozeOptions.value = false
  }
)

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
  gap: 14px;
  padding: 18px;
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.015)),
    rgba(9, 13, 27, 0.72);
  box-shadow: 0 20px 40px rgba(2, 6, 23, 0.22);
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.priority-card:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.14);
}

.priority-card-expanded {
  border-color: rgba(99, 102, 241, 0.28);
  box-shadow: 0 24px 46px rgba(35, 44, 120, 0.2);
}

.priority-high {
  background:
    radial-gradient(circle at top right, rgba(239, 68, 68, 0.16), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.015)),
    rgba(9, 13, 27, 0.82);
}

.priority-medium {
  background:
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.14), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.015)),
    rgba(9, 13, 27, 0.82);
}

.priority-low {
  background:
    radial-gradient(circle at top right, rgba(34, 197, 94, 0.12), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.015)),
    rgba(9, 13, 27, 0.82);
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
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.priority-source {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(226, 232, 240, 0.88);
}

.priority-level.level-high {
  background: rgba(239, 68, 68, 0.14);
  color: #fecaca;
  border: 1px solid rgba(248, 113, 113, 0.24);
}

.priority-level.level-medium {
  background: rgba(245, 158, 11, 0.14);
  color: #fde68a;
  border: 1px solid rgba(251, 191, 36, 0.24);
}

.priority-level.level-low {
  background: rgba(34, 197, 94, 0.14);
  color: #bbf7d0;
  border: 1px solid rgba(74, 222, 128, 0.22);
}

.priority-card-headline h4 {
  font-size: 18px;
  line-height: 1.35;
  color: var(--text-primary);
}

.priority-expand-btn {
  border: 0;
  background: transparent;
  color: rgba(191, 219, 254, 0.78);
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
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.06);
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
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(226, 232, 240, 0.82);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.priority-control.approve,
.priority-primary-action {
  border: 1px solid rgba(99, 102, 241, 0.26);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.24), rgba(59, 130, 246, 0.2));
  color: #eef2ff;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
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
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(5, 10, 22, 0.68);
  color: var(--text-primary);
  padding: 12px 14px;
  font: inherit;
  min-height: 92px;
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
