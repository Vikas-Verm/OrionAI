<template>
  <section class="sb-card">
    <header class="sb-card-head">
      <div class="sb-card-head-copy">
        <span class="sb-eyebrow">Study &amp; Learning</span>
        <h3>{{ headline }}</h3>
        <p>{{ subline }}</p>
      </div>
      <button class="sb-btn sb-btn--primary" type="button" @click="openStudyHub">
        {{ hasGoal ? 'Open Study Hub' : 'Add study goal' }}
      </button>
    </header>

    <div v-if="loading" class="sb-card-empty">
      <strong>Checking your Study Hub…</strong>
    </div>

    <template v-else-if="hasGoal">
      <div class="sb-grid">
        <article class="sb-stat">
          <span class="sb-stat-label">Active goal</span>
          <strong>{{ primaryGoal?.title || '—' }}</strong>
          <p v-if="primaryGoal?.purpose">{{ purposeLabel(primaryGoal.purpose) }}</p>
        </article>

        <article class="sb-stat">
          <span class="sb-stat-label">Today’s plan</span>
          <strong v-if="todayItem">{{ todayItem.title }}</strong>
          <strong v-else>No item planned</strong>
          <button
            v-if="todayItem"
            class="sb-link"
            type="button"
            @click="openTopic(todayItem.topicId)"
          >Start studying</button>
        </article>

        <article class="sb-stat" :class="{ 'sb-stat--warning': overview.dueRevisionCount > 0 }">
          <span class="sb-stat-label">Revision due</span>
          <strong>{{ overview.dueRevisionCount }}</strong>
          <p>topics queued for review</p>
        </article>

        <article v-if="nextDeadline" class="sb-stat">
          <span class="sb-stat-label">Next deadline</span>
          <strong>{{ formatDate(nextDeadline.targetDate) }}</strong>
          <p>{{ nextDeadline.title }}</p>
        </article>
      </div>
    </template>

    <div v-else class="sb-card-empty">
      <strong>Set up your Study Hub</strong>
      <p>
        Tell OrionAI what you are learning so it can plan, revise, and practice with you.
      </p>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { studyAPI } from '../../services/api'

const PURPOSE_LABELS = Object.freeze({
  exam_preparation: 'Exam preparation',
  interview_preparation: 'Interview preparation',
  work_upskilling: 'Work upskilling',
  certification: 'Certification',
  school_college: 'School / College',
  language_learning: 'Language learning',
  personal_learning: 'Personal learning',
  creative_learning: 'Creative learning',
  business_learning: 'Business learning',
  technical_learning: 'Technical learning',
  other: 'Other',
})

const loading = ref(true)
const overview = ref({
  activeGoals: [],
  todayItems: [],
  dueRevisionCount: 0,
  upcomingDeadlines: [],
})

const primaryGoal = computed(() => overview.value.activeGoals?.[0] || null)
const hasGoal = computed(() => !!primaryGoal.value)
const todayItem = computed(() => {
  const items = Array.isArray(overview.value.todayItems)
    ? overview.value.todayItems
    : []
  const pending = items.find((item) => !item.completed)
  return pending || items[0] || null
})
const nextDeadline = computed(() => {
  const list = Array.isArray(overview.value.upcomingDeadlines)
    ? overview.value.upcomingDeadlines
    : []
  return list[0] || null
})

const headline = computed(() => {
  if (!hasGoal.value) return 'Plan your learning'
  return primaryGoal.value.title
})

const subline = computed(() => {
  if (!hasGoal.value) {
    return 'Add a goal so OrionAI can plan, revise, and practice with you.'
  }
  const parts = []
  if (todayItem.value) parts.push(`Today: ${todayItem.value.title}`)
  if (overview.value.dueRevisionCount > 0) {
    parts.push(`${overview.value.dueRevisionCount} revision due`)
  }
  if (!parts.length) return 'No items pending today. Great work.'
  return parts.join(' · ')
})

function purposeLabel(value) {
  return PURPOSE_LABELS[value] || value || ''
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}

function dispatchOpen(detail = {}) {
  document.dispatchEvent(new CustomEvent('orion:open-study-hub', { detail }))
}

function openStudyHub() {
  dispatchOpen({})
}

function openTopic(topicId) {
  if (!topicId) {
    openStudyHub()
    return
  }
  dispatchOpen({ topicId: String(topicId) })
}

async function load() {
  loading.value = true
  try {
    const { data } = await studyAPI.overview()
    overview.value = {
      activeGoals: Array.isArray(data?.activeGoals) ? data.activeGoals : [],
      todayItems: Array.isArray(data?.todayItems) ? data.todayItems : [],
      dueRevisionCount: Number(data?.dueRevisionCount || 0),
      upcomingDeadlines: Array.isArray(data?.upcomingDeadlines)
        ? data.upcomingDeadlines
        : [],
    }
  } catch (err) {
    console.error('Study briefing overview failed', err)
    overview.value = {
      activeGoals: [],
      todayItems: [],
      dueRevisionCount: 0,
      upcomingDeadlines: [],
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.sb-card {
  position: relative;
  padding: 22px 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  box-shadow: 0 14px 34px rgba(2, 8, 24, 0.18);
  color: var(--text-primary);
}
.sb-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.sb-card-head-copy { min-width: 0; flex: 1 1 280px; }
.sb-btn {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  border-radius: var(--radius-sm);
  padding: 9px 18px;
  font: inherit;
  font-weight: 500;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
}
.sb-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.sb-btn--primary {
  color: white;
  background: var(--accent);
  border-color: rgba(79, 140, 255, 0.42);
  
}
.sb-btn--primary:hover:not(:disabled) { transform: translateY(-1px); }
.sb-card-head h3 {
  margin: 6px 0 2px;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}
.sb-card-head p {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted);
  max-width: 58ch;
}
.sb-eyebrow {
  display: inline-block;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 10.5px;
  font-weight: 600;
  color: rgba(79, 140, 255, 0.78);
}
.sb-card-empty {
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid var(--border-subtle);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sb-card-empty strong { font-size: 13.5px; color: var(--text-primary); }
.sb-card-empty p { margin: 0; font-size: 12.5px; color: var(--text-muted); }

.sb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}
.sb-stat {
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sb-stat strong {
  font-size: 15px;
  color: var(--text-primary);
  line-height: 1.25;
}
.sb-stat-label {
  text-transform: uppercase;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  color: var(--text-muted);
}
.sb-stat p { margin: 0; font-size: 11.5px; color: var(--text-muted); }
.sb-stat--warning strong { color: #f6c577; }
.sb-link {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 12px;
  color: var(--accent-hover);
  cursor: pointer;
  text-align: left;
}
.sb-link:hover { text-decoration: underline; }
</style>
