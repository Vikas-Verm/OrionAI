<template>
  <div class="briefing-shell">
    <div class="briefing-hero">
      <div class="briefing-topline">
        <span class="briefing-badge">{{ titleLabel }}</span>
        <span class="briefing-date">{{ dateLabel }}</span>
      </div>

      <div class="briefing-hero-grid">
        <div class="briefing-copy">
          <div class="briefing-orb">🔭</div>
          <div>
            <h2>{{ heading }}</h2>
            <p class="briefing-kicker">{{ kicker }}</p>
            <p class="briefing-summary">{{ summary }}</p>
          </div>
        </div>

        <div class="briefing-stats">
          <div
            v-for="stat in visibleStats"
            :key="stat.label"
            class="briefing-stat"
          >
            <span class="briefing-stat-label">{{ stat.label }}</span>
            <strong class="briefing-stat-value">{{ stat.value }}</strong>
          </div>
        </div>
      </div>

      <div v-if="connectedApps.length" class="briefing-apps">
        <span class="briefing-apps-label">Connected</span>
        <span
          v-for="app in connectedApps"
          :key="app.id"
          class="briefing-app-chip"
        >
          <span>{{ app.icon }}</span>
          <span>{{ app.label }}</span>
        </span>
      </div>
    </div>

    <div v-if="alerts.length" class="briefing-section">
      <div class="briefing-section-head">
        <h3>Smart Alerts</h3>
        <span>{{ alerts.length }} active</span>
      </div>

      <div class="briefing-alerts">
        <button
          v-for="alert in alerts"
          :key="alert.id"
          class="briefing-alert"
          :class="`severity-${alert.severity || 'medium'}`"
          @click="emitPrompt(alert.prompt, 'agent')"
        >
          <div class="briefing-alert-top">
            <span class="briefing-alert-icon">{{ alert.icon }}</span>
            <span class="briefing-alert-title">{{ alert.title }}</span>
          </div>
          <p class="briefing-alert-detail">{{ alert.detail }}</p>
          <span class="briefing-alert-cta">Ask OrionAI</span>
        </button>
      </div>
    </div>

    <div v-if="calendarEvents.length" class="briefing-section">
      <div class="briefing-section-head">
        <h3>Upcoming Today</h3>
        <span>{{ calendarEvents.length }} meeting{{ calendarEvents.length === 1 ? '' : 's' }}</span>
      </div>

      <div class="briefing-calendar">
        <div
          v-for="event in calendarEvents"
          :key="event.id"
          class="briefing-calendar-card"
        >
          <div class="briefing-calendar-time">{{ event.time }}</div>
          <div class="briefing-calendar-body">
            <div class="briefing-calendar-title">{{ event.title }}</div>
            <div class="briefing-calendar-meta">
              <span>{{ event.date }}</span>
              <span v-if="event.location">{{ event.location }}</span>
              <span v-else-if="event.meet">Google Meet</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="briefing-section">
      <div class="briefing-section-head">
        <h3>Try OrionAI On Your Stack</h3>
        <span>{{ suggestions.length }} suggestion{{ suggestions.length === 1 ? '' : 's' }}</span>
      </div>

      <div class="briefing-suggestions">
        <button
          v-for="suggestion in suggestions"
          :key="suggestion.id || suggestion.label"
          class="briefing-suggestion"
          @click="emitPrompt(suggestion.prompt, suggestion.mode || 'chat')"
        >
          <span class="briefing-suggestion-label">{{ suggestion.label }}</span>
          <span class="briefing-suggestion-text">{{ suggestion.prompt }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../../services/api'

const props = defineProps({
  fallbackTitle: { type: String, default: 'Morning briefing' },
})

const emit = defineEmits(['usePrompt'])

const briefing = ref(null)

const fallbackSuggestions = [
  {
    id: 'fallback-plan',
    label: 'Plan my day',
    prompt: 'Help me plan the highest-impact work for today.',
    mode: 'chat',
  },
  {
    id: 'fallback-ideas',
    label: 'Put OrionAI to work',
    prompt: 'Give me three meaningful ways to use OrionAI today.',
    mode: 'chat',
  },
]

const titleLabel = computed(() => briefing.value?.title || props.fallbackTitle)
const dateLabel = computed(() => briefing.value?.dateLabel || 'Now')
const heading = computed(() =>
  briefing.value?.timeOfDay === 'morning'
    ? 'Good morning'
    : briefing.value?.timeOfDay === 'afternoon'
      ? 'Welcome back'
      : 'Ready for a quick reset?'
)
const kicker = computed(() =>
  briefing.value?.greeting || 'OrionAI can turn your connected apps into a live command center.'
)
const summary = computed(() =>
  briefing.value?.summary || 'Connect your work apps and OrionAI will brief you before you even type.'
)
const visibleStats = computed(() =>
  briefing.value?.stats?.length
    ? briefing.value.stats
    : [
        { label: 'Connected apps', value: '0' },
        { label: 'Needs attention', value: '0' },
        { label: 'Today', value: 'Clear' },
      ]
)
const alerts = computed(() => briefing.value?.alerts || [])
const connectedApps = computed(() => briefing.value?.connectedApps || [])
const calendarEvents = computed(() => briefing.value?.calendar?.events || [])
const suggestions = computed(() =>
  briefing.value?.suggestions?.length ? briefing.value.suggestions : fallbackSuggestions
)

function emitPrompt(prompt, mode) {
  emit('usePrompt', { prompt, mode })
}

onMounted(async () => {
  try {
    const { data } = await api.get('/api/briefing/morning')
    briefing.value = data
  } catch (err) {
    console.debug('Workspace briefing unavailable:', err.message)
  }
})
</script>

<style scoped>
.briefing-shell {
  --briefing-hero-bg:
    radial-gradient(circle at top left, rgba(251, 191, 36, 0.28), transparent 36%),
    radial-gradient(circle at 82% 18%, rgba(45, 212, 191, 0.18), transparent 26%),
    linear-gradient(135deg, rgba(20, 29, 40, 0.98), rgba(13, 38, 40, 0.94));
  --briefing-hero-border: rgba(255, 255, 255, 0.08);
  --briefing-hero-shadow: 0 24px 80px rgba(3, 7, 18, 0.35);
  --briefing-badge-bg: rgba(251, 191, 36, 0.14);
  --briefing-badge-border: rgba(251, 191, 36, 0.22);
  --briefing-badge-text: #fcd34d;
  --briefing-date-text: rgba(226, 232, 240, 0.66);
  --briefing-orb-bg: linear-gradient(135deg, rgba(251, 191, 36, 0.22), rgba(45, 212, 191, 0.12));
  --briefing-orb-border: rgba(255, 255, 255, 0.12);
  --briefing-heading: #f8fafc;
  --briefing-kicker: rgba(226, 232, 240, 0.82);
  --briefing-summary: rgba(226, 232, 240, 0.7);
  --briefing-stat-bg: rgba(255, 255, 255, 0.05);
  --briefing-stat-border: rgba(255, 255, 255, 0.08);
  --briefing-stat-label: rgba(148, 163, 184, 0.78);
  --briefing-stat-value: #f8fafc;
  --briefing-chip-bg: rgba(255, 255, 255, 0.06);
  --briefing-chip-border: rgba(255, 255, 255, 0.08);
  --briefing-chip-text: #e2e8f0;
  width: min(920px, 100%);
  max-width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px 0 8px;
}

.briefing-hero {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  padding: 22px;
  background: var(--briefing-hero-bg);
  border: 1px solid var(--briefing-hero-border);
  box-shadow: var(--briefing-hero-shadow);
}

.briefing-topline {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.briefing-badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--briefing-badge-bg);
  border: 1px solid var(--briefing-badge-border);
  color: var(--briefing-badge-text);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

.briefing-date {
  font-size: 12px;
  color: var(--briefing-date-text);
}

.briefing-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(220px, 0.9fr);
  gap: 18px;
  align-items: start;
}

