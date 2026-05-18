<template>
  <div class="connect-shell">
    <div class="connect-glow connect-glow--cyan" aria-hidden="true"></div>
    <div class="connect-glow connect-glow--violet" aria-hidden="true"></div>
    <div class="connect-grid" aria-hidden="true"></div>

    <section class="connect-card">
      <div class="connect-brand">
        <div class="connect-logo" aria-hidden="true">🔭</div>
        <span class="connect-badge">OrionAI first-run setup</span>
      </div>

      <header class="connect-header">
        <div>
          <h1>Connect your apps</h1>
          <p>
            OrionAI works best when it can understand your messages, calendar,
            documents, and tasks.
          </p>
        </div>

        <div class="connect-summary">
          <strong>{{ connectedCount }}</strong>
          <span>app{{ connectedCount === 1 ? '' : 's' }} connected</span>
        </div>
      </header>

      <div v-if="errorMessage" class="connect-banner connect-banner--error">
        {{ errorMessage }}
      </div>

      <div v-else-if="loading" class="connect-loading">
        <span class="connect-loading__spinner"></span>
        <p>Loading your available app connections...</p>
      </div>

      <template v-else>
        <section class="connect-section">
          <div class="connect-section__head">
            <h2>Recommended first</h2>
            <p>Start with the apps OrionAI can learn from right away.</p>
          </div>

          <div class="connect-grid-cards">
            <article
              v-for="app in recommendedApps"
              :key="app.type"
              class="connect-app-card"
              :class="{
                'connect-app-card--connected': isConnected(app),
                'connect-app-card--soon': app.comingSoon,
              }"
            >
              <div class="connect-app-card__top">
                <div class="connect-app-icon" :class="{ 'connect-app-icon--glyph': !hasImageIcon(app) }">
                  <img
                    v-if="hasImageIcon(app)"
                    :src="iconUrlFor(app)"
                    :alt="app.name"
                    loading="lazy"
                    @error="onIconError(app.type)"
                  />
                  <span v-else>{{ fallbackIconFor(app) }}</span>
                </div>

                <span
                  class="connect-status"
                  :class="{
                    'connect-status--connected': isConnected(app),
                    'connect-status--soon': app.comingSoon,
                  }"
                >
                  {{ statusTextFor(app) }}
                </span>
              </div>

              <div class="connect-app-copy">
                <h3>{{ app.name }}</h3>
                <p>{{ app.description }}</p>
              </div>

              <button
                type="button"
                class="connect-app-action"
                :class="{ 'connect-app-action--connected': isConnected(app) }"
                :disabled="saving || app.comingSoon"
                @click="openConnector(app)"
              >
                {{ actionLabelFor(app) }}
              </button>
            </article>
          </div>
        </section>

        <section class="connect-section">
          <div class="connect-section__head">
            <h2>Optional apps</h2>
            <p>Add more context now, or come back to these later from Integrations.</p>
          </div>

          <div class="connect-grid-cards connect-grid-cards--compact">
            <article
              v-for="app in optionalApps"
              :key="app.type"
              class="connect-app-card connect-app-card--compact"
              :class="{
                'connect-app-card--connected': isConnected(app),
                'connect-app-card--soon': app.comingSoon,
              }"
            >
              <div class="connect-app-card__top">
                <div class="connect-app-icon" :class="{ 'connect-app-icon--glyph': !hasImageIcon(app) }">
                  <img
                    v-if="hasImageIcon(app)"
                    :src="iconUrlFor(app)"
                    :alt="app.name"
                    loading="lazy"
                    @error="onIconError(app.type)"
                  />
                  <span v-else>{{ fallbackIconFor(app) }}</span>
                </div>

                <span
                  class="connect-status"
                  :class="{
                    'connect-status--connected': isConnected(app),
                    'connect-status--soon': app.comingSoon,
                  }"
                >
                  {{ statusTextFor(app) }}
                </span>
              </div>

              <div class="connect-app-copy">
                <h3>{{ app.name }}</h3>
                <p>{{ app.description }}</p>
              </div>

              <button
                type="button"
                class="connect-app-action"
                :class="{ 'connect-app-action--connected': isConnected(app) }"
                :disabled="saving || app.comingSoon"
                @click="openConnector(app)"
              >
                {{ actionLabelFor(app) }}
              </button>
            </article>
          </div>
        </section>

        <footer class="connect-footer">
          <p class="connect-footnote">
            Continue unlocks first sync once at least one app is connected.
          </p>

          <div class="connect-footer__actions">
            <button
              type="button"
              class="connect-secondary"
              :disabled="saving"
              @click="skipForNow"
            >
              {{ saving && pendingAction === 'skip' ? 'Skipping...' : 'Skip for now' }}
            </button>
            <button
              type="button"
              class="connect-primary"
              :disabled="saving || !canContinue"
              @click="continueFlow"
            >
              {{ saving && pendingAction === 'continue' ? 'Continuing...' : 'Continue' }}
            </button>
          </div>
        </footer>
      </template>
    </section>

    <div
      v-if="connectorFocusType"
      class="connect-modal"
      role="dialog"
      aria-modal="true"
      @click.self="closeConnector"
    >
      <div class="connect-modal__shell">
        <button type="button" class="connect-modal__close" @click="closeConnector">
          Close
        </button>
        <IntegrationsPage
          :key="connectorFocusType"
          :focusType="connectorFocusType"
          @close="closeConnector"
          @connected="handleIntegrationSnapshot"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import api, { onboardingAPI } from '../../services/api'
