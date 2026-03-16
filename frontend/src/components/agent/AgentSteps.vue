<template>
    <div v-if="steps.length" class="agent-steps">
      <div
        v-for="(step, i) in steps"
        :key="i"
        :ref="setStepRef(i)"
        class="agent-step"
        :class="step.status"
      >
        <div class="step-icon-wrap">
          <span v-if="step.status === 'running'" class="step-spinner"></span>
          <span v-else-if="step.status === 'done'" class="step-done">✓</span>
          <span v-else-if="step.status === 'error'" class="step-error">✕</span>
          <span v-else class="step-dot"></span>
        </div>
  
        <div class="step-body">
          <div class="step-title">
            {{ step.label || step.tool }}
          </div>
  
          <div v-if="step.status === 'running'" class="step-sub">
            Working…
          </div>
  
          <div v-else-if="step.summary" class="step-sub">
            {{ step.summary }}
          </div>
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { watch, nextTick, ref } from 'vue'
  
  const props = defineProps({
    steps: {
      type: Array,
      default: () => []
    }
  })
  
  /* ---------------------------
     Step element references
  ---------------------------- */
  
  const stepRefs = ref([])
  
  function setStepRef(index) {
    return el => {
      stepRefs.value[index] = el
    }
  }
  
  /* ---------------------------
     Auto-scroll to running step
  ---------------------------- */
  
  watch(
    () => props.steps.map(s => s.status),
    async () => {
      if (!props.steps.length) return
  
      await nextTick()
  
      const runningIndex = props.steps.findIndex(
        step => step.status === 'running'
      )
  
      if (runningIndex !== -1) {
        const el = stepRefs.value[runningIndex]
  
        el?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })
      }
    }
  )
  </script>
  
  <style scoped>
  .agent-steps {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  
  /* Step container */
  
  .agent-step {
    display: flex;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    align-items: flex-start;
    background: rgba(255,255,255,0.04);
  }
  
  /* Running animation */
  
  .agent-step.running {
    background: rgba(59,130,246,0.08);
    border-left: 3px solid #3b82f6;
    animation: pulseAgent 1.6s infinite;
  }
  
  @keyframes pulseAgent {
    0% { opacity: .85; }
    50% { opacity: 1; }
    100% { opacity: .85; }
  }
  
  /* Completion animation */
  
  .agent-step.done {
    animation: stepDone .4s ease;
  }
  
  @keyframes stepDone {
    from {
      transform: scale(.97);
      background: rgba(34,197,94,.15);
    }
    to {
      transform: scale(1);
    }
  }
  
  /* Icon area */
  
  .step-icon-wrap {
    width: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .step-dot {
    width: 6px;
    height: 6px;
    background: #aaa;
    border-radius: 50%;
  }
  
  /* Spinner */
  
  .step-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #ccc;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin .8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* Icons */
  
  .step-done {
    color: #22c55e;
  }
  
  .step-error {
    color: #ef4444;
  }
  
  /* Text */
  
  .step-body {
    display: flex;
    flex-direction: column;
  }
  
  .step-title {
    font-size: 13px;
    font-weight: 500;
  }
  
  .step-sub {
    font-size: 12px;
    opacity: .7;
  }
  </style>