<template>
  <div class="messages-wrapper">
    <div class="messages" ref="containerRef" @scroll="onScroll">

      <!-- Chat empty state -->
      <div v-if="store.messages.length === 0 && store.attachments.length === 0 && store.mode === 'chat'"
        class="empty-state empty-state--briefing">
        <WorkspaceBriefing @usePrompt="emit('usePrompt', $event)" />
      </div>

      <!-- DB empty state with quick prompts -->
      <div v-if="store.messages.length === 0 && store.attachments.length === 0 && store.mode === 'db'"
        class="empty-state empty-state--workspace">
        <div class="empty-state-icon">{{ dataEmptyState.icon }}</div>
        <h3>{{ dataEmptyState.title }}</h3>
        <p>{{ dataEmptyState.description }}</p>
        <div v-if="dataEmptyState.meta.length" class="empty-state-chips">
          <span v-for="chip in dataEmptyState.meta" :key="chip" class="empty-state-chip">{{ chip }}</span>
        </div>
        <div v-if="dataQuickPrompts.length" class="quick-actions">
          <button v-for="prompt in dataQuickPrompts" :key="prompt.id || prompt.text"
            class="quick-action" @click="emit('usePrompt', prompt)">
            <span class="qa-icon">{{ prompt.icon }}</span>
            <span class="qa-text">{{ prompt.text }}</span>
          </button>
        </div>
      </div>

      <!-- Agent empty state -->
      <div v-if="store.messages.length === 0 && store.attachments.length === 0 && store.mode === 'agent'"
        class="empty-state empty-state--workspace">
        <div class="empty-state-icon">🤖</div>
        <h3>Agent Workspace</h3>
        <p>{{ agentDescription }}</p>
        <div v-if="agentMeta.length" class="empty-state-chips">
          <span v-for="chip in agentMeta" :key="chip" class="empty-state-chip">{{ chip }}</span>
        </div>
        <div class="quick-actions">
          <button v-for="prompt in agentQuickPrompts" :key="prompt.id || prompt.text"
            class="quick-action" @click="emit('usePrompt', prompt)">
            <span class="qa-icon">{{ prompt.icon }}</span>
            <span class="qa-text">{{ prompt.text }}</span>
          </button>
        </div>
      </div>

      <!-- Messages -->
      <MessageBubble v-for="(msg, i) in store.messages" :key="i" :msg="msg" :messageIndex="i" />

      <!-- Typing indicator -->
      <TypingIndicator />

      <!-- Chart -->
      <ChartContainer v-if="store.mode === 'db' && store.chartData" />

      <!-- Regenerate button -->
      <RegenButton @regenerate="emit('regenerate')" />
    </div>

    <!-- Scroll to bottom button -->
    <transition name="scroll-btn-fade">
      <button v-if="showScrollBtn" class="scroll-to-bottom-btn" @click="scrollToBottom">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 5v14M5 12l7 7 7-7"/>
        </svg>
      </button>
    </transition>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { store } from '../../stores/app'
import api from '../../services/api'
import MessageBubble from './MessageBubble.vue'
import WorkspaceBriefing from './WorkspaceBriefing.vue'
import ChartContainer from '../chart/ChartContainer.vue'
import TypingIndicator from './TypingIndicator.vue'
import RegenButton from './RegenButton.vue'

const emit = defineEmits(['usePrompt', 'regenerate'])
const containerRef = ref(null)
const showScrollBtn = ref(false)
let userScrolledUp = false

const integrations = ref([])
const dbSchema = ref([])
const dbConnection = ref(null)

const isEmptyWorkspace = computed(() =>
  store.messages.length === 0 && store.attachments.length === 0
)

const hasDatabaseIntegration = computed(() =>
  integrations.value.some((integration) => integration.type === 'database' && integration.enabled !== false)
)

const connectedAppLabels = computed(() =>
  integrations.value
    .map((integration) => integration.type)
    .filter(Boolean)
)

const dataQuickPrompts = computed(() => {
  if (!hasDatabaseIntegration.value) return []
  return buildDataQuickPrompts(dbSchema.value)
})

