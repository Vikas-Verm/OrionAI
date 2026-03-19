<template>
  <div v-if="jiraSteps.length" class="jir-root">
    <div v-for="step in jiraSteps" :key="step.tool" class="jir-block">

      <!-- ── Header ── -->
      <div class="jir-head">
        <svg width="16" height="16" viewBox="0 0 24 24" style="flex-shrink:0">
          <path fill="#0052CC" d="M11.571 11.513H0a5.218 5.218 0 005.232 5.215h2.13v2.057A5.215 5.215 0 0012.575 24V12.518a1.005 1.005 0 00-1.004-1.005zm5.723-5.756H5.757a5.215 5.215 0 005.215 5.214h2.129v2.058a5.218 5.218 0 005.215 5.214V6.762a1.005 1.005 0 00-1.022-1.005zM23.013 0H11.455a5.215 5.215 0 005.215 5.215h2.129v2.057A5.215 5.215 0 0024.019 12.49V1.005A1.001 1.001 0 0023.013 0z"/>
        </svg>
        <span class="jir-head-title">{{ headTitle(step) }}</span>
        <span v-if="step.richTickets?.length" class="jir-count-badge">{{ step.richTickets.length }}</span>
        <span v-if="overdueCt(step) > 0" class="jir-warn-badge">⚠️ {{ overdueCt(step) }} overdue</span>
        <a v-if="step.jiraDomain" :href="`https://${step.jiraDomain}`" target="_blank" rel="noopener" class="jir-open-btn">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open Jira
        </a>
      </div>

      <!-- ── Sprint summary ── -->
      <div v-if="step.sprintName" class="jir-sprint-bar">
        🏃 {{ step.sprintName }}
        <div v-if="step.richTickets?.length" class="jir-sprint-prog-wrap">
          <div class="jir-sprint-prog" :style="{ width: donePct(step) + '%' }"></div>
        </div>
        <span class="jir-sprint-pct">{{ donePct(step) }}% done</span>
      </div>

      <!-- ── Tickets ── -->
      <template v-if="step.richTickets?.length">
        <!-- Grouped by assignee -->
        <template v-if="step.byAssignee && Object.keys(step.byAssignee).length">
          <div v-for="(tickets, person) in step.byAssignee" :key="person" class="jir-assignee-group">
            <div class="jir-assignee-head">
              <div class="jir-av" :style="{ background: avColor(person) }">{{ avInit(person) }}</div>
              <span class="jir-assignee-name">{{ person }}</span>
              <span class="jir-count-badge">{{ tickets.length }}</span>
              <span v-if="tickets.filter(t=>t.overdue).length" class="jir-warn-badge sm">
                ⚠️ {{ tickets.filter(t=>t.overdue).length }}
              </span>
            </div>
            <a v-for="t in tickets" :key="t.key"
              :href="jiraUrl(t.key, step.jiraDomain)" target="_blank" rel="noopener"
              class="jir-ticket" :class="{ overdue: t.overdue }">
              <div class="jir-ticket-top">
                <span class="jir-type">{{ typeIcon(t.type) }}</span>
                <span class="jir-key">{{ t.key }}</span>
                <span class="jir-status" :class="sCls(t.status)">{{ t.status }}</span>
                <span style="flex:1"></span>
                <span class="jir-ext">↗</span>
              </div>
              <div class="jir-ttitle">{{ t.title }}</div>
              <div class="jir-tfoot">
                <span class="jir-pri" :class="'p-' + nPri(t.priority)">
                  <span class="jir-pri-dot"></span>{{ t.priority }}
                </span>
                <span v-if="t.overdue" class="jir-overdue">⚠️ {{ t.daysOverdue }}d overdue</span>
                <span v-else-if="t.dueDate" class="jir-due">📅 {{ fmtDate(t.dueDate) }}</span>
              </div>
            </a>
          </div>
        </template>

        <!-- Flat list -->
        <template v-else>
          <a v-for="t in step.richTickets" :key="t.key"
            :href="jiraUrl(t.key, step.jiraDomain)" target="_blank" rel="noopener"
            class="jir-ticket" :class="{ overdue: t.overdue }">
            <div class="jir-ticket-top">
              <span class="jir-type">{{ typeIcon(t.type) }}</span>
              <span class="jir-key">{{ t.key }}</span>
              <span class="jir-status" :class="sCls(t.status)">{{ t.status }}</span>
              <span style="flex:1"></span>
              <span v-if="t.assignee && t.assignee!=='Unassigned'" class="jir-av-sm" :style="{ background: avColor(t.assignee) }" :title="t.assignee">{{ avInit(t.assignee) }}</span>
              <span class="jir-ext">↗</span>
            </div>
            <div class="jir-ttitle">{{ t.title }}</div>
            <div class="jir-tfoot">
              <span class="jir-pri" :class="'p-' + nPri(t.priority)">
                <span class="jir-pri-dot"></span>{{ t.priority }}
              </span>
              <span v-if="t.overdue" class="jir-overdue">⚠️ {{ t.daysOverdue }}d overdue</span>
              <span v-else-if="t.dueDate" class="jir-due">📅 {{ fmtDate(t.dueDate) }}</span>
              <span v-if="t.sprint" class="jir-sprint-tag">🏃 {{ t.sprint }}</span>
            </div>
          </a>
        </template>
      </template>

      <!-- ── Created ticket confirmation ── -->
      <template v-else-if="step.tool === 'jira_create_ticket' && step.summary">
        <div class="jir-created">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <div>
            <div class="jir-created-title">Ticket Created</div>
            <div class="jir-created-sub">{{ step.summary }}</div>
          </div>
        </div>
      </template>

      <!-- ── Moved/assigned/commented confirmation ── -->
      <template v-else-if="['jira_move_ticket','jira_assign_ticket','jira_add_comment'].includes(step.tool) && step.summary">
        <div class="jir-created">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <div class="jir-created-sub">{{ step.summary }}</div>
        </div>
      </template>

      <!-- ── Fallback ── -->
      <div v-else class="jir-empty">{{ step.summary || 'No Jira data' }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  steps: { type: Array, default: () => [] },
  msg:   { type: Object, default: () => ({}) },
})