import { setUser } from '../../stores/app'
import IntegrationsPage from '../integrations/IntegrationsPage.vue'
import { getAppFallbackEmoji, getAppIconUrl } from '../../utils/appIcons'

const emit = defineEmits(['complete'])

const APP_DEFINITIONS = Object.freeze([
  {
    type: 'gmail',
    name: 'Gmail',
    group: 'recommended',
    description: 'Read important email threads and draft safe replies with context.',
  },
  {
    type: 'google_calendar',
    name: 'Google Calendar',
    group: 'recommended',
    description: 'Track meetings, reminders, and scheduling conflicts automatically.',
  },
  {
    type: 'google_drive',
    name: 'Google Drive',
    group: 'recommended',
    description: 'Search your files and shared folders directly from OrionAI.',
    comingSoon: true,
    fallbackIcon: '🗂️',
  },
  {
    type: 'whatsapp',
    name: 'WhatsApp',
    group: 'optional',
    description: 'Bring in customer and team conversations from WhatsApp.',
  },
  {
    type: 'telegram',
    name: 'Telegram',
    group: 'optional',
    description: 'Keep high-signal Telegram chats close to the rest of your workflow.',
  },
  {
    type: 'slack',
    name: 'Slack',
    group: 'optional',
    description: 'Monitor team messages and jump into urgent threads faster.',
  },
  {
    type: 'jira',
    name: 'Jira',
    group: 'optional',
    description: 'Track overdue work, blockers, and project momentum.',
  },
  {
    type: 'github',
    name: 'GitHub',
    group: 'optional',
    description: 'Watch pull requests, issues, and engineering activity from one place.',
    comingSoon: true,
    fallbackIcon: '⌘',
  },
  {
    type: 'database',
    name: 'Database',
    group: 'optional',
    description: 'Connect PostgreSQL, MySQL, MongoDB, or SQLite for live answers.',
  },
  {
    type: 'google_docs',
    name: 'Google Docs',
    group: 'optional',
    description: 'Open and edit Google Docs inside OrionAI workspaces.',
  },
  {
    type: 'google_sheets',
    name: 'Google Sheets',
    group: 'optional',
    description: 'Analyze and update spreadsheets without leaving OrionAI.',
  },
])

const loading = ref(true)
const saving = ref(false)
const pendingAction = ref('')
const errorMessage = ref('')
const integrations = ref([])
const connectorFocusType = ref(null)
const brokenIconTypes = reactive({})

const recommendedApps = computed(() =>
  APP_DEFINITIONS.filter((app) => app.group === 'recommended')
)

const optionalApps = computed(() =>
  APP_DEFINITIONS.filter((app) => app.group === 'optional')
)

const connectedTypes = computed(() => {
  const values = integrations.value
    .filter((integration) => integration?.enabled !== false && integration?.connected)
    .map((integration) => integration.type)
  return new Set(values)
})

const connectedCount = computed(() => connectedTypes.value.size)
const canContinue = computed(() => connectedCount.value > 0)

function iconUrlFor(app) {
  return getAppIconUrl(app.type)
}

