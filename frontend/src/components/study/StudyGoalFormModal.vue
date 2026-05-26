<template>
  <div class="sh-modal-mask" @click.self="$emit('close')">
    <div class="sh-modal">
      <header class="sh-modal-head">
        <div>
          <h3>{{ goal ? 'Edit study goal' : 'Add study goal' }}</h3>
          <p class="sh-modal-sub">Tell OrionAI what you’re learning so it can plan, revise, and practice with you.</p>
        </div>
        <button class="sh-icon-btn" type="button" @click="$emit('close')" aria-label="Close">×</button>
      </header>

      <form class="sh-form" @submit.prevent="onSubmit">
        <label class="sh-field">
          <span>Goal title</span>
          <input v-model="form.title" type="text" required maxlength="160"
            :placeholder="randomPlaceholder" autocomplete="off" />
        </label>

        <div class="sh-field-row">
          <label class="sh-field">
            <span>Purpose</span>
            <select v-model="form.purpose">
              <option v-for="opt in PURPOSE_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>

          <label class="sh-field">
            <span>Current level</span>
            <select v-model="form.level">
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
        </div>

        <div class="sh-field-row">
          <div class="sh-field">
            <span class="sh-field-label">Target date <span class="sh-optional">(optional)</span></span>
            <OrionDatePicker v-model="form.targetDate" placeholder="Pick a date" />
          </div>

          <label class="sh-field">
            <span>Daily time (minutes)</span>
            <input v-model.number="form.dailyTimeMinutes" type="number" min="0" max="1440" step="15"
              placeholder="60" />
          </label>
        </div>

        <div class="sh-field-row">
          <label class="sh-field">
            <span>Preferred study time <span class="sh-optional">(optional)</span></span>
            <input v-model="form.preferredStudyTime" type="text" maxlength="60"
              placeholder="Morning, evening, weekends" />
          </label>

          <label class="sh-field">
            <span>Preferred learning style</span>
            <select v-model="form.preferredLearningStyle">
              <option value="">Auto (let OrionAI decide)</option>
              <option v-for="opt in LEARNING_STYLE_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>
        </div>

        <p v-if="error" class="sh-form-error">{{ error }}</p>

        <footer class="sh-form-actions">
          <button class="sh-btn sh-btn--ghost" type="button" :disabled="saving" @click="$emit('close')">
            Cancel
          </button>
          <button class="sh-btn sh-btn--primary" type="submit" :disabled="saving">
            {{ saving ? 'Saving…' : goal ? 'Save changes' : 'Add goal' }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { studyAPI } from '../../services/api'
import OrionDatePicker from './OrionDatePicker.vue'

const props = defineProps({
  goal: { type: Object, default: null },
})
const emit = defineEmits(['close', 'saved'])

const PURPOSE_OPTIONS = [
  { value: 'exam_preparation', label: 'Exam preparation' },
  { value: 'interview_preparation', label: 'Interview preparation' },
  { value: 'work_upskilling', label: 'Work upskilling' },
  { value: 'certification', label: 'Certification' },
  { value: 'school_college', label: 'School / College' },
  { value: 'language_learning', label: 'Language learning' },
  { value: 'personal_learning', label: 'Personal learning' },
  { value: 'creative_learning', label: 'Creative learning' },
  { value: 'business_learning', label: 'Business learning' },
  { value: 'technical_learning', label: 'Technical learning' },
  { value: 'other', label: 'Other' },
]

const LEARNING_STYLE_OPTIONS = [
  { value: 'simple_explanation', label: 'Simple explanation' },
  { value: 'deep_explanation', label: 'Deep explanation' },
  { value: 'practice_first', label: 'Practice first' },
  { value: 'notes_first', label: 'Notes first' },
  { value: 'visual_learning', label: 'Visual learning' },
  { value: 'flashcards', label: 'Flashcards' },
  { value: 'mixed', label: 'Mixed' },
]

const PLACEHOLDER_POOL = [
  'SSC CGL',
  'English Speaking',
  'Product Management',
  'React Interview Preparation',
  'Class 10 Science',
  'AWS Certification',
  'Digital Marketing',
  'Video Editing',
]

const randomPlaceholder = PLACEHOLDER_POOL[
  Math.floor(Math.random() * PLACEHOLDER_POOL.length)
]

function toDateInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const form = reactive({
  title: '',
  purpose: 'personal_learning',
  targetDate: '',
  dailyTimeMinutes: 60,
  level: 'beginner',
  preferredStudyTime: '',
  preferredLearningStyle: '',
})

const saving = ref(false)
const error = ref('')

function hydrate(goal) {
  if (!goal) return
  form.title = goal.title || ''
  form.purpose = goal.purpose || 'personal_learning'
  form.targetDate = toDateInput(goal.targetDate)
  form.dailyTimeMinutes =
    goal.dailyTimeMinutes === null || goal.dailyTimeMinutes === undefined
      ? 60
      : goal.dailyTimeMinutes
  form.level = goal.level || 'beginner'
  form.preferredStudyTime = goal.preferredStudyTime || ''
  form.preferredLearningStyle = goal.preferredLearningStyle || ''
}

watch(() => props.goal, (g) => hydrate(g), { immediate: true })

async function onSubmit() {
  if (saving.value) return
  if (!form.title.trim()) {
    error.value = 'Please add a goal title.'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const payload = {
      title: form.title.trim(),
      purpose: form.purpose,
      targetDate: form.targetDate || null,
      dailyTimeMinutes:
        form.dailyTimeMinutes === '' || form.dailyTimeMinutes === null
          ? null
          : Number(form.dailyTimeMinutes),
      level: form.level,
      preferredStudyTime: form.preferredStudyTime || '',
      preferredLearningStyle: form.preferredLearningStyle || '',
    }
    const { data } = props.goal
      ? await studyAPI.updateGoal(props.goal._id, payload)
      : await studyAPI.createGoal(payload)
    emit('saved', data.goal)
  } catch (err) {
    error.value =
      err?.response?.data?.error || 'Could not save goal. Please try again.'
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
  background: rgba(0, 0, 0, 0.62);
    z-index: 200;
}
.sh-modal {
  width: min(560px, 100%);
  max-height: 90vh;
  overflow: auto;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.48);
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
  letter-spacing: -0.01em;
}
.sh-modal-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-muted);
  max-width: 44ch;
}
.sh-icon-btn {
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  width: 32px;
  height: 32px;
  font-size: 18px;
  color: var(--text-secondary);
  cursor: pointer;
}
.sh-icon-btn:hover { color: var(--text-primary); }
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
.sh-field span { font-weight: 500; }
.sh-optional { color: var(--text-faint); font-weight: 400; }
.sh-field input,
.sh-field select {
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-primary);
  font: inherit;
  padding: 10px 12px;
  outline: none;
  color-scheme: dark;
}
.sh-field input::placeholder { color: rgba(127, 140, 166, 0.6); }
.sh-field select option {
  background: var(--bg-elevated);
  color: var(--text-primary);
}
.sh-field input:focus,
.sh-field select:focus {
  border-color: rgba(79, 140, 255, 0.42);
  box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.12);
}
.sh-field input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(0.86) hue-rotate(180deg) brightness(1.1);
  opacity: 0.78;
  cursor: pointer;
  margin-left: 6px;
}
.sh-field input[type="date"]::-webkit-calendar-picker-indicator:hover {
  opacity: 1;
}
.sh-form-error {
  margin: 0;
  color: #ff8ea1;
  font-size: 13px;
}
.sh-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
}
.sh-btn {
  border-radius: var(--radius-sm);
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
  border-color: var(--border-default);
  color: var(--text-secondary);
}
.sh-btn--ghost:hover { color: var(--text-primary); }
.sh-btn--primary {
  color: white;
  background: var(--accent);
  border-color: rgba(79, 140, 255, 0.42);
  
}
.sh-btn--primary:hover:not(:disabled) { opacity: 0.9; }
@media (max-width: 640px) {
  .sh-field-row { grid-template-columns: 1fr; }
}
</style>
