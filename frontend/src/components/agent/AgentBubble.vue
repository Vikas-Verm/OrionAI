<template>
    <div class="agent-bubble">
  
      <!-- ── Step Progress (always visible while running or done) ── -->
      <div v-if="msg.steps && msg.steps.length" class="agent-steps">
        <div
          v-for="(step, i) in msg.steps"
          :key="i"
          class="agent-step"
          :class="step.status"
        >
          <!-- icon + spinner -->
          <div class="step-icon-wrap">
            <span v-if="step.status === 'running'" class="step-spinner"></span>
            <span v-else-if="step.status === 'done'" class="step-check">✓</span>
            <span v-else-if="step.status === 'error'" class="step-err">✕</span>
            <span v-else class="step-dot"></span>
          </div>
  
          <!-- label + summary -->
          <div class="step-body">
            <span class="step-label">{{ step.label || step.tool }}</span>
            <span v-if="step.status === 'running'" class="step-running-text">Working…</span>
            <span v-else-if="step.status === 'done' && step.summary" class="step-summary-text">{{ step.summary }}</span>
            <span v-else-if="step.status === 'error'" class="step-error-text">{{ step.error }}</span>
          </div>
        </div>
      </div>
  
      <!-- ── Rich Results ── -->
      <template v-if="msg.agentDone">

        <!-- ══════════════════════════════════════════
             GMAIL EMAIL CARDS
             ══════════════════════════════════════════ -->
        <template v-if="emailSteps.length">
          <div v-for="step in emailSteps" :key="step.tool + '_emails'" class="email-section">

            <!-- Header -->
            <div class="email-section-header">
              <span class="email-section-title">
                <template v-if="step.tool === 'gmail_search_emails'">🔍 "{{ step.emailQuery }}"</template>
                <template v-else-if="step.tool === 'gmail_get_email'">📧 Email</template>
                <template v-else>📬 Inbox</template>
              </span>
              <span class="email-badge">{{ step.richEmails.length }} email{{ step.richEmails.length !== 1 ? 's' : '' }}</span>
              <span v-if="unreadCount(step)" class="email-badge email-badge-unread">🔵 {{ unreadCount(step) }} unread</span>
            </div>

            <!-- Cards -->
            <div
              v-for="email in step.richEmails"
              :key="email.id"
              class="email-card"
              :class="{ 'email-card-unread': email.unread }"
            >
              <!-- Main clickable row -->
              <div class="email-card-main" @click="toggleExpand(email.id)">
                <div class="email-card-left">
                  <span class="email-unread-dot" :class="email.unread ? 'dot-on' : 'dot-off'"></span>
                  <div class="email-avatar">{{ avatarFrom(email.from) }}</div>
                </div>
                <div class="email-card-body">
                  <div class="email-card-top">
                    <span class="email-from">{{ senderName(email.from) }}</span>
                    <span class="email-date">{{ email.date }}</span>
                  </div>
                  <div class="email-subject" :class="{ 'email-subject-bold': email.unread }">{{ email.subject }}</div>
                  <div v-if="expandedId !== email.id" class="email-snippet">{{ email.snippet }}</div>
                </div>
                <div class="email-actions">
                  <a
                    :href="`https://mail.google.com/mail/u/0/#inbox/${email.id}`"
                    target="_blank"
                    rel="noopener"
                    class="email-action-btn"
                    title="Open in Gmail"
                    @click.stop
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                  <button
                    class="email-action-btn"
                    :class="{ 'email-action-reply-active': replyingTo === email.id }"
                    title="Reply"
                    @click.stop="toggleReply(email.id)"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <polyline points="9 17 4 12 9 7"/>
                      <path d="M20 18v-2a4 4 0 00-4-4H4"/>
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Expanded full body -->
              <div v-if="expandedId === email.id" class="email-body-expanded">
                <div v-if="email.body" class="email-body-text">{{ email.body }}</div>
                <div v-else class="email-body-empty">No full body — try <em>"Open email about {{ email.subject }}"</em></div>
              </div>

              <!-- Inline reply box -->
              <div v-if="replyingTo === email.id" class="email-reply-box">
                <div class="email-reply-header">
                  <span class="email-reply-label">↩ Reply to <strong>{{ senderName(email.from) }}</strong></span>
                  <button class="email-reply-close" @click.stop="replyingTo = null">✕</button>
                </div>
                <textarea
                  v-model="replyDrafts[email.id]"
                  class="email-reply-textarea"
                  placeholder="Write your reply…"
                  rows="4"
                  @click.stop
                  @keydown.meta.enter.stop="sendReply(email)"
                ></textarea>
                <div class="email-reply-footer">
                  <button
                    class="email-reply-send"
                    :disabled="sendingId === email.id || !replyDrafts[email.id]?.trim()"
                    @click.stop="sendReply(email)"
                  >
                    <span v-if="sendingId === email.id" class="reply-spinner"></span>
                    <span v-else>↩ Send Reply</span>
                  </button>
                  <span class="reply-hint">⌘↵ to send</span>
                  <span v-if="sentId === email.id" class="reply-sent">✅ Sent!</span>
                </div>
              </div>

            </div><!-- /email-card -->
          </div><!-- /email-section -->
        </template>

        <!-- ══════════════════════════════════════════
             JIRA TICKET CARDS (unchanged)
             ══════════════════════════════════════════ -->

        <!-- Single-user or filtered ticket list -->
        <template v-else-if="ticketSteps.length && !hasByAssignee">
          <div v-for="step in ticketSteps" :key="step.tool">
            <div class="ticket-header">
              <span class="ticket-header-title">{{ ticketHeaderText(step) }}</span>
              <span v-if="overdueCount(step)" class="ticket-overdue-badge">⚠️ {{ overdueCount(step) }} overdue</span>
            </div>
            <div class="ticket-list">
              <a
                v-for="ticket in step.richTickets"
                :key="ticket.key"
                :href="jiraUrl(ticket.key, step.jiraDomain)"
                target="_blank"
                rel="noopener"
                class="ticket-card"
                :class="{ overdue: ticket.overdue }"
              >
                <div class="ticket-card-top">
                  <span class="ticket-priority-dot" :class="priorityClass(ticket.priority)"></span>
                  <span class="ticket-key">{{ ticket.key }}</span>
                  <span class="ticket-status" :class="statusClass(ticket.status)">{{ ticket.status }}</span>
                  <span class="ticket-open-icon">↗</span>
                </div>
                <div class="ticket-title">{{ ticket.title }}</div>
                <div class="ticket-meta">
                  <span v-if="ticket.dueDate" :class="ticket.overdue ? 'ticket-due-overdue' : 'ticket-due'">
                    {{ ticket.overdue ? `⚠️ ${ticket.daysOverdue}d overdue` : `Due ${ticket.dueDate}` }}
                  </span>
                  <span v-else class="ticket-no-due">No due date</span>
                  <span v-if="ticket.assignee" class="ticket-assignee">· {{ ticket.assignee }}</span>
                </div>
              </a>
            </div>
          </div>
        </template>
  
        <!-- All-users grouped view -->
        <template v-else-if="ticketSteps.length && hasByAssignee">
          <div v-for="step in ticketSteps" :key="step.tool">
            <div class="ticket-header">
              <span class="ticket-header-title">All open tickets</span>
              <span v-if="step.richTickets?.length" class="ticket-count-badge">{{ step.richTickets.length }} total</span>
            </div>
            <div v-for="(pts, person) in step.byAssignee" :key="person" class="assignee-group">
              <div class="assignee-group-header">
                👤 {{ person }} <span class="assignee-count">{{ pts.length }} ticket{{ pts.length !== 1 ? 's' : '' }}</span>
              </div>
              <div class="ticket-list">
                <a
                  v-for="ticket in pts"
                  :key="ticket.key"
                  :href="jiraUrl(ticket.key, step.jiraDomain)"
                  target="_blank"
                  rel="noopener"
                  class="ticket-card"
                  :class="{ overdue: ticket.overdue }"
                >
                  <div class="ticket-card-top">
                    <span class="ticket-priority-dot" :class="priorityClass(ticket.priority)"></span>
                    <span class="ticket-key">{{ ticket.key }}</span>
                    <span class="ticket-status" :class="statusClass(ticket.status)">{{ ticket.status }}</span>
                    <span class="ticket-open-icon">↗</span>
                  </div>
                  <div class="ticket-title">{{ ticket.title }}</div>
                  <div class="ticket-meta">
                    <span v-if="ticket.dueDate" :class="ticket.overdue ? 'ticket-due-overdue' : 'ticket-due'">
                      {{ ticket.overdue ? `⚠️ ${ticket.daysOverdue}d overdue` : `Due ${ticket.dueDate}` }}
                    </span>
                    <span v-else class="ticket-no-due">No due date</span>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </template>
  
        <!-- Fallback: plain text for non-ticket results -->
        <div v-else-if="msg.content" class="agent-plain-content">
          <p v-for="(line, i) in contentLines" :key="i" :class="{ 'mt-2': i > 0 && line === '' }">
            {{ line }}
          </p>
        </div>
  
      </template>
  
      <!-- ── Loading placeholder while first step hasn't started ── -->
      <div v-else-if="!msg.agentDone && allPending" class="agent-loading">
        <span class="loading-dots"><span></span><span></span><span></span></span>
        <span>Starting…</span>
      </div>
  
    </div>
  </template>
  
  <script setup>
  import { computed, ref, reactive } from 'vue'
  
  const props = defineProps({
    msg: { type: Object, required: true }
  })
  
  // ── Jira ───────────────────────────────────────────────────
  const JIRA_TOOLS = ['jira_my_tickets', 'jira_get_backlog', 'jira_get_overdue', 'jira_sprint_summary']
  
  const ticketSteps = computed(() =>
    (props.msg.steps || []).filter(s => JIRA_TOOLS.includes(s.tool) && s.richTickets?.length)
  )
  const hasByAssignee = computed(() =>
    ticketSteps.value.some(s => s.byAssignee && Object.keys(s.byAssignee).length > 0)
  )
  const allPending = computed(() =>
    (props.msg.steps || []).every(s => s.status === 'pending')
  )
  const contentLines = computed(() => (props.msg.content || '').split('\n'))
  
  function jiraUrl(key, domain) {
    const d = domain || 'poshn-co.atlassian.net'
    return `https://${d}/browse/${key}`
  }
  function overdueCount(step) {
    return (step.richTickets || []).filter(t => t.overdue).length
  }
  function ticketHeaderText(step) {
    const label = step.richTickets?.[0]?.assignee || 'Tickets'
    const count = step.richTickets?.length || 0
    return `${label}'s open tickets — ${count} total`
  }
  function priorityClass(priority) {
    const p = (priority || '').toLowerCase()
    if (p === 'highest' || p === 'critical') return 'priority-critical'
    if (p === 'high')   return 'priority-high'
    if (p === 'medium') return 'priority-medium'
    if (p === 'low' || p === 'lowest') return 'priority-low'
    return 'priority-none'
  }
  function statusClass(status) {
    const s = (status || '').toLowerCase()
    if (s.includes('done') || s.includes('closed')) return 'status-done'
    if (s.includes('progress') || s.includes('review')) return 'status-inprogress'
    if (s.includes('testing')) return 'status-testing'
    return 'status-todo'
  }

  // ── Gmail ──────────────────────────────────────────────────
  const GMAIL_TOOLS = ['gmail_get_inbox', 'gmail_search_emails', 'gmail_get_email']

  const emailSteps = computed(() =>
    (props.msg.steps || []).filter(s => GMAIL_TOOLS.includes(s.tool) && s.richEmails?.length)
  )

  const expandedId  = ref(null)
  const replyingTo  = ref(null)
  const replyDrafts = reactive({})
  const sendingId   = ref(null)
  const sentId      = ref(null)

  function unreadCount(step) {
    return (step.richEmails || []).filter(e => e.unread).length
  }
  function toggleExpand(id) {
    expandedId.value = expandedId.value === id ? null : id
  }
  function toggleReply(id) {
    replyingTo.value = replyingTo.value === id ? null : id
    if (!replyDrafts[id]) replyDrafts[id] = ''
  }
  function avatarFrom(from) {
    if (!from) return '?'
    const name = from.match(/^([^<]+)/)?.[1]?.trim() || from
    return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  }
  function senderName(from) {
    if (!from) return 'Unknown'
    const m = from.match(/^([^<]+)</)
    if (m) return m[1].trim()
    return from.match(/([^@<\s]+)@/)?.[1] || from
  }
  async function sendReply(email) {
    const body = replyDrafts[email.id]?.trim()
    if (!body || sendingId.value) return
    sendingId.value = email.id
    sentId.value    = null
    try {
      const { default: axios } = await import('axios')
      const token = localStorage.getItem('token')
      await axios.post('/api/agent/gmail-reply', {
        threadId:  email.threadId,
        messageId: email.id,
        replyTo:   email.from,
        subject:   email.subject,
        body,
      }, { headers: { Authorization: `Bearer ${token}` } })
      sentId.value          = email.id
      replyingTo.value      = null
      replyDrafts[email.id] = ''
      setTimeout(() => { sentId.value = null }, 3000)
    } catch (err) {
      console.error('Reply failed:', err)
    } finally {
      sendingId.value = null
    }
  }
  </script>
  
  <style scoped>
  /* ── Bubble shell ─────────────────────────────────────── */
  .agent-bubble {
    font-size: 13.5px;
    line-height: 1.5;
    color: #e2e8f0;
  }
  
  /* ── Steps ────────────────────────────────────────────── */
  .agent-steps {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }
  .agent-step {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    transition: background 0.2s;
  }
  .agent-step.running { background: rgba(99,102,241,0.12); border-color: rgba(99,102,241,0.3); }
  .agent-step.done    { background: rgba(34,197,94,0.07);  border-color: rgba(34,197,94,0.2); }
  .agent-step.error   { background: rgba(239,68,68,0.08);  border-color: rgba(239,68,68,0.25); }
  
  .step-icon-wrap { flex-shrink: 0; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
  .step-spinner { display: block; width: 14px; height: 14px; border: 2px solid rgba(99,102,241,0.3); border-top-color: #818cf8; border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .step-check { color: #4ade80; font-size: 13px; font-weight: 700; }
  .step-err   { color: #f87171; font-size: 13px; font-weight: 700; }
  .step-dot   { display: block; width: 6px; height: 6px; border-radius: 50%; background: #475569; }
  .step-body         { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .step-label        { font-weight: 600; font-size: 12.5px; color: #cbd5e1; }
  .step-running-text { font-size: 11.5px; color: #818cf8; }
  .step-summary-text { font-size: 11.5px; color: #64748b; }
  .step-error-text   { font-size: 11.5px; color: #f87171; }

  /* ══════════════════════════════════════════════════════
     EMAIL CARDS
     ══════════════════════════════════════════════════════ */
  .email-section { display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px; }

  .email-section-header {
    display: flex; align-items: center; gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    flex-wrap: wrap;
  }
  .email-section-title { font-size: 12px; font-weight: 700; color: #64748b; flex: 1; }
  .email-badge {
    font-size: 10.5px; padding: 2px 8px; border-radius: 99px; font-weight: 600;
    background: rgba(99,102,241,0.14); color: #818cf8;
    border: 1px solid rgba(99,102,241,0.22);
  }
  .email-badge-unread { background: rgba(99,102,241,0.08); color: #a5b4fc; border-color: rgba(99,102,241,0.18); }

  .email-card {
    border-radius: 10px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    overflow: hidden;
    transition: border-color 0.15s, background 0.15s;
    cursor: pointer;
  }
  .email-card:hover        { background: rgba(255,255,255,0.055); border-color: rgba(255,255,255,0.13); }
  .email-card-unread       { border-left: 3px solid #6366f1; background: rgba(99,102,241,0.04); }
  .email-card-unread:hover { background: rgba(99,102,241,0.08); }

  .email-card-main { display: flex; align-items: flex-start; gap: 10px; padding: 11px 12px; }
  .email-card-left { display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0; padding-top: 2px; }

  .email-unread-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .dot-on  { background: #6366f1; }
  .dot-off { background: transparent; border: 1px solid rgba(255,255,255,0.12); }

  .email-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: #fff; font-size: 11px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; user-select: none;
  }

  .email-card-body { flex: 1; min-width: 0; }
  .email-card-top  { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 3px; }
  .email-from      { font-size: 12.5px; font-weight: 600; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
  .email-date      { font-size: 11px; color: #64748b; white-space: nowrap; flex-shrink: 0; }

  .email-subject { font-size: 13px; color: #e2e8f0; opacity: 0.75; margin-bottom: 3px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .email-subject-bold { font-weight: 700; opacity: 1; }
  .email-snippet  { font-size: 11.5px; color: #64748b; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

  .email-actions { display: flex; flex-direction: column; gap: 5px; flex-shrink: 0; opacity: 0.3; transition: opacity 0.15s; }
  .email-card:hover .email-actions { opacity: 1; }

  .email-action-btn {
    width: 28px; height: 28px; border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04);
    color: #94a3b8; cursor: pointer; transition: all 0.15s;
    text-decoration: none; flex-shrink: 0;
  }
  .email-action-btn:hover         { background: rgba(99,102,241,0.18); color: #818cf8; border-color: rgba(99,102,241,0.4); }
  .email-action-reply-active      { background: rgba(34,197,94,0.15) !important; color: #4ade80 !important; border-color: rgba(34,197,94,0.35) !important; }

  .email-body-expanded { border-top: 1px solid rgba(255,255,255,0.06); padding: 12px 14px; background: rgba(0,0,0,0.15); }
  .email-body-text     { font-size: 12.5px; color: #e2e8f0; opacity: 0.85; line-height: 1.7; white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow-y: auto; }
  .email-body-empty    { font-size: 12px; color: #64748b; font-style: italic; }

  .email-reply-box    { border-top: 1px solid rgba(99,102,241,0.2); background: rgba(99,102,241,0.04); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
  .email-reply-header { display: flex; align-items: center; justify-content: space-between; }
  .email-reply-label  { font-size: 12px; color: #94a3b8; }
  .email-reply-label strong { color: #e2e8f0; }
  .email-reply-close  { background: none; border: none; color: #64748b; cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 4px; transition: color 0.15s; }
  .email-reply-close:hover { color: #e2e8f0; background: rgba(255,255,255,0.06); }

  .email-reply-textarea {
    width: 100%; box-sizing: border-box;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(99,102,241,0.25); border-radius: 8px;
    color: #e2e8f0; font-size: 13px; padding: 10px 12px;
    resize: vertical; font-family: inherit; line-height: 1.5;
    outline: none; min-height: 88px; transition: border-color 0.15s;
  }
  .email-reply-textarea:focus       { border-color: #6366f1; }
  .email-reply-textarea::placeholder { color: rgba(148,163,184,0.4); }

  .email-reply-footer { display: flex; align-items: center; gap: 10px; }
  .email-reply-send {
    padding: 7px 16px; background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: #fff; border: none; border-radius: 7px;
    font-size: 12.5px; font-weight: 600; cursor: pointer;
    transition: opacity 0.15s; display: flex; align-items: center; gap: 6px;
  }
  .email-reply-send:hover:not(:disabled) { opacity: 0.85; }
  .email-reply-send:disabled { opacity: 0.4; cursor: not-allowed; }
  .reply-hint   { font-size: 11px; color: rgba(148,163,184,0.35); }
  .reply-sent   { font-size: 12px; color: #4ade80; font-weight: 600; }
  .reply-spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }

  /* ══════════════════════════════════════════════════════
     JIRA TICKET CARDS (unchanged from original)
     ══════════════════════════════════════════════════════ */
  .ticket-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .ticket-header-title  { font-weight: 700; font-size: 13px; color: #94a3b8; }
  .ticket-overdue-badge { font-size: 11px; background: rgba(251,191,36,0.15); color: #fbbf24; padding: 2px 7px; border-radius: 99px; border: 1px solid rgba(251,191,36,0.25); }
  .ticket-count-badge   { font-size: 11px; background: rgba(99,102,241,0.15); color: #818cf8; padding: 2px 7px; border-radius: 99px; }
  
  .ticket-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
  
  .ticket-card {
    display: block;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    text-decoration: none;
    color: inherit;
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
    cursor: pointer;
  }
  .ticket-card:hover { background: rgba(99,102,241,0.1); border-color: rgba(99,102,241,0.35); transform: translateY(-1px); }
  .ticket-card.overdue { border-left: 3px solid #fbbf24; }
  .ticket-card-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  
  .ticket-priority-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .priority-critical { background: #ef4444; }
  .priority-high     { background: #f97316; }
  .priority-medium   { background: #eab308; }
  .priority-low      { background: #22c55e; }
  .priority-none     { background: #475569; }
  
  .ticket-key    { font-size: 11.5px; font-weight: 700; color: #818cf8; font-family: 'SF Mono', 'Fira Code', monospace; letter-spacing: 0.3px; }
  .ticket-status { font-size: 10.5px; padding: 1px 6px; border-radius: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }
  .status-done       { background: rgba(34,197,94,0.15);   color: #4ade80; }
  .status-inprogress { background: rgba(59,130,246,0.15);  color: #60a5fa; }
  .status-testing    { background: rgba(168,85,247,0.15);  color: #c084fc; }
  .status-todo       { background: rgba(100,116,139,0.15); color: #94a3b8; }
  
  .ticket-open-icon { margin-left: auto; font-size: 13px; color: rgba(148,163,184,0.4); transition: color 0.15s; }
  .ticket-card:hover .ticket-open-icon { color: #818cf8; }
  
  .ticket-title { font-size: 13px; font-weight: 500; color: #e2e8f0; line-height: 1.4; margin-bottom: 5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .ticket-meta { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11.5px; }
  .ticket-due         { color: #64748b; }
  .ticket-due-overdue { color: #fbbf24; font-weight: 600; }
  .ticket-no-due      { color: #334155; }
  .ticket-assignee    { color: #475569; }
  
  .assignee-group        { margin-bottom: 16px; }
  .assignee-group-header { font-size: 12.5px; font-weight: 700; color: #94a3b8; margin-bottom: 6px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; gap: 6px; }
  .assignee-count        { font-weight: 400; color: #475569; font-size: 11.5px; }
  
  .agent-plain-content { font-size: 13.5px; color: #cbd5e1; white-space: pre-wrap; line-height: 1.6; }
  .agent-plain-content p:empty { height: 8px; }
  
  .agent-loading { display: flex; align-items: center; gap: 8px; color: #64748b; font-size: 13px; padding: 4px 0; }
  .loading-dots  { display: flex; gap: 3px; }
  .loading-dots span { display: block; width: 5px; height: 5px; border-radius: 50%; background: #475569; animation: bounce 1.2s infinite; }
  .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
  .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
    40%            { transform: scale(1);   opacity: 1; }
  }
  </style>