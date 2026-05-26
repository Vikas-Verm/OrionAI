<template>
  <div class="sh-shell">
    <div class="sh-aurora sh-aurora--cyan" aria-hidden="true"></div>
    <div class="sh-aurora sh-aurora--violet" aria-hidden="true"></div>

    <div class="sh-content">
      <!-- ── Back button ──────────────────────────────────────────── -->
      <button class="sh-back" type="button" @click="$emit('back')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back to Workspace Briefing
      </button>

      <transition name="sh-notice">
        <div
          v-if="notice.text"
          class="sh-notice"
          :class="{ 'sh-notice--error': notice.type === 'error' }"
          role="status"
        >
          {{ notice.text }}
        </div>
      </transition>

      <!-- ── Header ────────────────────────────────────────────────── -->
      <header class="sh-header">
        <div>
          <span class="sh-eyebrow">Study Hub</span>
          <h1>Plan your learning, study topics, revise on time, and track progress.</h1>
        </div>
        <div class="sh-header-actions">
          <button class="sh-btn sh-btn--ghost" type="button" :disabled="!activeGoal"
            @click="openTopicModal()">
            Add topic
          </button>
          <button class="sh-btn sh-btn--ghost" type="button" :disabled="!activeGoal || planLoading"
            @click="refreshTodayPlan">
            {{ planLoading ? 'Generating…' : "Generate today's plan" }}
          </button>
          <button class="sh-btn sh-btn--primary" type="button" @click="openGoalModal()">
            Add study goal
          </button>
        </div>
      </header>

      <!-- ── Empty setup state ─────────────────────────────────────── -->
      <section v-if="!loading && goals.length === 0" class="sh-panel sh-empty-hero">
        <div class="sh-empty-hero-art" aria-hidden="true">
          <div class="sh-empty-orb"></div>
          <div class="sh-empty-ring"></div>
          <div class="sh-empty-ring sh-empty-ring--outer"></div>
        </div>
        <div class="sh-empty-hero-copy">
          <span class="sh-eyebrow">Get started</span>
          <h2>Set up your Study Hub</h2>
          <p>
            Tell OrionAI what you are learning so it can create study plans, revision reminders,
            practice questions, notes, and progress tracking.
          </p>
          <div class="sh-empty-hero-actions">
            <button class="sh-btn sh-btn--primary" type="button" @click="openGoalModal()">
              Add study goal
            </button>
            <span class="sh-empty-hint">Works for exams, interviews, languages, certifications, and more.</span>
          </div>
        </div>
      </section>

      <div v-else class="sh-grid">
        <!-- ── Active Goals card ───────────────────────────────────── -->
        <section class="sh-panel sh-panel--span-2">
          <header class="sh-panel-head">
            <div>
              <h3>Active goals</h3>
              <p>Switch between learning goals you have set up.</p>
            </div>
            <span v-if="goals.length" class="sh-pill">{{ goals.length }}</span>
          </header>

          <div v-if="loading" class="sh-skeleton">Loading your goals…</div>

          <div
            v-else-if="goals.length"
            class="sh-goal-list"
            :class="{ 'sh-goal-list--scroll': goals.length > 3 }"
          >
            <article
              v-for="goal in goals"
              :key="goal._id"
              class="sh-goal-card"
              :class="{ 'sh-goal-card--active': isActiveGoal(goal) }"
              @click="setActiveGoal(goal)"
            >
              <header class="sh-goal-card-head">
                <div>
                  <h4>{{ goal.title }}</h4>
                  <p class="sh-goal-card-meta">
                    <span>{{ purposeLabel(goal.purpose) }}</span>
                    <span v-if="goal.targetDate">· Target {{ formatDate(goal.targetDate) }}</span>
                    <span v-if="goal.dailyTimeMinutes">· {{ goal.dailyTimeMinutes }} min/day</span>
                  </p>
                </div>
                <span class="sh-status-pill" :data-status="goal.status">{{ goal.status }}</span>
              </header>

              <div class="sh-progress">
                <div class="sh-progress-bar">
                  <div class="sh-progress-fill"
                    :style="{ width: `${goal.stats?.completionPercent || 0}%` }"></div>
                </div>
                <span class="sh-progress-meta">
                  {{ goal.stats?.completedTopics || 0 }} / {{ goal.stats?.totalTopics || 0 }} topics
                  ·
                  {{ goal.stats?.completionPercent || 0 }}%
                </span>
              </div>

              <div class="sh-goal-card-actions" @click.stop>
                <button class="sh-link" type="button" @click="setActiveGoal(goal)">Open</button>
                <button class="sh-link" type="button" @click="openGoalModal(goal)">Edit</button>
                <button
                  v-if="goal.status === 'active'"
                  class="sh-link"
                  type="button"
                  @click="updateGoalStatus(goal, 'paused')"
                >Pause</button>
                <button
                  v-else-if="goal.status === 'paused'"
                  class="sh-link"
                  type="button"
                  @click="updateGoalStatus(goal, 'active')"
                >Resume</button>
                <button
                  v-if="goal.status !== 'completed'"
                  class="sh-link sh-link--accent"
                  type="button"
                  @click="updateGoalStatus(goal, 'completed')"
                >Mark completed</button>
              </div>
            </article>
          </div>
        </section>

        <!-- ── Today's Study Plan card ─────────────────────────────── -->
        <section class="sh-panel">
          <header class="sh-panel-head">
            <div>
              <h3>Today’s study plan</h3>
              <p v-if="activeGoal">For {{ activeGoal.title }}</p>
            </div>
            <button v-if="activeGoal" class="sh-link" type="button" :disabled="planLoading"
              @click="refreshTodayPlan">
              {{ planLoading ? 'Refreshing…' : 'Refresh' }}
            </button>
          </header>

          <div v-if="!activeGoal" class="sh-empty-block">
            <strong>No active goal selected.</strong>
            <p>Add or activate a goal to generate a study plan.</p>
          </div>

          <div v-else-if="planLoading && !planItems.length" class="sh-skeleton">
            Building today’s plan…
          </div>

          <div v-else-if="planItems.length" class="sh-plan-list">
            <article
              v-for="item in planItems"
              :key="item.topicId"
              class="sh-plan-item"
              :class="{ 'sh-plan-item--done': item.completed }"
            >
              <div class="sh-plan-item-main">
                <h4>{{ item.title }}</h4>
                <p class="sh-plan-item-meta">
                  <span v-if="item.subject || item.category">
                    {{ item.subject || item.category }} ·
                  </span>
                  <span>{{ item.plannedMinutes }} min</span>
                  <span class="sh-dot">·</span>
                  <span class="sh-status-tag" :data-status="item.status">{{ statusLabel(item.status) }}</span>
                </p>
                <p class="sh-plan-item-reason">{{ item.reason }}</p>
              </div>
              <div class="sh-plan-item-actions">
                <button class="sh-btn sh-btn--ghost sh-btn--sm" type="button"
                  @click="openTopicLearning(item.topicId)">
                  Start studying
                </button>
                <button class="sh-btn sh-btn--primary sh-btn--sm" type="button"
                  :disabled="item.completed || actionPendingTopicId === item.topicId"
                  @click="completeTopic(item.topicId)">
                  {{ item.completed ? 'Completed' : 'Mark completed' }}
                </button>
                <button class="sh-link sh-link--muted sh-link--sm" type="button"
                  :disabled="item.completed || actionPendingTopicId === item.topicId"
                  @click="moveTopicToTomorrow(item.topicId)">
                  Move to tomorrow
                </button>
              </div>
            </article>
          </div>

          <div v-else-if="planNoTopicsState" class="sh-empty-block">
            <strong>{{ planMessage || 'Add topics first, then OrionAI can generate a plan.' }}</strong>
            <p>Topics can be chapters, units, skills, concepts, or anything you want to study.</p>
            <div class="sh-empty-cta-row">
              <button class="sh-btn sh-btn--primary sh-btn--sm" type="button"
                @click="openTopicModal()">
                Add topic manually
              </button>
              <button class="sh-btn sh-btn--ghost sh-btn--sm" type="button"
                @click="openSuggestModal">
                Suggest topics with OrionAI
              </button>
            </div>
          </div>

          <div v-else class="sh-empty-block">
            <strong>No plan for today yet.</strong>
            <p>Generate your plan from your saved topics.</p>
            <button class="sh-btn sh-btn--primary sh-btn--sm" type="button"
              :disabled="planLoading || !activeGoal"
              @click="refreshTodayPlan">
              Generate today’s plan
            </button>
          </div>
        </section>

        <!-- ── Topics card ─────────────────────────────────────────── -->
        <section class="sh-panel">
          <header class="sh-panel-head">
            <div>
              <h3>Topics</h3>
              <p v-if="activeGoal">All topics in {{ activeGoal.title }}.</p>
            </div>
            <div v-if="activeGoal && topics.length > 0" class="sh-panel-head-actions">
              <button
                class="sh-btn sh-btn--ghost sh-btn--sm"
                type="button"
                @click="openSuggestModal"
              >
                Suggest topics with OrionAI
              </button>
              <button
                class="sh-btn sh-btn--primary sh-btn--sm"
                type="button"
                @click="openTopicModal()"
              >
                + Add topic
              </button>
            </div>
          </header>

          <div v-if="!activeGoal" class="sh-empty-block">
            <strong>No active goal selected.</strong>
            <p>Pick a goal to manage its topics.</p>
          </div>

          <div v-else-if="topicsLoading" class="sh-skeleton">Loading topics…</div>

          <div
            v-else-if="topics.length"
            class="sh-topic-list"
            :class="{ 'sh-topic-list--scroll': topics.length > 10 }"
          >
            <article
              v-for="topic in topics"
              :key="topic._id"
              class="sh-topic-row"
            >
              <div class="sh-topic-row-main">
                <h4>{{ topic.title }}</h4>
                <p class="sh-topic-row-meta">
                  <span v-if="topic.subject">{{ topic.subject }}</span>
                  <span v-if="topic.category">· {{ topic.category }}</span>
                  <span class="sh-dot">·</span>
                  <span class="sh-status-tag" :data-status="topic.status">{{ statusLabel(topic.status) }}</span>
                  <span v-if="topic.difficulty">· {{ topic.difficulty }}</span>
                  <span v-if="topic.nextRevisionAt">
                    · Next revision {{ formatDate(topic.nextRevisionAt) }}
                  </span>
                </p>
              </div>
              <div class="sh-topic-row-actions">
                <button class="sh-link" type="button" @click="openTopicLearning(topic._id)">Open</button>
                <button
                  v-if="topic.status !== 'in_progress' && topic.status !== 'completed'"
                  class="sh-link"
                  type="button"
                  @click="setTopicStatus(topic, 'in_progress')"
                >Mark in progress</button>
                <button
                  v-if="topic.status !== 'completed'"
                  class="sh-link"
                  type="button"
                  @click="completeTopic(topic._id)"
                >Mark completed</button>
                <button
                  v-if="topic.status !== 'weak'"
                  class="sh-link sh-link--warning"
                  type="button"
                  @click="setTopicStatus(topic, 'weak')"
                >Mark weak</button>
              </div>
            </article>
          </div>

          <div v-else class="sh-empty-block">
            <strong>No topics yet.</strong>
            <p>Add topics like chapters, units, skills, or concepts you want to study.</p>
            <div class="sh-empty-cta-row">
              <button class="sh-btn sh-btn--primary sh-btn--sm" type="button" @click="openTopicModal()">
                Add topic manually
              </button>
              <button class="sh-btn sh-btn--ghost sh-btn--sm" type="button" @click="openSuggestModal">
                Suggest topics with OrionAI
              </button>
            </div>
          </div>
        </section>

        <!-- ── Revision Due card ───────────────────────────────────── -->
        <section class="sh-panel">
          <header class="sh-panel-head">
            <div>
              <h3>Revision due</h3>
              <p>Items due today or overdue.</p>
            </div>
            <span v-if="revisions.length" class="sh-pill sh-pill--warning">{{ revisions.length }}</span>
          </header>

          <div v-if="revisionsLoading" class="sh-skeleton">Loading revisions…</div>

          <div v-else-if="revisions.length" class="sh-revision-list">
            <article
              v-for="rev in revisions"
              :key="rev._id"
              class="sh-revision-row"
            >
              <div>
                <h4>{{ rev.topic?.title || 'Topic' }}</h4>
                <p class="sh-revision-meta">
                  Level {{ rev.revisionLevel }} · Due {{ formatDate(rev.dueAt) }}
                  <span v-if="rev.topic?.subject"> · {{ rev.topic.subject }}</span>
                </p>
              </div>
              <div class="sh-revision-actions">
                <button class="sh-link" type="button" :disabled="!rev.topic"
                  @click="openTopicLearning(rev.topicId)">
                  Revise now
                </button>
                <button class="sh-link" type="button"
                  :disabled="actionPendingRevisionId === rev._id"
                  @click="completeRevision(rev._id)">
                  Mark revised
                </button>
                <button class="sh-link sh-link--muted" type="button"
                  :disabled="actionPendingRevisionId === rev._id"
                  @click="snoozeRevision(rev._id)">
                  Snooze
                </button>
              </div>
            </article>
          </div>

          <div v-else class="sh-empty-block">
            <strong>No revision due today.</strong>
            <p>
              Completed topics will appear here when their revision date arrives.
              We use a simple spacing: 1 → 3 → 7 → 15 days.
            </p>
          </div>

          <div v-if="upcomingRevisions.length" class="sh-upcoming">
            <h4 class="sh-upcoming-title">Upcoming revisions</h4>
            <ul class="sh-upcoming-list">
              <li
                v-for="rev in upcomingRevisions"
                :key="rev._id"
                class="sh-upcoming-row"
              >
                <span class="sh-upcoming-title-text">{{ rev.topic?.title || 'Topic' }}</span>
                <span class="sh-upcoming-due">{{ formatRelativeDue(rev.dueAt) }}</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- ── Progress card ───────────────────────────────────────── -->
        <section class="sh-panel sh-panel--span-2">
          <header class="sh-panel-head">
            <div>
              <h3>Progress</h3>
              <p v-if="activeGoal">A quick view of where you are with {{ activeGoal.title }}.</p>
            </div>
          </header>

          <div v-if="!activeGoal" class="sh-empty-block">
            <strong>No active goal selected.</strong>
            <p>Pick a goal to see progress.</p>
          </div>

          <div v-else class="sh-stat-grid">
            <button
              v-for="stat in progressStats"
              :key="stat.id"
              type="button"
              class="sh-stat"
              :class="stat.modifier"
              :disabled="!stat.clickable"
              @click="onProgressStatClick(stat)"
            >
              <span class="sh-stat-label">{{ stat.label }}</span>
              <strong>{{ stat.value }}</strong>
              <p>{{ stat.hint }}</p>
              <span v-if="stat.clickable" class="sh-stat-cta">View topics →</span>
            </button>
          </div>
        </section>
      </div>
    </div>

    <StudyGoalFormModal
      v-if="showGoalModal"
      :goal="editingGoal"
      @close="closeGoalModal"
      @saved="onGoalSaved"
    />
    <StudyTopicFormModal
      v-if="showTopicModal"
      :topic="editingTopic"
      :goal-id="activeGoal?._id"
      @close="closeTopicModal"
      @saved="onTopicSaved"
    />
    <SuggestTopicsModal
      v-if="showSuggestModal && activeGoal"
      :goal="activeGoal"
      @close="closeSuggestModal"
      @saved="onTopicsSuggested"
    />
    <TopicListModal
      v-if="topicFilterModal.open"
      :title="topicFilterModal.title"
      :subtitle="topicFilterModal.subtitle"
      :goal-title="activeGoal?.title || ''"
      :items="topicFilterModal.items"
      @close="closeTopicFilterModal"
      @open-topic="onTopicFilterOpenTopic"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { studyAPI } from '../services/api'
