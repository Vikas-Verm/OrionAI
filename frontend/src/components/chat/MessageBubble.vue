<template>

  <!-- ── User message ─────────────────────────────────────────── -->
  <div v-if="msg.role === 'user'" class="message-row user-row">
    <div class="avatar">👤</div>
    <div class="bubble user-bubble">
      <p>{{ msg.content }}</p>
    </div>
  </div>

  <!-- ── Agent message ────────────────────────────────────────── -->
  <div v-else-if="msg.isAgent" class="message-row ai-row">
    <div class="avatar">🔭</div>
    <div class="agent-bubble-wrap">

      <!-- Live Step Progress -->
      <div v-if="msg.steps && msg.steps.length" class="agent-steps">
        <div
          v-for="(step, i) in msg.steps"
          :key="i"
          class="agent-step"
          :class="step.status"
        >
          <div class="step-icon-wrap">
            <span v-if="step.status === 'running'" class="step-spinner"></span>
            <span v-else-if="step.status === 'done'" class="step-check">✓</span>
            <span v-else-if="step.status === 'error'" class="step-err">✕</span>
            <span v-else class="step-pending-dot"></span>
          </div>
          <div class="step-body">
            <span class="step-label">{{ step.label || step.tool }}</span>
            <span v-if="step.status === 'running'" class="step-sub running">Working…</span>
            <span v-else-if="step.status === 'done' && step.summary" class="step-sub done">{{ step.summary }}</span>
            <span v-else-if="step.status === 'error'" class="step-sub error">{{ step.error }}</span>
          </div>
        </div>
      </div>

      <!-- Agent result (shown after done) -->
      <template v-if="msg.agentDone">

        <!-- Ticket cards — single user / filtered -->
        <template v-if="ticketSteps.length && !hasByAssignee">
          <div v-for="step in ticketSteps" :key="step.tool" class="ticket-section">
            <div class="ticket-section-header">
              <span class="ticket-section-title">{{ ticketSectionTitle(step) }}</span>
              <span v-if="overdueCount(step)" class="badge badge-warn">⚠️ {{ overdueCount(step) }} overdue</span>
              <span class="badge badge-count">{{ step.richTickets.length }} tickets</span>
            </div>
            <a
              v-for="ticket in step.richTickets"
              :key="ticket.key"
              :href="jiraUrl(ticket.key, step.jiraDomain)"
              target="_blank"
              rel="noopener noreferrer"
              class="ticket-card"
              :class="{ 'ticket-overdue': ticket.overdue }"
            >
              <div class="ticket-card-row">
                <span class="priority-dot" :class="priorityCls(ticket.priority)"></span>
                <span class="ticket-key-link">{{ ticket.key }}</span>
                <span class="ticket-status-badge" :class="statusCls(ticket.status)">{{ ticket.status }}</span>
                <span class="ticket-type-icon">{{ typeIcon(ticket.type) }}</span>
                <span class="ticket-ext-link">↗</span>
              </div>
              <div class="ticket-title">{{ ticket.title }}</div>
              <div class="ticket-footer">
                <span v-if="ticket.dueDate" :class="ticket.overdue ? 'due-overdue' : 'due-ok'">
                  <span v-if="ticket.overdue">⚠️ {{ ticket.daysOverdue }}d overdue</span>
                  <span v-else>Due {{ ticket.dueDate }}</span>
                </span>
                <span v-else class="due-none">No due date</span>
                <span v-if="ticket.assignee" class="ticket-assignee">· {{ ticket.assignee }}</span>
                <span v-if="ticket.sprint"   class="ticket-sprint">· {{ ticket.sprint }}</span>
              </div>
            </a>
          </div>
        </template>

        <!-- Ticket cards — grouped by assignee -->
        <template v-else-if="ticketSteps.length && hasByAssignee">
          <div v-for="step in ticketSteps" :key="step.tool" class="ticket-section">
            <div class="ticket-section-header">
              <span class="ticket-section-title">All open tickets</span>
              <span class="badge badge-count">{{ step.richTickets.length }} total</span>
              <span v-if="overdueCount(step)" class="badge badge-warn">⚠️ {{ overdueCount(step) }} overdue</span>
            </div>
            <div v-for="(pts, person) in step.byAssignee" :key="person" class="assignee-group">
              <div class="assignee-header">
                <span class="assignee-avatar">{{ avatarInitials(person) }}</span>
                <span class="assignee-name">{{ person }}</span>
                <span class="assignee-count">{{ pts.length }} ticket{{ pts.length !== 1 ? 's' : '' }}</span>
                <span v-if="pts.filter(t => t.overdue).length" class="badge badge-warn sm">
                  {{ pts.filter(t => t.overdue).length }} overdue
                </span>
              </div>
              <a
                v-for="ticket in pts"
                :key="ticket.key"
                :href="jiraUrl(ticket.key, step.jiraDomain)"
                target="_blank"
                rel="noopener noreferrer"
                class="ticket-card"
                :class="{ 'ticket-overdue': ticket.overdue }"
              >
                <div class="ticket-card-row">
                  <span class="priority-dot" :class="priorityCls(ticket.priority)"></span>
                  <span class="ticket-key-link">{{ ticket.key }}</span>
                  <span class="ticket-status-badge" :class="statusCls(ticket.status)">{{ ticket.status }}</span>
                  <span class="ticket-ext-link">↗</span>
                </div>
                <div class="ticket-title">{{ ticket.title }}</div>
                <div class="ticket-footer">
                  <span v-if="ticket.dueDate" :class="ticket.overdue ? 'due-overdue' : 'due-ok'">
                    <span v-if="ticket.overdue">⚠️ {{ ticket.daysOverdue }}d overdue</span>
                    <span v-else>Due {{ ticket.dueDate }}</span>
                  </span>
                  <span v-else class="due-none">No due date</span>
                </div>
              </a>
            </div>
          </div>
        </template>

        <!-- Gmail email cards -->
        <template v-else-if="emailSteps.length">
          <div v-for="step in emailSteps" :key="step.tool + '_emails'" class="email-section">

            <!-- Section header -->
            <div class="email-section-header">
              <span class="email-section-title">
                <template v-if="step.tool === 'gmail_search_emails'">🔍 "{{ step.emailQuery }}"</template>
                <template v-else-if="step.tool === 'gmail_get_email'">📧 Email</template>
                <template v-else>📬 Inbox</template>
              </span>
              <span class="badge badge-count">{{ step.richEmails.length }} email{{ step.richEmails.length !== 1 ? 's' : '' }}</span>
              <span v-if="emailUnreadCount(step)" class="badge badge-unread">🔵 {{ emailUnreadCount(step) }} unread</span>
            </div>

            <!-- Email cards -->
            <div
              v-for="email in step.richEmails"
              :key="email.id"
              class="email-card"
              :class="{ 'email-card-unread': email.unread }"
            >
              <!-- Clickable main row -->
              <div class="email-card-main" @click="toggleExpand(email.id)">
                <div class="email-card-left">
                  <span class="email-unread-dot" :class="email.unread ? 'dot-unread' : 'dot-read'"></span>
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
                  <!-- Open in Gmail -->
                  <a
                    :href="`https://mail.google.com/mail/u/0/#inbox/${email.id}`"
                    target="_blank" rel="noopener"
                    class="email-action-btn"
                    title="Open in Gmail"
                    @click.stop
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                  <!-- Reply toggle -->
                  <button
                    class="email-action-btn"
                    :class="{ 'email-action-reply-active': replyingTo === email.id }"
                    title="Reply"
                    @click.stop="toggleReply(email)"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <polyline points="9 17 4 12 9 7"/>
                      <path d="M20 18v-2a4 4 0 00-4-4H4"/>
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Expanded full body -->
              <div v-if="expandedId === email.id" class="email-body-expanded">
                <div v-if="email.body" class="email-body-text">{{ email.body }}</div>
                <div v-else class="email-body-empty">No full body available — try <em>"Open email about {{ email.subject }}"</em></div>
              </div>

              <!-- Inline reply box -->
              <div v-if="replyingTo === email.id" class="email-reply-box">
                <div class="email-reply-header">
                  <span class="email-reply-label">↩ Reply to <strong>{{ senderName(email.from) }}</strong></span>
                  <button class="email-reply-close" @click.stop="replyingTo = null">✕</button>
                </div>

                <!-- Original email context -->
                <div class="email-reply-original">
                  <div class="email-reply-original-meta">
                    <span class="email-reply-original-from">{{ email.from }}</span>
                    <span class="email-reply-original-date">{{ email.date }}</span>
                  </div>
                  <div class="email-reply-original-subject">{{ email.subject }}</div>
                  <div v-if="email.body" class="email-reply-original-body">{{ email.body }}</div>
                  <div v-else-if="email.snippet" class="email-reply-original-body email-reply-original-snippet">{{ email.snippet }}</div>
                </div>

                <!-- AI suggestion loading -->
                <div v-if="suggestingId === email.id" class="email-reply-suggesting">
                  <span class="email-suggest-spinner"></span>
                  <span class="email-suggest-label">✨ Writing a suggested reply…</span>
                </div>

                <!-- Suggestion error -->
                <div v-else-if="suggestionError === email.id" class="email-reply-suggest-error">
                  ⚠️ Could not generate suggestion — write your own below
                </div>

                <!-- AI suggestion banner (shown briefly when suggestion arrives) -->
                <div v-else-if="replyDrafts[email.id]?.trim()" class="email-reply-ai-banner">
                  ✨ <span>AI-suggested reply — edit freely before sending</span>
                  <button class="email-reply-clear" @click.stop="replyDrafts[email.id] = ''" title="Clear and write your own">✕ Clear</button>
                </div>

                <textarea
                  v-model="replyDrafts[email.id]"
                  class="email-reply-textarea"
                  :class="{ 'email-reply-textarea-loading': suggestingId === email.id }"
                  :placeholder="suggestingId === email.id ? '' : 'Write your reply…'"
                  :disabled="suggestingId === email.id"
                  rows="5"
                  @click.stop
                  @keydown.meta.enter.stop="sendReply(email)"
                ></textarea>
                <div class="email-reply-footer">
                  <button
                    class="email-reply-send"
                    :disabled="sendingId === email.id || suggestingId === email.id || !replyDrafts[email.id]?.trim()"
                    @click.stop="sendReply(email)"
                  >
                    <span v-if="sendingId === email.id" class="email-send-spinner"></span>
                    <span v-else>↩ Send Reply</span>
                  </button>
                  <span class="reply-hint">⌘↵ to send</span>
                  <span v-if="sentId === email.id" class="reply-sent-badge">✅ Sent!</span>
                </div>
              </div>

            </div><!-- /email-card -->
          </div><!-- /email-section -->
        </template>

        
        <!-- ══════════════════════════════════════════
             GOOGLE CALENDAR EVENT CARDS (Apple Calendar style)
             ══════════════════════════════════════════ -->
        <template v-else-if="calendarSteps.length">
          <div v-for="step in calendarSteps" :key="step.tool + '_cal'" class="cal-section">

            <div v-if="step.richEvents.length > 1 || ['calendar_get_today','calendar_get_week'].includes(step.tool)"
              class="cal-section-header">
              <span class="cal-section-title">
                <template v-if="step.tool === 'calendar_get_today'">📅 Today</template>
                <template v-else-if="step.tool === 'calendar_get_week'">🗓️ This Week</template>
                <template v-else-if="step.tool === 'calendar_get_invites'">📬 Pending Invites</template>
                <template v-else>📅 Events</template>
              </span>
              <span class="cal-count-badge">{{ step.richEvents.length }}</span>
            </div>

            <div v-for="event in step.richEvents" :key="event.id" class="cal-card">
              <div class="cal-icon-block">
                <div class="cal-icon-top">{{ calMonthAbbr(event.start) }}</div>
                <div class="cal-icon-day">{{ calDayNum(event.start) }}</div>
              </div>
              <div class="cal-card-content">
                <div class="cal-event-title">{{ event.title }}</div>
                <div class="cal-event-when">{{ formatEventWhen(event) }}</div>
                <div v-if="event.attendees?.length" class="cal-attendees">
                  <span v-for="a in event.attendees.slice(0,5)" :key="a.email"
                    class="cal-attendee-chip"
                    :class="{ 'chip-accepted': a.rsvp==='accepted', 'chip-declined': a.rsvp==='declined', 'chip-pending': a.rsvp==='needsAction' }"
                    :title="a.email">{{ avatarInitials(a.name||a.email) }}</span>
                  <span v-if="event.attendees.length > 5" class="cal-attendee-more">+{{ event.attendees.length - 5 }}</span>
                </div>
                <a v-if="event.meet" :href="event.meet" target="_blank" rel="noopener" class="cal-meet-link">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="15" height="10" rx="2"/><path d="M17 9l5-3v12l-5-3"/></svg>
                  Join Google Meet
                </a>
                <div v-if="step.tool === 'calendar_get_invites' && event.responseStatus === 'needsAction' && !rsvpDoneMap[event.id]"
                  class="cal-rsvp-row">
                  <button class="cal-rsvp-btn rsvp-accept" @click="sendRsvp(event, 'accept')">✓ Accept</button>
                  <button class="cal-rsvp-btn rsvp-decline" @click="sendRsvp(event, 'decline')">✗ Decline</button>
                  <button class="cal-rsvp-btn rsvp-maybe" @click="sendRsvp(event, 'tentative')">? Maybe</button>
                </div>
                <div v-if="rsvpDoneMap[event.id]" class="cal-rsvp-done">
                  {{ rsvpDoneMap[event.id] === 'accept' ? '✅ Accepted' : rsvpDoneMap[event.id] === 'decline' ? '❌ Declined' : '❓ Maybe' }}
                </div>
              </div>
            </div>

          </div>
        </template>
        <template v-else-if="telegramSteps.length">
        <div v-for="step in telegramSteps" :key="step.tool + '_tg'" class="tg-agent-section">
          <!-- Header -->
          <div class="tg-agent-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="flex-shrink:0">
              <circle cx="12" cy="12" r="12" fill="#229ED9"/>
              <path d="M5.4 11.9l10.2-3.9c.47-.18.88.11.73.8l-1.74 8.2c-.13.58-.47.72-.95.45l-2.63-1.94-1.27 1.22c-.14.14-.26.26-.53.26l.19-2.69 4.87-4.4c.21-.19-.05-.29-.32-.1L7.47 13.9 4.87 13.1c-.56-.17-.57-.56.53-1.2z" fill="white"/>
            </svg>
            <span class="tg-agent-title">
              <template v-if="step.tool === 'telegram_get_messages'">
                💬 {{ step.telegramChatName || 'Telegram' }}
              </template>
              <template v-else-if="step.tool === 'telegram_list_chats'">
                ✈️ Telegram Chats
              </template>
              <template v-else>
                📤 Sent via Telegram
              </template>
            </span>
            <span class="tg-agent-count" v-if="step.richTelegramMessages?.length">
              {{ step.richTelegramMessages.length }} messages
            </span>
          </div>

          <!-- Chat list (telegram_list_chats) -->
          <div v-if="step.telegramChats?.length" class="tg-agent-chat-list">
            <div v-for="chat in step.telegramChats.slice(0, 8)" :key="chat.id" class="tg-agent-chat-row">
              <div class="tg-agent-chat-avatar">{{ chat.name?.slice(0,2).toUpperCase() }}</div>
              <div class="tg-agent-chat-info">
                <span class="tg-agent-chat-name">{{ chat.name }}</span>
                <span class="tg-agent-chat-preview">{{ chat.lastMessage || '…' }}</span>
              </div>
              <span v-if="chat.unread > 0" class="tg-agent-unread">{{ chat.unread }}</span>
            </div>
          </div>

          <!-- Message thread (telegram_get_messages) -->
          <div v-else-if="step.richTelegramMessages?.length" class="tg-agent-messages">
            <div
              v-for="msg in step.richTelegramMessages.slice(-8)"
              :key="msg.id"
              :class="['tg-agent-msg', msg.fromMe ? 'tg-agent-msg-out' : 'tg-agent-msg-in']">
              <div v-if="!msg.fromMe" class="tg-agent-msg-sender">{{ msg.fromName }}</div>
              <div class="tg-agent-msg-text">{{ msg.text }}</div>
              <div class="tg-agent-msg-time">{{ formatTgTime(msg.date) }}</div>
            </div>
          </div>

          <!-- Send confirmation -->
          <div v-else class="tg-agent-sent-confirm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Message delivered
          </div>

        </div>
      </template>

