<template>
    <div class="attach-wrapper">
      <button class="attach-btn" @click.stop="showMenu = !showMenu">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
  
      <div v-if="showMenu" class="attach-menu" @click.stop>
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
            <span class="option-hint">Query your MongoDB collections</span>
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
  import { ref } from 'vue'
  
  const emit = defineEmits(['upload', 'connectDB'])
  const showMenu = ref(false)
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
  
  function closeMenu() { showMenu.value = false }
  defineExpose({ closeMenu })
  </script>