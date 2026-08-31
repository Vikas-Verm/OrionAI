export const DISPLAY_NAME_RANKS = Object.freeze({
  contact_name: 100,
  business_name: 95,
  room_name: 80,
  push_name: 60,
  ghost_name: 50,
  legacy: 40,
  phone_fallback: 20,
  unknown: 0,
})

export const AVATAR_RANKS = Object.freeze({
  portal: 100,
  room: 90,
  ghost: 80,
  remote_profile: 75,
  legacy: 20,
  none: 0,
  unknown: 0,
})

function text(value = '') {
  return String(value || '').trim()
}

export function timestamp(value) {
  if (!value) return 0
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) return numeric
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function looksLikeIdentifier(value = '') {
  const normalized = text(value)
  return /^\+?[\d\s().-]+$/.test(normalized) || /@(lid|s\.whatsapp\.net|g\.us)$/i.test(normalized)
}

export function displayNameRank(chat = {}) {
  const explicit = Number(chat.displayNameRank)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const source = text(chat.displayNameSource).toLowerCase()
  if (DISPLAY_NAME_RANKS[source] !== undefined) return DISPLAY_NAME_RANKS[source]
  const name = text(chat.title || chat.name || chat.displayName)
  return looksLikeIdentifier(name)
    ? DISPLAY_NAME_RANKS.phone_fallback
    : DISPLAY_NAME_RANKS.legacy
}

export function mergeConversationMetadata(existing = {}, incoming = {}) {
  const existingName = text(existing.title || existing.name || existing.displayName)
  const incomingName = text(incoming.title || incoming.name || incoming.displayName)
  const existingRank = displayNameRank(existing)
  const incomingRank = displayNameRank(incoming)
  const useIncomingName = Boolean(
    incomingName && (!existingName || incomingRank >= existingRank)
  )
  const existingActivity = timestamp(existing.lastMessageAt || existing.lastActivityAt || existing.lastMessageTs)
  const incomingActivity = timestamp(incoming.lastMessageAt || incoming.lastActivityAt || incoming.lastMessageTs)
  const useIncomingActivity = Boolean(incomingActivity && incomingActivity >= existingActivity)
  const title = useIncomingName ? incomingName : existingName
  const incomingAvatarState = text(incoming.avatarState).toLowerCase()
  const incomingAvatarSource = text(incoming.avatarSource).toLowerCase() || 'unknown'
  const existingAvatarSource = text(existing.avatarSource).toLowerCase() || 'unknown'
  const incomingAvatarRank = Number(incoming.avatarRank || AVATAR_RANKS[incomingAvatarSource] || 0)
  const existingAvatarRank = Number(existing.avatarRank || AVATAR_RANKS[existingAvatarSource] || 0)
  const incomingAvatarUrl = text(incoming.avatarUrl)
  const incomingAvatarMxc = text(incoming.avatarMxc)
  const authoritativeAvatarRemoval = Boolean(
    incoming.authoritativeAvatarRemoval === true &&
    ['broken', 'missing'].includes(incomingAvatarState)
  )
  const useIncomingAvatar = Boolean(
    !authoritativeAvatarRemoval &&
    (incomingAvatarUrl || incomingAvatarMxc) &&
    (!(existing.avatarUrl || existing.avatarMxc) || incomingAvatarRank >= existingAvatarRank)
  )

  return {
    ...existing,
    ...incoming,
    title,
    name: title,
    displayName: title,
    displayNameSource: useIncomingName
      ? text(incoming.displayNameSource) || 'legacy'
      : text(existing.displayNameSource) || 'legacy',
    displayNameRank: useIncomingName ? incomingRank : existingRank,
    avatarUrl: authoritativeAvatarRemoval
      ? ''
      : useIncomingAvatar
        ? incomingAvatarUrl
        : text(existing.avatarUrl),
    avatarMxc: authoritativeAvatarRemoval
      ? ''
      : useIncomingAvatar
        ? incomingAvatarMxc
        : text(existing.avatarMxc),
    avatarSource: authoritativeAvatarRemoval
      ? 'none'
      : useIncomingAvatar
        ? incomingAvatarSource
        : existingAvatarSource,
    avatarRank: authoritativeAvatarRemoval
      ? 0
      : useIncomingAvatar
        ? incomingAvatarRank
        : existingAvatarRank,
    avatarState: authoritativeAvatarRemoval
      ? incomingAvatarState
      : useIncomingAvatar
        ? incomingAvatarState || 'unknown'
        : text(existing.avatarState) || 'unknown',
    lastMessageAt: useIncomingActivity
      ? incoming.lastMessageAt || incoming.lastActivityAt
      : existing.lastMessageAt || existing.lastActivityAt || null,
    lastMessageTs: useIncomingActivity ? incomingActivity : existingActivity,
    lastMessagePreview: useIncomingActivity
      ? text(incoming.lastMessagePreview || incoming.lastMessage)
      : text(existing.lastMessagePreview || existing.lastMessage),
    lastEventId: useIncomingActivity
      ? text(incoming.lastEventId || incoming.latestMessageId)
      : text(existing.lastEventId || existing.latestMessageId),
    latestMessageId: useIncomingActivity
      ? text(incoming.latestMessageId || incoming.lastEventId)
      : text(existing.latestMessageId || existing.lastEventId),
  }
}