<!-- Fallback plain text -->
        <div v-else-if="msg.content" class="agent-text-content" v-html="formattedContent"></div>

      </template>

      <!-- Old session from DB, no live steps -->
      <template v-else-if="!msg.steps?.length && msg.agentDone !== false">
        <div v-if="msg.content" class="agent-legacy-content">
          <div v-for="(line, i) in legacyLines" :key="i" :class="legacyLineClass(line)">
            <template v-if="line.type === 'ticket'">
              <a :href="jiraUrl(line.key, null)" target="_blank" rel="noopener noreferrer" class="legacy-ticket-card">
                <div class="ticket-card-row">
                  <span class="priority-dot" :class="priorityCls(line.priority)"></span>
                  <span class="ticket-key-link">{{ line.key }}</span>
                  <span v-if="line.status" class="ticket-status-badge" :class="statusCls(line.status)">{{ line.status }}</span>
                  <span class="ticket-ext-link">↗</span>
                </div>
                <div class="ticket-title">{{ line.title }}</div>
                <div v-if="line.meta" class="ticket-footer">
                  <span :class="line.overdue ? 'due-overdue' : 'due-ok'">{{ line.meta }}</span>
                </div>
              </a>
            </template>
            <template v-else-if="line.type === 'header'">
              <div class="legacy-header">{{ line.text }}</div>
            </template>
            <template v-else-if="line.type === 'text' && line.text">
              <div class="legacy-text">{{ line.text }}</div>
            </template>
          </div>
        </div>
      </template>

      <!-- Loading -->
      <div v-else-if="allPending" class="agent-loading-state">
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
        <span class="loading-label">Thinking…</span>
      </div>

    </div>
  </div>

  <!-- ── Regular assistant message ────────────────────────────── -->
  <div v-else class="message-row ai-row">
    <div class="avatar">🔭</div>
    <div class="bubble ai-bubble">
      <div class="markdown-content" v-html="renderMarkdown(msg.content)" />
      <button
        v-if="hasRenderableCode(msg.content)"
        class="inline-preview-btn"
        @click="openPreviewFromMessage(msg.content)"
      >⬡ Open Preview</button>
      <div v-if="msg.recordCount !== undefined" class="record-count">
        📊 {{ msg.recordCount }} records found
      </div>
      <div v-if="msg.webSearched" class="web-searched-badge">🌐 Web search used</div>
    </div>
  </div>

