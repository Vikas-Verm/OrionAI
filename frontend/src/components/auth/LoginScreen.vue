<template>
  <div class="auth-shell">
    <div class="auth-glow auth-glow--cyan" aria-hidden="true"></div>
    <div class="auth-glow auth-glow--violet" aria-hidden="true"></div>
    <div class="auth-grid" aria-hidden="true"></div>

    <div class="auth-card">
      <div class="auth-brand">
        <div class="auth-logo" aria-hidden="true">
          <span class="auth-logo-glyph">🔭</span>
        </div>
        <h1 class="auth-title">OrionAI</h1>
        <p class="auth-tagline">Your AI assistant for life and work</p>
        <p class="auth-support">
          Find what matters across your apps and take action safely.
        </p>
      </div>

      <div class="auth-tabs" role="tablist" aria-label="Authentication">
        <button
          type="button"
          class="auth-tab"
          :class="{ 'auth-tab--active': activeTab === 'signin' }"
          :disabled="isBusy"
          @click="setActiveTab('signin')"
        >
          Sign in
        </button>
        <button
          type="button"
          class="auth-tab"
          :class="{ 'auth-tab--active': activeTab === 'signup' }"
          :disabled="isBusy"
          @click="setActiveTab('signup')"
        >
          Create account
        </button>
      </div>

      <div
        v-if="feedback.message"
        class="auth-banner"
        :class="feedback.tone === 'success' ? 'auth-banner--success' : 'auth-banner--error'"
      >
        {{ feedback.message }}
      </div>

      <div class="auth-social">
        <div v-if="GOOGLE_CLIENT_ID" class="auth-google-stack">
          <div
            id="google-signin-btn"
            ref="googleButtonHost"
            class="auth-google-host"
            :class="{ 'auth-google-host--hidden': !googleReady }"
          ></div>
          <button
            v-if="!googleReady"
            type="button"
            class="auth-google-fallback"
            disabled
            aria-disabled="true"
          >
            <span class="auth-google-icon">G</span>
            <span>{{ googleFallbackLabel }}</span>
          </button>
        </div>
        <button
          v-else
          type="button"
          class="auth-google-fallback"
          disabled
          aria-disabled="true"
        >
          <span class="auth-google-icon">G</span>
          <span>{{ googleFallbackLabel }}</span>
        </button>
        <p v-if="googleFallbackHint" class="auth-social-note">
          {{ googleFallbackHint }}
        </p>
      </div>

      <div class="auth-divider">
        <span>{{ activeTab === 'signin' ? 'or use your OrionAI account' : 'or create your OrionAI account' }}</span>
      </div>

      <form v-if="activeTab === 'signin'" class="auth-form" @submit.prevent="submitSignIn">
        <div class="auth-field">
          <label for="signin-identifier">Email or username</label>
          <input
            id="signin-identifier"
            v-model.trim="signIn.identifier"
            type="text"
            autocomplete="username"
            placeholder="you@example.com or yourusername"
            :disabled="isBusy"
          />
          <p v-if="fieldErrors.identifier" class="auth-field-error">{{ fieldErrors.identifier }}</p>
        </div>

        <div class="auth-field">
          <label for="signin-password">Password</label>
          <div class="auth-password-wrap">
            <input
              id="signin-password"
              v-model="signIn.password"
              :type="showSignInPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="Enter your password"
              :disabled="isBusy"
            />
            <button
              type="button"
              class="auth-visibility"
              :disabled="isBusy"
              :aria-label="showSignInPassword ? 'Hide password' : 'Show password'"
              :title="showSignInPassword ? 'Hide password' : 'Show password'"
              @click="showSignInPassword = !showSignInPassword"
            >
              <svg
                v-if="!showSignInPassword"
                class="auth-visibility-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 3l18 18"></path>
                <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83"></path>
                <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 7.5a11.8 11.8 0 0 1-2.17 3.35"></path>
                <path d="M6.61 6.61A11.76 11.76 0 0 0 1 11.5C2.73 15.89 7 19 12 19a10.9 10.9 0 0 0 4.24-.85"></path>
              </svg>
              <svg
                v-else
                class="auth-visibility-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12s3.64-7 10-7 10 7 10 7-3.64 7-10 7-10-7-10-7Z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
          <p v-if="fieldErrors.password" class="auth-field-error">{{ fieldErrors.password }}</p>
        </div>

        <button type="submit" class="auth-submit" :disabled="isBusy">
          <span v-if="signInLoading" class="auth-spinner"></span>
          <span>{{ signInLoading ? 'Signing in...' : 'Sign in' }}</span>
        </button>
      </form>

      <form v-else class="auth-form" @submit.prevent="submitSignUp">
        <div class="auth-grid-fields">
          <div class="auth-field auth-field--wide">
            <label for="signup-fullname">Full name</label>
            <input
              id="signup-fullname"
              v-model.trim="signUp.fullName"
              type="text"
              autocomplete="name"
              placeholder="Aarav Sharma"
              :disabled="isBusy"
            />
            <p v-if="fieldErrors.fullName" class="auth-field-error">{{ fieldErrors.fullName }}</p>
          </div>

          <div class="auth-field auth-field--wide">
            <label for="signup-email">Email</label>
            <input
              id="signup-email"
              v-model.trim="signUp.email"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              :disabled="isBusy"
            />
            <p v-if="fieldErrors.email" class="auth-field-error">{{ fieldErrors.email }}</p>
          </div>

          <div class="auth-field">
            <label for="signup-username">Username</label>
            <input
              id="signup-username"
              v-model.trim="signUp.username"
              type="text"
              autocomplete="username"
              placeholder="yourusername"
              :disabled="isBusy"
            />
            <p v-if="fieldErrors.username" class="auth-field-error">{{ fieldErrors.username }}</p>
          </div>

          <div class="auth-field">
            <label for="signup-workspace">Workspace or project name</label>
            <input
              id="signup-workspace"
              v-model.trim="signUp.workspaceName"
              type="text"
              autocomplete="organization"
              placeholder="Optional"
              :disabled="isBusy"
            />
          </div>

          <div class="auth-field">
            <label for="signup-password">Password</label>
            <div class="auth-password-wrap">
              <input
                id="signup-password"
                v-model="signUp.password"
                :type="showSignUpPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="Minimum 8 characters"
                :disabled="isBusy"
              />
            <button
              type="button"
              class="auth-visibility"
              :disabled="isBusy"
              :aria-label="showSignUpPassword ? 'Hide password' : 'Show password'"
              :title="showSignUpPassword ? 'Hide password' : 'Show password'"
              @click="showSignUpPassword = !showSignUpPassword"
            >
              <svg
                v-if="!showSignUpPassword"
                class="auth-visibility-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 3l18 18"></path>
                <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83"></path>
                <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 7.5a11.8 11.8 0 0 1-2.17 3.35"></path>
                <path d="M6.61 6.61A11.76 11.76 0 0 0 1 11.5C2.73 15.89 7 19 12 19a10.9 10.9 0 0 0 4.24-.85"></path>
              </svg>
              <svg
                v-else
                class="auth-visibility-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12s3.64-7 10-7 10 7 10 7-3.64 7-10 7-10-7-10-7Z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            </div>
            <p v-if="fieldErrors.password" class="auth-field-error">{{ fieldErrors.password }}</p>
          </div>

          <div class="auth-field">
            <label for="signup-confirm">Confirm password</label>
            <div class="auth-password-wrap">
              <input
                id="signup-confirm"
                v-model="signUp.confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="Repeat your password"
                :disabled="isBusy"
              />
            <button
              type="button"
              class="auth-visibility"
              :disabled="isBusy"
              :aria-label="showConfirmPassword ? 'Hide password' : 'Show password'"
              :title="showConfirmPassword ? 'Hide password' : 'Show password'"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              <svg
                v-if="!showConfirmPassword"
                class="auth-visibility-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 3l18 18"></path>
                <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83"></path>
                <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 7.5a11.8 11.8 0 0 1-2.17 3.35"></path>
                <path d="M6.61 6.61A11.76 11.76 0 0 0 1 11.5C2.73 15.89 7 19 12 19a10.9 10.9 0 0 0 4.24-.85"></path>
              </svg>
              <svg
                v-else
                class="auth-visibility-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12s3.64-7 10-7 10 7 10 7-3.64 7-10 7-10-7-10-7Z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            </div>
            <p v-if="fieldErrors.confirmPassword" class="auth-field-error">{{ fieldErrors.confirmPassword }}</p>
          </div>
        </div>

        <button type="submit" class="auth-submit" :disabled="isBusy">
          <span v-if="signUpLoading" class="auth-spinner"></span>
          <span>{{ signUpLoading ? 'Creating account...' : 'Create account' }}</span>
        </button>
      </form>

      <p class="auth-footer">OrionAI Private Beta</p>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import api from '../../services/api'