function hasImageIcon(app) {
  return Boolean(iconUrlFor(app)) && brokenIconTypes[app.type] !== true
}

function fallbackIconFor(app) {
  return app.fallbackIcon || getAppFallbackEmoji(app.type)
}

function onIconError(appType) {
  brokenIconTypes[appType] = true
}

function isConnected(app) {
  return connectedTypes.value.has(app.type)
}

function statusTextFor(app) {
  if (isConnected(app)) return 'Connected'
  if (app.comingSoon) return 'Coming soon'
  return 'Available'
}

function actionLabelFor(app) {
  if (isConnected(app)) return 'Manage'
  if (app.comingSoon) return 'Coming soon'
  return 'Connect'
}

function openConnector(app) {
  if (app.comingSoon) return
  connectorFocusType.value = app.type
}

function closeConnector() {
  connectorFocusType.value = null
}

async function refreshStatus() {
  const [{ data: onboardingStatus }, { data: integrationData }] = await Promise.all([
    onboardingAPI.status(),
    api.get('/api/integrations'),
  ])

  if (onboardingStatus?.user) {
    setUser(onboardingStatus.user)
  }

  integrations.value = Array.isArray(integrationData) ? integrationData : []
}

async function loadState() {
  loading.value = true
  errorMessage.value = ''

  try {
    await refreshStatus()
  } catch (error) {
    errorMessage.value =
      error?.response?.data?.error || 'We could not load app connections right now.'
  } finally {
    loading.value = false
  }
}

async function handleIntegrationSnapshot(snapshot) {
  integrations.value = Array.isArray(snapshot) ? snapshot : integrations.value
  try {
    const { data } = await onboardingAPI.status()
    if (data?.user) {
      setUser(data.user)
    }
  } catch {
    // Best effort only. The local connected snapshot is enough for enabling Continue.
  }
}

function handleIntegrationEvent(event) {
  if (Array.isArray(event?.detail?.integrations)) {
    integrations.value = event.detail.integrations
  }
}

async function skipForNow() {
  saving.value = true
  pendingAction.value = 'skip'
  errorMessage.value = ''

  try {
    const { data } = await onboardingAPI.update({
      hasCompletedAppConnection: true,
    })
    if (data?.user) {
      setUser(data.user)
    }
    emit('complete', data)
  } catch (error) {
    errorMessage.value =
      error?.response?.data?.error || 'We could not skip onboarding right now.'
  } finally {
    saving.value = false
    pendingAction.value = ''
  }
}

async function continueFlow() {
  if (!canContinue.value) return

  saving.value = true
  pendingAction.value = 'continue'
  errorMessage.value = ''

  try {
    const { data } = await onboardingAPI.update({
      hasCompletedAppConnection: true,
    })
    if (data?.user) {
      setUser(data.user)
    }
    emit('complete', data)
  } catch (error) {
    errorMessage.value =
      error?.response?.data?.error || 'We could not continue setup right now.'
  } finally {
    saving.value = false
    pendingAction.value = ''
  }
}

onMounted(() => {
  void loadState()
  window.addEventListener('orion:integrations-updated', handleIntegrationEvent)
})

onUnmounted(() => {
  window.removeEventListener('orion:integrations-updated', handleIntegrationEvent)
})
</script>

