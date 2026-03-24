<template>
  <div class="login-root">
    <div class="login-card">

      <!-- Logo -->
      <div class="login-logo">
        <span class="login-logo-icon">🔭</span>
      </div>
      <h1 class="login-title">OrionAI</h1>
      <p class="login-sub">Your AI chief of staff</p>

      <!-- ── GOOGLE SSO BUTTON ─────────────────────────────────────────── -->
      <div id="google-signin-btn" class="google-btn-wrap"></div>

      <div class="login-divider">
        <span>or sign in with username</span>
      </div>

      <!-- ── USERNAME / PASSWORD ──────────────────────────────────────── -->
      <form @submit.prevent="submit" class="login-form">
        <div class="login-field">
          <label>Username</label>
          <input v-model="username" type="text" placeholder="Enter username"
            autocomplete="username" :disabled="loading" />
        </div>
        <div class="login-field">
          <label>Password</label>
          <input v-model="password" type="password" placeholder="Enter password"
            autocomplete="current-password" :disabled="loading" />
        </div>

        <div v-if="error" class="login-error">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          {{ error }}
        </div>

        <button type="submit" class="login-btn" :disabled="loading || !username || !password">
          <span v-if="loading" class="login-spin"></span>
          <span v-else>Sign in</span>
        </button>
      </form>

      <p class="login-footer">OrionAI · Private Beta</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../services/api'
import { setAuth } from '../../stores/app'

const emit = defineEmits(['success'])

const username = ref('')
const password = ref('')
const loading  = ref(false)
const error    = ref('')

// ── Google SSO ──────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

onMounted(() => {
  if (!GOOGLE_CLIENT_ID) return
  loadGoogleScript().then(() => {
    window.google.accounts.id.initialize({
      client_id:         GOOGLE_CLIENT_ID,
      callback:          handleGoogleCredential,
      auto_select:       false,
      cancel_on_tap_outside: true,
    })
    window.google.accounts.id.renderButton(
      document.getElementById('google-signin-btn'),
      {
        type:   'standard',
        theme:  'filled_black',
        size:   'large',
        width:  360,
        text:   'continue_with',
        shape:  'rectangular',
        logo_alignment: 'left',
      }
    )
  })
})

function loadGoogleScript() {
  return new Promise((resolve) => {
    if (window.google?.accounts) { resolve(); return }
    const script = document.createElement('script')
    script.src   = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = resolve
    document.head.appendChild(script)
  })
}

async function handleGoogleCredential(response) {
  loading.value = true
  error.value   = ''
  try {
    const res = await api.post('/auth/google/verify', {
      credential: response.credential
    })
    setAuth(res.data.token, res.data.user)
    api.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`
    emit('success')
  } catch (err) {
    error.value = err.response?.data?.error || 'Google sign-in failed. Try again.'
  } finally {
    loading.value = false
  }
}

// ── Username/password login ─────────────────────────────────────────────────
async function submit() {
  if (!username.value || !password.value) return
  loading.value = true
  error.value   = ''
  try {
    const res = await api.post('/auth/login', {
      username: username.value,
      password: password.value,
    })
    setAuth(res.data.token, res.data.user)
    api.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`
    emit('success')
  } catch (err) {
    error.value = err.response?.data?.error || 'Invalid username or password'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-root {
  min-height: 100vh;
  background: var(--bg-base, #0a0a14);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.login-card {
  background: var(--bg-elevated, #13131f);
  border: 1px solid var(--border-default, rgba(255,255,255,0.08));
  border-radius: 20px;
  padding: 40px 36px 32px;
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5);
}

.login-logo {
  width: 64px;
  height: 64px;
  background: rgba(99,102,241,0.12);
  border: 2px solid rgba(99,102,241,0.25);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}
.login-logo-icon { font-size: 30px; }

.login-title {
  font-size: 26px;
  font-weight: 800;
  color: var(--text-primary, #fff);
  margin: 0;
  letter-spacing: -0.5px;
}
.login-sub {
  font-size: 13.5px;
  color: var(--text-muted, rgba(255,255,255,0.4));
  margin: 0 0 12px;
}

/* Google button */
.google-btn-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
  margin: 4px 0;
}

.login-divider {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 4px 0;
  color: var(--text-muted, rgba(255,255,255,0.3));
  font-size: 12px;
}
.login-divider::before,
.login-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-subtle, rgba(255,255,255,0.07));
}

.login-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.login-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.login-field label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted, rgba(255,255,255,0.5));
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.login-field input {
  padding: 10px 13px;
  background: var(--bg-surface, rgba(255,255,255,0.04));
  border: 1px solid var(--border-default, rgba(255,255,255,0.1));
  border-radius: 10px;
  color: var(--text-primary, #fff);
  font-size: 14px;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}
.login-field input:focus { border-color: rgba(99,102,241,0.5); }
.login-field input::placeholder { color: var(--text-muted, rgba(255,255,255,0.25)); }
.login-field input:disabled { opacity: 0.5; }

.login-error {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 12px;
  background: rgba(239,68,68,0.1);
  border: 1px solid rgba(239,68,68,0.25);
  border-radius: 8px;
  font-size: 13px;
  color: #f87171;
}

.login-btn {
  width: 100%;
  padding: 11px;
  background: #6366f1;
  border: none;
  border-radius: 10px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
}
.login-btn:hover:not(:disabled) { background: #4f46e5; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(99,102,241,0.35); }
.login-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

.login-spin {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.login-footer {
  font-size: 11.5px;
  color: var(--text-muted, rgba(255,255,255,0.25));
  margin: 8px 0 0;
}
</style>