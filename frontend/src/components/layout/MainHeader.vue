<template>
  <div v-if="showActions" class="main-header-actions main-header-actions-floating">
    <button v-if="store.canvasCode" @click="store.showCanvas = !store.showCanvas" class="canvas-toggle-btn">
      {{ store.showCanvas ? '← Close Preview' : '⬡ Open Preview' }}
    </button>
    <button v-if="store.messages.length > 0" @click="emit('exportPDF')" class="export-btn">
      ⬇ Export PDF
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { store } from '../../stores/app'

const emit = defineEmits(['exportPDF', 'openModule'])

const showActions = computed(() =>
  Boolean(store.canvasCode) || store.messages.length > 0
)
</script>