<style scoped>
.connect-shell {
  position: relative;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  padding: 32px 24px;
  background:
    radial-gradient(circle at top, rgba(82, 212, 255, 0.14), transparent 34%),
    linear-gradient(180deg, #040713 0%, #050816 48%, #070d1c 100%);
}

.connect-glow,
.connect-grid {
  position: absolute;
  pointer-events: none;
}

.connect-glow {
  width: 42rem;
  height: 42rem;
  border-radius: 999px;
  filter: blur(96px);
  opacity: 0.28;
}

.connect-glow--cyan {
  top: -12rem;
  left: -8rem;
  background: radial-gradient(circle, rgba(82, 212, 255, 0.26) 0%, rgba(82, 212, 255, 0.08) 40%, transparent 72%);
}

.connect-glow--violet {
  right: -10rem;
  bottom: -16rem;
  background: radial-gradient(circle, rgba(139, 125, 255, 0.24) 0%, rgba(139, 125, 255, 0.08) 38%, transparent 72%);
}

.connect-grid {
  display: none;
}

.connect-card {
  position: relative;
  z-index: 1;
  width: min(1180px, 100%);
  min-width: 0;
  margin: 0 auto;
  padding: clamp(22px, 4vw, 38px);
  border-radius: 32px;
  border: 1px solid rgba(134, 155, 212, 0.18);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
    rgba(9, 14, 30, 0.9);
  box-shadow: 0 36px 90px rgba(2, 6, 23, 0.4);
  backdrop-filter: blur(26px);
}

.connect-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.connect-logo {
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
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 18px 30px rgba(44, 90, 255, 0.16);
}

.connect-badge {
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
  min-width: 0;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.connect-header {
  margin-top: 22px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  min-width: 0;
}

.connect-header h1 {
  margin: 0;
  color: #f8fbff;
  font-size: 48px;
  line-height: 0.98;
  letter-spacing: 0;
}

.connect-header p {
  margin: 16px 0 0;
  max-width: 42rem;
  color: rgba(209, 220, 242, 0.76);
  font-size: 16px;
  line-height: 1.7;
}

.connect-summary {
  flex-shrink: 0;
  min-width: 150px;
  padding: 16px 18px;
  border-radius: 22px;
  border: 1px solid rgba(176, 201, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  text-align: right;
}

.connect-summary strong {
  display: block;
  color: #f8fbff;
  font-size: 30px;
  line-height: 1;
}

.connect-summary span {
  display: block;
  margin-top: 6px;
  color: rgba(204, 215, 238, 0.68);
  font-size: 13px;
}

.connect-banner,
.connect-loading {
  margin-top: 28px;
  padding: 18px 20px;
  border-radius: 20px;
  border: 1px solid rgba(176, 201, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(229, 237, 255, 0.82);
}

.connect-banner--error {
  border-color: rgba(255, 125, 143, 0.24);
  background: rgba(86, 16, 28, 0.28);
}

.connect-loading {
  display: flex;
  align-items: center;
  gap: 14px;
}

.connect-loading p {
  margin: 0;
}

.connect-loading__spinner {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 2px solid rgba(176, 201, 255, 0.14);
  border-top-color: rgba(102, 214, 255, 0.92);
  animation: connect-spin 0.85s linear infinite;
}

.connect-section {
  margin-top: 30px;
}

.connect-section__head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  min-width: 0;
}

.connect-section__head h2 {
  margin: 0;
  color: #f7faff;
  font-size: 22px;
}

.connect-section__head p {
  margin: 0;
  color: rgba(193, 206, 232, 0.68);
  font-size: 13px;
}

.connect-grid-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
  gap: 16px;
}

.connect-grid-cards--compact {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
}

.connect-app-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  min-height: 220px;
  padding: 20px;
  border-radius: 26px;
  border: 1px solid rgba(176, 201, 255, 0.14);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
    rgba(16, 22, 44, 0.82);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.connect-app-card--compact {
  min-height: 208px;
}

.connect-app-card--connected {
  border-color: rgba(102, 214, 255, 0.24);
  background:
    linear-gradient(180deg, rgba(82, 212, 255, 0.08), rgba(255, 255, 255, 0.02)),
    rgba(16, 22, 44, 0.88);
}

.connect-app-card--soon {
  opacity: 0.86;
}

.connect-app-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.connect-app-icon {
  width: 52px;
  height: 52px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(176, 201, 255, 0.14);
}

.connect-app-icon img {
  width: 28px;
  height: 28px;
  display: block;
  object-fit: contain;
}

.connect-app-icon--glyph {
  color: #f6f9ff;
  font-size: 24px;
}

.connect-status {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(176, 201, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(222, 233, 255, 0.76);
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.connect-status--connected {
  border-color: rgba(102, 214, 255, 0.2);
  color: #9de8ff;
}

.connect-status--soon {
  color: rgba(214, 222, 241, 0.62);
}

.connect-app-copy h3 {
  margin: 0;
  color: #f8fbff;
  font-size: 20px;
  overflow-wrap: anywhere;
}

.connect-app-copy p {
  margin: 10px 0 0;
  color: rgba(198, 209, 233, 0.72);
  font-size: 14px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.connect-app-action,
.connect-primary,
.connect-secondary,
.connect-modal__close {
  appearance: none;
  border: 0;
  cursor: pointer;
  font: inherit;
}

.connect-app-action {
  margin-top: auto;
  width: 100%;
  min-height: 46px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.16), rgba(139, 125, 255, 0.16));
  color: #f7fbff;
  font-weight: 600;
}

.connect-app-action:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.connect-app-action--connected {
  background: rgba(102, 214, 255, 0.12);
  color: #9de8ff;
}

.connect-footer {
  margin-top: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding-top: 24px;
  border-top: 1px solid rgba(176, 201, 255, 0.1);
}

.connect-footnote {
  margin: 0;
  color: rgba(192, 205, 231, 0.68);
  font-size: 13px;
}

.connect-footer__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.connect-secondary,
.connect-primary {
  min-height: 48px;
  padding: 0 20px;
  border-radius: 16px;
  font-weight: 600;
}

.connect-secondary {
  border: 1px solid rgba(176, 201, 255, 0.14);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(228, 236, 253, 0.82);
}

.connect-primary {
  background: linear-gradient(135deg, #54d4ff, #7c88ff);
  color: #04101f;
}

.connect-primary:disabled,
.connect-secondary:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.connect-modal {
  position: fixed;
  inset: 0;
  z-index: 60;
  padding: clamp(10px, 2vw, 20px);
  overflow: auto;
  overscroll-behavior: contain;
  background: rgba(3, 8, 19, 0.8);
  backdrop-filter: blur(14px);
}

.connect-modal__shell {
  width: min(1320px, 100%);
  margin: 0 auto;
  position: relative;
  min-width: 0;
}

.connect-modal__close {
  position: sticky;
  top: 14px;
  z-index: 2;
  margin-left: auto;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1px solid rgba(176, 201, 255, 0.14);
  background: rgba(9, 14, 30, 0.92);
  color: #eef4ff;
}

@keyframes connect-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1100px) {
  .connect-header h1 {
    font-size: 40px;
  }
}

@media (max-width: 760px) {
  .connect-shell {
    padding: 12px;
  }

  .connect-card {
    border-radius: 22px;
    padding: 18px 14px;
  }

  .connect-brand {
    gap: 10px;
  }

  .connect-logo {
    width: 48px;
    height: 48px;
    border-radius: 16px;
    font-size: 24px;
    flex-shrink: 0;
  }

  .connect-badge {
    height: auto;
    min-height: 32px;
    padding: 7px 10px;
    white-space: normal;
    line-height: 1.35;
  }

  .connect-header,
  .connect-section__head,
  .connect-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .connect-summary {
    text-align: left;
    min-width: 0;
    padding: 14px 16px;
  }

  .connect-header h1 {
    font-size: 34px;
    line-height: 1.05;
  }

  .connect-header p {
    margin-top: 12px;
    font-size: 14px;
    line-height: 1.55;
  }

  .connect-section {
    margin-top: 22px;
  }

  .connect-section__head h2 {
    font-size: 19px;
  }

  .connect-section__head p {
    line-height: 1.5;
  }

  .connect-grid-cards,
  .connect-grid-cards--compact {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .connect-app-card,
  .connect-app-card--compact {
    min-height: 0;
    gap: 14px;
    padding: 16px;
    border-radius: 20px;
  }

  .connect-app-icon {
    width: 46px;
    height: 46px;
    border-radius: 15px;
  }

  .connect-status {
    max-width: 42%;
    justify-content: center;
    text-align: center;
  }

  .connect-footer__actions {
    flex-direction: column-reverse;
    align-items: stretch;
    width: 100%;
  }

  .connect-primary,
  .connect-secondary {
    width: 100%;
  }

  .connect-modal {
    padding: 8px;
  }

  .connect-modal__close {
    top: 8px;
    min-height: 40px;
    margin-bottom: 8px;
  }
}

@media (max-width: 420px) {
  .connect-shell {
    padding: 8px;
  }

  .connect-card {
    padding: 16px 12px;
  }

  .connect-header h1 {
    font-size: 30px;
  }

  .connect-summary {
    border-radius: 18px;
  }

  .connect-app-card__top {
    align-items: flex-start;
  }

  .connect-status {
    max-width: 50%;
    height: auto;
    min-height: 28px;
    padding-block: 5px;
    line-height: 1.25;
  }
}

@supports (height: 100dvh) {
  .connect-shell {
    height: 100dvh;
  }
}
</style>
