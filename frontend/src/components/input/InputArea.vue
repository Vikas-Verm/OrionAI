<template>
  <div class="input-area">
    <FileChips @remove="emit('removeFile', $event)" />

    <!-- Mode toggle — moved here from sidebar -->
    <div class="mode-bar">
      <button
        :class="['mode-pill', store.mode === 'chat' && !store.webMode ? 'active' : '']"
        @click="setMode('chat'); store.webMode = false">
        <span class="mode-pill-icon">💬</span> Chat
      </button>
      <button
        :class="['mode-pill', store.webMode ? 'active web' : '']"
        @click="toggleWebMode">
        <span class="mode-pill-icon">🌐</span> Web
      </button>
      <button
        :class="['mode-pill', store.mode === 'db' && !store.webMode ? 'active' : '']"
        @click="setMode('db'); store.webMode = false">
        <span class="mode-pill-icon">🗄️</span> Data
      </button>
      <button
        :class="['mode-pill', store.mode === 'agent' && !store.webMode ? 'active agent' : '']"
        @click="setMode('agent'); store.webMode = false">
        <span class="mode-pill-icon">🤖</span> Agent
      </button>
    </div>

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

      <button @click="onSend" :disabled="store.loading || !input.trim()" class="send-btn">➤</button>
    </div>

    <p class="input-hint">Enter to send · Shift+Enter for new line</p>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'  // ← added nextTick
import { store, inputPlaceholder, setMode, toggleWebMode } from '../../stores/app'
import { useVoice } from '../../composables/useVoice'
import FileChips from './FileChips.vue'
import AttachMenu from './AttachMenu.vue'

const emit = defineEmits(['send', 'upload', 'removeFile', 'connectDB'])

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

function closeMenus() { attachMenuRef.value?.closeMenu() }
function focusInput()  { textareaRef.value?.focus() }

// ── Called by OnboardingFlow when user picks a demo command ─────────────────
// Switches to agent mode, fills input, and sends — all in one call
function setTextAndSend(text) {
  setMode('agent')               // ← switch to agent mode first
  store.webMode = false
  input.value = text             // ← fill the textarea
  nextTick(() => {
    autoResize()                 // ← resize textarea to fit text
    onSend()                     // ← send it
  })
}

// ── setText without sending — just pre-fills the input ─────────────────────
function setText(text) {
  setMode('agent')
  store.webMode = false
  input.value = text
  nextTick(() => {
    autoResize()
    textareaRef.value?.focus()
  })
}

defineExpose({ closeMenus, focusInput, setTextAndSend, setText })
</script>