export function sortConversationsByActivity(chats = []) {
  return [...chats].sort((left, right) => {
    const delta = timestamp(right.lastMessageAt || right.lastMessageTs) - timestamp(left.lastMessageAt || left.lastMessageTs)
    if (delta !== 0) return delta
    return text(left.title || left.name).localeCompare(text(right.title || right.name))
  })
}

export function mergeConversationLists(existing = [], incoming = []) {
  const byRoom = new Map(
    existing.filter((chat) => chat?.roomId).map((chat) => [String(chat.roomId), chat])
  )
  for (const chat of incoming || []) {
    if (!chat?.roomId) continue
    const roomId = String(chat.roomId)
    byRoom.set(roomId, mergeConversationMetadata(byRoom.get(roomId) || {}, chat))
  }
  const incomingIds = new Set((incoming || []).map((chat) => String(chat?.roomId || '')).filter(Boolean))
  return sortConversationsByActivity(
    [...byRoom.values()].filter((chat) => incomingIds.has(String(chat.roomId || '')))
  )
}

export function mergeMessagesByEvent(existing = [], incoming = []) {
  const byId = new Map()
  for (const message of [...existing, ...incoming]) {
    const id = text(message?.id || message?.eventId)
    if (!id) continue
    byId.set(id, { ...(byId.get(id) || {}), ...message, id, eventId: id })
  }
  return [...byId.values()].sort((left, right) => timestamp(left.timestamp) - timestamp(right.timestamp))
}

export function createConversationHistoryCache({
  maxEntries = 12,
  maxAgeMs = 2 * 60 * 1000,
  now = () => Date.now(),
} = {}) {
  const entries = new Map()

  function roomKey(roomId = '') {
    return text(roomId)
  }

  function prune() {
    const cutoff = now() - Math.max(0, Number(maxAgeMs || 0))
    for (const [key, entry] of entries) {
      if (Number(entry.cachedAt || 0) < cutoff) entries.delete(key)
    }
    while (entries.size > Math.max(1, Number(maxEntries || 1))) {
      entries.delete(entries.keys().next().value)
    }
  }

  function set(roomId, { messages = [], prevBatch = null } = {}) {
    const key = roomKey(roomId)
    if (!key) return null
    entries.delete(key)
    const entry = {
      messages: mergeMessagesByEvent([], messages),
      prevBatch: prevBatch || null,
      cachedAt: now(),
    }
    entries.set(key, entry)
    prune()
    return entry
  }

  function get(roomId) {
    const key = roomKey(roomId)
    if (!key) return null
    prune()
    const entry = entries.get(key)
    if (!entry) return null
    entries.delete(key)
    entries.set(key, entry)
    return {
      messages: [...entry.messages],
      prevBatch: entry.prevBatch,
      cachedAt: entry.cachedAt,
    }
  }

  function append(roomId, incoming = []) {
    const key = roomKey(roomId)
    const entry = entries.get(key)
    if (!key || !entry) return null
    return set(key, {
      messages: mergeMessagesByEvent(entry.messages, incoming),
      prevBatch: entry.prevBatch,
    })
  }

  function update(roomId, updater) {
    const key = roomKey(roomId)
    const entry = entries.get(key)
    if (!key || !entry || typeof updater !== 'function') return null
    return set(key, {
      messages: updater([...entry.messages]),
      prevBatch: entry.prevBatch,
    })
  }

  function invalidate(roomId) {
    entries.delete(roomKey(roomId))
  }

  return {
    get,
    set,
    append,
    update,
    invalidate,
    clear: () => entries.clear(),
    size: () => entries.size,
  }
}
