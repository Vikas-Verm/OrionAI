<template>
  <div class="sh-modal-mask" @click.self="$emit('close')">
    <div class="sh-modal sh-modal--wide">
      <header class="sh-modal-head">
        <div>
          <h3>Suggested topics for {{ goal?.title || 'this goal' }}</h3>
          <p class="sh-modal-sub">
            OrionAI generated these as a starting point. Pick, edit, or remove anything
            you don’t want before saving.
          </p>
        </div>
        <button class="sh-icon-btn" type="button" @click="$emit('close')" aria-label="Close">×</button>
      </header>

      <div v-if="loading" class="sh-suggest-state">
        <span class="sh-spinner" aria-hidden="true"></span>
        <strong>OrionAI is drafting topics…</strong>
        <p>Using your goal, purpose, and level. This usually takes a few seconds.</p>
      </div>

      <div v-else-if="error" class="sh-suggest-state sh-suggest-state--error">
        <strong>{{ error }}</strong>
        <p>You can try again or add topics manually.</p>
        <div class="sh-form-actions sh-form-actions--center">
          <button class="sh-btn sh-btn--ghost" type="button" @click="$emit('close')">Close</button>
          <button class="sh-btn sh-btn--primary" type="button" @click="loadSuggestions">Try again</button>
        </div>
      </div>

      <div v-else-if="!suggestions.length" class="sh-suggest-state">
        <strong>{{ emptyHint || 'OrionAI couldn’t confidently suggest topics for this goal.' }}</strong>
        <p>Try regenerating, or add topics manually.</p>
        <div class="sh-form-actions sh-form-actions--center">
          <button class="sh-btn sh-btn--ghost" type="button" @click="$emit('close')">Close</button>
          <button class="sh-btn sh-btn--primary" type="button" @click="loadSuggestions">Try again</button>
        </div>
      </div>

      <div v-else class="sh-suggest-list">
        <div class="sh-suggest-toolbar">
          <label class="sh-suggest-check">
            <input
              type="checkbox"
              :checked="allSelected"
              :indeterminate="someSelected && !allSelected"
              @change="toggleAll"
            />
            <span>{{ selectedCount }} of {{ suggestions.length }} selected</span>
          </label>
          <button class="sh-link" type="button" :disabled="saving" @click="loadSuggestions">
            Regenerate
          </button>
        </div>

        <article
          v-for="(item, index) in suggestions"
          :key="index"
          class="sh-suggest-card"
          :class="{ 'sh-suggest-card--selected': item.selected }"
        >
          <label class="sh-suggest-check sh-suggest-check--row">
            <input type="checkbox" v-model="item.selected" />
            <span class="sh-suggest-card-index">{{ index + 1 }}</span>
          </label>
          <div class="sh-suggest-card-body">
            <input
              class="sh-suggest-input sh-suggest-input--title"
              type="text"
              v-model="item.title"
              maxlength="160"
              placeholder="Topic title"
            />
            <div class="sh-suggest-row">
              <input
                class="sh-suggest-input"
                type="text"
                v-model="item.subject"
                maxlength="60"
                placeholder="Subject (optional)"
              />
              <select class="sh-suggest-input" v-model="item.difficulty">
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <input
                class="sh-suggest-input"
                type="number"
                min="0"
                step="5"
                v-model.number="item.estimatedMinutes"
                placeholder="Minutes"
              />
            </div>
            <p v-if="item.reason" class="sh-suggest-reason">{{ item.reason }}</p>
          </div>
        </article>
      </div>

      <p v-if="actionError" class="sh-form-error">{{ actionError }}</p>

      <footer v-if="!loading && !error" class="sh-form-actions">
        <button class="sh-btn sh-btn--ghost" type="button" :disabled="saving" @click="$emit('close')">
          Cancel
        </button>
        <button
          class="sh-btn sh-btn--primary"
          type="button"
          :disabled="saving || selectedCount === 0"
          @click="saveSelected"
        >
          {{ saving ? 'Saving…' : `Add ${selectedCount} topic${selectedCount === 1 ? '' : 's'}` }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { studyAPI } from '../../services/api'

const props = defineProps({
  goal: { type: Object, required: true },
})
const emit = defineEmits(['close', 'saved'])

const suggestions = reactive([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const actionError = ref('')

const selectedCount = computed(
  () => suggestions.filter((s) => s.selected).length
)
const allSelected = computed(
  () => suggestions.length > 0 && suggestions.every((s) => s.selected)
)
const someSelected = computed(() => suggestions.some((s) => s.selected))

function hydrate(list) {
  suggestions.splice(0, suggestions.length)
  for (const entry of list) {
    suggestions.push({
      selected: true,
      title: entry.title || '',
      subject: entry.subject || '',
      difficulty: entry.difficulty || 'medium',
      estimatedMinutes:
        entry.estimatedMinutes === null || entry.estimatedMinutes === undefined
          ? 30
          : entry.estimatedMinutes,
      reason: entry.reason || '',
    })
  }
}

function toggleAll(event) {
  const value = event.target.checked
  for (const entry of suggestions) entry.selected = value
}

const emptyHint = ref('')

async function loadSuggestions() {
  loading.value = true
  error.value = ''
  actionError.value = ''
  emptyHint.value = ''
  try {
    const { data } = await studyAPI.suggestTopics(props.goal._id, {
      excludeExisting: true,
      limit: 10,
    })
    const list = Array.isArray(data?.suggestedTopics) ? data.suggestedTopics : []
    hydrate(list)
    if (!list.length && data?.message) emptyHint.value = data.message
  } catch (err) {
    error.value =
      err?.response?.data?.error ||
      'OrionAI could not generate topics right now.'
  } finally {
    loading.value = false
  }
}

async function saveSelected() {
  const chosen = suggestions
    .filter((s) => s.selected && s.title.trim())
    .map((s) => ({
      title: s.title.trim(),
      subject: (s.subject || '').trim(),
      difficulty: s.difficulty,
      estimatedMinutes:
        s.estimatedMinutes === null || s.estimatedMinutes === ''
          ? null
          : Number(s.estimatedMinutes),
    }))
  if (!chosen.length) {
    actionError.value = 'Select at least one topic.'
    return
  }
  saving.value = true
  actionError.value = ''
  try {
    const { data } = await studyAPI.createTopicsBulk({
      goalId: props.goal._id,
      topics: chosen,
    })
    emit('saved', {
      topics: data?.topics || [],
      createdCount: data?.createdCount || 0,
      skippedDuplicates: data?.skippedDuplicates || 0,
    })
  } catch (err) {
    actionError.value =
      err?.response?.data?.error || 'Could not save topics. Try again.'
  } finally {
    saving.value = false
  }
}

onMounted(loadSuggestions)
</script>

<style scoped>
.sh-modal-mask {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(2, 6, 23, 0.62);
  backdrop-filter: blur(16px);
  z-index: 200;
}
.sh-modal {
  width: min(640px, 100%);
  max-height: 90vh;
  overflow: auto;
  border-radius: 24px;
  border: 1px solid rgba(176, 201, 255, 0.18);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015)),
    rgba(9, 14, 30, 0.94);
  box-shadow: 0 32px 80px rgba(2, 6, 23, 0.48);
  color: var(--text-primary);
}
.sh-modal--wide { width: min(720px, 100%); }

.sh-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px 8px;
}
.sh-modal-head h3 {
  margin: 0;
  font-size: 19px;
  font-weight: 600;
}
.sh-modal-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-muted);
  max-width: 60ch;
}
.sh-icon-btn {
  background: transparent;
  border: 1px solid rgba(176, 201, 255, 0.14);
  border-radius: 12px;
  width: 32px;
  height: 32px;
  font-size: 18px;
  color: var(--text-secondary);
  cursor: pointer;
}
.sh-icon-btn:hover { color: var(--text-primary); }