const JIRA_TOOLS = [
  'jira_my_tickets','jira_get_backlog','jira_get_overdue',
  'jira_sprint_summary','jira_create_ticket','jira_move_ticket',
  'jira_assign_ticket','jira_add_comment','jira_search',
  'jira_shipped_last_sprint','jira_most_overdue','jira_sprint_bugs',
  'jira_notify_overdue','jira_update_dates',
]

const jiraSteps = computed(() => props.steps.filter(s => JIRA_TOOLS.includes(s.tool) && s.status === 'done'))

function headTitle(step) {
  const t = step.tool
  if (t === 'jira_my_tickets')          return `🎫 My Tickets`
  if (t === 'jira_get_backlog')         return `📋 Backlog`
  if (t === 'jira_get_overdue')         return `⚠️ Overdue Tickets`
  if (t === 'jira_sprint_summary')      return `🏃 Sprint Summary`
  if (t === 'jira_shipped_last_sprint') return `✅ Shipped Last Sprint`
  if (t === 'jira_most_overdue')        return `🔴 Most Overdue`
  if (t === 'jira_sprint_bugs')         return `🐛 Sprint Bugs`
  if (t === 'jira_search')              return `🔍 Search Results`
  if (t === 'jira_create_ticket')       return `✅ Created`
  if (t === 'jira_move_ticket')         return `→ Moved`
  if (t === 'jira_assign_ticket')       return `👤 Assigned`
  if (t === 'jira_add_comment')         return `💬 Commented`
  return `Jira`
}
function overdueCt(step) { return (step.richTickets || []).filter(t => t.overdue).length }
function donePct(step) {
  const t = step.richTickets || []; if (!t.length) return 0
  return Math.round(t.filter(x => /done|closed|resolved/i.test(x.status)).length / t.length * 100)
}
function jiraUrl(key, domain) {
  const d = (domain || 'yourcompany.atlassian.net').replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `https://${d}/browse/${key}`
}
function typeIcon(t) {
  const v = (t||'').toLowerCase()
  if (v.includes('bug'))   return '🐛'
  if (v.includes('story')) return '📖'
  if (v.includes('epic'))  return '⚡'
  return '✅'
}
function sCls(s) {
  const v = (s||'').toLowerCase()
  if (/done|closed|resolved/.test(v)) return 's-done'
  if (/progress/.test(v))             return 's-inprog'
  if (/review|testing/.test(v))       return 's-review'
  return 's-todo'
}
function nPri(p) {
  const v = (p||'').toLowerCase()
  if (v.includes('highest')) return 'highest'
  if (v.includes('high'))    return 'high'
  if (v.includes('medium'))  return 'medium'
  return 'low'
}
function fmtDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString([], { day:'numeric', month:'short' }) }
const AV_COLORS = ['#0052CC','#36B37E','#FF5630','#6554C0','#00B8D9','#FF8B00']
function avColor(n='') { let h=0; for(const c of n) h=(h*31+c.charCodeAt(0))&0xffffffff; return AV_COLORS[Math.abs(h)%AV_COLORS.length] }
function avInit(n='') { const p=n.trim().split(/\s+/); return p.length>=2?(p[0][0]+p[1][0]).toUpperCase():(n.slice(0,2)||'?').toUpperCase() }
</script>

