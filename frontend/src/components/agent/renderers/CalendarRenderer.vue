<template>
  <div v-if="calendarSteps.length" class="cal-root">

    <div v-for="step in calendarSteps" :key="step.tool" class="cal-section">

      <!-- ── Header ─────────────────────────────────────────────────────── -->
      <div class="cal-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="cal-header-icon">
          <rect x="3" y="4" width="18" height="18" rx="3" stroke="#4F8EF7" stroke-width="2"/>
          <path d="M3 9h18" stroke="#4F8EF7" stroke-width="2"/>
          <path d="M8 2v4M16 2v4" stroke="#4F8EF7" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span class="cal-header-title">{{ headerTitle(step) }}</span>
        <span v-if="step.richEvents?.length" class="cal-count-badge">
          {{ step.richEvents.length }}
        </span>
      </div>

      <!-- ── No events ──────────────────────────────────────────────────── -->
      <div v-if="!step.richEvents?.length" class="cal-empty">
        🎉 No events scheduled
      </div>

      <!-- ── Event cards ────────────────────────────────────────────────── -->
      <div v-else class="cal-cards">
        <div
          v-for="event in step.richEvents"
          :key="event.id"
          class="cal-card"
          :class="{ 'cal-card-invite': step.tool === 'calendar_get_invites' && event.responseStatus === 'needsAction' }"
        >
          <!-- Date block (left column) -->
          <div class="cal-date-block">
            <div class="cal-month">{{ monthAbbr(event.start) }}</div>
            <div class="cal-day">{{ dayNum(event.start) }}</div>
            <div class="cal-weekday">{{ weekDay(event.start) }}</div>
          </div>

          <!-- Content (right column) -->
          <div class="cal-content">
            <div class="cal-title">{{ event.title }}</div>
            <div class="cal-time">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              {{ formatTime(event) }}
            </div>

            <!-- Attendees -->
            <div v-if="event.attendees?.length" class="cal-attendees">
              <span
                v-for="a in event.attendees.slice(0, 5)"
                :key="a.email"
                class="cal-attendee"
                :class="{
                  'rsvp-accepted':  a.rsvp === 'accepted',
                  'rsvp-declined':  a.rsvp === 'declined',
                  'rsvp-pending':   a.rsvp === 'needsAction',
                }"
                :title="a.email"
              >{{ initials(a.name || a.email) }}</span>
              <span v-if="event.attendees.length > 5" class="cal-attendee-more">
                +{{ event.attendees.length - 5 }}
              </span>
            </div>

            <!-- Google Meet link -->
            <a v-if="event.meet" :href="event.meet" target="_blank" rel="noopener" class="cal-meet-btn">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="7" width="15" height="10" rx="2"/>
                <path d="M17 9l5-3v12l-5-3"/>
              </svg>
              Join Google Meet
            </a>

            <!-- RSVP buttons for pending invites -->
            <div
              v-if="step.tool === 'calendar_get_invites' && event.responseStatus === 'needsAction' && !rsvpDone[event.id]"
              class="cal-rsvp"
            >
              <button class="rsvp-btn accept"    @click="rsvp(event, 'accept')">✓ Accept</button>
              <button class="rsvp-btn decline"   @click="rsvp(event, 'decline')">✗ Decline</button>
              <button class="rsvp-btn tentative" @click="rsvp(event, 'tentative')">? Maybe</button>
            </div>
            <div v-if="rsvpDone[event.id]" class="cal-rsvp-done">
              {{ rsvpDone[event.id] === 'accept' ? '✅ Accepted' : rsvpDone[event.id] === 'decline' ? '❌ Declined' : '❓ Maybe' }}
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  steps: { type: Array, default: () => [] },
  msg:   { type: Object, default: () => ({}) },
})

// All calendar steps that have richEvents
const CALENDAR_TOOLS = [
  'calendar_get_today', 'calendar_get_week', 'calendar_get_events',
  'calendar_get_invites', 'calendar_create', 'calendar_update',
]
const calendarSteps = computed(() =>
  props.steps.filter(s => CALENDAR_TOOLS.includes(s.tool) && s.status === 'done')
)

// ── Header title per tool ──────────────────────────────────────────────────
function headerTitle(step) {
  if (step.tool === 'calendar_get_today')   return '📅 Today\'s Schedule'
  if (step.tool === 'calendar_get_week')    return '🗓️ This Week'
  if (step.tool === 'calendar_get_invites') return '📬 Pending Invites'
  if (step.tool === 'calendar_create')      return '✅ Event Created'
  if (step.tool === 'calendar_update')      return '✏️ Event Updated'
  // calendar_get_events — show date if available
  const events = step.richEvents || []
  if (events.length && events[0].start) {
    const d = new Date(events[0].start)
    return `📅 ${d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`
  }
  return '📅 Calendar Events'
}