</template>

<script setup>
import { computed, ref, reactive } from 'vue'
import { useChat } from '../../composables/useChat'
import { agentAPI } from '../../services/api'

const props = defineProps({
  msg: { type: Object, required: true }
})

const { renderMarkdown, hasRenderableCode, openPreviewFromMessage } = useChat()

const formattedContent = computed(() => {
  const c = props.msg.content || ''
  return c
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
})

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

function jiraUrl(key, domain) {
  const d = (domain || 'poshn-co.atlassian.net').replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `https://${d}/browse/${key}`
}
function overdueCount(step) {
  return (step.richTickets || []).filter(t => t.overdue).length
}
function ticketSectionTitle(step) {
  const count = step.richTickets?.length || 0
  const assignee = step.richTickets?.[0]?.assignee || 'Your'
  return `${assignee}'s open tickets — ${count} total`
}
// function avatarInitials(name) {
//   if (!name || name === 'Unassigned') return '?'
//   return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
// }
function formatTgTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}
function typeIcon(type) {
  const t = (type || '').toLowerCase()
  if (t.includes('bug'))   return '🐛'
  if (t.includes('story')) return '📖'
  if (t.includes('epic'))  return '⚡'
  if (t.includes('task'))  return '✅'
  return '🎫'
}
function priorityCls(priority) {
  const p = (priority || '').toLowerCase()
  if (p === 'highest' || p === 'critical') return 'p-critical'
  if (p === 'high')   return 'p-high'
  if (p === 'medium') return 'p-medium'
  if (p === 'low' || p === 'lowest') return 'p-low'
  return 'p-none'
}
function statusCls(status) {
  const s = (status || '').toLowerCase()
  if (s.includes('done') || s.includes('closed') || s.includes('resolved')) return 's-done'
  if (s.includes('progress')) return 's-inprog'
  if (s.includes('review'))   return 's-review'
  if (s.includes('testing') || s.includes('stage')) return 's-testing'
  return 's-todo'
}