.sh-suggest-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 40px 24px;
  color: var(--text-secondary);
}
.sh-suggest-state strong { color: var(--text-primary); font-size: 14px; }
.sh-suggest-state p {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
  max-width: 48ch;
}
.sh-suggest-state--error strong { color: #ff8ea1; }

.sh-spinner {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 2px solid rgba(168, 190, 255, 0.16);
  border-top-color: rgba(82, 212, 255, 0.92);
  display: inline-block;
  animation: sh-spin 0.85s linear infinite;
}
@keyframes sh-spin { to { transform: rotate(360deg); } }

.sh-suggest-list {
  padding: 6px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sh-suggest-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 4px;
  border-bottom: 1px solid rgba(176, 201, 255, 0.08);
}
.sh-suggest-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}
.sh-suggest-check input { accent-color: #52d4ff; }
.sh-suggest-check--row { padding-top: 6px; align-items: flex-start; }
.sh-suggest-card-index {
  font-size: 11.5px;
  color: var(--text-faint);
}
.sh-suggest-card {
  display: grid;
  grid-template-columns: 26px 1fr;
  gap: 10px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(176, 201, 255, 0.1);
  background: rgba(8, 14, 30, 0.45);
}
.sh-suggest-card--selected {
  border-color: rgba(82, 212, 255, 0.32);
}
.sh-suggest-card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sh-suggest-input {
  width: 100%;
  border-radius: 10px;
  border: 1px solid rgba(176, 201, 255, 0.16);
  background: rgba(8, 14, 30, 0.62);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  padding: 8px 10px;
  outline: none;
  color-scheme: dark;
}
.sh-suggest-input:focus {
  border-color: rgba(82, 212, 255, 0.42);
  box-shadow: 0 0 0 3px rgba(82, 212, 255, 0.1);
}
.sh-suggest-input--title { font-weight: 600; }
.sh-suggest-row {
  display: grid;
  grid-template-columns: 1.4fr 1fr 0.8fr;
  gap: 8px;
}
.sh-suggest-reason {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.sh-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 24px 24px;
  border-top: 1px solid rgba(176, 201, 255, 0.06);
}
.sh-form-actions--center { justify-content: center; border-top: none; }
.sh-form-error {
  margin: 0;
  padding: 0 24px;
  color: #ff8ea1;
  font-size: 13px;
}
.sh-btn {
  border-radius: 999px;
  padding: 9px 18px;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}
.sh-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.sh-btn--ghost {
  background: transparent;
  border-color: rgba(176, 201, 255, 0.16);
  color: var(--text-secondary);
}
.sh-btn--primary {
  color: #050816;
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.92), rgba(139, 125, 255, 0.82));
  border-color: rgba(82, 212, 255, 0.42);
  box-shadow: 0 18px 38px rgba(82, 212, 255, 0.22);
}
.sh-btn--primary:hover:not(:disabled) { transform: translateY(-1px); }
.sh-link {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  color: var(--accent-hover);
}
.sh-link:disabled { color: var(--text-faint); cursor: not-allowed; }
.sh-link:hover:not(:disabled) { text-decoration: underline; }

@media (max-width: 640px) {
  .sh-suggest-row { grid-template-columns: 1fr; }
}
</style>
