<template>
  <div class="input-area">
    <FileChips @remove="emit('removeFile', $event)" />

    <div class="input-box" :class="{ 'web-active-box': store.webMode }">
      <AttachMenu ref="attachMenuRef"
        @upload="emit('upload', $event)"
        @connectDB="emit('connectDB')" />

      <!-- Voice button -->
      <button class="voice-btn" :class="{ recording: isRecording }" @click="toggleVoice">
        <svg v-if="!isRecording" width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
        </svg>
        <span v-else class="recording-dot"></span>
      </button>

      <!-- Web search indicator -->
      <div v-if="store.webMode" class="web-indicator">
        <span class="web-dot"></span>
        Web search on
      </div>

      <textarea
        v-model="input"
        ref="textareaRef"
        @keydown.enter.exact.prevent="onSend"
        @keydown.shift.enter.prevent="input += '\n'"
        :placeholder="inputPlaceholder"
        :disabled="store.loading"
        rows="1"
        @input="autoResize"
      />

      <button v-if="store.loading" @click="emit('stop')" class="stop-btn" title="Stop generating">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      </button>
      <button v-else @click="onSend" :disabled="!input.trim()" class="send-btn">➤</button>
    </div>

    <div class="input-mode-row" aria-label="Composer modes">
      <button
        type="button"
        class="input-mode-toggle"
        :class="{ active: store.mode === 'agent' && !store.webMode }"
        @click="toggleAgentMode"
      >
        Agent
      </button>
      <button
        type="button"
        class="input-mode-toggle"
        :class="{ active: store.webMode }"
        @click="toggleWebSearch"
      >
        Web
      </button>
    </div>

    <p class="input-hint">Enter to send · Shift+Enter for new line</p>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'  // ← added nextTick
import { store, inputPlaceholder, setMode } from '../../stores/app'
import { useVoice } from '../../composables/useVoice'
import FileChips from './FileChips.vue'
import AttachMenu from './AttachMenu.vue'

const emit = defineEmits(['send', 'stop', 'upload', 'removeFile', 'connectDB'])

const input         = ref('')
const textareaRef   = ref(null)
const attachMenuRef = ref(null)

const { isRecording, toggleVoice } = useVoice((transcript) => {
  input.value = transcript
  autoResize()
})

function onSend() {
  if (!input.value.trim() || store.loading) return
  emit('send', input.value)
  input.value = ''
  if (textareaRef.value) textareaRef.value.style.height = 'auto'
}

function autoResize() {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
    textareaRef.value.style.height = Math.min(textareaRef.value.scrollHeight, 200) + 'px'
  }
}

function toggleAgentMode() {
  if (store.mode === 'agent' && !store.webMode) {
    setMode('chat')
    store.webMode = false
    return
  }

  setMode('agent')
  store.webMode = false
}

function toggleWebSearch() {
  store.webMode = !store.webMode
  store.mode = 'chat'
}

function closeMenus() { attachMenuRef.value?.closeMenu() }
function focusInput()  { textareaRef.value?.focus() }

function primeComposer(text, mode = store.mode, sendNow = false) {
  setMode(mode)
  store.webMode = false
  input.value = text
  nextTick(() => {
    autoResize()
    if (sendNow) onSend()
    else textareaRef.value?.focus()
  })
}

// ── Called by OnboardingFlow when user picks a demo command ─────────────────
// Switches to agent mode, fills input, and sends — all in one call
function setTextAndSend(text, mode = 'agent') {
  primeComposer(text, mode, true)
}

// ── setText without sending — just pre-fills the input ─────────────────────
function setText(text, mode = 'agent') {
  primeComposer(text, mode, false)
}

defineExpose({ closeMenus, focusInput, setTextAndSend, setText, prefill: primeComposer })
</script>