const JIRA_KEY_RE = /([A-Z]+-\d+)/
const legacyLines = computed(() => {
  if (!props.msg.content) return []
  
  // ── NEW: normalize single-line DB format into proper lines ──
  // When loaded from DB, tickets are stored as one long string separated by
  // emoji + JIRA key patterns. Re-split them into individual lines first.
  let rawContent = props.msg.content
  
  // Insert a newline before each JIRA key occurrence (e.g. "🟠 ENGG-" or "• ENGG-")
  rawContent = rawContent
    .replace(/([•·]\s*)([A-Z]+-\d+)/g, '\n$2')         // "• ENGG-XXXX" → newline
    .replace(/([\u{1F7E0}-\u{1F7E9}])\s*([A-Z]+-\d+)/gu, '\n$1 $2') // "🟠 ENGG-XXXX"
    .replace(/([🔴🟠🟡🟢🔥])\s*([A-Z]+-\d+)/g, '\n$1 $2')          // emoji + key
  
  return rawContent.split('\n').map(raw => {
    const line = raw.trim()
    if (!line) return { type: 'empty' }
    const keyMatch = line.match(JIRA_KEY_RE)
    if (keyMatch) {
      const key = keyMatch[1]
      const afterKey = line.replace(/^.*?[A-Z]+-\d+\s*[—\-–]\s*/, '')
      const statusMatch = afterKey.match(/^(.*?)\s+(READY FOR TESTING|READY FOR STAGE|IN REVIEW|IN PROGRESS|To Do|Done|DONE|IN_PROGRESS|TESTING)\s*(.*)$/i)
      let title = afterKey, status = '', meta = ''
      if (statusMatch) {
        title  = statusMatch[1].trim()
        status = statusMatch[2].trim()
        meta   = statusMatch[3].replace(/^[•·]\s*/, '').trim()
      }
      const overdue = line.includes('overdue')
      // Extract due date from meta (e.g. "Due: 2026-03-10")
      const dueMatch = meta.match(/Due[:\s]+(\S+)/)
      meta = dueMatch ? dueMatch[1] : meta.replace(/^Due:\s*/, '').replace(/\s*[•·].*$/, '').trim()
      let priority = 'medium'
      if (line.startsWith('🔴') || line.startsWith('🔥')) priority = 'critical'
      else if (line.startsWith('🟠')) priority = 'high'
      else if (line.startsWith('🟡')) priority = 'medium'
      else if (line.startsWith('🟢') || line.startsWith('🟩')) priority = 'low'
      return { type: 'ticket', key, title, status, meta, overdue, priority }
    }
    if (line.includes('*') || /^[👤👥✅⚠️]/.test(line)) {
      return { type: 'header', text: line.replace(/\*/g, '') }
    }
    return { type: 'text', text: line }
  }).filter(l => l.type !== 'empty')
})
function legacyLineClass(line) { return `legacy-line legacy-${line.type}` }

