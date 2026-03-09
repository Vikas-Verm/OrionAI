<template>
    <div class="login-screen">
      <div class="login-box">
        <div class="login-logo">🔭</div>
        <h1>OrionAI</h1>
        <p>{{ authMode === 'login' ? 'Welcome back, navigator' : 'Begin your journey' }}</p>
  
        <div class="auth-tabs">
          <button :class="['auth-tab', authMode === 'login' ? 'active' : '']"
            @click="authMode = 'login'; authError = ''">Login</button>
          <button :class="['auth-tab', authMode === 'register' ? 'active' : '']"
            @click="authMode = 'register'; authError = ''">Register</button>
        </div>
  
        <div class="login-input-box">
          <input v-model="form.username" placeholder="Username" class="login-input" @keydown.enter="submit" />
          <input v-model="form.password" type="password" placeholder="Password" class="login-input" @keydown.enter="submit" />
        </div>
  
        <p v-if="authError" class="auth-error">{{ authError }}</p>
  
        <button @click="submit"
          :disabled="!form.username.trim() || !form.password.trim() || loading"
          class="login-btn">
          {{ loading ? 'Please wait...' : authMode === 'login' ? 'Login →' : 'Create Account →' }}
        </button>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue'
  import { authAPI } from '../../services/api'
  import { setAuth } from '../../stores/app'
  
  const emit = defineEmits(['success'])
  
  const authMode = ref('login')
  const authError = ref('')
  const loading = ref(false)
  const form = ref({ username: '', password: '' })
  
  async function submit() {
    authError.value = ''
    loading.value = true
    try {
      const ep = authMode.value === 'login' ? 'login' : 'register'
      const res = await authAPI[ep](form.value)
      setAuth(res.data.token, res.data.user)
      emit('success')
    } catch (e) {
      authError.value = e.response?.data?.error || 'Something went wrong'
    } finally {
      loading.value = false
    }
  }
  </script>