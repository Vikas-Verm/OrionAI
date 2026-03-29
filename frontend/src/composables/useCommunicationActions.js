import { computed, ref } from 'vue'
import api from '../services/api'

const HIDDEN_BADGE_STATES = new Set(['no_action_needed', 'resolved', 'waiting_on_others'])

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
    await api.post('/api/briefing/priority-feed/actions', {
      itemId: item.id,
      sourceApp: item.sourceApp || source,
      title: item.conversationTitle || item.title,
      action,
      actionLabel: item.actionStateLabel || item.actionReason || '',
      ...extras,
    })

    emitCommunicationPriorityRefresh('communication_action_recorded', {
      sourceApp: item.sourceApp || source,
      conversationId: item.conversationId,
    })
    await refresh({ silent: true })
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
  }
}