import StudyGoalFormModal from '../components/study/StudyGoalFormModal.vue'
import StudyTopicFormModal from '../components/study/StudyTopicFormModal.vue'
import SuggestTopicsModal from '../components/study/SuggestTopicsModal.vue'
import TopicListModal from '../components/study/TopicListModal.vue'

const emit = defineEmits(['openTopic', 'back'])

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

const STATUS_LABELS = Object.freeze({
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  weak: 'Weak',
  revision_due: 'Revision due',
  active: 'Active',
  paused: 'Paused',
  due: 'Due',
  missed: 'Missed',
  snoozed: 'Snoozed',
})

const goals = ref([])
const topics = ref([])
const planItems = ref([])
const planSession = ref(null)
const revisions = ref([])
const upcomingRevisions = ref([])

const activeGoalId = ref('')
const loading = ref(true)
const topicsLoading = ref(false)
const planLoading = ref(false)
const revisionsLoading = ref(false)

const showGoalModal = ref(false)
const editingGoal = ref(null)
const showTopicModal = ref(false)
const editingTopic = ref(null)
const showSuggestModal = ref(false)
const actionPendingTopicId = ref('')
const actionPendingRevisionId = ref('')

const topicFilterModal = ref({
  open: false,
  title: '',
  subtitle: '',
  items: [],
})

