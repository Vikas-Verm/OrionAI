<template>
  <section class="cb-card">
    <header class="cb-head">
      <div>
        <span class="cb-eyebrow">Career &amp; Interviews</span>
        <h3>{{ title }}</h3>
      </div>
      <button class="cb-link" type="button" @click="openCareer()">Open Career Hub</button>
    </header>

    <div v-if="loading" class="cb-empty">Checking career actions...</div>

    <template v-else-if="hasCareerData">
      <ul class="cb-list">
        <li v-if="nextInterview">Interview {{ nextInterviewLabel }} - {{ nextInterview.company }}</li>
        <li v-if="overview.counts.followUpsDue">
          {{ overview.counts.followUpsDue }} application{{ overview.counts.followUpsDue === 1 ? '' : 's' }} need follow-up
        </li>
        <li v-if="needsPrepCount">
          {{ needsPrepCount }} interview{{ needsPrepCount === 1 ? '' : 's' }} need preparation
        </li>
      </ul>
      <div class="cb-actions">
        <button v-if="nextInterview" class="cb-btn" type="button" @click="openCareer('interviews', nextInterview._id)">
          Prepare Interview
        </button>
        <button class="cb-btn cb-btn--ghost" type="button" @click="openCareer()">Open Career Hub</button>
      </div>
    </template>

    <template v-else>
      <p class="cb-empty">Start tracking your career journey.</p>
      <div class="cb-actions">
        <button class="cb-btn" type="button" @click="openCareer('applications')">Add Application</button>
        <button class="cb-btn cb-btn--ghost" type="button" @click="openCareer('documents')">Upload Resume</button>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { careerAPI } from '../../services/api'

const loading = ref(true)
const overview = ref({ counts: {}, upcomingInterviews: [], followUps: [] })

const nextInterview = computed(() => overview.value.upcomingInterviews?.[0] || null)
const needsPrepCount = computed(() =>
  (overview.value.upcomingInterviews || []).filter((item) => item.prepStatus !== 'ready').length
)
const hasCareerData = computed(() =>
  Boolean(
    overview.value.counts?.activeApplications ||
    overview.value.counts?.upcomingInterviews ||
    overview.value.counts?.followUpsDue
  )
)
const title = computed(() =>
  hasCareerData.value ? 'Your job search has live next steps.' : 'Start tracking your career journey.'
)
const nextInterviewLabel = computed(() => {
  if (!nextInterview.value?.scheduledAt) return 'soon'
  const start = new Date(nextInterview.value.scheduledAt)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (start.toDateString() === now.toDateString()) return 'today'
  if (start.toDateString() === tomorrow.toDateString()) return 'tomorrow'
  return start.toLocaleDateString([], { month: 'short', day: 'numeric' })
})

function openCareer(focus = '', id = '') {
  document.dispatchEvent(new CustomEvent('orion:open-module', {
    detail: { module: 'career', context: { focus, interviewId: id } },
  }))
}

onMounted(async () => {
  try {
    const { data } = await careerAPI.overview()
    overview.value = data || overview.value
  } catch {
    overview.value = { counts: {}, upcomingInterviews: [], followUps: [] }
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.cb-card {
  border: 1px solid var(--border, rgba(255,255,255,.12));
  background: rgba(255,255,255,.045);
  border-radius: 8px;
  padding: 16px;
}
.cb-head,
.cb-actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}
.cb-eyebrow {
  display: block;
  color: var(--text-muted);
  font-size: 12px;
  margin-bottom: 4px;
}
.cb-head h3 {
  margin: 0;
  font-size: 17px;
}
.cb-list {
  margin: 14px 0;
  padding-left: 18px;
  color: var(--text-secondary);
  line-height: 1.6;
}
.cb-empty {
  color: var(--text-secondary);
  margin: 12px 0;
}
.cb-btn,
.cb-link {
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(42,166,255,.16);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  font-weight: 700;
}
.cb-btn--ghost,
.cb-link {
  background: rgba(255,255,255,.05);
}
@media (max-width: 640px) {
  .cb-head,
  .cb-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
