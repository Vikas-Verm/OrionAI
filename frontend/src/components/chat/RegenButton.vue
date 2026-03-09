<template>
    <div
      v-if="store.messages.length > 0
        && store.messages[store.messages.length - 1].role === 'assistant'
        && !store.loading"
      class="regen-row"
    >
      <button class="regen-btn" @click="emit('regenerate')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
        Regenerate
      </button>
    </div>
  </template>
  
  <script setup>
  import { store } from '../../stores/app'
  const emit = defineEmits(['regenerate'])
  </script>