<style scoped>
.jir-root { display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
.jir-block { background: rgba(0,82,204,.05); border: 1px solid rgba(0,82,204,.18); border-radius: 12px; overflow: hidden; }
/* Head */
.jir-head { display: flex; align-items: center; gap: 7px; padding: 8px 12px; background: rgba(0,82,204,.1); border-bottom: 1px solid rgba(0,82,204,.15); }
.jir-head-title { flex: 1; font-size: 13px; font-weight: 700; color: #e2e8f0; }
.jir-count-badge { font-size: 11px; font-weight: 700; background: rgba(0,82,204,.25); color: #93c5fd; padding: 2px 7px; border-radius: 12px; }
.jir-warn-badge  { font-size: 11px; font-weight: 700; background: rgba(239,68,68,.15); color: #fca5a5; padding: 2px 7px; border-radius: 12px; }
.jir-warn-badge.sm { padding: 1px 5px; font-size: 10px; }
.jir-open-btn { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: #93c5fd; background: rgba(0,82,204,.15); border: 1px solid rgba(0,82,204,.3); border-radius: 10px; padding: 3px 8px; text-decoration: none; white-space: nowrap; transition: background .1s; }
.jir-open-btn:hover { background: rgba(0,82,204,.28); }
/* Sprint bar */
.jir-sprint-bar { display: flex; align-items: center; gap: 9px; padding: 7px 12px; background: rgba(0,0,0,.1); border-bottom: 1px solid rgba(255,255,255,.05); font-size: 12px; color: #94a3b8; }
.jir-sprint-prog-wrap { flex: 1; height: 4px; background: rgba(255,255,255,.07); border-radius: 2px; overflow: hidden; max-width: 80px; }
.jir-sprint-prog { height: 100%; background: #22c55e; border-radius: 2px; }
.jir-sprint-pct { font-size: 11px; color: #64748b; }
/* Assignee group */
.jir-assignee-group { border-bottom: 1px solid rgba(255,255,255,.04); }
.jir-assignee-group:last-child { border-bottom: none; }
.jir-assignee-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: rgba(255,255,255,.025); }
.jir-av { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 700; color: white; }
.jir-av-sm { width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 7px; font-weight: 700; color: white; }
.jir-assignee-name { flex: 1; font-size: 12px; font-weight: 600; color: #e2e8f0; }
/* Ticket cards */
.jir-ticket { display: block; padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,.035); text-decoration: none; transition: background .1s; cursor: pointer; }
.jir-ticket:last-child { border-bottom: none; }
.jir-ticket:hover { background: rgba(255,255,255,.04); }
.jir-ticket.overdue { border-left: 3px solid #ef4444; }
.jir-ticket-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.jir-type { font-size: 11px; }
.jir-key { font-size: 11px; font-weight: 700; color: #4C9AFF; }
.jir-status { font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
.s-todo   { background: rgba(148,163,184,.15); color: #94a3b8; }
.s-inprog { background: rgba(59,130,246,.15); color: #60a5fa; }
.s-review { background: rgba(168,85,247,.15); color: #c084fc; }
.s-done   { background: rgba(34,197,94,.15); color: #4ade80; }
.jir-ext { font-size: 11px; color: #64748b; }
.jir-ttitle { font-size: 13px; color: #e2e8f0; line-height: 1.4; margin-bottom: 5px; }
.jir-tfoot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.jir-pri { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; }
.jir-pri-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.p-highest { color: #ef4444; } .p-high { color: #f97316; } .p-medium { color: #eab308; } .p-low { color: #22c55e; }
.jir-overdue { font-size: 11px; color: #ef4444; font-weight: 600; }
.jir-due { font-size: 11px; color: #64748b; }
.jir-sprint-tag { font-size: 11px; color: #64748b; background: rgba(255,255,255,.05); padding: 1px 6px; border-radius: 10px; }
/* Created/action confirmations */
.jir-created { display: flex; align-items: flex-start; gap: 10px; padding: 12px; }
.jir-created-title { font-size: 13px; font-weight: 700; color: #e2e8f0; }
.jir-created-sub { font-size: 12px; color: #94a3b8; margin-top: 2px; }
.jir-empty { padding: 12px; font-size: 12px; color: #64748b; }
</style>