import { computed, ref } from 'vue'
import api from '../services/api'

const HIDDEN_BADGE_STATES = new Set(['no_action_needed', 'resolved', 'waiting_on_others'])

const QUICK_ACTION_ALIASES = {
  approve: 'handled',
  approved: 'handled',
  handle: 'handled',
  handled: 'handled',
  done: 'handled',
  mark_done: 'handled',
  edited_approved: 'handled',
  dismiss: 'dismissed',
  dismissed: 'dismissed',
  snooze: 'snoozed',
  snoozed: 'snoozed',
  reclassify: 'reclassified',
  reclassified: 'reclassified',
}

function normalizeQuickAction(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  return QUICK_ACTION_ALIASES[normalized] || normalized
}

function buildCanonicalItemId(item, source) {
  if (!item) return ''
  if (item.id && String(item.id).startsWith('comm:')) return String(item.id)
  if (item.conversationKey) return String(item.conversationKey)
  if (item.meta?.conversationKey) return String(item.meta.conversationKey)

  const sourceApp = String(item.sourceApp || source || '').toLowerCase()
  const conversationId = String(
    item.conversationId || item.meta?.conversationId || ''
  )
  if (sourceApp && conversationId) return `comm:${sourceApp}:${conversationId}`
  return String(item.id || '')
}

export function emitCommunicationPriorityRefresh(reason, extras = {}) {
  document.dispatchEvent(new CustomEvent('orion:priority-refresh-needed', {
    detail: {
      reason,
      ...extras,
    },
  }))
}

export function useCommunicationActions(source) {
  const loading = ref(false)
  const payload = ref(null)
  const items = ref([])
  const allItems = ref([])

  const groups = computed(() => payload.value?.groups || [])
  const counts = computed(() => payload.value?.counts || {})
  const summaryText = computed(() => payload.value?.summaryText || '')
  const actionableItems = computed(() =>
    items.value.filter((item) => item.actionState !== 'no_action_needed')
  )
  const stateByConversationId = computed(() => {
    const map = {}
    allItems.value
      .filter((item) => !HIDDEN_BADGE_STATES.has(item.actionState))
      .forEach((item) => {
        map[String(item.conversationId)] = item
      })
    return map
  })

  async function refresh({ silent = false } = {}) {
    if (!silent) loading.value = true
    try {
      const { data } = await api.get('/api/communications/action-states', {
        params: {
          source,
          debug: import.meta.env.DEV ? 1 : undefined,
        },
      })
      payload.value = data
      items.value = Array.isArray(data.states) ? data.states : []
      allItems.value = Array.isArray(data.allStates) ? data.allStates : items.value
      if (import.meta.env.DEV && data?.debug?.enabled) {
        console.debug(`[OrionAI] ${source} conversation states`, {
          counts: data.counts,
          states: allItems.value.map((item) => item.debug || {
            source: item.sourceType,
            conversationId: item.conversationId,
            state: item.state,
            currentActor: item.currentActor,
            reason: item.reason || item.actionReason,
            confidence: item.confidence,
            eligibleForInsights: item.eligibleForInsights,
            eligibleForBriefing: item.eligibleForBriefing,
            eligibleForPriorityFeed: item.eligibleForPriorityFeed,
          }),
        })
      }
    } catch (err) {
      console.debug(`Communication actions unavailable for ${source}:`, err.message)
    } finally {
      if (!silent) loading.value = false
    }
  }

  async function recordAction(item, action, extras = {}) {
    const canonicalAction = normalizeQuickAction(action)
    const itemId = buildCanonicalItemId(item, source)
    await api.post('/api/briefing/priority-feed/actions', {
      itemId,
      sourceApp: item.sourceApp || source,
      title: item.conversationTitle || item.title,
      action: canonicalAction,
      actionLabel: item.actionStateLabel || item.actionReason || '',
      fromActionState: item.actionState || item.meta?.actionState || '',
      ...extras,
    })

    emitCommunicationPriorityRefresh('communication_action_recorded', {
      sourceApp: item.sourceApp || source,
      conversationId: item.conversationId || item.meta?.conversationId,
      action: canonicalAction,
    })
    await refresh({ silent: true })
  }

  function markHandled(item) {
    return recordAction(item, 'handled')
  }

  function dismissItem(item) {
    return recordAction(item, 'dismissed')
  }

  function snoozeItem(item, minutes) {
    return recordAction(item, 'snoozed', { snoozeMinutes: minutes })
  }

  function reclassifyItem(item, targetActionState, reason = '') {
    return recordAction(item, 'reclassified', {
      targetActionState,
      reason,
    })
  }

  async function recordOpen(item, origin = 'card') {
    try {
      await api.post('/api/briefing/priority-feed/telemetry', {
        kind: 'open',
        itemId: buildCanonicalItemId(item, source),
        sourceApp: item.sourceApp || source,
        conversationId: item.conversationId || item.meta?.conversationId,
        threadId: item.meta?.threadId || item.threadId || '',
        origin,
      })
    } catch (err) {
      // telemetry must never block UX
      console.debug('communication open telemetry failed:', err.message)
    }
  }

  return {
    loading,
    payload,
    items,
    allItems,
    groups,
    counts,
    summaryText,
    actionableItems,
    stateByConversationId,
    refresh,
    recordAction,
    markHandled,
    dismissItem,
    snoozeItem,
    reclassifyItem,
    recordOpen,
  }
}
