<template>
  <div class="sync-shell">
    <div class="sync-glow sync-glow--cyan" aria-hidden="true"></div>
    <div class="sync-glow sync-glow--violet" aria-hidden="true"></div>
    <div class="sync-grid" aria-hidden="true"></div>

    <section class="sync-card">
      <div class="sync-brand">
        <div class="sync-logo" aria-hidden="true">🔭</div>
        <span class="sync-badge">OrionAI onboarding</span>
      </div>

      <header class="sync-header">
        <h1>Setting up your OrionAI</h1>
        <p>
          Finding important messages, reminders, documents, and follow-ups.
        </p>
      </header>

      <div class="sync-progress">
        <article
          v-for="(step, index) in steps"
          :key="step.id"
          class="sync-step"
          :class="{
            'sync-step--active': index === activeStepIndex,
            'sync-step--complete': step.state === 'complete',
          }"
        >
          <div class="sync-step__marker">
            <span v-if="step.state === 'complete'">✓</span>
            <span v-else-if="index === activeStepIndex" class="sync-step__pulse"></span>
            <span v-else>{{ index + 1 }}</span>
          </div>

          <div class="sync-step__copy">
            <h2>{{ step.label }}</h2>
            <p>{{ step.description }}</p>
          </div>
        </article>
      </div>

      <div class="sync-status">
        <span class="sync-status__spinner" v-if="isRunning"></span>
        <span>{{ statusMessage }}</span>
      </div>

      <div v-if="connectedCount > 0" class="sync-meta">
        Preparing a first workspace view from {{ connectedCount }} connected
        app{{ connectedCount === 1 ? '' : 's' }}.
      </div>

      <div v-if="errorMessage" class="sync-error">
        <p>{{ errorMessage }}</p>
        <button type="button" class="sync-retry" @click="runSetup">
          Try again
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import api, { onboardingAPI } from '../../services/api'
import { setUser } from '../../stores/app'

const emit = defineEmits(['complete'])

const steps = ref([
  {
    id: 'connected-apps',
    label: 'Checking connected apps',
    description: 'Confirming which data sources OrionAI can safely read first.',
    state: 'active',
  },
  {
    id: 'safe-data',
    label: 'Reading latest safe data',
    description: 'Loading recent, permission-safe signals from your connected tools.',
    state: 'pending',
  },
  {
    id: 'briefing',
    label: 'Preparing first briefing',
    description: 'Assembling an initial workspace overview before you enter OrionAI.',
    state: 'pending',
  },
])

const activeStepIndex = ref(0)
const connectedCount = ref(0)
const statusMessage = ref('Checking your connected apps...')
const errorMessage = ref('')
const isRunning = ref(false)

let cancelled = false

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function setActiveStep(index, message) {
  activeStepIndex.value = index
  steps.value = steps.value.map((step, stepIndex) => ({
    ...step,
    state:
      stepIndex < index
        ? 'complete'
        : stepIndex === index
          ? 'active'
          : 'pending',
  }))
  if (message) statusMessage.value = message
}

function markAllComplete(message) {
  steps.value = steps.value.map((step) => ({ ...step, state: 'complete' }))
  activeStepIndex.value = steps.value.length - 1
  if (message) statusMessage.value = message
}

async function runSetup() {
  if (isRunning.value) return

  isRunning.value = true
  errorMessage.value = ''
  setActiveStep(0, 'Checking your connected apps...')

  try {
    const { data: onboardingStatus } = await onboardingAPI.status()
    if (cancelled) return

    if (onboardingStatus?.user) {
      setUser(onboardingStatus.user)
    }
    connectedCount.value = Number(onboardingStatus?.connectedCount || 0)

    await wait(450)
    if (cancelled) return

    setActiveStep(1, 'Reading latest safe data...')
    await Promise.allSettled([
      api.get('/api/briefing/home'),
      api.get('/api/briefing/morning'),
    ])

    await wait(500)
    if (cancelled) return

    setActiveStep(2, 'Preparing your first workspace briefing...')
    await wait(650)
    if (cancelled) return

    const { data } = await onboardingAPI.update({
      hasCompletedAppConnection: true,
      hasCompletedFirstSync: true,
    })
    if (cancelled) return

    if (data?.user) {
      setUser(data.user)
    }

    markAllComplete('Your OrionAI workspace is ready.')
    isRunning.value = false

    await wait(360)
    if (!cancelled) {
      emit('complete', data)
    }
  } catch (error) {
    isRunning.value = false
    errorMessage.value =
      error?.response?.data?.error || 'We could not finish setup right now.'
    statusMessage.value = 'Setup paused. Retry to continue.'
  }
}

onMounted(() => {
  void runSetup()
})

onUnmounted(() => {
  cancelled = true
})
</script>

<style scoped>
.sync-shell {
  position: relative;
  min-height: 100vh;
  min-height: 100svh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at top, rgba(82, 212, 255, 0.14), transparent 34%),
    linear-gradient(180deg, #040713 0%, #050816 48%, #070d1c 100%);
}