.briefing-copy {
  display: flex;
  gap: 16px;
  min-width: 0;
}

.briefing-orb {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
  background: var(--briefing-orb-bg);
  border: 1px solid var(--briefing-orb-border);
}

.briefing-copy h2 {
  margin: 0 0 6px;
  font-size: clamp(24px, 3vw, 34px);
  line-height: 1;
  color: var(--briefing-heading);
  letter-spacing: -0.04em;
}

.briefing-kicker {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--briefing-kicker);
}

.briefing-summary {
  margin: 0;
  max-width: 640px;
  line-height: 1.7;
  font-size: 14px;
  color: var(--briefing-summary);
}

.briefing-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.briefing-stat {
  padding: 14px 15px;
  border-radius: 18px;
  background: var(--briefing-stat-bg);
  border: 1px solid var(--briefing-stat-border);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.briefing-stat-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--briefing-stat-label);
}

.briefing-stat-value {
  font-size: 22px;
  line-height: 1;
  color: var(--briefing-stat-value);
}

.briefing-apps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}

.briefing-apps-label {
  display: inline-flex;
  align-items: center;
  padding-right: 4px;
  font-size: 11px;
  color: var(--briefing-stat-label);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.briefing-app-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 11px;
  border-radius: 999px;
  background: var(--briefing-chip-bg);
  border: 1px solid var(--briefing-chip-border);
  color: var(--briefing-chip-text);
  font-size: 12px;
}