const dataEmptyState = computed(() => {
  if (!hasDatabaseIntegration.value) {
    return {
      icon: '🗄️',
      title: 'Connect your database first',
      description: 'Add PostgreSQL, MySQL, MongoDB, or SQLite from Integrations to unlock Data mode.',
      meta: ['No database connected'],
    }
  }

  const vendor = dbConnection.value?.vendor || 'Database'
  const alias = dbConnection.value?.alias || 'Connected database'
  const tableCount = dbSchema.value.length
  const totalRows = dbSchema.value.reduce((sum, table) => sum + Number(table.count || 0), 0)

  return {
    icon: '📊',
    title: 'Data Intelligence',
    description: `Query ${alias} in natural language and explore the tables OrionAI already understands.`,
    meta: [
      vendor,
      tableCount ? `${tableCount} table${tableCount === 1 ? '' : 's'}` : 'Schema loading',
      totalRows ? `${formatCompactNumber(totalRows)} rows` : 'Live connection',
    ],
  }
})

const agentQuickPrompts = computed(() => buildAgentQuickPrompts(connectedAppLabels.value))

const agentMeta = computed(() =>
  connectedAppLabels.value.length
    ? connectedAppLabels.value.slice(0, 5).map(formatAppLabel)
    : ['No connected apps yet']
)

const agentDescription = computed(() =>
  connectedAppLabels.value.length
    ? 'Run multi-step work across your connected apps, with confirmations before sensitive actions.'
    : 'Connect Gmail, Jira, Calendar, Slack, Telegram, Database, or Razorpay to give Agent mode real work to do.'
)

async function loadEmptyStateContext() {
  if (!isEmptyWorkspace.value) return

  try {
    const { data } = await api.get('/api/integrations')
    integrations.value = Array.isArray(data) ? data.filter((item) => item.enabled !== false) : []
  } catch {
    integrations.value = []
  }

  if (store.mode === 'db' && hasDatabaseIntegration.value) {
    try {
      const { data } = await api.get('/api/integrations/database/schema')
      dbSchema.value = Array.isArray(data.tables) ? data.tables : []
      dbConnection.value = data.connection || null
    } catch {
      dbSchema.value = []
      dbConnection.value = null
    }
  }
}

function buildDataQuickPrompts(tables = []) {
  const prompts = []

  for (const table of tables.slice(0, 3)) {
    const name = table.name
    const shortName = shortenTableName(name)
    const fields = Array.isArray(table.fieldNames) ? table.fieldNames.map((field) => String(field).toLowerCase()) : []
    const statusField = fields.find((field) => ['status', 'state', 'stage'].includes(field))
    const dateField = fields.find((field) => ['created_at', 'createdat', 'createdon', 'date', 'updated_at', 'timestamp'].includes(field))

    prompts.push({
      id: `${name}-latest`,
      icon: '🧾',
      text: `Show latest 20 rows from ${shortName}`,
      prompt: `Show the latest 20 rows from ${name}.`,
      mode: 'db',
    })

    prompts.push({
      id: `${name}-count`,
      icon: '📊',
      text: `How many records are in ${shortName}?`,
      prompt: `How many records are in ${name}?`,
      mode: 'db',
    })

    if (statusField && prompts.length < 4) {
      prompts.push({
        id: `${name}-status`,
        icon: '📈',
        text: `Group ${shortName} by ${statusField}`,
        prompt: `Group ${name} by ${statusField} and summarize the counts.`,
        mode: 'db',
      })
    } else if (dateField && prompts.length < 4) {
      prompts.push({
        id: `${name}-recent`,
        icon: '⏱️',
        text: `${shortName} from the last 7 days`,
        prompt: `Show ${name} from the last 7 days using ${dateField}.`,
        mode: 'db',
      })
    }

    if (prompts.length >= 4) break
  }

  return prompts.slice(0, 4)
}

