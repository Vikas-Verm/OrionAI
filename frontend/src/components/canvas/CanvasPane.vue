<template>
    <transition name="canvas-slide">
      <div v-if="store.showCanvas && store.canvasCode" class="canvas-pane">
        <div class="canvas-header">
          <span class="canvas-title">⬡ Live Preview</span>
          <div style="display:flex; gap:6px">
            <button class="canvas-action-btn" @click="refresh">↺ Refresh</button>
            <button class="canvas-action-btn" @click="copyCode">⎘ Copy</button>
            <button class="canvas-action-btn danger" @click="close">✕</button>
          </div>
        </div>
        <iframe ref="frameRef" class="canvas-frame"
          sandbox="allow-scripts allow-same-origin"
          :srcdoc="canvasHtml" />
      </div>
    </transition>
  </template>
  
  <script setup>
  import { ref, computed } from 'vue'
  import { store, resetCanvas } from '../../stores/app'
  
  const frameRef = ref(null)
  
  const canvasHtml = computed(() => {
    if (!store.canvasCode) return ''
    if (store.canvasLang === 'html') return store.canvasCode
    return `<!DOCTYPE html>
  <html>
  <head>
  <meta charset="UTF-8">
  <style>body { margin:16px; font-family:system-ui; background:#fff; color:#111; }</style>
  </head>
  <body>
  <script type="module">
  ${store.canvasCode}
  <\/script>
  </body>
  </html>`
  })
  
  function refresh() {
    if (frameRef.value) {
      frameRef.value.srcdoc = ''
      setTimeout(() => { frameRef.value.srcdoc = canvasHtml.value }, 50)
    }
  }
  
  function copyCode() {
    navigator.clipboard.writeText(store.canvasCode)
  }
  
  function close() {
    resetCanvas()
  }
  </script>