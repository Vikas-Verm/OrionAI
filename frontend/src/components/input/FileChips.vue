<template>
  <div v-if="store.attachments.length > 0" class="chips-row">
    <div v-for="(file, i) in store.attachments" :key="file.id"
      class="attachment-chip"
      :class="{ 'chip-loading': file.status === 'uploading' }">
      <span class="chip-icon">
        {{ file.status === 'uploading' ? '⏳'
         : file.type === 'pdf'   ? '📄'
         : file.type === 'image' ? '🖼️'
         : file.type === 'db'    ? '🗄️' : '📊' }}
      </span>
      <span class="chip-name">{{ file.name }}</span>
      <span v-if="file.status === 'uploading'" class="chip-status">Processing...</span>
      <span v-else-if="file.totalChunks" class="chip-chunks">{{ file.totalChunks }}</span>
      <button v-if="file.status !== 'uploading'" class="chip-remove"
        @click="emit('remove', i)">✕</button>
    </div>
  </div>
</template>

<script setup>
import { store } from '../../stores/app'
const emit = defineEmits(['remove'])
</script>