const planMessage = ref('')
const planCode = ref('')
const planNoTopicsState = computed(
  () => !planItems.value.length && planCode.value === 'no_topics'
)

const notice = ref({ type: 'info', text: '' })
let noticeTimer = null
function showNotice(text, type = 'info', durationMs = 3200) {
  if (!text) return
  if (noticeTimer) clearTimeout(noticeTimer)
  notice.value = { type, text }
  noticeTimer = setTimeout(() => {
    notice.value = { type: 'info', text: '' }
    noticeTimer = null
  }, durationMs)
}

const activeGoal = computed(() => goals.value.find((g) => g._id === activeGoalId.value) || null)

const progress = computed(() => {
  const goalStats = activeGoal.value?.stats || {}
  const total = goalStats.totalTopics ?? topics.value.length
  const completed = topics.value.filter((t) => t.status === 'completed').length
  const inProgress = topics.value.filter((t) => t.status === 'in_progress').length
  const weak = topics.value.filter((t) => t.status === 'weak').length
  const notStarted = topics.value.filter((t) => t.status === 'not_started').length
  return {
    total,
    completed,
    inProgress,
    notStarted,
    weak,
    dueRevisions: revisions.value.length,
    completionPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
})

const progressStats = computed(() => [
  {
    id: 'completed',
    label: 'Topics completed',
    value: progress.value.completed,
    hint: `out of ${progress.value.total}`,
    modifier: '',
    clickable: progress.value.completed > 0,
    topicStatus: 'completed',
  },
  {
    id: 'in_progress',
    label: 'In progress',
    value: progress.value.inProgress,
    hint: 'actively studying',
    modifier: '',
    clickable: progress.value.inProgress > 0,
    topicStatus: 'in_progress',
  },
  {
    id: 'not_started',
    label: 'Pending',
    value: progress.value.notStarted,
    hint: 'not started yet',
    modifier: '',
    clickable: progress.value.notStarted > 0,
    topicStatus: 'not_started',
  },
  {
    id: 'weak',
    label: 'Weak topics',
    value: progress.value.weak,
    hint: 'need another pass',
    modifier: 'sh-stat--warning',
    clickable: progress.value.weak > 0,
    topicStatus: 'weak',
  },
  {
    id: 'revision_due',
    label: 'Revision due',
    value: progress.value.dueRevisions,
    hint: 'review queued',
    modifier: 'sh-stat--accent',
    clickable: progress.value.dueRevisions > 0,
    source: 'revisions',
  },
  {
    id: 'completion',
    label: 'Completion',
    value: `${progress.value.completionPercent}%`,
    hint: 'of this goal',
    modifier: 'sh-stat--success',
    clickable: false,
  },
])

function onProgressStatClick(stat) {
  if (!stat?.clickable) return
  if (stat.source === 'revisions') {
    const items = revisions.value
      .map((rev) => rev.topic)
      .filter(Boolean)
    topicFilterModal.value = {
      open: true,
      title: 'Revision due',
      subtitle: items.length
        ? `${items.length} topic${items.length === 1 ? '' : 's'} due today or overdue.`
        : 'No revision due right now.',
      items,
    }
    return
  }
  const status = stat.topicStatus
  const items = topics.value.filter((t) => t.status === status)
  topicFilterModal.value = {
    open: true,
    title: stat.label,
    subtitle:
      items.length
        ? `${items.length} topic${items.length === 1 ? '' : 's'} in this group.`
        : 'No topics in this group.',
    items,
  }
}

function closeTopicFilterModal() {
  topicFilterModal.value = { open: false, title: '', subtitle: '', items: [] }
}

function onTopicFilterOpenTopic(topicId) {
  closeTopicFilterModal()
  openTopicLearning(topicId)
}

function purposeLabel(value) {
  return PURPOSE_LABELS[value] || value || 'Personal learning'
}
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

function isActiveGoal(goal) {
  return goal._id === activeGoalId.value
}

async function loadGoals() {
  loading.value = true
  try {
    const { data } = await studyAPI.listGoals()
    goals.value = Array.isArray(data?.goals) ? data.goals : []
    if (!activeGoalId.value && goals.value.length) {
      const firstActive = goals.value.find((g) => g.status === 'active')
      activeGoalId.value = (firstActive || goals.value[0])._id
    }
    if (activeGoalId.value && !goals.value.some((g) => g._id === activeGoalId.value)) {
      activeGoalId.value = goals.value[0]?._id || ''
    }
  } catch (err) {
    console.error('Load goals failed', err)
    goals.value = []
  } finally {
    loading.value = false
  }
}

async function loadTopicsForActiveGoal() {
  if (!activeGoal.value) {
    topics.value = []
    return
  }
  topicsLoading.value = true
  try {
    const { data } = await studyAPI.listTopics({ goalId: activeGoal.value._id })
    topics.value = Array.isArray(data?.topics) ? data.topics : []
  } catch (err) {
    console.error('Load topics failed', err)
    topics.value = []
  } finally {
    topicsLoading.value = false
  }
}

async function loadRevisions() {
  revisionsLoading.value = true
  try {
    const [dueRes, allRes] = await Promise.all([
      studyAPI.listRevisions({ status: 'due', dueOnly: true }),
      studyAPI.listRevisions({ status: 'due' }),
    ])
    const dueItems = Array.isArray(dueRes?.data?.items) ? dueRes.data.items : []
    revisions.value = dueItems
    const allDue = Array.isArray(allRes?.data?.items) ? allRes.data.items : []
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)
    const horizon = new Date(todayEnd)
    horizon.setDate(horizon.getDate() + 14)
    const dueIds = new Set(dueItems.map((r) => String(r._id)))
    upcomingRevisions.value = allDue
      .filter((r) => !dueIds.has(String(r._id)))
      .filter((r) => {
        const d = new Date(r.dueAt)
        return !Number.isNaN(d.getTime()) && d > todayEnd && d <= horizon
      })
      .slice(0, 3)
  } catch (err) {
    console.error('Load revisions failed', err)
    revisions.value = []
    upcomingRevisions.value = []
  } finally {
    revisionsLoading.value = false
  }
}

