<template>
  <div class="messages-wrapper">
    <div class="messages" ref="containerRef" @scroll="onScroll">

      <!-- Chat empty state -->
      <div v-if="store.messages.length === 0 && store.attachments.length === 0 && store.mode === 'chat'"
        class="empty-state">
        <div class="empty-state-icon">🔭</div>
        <h3>{{ greeting }}</h3>
        <p>Ask me anything — I'm here to help</p>
      </div>

      <!-- DB empty state with quick prompts -->
      <div v-if="store.messages.length === 0 && store.attachments.length === 0 && store.mode === 'db'"
        class="empty-state">
        <div class="empty-state-icon">🔭</div>
        <h3>Navigate your knowledge</h3>
        <p>Chat, query your data, or upload documents</p>
        <div class="quick-actions">
          <button v-for="prompt in quickPrompts" :key="prompt.text"
            class="quick-action" @click="emit('usePrompt', prompt)">
            <span class="qa-icon">{{ prompt.icon }}</span>
            <span class="qa-text">{{ prompt.text }}</span>
          </button>
        </div>
      </div>

      <!-- Messages -->
      <MessageBubble v-for="(msg, i) in store.messages" :key="i" :msg="msg" />

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
import { ref } from 'vue'
import { store, greeting } from '../../stores/app'
import MessageBubble from './MessageBubble.vue'
import ChartContainer from '../chart/ChartContainer.vue'
import TypingIndicator from './TypingIndicator.vue'
import RegenButton from './RegenButton.vue'

const emit = defineEmits(['usePrompt', 'regenerate'])
const containerRef = ref(null)
const showScrollBtn = ref(false)
let userScrolledUp = false

const quickPrompts = [
  { icon: '📊', text: 'How many pending purchase orders are there?', mode: 'db' },
  { icon: '💰', text: 'Show all unpaid bills this month', mode: 'db' },
  { icon: '📈', text: 'What is the total revenue from processed payments?', mode: 'db' },
  { icon: '🧾', text: 'How many cancelled invoices are there?', mode: 'db' },
]

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
</script>