.sync-glow,
.sync-grid {
  position: absolute;
  pointer-events: none;
}

.sync-glow {
  width: 40rem;
  height: 40rem;
  border-radius: 999px;
  filter: blur(96px);
  opacity: 0.28;
}

.sync-glow--cyan {
  top: -12rem;
  right: 12%;
  background: radial-gradient(circle, rgba(82, 212, 255, 0.24) 0%, rgba(82, 212, 255, 0.08) 38%, transparent 72%);
}

.sync-glow--violet {
  bottom: -14rem;
  left: 14%;
  background: radial-gradient(circle, rgba(139, 125, 255, 0.24) 0%, rgba(139, 125, 255, 0.08) 36%, transparent 72%);
}

.sync-grid {
  display: none;
}

.sync-card {
  position: relative;
  z-index: 1;
  width: min(720px, 100%);
  padding: clamp(28px, 4vw, 40px);
  border-radius: 32px;
  border: 1px solid rgba(134, 155, 212, 0.18);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
    rgba(9, 14, 30, 0.9);
  box-shadow: 0 36px 90px rgba(2, 6, 23, 0.4);
  backdrop-filter: blur(26px);
}

.sync-brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.sync-logo {
  width: 58px;
  height: 58px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  font-size: 28px;
  background:
    radial-gradient(circle at 42% 34%, rgba(210, 234, 255, 0.96), rgba(196, 201, 255, 0.78) 28%, rgba(111, 142, 255, 0.16) 32%, transparent 56%),
    linear-gradient(180deg, rgba(62, 129, 255, 0.22), rgba(85, 104, 255, 0.1)),
    rgba(24, 36, 72, 0.92);
  border: 1px solid rgba(93, 139, 255, 0.24);
}

.sync-badge {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(176, 201, 255, 0.16);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(222, 233, 255, 0.82);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sync-header {
  margin-top: 22px;
}

.sync-header h1 {
  margin: 0;
  color: #f8fbff;
  font-size: clamp(34px, 5vw, 52px);
  line-height: 0.98;
  letter-spacing: -0.04em;
}

.sync-header p {
  margin: 16px 0 0;
  color: rgba(209, 220, 242, 0.76);
  font-size: 16px;
  line-height: 1.7;
}

.sync-progress {
  margin-top: 28px;
  display: grid;
  gap: 14px;
}

.sync-step {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 18px 18px 16px;
  border-radius: 22px;
  border: 1px solid rgba(176, 201, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
}

.sync-step--active {
  border-color: rgba(102, 214, 255, 0.24);
  background: rgba(82, 212, 255, 0.08);
}

.sync-step--complete {
  border-color: rgba(130, 226, 176, 0.22);
  background: rgba(80, 172, 120, 0.08);
}

.sync-step__marker {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(176, 201, 255, 0.14);
  color: #eff6ff;
  font-size: 15px;
  font-weight: 700;
}

.sync-step--complete .sync-step__marker {
  color: #7ce1ac;
}

.sync-step__pulse {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: #8fe8ff;
  box-shadow: 0 0 0 0 rgba(143, 232, 255, 0.5);
  animation: sync-pulse 1.2s infinite;
}

.sync-step__copy h2 {
  margin: 0;
  color: #f7fbff;
  font-size: 18px;
}

.sync-step__copy p {
  margin: 8px 0 0;
  color: rgba(198, 209, 233, 0.72);
  font-size: 14px;
  line-height: 1.65;
}

.sync-status,
.sync-error {
  margin-top: 22px;
  padding: 18px 20px;
  border-radius: 20px;
  border: 1px solid rgba(176, 201, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(229, 237, 255, 0.82);
}

.sync-status {
  display: flex;
  align-items: center;
  gap: 14px;
}

.sync-status__spinner {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 2px solid rgba(176, 201, 255, 0.14);
  border-top-color: rgba(102, 214, 255, 0.92);
  animation: sync-spin 0.85s linear infinite;
}

.sync-meta {
  margin-top: 14px;
  color: rgba(189, 202, 229, 0.72);
  font-size: 13px;
}

.sync-error {
  border-color: rgba(255, 125, 143, 0.24);
  background: rgba(86, 16, 28, 0.28);
}

.sync-error p {
  margin: 0;
}

.sync-retry {
  margin-top: 14px;
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, #54d4ff, #7c88ff);
  color: #04101f;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

@keyframes sync-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes sync-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(143, 232, 255, 0.5);
  }
  100% {
    box-shadow: 0 0 0 14px rgba(143, 232, 255, 0);
  }
}

@media (max-width: 760px) {
  .sync-shell {
    padding: 18px 14px;
  }

  .sync-card {
    border-radius: 26px;
    padding: 22px 18px;
  }

  .sync-step {
    padding: 16px;
  }
}
</style>