// ── Gmail email cards ──────────────────────────────────────────────────────
const GMAIL_TOOLS = ['gmail_get_inbox', 'gmail_search_emails', 'gmail_get_email']

  // ── Calendar ─────────────────────────────────────────────
  const CALENDAR_TOOLS = ['calendar_get_today', 'calendar_get_week', 'calendar_get_events', 'calendar_get_invites', 'calendar_create', 'calendar_update']
  const calendarSteps = computed(() =>
    (props.msg.steps || []).filter(s => CALENDAR_TOOLS.includes(s.tool) && s.richEvents?.length)
  )
  const TELEGRAM_TOOLS = ['telegram_get_messages', 'telegram_list_chats', 'telegram_send_message']

const telegramSteps = computed(() =>
  (props.msg.steps || []).filter(s =>
    TELEGRAM_TOOLS.includes(s.tool) && (s.richTelegramMessages?.length || s.telegramChats?.length)
  )
)
  const rsvpDoneMap = ref({})
  async function sendRsvp(event, response) {
    try {
      await fetch('/api/agent/calendar-rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ eventId: event.id, response }),
      })
      rsvpDoneMap.value = { ...rsvpDoneMap.value, [event.id]: response }
    } catch(e) { console.error('RSVP error', e) }
  }

  // ── Calendar display helpers ──────────────────────────────────────────────
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  function calMonthAbbr(iso) { if (!iso) return ''; return MONTHS[new Date(iso).getMonth()] || '' }
  function calDayNum(iso) { if (!iso) return ''; return new Date(iso).getDate() }
  function formatEventWhen(event) {
    if (!event.start) return ''
    const startDate = new Date(event.start)
    const dateStr = startDate.toLocaleDateString('en-US', { weekday:'short', day:'numeric', month:'short', year:'numeric' })
    if (!event.start.includes('T')) return dateStr
    const startTime = startDate.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true })
    if (!event.end) return `${dateStr} · ${startTime}`
    const endTime = new Date(event.end).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true })
    return `${dateStr} · ${startTime} – ${endTime}`
  }
  function avatarInitials(name) {
    if (!name) return '?'
    const parts = name.split(/[@\s.]+/).filter(Boolean)
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0,2).toUpperCase()
  }

