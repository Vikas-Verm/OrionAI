<template>
    <div class="main-header">
      <h2>
        {{ store.mode === 'rag' ? '📄 Document Chat'
         : store.mode === 'db'  ? '🗄️ Data Intelligence'
         : '&nbsp;' }}
      </h2>
      <div style="display:flex; gap:8px; align-items:center">
        <button v-if="store.canvasCode" @click="store.showCanvas = !store.showCanvas" class="canvas-toggle-btn">
          {{ store.showCanvas ? '← Close Preview' : '⬡ Open Preview' }}
        </button>
        <button v-if="store.messages.length > 0" @click="emit('exportPDF')" class="export-btn">
          ⬇ Export PDF
        </button>
      </div>
    </div>
  </template>
  
  <script setup>
  import { store } from '../../stores/app'
  const emit = defineEmits(['exportPDF', 'openModule'])
  </script>