function formatRelativeDue(value) {
  if (!value) return ''
  const due = new Date(value)
  if (Number.isNaN(due.getTime())) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDay = new Date(due)
  dueDay.setHours(0, 0, 0, 0)
  const diff = Math.round((dueDay - today) / (24 * 60 * 60 * 1000))
  if (diff === 0) return 'due today'
  if (diff === 1) return 'due tomorrow'
  if (diff > 1 && diff < 7) return `due in ${diff} days`
  return `due ${formatDate(value)}`
}

async function loadTodayPlan(force = false) {
  if (!activeGoal.value) {
    planItems.value = []
    planSession.value = null
    planCode.value = ''
    planMessage.value = ''
    return
  }
  if (planLoading.value && !force) return
  planLoading.value = true
  try {
    const { data } = await studyAPI.generateTodaysPlan({ goalId: activeGoal.value._id })
    planItems.value = Array.isArray(data?.items) ? data.items : []
    planSession.value = data?.session || null
    planCode.value = data?.code || ''
    planMessage.value = data?.message || ''
  } catch (err) {
    console.error('Load plan failed', err)
    planItems.value = []
    planCode.value = ''
    planMessage.value =
      err?.response?.data?.error || ''
  } finally {
    planLoading.value = false
  }
}

async function moveTopicToTomorrow(topicId) {
  if (!topicId) return
  actionPendingTopicId.value = topicId
  try {
    const { data } = await studyAPI.moveTopicToTomorrow(topicId)
    await loadTodayPlan(true)
    showNotice(
      data?.message || 'Moved to tomorrow.',
      data?.alreadyOnTomorrow ? 'info' : 'info'
    )
  } catch (err) {
    console.error('Move to tomorrow failed', err)
    showNotice(
      err?.response?.data?.error || 'Could not move to tomorrow.',
      'error'
    )
  } finally {
    actionPendingTopicId.value = ''
  }
}

