<template>
    <div v-if="jiraSteps.length">
  
      <div
        v-for="step in jiraSteps"
        :key="step.tool"
        class="jira-section"
      >
        <div
          v-for="ticket in step.result?.tickets || []"
          :key="ticket.key"
          class="jira-card"
        >
          <strong>{{ ticket.key }}</strong>
          <p>{{ ticket.summary }}</p>
          <small>Status: {{ ticket.status }}</small>
        </div>
      </div>
  
    </div>
  </template>
  
  <script setup>
  import { computed } from 'vue'
  
  const props = defineProps({
    steps: Array
  })
  
  const jiraSteps = computed(() =>
    props.steps.filter(s =>
      s.tool.startsWith('jira_')
    )
  )
  </script>