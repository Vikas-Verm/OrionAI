import { computed, ref } from 'vue'
import api from '../services/api'

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

  const groups = computed(() => payload.value?.groups || [])
  const counts = computed(() => payload.value?.counts || {})
  const summaryText = computed(() => payload.value?.summaryText || '')
  const actionableItems = computed(() =>
    items.value.filter((item) => item.actionState !== 'no_action_needed')
  )
  const stateByConversationId = computed(() => {
    const map = {}
    actionableItems.value.forEach((item) => {
      map[String(item.conversationId)] = item
    })
    return map
  })

  async function refresh({ silent = false } = {}) {
    if (!silent) loading.value = true
    try {
      const { data } = await api.get('/api/communications/action-states', {
        params: { source },
      })
      payload.value = data
      items.value = Array.isArray(data.states) ? data.states : []
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
    groups,
    counts,
    summaryText,
    actionableItems,
    stateByConversationId,
    refresh,
    recordAction,
  }
}