function openSuggestModal() {
  if (!activeGoal.value) return
  showSuggestModal.value = true
}

function closeSuggestModal() {
  showSuggestModal.value = false
}

async function onTopicsSuggested(result = {}) {
  showSuggestModal.value = false
  const count = Number(result?.createdCount || 0)
  const skipped = Number(result?.skippedDuplicates || 0)
  if (count > 0) {
    const parts = [`Added ${count} topic${count === 1 ? '' : 's'}.`]
    if (skipped > 0) parts.push(`${skipped} duplicate${skipped === 1 ? '' : 's'} skipped.`)
    showNotice(parts.join(' '), 'info')
  } else if (skipped > 0) {
    showNotice(`Skipped ${skipped} duplicate topic${skipped === 1 ? '' : 's'}.`, 'info')
  }
  await Promise.all([loadTopicsForActiveGoal(), loadGoals(), loadTodayPlan(true)])
}

async function refreshTodayPlan() {
  await loadTodayPlan(true)
}

async function setActiveGoal(goal) {
  if (!goal || goal._id === activeGoalId.value) return
  activeGoalId.value = goal._id
}

async function updateGoalStatus(goal, status) {
  try {
    const { data } = await studyAPI.updateGoal(goal._id, { status })
    const next = data?.goal
    if (!next) return
    const idx = goals.value.findIndex((g) => g._id === next._id)
    if (idx >= 0) goals.value[idx] = { ...goals.value[idx], ...next }
  } catch (err) {
    console.error('Update goal status failed', err)
  }
}