import { setAuth } from '../../stores/app'

const emit = defineEmits(['success'])

const activeTab = ref('signin')
const signInLoading = ref(false)
const signUpLoading = ref(false)
const googleLoading = ref(false)
const googleReady = ref(false)
const googleLoadFailed = ref(false)
const googleButtonHost = ref(null)

const feedback = ref({ tone: 'error', message: '' })
const fieldErrors = ref({})

const signIn = ref({
  identifier: '',
  password: '',
})

const signUp = ref({
  fullName: '',
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
  workspaceName: '',
})

const showSignInPassword = ref(false)
const showSignUpPassword = ref(false)
const showConfirmPassword = ref(false)

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
let googleResizeObserver = null
let googleRenderFrame = 0

const isBusy = computed(
  () => signInLoading.value || signUpLoading.value || googleLoading.value
)

const googleFallbackLabel = computed(() => {
  if (GOOGLE_CLIENT_ID && !googleLoadFailed.value) return 'Loading Google sign-in...'
  return 'Google sign-in coming soon'
})

const googleFallbackHint = computed(() => {
  if (GOOGLE_CLIENT_ID && googleLoadFailed.value) {
    return 'Google sign-in is temporarily unavailable. You can still use email or username.'
  }
  if (!GOOGLE_CLIENT_ID) {
    return 'Google sign-in is not configured for this OrionAI environment yet.'
  }
  return ''
})

