<template>
  <div class="sh-modal-mask" @click.self="$emit('close')">
    <div class="sh-modal">
      <header class="sh-modal-head">
        <div>
          <h3>{{ topic ? 'Edit topic' : 'Add topic' }}</h3>
          <p class="sh-modal-sub">A topic can be anything: a chapter, a skill, a concept, a unit, or an idea you want to learn.</p>
        </div>
        <button class="sh-icon-btn" type="button" @click="$emit('close')" aria-label="Close">×</button>
      </header>

      <form class="sh-form" @submit.prevent="onSubmit">
        <label class="sh-field">
          <span>Topic title</span>
          <input v-model="form.title" type="text" required maxlength="160"
            placeholder="e.g. Photosynthesis, React Hooks, English Speaking Practice"
            autocomplete="off" />
        </label>

        <div class="sh-field-row">
          <label class="sh-field">
            <span>Subject <span class="sh-optional">(optional)</span></span>
            <input v-model="form.subject" type="text" maxlength="60"
              placeholder="Biology, Frontend, Communication…" />
          </label>
          <label class="sh-field">
            <span>Category <span class="sh-optional">(optional)</span></span>
            <input v-model="form.category" type="text" maxlength="60"
              placeholder="Chapter 5, Module 2, Unit A…" />
          </label>
        </div>

        <div class="sh-field-row">
          <label class="sh-field">
            <span>Difficulty</span>
            <select v-model="form.difficulty">
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label class="sh-field">
            <span>Estimated time (minutes)</span>
            <input v-model.number="form.estimatedMinutes" type="number" min="0" step="5"
              placeholder="30" />
          </label>
        </div>

        <p v-if="error" class="sh-form-error">{{ error }}</p>

        <footer class="sh-form-actions">
          <button class="sh-btn sh-btn--ghost" type="button" :disabled="saving" @click="$emit('close')">
            Cancel
          </button>
          <button class="sh-btn sh-btn--primary" type="submit" :disabled="saving">
            {{ saving ? 'Saving…' : topic ? 'Save changes' : 'Add topic' }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { studyAPI } from '../../services/api'

const props = defineProps({
  topic: { type: Object, default: null },
  goalId: { type: String, default: '' },
})
const emit = defineEmits(['close', 'saved'])

const form = reactive({
  title: '',
  subject: '',
  category: '',
  difficulty: 'medium',
  estimatedMinutes: 30,
})

const saving = ref(false)
const error = ref('')

function hydrate(topic) {
  if (!topic) return
  form.title = topic.title || ''
  form.subject = topic.subject || ''
  form.category = topic.category || ''
  form.difficulty = topic.difficulty || 'medium'
  form.estimatedMinutes =
    topic.estimatedMinutes === null || topic.estimatedMinutes === undefined
      ? 30
      : topic.estimatedMinutes
}

watch(() => props.topic, (t) => hydrate(t), { immediate: true })

async function onSubmit() {
  if (saving.value) return
  if (!form.title.trim()) {
    error.value = 'Please add a topic title.'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const payload = {
      title: form.title.trim(),
      subject: form.subject.trim(),
      category: form.category.trim(),
      difficulty: form.difficulty,
      estimatedMinutes:
        form.estimatedMinutes === '' || form.estimatedMinutes === null
          ? null
          : Number(form.estimatedMinutes),
    }
    let response
    if (props.topic) {
      response = await studyAPI.updateTopic(props.topic._id, payload)
    } else {
      if (!props.goalId) {
        throw new Error('Missing goalId')
      }
      response = await studyAPI.createTopic({ ...payload, goalId: props.goalId })
    }
    emit('saved', response.data.topic)
  } catch (err) {
    error.value =
      err?.response?.data?.error || 'Could not save topic. Please try again.'
  } finally {
    saving.value = false
  }
}
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
  width: min(520px, 100%);
  max-height: 90vh;
  overflow: auto;
  border-radius: 24px;
  border: 1px solid rgba(176, 201, 255, 0.18);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015)),
    rgba(9, 14, 30, 0.92);
  box-shadow: 0 32px 80px rgba(2, 6, 23, 0.48);
  color: var(--text-primary);
}
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
  max-width: 44ch;
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
.sh-form {
  padding: 16px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sh-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.sh-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}
.sh-optional { color: var(--text-faint); font-weight: 400; }
.sh-field input,
.sh-field select {
  width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(176, 201, 255, 0.16);
  background: rgba(8, 14, 30, 0.62);
  color: var(--text-primary);
  font: inherit;
  padding: 10px 12px;
  outline: none;
  color-scheme: dark;
}
.sh-field input::placeholder { color: rgba(127, 140, 166, 0.6); }
.sh-field select option {
  background: #0b1327;
  color: var(--text-primary);
}
.sh-field input:focus,
.sh-field select:focus {
  border-color: rgba(82, 212, 255, 0.42);
  box-shadow: 0 0 0 3px rgba(82, 212, 255, 0.12);
}
.sh-form-error { margin: 0; color: #ff8ea1; font-size: 13px; }
.sh-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
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
.sh-btn:disabled { opacity: 0.6; cursor: progress; }
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
@media (max-width: 640px) {
  .sh-field-row { grid-template-columns: 1fr; }
}
</style>