async function setTopicStatus(topic, status) {
  try {
    const { data } = await studyAPI.updateTopic(topic._id, { status })
    if (!data?.topic) return
    const idx = topics.value.findIndex((t) => t._id === data.topic._id)
    if (idx >= 0) topics.value[idx] = data.topic
  } catch (err) {
    console.error('Update topic status failed', err)
  }
}

async function completeTopic(topicId) {
  if (!topicId) return
  actionPendingTopicId.value = topicId
  try {
    const { data } = await studyAPI.completeTopic(topicId)
    if (data?.topic) {
      const idx = topics.value.findIndex((t) => t._id === data.topic._id)
      if (idx >= 0) topics.value[idx] = data.topic
    }
    // refresh plan + revisions to reflect the new state
    await Promise.all([loadTodayPlan(true), loadRevisions(), loadGoals()])
  } catch (err) {
    console.error('Complete topic failed', err)
  } finally {
    actionPendingTopicId.value = ''
  }
}

async function completeRevision(id) {
  actionPendingRevisionId.value = id
  try {
    await studyAPI.completeRevision(id)
    await Promise.all([loadRevisions(), loadTopicsForActiveGoal(), loadGoals()])
  } catch (err) {
    console.error('Complete revision failed', err)
  } finally {
    actionPendingRevisionId.value = ''
  }
}

async function snoozeRevision(id) {
  actionPendingRevisionId.value = id
  try {
    await studyAPI.snoozeRevision(id, 1)
    await loadRevisions()
  } catch (err) {
    console.error('Snooze revision failed', err)
  } finally {
    actionPendingRevisionId.value = ''
  }
}

function openGoalModal(goal = null) {
  editingGoal.value = goal
  showGoalModal.value = true
}

function closeGoalModal() {
  showGoalModal.value = false
  editingGoal.value = null
}

async function onGoalSaved(goal) {
  showGoalModal.value = false
  editingGoal.value = null
  if (!goal) return
  await loadGoals()
  activeGoalId.value = goal._id
}

function openTopicModal(topic = null) {
  if (!activeGoal.value && !topic) return
  editingTopic.value = topic
  showTopicModal.value = true
}

function closeTopicModal() {
  showTopicModal.value = false
  editingTopic.value = null
}

async function onTopicSaved(topic) {
  showTopicModal.value = false
  editingTopic.value = null
  if (!topic) return
  await Promise.all([loadTopicsForActiveGoal(), loadGoals()])
}

function openTopicLearning(topicId) {
  if (!topicId) return
  emit('openTopic', String(topicId))
}

watch(activeGoalId, async () => {
  await Promise.all([loadTopicsForActiveGoal(), loadTodayPlan(true)])
})

onMounted(async () => {
  await loadGoals()
  await Promise.all([
    loadTopicsForActiveGoal(),
    loadRevisions(),
    loadTodayPlan(true),
  ])
})
</script>

