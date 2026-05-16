<template>
  <div ref="rootRef" class="odp" :class="{ 'odp--open': open, 'odp--disabled': disabled }">
    <button
      type="button"
      class="odp-trigger"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="togglePanel"
      @keydown.down.prevent="openPanel"
    >
      <span class="odp-trigger-icon" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </span>
      <span class="odp-trigger-text" :class="{ 'odp-trigger-text--placeholder': !modelValue }">
        {{ displayValue || placeholder }}
      </span>
      <span v-if="modelValue && !disabled" class="odp-trigger-clear" role="button"
        tabindex="0" aria-label="Clear date" @click.stop="clearDate" @keydown.enter.stop="clearDate">
        ×
      </span>
    </button>

    <Teleport to="body">
      <transition name="odp-pop">
      <div v-if="open" class="odp-panel" role="dialog" aria-label="Select a date"
        :style="panelStyle">
        <header class="odp-head">
          <button type="button" class="odp-head-month" @click="cycleViewMode"
            :aria-label="viewMode === 'days' ? 'Choose month' : 'Back to days'">
            <span>{{ headerLabel }}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
              stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div class="odp-head-nav">
            <button type="button" class="odp-icon-btn" aria-label="Previous"
              @click="step(-1)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button type="button" class="odp-icon-btn" aria-label="Next"
              @click="step(1)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </header>

        <div v-if="viewMode === 'days'" class="odp-grid">
          <div class="odp-grid-row odp-grid-row--weekdays">
            <span v-for="d in WEEKDAYS" :key="d">{{ d }}</span>
          </div>
          <div class="odp-grid-row odp-grid-row--days">
            <button
              v-for="(day, idx) in dayCells"
              :key="idx"
              type="button"
              class="odp-day"
              :class="{
                'odp-day--muted': !day.isCurrentMonth,
                'odp-day--today': day.isToday,
                'odp-day--selected': day.isSelected,
              }"
              @click="selectDay(day)"
            >
              {{ day.day }}
            </button>
          </div>
        </div>

        <div v-else-if="viewMode === 'months'" class="odp-months">
          <button
            v-for="(name, idx) in MONTH_NAMES"
            :key="name"
            type="button"
            class="odp-month-btn"
            :class="{
              'odp-month-btn--selected': idx === selectedMonth && viewYear === selectedYear,
              'odp-month-btn--current': idx === todayMonth && viewYear === todayYear,
            }"
            @click="pickMonth(idx)"
          >
            {{ name.slice(0, 3) }}
          </button>
        </div>

        <div v-else class="odp-years">
          <button
            v-for="year in yearWindow"
            :key="year"
            type="button"
            class="odp-year-btn"
            :class="{
              'odp-year-btn--selected': year === selectedYear,
              'odp-year-btn--current': year === todayYear,
            }"
            @click="pickYear(year)"
          >
            {{ year }}
          </button>
        </div>

        <footer class="odp-foot">
          <button type="button" class="odp-foot-link" @click="clearDate">Clear</button>
          <button type="button" class="odp-foot-link odp-foot-link--accent" @click="selectToday">
            Today
          </button>
        </footer>
      </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Select a date' },
  disabled: { type: Boolean, default: false },
  min: { type: String, default: '' },
  max: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'change'])

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const open = ref(false)
const viewMode = ref('days') // 'days' | 'months' | 'years'
const rootRef = ref(null)
const panelStyle = ref({})
const PANEL_WIDTH = 280
const PANEL_HEIGHT = 320
const PANEL_GAP = 8

