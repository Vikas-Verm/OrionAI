<template>
    <div v-if="store.mode === 'rag'" class="doc-panel">
      <div v-if="!store.documentIngested">
        <div class="ingest-tabs">
          <button :class="['tab-btn', ingestMode === 'paste' ? 'active' : '']"
            @click="ingestMode = 'paste'">📝 Paste Text</button>
          <button :class="['tab-btn', ingestMode === 'upload' ? 'active' : '']"
            @click="ingestMode = 'upload'">📄 Upload PDF</button>
        </div>
  
        <div v-if="ingestMode === 'paste'">
          <textarea v-model="documentText" placeholder="Paste your document text here..."
            rows="4" class="doc-input" />
          <button @click="ingestText" :disabled="!documentText.trim() || ingesting" class="ingest-btn">
            {{ ingesting ? 'Processing...' : '⚡ Ingest Text' }}
          </button>
        </div>
  
        <div v-if="ingestMode === 'upload'">
          <input type="file" accept=".pdf" ref="pdfInputRef" @change="onPdfSelect" class="file-input-hidden"/>
          <div class="drop-zone"
            @click="pdfInputRef.click()"
            @dragover.prevent @drop.prevent="onDrop"
            :class="{ dragging: isDragging }"
            @dragenter="isDragging = true" @dragleave="isDragging = false">
            <div v-if="!selectedPdf">
              <p class="drop-icon">📄</p>
              <p class="drop-text">Click to select PDF or drag & drop</p>
              <p class="drop-hint">Max 10MB</p>
            </div>
            <div v-else>
              <p class="drop-icon">✅</p>
              <p class="drop-text">{{ selectedPdf.name }}</p>
              <p class="drop-hint">{{ (selectedPdf.size / 1024).toFixed(0) }}KB</p>
            </div>
          </div>
          <button @click="ingestPDF" :disabled="!selectedPdf || ingesting" class="ingest-btn">
            {{ ingesting ? 'Processing PDF...' : '⚡ Ingest PDF' }}
          </button>
        </div>
      </div>
  
      <div v-else class="doc-status">
        ✅ <strong>{{ store.chunkCount }} chunks</strong> ready
        <span class="doc-name">{{ store.ingestedFileName }}</span>
        <button @click="clearDoc" class="clear-doc-btn">Change Document</button>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue'
  import { store } from '../../stores/app'
  import { ragAPI } from '../../services/api'
  
  const ingestMode  = ref('paste')
  const documentText = ref('')
  const selectedPdf  = ref(null)
  const ingesting    = ref(false)
  const isDragging   = ref(false)
  const pdfInputRef  = ref(null)
  
  async function ingestText() {
    ingesting.value = true
    try {
      const res = await ragAPI.ingestText(documentText.value, 'pasted-text.txt')
      store.chunkCount = res.data.chunks
      store.ingestedFileName = 'Pasted text'
      store.documentIngested = true
    } catch { alert('Failed to ingest document.') }
    finally { ingesting.value = false }
  }
  
  async function ingestPDF() {
    if (!selectedPdf.value) return
    ingesting.value = true
    try {
      const fd = new FormData()
      fd.append('pdf', selectedPdf.value)
      const res = await ragAPI.ingestPDF(fd)
      store.chunkCount = res.data.chunks
      store.ingestedFileName = res.data.filename
      store.documentIngested = true
    } catch (e) { alert(e.response?.data?.error || 'Failed to ingest PDF') }
    finally { ingesting.value = false }
  }
  
  function onPdfSelect(e) {
    const f = e.target.files[0]
    if (f?.type === 'application/pdf') selectedPdf.value = f
    else alert('Please select a PDF file')
  }
  
  function onDrop(e) {
    isDragging.value = false
    const f = e.dataTransfer.files[0]
    if (f?.type === 'application/pdf') selectedPdf.value = f
    else alert('Please drop a PDF file')
  }
  
  function clearDoc() {
    store.documentIngested = false
    store.chunkCount = 0
    store.ingestedFileName = ''
    store.mode = 'chat'
    selectedPdf.value = null
  }
  </script>