<style scoped>
.sh-shell {
  position: relative;
  flex: 1;
  min-height: 100%;
  overflow: auto;
  padding: 32px 32px 48px;
  color: var(--text-primary);
  background: var(--bg-base);
}
.sh-aurora {
  display: none;
}
.sh-content {
  position: relative;
  z-index: 1;
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.sh-back {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease, transform 120ms ease;
}
.sh-back:hover {
  color: var(--text-primary);
  border-color: rgba(79, 140, 255, 0.32);
  transform: translateY(-1px);
}
.sh-back svg { flex: 0 0 auto; }

.sh-notice {
  align-self: flex-start;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(79, 140, 255, 0.32);
  background: rgba(79, 140, 255, 0.08);
  color: var(--accent-hover);
  font-size: 13px;
}
.sh-notice--error {
  border-color: rgba(255, 107, 127, 0.42);
  background: rgba(255, 107, 127, 0.08);
  color: #ff8ea1;
}
.sh-notice-enter-active,
.sh-notice-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}
.sh-notice-enter-from,
.sh-notice-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.sh-header {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: flex-end;
  justify-content: space-between;
}
.sh-header h1 {
  margin: 6px 0 0;
  font-size: clamp(22px, 2.5vw, 28px);
  font-weight: 500;
  letter-spacing: -0.01em;
  max-width: 56ch;
  line-height: 1.25;
}
.sh-eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 11px;
  font-weight: 600;
  color: rgba(79, 140, 255, 0.78);
}
.sh-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.sh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--radius-sm);
  padding: 9px 18px;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}
.sh-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.sh-btn--sm { padding: 6px 14px; font-size: 12.5px; }
.sh-btn--ghost {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-color: var(--border-default);
}
.sh-btn--ghost:hover:not(:disabled) { color: var(--text-primary); border-color: rgba(79, 140, 255, 0.32); }
.sh-btn--primary {
  color: white;
  background: var(--accent);
  border-color: transparent;
}
.sh-btn--primary:hover:not(:disabled) { opacity: 0.9; }

.sh-empty-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 22px;
  padding: 40px 32px 36px;
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
}
.sh-empty-hero-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.sh-empty-hero-copy h2 {
  margin: 6px 0 0;
  font-size: clamp(22px, 2vw, 28px);
  font-weight: 600;
  letter-spacing: -0.01em;
}
.sh-empty-hero-copy p {
  margin: 0;
  color: var(--text-muted);
  max-width: 52ch;
  line-height: 1.6;
  font-size: 14px;
}
.sh-empty-hero-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}
.sh-empty-hint {
  font-size: 12px;
  color: var(--text-faint);
}
.sh-empty-hero-art {
  position: relative;
  width: 160px;
  height: 110px;
  display: grid;
  place-items: center;
  margin-bottom: 4px;
}
.sh-empty-orb {
  width: 88px;
  height: 88px;
  border-radius: var(--radius-md);
  background: rgba(79, 140, 255, 0.15);
  border: 1px solid rgba(79, 140, 255, 0.2);
}
.sh-empty-ring {
  position: absolute;
  width: 140px;
  height: 140px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
}
.sh-empty-ring--outer {
  width: 188px;
  height: 188px;
  border-color: var(--border-subtle);
}

.sh-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.sh-panel {
  position: relative;
  border-radius: var(--radius-lg);
  padding: 22px 22px 20px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 220px;
}
.sh-panel--span-2 { grid-column: span 2; }
.sh-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.sh-panel-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.sh-panel-head p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 12.5px;
}
.sh-panel-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.sh-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  font-size: 11.5px;
  font-weight: 600;
  background: rgba(79, 140, 255, 0.14);
  color: var(--accent-hover);
}
.sh-pill--warning {
  background: rgba(242, 184, 79, 0.16);
  color: #f6c577;
}

.sh-skeleton {
  padding: 20px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.025);
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
}
.sh-empty-block {
  padding: 20px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.025);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.sh-empty-block strong { font-size: 14px; color: var(--text-primary); }
.sh-empty-block p { margin: 0; font-size: 13px; color: var(--text-muted); max-width: 44ch; }
.sh-empty-cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 4px;
}
.sh-link--sm { font-size: 12px; }