function recomputePanelPosition() {
  if (!rootRef.value) return
  const rect = rootRef.value.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Prefer placing below; flip above if not enough room and there's more
  // room above.
  const spaceBelow = vh - rect.bottom
  const spaceAbove = rect.top
  const placeAbove = spaceBelow < PANEL_HEIGHT + PANEL_GAP && spaceAbove > spaceBelow

  let top
  if (placeAbove) {
    top = Math.max(8, rect.top - PANEL_HEIGHT - PANEL_GAP)
  } else {
    top = rect.bottom + PANEL_GAP
  }

  let left = rect.left
  if (left + PANEL_WIDTH > vw - 8) {
    left = Math.max(8, vw - PANEL_WIDTH - 8)
  }
  if (left < 8) left = 8

  panelStyle.value = {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${PANEL_WIDTH}px`,
  }
}

const today = new Date()
today.setHours(0, 0, 0, 0)
const todayYear = today.getFullYear()
const todayMonth = today.getMonth()
const todayDay = today.getDate()

function parseISO(value) {
  if (!value || typeof value !== 'string') return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2]) - 1
  const d = Number(match[3])
  if (
    !Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) ||
    m < 0 || m > 11 || d < 1 || d > 31
  ) return null
  const date = new Date(y, m, d)
  date.setHours(0, 0, 0, 0)
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null
  return date
}

function toISO(date) {
  if (!(date instanceof Date)) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDisplay(date) {
  if (!(date instanceof Date)) return ''
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const selectedDate = computed(() => parseISO(props.modelValue))
const selectedYear = computed(() => selectedDate.value?.getFullYear() ?? todayYear)
const selectedMonth = computed(() => selectedDate.value?.getMonth() ?? todayMonth)

const minDate = computed(() => parseISO(props.min))
const maxDate = computed(() => parseISO(props.max))

const viewYear = ref(selectedYear.value)
const viewMonth = ref(selectedMonth.value)

watch(
  () => props.modelValue,
  () => {
    const d = parseISO(props.modelValue)
    if (d) {
      viewYear.value = d.getFullYear()
      viewMonth.value = d.getMonth()
    }
  }
)

const displayValue = computed(() => {
  const d = selectedDate.value
  return d ? formatDisplay(d) : ''
})

const headerLabel = computed(() => {
  if (viewMode.value === 'days') {
    return `${MONTH_NAMES[viewMonth.value]} ${viewYear.value}`
  }
  if (viewMode.value === 'months') {
    return `${viewYear.value}`
  }
  return `${yearWindow.value[0]} – ${yearWindow.value[yearWindow.value.length - 1]}`
})

const yearWindow = computed(() => {
  const base = Math.floor(viewYear.value / 12) * 12
  return Array.from({ length: 12 }, (_, i) => base + i)
})

const dayCells = computed(() => {
  const firstOfMonth = new Date(viewYear.value, viewMonth.value, 1)
  const weekdayStart = firstOfMonth.getDay()
  const daysInMonth = new Date(viewYear.value, viewMonth.value + 1, 0).getDate()
  const cells = []

  // Leading days from previous month
  const prevMonthDate = new Date(viewYear.value, viewMonth.value, 0)
  const prevMonthDays = prevMonthDate.getDate()
  for (let i = weekdayStart - 1; i >= 0; i--) {
    const day = prevMonthDays - i
    const d = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), day)
    cells.push(makeCell(d, false))
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(viewYear.value, viewMonth.value, day)
    cells.push(makeCell(d, true))
  }

  // Trailing days from next month to fill the grid (always 42 = 6 weeks)
  const trailing = 42 - cells.length
  const nextMonth = viewMonth.value === 11 ? 0 : viewMonth.value + 1
  const nextYear = viewMonth.value === 11 ? viewYear.value + 1 : viewYear.value
  for (let day = 1; day <= trailing; day++) {
    const d = new Date(nextYear, nextMonth, day)
    cells.push(makeCell(d, false))
  }

  return cells
})

function makeCell(date, isCurrentMonth) {
  const iso = toISO(date)
  const sel = selectedDate.value
  return {
    date,
    day: date.getDate(),
    iso,
    isCurrentMonth,
    isToday:
      date.getFullYear() === todayYear &&
      date.getMonth() === todayMonth &&
      date.getDate() === todayDay,
    isSelected: sel ? toISO(sel) === iso : false,
    isDisabled: isOutOfRange(date),
  }
}

function isOutOfRange(date) {
  if (minDate.value && date < minDate.value) return true
  if (maxDate.value && date > maxDate.value) return true
  return false
}

function togglePanel() {
  if (props.disabled) return
  open.value ? closePanel() : openPanel()
}

function openPanel() {
  if (props.disabled) return
  const d = selectedDate.value
  if (d) {
    viewYear.value = d.getFullYear()
    viewMonth.value = d.getMonth()
  } else {
    viewYear.value = todayYear
    viewMonth.value = todayMonth
  }
  viewMode.value = 'days'
  recomputePanelPosition()
  open.value = true
}

function closePanel() {
  open.value = false
}

function step(direction) {
  if (viewMode.value === 'days') {
    let m = viewMonth.value + direction
    let y = viewYear.value
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    viewMonth.value = m
    viewYear.value = y
  } else if (viewMode.value === 'months') {
    viewYear.value += direction
  } else {
    viewYear.value += direction * 12
  }
}

function cycleViewMode() {
  if (viewMode.value === 'days') viewMode.value = 'months'
  else if (viewMode.value === 'months') viewMode.value = 'years'
  else viewMode.value = 'days'
}

function selectDay(cell) {
  if (cell.isDisabled) return
  if (!cell.isCurrentMonth) {
    viewYear.value = cell.date.getFullYear()
    viewMonth.value = cell.date.getMonth()
  }
  emit('update:modelValue', cell.iso)
  emit('change', cell.iso)
  closePanel()
}

function pickMonth(idx) {
  viewMonth.value = idx
  viewMode.value = 'days'
}

function pickYear(year) {
  viewYear.value = year
  viewMode.value = 'months'
}

function selectToday() {
  if (isOutOfRange(today)) return
  const iso = toISO(today)
  emit('update:modelValue', iso)
  emit('change', iso)
  closePanel()
}

function clearDate() {
  emit('update:modelValue', '')
  emit('change', '')
  closePanel()
}

function handleOutsideClick(event) {
  if (!open.value) return
  const target = event.target
  if (rootRef.value && rootRef.value.contains(target)) return
  // Panel is teleported to body — allow clicks inside it.
  if (target instanceof Element && target.closest('.odp-panel')) return
  closePanel()
}

function handleKeyDown(event) {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.stopPropagation()
    closePanel()
  }
}

function handleViewportChange() {
  if (open.value) recomputePanelPosition()
}

onMounted(() => {
  document.addEventListener('mousedown', handleOutsideClick)
  document.addEventListener('keydown', handleKeyDown)
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleOutsideClick)
  document.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})
</script>

<style scoped>
.odp {
  position: relative;
  width: 100%;
}

.odp-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(176, 201, 255, 0.16);
  background: rgba(8, 14, 30, 0.62);
  color: var(--text-primary);
  font: inherit;
  font-size: 13.5px;
  cursor: pointer;
  text-align: left;
  transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease;
}
.odp-trigger:hover:not(:disabled) {
  border-color: rgba(82, 212, 255, 0.32);
}
.odp--open .odp-trigger,
.odp-trigger:focus-visible {
  border-color: rgba(82, 212, 255, 0.45);
  box-shadow: 0 0 0 3px rgba(82, 212, 255, 0.12);
  outline: none;
}
.odp-trigger:disabled { opacity: 0.55; cursor: not-allowed; }

.odp-trigger-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: rgba(82, 212, 255, 0.12);
  color: var(--accent-hover);
  flex: 0 0 auto;
}
.odp-trigger-text {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.odp-trigger-text--placeholder {
  color: rgba(127, 140, 166, 0.7);
}
.odp-trigger-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid rgba(176, 201, 255, 0.16);
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.odp-trigger-clear:hover {
  color: var(--text-primary);
  border-color: rgba(255, 107, 127, 0.45);
}

/* Panel styles live in the non-scoped block below — the panel is teleported to <body>. */
</style>

<style>
/* Teleported popover — keep selectors global so styles still apply outside the component subtree. */
.odp-panel {
  z-index: 9999;
  padding: 14px 14px 10px;
  border-radius: 18px;
  border: 1px solid rgba(176, 201, 255, 0.18);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.012)),
    rgba(9, 14, 30, 0.96);
  box-shadow: 0 24px 64px rgba(2, 6, 23, 0.5);
  backdrop-filter: blur(24px);
  color: var(--text-primary);
  font-family: var(--font-ui);
}
.odp-panel * { box-sizing: border-box; }

.odp-panel .odp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.odp-panel .odp-head-month {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(82, 212, 255, 0.08);
  border: 1px solid rgba(82, 212, 255, 0.18);
  color: var(--text-primary);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.odp-panel .odp-head-month:hover {
  background: rgba(82, 212, 255, 0.14);
  border-color: rgba(82, 212, 255, 0.32);
}
.odp-panel .odp-head-nav { display: inline-flex; gap: 4px; }
.odp-panel .odp-icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(8, 14, 30, 0.55);
  border: 1px solid rgba(176, 201, 255, 0.14);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
}
.odp-panel .odp-icon-btn:hover {
  color: var(--text-primary);
  border-color: rgba(82, 212, 255, 0.36);
}

.odp-panel .odp-grid-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.odp-panel .odp-grid-row--weekdays {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-faint);
  padding: 4px 0;
}
.odp-panel .odp-grid-row--weekdays span {
  text-align: center;
  padding: 4px 0;
}
.odp-panel .odp-grid-row--days { gap: 2px; }

.odp-panel .odp-day {
  height: 32px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.odp-panel .odp-day:hover:not(:disabled) {
  background: rgba(82, 212, 255, 0.12);
  color: var(--text-primary);
}
.odp-panel .odp-day--muted { color: var(--text-faint); }
.odp-panel .odp-day--today {
  border-color: rgba(82, 212, 255, 0.36);
  color: var(--accent-hover);
}
.odp-panel .odp-day--selected {
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.92), rgba(139, 125, 255, 0.82));
  color: #050816;
  border-color: rgba(82, 212, 255, 0.55);
  font-weight: 600;
  box-shadow: 0 12px 26px rgba(82, 212, 255, 0.22);
}
.odp-panel .odp-day--selected.odp-day--today { color: #050816; }

.odp-panel .odp-months,
.odp-panel .odp-years {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 6px 0;
}
.odp-panel .odp-month-btn,
.odp-panel .odp-year-btn {
  padding: 10px 6px;
  border-radius: 10px;
  border: 1px solid rgba(176, 201, 255, 0.12);
  background: rgba(8, 14, 30, 0.55);
  color: var(--text-secondary);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
}
.odp-panel .odp-month-btn:hover,
.odp-panel .odp-year-btn:hover {
  color: var(--text-primary);
  border-color: rgba(82, 212, 255, 0.32);
}
.odp-panel .odp-month-btn--current,
.odp-panel .odp-year-btn--current {
  color: var(--accent-hover);
  border-color: rgba(82, 212, 255, 0.36);
}
.odp-panel .odp-month-btn--selected,
.odp-panel .odp-year-btn--selected {
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.92), rgba(139, 125, 255, 0.82));
  color: #050816;
  border-color: rgba(82, 212, 255, 0.55);
  font-weight: 600;
}

.odp-panel .odp-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  margin-top: 8px;
  border-top: 1px solid rgba(176, 201, 255, 0.08);
}
.odp-panel .odp-foot-link {
  background: none;
  border: none;
  padding: 4px 6px;
  font: inherit;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 6px;
}
.odp-panel .odp-foot-link:hover { color: var(--text-primary); }
.odp-panel .odp-foot-link--accent { color: var(--accent-hover); }
.odp-panel .odp-foot-link--accent:hover { color: var(--accent); }

.odp-pop-enter-active,
.odp-pop-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}
.odp-pop-enter-from,
.odp-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