watch(activeTab, () => {
  fieldErrors.value = {}
  feedback.value = { tone: 'error', message: '' }
})

onMounted(async () => {
  if (!GOOGLE_CLIENT_ID) return

  try {
    await loadGoogleScript()
    if (!window.google?.accounts?.id) {
      googleLoadFailed.value = true
      return
    }

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
    })

    await nextTick()
    renderGoogleButton()
    if (window.ResizeObserver && googleButtonHost.value) {
      googleResizeObserver = new ResizeObserver(scheduleGoogleButtonRender)
      googleResizeObserver.observe(googleButtonHost.value)
    }
  } catch {
    googleLoadFailed.value = true
  }
})

onBeforeUnmount(() => {
  googleResizeObserver?.disconnect()
  if (googleRenderFrame) cancelAnimationFrame(googleRenderFrame)
})

function getGoogleButtonWidth() {
  const host = googleButtonHost.value
  if (!host) return 320
  const width = Math.floor(host.getBoundingClientRect().width)
  return Math.max(240, Math.min(420, width || 320))
}

function scheduleGoogleButtonRender() {
  if (googleRenderFrame) cancelAnimationFrame(googleRenderFrame)
  googleRenderFrame = requestAnimationFrame(() => {
    googleRenderFrame = 0
    renderGoogleButton()
  })
}

function renderGoogleButton() {
  const host = googleButtonHost.value
  if (!host || !window.google?.accounts?.id) return

  host.innerHTML = ''
  window.google.accounts.id.renderButton(host, {
    type: 'standard',
    theme: 'filled_black',
    size: 'large',
    width: getGoogleButtonWidth(),
    text: 'continue_with',
    shape: 'pill',
    logo_alignment: 'left',
  })

  googleReady.value = true
}

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve()
      return
    }

    const existing = document.querySelector('script[data-google-signin="true"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('google_script_failed')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.googleSignin = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('google_script_failed'))
    document.head.appendChild(script)
  })
}

function setActiveTab(tab) {
  if (isBusy.value) return
  activeTab.value = tab
}

function setError(message, errors = {}) {
  feedback.value = { tone: 'error', message }
  fieldErrors.value = errors
}

function setSuccess(message) {
  feedback.value = { tone: 'success', message }
}

function validateSignIn() {
  const errors = {}

  if (!signIn.value.identifier) {
    errors.identifier = 'Email or username is required.'
  }

  if (!signIn.value.password) {
    errors.password = 'Password is required.'
  }

  fieldErrors.value = errors
  if (Object.keys(errors).length > 0) {
    feedback.value = {
      tone: 'error',
      message: 'Enter your email or username and password to continue.',
    }
    return false
  }

  feedback.value = { tone: 'error', message: '' }
  return true
}