.sh-goal-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}
.sh-goal-list--scroll {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  padding-bottom: 6px;
  /* Custom dark scrollbar */
  scrollbar-width: thin;
  scrollbar-color: rgba(79, 140, 255, 0.32) transparent;
}
.sh-goal-list--scroll > .sh-goal-card {
  flex: 0 0 280px;
  scroll-snap-align: start;
}
.sh-goal-list--scroll::-webkit-scrollbar { height: 6px; }
.sh-goal-list--scroll::-webkit-scrollbar-track { background: transparent; }
.sh-goal-list--scroll::-webkit-scrollbar-thumb {
  background: rgba(79, 140, 255, 0.32);
  border-radius: var(--radius-sm);
}
.sh-goal-card {
  border-radius: var(--radius-md);
  padding: 16px 16px 14px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  cursor: pointer;
  transition: border-color 120ms ease, transform 120ms ease;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sh-goal-card:hover { border-color: rgba(79, 140, 255, 0.28); }
.sh-goal-card--active {
  border-color: rgba(79, 140, 255, 0.45);
  box-shadow: 0 0 0 1px rgba(79, 140, 255, 0.18);
}
.sh-goal-card-head {
  display: flex;
  gap: 10px;
  justify-content: space-between;
  align-items: flex-start;
}
.sh-status-pill {
  flex: 0 0 auto;
  align-self: flex-start;
  white-space: nowrap;
  line-height: 1.4;
}
.sh-goal-card-head h4 { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.3; }
.sh-goal-card-meta {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sh-status-pill {
  text-transform: capitalize;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  background: var(--border-subtle);
  color: var(--text-secondary);
}
.sh-status-pill[data-status="active"] { background: rgba(47, 211, 157, 0.16); color: #6fe0bc; }
.sh-status-pill[data-status="paused"] { background: rgba(242, 184, 79, 0.16); color: #f6c577; }
.sh-status-pill[data-status="completed"] { background: rgba(79, 140, 255, 0.16); color: var(--accent-hover); }

.sh-progress { display: flex; flex-direction: column; gap: 6px; }
.sh-progress-bar {
  width: 100%;
  height: 6px;
  border-radius: var(--radius-sm);
  background: var(--border-subtle);
  overflow: hidden;
}
.sh-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: inherit;
}
.sh-progress-meta { font-size: 11.5px; color: var(--text-muted); }

.sh-goal-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}
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
.sh-link--accent { color: var(--accent); }
.sh-link--warning { color: #f6c577; }
.sh-link--muted { color: var(--text-muted); }

.sh-plan-list,
.sh-topic-list,
.sh-revision-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sh-topic-list--scroll {
  /* ~10 rows visible (row ≈ 70px including gap), then scroll */
  max-height: 700px;
  overflow-y: auto;
  padding-right: 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(79, 140, 255, 0.32) transparent;
}
.sh-topic-list--scroll::-webkit-scrollbar { width: 6px; }
.sh-topic-list--scroll::-webkit-scrollbar-track { background: transparent; }
.sh-topic-list--scroll::-webkit-scrollbar-thumb {
  background: rgba(79, 140, 255, 0.32);
  border-radius: var(--radius-sm);
}
.sh-plan-item,
.sh-topic-row,
.sh-revision-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}
.sh-plan-item h4,
.sh-topic-row h4,
.sh-revision-row h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.sh-plan-item-meta,
.sh-topic-row-meta,
.sh-revision-meta {
  margin: 4px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.sh-upcoming {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-default);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sh-upcoming-title {
  margin: 0;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-muted);
  font-weight: 600;
}
.sh-upcoming-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.sh-upcoming-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-secondary);
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
}
.sh-upcoming-title-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sh-upcoming-due {
  font-size: 11.5px;
  color: var(--text-muted);
  white-space: nowrap;
}
.sh-plan-item-reason {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.sh-dot { color: var(--text-faint); }
.sh-status-tag {
  text-transform: capitalize;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--border-subtle);
  color: var(--text-secondary);
  font-size: 11px;
}
.sh-status-tag[data-status="in_progress"] { background: rgba(79, 140, 255, 0.16); color: var(--accent-hover); }
.sh-status-tag[data-status="completed"] { background: rgba(47, 211, 157, 0.18); color: #6fe0bc; }
.sh-status-tag[data-status="weak"] { background: rgba(255, 107, 127, 0.16); color: #ff8ea1; }
.sh-status-tag[data-status="revision_due"] { background: rgba(242, 184, 79, 0.16); color: #f6c577; }
.sh-plan-item--done { opacity: 0.66; }
.sh-plan-item--done h4 { text-decoration: line-through; }
.sh-plan-item-actions,
.sh-topic-row-actions,
.sh-revision-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
}

.sh-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
}
.sh-stat {
  padding: 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  display: flex;
  flex-direction: column;
  gap: 4px;
  font: inherit;
  text-align: left;
  color: inherit;
  cursor: pointer;
  transition: border-color 120ms ease, transform 120ms ease, background 120ms ease;
}
.sh-stat:hover:not(:disabled) {
  border-color: rgba(79, 140, 255, 0.36);
  transform: translateY(-1px);
}
.sh-stat:disabled {
  cursor: default;
  opacity: 0.85;
}
.sh-stat:focus-visible {
  outline: none;
  border-color: rgba(79, 140, 255, 0.6);
  box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.12);
}
.sh-stat-cta {
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--accent-hover);
  opacity: 0;
  transform: translateX(-2px);
  transition: opacity 140ms ease, transform 140ms ease;
}
.sh-stat:hover:not(:disabled) .sh-stat-cta {
  opacity: 1;
  transform: translateX(0);
}
.sh-stat strong {
  font-size: 26px;
  line-height: 1;
  font-family: var(--font-brand);
  letter-spacing: -0.01em;
}
.sh-stat-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-muted);
}
.sh-stat p { margin: 0; font-size: 12px; color: var(--text-muted); }
.sh-stat--warning strong { color: #ff8ea1; }
.sh-stat--accent strong { color: var(--accent-hover); }
.sh-stat--success strong { color: #6fe0bc; }

@media (max-width: 900px) {
  .sh-shell { padding: 24px 18px; }
  .sh-grid { grid-template-columns: 1fr; }
  .sh-panel--span-2 { grid-column: span 1; }
}
</style>
