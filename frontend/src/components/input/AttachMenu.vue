<template>
    <div class="attach-wrapper">
      <button class="attach-btn" @click.stop="showMenu = !showMenu">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
  
      <div v-if="showMenu" class="attach-menu" @click.stop>
        <div class="attach-section-label">Ask with</div>
        <button class="attach-option" :class="{ active: store.mode === 'chat' && !store.webMode }" @click="setComposerMode('chat')">
          <span class="option-icon">💬</span>
          <div class="option-text">
            <span class="option-title">Chat</span>
            <span class="option-hint">Standard OrionAI conversation</span>
          </div>
        </button>
        <button class="attach-option" :class="{ active: store.webMode }" @click="setComposerMode('web')">
          <span class="option-icon">🌐</span>
          <div class="option-text">
            <span class="option-title">Web</span>
            <span class="option-hint">Search the web before answering</span>
          </div>
        </button>
        <button
          class="attach-option attach-option--data"
          :class="{ active: store.mode === 'db' && !store.webMode, disabled: !databaseConnected }"
          :title="databaseConnected ? '' : 'Connect Database first'"
          @click="setComposerMode('db')">
          <span class="option-icon">🗄️</span>
          <div class="option-text">
            <span class="option-title">Data</span>
            <span class="option-hint">
              {{ databaseConnected ? 'Query your connected database' : 'Connect Database first' }}
            </span>
          </div>
          <span v-if="!databaseConnected" class="attach-option-tooltip">Connect Database first</span>
        </button>
        <button class="attach-option" :class="{ active: store.mode === 'agent' && !store.webMode }" @click="setComposerMode('agent')">
          <span class="option-icon">🤖</span>
          <div class="option-text">
            <span class="option-title">Agent</span>
            <span class="option-hint">Run actions across connected apps</span>
          </div>
        </button>
        <button class="attach-option" @click="trigger('pdf')">
          <span class="option-icon">📄</span>
          <div class="option-text">
            <span class="option-title">Upload PDF</span>
            <span class="option-hint">Ask questions about documents</span>
          </div>
        </button>
        <button class="attach-option" @click="trigger('image')">
          <span class="option-icon">🖼️</span>
          <div class="option-text">
            <span class="option-title">Upload Image</span>
            <span class="option-hint">Analyze photos and diagrams</span>
          </div>
        </button>
        <button class="attach-option" @click="trigger('csv')">
          <span class="option-icon">📊</span>
          <div class="option-text">
            <span class="option-title">Upload CSV</span>
            <span class="option-hint">Query your spreadsheet data</span>
          </div>
        </button>
        <div class="attach-divider"></div>
        <button class="attach-option" @click="emit('connectDB'); showMenu = false">
          <span class="option-icon">🗄️</span>
          <div class="option-text">
            <span class="option-title">Connect Database</span>
            <span class="option-hint">Query PostgreSQL, MySQL, MongoDB, or SQLite</span>
          </div>
        </button>
      </div>
  
      <!-- Hidden file inputs -->
      <input type="file" accept=".pdf"    ref="pdfRef"   @change="onFile($event, 'pdf')"   class="file-input-hidden"/>
      <input type="file" accept="image/*" ref="imageRef" @change="onFile($event, 'image')" class="file-input-hidden"/>
      <input type="file" accept=".csv"    ref="csvRef"   @change="onFile($event, 'csv')"   class="file-input-hidden"/>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted, onUnmounted, watch } from 'vue'
  import { store, setMode } from '../../stores/app'
  import api from '../../services/api'
  
  const emit = defineEmits(['upload', 'connectDB'])
  const showMenu = ref(false)
  const databaseConnected = ref(false)
  const pdfRef   = ref(null)
  const imageRef = ref(null)
  const csvRef   = ref(null)
  
  function trigger(type) {
    showMenu.value = false
    if (type === 'pdf')   pdfRef.value.click()
    if (type === 'image') imageRef.value.click()
    if (type === 'csv')   csvRef.value.click()
  }
  
  function onFile(e, type) {
    const file = e.target.files[0]
    if (file) emit('upload', { file, type })
    e.target.value = ''
  }

  function setComposerMode(mode) {
    if (mode === 'db' && !databaseConnected.value) return
    showMenu.value = false
    if (mode === 'web') {
      store.mode = 'chat'
      store.webMode = true
      return
    }
    store.webMode = false
    setMode(mode)
  }

  async function loadIntegrationState() {
    try {
      const { data } = await api.get('/api/integrations')
      databaseConnected.value = Array.isArray(data)
        ? data.some((integration) => integration.type === 'database' && integration.enabled !== false)
        : false
    } catch {
      databaseConnected.value = false
    }
  }

  function handleIntegrationsUpdated() {
    loadIntegrationState()
  }

  onMounted(() => {
    loadIntegrationState()
    window.addEventListener('orion:integrations-updated', handleIntegrationsUpdated)
  })

  onUnmounted(() => {
    window.removeEventListener('orion:integrations-updated', handleIntegrationsUpdated)
  })

  watch(
    () => store.user?.username,
    () => {
      loadIntegrationState()
    }
  )
  
  function closeMenu() { showMenu.value = false }
  defineExpose({ closeMenu })
  </script>
