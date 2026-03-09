<template>
    <div class="integrations-page">
  
      <!-- Header -->
      <div class="int-header">
        <div class="int-header-left">
          <button class="int-back-btn" @click="emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div>
            <h1 class="int-title">Integrations</h1>
            <p class="int-subtitle">Connect OrionAI to your business tools</p>
          </div>
        </div>
        <div class="int-header-badge">
          <span class="badge-dot"></span>
          {{ connectedCount }} connected
        </div>
      </div>
  
      <!-- Search -->
      <div class="int-search-wrap">
        <svg class="int-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input v-model="search" class="int-search" placeholder="Search integrations..." />
      </div>
  
      <!-- Grid -->
      <div class="int-grid">
        <div
          v-for="card in filteredCards"
          :key="card.type"
          :class="['int-card', getStatus(card.type), expandedType === card.type ? 'expanded' : '']"
          @click="toggleExpand(card.type)"
        >
          <!-- Card top -->
          <div class="int-card-top">
            <div class="int-card-icon" :style="{ background: card.color }">
              <img v-if="card.img" :src="card.img" :alt="card.name" class="int-logo" />
              <span v-else class="int-emoji">{{ card.emoji }}</span>
            </div>
  
            <div class="int-card-info">
              <div class="int-card-name">{{ card.name }}</div>
              <div class="int-card-desc">{{ card.desc }}</div>
            </div>
  
            <div class="int-card-right">
              <span v-if="card.comingSoon" class="badge-soon">Soon</span>
              <span v-else-if="getStatus(card.type) === 'connected'" class="badge-connected">
                <span class="badge-dot green"></span> Connected
              </span>
              <span v-else class="badge-disconnected">Not connected</span>
  
              <svg class="int-chevron" :class="{ rotated: expandedType === card.type }"
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>
  
          <!-- Expanded form -->
          <transition name="int-expand">
            <div v-if="expandedType === card.type && !card.comingSoon"
              class="int-card-form" @click.stop>
  
              <!-- SLACK -->
              <template v-if="card.type === 'slack'">
                <div class="int-field-group">
                  <label class="int-label">
                    Webhook URL
                    <a href="https://api.slack.com/messaging/webhooks" target="_blank" class="int-help-link">
                      How to get this ↗
                    </a>
                  </label>
                  <input v-model="forms.slack.webhookUrl" class="int-input"
                    placeholder="https://hooks.slack.com/services/..." type="url" />
                </div>
                <div class="int-field-row">
                  <div class="int-field-group">
                    <label class="int-label">Channel name</label>
                    <input v-model="forms.slack.channel" class="int-input" placeholder="#finance" />
                  </div>
                  <div class="int-field-group">
                    <label class="int-label">Workspace name</label>
                    <input v-model="forms.slack.workspaceName" class="int-input" placeholder="Poshn HQ" />
                  </div>
                </div>
                <div class="int-setup-steps">
                  <div class="int-steps-title">Setup in 2 minutes:</div>
                  <ol class="int-steps-list">
                    <li>Go to <a href="https://api.slack.com/apps" target="_blank" class="int-help-link">api.slack.com/apps</a> → Create New App</li>
                    <li>Choose "From scratch" → name it "OrionAI" → pick your workspace</li>
                    <li>Go to "Incoming Webhooks" → toggle On → Add New Webhook to Workspace</li>
                    <li>Pick a channel → copy the Webhook URL → paste above</li>
                  </ol>
                </div>
              </template>
  
              <!-- NOTION -->
              <template v-else-if="card.type === 'notion'">
                <div class="int-field-group">
                  <label class="int-label">
                    Internal Integration Token
                    <a href="https://www.notion.so/my-integrations" target="_blank" class="int-help-link">
                      Get token ↗
                    </a>
                  </label>
                  <input v-model="forms.notion.apiToken" class="int-input"
                    placeholder="secret_..." type="password" />
                </div>
                <div class="int-field-group">
                  <label class="int-label">Database ID <span class="int-label-opt">(optional)</span></label>
                  <input v-model="forms.notion.databaseId" class="int-input"
                    placeholder="32-character database ID" />
                </div>
                <div class="int-setup-steps">
                  <div class="int-steps-title">Setup:</div>
                  <ol class="int-steps-list">
                    <li>Go to <a href="https://www.notion.so/my-integrations" target="_blank" class="int-help-link">notion.so/my-integrations</a> → New integration</li>
                    <li>Name it "OrionAI" → submit → copy the Internal Integration Token</li>
                    <li>In Notion, open your database → Share → Invite your integration</li>
                    <li>Copy the database ID from the URL (32 chars after the last /)</li>
                  </ol>
                </div>
              </template>
  
              <!-- JIRA -->
              <template v-else-if="card.type === 'jira'">
                <div class="int-field-group">
                  <label class="int-label">Atlassian Domain</label>
                  <input v-model="forms.jira.domain" class="int-input"
                    placeholder="yourcompany.atlassian.net" />
                </div>
                <div class="int-field-row">
                  <div class="int-field-group">
                    <label class="int-label">Email</label>
                    <input v-model="forms.jira.email" class="int-input"
                      placeholder="you@company.com" type="email" />
                  </div>
                  <div class="int-field-group">
                    <label class="int-label">
                      API Token
                      <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" class="int-help-link">Get token ↗</a>
                    </label>
                    <input v-model="forms.jira.apiToken" class="int-input"
                      placeholder="API token" type="password" />
                  </div>
                </div>
                <div class="int-field-group">
                  <label class="int-label">Default Project Key</label>
                  <input v-model="forms.jira.projectKey" class="int-input" placeholder="POSHN" />
                </div>
              </template>
  
              <!-- WEBHOOK -->
              <template v-else-if="card.type === 'webhook'">
                <div class="int-field-group">
                  <label class="int-label">Endpoint URL</label>
                  <input v-model="forms.webhook.url" class="int-input"
                    placeholder="https://your-app.com/webhook" type="url" />
                </div>
                <div class="int-field-row">
                  <div class="int-field-group">
                    <label class="int-label">Method</label>
                    <select v-model="forms.webhook.method" class="int-input">
                      <option>POST</option>
                      <option>PUT</option>
                      <option>PATCH</option>
                    </select>
                  </div>
                  <div class="int-field-group">
                    <label class="int-label">Secret <span class="int-label-opt">(optional)</span></label>
                    <input v-model="forms.webhook.secret" class="int-input"
                      placeholder="Signing secret" type="password" />
                  </div>
                </div>
              </template>
  
              <!-- GMAIL -->
              <template v-else-if="card.type === 'gmail'">
  
                <!-- Connected -->
                <div v-if="connected.gmail?.gmail?.userEmail" class="int-oauth-connected">
                  <div class="int-oauth-connected-row">
                    <span class="int-oauth-connected-icon">✅</span>
                    <div class="int-oauth-connected-info">
                      <div class="int-oauth-connected-title">Connected as</div>
                      <div class="int-oauth-connected-email">{{ connected.gmail.gmail.userEmail }}</div>
                    </div>
                    <button class="int-oauth-reconnect-btn" @click="startGmailOAuth">Reconnect</button>
                  </div>
                </div>
  
                <!-- Not connected -->
                <div v-else class="int-oauth-block">
                  <img src="https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png"
                       class="int-oauth-icon-img" alt="Gmail" />
                  <div class="int-oauth-text">
                    <div class="int-oauth-title">Connect your Gmail</div>
                    <div class="int-oauth-desc">Read, send and reply to emails directly from OrionAI</div>
                  </div>
                  <button class="int-oauth-btn-google" @click="startGmailOAuth" :disabled="gmailConnecting">
                    <span v-if="gmailConnecting" class="int-oauth-spinner"></span>
                    <span v-else style="display:flex;align-items:center;gap:8px">
                      <svg width="16" height="16" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Sign in with Google
                    </span>
                  </button>
                </div>
  
              </template>
  
              <!-- Action buttons -->
              <div class="int-actions">
                <button
                  class="int-btn int-btn-test"
                  :disabled="testing === card.type"
                  @click="testConnection(card.type)">
                  <span v-if="testing === card.type" class="int-spinner"></span>
                  <span v-else>⚡ Test</span>
                </button>
                <button
                  class="int-btn int-btn-save"
                  :disabled="saving === card.type"
                  @click="saveIntegration(card.type)">
                  <span v-if="saving === card.type" class="int-spinner"></span>
                  <span v-else>Save</span>
                </button>
                <button
                  v-if="getStatus(card.type) === 'connected'"
                  class="int-btn int-btn-remove"
                  @click="removeIntegration(card.type)">
                  Remove
                </button>
              </div>
  
              <!-- Test result -->
              <transition name="fade">
                <div v-if="testResults[card.type]"
                  :class="['int-test-result', testResults[card.type].ok ? 'ok' : 'fail']">
                  {{ testResults[card.type].ok ? '✅' : '❌' }}
                  {{ testResults[card.type].message || testResults[card.type].error }}
                </div>
              </transition>
  
            </div>
          </transition>
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, computed, onMounted, reactive } from 'vue'
  import api from '../../services/api'
  
  const emit = defineEmits(['close'])
  
  const search       = ref('')
  const expandedType = ref(null)
  const saving       = ref(null)
  const testing      = ref(null)
  const testResults  = reactive({})
  const connected    = reactive({})  // type → integration doc
  
  const cards = [
    {
      type:  'slack',
      name:  'Slack',
      desc:  'Post agent notifications to any channel',
      emoji: '💬',
      color: '#4A154B',
      img:   'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons@v9/icons/slack.svg',
    },
    {
      type:  'notion',
      name:  'Notion',
      desc:  'Create pages and update databases',
      emoji: '📝',
      color: '#000000',
    },
    {
      type:  'jira',
      name:  'Jira',
      desc:  'Create and track issues automatically',
      emoji: '🎫',
      color: '#0052CC',
      img:   'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons@v9/icons/jira.svg',
    },
    {
      type:  'gmail',
      name:  'Gmail',
      desc:  'Send from your real Gmail account',
      emoji: '📬',
      color: '#EA4335',
    },
    {
      type:  'webhook',
      name:  'Custom Webhook',
      desc:  'POST agent data to any endpoint',
      emoji: '🔗',
      color: '#6366f1',
    },
    {
      type:       'google_calendar',
      name:       'Google Calendar',
      desc:       'Create events and payment reminders',
      emoji:      '📅',
      color:      '#1a73e8',
      comingSoon: true,
    },
  ]
  
  // Form state for each type
  const forms = reactive({
    slack:   { webhookUrl: '', channel: '', workspaceName: '' },
    notion:  { apiToken: '', databaseId: '', pageId: '' },
    jira:    { domain: '', email: '', apiToken: '', projectKey: '' },
    webhook: { url: '', method: 'POST', secret: '' },
    gmail:   {},
  })
  
  const filteredCards = computed(() =>
    search.value
      ? cards.filter(c =>
          c.name.toLowerCase().includes(search.value.toLowerCase()) ||
          c.desc.toLowerCase().includes(search.value.toLowerCase())
        )
      : cards
  )
  
  const connectedCount = computed(() => Object.keys(connected).length)
  
  function getStatus(type) {
    return connected[type] ? 'connected' : 'disconnected'
  }
  
  function toggleExpand(type) {
    if (cards.find(c => c.type === type)?.comingSoon) return
    expandedType.value = expandedType.value === type ? null : type
    testResults[type] = null
  }
  
  // ── Load saved integrations ───────────────────────────────
  onMounted(async () => {
    try {
      const res = await api.get('/api/integrations')
      for (const int of res.data) {
        connected[int.type] = int
        if (forms[int.type] && int[int.type]) {
          Object.assign(forms[int.type], int[int.type])
        }
      }
    } catch (e) {
      console.error('Failed to load integrations:', e)
    }
  })
  
  // ── Save ──────────────────────────────────────────────────
  async function saveIntegration(type) {
    saving.value = type
    testResults[type] = null
    try {
      const res = await api.post(`/api/integrations/${type}`, {
        name:    cards.find(c => c.type === type)?.name || type,
        enabled: true,
        [type]:  forms[type],
      })
      connected[type] = res.data.integration
      testResults[type] = { ok: true, message: 'Saved successfully!' }
    } catch (err) {
      testResults[type] = { ok: false, error: err.response?.data?.error || 'Save failed' }
    } finally {
      saving.value = null
    }
  }
  
  // ── Test ──────────────────────────────────────────────────
  async function testConnection(type) {
    // Auto-save first
    await saveIntegration(type)
    testing.value = type
    testResults[type] = null
    try {
      const res = await api.post(`/api/integrations/${type}/test`)
      testResults[type] = { ok: res.data.ok, message: res.data.message }
    } catch (err) {
      testResults[type] = { ok: false, error: err.response?.data?.error || 'Test failed' }
    } finally {
      testing.value = null
    }
  }
  
  // ── Gmail OAuth ──────────────────────────────────────────
  const gmailConnecting = ref(false)
  
  async function startGmailOAuth() {
    gmailConnecting.value = true
    try {
      const res = await api.get('/api/integrations/gmail/oauth/start')
      const { url } = res.data
  
      const popup = window.open(url, 'gmail-oauth',
        'width=600,height=700,left=' + (window.screenX + 200) + ',top=' + (window.screenY + 100)
      )
  
      const handler = async (event) => {
        if (event.data?.type !== 'gmail-oauth-success') return
        window.removeEventListener('message', handler)
        popup?.close()
        const intRes = await api.get('/api/integrations')
        for (const int of intRes.data) connected[int.type] = int
        gmailConnecting.value = false
      }
      window.addEventListener('message', handler)
  
      const poll = setInterval(() => {
        if (popup?.closed) {
          clearInterval(poll)
          window.removeEventListener('message', handler)
          gmailConnecting.value = false
        }
      }, 1000)
    } catch (err) {
      console.error('Gmail OAuth failed:', err)
      gmailConnecting.value = false
    }
  }
  
  // ── Remove ────────────────────────────────────────────────
  async function removeIntegration(type) {
    try {
      await api.delete(`/api/integrations/${type}`)
      delete connected[type]
      Object.keys(forms[type] || {}).forEach(k => forms[type][k] = '')
      expandedType.value = null
      testResults[type] = null
    } catch (e) {
      console.error('Remove failed:', e)
    }
  }
  </script>
  
  <style scoped>
  .integrations-page {
    position: fixed;
    inset: 0;
    left: var(--sidebar-width, 260px);
    background: var(--bg-base);
    z-index: 100;
    overflow-y: auto;
    padding: 32px 40px 60px;
  }
  
  /* ── Header ── */
  .int-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 28px;
  }
  .int-header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .int-back-btn {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1px solid var(--border-default);
    background: var(--bg-surface);
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
  }
  .int-back-btn:hover {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }
  .int-title {
    font-size: 22px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 2px;
  }
  .int-subtitle {
    font-size: 13px;
    color: var(--text-muted);
    margin: 0;
  }
  .int-header-badge {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    padding: 6px 12px;
    border-radius: 20px;
  }
  
  /* ── Search ── */
  .int-search-wrap {
    position: relative;
    margin-bottom: 24px;
    max-width: 360px;
  }
  .int-search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
  }
  .int-search {
    width: 100%;
    padding: 9px 12px 9px 36px;
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: 10px;
    color: var(--text-primary);
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }
  .int-search:focus { border-color: var(--accent); }
  
  /* ── Grid ── */
  .int-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 14px;
  }
  
  /* ── Card ── */
  .int-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: 14px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.2s;
  }
  .int-card:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-sm);
  }
  .int-card.connected {
    border-color: rgba(16, 185, 129, 0.35);
    background: linear-gradient(135deg, var(--bg-surface) 0%, rgba(16,185,129,0.04) 100%);
  }
  .int-card.expanded {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent), var(--shadow-md);
  }
  
  .int-card-top {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
  }
  .int-card-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .int-logo {
    width: 24px;
    height: 24px;
    filter: brightness(0) invert(1);
  }
  .int-emoji { font-size: 22px; }
  .int-card-info { flex: 1; min-width: 0; }
  .int-card-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 2px;
  }
  .int-card-desc {
    font-size: 12px;
    color: var(--text-muted);
  }
  .int-card-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .int-chevron {
    color: var(--text-muted);
    transition: transform 0.2s;
  }
  .int-chevron.rotated { transform: rotate(180deg); }
  
  /* ── Badges ── */
  .badge-connected {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: #10b981;
    font-weight: 500;
  }
  .badge-disconnected {
    font-size: 11px;
    color: var(--text-muted);
  }
  .badge-soon {
    font-size: 10px;
    font-weight: 600;
    background: var(--accent-dim);
    color: var(--accent);
    padding: 2px 8px;
    border-radius: 20px;
  }
  .badge-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
    display: inline-block;
  }
  .badge-dot.green { background: #10b981; }
  
  /* ── Form ── */
  .int-card-form {
    padding: 0 20px 20px;
    border-top: 1px solid var(--border-subtle);
    margin-top: 0;
  }
  .int-field-group {
    margin-bottom: 14px;
  }
  .int-field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 14px;
  }
  .int-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 6px;
  }
  .int-label-opt {
    font-weight: 400;
    text-transform: none;
    color: var(--text-muted);
    letter-spacing: 0;
  }
  .int-help-link {
    font-size: 11px;
    color: var(--accent);
    text-decoration: none;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }
  .int-help-link:hover { text-decoration: underline; }
  .int-input {
    width: 100%;
    padding: 9px 12px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
    font-family: var(--font-mono);
  }
  .int-input:focus { border-color: var(--accent); }
  select.int-input { cursor: pointer; }
  
  /* ── Setup steps ── */
  .int-setup-steps {
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 14px;
  }
  .int-steps-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .int-steps-list {
    margin: 0;
    padding-left: 18px;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.8;
  }
  
  /* ── OAuth block ── */
  .int-oauth-block {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 14px;
  }
  .int-oauth-icon { font-size: 28px; }
  .int-oauth-text { flex: 1; }
  .int-oauth-title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
  .int-oauth-desc { font-size: 12px; color: var(--text-muted); }
  .int-oauth-btn {
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--border-default);
    background: var(--bg-surface);
    color: var(--text-muted);
    font-size: 12px;
    cursor: not-allowed;
  }
  
  /* ── Actions ── */
  .int-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }
  .int-btn {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s;
  }
  .int-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .int-btn-test {
    background: var(--bg-elevated);
    border-color: var(--border-default);
    color: var(--text-primary);
  }
  .int-btn-test:hover:not(:disabled) {
    background: var(--bg-hover);
    border-color: var(--border-strong);
  }
  .int-btn-save {
    background: var(--accent);
    color: white;
  }
  .int-btn-save:hover:not(:disabled) { background: var(--accent-hover); }
  .int-btn-remove {
    background: transparent;
    border-color: rgba(239,68,68,0.3);
    color: #ef4444;
    margin-left: auto;
  }
  .int-btn-remove:hover { background: rgba(239,68,68,0.08); }
  
  /* ── Spinner ── */
  .int-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    display: inline-block;
  }
  .int-btn-test .int-spinner {
    border-color: rgba(0,0,0,0.15);
    border-top-color: var(--text-primary);
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  
  /* ── Test result ── */
  .int-test-result {
    margin-top: 10px;
    padding: 9px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
  }
  .int-test-result.ok {
    background: rgba(16,185,129,0.1);
    color: #10b981;
    border: 1px solid rgba(16,185,129,0.2);
  }
  .int-test-result.fail {
    background: rgba(239,68,68,0.08);
    color: #ef4444;
    border: 1px solid rgba(239,68,68,0.2);
  }
  
  /* ── Transitions ── */
  .int-expand-enter-active,
  .int-expand-leave-active {
    transition: all 0.2s ease;
    overflow: hidden;
  }
  .int-expand-enter-from,
  .int-expand-leave-to {
    opacity: 0;
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
  }
  .int-expand-enter-to,
  .int-expand-leave-from {
    opacity: 1;
    max-height: 600px;
  }
  .fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
  .fade-enter-from, .fade-leave-to { opacity: 0; }
  
  /* ── Light theme ── */
  [data-theme="light"] .int-input {
    background: white;
  }
  [data-theme="light"] .int-setup-steps {
    background: #f8f8fc;
  }
  
  /* ── Gmail OAuth connected state ──────────────────────── */
  .int-oauth-connected {
    padding: 12px 14px;
    background: rgba(34, 197, 94, 0.06);
    border: 1px solid rgba(34, 197, 94, 0.2);
    border-radius: 10px;
    margin-bottom: 4px;
  }
  .int-oauth-connected-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .int-oauth-connected-icon { font-size: 18px; flex-shrink: 0; }
  .int-oauth-connected-info { flex: 1; }
  .int-oauth-connected-title {
    font-size: 11px;
    color: var(--text-muted);
    margin-bottom: 2px;
  }
  .int-oauth-connected-email {
    font-size: 13px;
    font-weight: 600;
    color: #4ade80;
  }
  .int-oauth-reconnect-btn {
    font-size: 11.5px;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.06);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }
  .int-oauth-reconnect-btn:hover {
    background: rgba(255,255,255,0.1);
    color: var(--text-primary);
  }
  
  /* ── Google Sign-in button ─────────────────────────────── */
  .int-oauth-icon-img {
    width: 36px;
    height: 36px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .int-oauth-btn-google {
    background: #fff !important;
    color: #3c4043 !important;
    border: 1px solid #dadce0 !important;
    font-weight: 500 !important;
    font-size: 13px !important;
    padding: 8px 14px !important;
    border-radius: 4px !important;
    display: flex;
    align-items: center;
    white-space: nowrap;
    cursor: pointer;
    transition: box-shadow 0.15s;
  }
  .int-oauth-btn-google:hover:not(:disabled) {
    box-shadow: 0 1px 4px rgba(0,0,0,0.25) !important;
  }
  .int-oauth-btn-google:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .int-oauth-spinner {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid #dadce0;
    border-top-color: #4285F4;
    border-radius: 50%;
    animation: oauth-spin 0.7s linear infinite;
  }
  @keyframes oauth-spin { to { transform: rotate(360deg); } }
  
  /* ── Gmail 2-step setup ────────────────────────────────── */
  .gmail-setup { display: flex; flex-direction: column; gap: 14px; }
  
  .gmail-steps {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }
  .gmail-step {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
    opacity: 0.5;
    transition: opacity 0.2s;
  }
  .gmail-step.active { opacity: 1; color: var(--text-primary); font-weight: 600; }
  .gmail-step.done   { opacity: 1; color: #4ade80; }
  .gmail-step-num {
    width: 20px; height: 20px;
    border-radius: 50%;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; flex-shrink: 0;
  }
  .gmail-step.active .gmail-step-num { background: #6366f1; border-color: #6366f1; color: #fff; }
  .gmail-step.done   .gmail-step-num { background: rgba(74,222,128,0.15); border-color: #4ade80; color: #4ade80; }
  .gmail-step-line { flex: 1; height: 1px; background: rgba(255,255,255,0.08); }
  
  .gmail-help-banner {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    background: rgba(99,102,241,0.08);
    border: 1px solid rgba(99,102,241,0.2);
    border-radius: 8px;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .gmail-help-icon { flex-shrink: 0; font-size: 14px; margin-top: 1px; }
  .gmail-help-link { color: #818cf8; text-decoration: underline; }
  .gmail-help-code {
    font-family: monospace;
    font-size: 11px;
    background: rgba(255,255,255,0.06);
    padding: 1px 5px;
    border-radius: 3px;
    color: #cbd5e1;
    word-break: break-all;
  }
  
  .gmail-creds-form { display: flex; flex-direction: column; gap: 10px; }
  
  .gmail-next-btn {
    margin-top: 4px;
    padding: 9px 18px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    align-self: flex-start;
  }
  .gmail-next-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .gmail-next-btn:not(:disabled):hover { opacity: 0.88; }
  
  .gmail-oauth-step { display: flex; flex-direction: column; gap: 12px; }
  .gmail-oauth-ready {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: rgba(34,197,94,0.06);
    border: 1px solid rgba(34,197,94,0.18);
    border-radius: 8px;
  }
  .gmail-oauth-ready-icon { font-size: 22px; }
  .gmail-oauth-ready-title { font-size: 13px; font-weight: 600; color: #4ade80; }
  .gmail-oauth-ready-desc  { font-size: 12px; color: var(--text-muted); }
  
  .int-oauth-btn-google {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 9px 18px;
    background: #fff;
    color: #3c4043;
    border: 1px solid #dadce0;
    border-radius: 4px;
    font-size: 13.5px;
    font-weight: 500;
    cursor: pointer;
    transition: box-shadow 0.15s;
    align-self: flex-start;
  }
  .int-oauth-btn-google:hover:not(:disabled) { box-shadow: 0 1px 4px rgba(0,0,0,0.25); }
  .int-oauth-btn-google:disabled { opacity: 0.5; cursor: not-allowed; }
  
  .gmail-back-btn {
    font-size: 12px;
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    align-self: flex-start;
    opacity: 0.7;
  }
  .gmail-back-btn:hover { opacity: 1; color: var(--text-primary); }
  </style>