function buildAgentQuickPrompts(apps = []) {
  const prompts = []

  if (apps.includes('jira')) {
    prompts.push({
      id: 'agent-jira',
      icon: '🎫',
      text: 'Review my overdue Jira tickets and rank what I should tackle first',
      prompt: 'Show my overdue Jira tickets, rank them by urgency, and tell me what I should tackle first.',
      mode: 'agent',
    })
  }

  if (apps.includes('gmail')) {
    prompts.push({
      id: 'agent-gmail',
      icon: '📧',
      text: 'Summarize the Gmail threads that need a reply',
      prompt: 'Summarize the Gmail threads that still need my reply and draft responses for the urgent ones.',
      mode: 'agent',
    })
  }

  if (apps.includes('google_calendar')) {
    prompts.push({
      id: 'agent-calendar',
      icon: '📅',
      text: 'Prep me for my meetings today',
      prompt: 'Prep me for my meetings today and tell me what I should have ready.',
      mode: 'agent',
    })
  }

  if (apps.includes('slack') || apps.includes('telegram') || apps.includes('signal') || apps.includes('whatsapp')) {
    prompts.push({
      id: 'agent-messages',
      icon: '💬',
      text: 'Summarize unread messages across my connected apps',
      prompt: 'Summarize unread messages across my connected apps and identify anything urgent.',
      mode: 'agent',
    })
  }

  if (apps.includes('database')) {
    prompts.push({
      id: 'agent-db',
      icon: '🗄️',
      text: 'Pull the most important business signals from my database',
      prompt: 'Query my connected database and tell me the most important business signals I should know today.',
      mode: 'agent',
    })
  }

  if (apps.includes('razorpay')) {
    prompts.push({
      id: 'agent-razorpay',
      icon: '₹',
      text: 'Review recent Razorpay payouts and flag anything stuck',
      prompt: 'Review my recent Razorpay payouts, flag anything stuck or pending, and summarize what finance should review.',
      mode: 'agent',
    })
  }

  if (!prompts.length) {
    prompts.push(
      {
        id: 'agent-connect',
        icon: '🔌',
        text: 'Connect Gmail, Jira, Calendar, or Database to unlock Agent mode',
        prompt: 'Show me the best integrations to connect first so Agent mode becomes more useful.',
        mode: 'chat',
      },
      {
        id: 'agent-ideas',
        icon: '✨',
        text: 'Give me three powerful things Agent mode can do for my workflow',
        prompt: 'Give me three powerful examples of how I can use Agent mode in my workflow.',
        mode: 'chat',
      }
    )
  }

  return prompts.slice(0, 4)
}

function shortenTableName(name = '') {
  const parts = String(name).split('.')
  return parts[parts.length - 1] || name
}

function formatCompactNumber(value) {
  const number = Number(value || 0)
  if (!number) return '0'
  return new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: number >= 10000 ? 0 : 1,
  }).format(number)
}

function formatAppLabel(type = '') {
  return {
    gmail: 'Gmail',
    slack: 'Slack',
    telegram: 'Telegram',
    signal: 'Signal',
    whatsapp: 'WhatsApp',
    jira: 'Jira',
    google_calendar: 'Calendar',
    database: 'Database',
    razorpay: 'Razorpay',
  }[type] || type
}

// Track user scroll position
function onScroll() {
  const el = containerRef.value
  if (!el) return
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  userScrolledUp = distanceFromBottom > 80
  showScrollBtn.value = distanceFromBottom > 80
}

// Hard scroll — session switch, new message sent
function scrollToBottom() {
  setTimeout(() => {
    const el = containerRef.value
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    userScrolledUp = false
    showScrollBtn.value = false
  }, 0)
}

// Stream scroll — called on every token, respects user scroll position
function scrollDuringStream() {
  if (userScrolledUp) return
  const el = containerRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

defineExpose({ scrollToBottom, scrollDuringStream })

onMounted(() => {
  loadEmptyStateContext()
})

watch(
  () => [store.mode, store.currentSessionId, store.user?.username, store.messages.length, store.attachments.length],
  () => {
    loadEmptyStateContext()
  }
)
</script>
