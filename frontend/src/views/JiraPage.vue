<template>
    <div class="jr-root">
  
      <!-- Header -->
      <div class="jr-header">
        <div class="jr-header-left">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#0052CC" d="M11.571 11.513H0a5.218 5.218 0 005.232 5.215h2.13v2.057A5.215 5.215 0 0012.575 24V12.518a1.005 1.005 0 00-1.004-1.005zm5.723-5.756H5.757a5.215 5.215 0 005.215 5.214h2.129v2.058a5.218 5.218 0 005.215 5.214V6.762a1.005 1.005 0 00-1.022-1.005zM23.013 0H11.455a5.215 5.215 0 005.215 5.215h2.129v2.057A5.215 5.215 0 0024.019 12.49V1.005A1.001 1.001 0 0023.013 0z"/>
          </svg>
          <span class="jr-project-name">Jira</span>
          <span class="jr-project-key" v-if="projectKey">/ {{ projectKey }}</span>
        </div>
        <div class="jr-header-tabs">
          <button v-for="t in tabs" :key="t"
            :class="['jr-tab', activeTab === t ? 'active' : '']"
            @click="activeTab = t">{{ t }}</button>
        </div>
        <button class="jr-create-btn" @click="showCreate = true">+ Create</button>
      </div>
  
      <!-- Board view -->
      <div v-if="activeTab === 'Board'" class="jr-board">
        <div v-if="loading" class="jr-loading">
          <span class="jr-spinner"></span> Loading board…
        </div>
        <template v-else>
          <div v-for="col in columns" :key="col.status" class="jr-column">
            <div class="jr-col-header">
              <span class="jr-col-title">{{ col.status }}</span>
              <span class="jr-col-count">{{ col.tickets.length }}</span>
            </div>
            <div class="jr-col-body">
              <div v-if="col.tickets.length === 0" class="jr-col-empty">No tickets</div>
              <div
                v-for="ticket in col.tickets"
                :key="ticket.key"
                class="jr-ticket-card"
                @click="openTicket(ticket)">
                <div class="jr-ticket-top">
                  <span class="jr-ticket-key">{{ ticket.key }}</span>
                  <span class="jr-priority-dot" :class="priorityCls(ticket.priority)"></span>
                </div>
                <div class="jr-ticket-title">{{ ticket.title }}</div>
                <div class="jr-ticket-footer">
                  <div v-if="ticket.assignee" class="jr-assignee-chip"
                    :style="{ background: avatarColor(ticket.assignee) }">
                    {{ avatarInitials(ticket.assignee) }}
                  </div>
                  <span v-if="ticket.overdue" class="jr-overdue-badge">⚠️ {{ ticket.daysOverdue }}d</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
  
      <!-- Backlog view -->
      <div v-else-if="activeTab === 'Backlog'" class="jr-backlog">
        <div v-if="loading" class="jr-loading"><span class="jr-spinner"></span></div>
        <div v-else v-for="ticket in allTickets" :key="ticket.key"
          class="jr-backlog-row" @click="openTicket(ticket)">
          <span class="jr-priority-dot" :class="priorityCls(ticket.priority)"></span>
          <span class="jr-ticket-key">{{ ticket.key }}</span>
          <span class="jr-backlog-title">{{ ticket.title }}</span>
          <span class="jr-ticket-status-badge" :class="statusCls(ticket.status)">{{ ticket.status }}</span>
          <div v-if="ticket.assignee" class="jr-assignee-chip sm" :style="{ background: avatarColor(ticket.assignee) }">
            {{ avatarInitials(ticket.assignee) }}
          </div>
        </div>
      </div>
  
      <!-- Ticket detail slide-over -->
      <transition name="slide-over">
        <div v-if="selectedTicket" class="jr-slideover-backdrop" @click.self="selectedTicket = null">
          <div class="jr-slideover">
            <div class="jr-slideover-header">
              <a :href="jiraUrl(selectedTicket.key)" target="_blank" class="jr-slideover-key">
                {{ selectedTicket.key }} ↗
              </a>
              <button class="jr-slideover-close" @click="selectedTicket = null">✕</button>
            </div>
            <div class="jr-slideover-body">
              <h2 class="jr-slideover-title">{{ selectedTicket.title }}</h2>
              <div class="jr-slideover-meta">
                <div class="jr-meta-row">
                  <span class="jr-meta-label">Status</span>
                  <span class="jr-ticket-status-badge" :class="statusCls(selectedTicket.status)">{{ selectedTicket.status }}</span>
                </div>
                <div class="jr-meta-row">
                  <span class="jr-meta-label">Priority</span>
                  <span class="jr-priority-text" :class="priorityCls(selectedTicket.priority)">{{ selectedTicket.priority }}</span>
                </div>
                <div class="jr-meta-row" v-if="selectedTicket.assignee">
                  <span class="jr-meta-label">Assignee</span>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div class="jr-assignee-chip" :style="{ background: avatarColor(selectedTicket.assignee) }">
                      {{ avatarInitials(selectedTicket.assignee) }}
                    </div>
                    <span style="font-size:13px;color:var(--text-primary)">{{ selectedTicket.assignee }}</span>
                  </div>
                </div>
                <div class="jr-meta-row" v-if="selectedTicket.dueDate">
                  <span class="jr-meta-label">Due</span>
                  <span :class="selectedTicket.overdue ? 'jr-due-overdue' : 'jr-due-ok'">
                    {{ selectedTicket.overdue ? `⚠️ ${selectedTicket.daysOverdue}d overdue` : selectedTicket.dueDate }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </transition>
  
      <!-- Create ticket modal -->
      <div v-if="showCreate" class="jr-modal-backdrop" @click.self="showCreate = false">
        <div class="jr-modal">
          <div class="jr-modal-header">
            <span>Create Ticket</span>
            <button @click="showCreate = false">✕</button>
          </div>
          <input v-model="newTitle" class="jr-modal-input" placeholder="Title" />
          <select v-model="newStatus" class="jr-modal-input">
            <option v-for="s in statusList" :key="s">{{ s }}</option>
          </select>
          <select v-model="newPriority" class="jr-modal-input">
            <option>highest</option><option>high</option><option>medium</option><option>low</option>
          </select>
          <div class="jr-modal-footer">
            <button class="jr-create-btn" :disabled="!newTitle || creating" @click="createTicket">
              <span v-if="creating" class="jr-spinner sm"></span>
              <span v-else>Create</span>
            </button>
          </div>
        </div>
      </div>
  
    </div>
  </template>
  
  <script setup>
  import { ref, computed, onMounted } from 'vue'
  import api from '../services/api'
  
  defineEmits(['close'])
  
  const tabs        = ['Board', 'Backlog', 'Sprints']
  const activeTab   = ref('Board')
  const loading     = ref(false)
  const allTickets  = ref([])
  const selectedTicket = ref(null)
  const showCreate  = ref(false)
  const newTitle    = ref('')
  const newStatus   = ref('To Do')
  const newPriority = ref('medium')
  const creating    = ref(false)
  const projectKey  = ref('')
  
  const statusList   = ['To Do', 'In Progress', 'In Review', 'Done']
  
  const columns = computed(() => {
    return statusList.map(s => ({
      status:  s,
      tickets: allTickets.value.filter(t =>
        t.status?.toLowerCase() === s.toLowerCase() ||
        (s === 'In Progress' && t.status?.toLowerCase().includes('progress')) ||
        (s === 'In Review'   && (t.status?.toLowerCase().includes('review') || t.status?.toLowerCase().includes('testing'))) ||
        (s === 'Done'        && (t.status?.toLowerCase().includes('done') || t.status?.toLowerCase().includes('closed')))
      )
    }))
  })
  
  async function loadBoard() {
    loading.value = true
    try {
      const res = await api.get('/api/jira/board')
      allTickets.value = res.data.tickets || []
      projectKey.value = res.data.projectKey || ''
    } catch (e) {
      console.error('Jira board failed:', e.message)
      allTickets.value = []
    } finally {
      loading.value = false
    }
  }
  
  async function createTicket() {
    if (!newTitle.value.trim()) return
    creating.value = true
    try {
      await api.post('/api/jira/ticket', {
        title:    newTitle.value,
        status:   newStatus.value,
        priority: newPriority.value,
      })
      showCreate.value  = false
      newTitle.value    = ''
      await loadBoard()
    } catch (e) { console.error('Create ticket failed:', e.message) }
    finally { creating.value = false }
  }
  
  function openTicket(ticket) { selectedTicket.value = ticket }
  
  function jiraUrl(key) {
    const domain = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_JIRA_DOMAIN) || 'yourcompany.atlassian.net'
    return `https://${domain}/browse/${key}`
  }
  
  function avatarInitials(name) {
    if (!name) return '?'
    const p = name.split(/\s+/)
    return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0,2).toUpperCase()
  }
  const COLORS = ['#0052CC','#36B37E','#FF5630','#6554C0','#00B8D9','#FF8B00']
  function avatarColor(name) {
    if (!name) return '#0052CC'
    let h = 0
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
    return COLORS[Math.abs(h) % COLORS.length]
  }
  function priorityCls(p) {
    const v = (p || '').toLowerCase()
    if (v === 'highest' || v === 'critical') return 'p-critical'
    if (v === 'high')   return 'p-high'
    if (v === 'medium') return 'p-medium'
    return 'p-low'
  }
  function statusCls(s) {
    const v = (s || '').toLowerCase()
    if (v.includes('done') || v.includes('closed')) return 's-done'
    if (v.includes('progress')) return 's-inprog'
    if (v.includes('review') || v.includes('testing')) return 's-review'
    return 's-todo'
  }
  
  onMounted(loadBoard)
  </script>
  
  <style scoped>
  .jr-root { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-base); }
  
  .jr-header {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 20px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }
  .jr-header-left { display: flex; align-items: center; gap: 8px; }
  .jr-project-name { font-size: 16px; font-weight: 700; color: var(--text-primary); }
  .jr-project-key { font-size: 14px; color: var(--text-muted); }
  .jr-header-tabs { display: flex; gap: 2px; margin-left: 16px; }
  .jr-tab {
    padding: 6px 14px; background: none;
    border: none; border-radius: 6px;
    color: var(--text-secondary); font-size: 13px;
    cursor: pointer; transition: all 0.12s;
  }
  .jr-tab:hover { background: rgba(255,255,255,0.05); }
  .jr-tab.active { background: rgba(0,82,204,0.15); color: #4C9AFF; font-weight: 600; }
  .jr-create-btn {
    margin-left: auto; padding: 7px 16px;
    background: #0052CC; border: none; border-radius: 6px;
    color: white; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: opacity 0.15s;
  }
  .jr-create-btn:hover:not(:disabled) { opacity: 0.85; }
  .jr-create-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  
  /* ── Board ── */
  .jr-board {
    flex: 1; display: flex; gap: 0; overflow-x: auto; padding: 20px;
    align-items: flex-start; scrollbar-width: thin;
  }
  .jr-column {
    min-width: 240px; width: 240px; flex-shrink: 0;
    margin-right: 14px;
  }
  .jr-col-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; margin-bottom: 10px;
  }
  .jr-col-title { font-size: 11.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .jr-col-count {
    background: rgba(255,255,255,0.08); color: var(--text-muted);
    font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 10px;
  }
  .jr-col-body { display: flex; flex-direction: column; gap: 8px; }
  .jr-col-empty { font-size: 12px; color: var(--text-muted); padding: 12px; text-align: center; }
  
  .jr-ticket-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .jr-ticket-card:hover { border-color: rgba(0,82,204,0.3); background: var(--bg-elevated); transform: translateY(-1px); }
  .jr-ticket-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .jr-ticket-key { font-size: 11px; font-weight: 700; color: #4C9AFF; }
  .jr-ticket-title { font-size: 13px; color: var(--text-primary); line-height: 1.4; margin-bottom: 10px; }
  .jr-ticket-footer { display: flex; align-items: center; gap: 8px; }
  .jr-assignee-chip {
    width: 24px; height: 24px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; color: white;
  }
  .jr-assignee-chip.sm { width: 20px; height: 20px; font-size: 8px; }
  .jr-overdue-badge { font-size: 11px; color: #ef4444; font-weight: 600; }
  
  /* ── Backlog ── */
  .jr-backlog { flex: 1; overflow-y: auto; padding: 16px 20px; scrollbar-width: thin; }
  .jr-backlog-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; border-radius: 8px;
    cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.025);
    transition: background 0.1s;
  }
  .jr-backlog-row:hover { background: rgba(255,255,255,0.03); }
  .jr-backlog-title { flex: 1; font-size: 13px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  
  /* ── Priority dots ── */
  .jr-priority-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .p-critical { background: #ef4444; }
  .p-high     { background: #f97316; }
  .p-medium   { background: #eab308; }
  .p-low      { background: #22c55e; }
  
  /* ── Status badges ── */
  .jr-ticket-status-badge {
    font-size: 10.5px; font-weight: 600; padding: 2px 8px;
    border-radius: 4px; white-space: nowrap;
  }
  .s-todo   { background: rgba(148,163,184,0.15); color: #94a3b8; }
  .s-inprog { background: rgba(59,130,246,0.15);  color: #60a5fa; }
  .s-review { background: rgba(168,85,247,0.15);  color: #c084fc; }
  .s-done   { background: rgba(34,197,94,0.15);   color: #4ade80; }
  
  /* ── Slide-over ── */
  .jr-slideover-backdrop {
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.4);
    display: flex; justify-content: flex-end;
    z-index: 40;
  }
  .jr-slideover {
    width: 380px; height: 100%;
    background: var(--bg-surface);
    border-left: 1px solid var(--border-default);
    display: flex; flex-direction: column;
    overflow-y: auto;
  }
  .jr-slideover-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .jr-slideover-key { font-size: 13px; font-weight: 700; color: #4C9AFF; text-decoration: none; }
  .jr-slideover-key:hover { text-decoration: underline; }
  .jr-slideover-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; }
  .jr-slideover-body { padding: 20px; }
  .jr-slideover-title { font-size: 16px; font-weight: 700; color: var(--text-primary); margin: 0 0 20px; line-height: 1.4; }
  .jr-slideover-meta { display: flex; flex-direction: column; gap: 14px; }
  .jr-meta-row { display: flex; align-items: center; gap: 16px; }
  .jr-meta-label { font-size: 12px; color: var(--text-muted); width: 70px; flex-shrink: 0; }
  .jr-priority-text { font-size: 13px; font-weight: 600; }
  .jr-due-overdue { font-size: 13px; color: #ef4444; }
  .jr-due-ok { font-size: 13px; color: var(--text-primary); }
  
  /* ── Modal ── */
  .jr-modal-backdrop {
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    z-index: 50;
  }
  .jr-modal {
    background: var(--bg-surface); border: 1px solid var(--border-default);
    border-radius: 12px; width: 440px; overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  .jr-modal-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 18px; border-bottom: 1px solid var(--border-subtle);
    font-size: 14px; font-weight: 700; color: var(--text-primary);
  }
  .jr-modal-header button { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; }
  .jr-modal-input {
    width: 100%; padding: 11px 16px;
    background: transparent; border: none;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-primary); font-size: 13px;
    outline: none; box-sizing: border-box; appearance: none;
  }
  .jr-modal-input::placeholder { color: var(--text-muted); }
  .jr-modal-footer { padding: 14px 16px; display: flex; justify-content: flex-end; }
  
  /* ── Loading ── */
  .jr-loading { display: flex; align-items: center; justify-content: center; gap: 10px; flex: 1; color: var(--text-muted); font-size: 13px; }
  .jr-spinner {
    display: inline-block; width: 18px; height: 18px;
    border: 2px solid rgba(0,82,204,0.2); border-top-color: #0052CC;
    border-radius: 50%; animation: spin 0.7s linear infinite;
  }
  .jr-spinner.sm { width: 14px; height: 14px; border-width: 1.5px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  
  /* Slide-over transition */
  .slide-over-enter-active, .slide-over-leave-active { transition: all 0.2s ease; }
  .slide-over-enter-from .jr-slideover, .slide-over-leave-to .jr-slideover { transform: translateX(100%); }
  </style>