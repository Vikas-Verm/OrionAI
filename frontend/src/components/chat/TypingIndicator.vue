<template>
    <div v-if="store.loading" class="message-row ai-row">
      <div class="avatar">🔭</div>
      <div class="bubble ai-bubble">
        <span class="typing-dots">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </div>
    </div>
  </template>
  
  <script setup>
  import { store } from '../../stores/app'
  </script>