// ── Date helpers ──────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function monthAbbr(iso) {
  if (!iso) return ''
  return MONTHS[new Date(iso).getMonth()] || ''
}
function dayNum(iso) {
  if (!iso) return ''
  return new Date(iso).getDate()
}
function weekDay(iso) {
  if (!iso) return ''
  return DAYS[new Date(iso).getDay()] || ''
}
function formatTime(event) {
  if (!event.start) return 'All day'
  if (!event.start.includes('T')) return 'All day'
  const fmt = (iso) => new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
  const start = fmt(event.start)
  const end   = event.end ? fmt(event.end) : ''
  return end ? `${start} – ${end}` : start
}
function initials(name) {
  if (!name) return '?'
  const parts = name.split(/[@\s.]+/).filter(Boolean)
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

// ── RSVP ──────────────────────────────────────────────────────────────────
const rsvpDone = ref({})
async function rsvp(event, response) {
  try {
    await fetch('/api/agent/calendar-rsvp', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ eventId: event.id, response }),
    })
    rsvpDone.value = { ...rsvpDone.value, [event.id]: response }
  } catch (e) {
    console.error('RSVP error', e)
  }
}
</script>

<style scoped>
.cal-root { margin-top: 6px; }

/* ── Header ──────────────────────────────────────────────────────────────── */
.cal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(79,142,247,0.1);
  border: 1px solid rgba(79,142,247,0.2);
  border-radius: 12px 12px 0 0;
  font-size: 13px;
  font-weight: 600;
}
.cal-header-icon { flex-shrink: 0; }
.cal-header-title { flex: 1; }
.cal-count-badge {
  background: #4F8EF7;
  color: white;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
}

/* ── Cards wrapper ───────────────────────────────────────────────────────── */
.cal-cards {
  border: 1px solid rgba(79,142,247,0.15);
  border-top: none;
  border-radius: 0 0 12px 12px;
  overflow: hidden;
}

/* ── Individual card ─────────────────────────────────────────────────────── */
.cal-card {
  display: flex;
  gap: 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
  transition: background 0.15s;
}
.cal-card:last-child { border-bottom: none; }
.cal-card:hover { background: rgba(79,142,247,0.05); }
.cal-card-invite { background: rgba(79,142,247,0.07); }

/* ── Date block (left) ───────────────────────────────────────────────────── */
.cal-date-block {
  width: 58px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 14px 8px;
  background: rgba(79,142,247,0.08);
  border-right: 1px solid rgba(79,142,247,0.12);
  gap: 1px;
}
.cal-month {
  font-size: 10px;
  font-weight: 600;
  color: #4F8EF7;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.cal-day {
  font-size: 24px;
  font-weight: 700;
  color: #e2e8f0;
  line-height: 1;
}
.cal-weekday {
  font-size: 10px;
  color: rgba(255,255,255,0.4);
  text-transform: uppercase;
}

/* ── Content (right) ─────────────────────────────────────────────────────── */
.cal-content {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.cal-title {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cal-time {
  font-size: 12px;
  color: rgba(255,255,255,0.55);
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ── Attendees ───────────────────────────────────────────────────────────── */
.cal-attendees {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}
.cal-attendee {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255,255,255,0.15);
  border: 1.5px solid rgba(255,255,255,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  color: #e2e8f0;
  cursor: default;
}
.cal-attendee.rsvp-accepted { background: rgba(34,197,94,0.25);  border-color: #22c55e; }
.cal-attendee.rsvp-declined { background: rgba(239,68,68,0.25);  border-color: #ef4444; }
.cal-attendee.rsvp-pending  { background: rgba(234,179,8,0.25);  border-color: #eab308; }
.cal-attendee-more {
  font-size: 11px;
  color: rgba(255,255,255,0.4);
  align-self: center;
  padding-left: 2px;
}

/* ── Meet button ─────────────────────────────────────────────────────────── */
.cal-meet-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #4F8EF7;
  text-decoration: none;
  background: rgba(79,142,247,0.1);
  border: 1px solid rgba(79,142,247,0.25);
  border-radius: 6px;
  padding: 4px 10px;
  width: fit-content;
  transition: background 0.15s;
}
.cal-meet-btn:hover { background: rgba(79,142,247,0.2); }

/* ── RSVP buttons ────────────────────────────────────────────────────────── */
.cal-rsvp {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}
.rsvp-btn {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.15s;
}
.rsvp-btn.accept    { color: #22c55e; border-color: #22c55e; background: rgba(34,197,94,0.1); }
.rsvp-btn.decline   { color: #ef4444; border-color: #ef4444; background: rgba(239,68,68,0.1); }
.rsvp-btn.tentative { color: #eab308; border-color: #eab308; background: rgba(234,179,8,0.1); }
.rsvp-btn:hover     { filter: brightness(1.2); }
.cal-rsvp-done { font-size: 13px; margin-top: 2px; }

/* ── Empty state ─────────────────────────────────────────────────────────── */
.cal-empty {
  padding: 20px;
  text-align: center;
  font-size: 13px;
  opacity: 0.6;
  border: 1px solid rgba(79,142,247,0.15);
  border-top: none;
  border-radius: 0 0 12px 12px;
}

/* ── Multi-section spacing ───────────────────────────────────────────────── */
.cal-section + .cal-section { margin-top: 12px; }
</style>