const emailSteps = computed(() =>
  (props.msg.steps || []).filter(s => GMAIL_TOOLS.includes(s.tool) && s.richEmails?.length)
)

const expandedId  = ref(null)
const replyingTo  = ref(null)
const replyDrafts = reactive({})
const sendingId   = ref(null)
const sentId      = ref(null)

function emailUnreadCount(step) {
  return (step.richEmails || []).filter(e => e.unread).length
}
function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id
}
const suggestingId = ref(null)   // which email is loading AI suggestion
const suggestionError = ref(null)

async function toggleReply(email) {
  const id = email.id
  if (replyingTo.value === id) {
    replyingTo.value = null
    return
  }
  replyingTo.value = id
  if (!replyDrafts[id]) replyDrafts[id] = ''

  // Only fetch suggestion if draft is still empty
  if (!replyDrafts[id]?.trim()) {
    suggestingId.value = id
    suggestionError.value = null
    try {
      const { data } = await agentAPI.gmailSuggestReply({
        subject: email.subject,
        from:    email.from,
        body:    email.body,
        snippet: email.snippet,
      })
      // Only pre-fill if user hasn't typed anything yet
      if (!replyDrafts[id]?.trim()) {
        replyDrafts[id] = data.suggested || ''
      }
    } catch (err) {
      console.error('Suggest reply failed:', err)
      suggestionError.value = id
    } finally {
      suggestingId.value = null
    }
  }
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
    await agentAPI.gmailReply({
      threadId:  email.threadId,
      messageId: email.id,
      replyTo:   email.from,
      subject:   email.subject,
      body,
    })
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