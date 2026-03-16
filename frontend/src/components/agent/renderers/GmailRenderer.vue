<template>
    <div v-if="emailSteps.length" class="email-wrapper">
  
      <div
        v-for="(step, index) in emailSteps"
        :key="index"
        class="email-section"
      >
        <div
          v-for="email in step.result?.emails || []"
          :key="email.id"
          class="email-card"
        >
          <div class="email-header">
            <strong>{{ email.subject }}</strong>
          </div>
  
          <div class="email-meta">
            From: {{ email.from }}
          </div>
  
          <div class="email-body">
            {{ email.snippet }}
          </div>
  
          <button
            class="reply-btn"
            @click="$emit('reply', email)"
          >
            Reply
          </button>
  
        </div>
      </div>
  
    </div>
  </template>
  
  <script setup>
  import { computed } from 'vue'
  
  const props = defineProps({
    steps: Array,
    msg: Object
  })
  
  const emailSteps = computed(() =>
    props.steps.filter(s =>
      s.tool.startsWith('gmail_')
    )
  )
  </script>