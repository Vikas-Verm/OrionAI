<template>
  <div class="sidebar">
    <div class="sidebar-brand">
      <span class="sidebar-brand-icon">🔭</span>
      <span class="sidebar-brand-name">OrionAI</span>
    </div>

    <div class="search-box">
      <input v-model="searchQuery" ref="searchInputRef"
        placeholder="Search chats..." class="search-input"
        @input="onSearch" />
    </div>

    <button class="new-chat-btn" @click="emit('newChat')">+ New Chat</button>

    <div class="sessions-list">
      <div v-for="session in store.sessions" :key="session.sessionId"
        :class="['session-item', session.sessionId === store.currentSessionId ? 'active' : '']"
        @click="emit('switchSession', session.sessionId)">
        <span class="session-icon">
          {{ session.mode === 'db' ? '🗄️' : session.mode === 'rag' ? '📄' : session.mode === 'agent' ? '🤖' : '💬' }}
        </span>
        <span class="session-title">{{ session.title }}</span>
        <button class="delete-session-btn" @click.stop="emit('deleteSession', session.sessionId)">✕</button>
      </div>
    </div>

    <div class="sidebar-footer">
      <div class="shortcuts-hint">
        <span>⌘K new chat</span>
        <span>⌘/ search</span>
      </div>

      <!-- Integrations button -->
      <button class="integrations-btn" @click="emit('openIntegrations')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        Integrations
        <span v-if="integrationCount > 0" class="integrations-count">{{ integrationCount }}</span>
      </button>

      <div class="user-row-wrapper">
        <transition name="menu-pop">
          <div v-if="showUserMenu" class="user-popup" @click.stop>
            <div class="popup-section-label">Theme</div>
            <div class="popup-theme-options">
              <button v-for="opt in themeOptions" :key="opt.value"
                :class="['popup-theme-btn', theme === opt.value ? 'active' : '']"
                @click="setTheme(opt.value)">
                <span class="popup-theme-icon">{{ opt.icon }}</span>
                <span>{{ opt.label }}</span>
              </button>
            </div>
            <div class="popup-divider"></div>
            <button class="popup-item danger" @click="emit('logout'); showUserMenu = false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Log out
            </button>
          </div>
        </transition>

        <div class="user-info" @click.stop="showUserMenu = !showUserMenu">
          <span class="user-avatar">{{ initials }}</span>
          <span class="username">{{ store.user?.username }}</span>
          <svg class="user-chevron" :class="{ rotated: showUserMenu }"
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { store } from '../../stores/app'
import { useSession } from '../../composables/useSession'
import { useTheme }   from '../../composables/useTheme'
import api from '../../services/api'

const emit = defineEmits(['newChat', 'switchSession', 'deleteSession', 'logout', 'openIntegrations'])

const { loadSessions } = useSession()
const { theme, setTheme } = useTheme()

const searchQuery      = ref('')
const searchInputRef   = ref(null)
const showUserMenu     = ref(false)
const integrationCount = ref(0)

const themeOptions = [
  { value: 'dark',   icon: '🌙', label: 'Dark'   },
  { value: 'light',  icon: '☀️',  label: 'Light'  },
  { value: 'system', icon: '💻', label: 'System' },
]

const initials = computed(() => {
  const name = store.user?.username || '?'
  return name.slice(0, 2).toUpperCase()
})

// Load integration count for badge
onMounted(async () => {
  document.addEventListener('click', onOutsideClick)
  try {
    const res = await api.get('/api/integrations')
    integrationCount.value = res.data.filter(i => i.enabled).length
  } catch { /* non-fatal */ }
})

onUnmounted(() => document.removeEventListener('click', onOutsideClick))

let searchTimer = null
function onSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadSessions(searchQuery.value), 300)
}

function onOutsideClick(e) {
  if (!e.target.closest('.user-row-wrapper')) showUserMenu.value = false
}

defineExpose({ searchInputRef })
</script>

<style scoped>
.integrations-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 6px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}
.integrations-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border-color: var(--border-default);
}
.integrations-count {
  margin-left: auto;
  background: var(--accent);
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 16px;
  text-align: center;
}
</style>