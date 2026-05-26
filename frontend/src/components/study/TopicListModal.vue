<template>
  <div class="tlm-mask" @click.self="$emit('close')">
    <div class="tlm-modal">
      <header class="tlm-head">
        <div>
          <span class="tlm-eyebrow">{{ goalTitle || 'Study Hub' }}</span>
          <h3>{{ title }}</h3>
          <p v-if="subtitle" class="tlm-sub">{{ subtitle }}</p>
        </div>
        <button class="tlm-icon-btn" type="button" aria-label="Close" @click="$emit('close')">×</button>
      </header>

      <div class="tlm-body">
        <p v-if="!items.length" class="tlm-empty">No topics match this filter.</p>
        <ul v-else class="tlm-list">
          <li v-for="topic in items" :key="topic._id" class="tlm-row">
            <div class="tlm-row-main">
              <h4>{{ topic.title }}</h4>
              <p class="tlm-row-meta">
                <span v-if="topic.subject">{{ topic.subject }}</span>
                <span v-if="topic.category"> · {{ topic.category }}</span>
                <span v-if="topic.difficulty"> · {{ topic.difficulty }}</span>
                <span class="tlm-status" :data-status="topic.status">{{ statusLabel(topic.status) }}</span>
                <span v-if="topic.nextRevisionAt">· Next revision {{ formatDate(topic.nextRevisionAt) }}</span>
              </p>
            </div>
            <div class="tlm-row-actions">
              <button class="tlm-link" type="button" @click="$emit('openTopic', topic._id)">
                Open
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  goalTitle: { type: String, default: '' },
  items: { type: Array, default: () => [] },
})

defineEmits(['close', 'openTopic'])

const STATUS_LABELS = Object.freeze({
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  weak: 'Weak',
  revision_due: 'Revision due',
})

function statusLabel(value) {
  return STATUS_LABELS[value] || value || ''
}
function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}
</script>

<style scoped>
.tlm-mask {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.62);
    z-index: 200;
}
.tlm-modal {
  width: min(640px, 100%);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.48);
  color: var(--text-primary);
  overflow: hidden;
}
.tlm-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px 16px;
}
.tlm-eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 10.5px;
  font-weight: 600;
  color: rgba(79, 140, 255, 0.78);
}
.tlm-head h3 {
  margin: 6px 0 4px;
  font-size: 18px;
  font-weight: 600;
}
.tlm-sub {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted);
}
.tlm-icon-btn {
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  width: 32px;
  height: 32px;
  font-size: 18px;
  color: var(--text-secondary);
  cursor: pointer;
}
.tlm-icon-btn:hover { color: var(--text-primary); }
.tlm-body {
  padding: 0 24px 22px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(79, 140, 255, 0.32) transparent;
}
.tlm-empty {
  margin: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}
.tlm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.tlm-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}
.tlm-row-main h4 { margin: 0; font-size: 14px; font-weight: 600; }
.tlm-row-meta {
  margin: 4px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  align-items: center;
}
.tlm-status {
  text-transform: capitalize;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--border-subtle);
  color: var(--text-secondary);
  font-size: 10.5px;
}
.tlm-status[data-status="in_progress"] { background: rgba(79, 140, 255, 0.18); color: var(--accent-hover); }
.tlm-status[data-status="completed"] { background: rgba(47, 211, 157, 0.18); color: #6fe0bc; }
.tlm-status[data-status="weak"] { background: rgba(255, 107, 127, 0.16); color: #ff8ea1; }
.tlm-status[data-status="revision_due"] { background: rgba(242, 184, 79, 0.16); color: #f6c577; }
.tlm-link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: 12.5px;
  color: var(--accent-hover);
  cursor: pointer;
}
.tlm-link:hover { text-decoration: underline; }
</style>
