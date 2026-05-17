<template>
    <div class="attach-wrapper">
      <button class="attach-btn" @click.stop="showMenu = !showMenu">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
  
      <div v-if="showMenu" class="attach-menu" @click.stop>
        <button class="attach-option" @click="triggerFilePicker">
          <span class="option-icon">📎</span>
          <div class="option-text">
            <span class="option-title">Add photo/files</span>
            <span class="option-hint">PDF, images, CSV, DOCX, XLSX, and more</span>
          </div>
        </button>
      </div>
  
      <input
        type="file"
        :accept="acceptedFileTypes"
        ref="fileRef"
        @change="onFile"
        class="file-input-hidden"
      />
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue'
  
  const emit = defineEmits(['upload', 'connectDB'])
  const showMenu = ref(false)
  const fileRef = ref(null)
  const acceptedFileTypes = [
    '.pdf',
    'image/*',
    '.csv',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.txt',
    '.rtf',
    '.md',
    '.json',
    '.ppt',
    '.pptx',
    '.zip',
    'application/pdf',
    'text/csv',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ].join(',')
  
  function triggerFilePicker() {
    showMenu.value = false
    fileRef.value?.click()
  }
  
  function inferFileType(file) {
    const name = file?.name?.toLowerCase() || ''
    if (file?.type?.startsWith('image/')) return 'image'
    if (name.endsWith('.pdf') || file?.type === 'application/pdf') return 'pdf'
    if (name.endsWith('.csv') || file?.type === 'text/csv') return 'csv'
    if (name.endsWith('.xls') || name.endsWith('.xlsx')) return 'xlsx'
    if (name.endsWith('.doc') || name.endsWith('.docx')) return 'docx'
    return 'file'
  }

  function onFile(e) {
    const file = e.target.files[0]
    if (file) emit('upload', { file, type: inferFileType(file) })
    e.target.value = ''
  }
  
  function closeMenu() { showMenu.value = false }
  defineExpose({ closeMenu })
  </script>
