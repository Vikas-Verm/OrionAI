<template>
    <div v-if="calendarSteps.length">
  
      <div
        v-for="event in events"
        :key="event.id"
        class="calendar-card"
      >
        <strong>{{ event.title }}</strong>
        <div>{{ event.time }}</div>
      </div>
  
    </div>
  </template>
  
  <script setup>
  import { computed } from 'vue'
  
  const props = defineProps({
    steps: Array
  })
  
  const calendarSteps = computed(() =>
    props.steps.filter(s =>
      s.tool.startsWith('calendar_')
    )
  )
  
  const events = computed(() =>
    calendarSteps.value.flatMap(
      s => s.result?.events || []
    )
  )
  </script>