:global([data-theme="light"]) .briefing-shell {
  --briefing-hero-bg:
    radial-gradient(circle at top left, rgba(251, 191, 36, 0.18), transparent 34%),
    radial-gradient(circle at 82% 18%, rgba(45, 212, 191, 0.12), transparent 24%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(239, 246, 255, 0.98));
  --briefing-hero-border: rgba(148, 163, 184, 0.24);
  --briefing-hero-shadow: 0 18px 42px rgba(148, 163, 184, 0.18);
  --briefing-badge-bg: rgba(251, 191, 36, 0.12);
  --briefing-badge-border: rgba(245, 158, 11, 0.2);
  --briefing-badge-text: #b45309;
  --briefing-date-text: rgba(30, 41, 59, 0.56);
  --briefing-orb-bg: linear-gradient(135deg, rgba(251, 191, 36, 0.16), rgba(45, 212, 191, 0.08));
  --briefing-orb-border: rgba(148, 163, 184, 0.22);
  --briefing-heading: #0f172a;
  --briefing-kicker: rgba(15, 23, 42, 0.78);
  --briefing-summary: rgba(15, 23, 42, 0.68);
  --briefing-stat-bg: rgba(255, 255, 255, 0.84);
  --briefing-stat-border: rgba(148, 163, 184, 0.2);
  --briefing-stat-label: rgba(71, 85, 105, 0.82);
  --briefing-stat-value: #0f172a;
  --briefing-chip-bg: rgba(255, 255, 255, 0.86);
  --briefing-chip-border: rgba(148, 163, 184, 0.18);
  --briefing-chip-text: #1e293b;
}

.briefing-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.briefing-section-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.briefing-section-head h3 {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.briefing-section-head span {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.briefing-alerts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.briefing-alert {
  text-align: left;
  border-radius: 20px;
  padding: 16px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.briefing-alert:hover {
  transform: translateY(-1px);
  border-color: var(--border-default);
  background: var(--bg-overlay);
}

.briefing-alert.severity-high {
  border-color: rgba(248, 113, 113, 0.22);
  background: linear-gradient(135deg, rgba(127, 29, 29, 0.22), rgba(15, 23, 42, 0.96));
}

:global([data-theme="light"]) .briefing-alert.severity-high {
  border-color: rgba(248, 113, 113, 0.28);
  background: linear-gradient(135deg, rgba(254, 226, 226, 0.96), rgba(255, 255, 255, 0.98));
}

.briefing-alert.severity-medium {
  border-color: rgba(251, 191, 36, 0.18);
}

:global([data-theme="light"]) .briefing-alert,
:global([data-theme="light"]) .briefing-suggestion,
:global([data-theme="light"]) .briefing-calendar-card {
  background: rgba(255, 255, 255, 0.88);
  border-color: rgba(148, 163, 184, 0.18);
}

:global([data-theme="light"]) .briefing-alert:hover,
:global([data-theme="light"]) .briefing-suggestion:hover {
  background: rgba(248, 250, 252, 0.98);
}

.briefing-alert-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.briefing-alert-icon {
  font-size: 18px;
}

.briefing-alert-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.briefing-alert-detail {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-muted);
}

.briefing-alert-cta {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #f59e0b;
}

.briefing-calendar {
  display: grid;
  gap: 10px;
}

.briefing-calendar-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--border-subtle);
  background: rgba(255, 255, 255, 0.04);
}

.briefing-calendar-time {
  min-width: 72px;
  font-size: 12px;
  font-weight: 700;
  color: #2dd4bf;
  letter-spacing: 0.02em;
}

.briefing-calendar-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.briefing-calendar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.briefing-calendar-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted);
}

.briefing-suggestions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.briefing-suggestion {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 15px;
  border-radius: 18px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  cursor: pointer;
  transition: border-color 0.18s ease, transform 0.18s ease, background 0.18s ease;
}

.briefing-suggestion:hover {
  transform: translateY(-1px);
  border-color: rgba(45, 212, 191, 0.34);
  background: rgba(45, 212, 191, 0.05);
}

.briefing-suggestion-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.briefing-suggestion-text {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-muted);
}

@media (max-width: 820px) {
  .briefing-shell {
    width: calc(100% - 24px);
  }

  .briefing-hero {
    padding: 18px;
    border-radius: 22px;
  }

  .briefing-hero-grid {
    grid-template-columns: 1fr;
  }

  .briefing-stats {
    grid-template-columns: 1fr;
  }

  .briefing-copy {
    flex-direction: column;
  }

  .briefing-orb {
    width: 48px;
    height: 48px;
    font-size: 20px;
  }
}
</style>
