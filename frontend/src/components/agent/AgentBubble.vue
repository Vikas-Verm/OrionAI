<template>
  <div class="agent-bubble">

    <!-- Agent Header -->
    <div v-if="steps.length" class="agent-header">
      🤖 Project Agent
      <span class="agent-meta">
        {{ completedCount }}/{{ steps.length }} completed
      </span>
    </div>

    <!-- Agent Execution Timeline -->
    <AgentSteps :steps="steps" />

    <!-- Tool Renderer -->
    <transition name="fade">
      <component
        v-if="Renderer && msg.agentDone"
        :is="Renderer"
        :steps="steps"
        :msg="msg"
        @reply="emitReply"
      />
    </transition>

    <!-- Fallback normal message -->
    <div v-if="!Renderer || !msg.agentDone">
      <div v-if="msg.content" class="agent-text">
        {{ msg.content }}
      </div>
    </div>

  </div>
</template>

<script setup>
import { computed } from 'vue'
import AgentSteps from './AgentSteps.vue'
import { resolveRenderer } from './rendererRegistry'

const props = defineProps({
  msg: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['reply'])

/* ---------------------------
   Agent Steps
---------------------------- */

const steps = computed(() => {
  return props.msg?.steps ?? []
})

/* ---------------------------
   Completed Counter
---------------------------- */

const completedCount = computed(() => {
  return steps.value.filter(s => s.status === 'done').length
})

/* ---------------------------
   Renderer Resolver
---------------------------- */

const Renderer = computed(() => {
  return resolveRenderer(steps.value)
})

/* ---------------------------
   Emit Reply
---------------------------- */

function emitReply(payload) {
  emit('reply', payload)
}
</script>

<style scoped>
.agent-header {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
  opacity: .85;
}

.agent-meta {
  font-size: 12px;
  opacity: .7;
}

.agent-text {
  margin-top: 6px;
}

.fade-enter-active {
  transition: opacity .35s ease;
}

.fade-enter-from {
  opacity: 0;
}
</style>