function validateSignUp() {
  const errors = {}
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!signUp.value.fullName) errors.fullName = 'Full name is required.'
  if (!signUp.value.email) errors.email = 'Email is required.'
  else if (!emailPattern.test(signUp.value.email)) errors.email = 'Enter a valid email address.'
  if (!signUp.value.username) errors.username = 'Username is required.'
  if (!signUp.value.password) errors.password = 'Password is required.'
  else if (signUp.value.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.'
  }
  if (!signUp.value.confirmPassword) {
    errors.confirmPassword = 'Please confirm your password.'
  } else if (signUp.value.confirmPassword !== signUp.value.password) {
    errors.confirmPassword = 'Passwords do not match.'
  }

  fieldErrors.value = errors
  if (Object.keys(errors).length > 0) {
    feedback.value = {
      tone: 'error',
      message: 'Please fix the highlighted fields and try again.',
    }
    return false
  }

  feedback.value = { tone: 'error', message: '' }
  return true
}

function applyServerError(error, fallback) {
  const data = error?.response?.data || {}
  setError(data.error || fallback, data.fieldErrors || {})
}

function finalizeAuth(token, user, redirectTo = '/') {
  setAuth(token, user)
  api.defaults.headers.common.Authorization = `Bearer ${token}`
  emit('success', { redirectTo })
}

async function handleGoogleCredential(response) {
  googleLoading.value = true
  fieldErrors.value = {}
  feedback.value = { tone: 'error', message: '' }

  try {
    const res = await api.post('/auth/google/verify', {
      credential: response.credential,
    })
    finalizeAuth(res.data.token, res.data.user)
  } catch (error) {
    applyServerError(error, 'Google sign-in failed. Try again.')
  } finally {
    googleLoading.value = false
  }
}

async function submitSignIn() {
  if (!validateSignIn()) return

  signInLoading.value = true
  fieldErrors.value = {}

  try {
    const res = await api.post('/auth/login', {
      identifier: signIn.value.identifier,
      password: signIn.value.password,
    })
    finalizeAuth(res.data.token, res.data.user)
  } catch (error) {
    applyServerError(error, 'Unable to sign in with those credentials.')
  } finally {
    signInLoading.value = false
  }
}

async function submitSignUp() {
  if (!validateSignUp()) return

  signUpLoading.value = true
  fieldErrors.value = {}

  try {
    const res = await api.post('/auth/register', {
      fullName: signUp.value.fullName,
      email: signUp.value.email,
      username: signUp.value.username,
      password: signUp.value.password,
      workspaceName: signUp.value.workspaceName,
    })

    setSuccess('Account created. Preparing your OrionAI workspace...')
    await new Promise((resolve) => setTimeout(resolve, 220))
    finalizeAuth(res.data.token, res.data.user)
  } catch (error) {
    applyServerError(error, 'Unable to create your account right now.')
  } finally {
    signUpLoading.value = false
  }
}
</script>

<style scoped>
.auth-shell {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: clamp(20px, 4vh, 40px) 24px;
  background: var(--bg-base);
}

.auth-glow,
.auth-grid {
  display: none;
}

.auth-card {
  position: relative;
  z-index: 1;
  width: min(100%, 480px);
  margin: auto 0;
  flex-shrink: 0;
  padding: 34px 30px 24px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  box-shadow: var(--shadow-lg);
}

.auth-brand {
  text-align: center;
  margin-bottom: 24px;
}

.auth-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  border-radius: 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
}

.auth-logo-glyph {
  font-size: 1.8rem;
  line-height: 1;
}

.auth-title {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--font-brand);
  font-size: clamp(1.6rem, 4vw, 2rem);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.auth-tagline {
  margin: 8px 0 8px;
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 600;
}

.auth-support {
  margin: 0 auto;
  max-width: 420px;
  color: var(--text-muted);
  font-size: 0.95rem;
  line-height: 1.6;
}

.auth-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  padding: 4px;
  margin-bottom: 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
}

