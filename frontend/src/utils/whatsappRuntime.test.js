import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createConversationHistoryCache,
  mergeConversationLists,
  mergeConversationMetadata,
  mergeMessagesByEvent,
} from './whatsappRuntime.js'

test('contact name is not overwritten by later identifier fallback', () => {
  const result = mergeConversationMetadata(
    { title: 'Vikas Verma', displayNameSource: 'contact_name' },
    { title: '+91 90000 00000', displayNameSource: 'phone_fallback' }
  )
  assert.equal(result.title, 'Vikas Verma')
  assert.equal(result.displayNameRank, 100)
})

test('chat list sorts by latest activity and retains only current verified rooms', () => {
  const result = mergeConversationLists(
    [{ roomId: '!old', title: 'Old', lastMessageAt: '2026-01-01T00:00:00Z' }],
    [
      { roomId: '!one', title: 'One', lastMessageAt: '2026-01-02T00:00:00Z' },
      { roomId: '!two', title: 'Two', lastMessageAt: '2026-01-03T00:00:00Z' },
    ]
  )
  assert.deepEqual(result.map((chat) => chat.roomId), ['!two', '!one'])
})

test('event-id merge deduplicates optimistic and realtime copies', () => {
  const result = mergeMessagesByEvent(
    [{ id: '$event', text: 'test', direction: 'outbound' }],
    [{ eventId: '$event', text: 'test', deliveryState: 'sent' }]
  )
  assert.equal(result.length, 1)
  assert.equal(result[0].deliveryState, 'sent')
})

test('canonical avatar merge rejects a stale backend avatar without flicker', () => {
  const current = {
    roomId: '!room',
    avatarUrl: '/api/whatsapp/media?mxc=current',
    avatarMxc: 'mxc://orion.local/current',
    avatarSource: 'ghost',
    avatarState: 'available',
  }
  const lowerQuality = mergeConversationMetadata(current, {
    roomId: '!room',
    avatarUrl: '/api/whatsapp/media?mxc=legacy',
    avatarMxc: 'mxc://orion.local/legacy',
    avatarSource: 'legacy',
    avatarState: 'unknown',
  })
  assert.equal(lowerQuality.avatarMxc, 'mxc://orion.local/current')

  const transientFailure = mergeConversationMetadata(lowerQuality, {
    roomId: '!room',
    avatarUrl: '',
    avatarMxc: '',
    avatarSource: 'none',
    avatarState: 'broken',
  })
  assert.equal(transientFailure.avatarMxc, 'mxc://orion.local/current')

  const removed = mergeConversationMetadata(transientFailure, {
    roomId: '!room',
    avatarUrl: '',
    avatarMxc: '',
    avatarSource: 'none',
    avatarState: 'broken',
    authoritativeAvatarRemoval: true,
  })
  assert.equal(removed.avatarMxc, '')
  assert.equal(removed.avatarUrl, '')
})

test('history cache makes a recent room immediately reusable without persistence', () => {
  let now = 1000
  const cache = createConversationHistoryCache({
    maxEntries: 2,
    maxAgeMs: 5000,
    now: () => now,
  })
  cache.set('!a', {
    messages: [{ id: '$one', timestamp: 1, text: 'transient' }],
    prevBatch: 'page-a',
  })
  cache.set('!b', {
    messages: [{ id: '$two', timestamp: 2 }],
    prevBatch: null,
  })

  const restored = cache.get('!a')
  assert.equal(restored.messages.length, 1)
  assert.equal(restored.prevBatch, 'page-a')
  assert.equal(cache.size(), 2)

  now = 7001
  assert.equal(cache.get('!a'), null)
  assert.equal(cache.size(), 0)
})

test('history cache appends realtime events by event id without duplicates', () => {
  const cache = createConversationHistoryCache()
  cache.set('!room', {
    messages: [{ id: '$event', timestamp: 1, deliveryState: 'pending' }],
    prevBatch: 'older',
  })
  cache.append('!room', [
    { eventId: '$event', timestamp: 1, deliveryState: 'sent' },
    { id: '$new', timestamp: 2 },
  ])

  const restored = cache.get('!room')
  assert.equal(restored.messages.length, 2)
  assert.equal(restored.messages[0].deliveryState, 'sent')
  assert.equal(restored.prevBatch, 'older')
})