.auth-tab {
  border: 0;
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  color: var(--text-secondary);
  background: transparent;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.auth-tab:hover:not(:disabled) {
  color: var(--text-primary);
}

.auth-tab--active {
  color: var(--text-primary);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
}

.auth-banner {
  margin-bottom: 14px;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.88rem;
  line-height: 1.45;
}

.auth-banner--error {
  color: #FCA5A5;
  border: 1px solid rgba(239, 68, 68, 0.2);
  background: rgba(239, 68, 68, 0.08);
}

.auth-banner--success {
  color: #86EFAC;
  border: 1px solid rgba(34, 197, 94, 0.2);
  background: rgba(34, 197, 94, 0.08);
}

.auth-social {
  margin-bottom: 14px;
}

.auth-google-stack {
  position: relative;
  min-height: 46px;
  width: 100%;
}

.auth-google-host {
  display: flex;
  justify-content: center;
  width: 100%;
  min-height: 44px;
}

.auth-google-host :deep(div),
.auth-google-host :deep(iframe) {
  max-width: 100%;
}

.auth-google-host--hidden {
  visibility: hidden;
}

.auth-google-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  min-height: 44px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 500;
}

.auth-google-stack .auth-google-fallback {
  position: absolute;
  inset: 0;
}

.auth-google-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 0.9rem;
  color: var(--text-primary);
}

.auth-social-note {
  margin: 10px 0 0;
  color: var(--text-muted);
  font-size: 0.85rem;
  text-align: center;
}

.auth-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0;
  color: var(--text-faint);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-subtle);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.auth-grid-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.auth-field--wide {
  grid-column: span 2;
}

.auth-field label {
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.auth-field input {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 0.9rem;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.auth-field input::placeholder {
  color: var(--text-muted);
}

.auth-field input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.1);
}

.auth-field input:disabled,
.auth-tab:disabled,
.auth-submit:disabled,
.auth-visibility:disabled {
  opacity: 0.72;
  cursor: not-allowed;
}

.auth-password-wrap {
  position: relative;
}

.auth-password-wrap input {
  padding-right: 72px;
}

.auth-visibility {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.auth-visibility:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.auth-visibility-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.auth-field-error {
  margin: 0;
  color: #ff9ca9;
  font-size: 0.82rem;
  line-height: 1.35;
}

.auth-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 44px;
  margin-top: 4px;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: white;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.auth-submit:hover:not(:disabled) {
  background: var(--accent-hover);
}

.auth-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 999px;
  animation: auth-spin 0.8s linear infinite;
}

.auth-footer {
  margin: 18px 0 0;
  color: var(--text-faint);
  font-size: 0.82rem;
  text-align: center;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

@keyframes auth-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .auth-shell {
    padding: 12px;
  }

  .auth-card {
    width: 100%;
    margin: 0;
    padding: 22px 16px 18px;
    border-radius: var(--radius-md);
  }

  .auth-brand {
    margin-bottom: 18px;
  }

  .auth-logo {
    width: 52px;
    height: 52px;
    margin-bottom: 12px;
    border-radius: 12px;
  }

  .auth-tabs {
    gap: 4px;
    margin-bottom: 14px;
  }

  .auth-tab {
    min-height: 40px;
    padding: 8px;
  }

  .auth-grid-fields {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .auth-field--wide {
    grid-column: span 1;
  }

  .auth-title {
    font-size: 2rem;
  }

  .auth-support {
    font-size: 0.9rem;
  }
}

@media (max-height: 820px) {
  .auth-shell {
    padding-block: 14px;
  }

  .auth-card {
    margin: 0;
    padding-block: 22px 18px;
  }

  .auth-brand {
    margin-bottom: 16px;
  }

  .auth-logo {
    width: 58px;
    height: 58px;
    margin-bottom: 10px;
    border-radius: var(--radius-md);
  }

  .auth-title {
    font-size: 2rem;
  }

  .auth-tagline {
    margin-block: 6px;
  }

  .auth-support {
    line-height: 1.45;
  }

  .auth-tabs,
  .auth-divider {
    margin-block: 12px;
  }

  .auth-form,
  .auth-grid-fields {
    gap: 12px;
  }

  .auth-field input {
    min-height: 44px;
  }

  .auth-submit {
    min-height: 46px;
  }
}

@supports (height: 100dvh) {
  .auth-shell {
    height: 100dvh;
  }
}
</style>
