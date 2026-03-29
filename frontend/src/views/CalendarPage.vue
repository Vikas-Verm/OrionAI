<template>
    <div class="gc-root">
  
      <!-- ══ PEOPLE SIDEBAR ══ -->
      <div :class="['gc-people-panel', showPeoplePanel && 'open']">
        <div class="gc-pp-head">
          <span class="gc-pp-title">Search for people</span>
          <button class="gc-pp-close" @click="showPeoplePanel = false">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
  
        <!-- Selected people chips -->
        <div v-if="selectedPeople.length" class="gc-pp-chips-wrap">
          <div v-for="p in selectedPeople" :key="p.email" class="gc-pp-chip">
            <div class="gc-pp-chip-av" :style="p.photo ? { padding:0,overflow:'hidden' } : { background: avatarColor(p.name||p.email) }">
              <img v-if="p.photo" :src="p.photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>
              <template v-else>{{ avatarInitials(p.name||p.email) }}</template>
            </div>
            <span class="gc-pp-chip-label">{{ p.name || p.email }}</span>
            <button class="gc-pp-chip-x" @click="removePerson(p)">×</button>
          </div>
        </div>
  
        <!-- Search input -->
        <div class="gc-pp-search-wrap">
          <svg class="gc-pp-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            v-model="peopleQuery"
            class="gc-pp-search"
            placeholder="Search for people"
            @input="onPeopleSearch"
            @keydown.escape="peopleResults = []"
          />
          <button v-if="peopleQuery" class="gc-pp-clear" @click="peopleQuery = ''; peopleResults = []">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
  
        <!-- Search results -->
        <div v-if="peopleResults.length" class="gc-pp-results">
          <div v-for="p in filteredPeopleResults" :key="p.email"
            class="gc-pp-result-item" @click="addPerson(p)">
            <div class="gc-pp-av" :style="p.photo ? { padding:0,overflow:'hidden' } : { background: avatarColor(p.name||p.email) }">
              <img v-if="p.photo" :src="p.photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>
              <template v-else>{{ avatarInitials(p.name||p.email) }}</template>
            </div>
            <div class="gc-pp-result-info">
              <div class="gc-pp-result-name">{{ p.name || p.email }}</div>
              <div v-if="p.name" class="gc-pp-result-email">{{ p.email }}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="gc-pp-add-icon"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          <div v-if="filteredPeopleResults.length === 0" class="gc-pp-all-added">All results already added</div>
        </div>
  
        <!-- Placeholder -->
        <div v-if="!selectedPeople.length && !peopleQuery" class="gc-pp-placeholder">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".3"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          <p>Add people to see their calendar alongside yours</p>
        </div>
  
        <!-- Multi-person event list in sidebar -->
        <div v-if="selectedPeople.length" class="gc-pp-events">
          <div class="gc-pp-events-label">Their events this week</div>
          <div v-if="peopleEventsLoading" class="gc-pp-loading">
            <span class="gc-spinner sm" style="border-color:rgba(26,115,232,.2);border-top-color:#1a73e8"></span>
            Loading schedules…
          </div>
          <template v-else>
            <div v-for="p in selectedPeople" :key="p.email" class="gc-pp-person-section">
              <div class="gc-pp-person-header">
                <div class="gc-pp-av xs" :style="p.photo ? { padding:0,overflow:'hidden' } : { background: avatarColor(p.name||p.email) }">
                  <img v-if="p.photo" :src="p.photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>
                  <template v-else>{{ avatarInitials(p.name||p.email) }}</template>
                </div>
                <span class="gc-pp-person-name">{{ p.name || p.email }}</span>
              </div>
              <div v-if="(peopleEventsMap[p.email] || []).length === 0" class="gc-pp-person-empty">No shared events</div>
              <div v-for="ev in (peopleEventsMap[p.email] || [])" :key="ev.id"
                class="gc-pp-event-row" @click="openEvent(ev)">
                <div class="gc-pp-event-dot" :style="{ background: personColumnColor(p.email) }"></div>
                <div class="gc-pp-event-info">
                  <div class="gc-pp-event-title">{{ ev.title }}</div>
                  <div class="gc-pp-event-time">{{ formatEventWhen(ev) }}</div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
  
      <!-- ══ MAIN CONTENT ══ -->
      <div class="gc-main">
  
      <!-- ══ HEADER ══ -->
      <div class="gc-header">
        <div class="gc-brand">
          <svg width="22" height="22" viewBox="0 0 24 24">
            <rect width="24" height="24" rx="4" fill="#fff"/>
            <rect x="0" y="0" width="24" height="24" rx="4" fill="#1a73e8" opacity=".1"/>
            <rect x="2" y="8" width="20" height="14" rx="2" fill="white" stroke="#dadce0" stroke-width="1"/>
            <rect x="2" y="3" width="20" height="6" rx="2" fill="#1a73e8"/>
            <circle cx="7.5" cy="3" r="1.5" fill="white"/>
            <circle cx="16.5" cy="3" r="1.5" fill="white"/>
            <text x="12" y="20" text-anchor="middle" font-size="8" font-weight="700" fill="#1a73e8">{{ today.getDate() }}</text>
          </svg>
          <span class="gc-brand-name">Google Calendar</span>
        </div>
  
        <div class="gc-header-nav">
          <button class="gc-nav-btn" @click="prev">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button :class="['gc-today-btn', isOnToday && 'on-today']" @click="goToday">Today</button>
          <button class="gc-nav-btn" @click="next">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <span class="gc-period-label">{{ periodLabel }}</span>
        </div>
  
        <div class="gc-view-tabs">
          <button v-for="v in views" :key="v.key"
            :class="['gc-view-tab', activeView === v.key ? 'active' : '']"
            @click="activeView = v.key">{{ v.label }}</button>
        </div>
  
        <button class="gc-create-btn" @click="openCreate()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create
        </button>
        <button :class="['gc-people-btn', showPeoplePanel && 'active']" @click="showPeoplePanel = !showPeoplePanel" title="Search for people">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        </button>
      </div>
  
      <!-- ══ WEEK / DAY VIEW ══ -->
      <div v-if="activeView === 'week' || activeView === 'day'" :class="['gc-time-view', isDraggingView && 'dragging']" @touchstart.passive="onSwipeStart" @touchend.passive="onSwipeEnd">
        <!-- Day header row -->
        <div class="gc-time-header" @wheel.passive="onWheelNav" @mousedown="onDragStart">
          <div class="gc-gutter-head"></div>
          <!-- Normal day columns -->
          <div v-for="day in visibleDays" :key="day.iso"
            :class="['gc-col-head', isToday(day.date) && 'is-today']">
            <span class="gc-col-wday">{{ day.wday }}</span>
            <span :class="['gc-col-num', isToday(day.date) && 'today-pill']">{{ day.num }}</span>
            <span v-if="getHoliday(day.iso)" class="gc-col-holiday">{{ getHoliday(day.iso) }}</span>
          </div>
          <!-- Extra person columns (day view only) -->
          <template v-if="activeView === 'day' && selectedPeople.length">
            <div v-for="p in selectedPeople" :key="p.email"
              class="gc-col-head gc-person-col-head"
              :style="{ borderTop: '3px solid ' + personColumnColor(p.email) }">
              <div class="gc-col-person-av" :style="p.photo ? { padding:0,overflow:'hidden' } : { background: personColumnColor(p.email) }">
                <img v-if="p.photo" :src="p.photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>
                <template v-else>{{ avatarInitials(p.name||p.email) }}</template>
              </div>
              <span class="gc-col-person-name">{{ p.name || p.email.split('@')[0] }}</span>
            </div>
          </template>
        </div>
  
        <!-- Scrollable grid -->
        <div class="gc-time-scroll" ref="gridRef" @mousedown="onDragStart">
          <!-- All-day row -->
          <div class="gc-allday-row">
            <div class="gc-gutter-allday">all-day</div>
            <div v-for="day in visibleDays" :key="day.iso" class="gc-allday-col">
              <div v-for="ev in allDayEventsForDay(day.iso)" :key="ev.id"
                class="gc-allday-chip" @click.stop="openEvent(ev)">
                {{ ev.title }}
              </div>
            </div>
          </div>
  
          <!-- Timed grid -->
          <div class="gc-grid-body">
            <!-- Time gutter -->
            <div class="gc-gutter">
              <div v-for="h in hours" :key="h" class="gc-hour-slot">
                <span class="gc-hour-label">{{ h === 0 ? '' : formatHour(h) }}</span>
              </div>
            </div>
  
            <!-- Day columns -->
            <div class="gc-cols-wrap">
              <!-- Horizontal hour lines across all columns -->
              <div class="gc-hour-lines">
                <div v-for="h in hours" :key="h" class="gc-hour-line"></div>
              </div>
              <!-- Current time indicator -->
              <div v-if="activeView === 'week' || activeView === 'day'" class="gc-now-line" :style="{ top: nowLineTop + 'px' }">
                <div class="gc-now-dot"></div>
              </div>
              <!-- Normal day columns -->
              <div v-for="day in visibleDays" :key="day.iso"
                :class="['gc-day-col', isToday(day.date) && 'is-today-col']"
                @click="onColClick(day, $event)">
                <div v-for="ev in timedEventsForDay(day.iso)" :key="ev.id"
                  class="gc-event-chip"
                  :style="[eventStyle(ev), { background: eventBg(ev), borderColor: eventColor(ev) }]"
                  @click.stop="openEvent(ev)">
                  <div class="gc-event-chip-title">{{ ev.title }}</div>
                  <div v-if="chipHeight(ev) > 30" class="gc-event-chip-time">{{ formatEventTime(ev) }}</div>
                </div>
              </div>
              <!-- Person columns (day view only) -->
              <template v-if="activeView === 'day' && selectedPeople.length">
                <div v-for="p in selectedPeople" :key="p.email"
                  class="gc-day-col gc-person-day-col"
                  :style="{ borderLeft: '2px solid ' + personColumnColor(p.email) + '33' }">
                  <div v-for="ev in personEventsForDay(p.email, visibleDays[0]?.iso)" :key="ev.id"
                    class="gc-event-chip gc-person-event-chip"
                    :style="[eventStyle(ev), { background: personColumnColor(p.email) + '22', borderColor: personColumnColor(p.email), borderLeftWidth: '3px' }]"
                    @click.stop="openEvent(ev)">
                    <div class="gc-event-chip-title">{{ ev.title }}</div>
                    <div v-if="chipHeight(ev) > 30" class="gc-event-chip-time">{{ formatEventTime(ev) }}</div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
  
      <!-- ══ MONTH VIEW ══ -->
      <div v-else-if="activeView === 'month'" :class="['gc-month-view', isDraggingView && 'dragging']" @touchstart.passive="onSwipeStart" @touchend.passive="onSwipeEnd" @mousedown="onDragStart" @mousemove="onDragMove" @mouseup="onDragEnd" @mouseleave="isDraggingView = false" @wheel.passive="onWheelNav">
        <div class="gc-month-wdays">
          <div v-for="d in ['SUN','MON','TUE','WED','THU','FRI','SAT']" :key="d">{{ d }}</div>
        </div>
        <div class="gc-month-grid">
          <div v-for="cell in monthCells" :key="cell.iso"
            :class="['gc-mcell', cell.outside && 'outside', isToday(cell.date) && 'is-today', getHoliday(cell.iso) && 'is-holiday']"
            @click="onMonthCellClick(cell)">
            <div class="gc-mcell-top">
              <span :class="['gc-mcell-num', isToday(cell.date) && 'today-pill']">{{ cell.num }}</span>
              <span v-if="getHoliday(cell.iso)" class="gc-mcell-holiday">{{ getHoliday(cell.iso) }}</span>
            </div>
            <div class="gc-mcell-events">
              <div v-for="ev in eventsForDay(cell.iso).slice(0,3)" :key="ev.id"
                class="gc-mcell-event" :style="{ background: eventBg(ev) }"
                @click.stop="openEvent(ev)">
                <span class="gc-mcell-dot" :style="{ background: eventColor(ev) }"></span>
                {{ ev.title }}
              </div>
              <div v-if="eventsForDay(cell.iso).length > 3" class="gc-mcell-more"
                @click.stop>+{{ eventsForDay(cell.iso).length - 3 }} more</div>
            </div>
          </div>
        </div>
      </div>
  
      <!-- ══ YEAR VIEW ══ -->
      <div v-else-if="activeView === 'year'" class="gc-year-view">
        <div class="gc-year-grid">
          <div v-for="mo in yearMonths" :key="mo.month" class="gc-year-month">
            <div class="gc-year-month-label" @click="cursor = new Date(cursor.getFullYear(), mo.month, 1); activeView = 'month'">
              {{ mo.label }}
            </div>
            <div class="gc-year-mini-wdays">
              <span v-for="d in ['S','M','T','W','T','F','S']" :key="d">{{ d }}</span>
            </div>
            <div class="gc-year-mini-grid">
              <div v-for="cell in mo.cells" :key="cell.iso"
                :class="['gc-year-cell', cell.outside && 'outside', isToday(cell.date) && 'is-today', getHoliday(cell.iso) && !cell.outside && 'is-holiday']"
                @click="!cell.outside && (cursor = new Date(cell.iso + 'T12:00:00'), activeView = 'day')">
                <span class="gc-year-cell-num">{{ cell.num }}</span>
                <span v-if="getHoliday(cell.iso) && !cell.outside" class="gc-year-holiday-dot"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
  
      <!-- ══ SCHEDULE VIEW ══ -->
      <div v-else-if="activeView === 'schedule'" class="gc-schedule-view" ref="scheduleRef">
        <!-- Loading overlay (keeps old events visible while refreshing) -->
        <div v-if="loading" class="gc-sched-loading-bar">
          <div class="gc-sched-loading-inner"></div>
        </div>
  
        <div v-if="!loading && scheduleGroups.length === 0" class="gc-schedule-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".3"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <p>No events in this period</p>
        </div>
  
        <template v-for="group in scheduleGroups" :key="group.iso">
          <!-- Month header -->
          <div v-if="group.isMonthHeader" class="gc-sched-month-header">
            {{ group.label }}
          </div>
          <!-- Day group -->
          <div v-else class="gc-sched-group">
            <div class="gc-sched-date-col">
              <span class="gc-sched-wday">{{ group.wday }}</span>
              <span :class="['gc-sched-num', isToday(group.date) && 'today-pill']">{{ group.num }}</span>
            </div>
            <div class="gc-sched-events">
              <div v-for="ev in group.events" :key="ev.id"
                :class="['gc-sched-event', ev.isHoliday && 'gc-sched-holiday']"
                @click="!ev.isHoliday && openEvent(ev)">
                <div class="gc-sched-bar" :style="{ background: ev.isHoliday ? '#0f9d58' : eventColor(ev) }"></div>
                <div class="gc-sched-info">
                  <div class="gc-sched-title">{{ ev.title }}</div>
                  <div class="gc-sched-meta">
                    <span v-if="ev.start?.includes('T')">{{ formatEventTime(ev) }}{{ ev.end ? ' – ' + formatTime(ev.end) : '' }}</span>
                    <span v-else class="gc-sched-allday">All day</span>
                    <span v-if="ev.location" class="gc-sched-loc">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      {{ ev.location }}
                    </span>
                  </div>
                  <div v-if="ev.attendees?.length" class="gc-sched-guests">
                    <span v-for="a in ev.attendees.slice(0,5)" :key="a.email"
                      class="gc-sched-guest-av" :title="a.name || a.email"
                      :style="{ background: avatarColor(a.name || a.email) }">
                      {{ avatarInitials(a.name || a.email) }}
                    </span>
                    <span v-if="ev.attendees.length > 5" class="gc-sched-more-guests">+{{ ev.attendees.length - 5 }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
  
        <!-- Load more footer -->
        <div class="gc-sched-load-more" @click="scheduleLoadMore">
          <span v-if="scheduleLoading" class="gc-spinner sm" style="border-color:rgba(26,115,232,.2);border-top-color:#1a73e8"></span>
          <span v-else>Load more →</span>
        </div>
      </div>
  
      <!-- ══ EVENT DETAIL POPOVER ══ -->
      <transition name="gc-pop">
      <div v-if="selectedEvent" class="gc-popover-overlay" @click.self="selectedEvent = null">
        <div class="gc-popover">
          <div class="gc-pop-toolbar">
            <button class="gc-pop-icon-btn" title="Edit" @click="editEvent">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="gc-pop-icon-btn danger" title="Delete" @click="deleteEvent(selectedEvent)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
            </button>
            <button class="gc-pop-icon-btn" @click="selectedEvent = null" title="Close">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
  
          <div class="gc-pop-body">
            <!-- Color bar + title -->
            <div class="gc-pop-title-row">
              <div class="gc-pop-color-dot" :style="{ background: eventColor(selectedEvent) }"></div>
              <h3 class="gc-pop-title">{{ selectedEvent.title }}</h3>
            </div>
  
            <!-- When -->
            <div class="gc-pop-row">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <div class="gc-pop-row-text">
                <div>{{ formatEventWhen(selectedEvent) }}</div>
                <div v-if="selectedEvent.recurrence" class="gc-pop-sub">{{ selectedEvent.recurrence }}</div>
              </div>
            </div>
  
            <!-- Location -->
            <div v-if="selectedEvent.location" class="gc-pop-row">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <div class="gc-pop-row-text">{{ selectedEvent.location }}</div>
            </div>
  
            <!-- Description -->
            <div v-if="selectedEvent.description" class="gc-pop-row">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              <div class="gc-pop-row-text">{{ selectedEvent.description }}</div>
            </div>
  
            <!-- Google Meet -->
            <div v-if="selectedEvent.meet || selectedEvent.hangoutLink || selectedEvent.conferenceLink" class="gc-pop-row">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" stroke-width="1.8"><rect x="2" y="7" width="15" height="10" rx="2"/><path d="M17 9l5-3v12l-5-3"/></svg>
              <a :href="selectedEvent.meet || selectedEvent.hangoutLink || selectedEvent.conferenceLink" target="_blank" class="gc-meet-btn">
                Join with Google Meet
              </a>
            </div>
  
            <!-- Guests -->
            <div v-if="selectedEvent.attendees?.length" class="gc-pop-row guests-row">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              <div class="gc-pop-row-text">
                <div class="gc-pop-guest-count">{{ selectedEvent.attendees.length }} guest{{ selectedEvent.attendees.length !== 1 ? 's' : '' }}</div>
                <div class="gc-pop-guests-list">
                  <div v-for="a in selectedEvent.attendees" :key="a.email" class="gc-pop-guest">
                    <div class="gc-pop-guest-av" :style="{ background: avatarColor(a.name || a.email) }">
                      {{ avatarInitials(a.name || a.email) }}
                    </div>
                    <div class="gc-pop-guest-info">
                      <div class="gc-pop-guest-name">{{ a.name || a.email }}</div>
                      <div v-if="a.name" class="gc-pop-guest-email">{{ a.email }}</div>
                    </div>
                    <div class="gc-pop-guest-rsvp" :class="a.rsvp">
                      <svg v-if="a.rsvp === 'accepted'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      <svg v-else-if="a.rsvp === 'declined'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
  
            <!-- Calendar -->
            <div class="gc-pop-row">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <div class="gc-pop-row-text gc-pop-sub">{{ selectedEvent.calendar || 'My Calendar' }}</div>
            </div>
          </div>
        </div>
      </div>
      </transition>
  
      <!-- ══ CREATE / EDIT EVENT MODAL ══ -->
      <transition name="gc-modal">
      <div v-if="showCreate" class="gc-modal-overlay" @click.self="showCreate = false">
        <div class="gc-modal">
          <div class="gc-modal-head">
            <span>{{ editingEvent ? 'Edit event' : 'New event' }}</span>
            <button class="gc-modal-close" @click="showCreate = false">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
  
          <div class="gc-modal-body">
            <!-- Title -->
            <input v-model="form.title" class="gc-modal-title-input" placeholder="Add title" autofocus />
  
            <!-- All day toggle + date/time -->
            <div class="gc-modal-section">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <div class="gc-modal-section-body">
                <div class="gc-dt-row">
                  <input v-model="form.date" class="gc-field" type="date" />
                  <template v-if="!form.allDay">
                    <input v-model="form.start" class="gc-field time" type="time" />
                    <span class="gc-dt-sep">–</span>
                    <input v-model="form.end" class="gc-field time" type="time" />
                  </template>
                </div>
                <label class="gc-toggle-label">
                  <input v-model="form.allDay" type="checkbox" class="gc-checkbox" />
                  All day
                </label>
              </div>
            </div>
  
            <!-- Location -->
            <div class="gc-modal-section">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <input v-model="form.location" class="gc-field flex" placeholder="Add location" />
            </div>
  
            <!-- Description -->
            <div class="gc-modal-section align-top">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              <textarea v-model="form.description" class="gc-field flex gc-textarea" placeholder="Add description" rows="3" />
            </div>
  
            <!-- Guests -->
            <div class="gc-modal-section align-top">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              <div class="gc-field flex">
                <div class="gc-guest-chips">
                  <div v-for="g in form.guests" :key="g.email" class="gc-guest-chip">
                    <span class="gc-gc-av" :style="g.photo ? {} : { background: avatarColor(g.name || g.email) }">
                      <img v-if="g.photo" :src="g.photo" class="gc-gc-photo" />
                      <template v-else>{{ avatarInitials(g.name || g.email) }}</template>
                    </span>
                    <span class="gc-gc-name">{{ g.name || g.email }}</span>
                    <button class="gc-gc-remove" @click="removeGuest(g)">×</button>
                  </div>
                </div>
                <div class="gc-guest-input-wrap" ref="guestInputWrapRef">
                  <input
                    v-model="guestQuery"
                    class="gc-guest-input"
                    placeholder="Add guests"
                    @input="onGuestInput(); updateDropdownPos()"
                    @keydown.enter.prevent="addGuestFromInput"
                    @keydown.tab.prevent="addGuestFromInput"
                    @focus="updateDropdownPos" @keydown.escape="guestSuggestions = []"
                    @blur="setTimeout(() => guestSuggestions = [], 200)"
                  />
                  <Teleport to="body">
                    <div v-if="guestSuggestions.length || guestSearching" class="gc-suggest-dropdown-fixed" :style="dropdownFixedStyle">
                      <!-- Loading state -->
                      <div v-if="guestSearching && !guestSuggestions.length" class="gc-suggest-loading">
                        <span class="gc-spinner sm" style="border-color:rgba(26,115,232,.2);border-top-color:#1a73e8;"></span>
                        Searching…
                      </div>
                      <div v-for="s in guestSuggestions" :key="s.email"
                        class="gc-suggest-item" @mousedown.prevent="selectSuggestion(s)">
                        <div class="gc-suggest-av" :style="s.photo ? { padding: 0, overflow: 'hidden' } : { background: avatarColor(s.name || s.email) }">
                          <img v-if="s.photo" :src="s.photo" style="width:100%;height:100%;object-fit:cover;" />
                          <template v-else>{{ avatarInitials(s.name || s.email) }}</template>
                        </div>
                        <div class="gc-suggest-info">
                          <div class="gc-suggest-name">{{ s.name || s.email }}</div>
                          <div v-if="s.name" class="gc-suggest-email">{{ s.email }}</div>
                        </div>
                      </div>
                      <!-- Type email hint when no results -->
                      <div v-if="!guestSearching && !guestSuggestions.length && guestQuery.includes('@')" class="gc-suggest-hint" @mousedown.prevent="addGuestFromInput">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add {{ guestQuery }}
                      </div>
                    </div>
                  </Teleport>
                </div>
              </div>
            </div>
  
            <!-- Google Meet -->
            <div class="gc-modal-section">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="15" height="10" rx="2"/><path d="M17 9l5-3v12l-5-3"/></svg>
              <div class="gc-field flex gc-meet-row">
                <label class="gc-toggle-label">
                  <input v-model="form.addMeet" type="checkbox" class="gc-checkbox" />
                  Add Google Meet video conferencing
                </label>
              </div>
            </div>
  
  
            <!-- Change owner (edit only) -->
            <div v-if="editingEvent" class="gc-modal-section">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <div class="gc-field flex gc-owner-row">
                <div class="gc-owner-label">Owner</div>
                <div class="gc-owner-input-wrap">
                  <input v-model="form.owner" class="gc-owner-input" placeholder="owner@example.com" />
                  <div class="gc-owner-hint">Changing the owner will transfer this event. The new owner will receive an email.</div>
                </div>
              </div>
            </div>
  
            <!-- Color -->
            <div class="gc-modal-section">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
              <div class="gc-color-picker">
                <button v-for="c in eventColors" :key="c.value"
                  :class="['gc-color-swatch', form.color === c.value && 'selected']"
                  :style="{ background: c.value }"
                  :title="c.label"
                  @click="form.color = c.value">
                  <svg v-if="form.color === c.value" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                </button>
              </div>
            </div>
          </div>
  
          <div class="gc-modal-foot">
            <!-- Delete button — only shown when editing an existing event -->
            <button v-if="editingEvent" class="gc-modal-delete" :disabled="deleting" @click="deleteEvent(editingEvent)">
              <span v-if="deleting" class="gc-spinner sm" style="border-color:rgba(239,68,68,.2);border-top-color:#f87171;"></span>
              <template v-else>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                Delete
              </template>
            </button>
            <div style="flex:1"></div>
            <button class="gc-modal-cancel" @click="showCreate = false">Cancel</button>
            <button class="gc-modal-save" :disabled="!form.title || !form.date || creating" @click="createEvent">
              <span v-if="creating" class="gc-spinner sm"></span>
              <span v-else>{{ editingEvent ? 'Save changes' : 'Save' }}</span>
            </button>
          </div>
        </div>
      </div>
      </transition>
  
      </div><!-- /gc-main -->
  
    <!-- ══ DELETE CONFIRM MODAL ══ -->
    <transition name="gc-modal">
    <div v-if="pendingDelete" class="gc-modal-overlay gc-delete-overlay" @click.self="pendingDelete = null">
      <div class="gc-delete-modal">
        <div class="gc-delete-modal-body">
          <div class="gc-delete-title">Would you like to send cancellation emails to Google Calendar guests?</div>
          <textarea
            v-model="deleteNote"
            class="gc-delete-note"
            placeholder="Add an optional message for cancellations"
            rows="4"
          />
        </div>
        <div class="gc-delete-foot">
          <button class="gc-delete-help" title="Help">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </button>
          <div style="flex:1"></div>
          <button class="gc-delete-back" @click="pendingDelete = null">Back to editing</button>
          <button class="gc-delete-nosend" :disabled="deleting" @click="confirmDelete(false)">
            <span v-if="deleting" class="gc-spinner sm"></span>
            <span v-else>Do not send</span>
          </button>
          <button class="gc-delete-send" :disabled="deleting" @click="confirmDelete(true)">
            <span v-if="deleting" class="gc-spinner sm" style="border-color:rgba(255,255,255,.3);border-top-color:#fff;"></span>
            <span v-else>Send</span>
          </button>
        </div>
      </div>
    </div>
    </transition>
  
    </div>
  </template>
  
  <script setup>
  import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
  import api from '../services/api'
  
  defineEmits(['close'])
  
  // ── Constants ───────────────────────────────────────────────
  const HOUR_H  = 48   // px per hour — matches Google Calendar density
  const START_H = 0    // start at midnight (hour 0)
  const END_H   = 24   // end at 24 (midnight next day)
  const hours   = Array.from({ length: END_H - START_H }, (_, i) => i + START_H)  // 0..23
  
  const views = [
    { key: 'month',    label: 'Month'    },
    { key: 'week',     label: 'Week'     },
    { key: 'day',      label: 'Day'      },
    { key: 'schedule', label: 'Schedule' },
    { key: 'year',     label: 'Year'     },
  ]
  
  const eventColors = [
    { label: 'Blueberry',  value: '#3F51B5' },
    { label: 'Tomato',     value: '#D50000' },
    { label: 'Flamingo',   value: '#E67C73' },
    { label: 'Tangerine',  value: '#F4511E' },
    { label: 'Banana',     value: '#F6BF26' },
    { label: 'Sage',       value: '#33B679' },
    { label: 'Basil',      value: '#0B8043' },
    { label: 'Peacock',    value: '#039BE5' },
    { label: 'Graphite',   value: '#616161' },
    { label: 'Lavender',   value: '#7986CB' },
    { label: 'Grape',      value: '#8E24AA' },
  ]
  
  // ── State ───────────────────────────────────────────────────
  const activeView    = ref('week')
  const cursor        = ref(new Date())
  const today         = new Date()
  const events        = ref([])
  const loading       = ref(false)
  const selectedEvent = ref(null)
  const showCreate    = ref(false)
  const editingEvent  = ref(null)
  const creating      = ref(false)
  const deleting      = ref(false)
  const pendingDelete = ref(null)    // event pending delete confirmation
  const deleteNote    = ref('')       // optional cancellation message
  const gridRef        = ref(null)
  const scheduleRef    = ref(null)
  const scheduleLoading = ref(false)
  const nowLineTop    = ref(0)
  let   nowTimer      = null
  
  // Contacts cache for guest suggestions
  const contactsCache       = ref([])
  const guestInputWrapRef   = ref(null)
  const dropdownFixedPos    = ref({ top: 0, left: 0, width: 280 })
  
  const dropdownFixedStyle = computed(() => ({
    position: 'fixed',
    top:   dropdownFixedPos.value.top  + 'px',
    left:  dropdownFixedPos.value.left + 'px',
    width: Math.max(dropdownFixedPos.value.width, 280) + 'px',
    zIndex: 9999,
  }))
  
  function updateDropdownPos() {
    if (!guestInputWrapRef.value) return
    const r = guestInputWrapRef.value.getBoundingClientRect()
    dropdownFixedPos.value = { top: r.bottom + 4, left: r.left, width: r.width }
  }
  
  // Form
  const defaultForm = () => ({
    title: '', date: toIso(new Date()), start: '09:00', end: '10:00',
    allDay: false, location: '', description: '',
    guests: [], addMeet: true, color: '#1a73e8', owner: '',
  })
  const form = ref(defaultForm())
  
  // Guest autocomplete
  const guestQuery       = ref('')
  const guestSuggestions = ref([])
  const guestSearching   = ref(false)
  
  // ── Helpers ─────────────────────────────────────────────────
  function toIso(d) {
    // Always use LOCAL calendar date, not UTC (avoids off-by-one in timezones like IST +5:30)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  function isToday(d) {
    if (!d) return false
    const date = d instanceof Date ? d : new Date(d + 'T00:00:00')
    return toIso(date) === toIso(today)
  }
  function formatHour(h) {
    if (h === 0) return '12 AM'
    if (h < 12) return `${h} AM`
    if (h === 12) return '12 PM'
    return `${h - 12} PM`
  }
  function formatTime(iso) {
    if (!iso?.includes('T')) return ''
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }
  function formatEventTime(ev) { return formatTime(ev.start) }
  function formatEventWhen(ev) {
    if (!ev.start) return ''
    const d = new Date(ev.start.includes('T') ? ev.start : ev.start + 'T00:00:00')
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    if (!ev.start.includes('T')) return dateStr
    const s = formatTime(ev.start)
    const e = ev.end ? formatTime(ev.end) : ''
    return `${dateStr} · ${s}${e ? ' – ' + e : ''}`
  }
  
  const PALETTE = ['#D50000','#E67C73','#F4511E','#F6BF26','#33B679','#0B8043','#039BE5','#3F51B5','#8E24AA','#616161','#7986CB','#1a73e8']
  function avatarColor(name) {
    if (!name) return '#888'
    let h = 0
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
    return PALETTE[Math.abs(h) % PALETTE.length]
  }
  function avatarInitials(name) {
    if (!name) return '?'
    const p = name.split(/[@\s.]+/).filter(Boolean)
    return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
  }
  function eventColor(ev) { return ev.color || '#1a73e8' }
  function eventBg(ev)    { return (ev.color || '#1a73e8') + '28' }
  
  // ── Time grid positioning ────────────────────────────────────
  function eventStyle(ev) {
    if (!ev.start?.includes('T')) return { top: '0px', height: `${HOUR_H}px` }
    const s    = new Date(ev.start)
    const e    = ev.end ? new Date(ev.end) : new Date(s.getTime() + 60 * 60000)
    const topPx    = ((s.getHours() + s.getMinutes() / 60) - START_H) * HOUR_H
    const heightPx = Math.max(((e - s) / 3600000) * HOUR_H, 18)
    return { top: `${topPx}px`, height: `${heightPx}px` }
  }
  function chipHeight(ev) {
    if (!ev.start?.includes('T')) return HOUR_H
    const s = new Date(ev.start)
    const e = ev.end ? new Date(ev.end) : new Date(s.getTime() + 60 * 60000)
    return Math.max(((e - s) / 3600000) * HOUR_H, 18)
  }
  
  // ── Now-line ────────────────────────────────────────────────
  function updateNowLine() {
    const now = new Date()
    nowLineTop.value = ((now.getHours() + now.getMinutes() / 60) - START_H) * HOUR_H
  }
  
  // ── Cursor / nav ─────────────────────────────────────────────
  const periodLabel = computed(() => {
    if (activeView.value === 'month') {
      return cursor.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
    if (activeView.value === 'week') {
      const days = weekDays.value
      const first = days[0].date, last = days[6].date
      if (first.getMonth() === last.getMonth())
        return first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      return `${first.toLocaleDateString('en-US',{month:'short'})} – ${last.toLocaleDateString('en-US',{month:'short', year:'numeric'})}`
    }
    if (activeView.value === 'day') {
      return cursor.value.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    }
    if (activeView.value === 'year') return cursor.value.toLocaleDateString('en-US', { year: 'numeric' })
    // schedule: show range
    const sEnd = new Date(cursor.value)
    sEnd.setDate(sEnd.getDate() + 90)
    const sLabel = cursor.value.toLocaleDateString('en-US',{month:'short'}) + ' – ' + sEnd.toLocaleDateString('en-US',{month:'short', year:'numeric'})
    return sLabel
  })
  
  const isOnToday = computed(() => {
    const t = toIso(today)
    if (activeView.value === 'month') return cursor.value.getMonth() === today.getMonth() && cursor.value.getFullYear() === today.getFullYear()
    if (activeView.value === 'year')  return cursor.value.getFullYear() === today.getFullYear()
    if (activeView.value === 'week')  return weekDays.value.some(d => d.iso === t)
    return toIso(cursor.value) === t
  })
  
  function prev() {
    const d = new Date(cursor.value)
    if      (activeView.value === 'week')  d.setDate(d.getDate() - 7)
    else if (activeView.value === 'month') d.setMonth(d.getMonth() - 1)
    else if (activeView.value === 'day')   d.setDate(d.getDate() - 1)
    else if (activeView.value === 'year') d.setFullYear(d.getFullYear() - 1)
    else { d.setMonth(d.getMonth() - 1); d.setDate(1) }
    cursor.value = d; loadEvents()
  }
  function next() {
    const d = new Date(cursor.value)
    if      (activeView.value === 'week')  d.setDate(d.getDate() + 7)
    else if (activeView.value === 'month') d.setMonth(d.getMonth() + 1)
    else if (activeView.value === 'day')   d.setDate(d.getDate() + 1)
    else if (activeView.value === 'year') d.setFullYear(d.getFullYear() + 1)
    else { d.setMonth(d.getMonth() + 1); d.setDate(1) }
    cursor.value = d; loadEvents()
  }
  function goToday() {
    cursor.value = new Date(); loadEvents()
    nextTick(() => scrollToNow())
  }
  function scrollToNow() {
    if (gridRef.value) {
      const nowPx = ((today.getHours() + today.getMinutes() / 60) - START_H) * HOUR_H
      gridRef.value.scrollTop = Math.max(0, nowPx - 100)
    }
  }
  
  // ── Week / day computed ──────────────────────────────────────
  const weekDays = computed(() => {
    const d = new Date(cursor.value)
    const dow = d.getDay()
    const diff = dow === 0 ? -6 : 1 - dow  // Monday start
    d.setDate(d.getDate() + diff)
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(d); date.setDate(d.getDate() + i)
      return {
        date, iso: toIso(date),
        wday: date.toLocaleDateString('en-US', { weekday: 'short' }),
        num:  date.getDate(),
      }
    })
  })
  
  const visibleDays = computed(() => {
    if (activeView.value === 'day') {
      const d = cursor.value
      return [{ date: d, iso: toIso(d), wday: d.toLocaleDateString('en-US',{weekday:'short'}), num: d.getDate() }]
    }
    return weekDays.value
  })
  
  // ── Month grid ───────────────────────────────────────────────
  const monthCells = computed(() => {
    const y = cursor.value.getFullYear(), m = cursor.value.getMonth()
    const first = new Date(y, m, 1)
    const startOff = first.getDay()  // 0=Sun
    const start = new Date(first); start.setDate(1 - startOff)
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start); date.setDate(start.getDate() + i)
      return { date, iso: toIso(date), num: date.getDate(), outside: date.getMonth() !== m }
    })
  })
  
  // ── Year view ────────────────────────────────────────────────
  const yearMonths = computed(() => {
    const y = cursor.value.getFullYear()
    return Array.from({ length: 12 }, (_, m) => {
      const first = new Date(y, m, 1)
      const startOff = first.getDay()
      const start = new Date(first); start.setDate(1 - startOff)
      const cells = Array.from({ length: 42 }, (_, i) => {
        const date = new Date(start); date.setDate(start.getDate() + i)
        return { date, iso: toIso(date), num: date.getDate(), outside: date.getMonth() !== m }
      })
      // trim trailing empty rows
      while (cells.length > 35 && cells.slice(-7).every(c => c.outside)) cells.splice(-7)
      return {
        label: first.toLocaleDateString('en-US', { month: 'long' }),
        month: m, cells
      }
    })
  })
  
  // ── Schedule groups ──────────────────────────────────────────
  const scheduleGroups = computed(() => {
    const start = new Date(cursor.value)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 90)
    const groups = []
    let lastMonth = -1
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const iso = toIso(d)
      const dayEvents = [...eventsForDay(iso)]
      if (!dayEvents.length) continue
      // Insert a month-header marker when month changes
      const mo = d.getMonth()
      if (mo !== lastMonth) {
        lastMonth = mo
        groups.push({
          isMonthHeader: true,
          iso: iso + '-mh',
          label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        })
      }
      groups.push({
        iso, date: new Date(d),
        wday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        num: d.getDate(),
        month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
        events: dayEvents,
      })
    }
    return groups
  })
  
  // ── Schedule: load more (extend window forward by 90 days) ──────
  async function scheduleLoadMore() {
    if (scheduleLoading.value) return
    scheduleLoading.value = true
    try {
      // Advance cursor by 3 months
      const d = new Date(cursor.value)
      d.setMonth(d.getMonth() + 3)
      cursor.value = d
      // Load the next 3 months and merge
      const months = [0, 1, 2].map(offset => {
        const dd = new Date(d.getFullYear(), d.getMonth() + offset, 1)
        return { month: dd.getMonth() + 1, year: dd.getFullYear() }
      })
      const results = await Promise.allSettled(
        months.map(m => api.get('/api/calendar/events', { params: m }))
      )
      const existing = new Set(events.value.map(e => e.id))
      const newEvs = []
      for (const r of results) {
        if (r.status !== 'fulfilled') continue
        for (const ev of r.value.data.events || []) {
          if (!existing.has(ev.id)) { existing.add(ev.id); newEvs.push(ev) }
        }
      }
      events.value = [...events.value, ...newEvs].sort((a,b) => (a.start||'') < (b.start||'') ? -1 : 1)
    } catch(e) { console.error('Load more failed:', e.message) }
    finally { scheduleLoading.value = false }
  }
  
  // ── Event queries ─────────────────────────────────────────────
  function eventsForDay(iso) {
    return events.value.filter(ev => ev.start?.slice(0, 10) === iso)
  }
  function allDayEventsForDay(iso) {
    return events.value.filter(ev => ev.start?.slice(0, 10) === iso && !ev.start.includes('T'))
  }
  function timedEventsForDay(iso) {
    return events.value.filter(ev => ev.start?.slice(0, 10) === iso && ev.start.includes('T'))
  }
  
  // ── Load / create ─────────────────────────────────────────────
  async function loadEvents() {
    loading.value = true
    try {
      if (activeView.value === 'schedule') {
        // For schedule: fetch 3 months in parallel so all 90 days have data
        const start = new Date(cursor.value)
        start.setDate(1)
        const months = [0, 1, 2].map(offset => {
          const d = new Date(start.getFullYear(), start.getMonth() + offset, 1)
          return { month: d.getMonth() + 1, year: d.getFullYear() }
        })
        const results = await Promise.allSettled(
          months.map(m => api.get('/api/calendar/events', { params: m }))
        )
        const merged = []
        const seen = new Set()
        for (const r of results) {
          if (r.status !== 'fulfilled') continue
          for (const ev of r.value.data.events || []) {
            if (!seen.has(ev.id)) { seen.add(ev.id); merged.push(ev) }
          }
        }
        events.value = merged.sort((a, b) => (a.start || '') < (b.start || '') ? -1 : 1)
      } else {
        const res = await api.get('/api/calendar/events', {
          params: { month: cursor.value.getMonth() + 1, year: cursor.value.getFullYear() }
        })
        events.value = res.data.events || []
      }
    } catch (e) { console.error('Calendar load failed:', e.message) }
    finally { loading.value = false }
  }
  
  async function createEvent() {
    if (!form.value.title || !form.value.date) return
    creating.value = true
    try {
      const startIso = form.value.allDay
        ? form.value.date
        : `${form.value.date}T${form.value.start}:00`
      const endIso = form.value.allDay ? null
        : (form.value.end ? `${form.value.date}T${form.value.end}:00` : null)
      await api.post('/api/calendar/events', {
        title:       form.value.title,
        start:       startIso,
        end:         endIso,
        location:    form.value.location  || null,
        description: form.value.description || null,
        attendees:   form.value.guests.map(g => ({ email: g.email, name: g.name || '' })),
        meet:        form.value.addMeet ? 'auto' : null,
        color:       form.value.color,
      })
      showCreate.value = false
      form.value = defaultForm()
      await loadEvents()
    } catch (e) { console.error('Create event failed:', e.message) }
    finally { creating.value = false }
  }
  
  function deleteEvent(ev) {
    if (!ev?.id) return
    pendingDelete.value = ev          // open the custom confirm modal
    deleteNote.value    = ''
  }
  
  async function confirmDelete(sendCancellation) {
    const ev = pendingDelete.value
    if (!ev) return
    deleting.value = true
    try {
      await api.delete(`/api/calendar/events/${ev.id}`, {
        data: {
          sendNotifications: sendCancellation,
          note: deleteNote.value || undefined,
        }
      })
      events.value       = events.value.filter(e => e.id !== ev.id)
      selectedEvent.value = null
      showCreate.value    = false
      editingEvent.value  = null
      pendingDelete.value = null
    } catch (e) {
      console.error('Delete event failed:', e.message)
    } finally {
      deleting.value = false
    }
  }
  
  // ── Event click / edit ────────────────────────────────────────
  function openEvent(ev) { selectedEvent.value = ev }
  function editEvent() {
    const ev = selectedEvent.value
    editingEvent.value = ev
    form.value = {
      title: ev.title, date: ev.start?.slice(0, 10) || toIso(new Date()),
      start: ev.start?.slice(11, 16) || '09:00',
      end:   ev.end?.slice(11, 16)   || '10:00',
      allDay: !ev.start?.includes('T'),
      location: ev.location || '',
      description: ev.description || '',
      guests: (ev.attendees || []).map(a => ({ email: a.email, name: a.name || '' })),
      addMeet: !!ev.meet, color: ev.color || '#1a73e8', owner: '',
    }
    selectedEvent.value = null
    showCreate.value = true
  }
  
  function openCreate(prefillDate) {
    editingEvent.value = null
    form.value = defaultForm()
    if (prefillDate instanceof Date) form.value.date = toIso(prefillDate)
    showCreate.value = true
  }
  
  // ── Click on calendar grid to pre-fill date ───────────────────
  function onColClick(day, event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const y = event.clientY - rect.top
    const hour = Math.floor(y / HOUR_H) + START_H
    const mins = Math.round((y % HOUR_H) / HOUR_H * 60 / 15) * 15
    editingEvent.value = null
    form.value = defaultForm()
    form.value.date  = day.iso
    form.value.start = `${String(hour).padStart(2,'0')}:${String(mins).padStart(2,'0')}`
    form.value.end   = `${String(hour + 1).padStart(2,'0')}:${String(mins).padStart(2,'0')}`
    showCreate.value = true
  }
  function onMonthCellClick(cell) { openCreate(cell.date) }
  
  // ── Guest autocomplete ────────────────────────────────────────
  let guestTimer = null
  async function onGuestInput() {
    clearTimeout(guestTimer)
    const q = guestQuery.value.trim()
    if (!q) { guestSuggestions.value = []; guestSearching.value = false; return }
    guestSearching.value = true
    await nextTick(); updateDropdownPos()
    guestTimer = setTimeout(async () => {
      const lower = q.toLowerCase()
      try {
        const res = await api.get('/api/gmail/contacts', { params: { q } })
        const fetched = res.data.contacts || []
        for (const f of fetched) {
          if (!contactsCache.value.find(c => c.email === f.email)) {
            contactsCache.value.push(f)
          }
        }
      } catch (e) { console.warn('Contacts API:', e.message) }
      guestSearching.value = false
      const results = contactsCache.value.filter(c =>
        (c.email.toLowerCase().includes(lower) || (c.name || '').toLowerCase().includes(lower)) &&
        !form.value.guests.find(g => g.email === c.email)
      )
      guestSuggestions.value = results.slice(0, 10)
      await nextTick(); updateDropdownPos()
    }, 250)
  }
  function selectSuggestion(s) {
    form.value.guests.push({ email: s.email, name: s.name || '', photo: s.photo || null })
    guestQuery.value = ''; guestSuggestions.value = []
  }
  function addGuestFromInput() {
    const q = guestQuery.value.trim()
    if (!q) return
    if (guestSuggestions.value.length) { selectSuggestion(guestSuggestions.value[0]); return }
    // Always allow adding a typed email directly (Enter / Tab)
    if (q.includes('@')) {
      form.value.guests.push({ email: q.toLowerCase(), name: '', photo: null })
      guestQuery.value = ''
      guestSuggestions.value = []
      guestSearching.value = false
      clearTimeout(guestTimer)
    }
  }
  function removeGuest(g) {
    form.value.guests = form.value.guests.filter(x => x.email !== g.email)
  }
  
  onMounted(async () => {
    updateNowLine()
    nowTimer = setInterval(updateNowLine, 60000)
    await loadEvents()
    nextTick(scrollToNow)
    window.addEventListener('mousemove', _winMouseMove)
    window.addEventListener('mouseup', _winMouseUp)
  })
  // ── Holidays: driven entirely by Google Calendar API events ──
  // (backend fetches all subscribed calendars, including Indian Holidays)
  // No hardcoding needed — holidays appear as real all-day events with isHoliday:true
  function getHoliday(iso) {
    if (!iso) return null
    const ev = events.value.find(e => e.isHoliday && e.start?.slice(0, 10) === iso)
    return ev?.title || null
  }
  
  // ── People panel (multi-select) ───────────────────────────────
  const PERSON_COLORS = ['#1a73e8','#0f9d58','#f4b400','#db4437','#ab47bc','#00acc1','#ff7043','#43a047']
  const showPeoplePanel    = ref(false)
  const peopleQuery        = ref('')
  const peopleResults      = ref([])
  const selectedPeople     = ref([])   // array of {email, name, photo}
  const peopleEventsMap    = ref({})   // email → events[]
  const peopleEventsLoading = ref(false)
  let   peopleTimer        = null
  
  const filteredPeopleResults = computed(() =>
    peopleResults.value.filter(p => !selectedPeople.value.some(s => s.email === p.email))
  )
  
  function personColumnColor(email) {
    const idx = selectedPeople.value.findIndex(p => p.email === email)
    return PERSON_COLORS[idx % PERSON_COLORS.length]
  }
  
  async function onPeopleSearch() {
    clearTimeout(peopleTimer)
    const q = peopleQuery.value.trim()
    if (!q) { peopleResults.value = []; return }
    peopleTimer = setTimeout(async () => {
      try {
        const res = await api.get('/api/gmail/contacts', { params: { q } })
        peopleResults.value = (res.data.contacts || []).slice(0, 8)
      } catch { peopleResults.value = [] }
    }, 250)
  }
  
  async function addPerson(p) {
    if (selectedPeople.value.some(s => s.email === p.email)) return
    selectedPeople.value.push(p)
    peopleQuery.value   = ''
    peopleResults.value = []
    await loadPersonEvents(p)
  }
  
  function removePerson(p) {
    selectedPeople.value = selectedPeople.value.filter(s => s.email !== p.email)
    const map = { ...peopleEventsMap.value }
    delete map[p.email]
    peopleEventsMap.value = map
  }
  
  async function loadPersonEvents(p) {
    peopleEventsLoading.value = true
    try {
      const email = p.email.toLowerCase()
      // First try already-loaded events
      let found = events.value.filter(ev =>
        (ev.attendees || []).some(a => a.email?.toLowerCase() === email)
      )
      if (found.length === 0) {
        const res = await api.get('/api/calendar/events', {
          params: { month: cursor.value.getMonth()+1, year: cursor.value.getFullYear() }
        })
        found = (res.data.events || []).filter(ev =>
          (ev.attendees || []).some(a => a.email?.toLowerCase() === email)
        )
      }
      peopleEventsMap.value = { ...peopleEventsMap.value, [email]: found.sort((a,b) => (a.start||'') < (b.start||'') ? -1 : 1) }
    } catch(e) { console.error('Person events error:', e.message) }
    finally { peopleEventsLoading.value = false }
  }
  
  function personEventsForDay(email, iso) {
    if (!iso) return []
    return (peopleEventsMap.value[email.toLowerCase()] || []).filter(ev => ev.start?.slice(0,10) === iso && ev.start.includes('T'))
  }
  
  // ── Swipe / drag navigation ───────────────────────────────────
  const isDraggingView = ref(false)
  let swipeStartX = 0, swipeStartY = 0
  let dragStartX  = 0, dragStartY  = 0
  let _dragging   = false
  
  // ── Wheel navigation ──────────────────────────────────────────
  let _wheelTimerX = null, _wheelTimerY = null
  let _wheelDX = 0, _wheelDY = 0
  function onWheelNav(e) {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.4 && Math.abs(e.deltaX) > 5) {
      // Horizontal trackpad swipe
      _wheelDX += e.deltaX
      clearTimeout(_wheelTimerX)
      _wheelTimerX = setTimeout(() => {
        if (Math.abs(_wheelDX) > 30) { _wheelDX > 0 ? next() : prev() }
        _wheelDX = 0
      }, 80)
    } else if (activeView.value === 'month' || activeView.value === 'year') {
      // Vertical scroll only navigates on non-scrolling views
      _wheelDY += e.deltaY
      clearTimeout(_wheelTimerY)
      _wheelTimerY = setTimeout(() => {
        if (Math.abs(_wheelDY) > 40) { _wheelDY > 0 ? next() : prev() }
        _wheelDY = 0
      }, 80)
    }
  }
  
  // Touch swipe
  function onSwipeStart(e) {
    swipeStartX = e.touches[0].clientX
    swipeStartY = e.touches[0].clientY
  }
  function onSwipeEnd(e) {
    const dx = e.changedTouches[0].clientX - swipeStartX
    const dy = e.changedTouches[0].clientY - swipeStartY
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? next() : prev() }
  }
  
  // Mouse drag — mousedown on header, window handles move+up
  function onDragStart(e) {
    if (e.button !== 0) return
    if (e.target.closest('button,input,textarea,select,a,.gc-event-chip,.gc-allday-chip,.gc-mcell-event')) return
    dragStartX = e.clientX
    dragStartY = e.clientY
    _dragging  = true
    // Prevent text selection while dragging
    e.preventDefault()
  }
  function _winMouseMove(e) {
    if (!_dragging) return
    const adx = Math.abs(e.clientX - dragStartX)
    const ady = Math.abs(e.clientY - dragStartY)
    if (adx > 8 && adx > ady * 0.6) isDraggingView.value = true
  }
  function _winMouseUp(e) {
    if (!_dragging) return
    _dragging = false
    isDraggingView.value = false
    const dx  = e.clientX - dragStartX
    const adx = Math.abs(dx)
    const ady = Math.abs(e.clientY - dragStartY)
    // Fire navigation: at least 35px horizontal, more horizontal than vertical
    if (adx > 35 && adx > ady * 0.8) {
      dx < 0 ? next() : prev()
    }
  }
  function onDragEnd(e) { _winMouseUp(e) }
  
  onUnmounted(() => {
    clearInterval(nowTimer)
    window.removeEventListener('mousemove', _winMouseMove)
    window.removeEventListener('mouseup', _winMouseUp)
  })
  </script>
  
  <style scoped>
  /* ── Root ── */
  .gc-root { height:100%; display:flex; flex-direction:column; overflow:hidden; background:var(--bg-base); position:relative; }
  
  /* ══ HEADER ══ */
  .gc-header {
    display:flex; align-items:center; gap:16px;
    padding:8px 16px; flex-shrink:0;
    background:var(--bg-surface); border-bottom:1px solid var(--border-subtle);
  }
  .gc-brand { display:flex; align-items:center; gap:9px; }
  .gc-brand-name { font-size:18px; font-weight:700; color:var(--text-primary); letter-spacing:-.3px; }
  .gc-header-nav { display:flex; align-items:center; gap:4px; }
  .gc-nav-btn {
    width:28px; height:28px; background:none; border:none; border-radius:50%;
    color:var(--text-secondary); cursor:pointer;
    display:flex; align-items:center; justify-content:center; transition:background .12s;
  }
  .gc-nav-btn:hover { background:rgba(255,255,255,.07); }
  .gc-today-btn {
    padding:5px 13px; background:none;
    border:1px solid var(--border-default); border-radius:20px;
    color:var(--text-secondary); font-size:12.5px; cursor:pointer; transition:all .12s;
  }
  .gc-today-btn:hover { background:rgba(255,255,255,.05); }
  .gc-period-label { font-size:17px; font-weight:600; color:var(--text-primary); margin-left:6px; min-width:180px; }
  .gc-view-tabs { display:flex; gap:2px; margin-left:auto; background:var(--bg-elevated); border-radius:10px; padding:3px; }
  .gc-view-tab {
    padding:5px 13px; border:none; background:none; border-radius:8px;
    color:var(--text-secondary); font-size:12.5px; cursor:pointer; transition:all .12s;
  }
  .gc-view-tab:hover { color:var(--text-primary); }
  .gc-view-tab.active { background:var(--bg-surface); color:#1a73e8; font-weight:600; box-shadow:0 1px 4px rgba(0,0,0,.2); }
  .gc-create-btn {
    display:flex; align-items:center; gap:7px;
    padding:9px 18px; background:#1a73e8;
    border:none; border-radius:22px; color:#fff;
    font-size:13px; font-weight:600; cursor:pointer; transition:all .15s;
    box-shadow:0 2px 8px rgba(26,115,232,.35);
  }
  .gc-create-btn:hover { background:#1557b0; transform:translateY(-1px); }
  
  /* ══ TIME VIEW (week/day) ══ */
  .gc-time-view { flex:1; display:flex; flex-direction:column; overflow:hidden; }
  .gc-time-header {
    display:flex; flex-shrink:0;
    border-bottom:1px solid var(--border-subtle);
    background:var(--bg-surface);
  }
  .gc-gutter-head { width:68px; flex-shrink:0; }
  .gc-col-head {
    flex:1; text-align:center; padding:8px 4px;
    display:flex; flex-direction:column; align-items:center; gap:3px;
    border-left:1px solid var(--border-subtle);
  }
  .gc-col-wday { font-size:10.5px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; }
  .gc-col-num  { font-size:22px; line-height:1; color:var(--text-secondary); }
  .gc-col-head.is-today .gc-col-wday { color:#1a73e8; }
  .today-pill {
    background:#1a73e8; color:#fff !important;
    border-radius:50%; display:inline-flex; align-items:center; justify-content:center;
    width:34px; height:34px; font-size:16px;
  }
  .gc-month-num.today-pill, .gc-sched-num.today-pill { width:26px; height:26px; font-size:13px; }
  
  .gc-allday-row {
    display:flex; flex-shrink:0; min-height:28px;
    border-bottom:1px solid var(--border-subtle);
    background:var(--bg-surface);
  }
  .gc-gutter-allday {
    width:68px; flex-shrink:0;
    font-size:9px; color:var(--text-muted); text-align:right; padding:6px 6px 0 0; text-transform:uppercase;
  }
  .gc-allday-col { flex:1; border-left:1px solid var(--border-subtle); padding:3px 2px; display:flex; flex-wrap:wrap; gap:2px; }
  .gc-allday-chip {
    font-size:11px; padding:1px 6px;
    background:#1a73e828; border-left:3px solid #1a73e8;
    border-radius:3px; color:#93c5fd; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;
  }
  
  .gc-time-scroll { flex:1; overflow-y:auto; scrollbar-width:thin; }
  .gc-grid-body { display:flex; }
  .gc-gutter { width:68px; flex-shrink:0; background:var(--bg-base); position:relative; z-index:6; }
  .gc-hour-slot {
    height:48px; display:flex; align-items:flex-start; justify-content:flex-end;
    padding:0 10px; flex-shrink:0;
  }
  .gc-hour-label { font-size:10px; color:var(--text-muted); margin-top:-6px; white-space:nowrap; }
  
  .gc-cols-wrap {
    flex:1; display:flex; position:relative;
    /* horizontal hour lines only inside columns, never the gutter */
    background-image: repeating-linear-gradient(
      to bottom,
      transparent,
      transparent 47px,
      var(--border-subtle) 47px,
      var(--border-subtle) 48px
    );
  }
  .gc-now-line {
    position:absolute; left:0; right:0; height:2px;
    background:#EA4335; z-index:4; pointer-events:none;
  }
  .gc-now-dot {
    width:10px; height:10px; border-radius:50%; background:#EA4335;
    position:absolute; left:-4px; top:-4px;
  }
  .gc-day-col {
    flex:1; position:relative; border-left:1px solid var(--border-subtle);
    min-height: calc(48px * 24);
  }
  .gc-day-col.is-today-col { background:rgba(26,115,232,.025); }
  /* Hour lines overlay (covers all cols) */
  .gc-hour-lines-overlay {
    position:absolute; inset:0; pointer-events:none; z-index:0;
  }
  .gc-event-chip {
    position:absolute; left:2px; right:2px;
    border-left:3px solid; border-radius:4px;
    padding:2px 5px; overflow:hidden; cursor:pointer;
    transition:filter .12s; z-index:2;
  }
  .gc-event-chip:hover { filter:brightness(1.15); }
  .gc-event-chip-title { font-size:11.5px; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .gc-event-chip-time  { font-size:10px; color:var(--text-secondary); }
  
  /* We need the hour lines to span all columns */
  /* Use a pseudo-grid approach */
  .gc-grid-body { display:flex; }
  
  /* ══ MONTH VIEW ══ */
  .gc-month-view { flex:1; display:flex; flex-direction:column; overflow:hidden; }
  .gc-month-wdays {
    display:grid; grid-template-columns:repeat(7,1fr);
    border-bottom:1px solid var(--border-subtle); background:var(--bg-surface); flex-shrink:0;
  }
  .gc-month-wdays > div {
    padding:8px 0; text-align:center;
    font-size:11px; font-weight:700; color:var(--text-muted);
    text-transform:uppercase; letter-spacing:.05em;
  }
  .gc-month-grid {
    flex:1; display:grid; grid-template-columns:repeat(7,1fr);
    grid-auto-rows:minmax(90px,1fr); overflow-y:auto;
  }
  .gc-mcell {
    border-right:1px solid var(--border-subtle);
    border-bottom:1px solid var(--border-subtle);
    padding:4px 5px; cursor:pointer; transition:background .1s;
  }
  .gc-mcell:hover { background:rgba(255,255,255,.03); }
  .gc-mcell.outside { opacity:.3; }
  .gc-mcell.is-today { background:rgba(26,115,232,.05); }
  .gc-mcell-num { font-size:12.5px; color:var(--text-secondary); display:inline-block; margin-bottom:3px; padding:1px; }
  .gc-mcell-events { display:flex; flex-direction:column; gap:2px; }
  .gc-mcell-event {
    font-size:10.5px; padding:1px 5px; border-radius:3px;
    color:var(--text-primary); white-space:nowrap; overflow:hidden;
    text-overflow:ellipsis; display:flex; align-items:center; gap:4px; cursor:pointer;
  }
  .gc-mcell-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
  .gc-mcell-more { font-size:10px; color:var(--text-muted); padding-left:4px; cursor:pointer; }
  
  /* ══ SCHEDULE VIEW ══ */
  .gc-schedule-view { flex:1; overflow-y:auto; padding:8px 0; }
  .gc-schedule-empty {
    display:flex; flex-direction:column; align-items:center;
    justify-content:center; gap:12px; padding:80px 24px; color:var(--text-muted);
  }
  .gc-schedule-empty p { font-size:14px; }
  .gc-sched-group {
    display:flex; gap:0; border-bottom:1px solid var(--border-subtle);
    padding:12px 0;
  }
  .gc-sched-date-col {
    width:80px; flex-shrink:0; padding:0 16px;
    display:flex; flex-direction:column; align-items:center; gap:2px;
    padding-top:6px;
  }
  .gc-sched-wday { font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; }
  .gc-sched-num  { font-size:22px; font-weight:300; color:var(--text-primary); line-height:1; }
  .gc-sched-month { font-size:10px; color:var(--text-muted); }
  .gc-sched-events { flex:1; display:flex; flex-direction:column; gap:6px; padding-right:16px; }
  .gc-sched-event {
    display:flex; gap:12px; padding:10px 14px;
    background:var(--bg-surface); border-radius:10px;
    cursor:pointer; transition:background .12s;
  }
  .gc-sched-event:hover { background:var(--bg-elevated); }
  .gc-sched-bar { width:4px; border-radius:2px; flex-shrink:0; }
  .gc-sched-info { flex:1; }
  .gc-sched-title { font-size:14px; font-weight:600; color:var(--text-primary); margin-bottom:3px; }
  .gc-sched-meta { display:flex; align-items:center; gap:10px; font-size:12px; color:var(--text-muted); }
  .gc-sched-allday { color:#1a73e8; font-weight:500; }
  .gc-sched-loc { display:flex; align-items:center; gap:3px; }
  .gc-sched-guests { display:flex; gap:4px; margin-top:6px; }
  .gc-sched-guest-av {
    width:22px; height:22px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    font-size:9px; font-weight:700; color:#fff;
  }
  .gc-sched-more-guests { font-size:11px; color:var(--text-muted); align-self:center; }
  
  /* ══ EVENT POPOVER ══ */
  .gc-popover-overlay {
    position:absolute; inset:0; z-index:60;
    display:flex; align-items:center; justify-content:center;
    background:rgba(0,0,0,.3); backdrop-filter:blur(2px);
  }
  .gc-popover {
    background:var(--bg-surface); border:1px solid var(--border-default);
    border-radius:14px; width:340px; max-height:80vh; overflow-y:auto;
    box-shadow:0 16px 48px rgba(0,0,0,.5);
  }
  .gc-pop-toolbar {
    display:flex; justify-content:flex-end; gap:4px;
    padding:10px 12px 6px;
  }
  .gc-pop-icon-btn {
    width:30px; height:30px; display:flex; align-items:center; justify-content:center;
    background:none; border:none; border-radius:8px; cursor:pointer;
    color:var(--text-muted); transition:all .12s;
  }
  .gc-pop-icon-btn:hover { background:var(--bg-elevated); color:var(--text-primary); }
  .gc-pop-icon-btn.danger:hover { background:rgba(239,68,68,.1); color:#f87171; }
  .gc-pop-body { padding:0 18px 18px; }
  .gc-pop-title-row { display:flex; align-items:flex-start; gap:10px; margin-bottom:14px; }
  .gc-pop-color-dot { width:12px; height:12px; border-radius:3px; flex-shrink:0; margin-top:4px; }
  .gc-pop-title { font-size:18px; font-weight:700; color:var(--text-primary); margin:0; line-height:1.3; }
  .gc-pop-row { display:flex; align-items:flex-start; gap:12px; margin-bottom:12px; color:var(--text-secondary); }
  .gc-pop-row svg { flex-shrink:0; margin-top:1px; }
  .gc-pop-row-text { flex:1; font-size:13px; line-height:1.5; }
  .gc-pop-sub { font-size:12px; color:var(--text-muted); }
  .gc-meet-btn {
    display:inline-flex; align-items:center; gap:6px;
    font-size:13px; font-weight:500; color:#fff;
    background:#1a73e8; border-radius:8px; padding:7px 14px;
    text-decoration:none; transition:background .12s;
  }
  .gc-meet-btn:hover { background:#1557b0; }
  .guests-row { align-items:flex-start; }
  .gc-pop-guest-count { font-size:12.5px; font-weight:600; color:var(--text-secondary); margin-bottom:8px; }
  .gc-pop-guests-list { display:flex; flex-direction:column; gap:8px; }
  .gc-pop-guest { display:flex; align-items:center; gap:10px; }
  .gc-pop-guest-av {
    width:32px; height:32px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:12px; font-weight:700; color:#fff;
  }
  .gc-pop-guest-info { flex:1; min-width:0; }
  .gc-pop-guest-name { font-size:13px; color:var(--text-primary); font-weight:500; }
  .gc-pop-guest-email { font-size:11px; color:var(--text-muted); }
  .gc-pop-guest-rsvp {
    width:22px; height:22px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center; font-size:11px;
    background:var(--bg-elevated);
  }
  .gc-pop-guest-rsvp.accepted { background:rgba(52,168,83,.15); color:#34a853; }
  .gc-pop-guest-rsvp.declined { background:rgba(213,0,0,.12); color:#D50000; }
  
  /* ══ CREATE MODAL ══ */
  .gc-modal-overlay {
    position:absolute; inset:0; z-index:70;
    display:flex; align-items:center; justify-content:center;
    background:rgba(0,0,0,.4); backdrop-filter:blur(3px);
  }
  .gc-modal {
    background:var(--bg-surface); border:1px solid var(--border-default);
    border-radius:16px; width:520px; max-height:88vh;
    overflow:hidden; display:flex; flex-direction:column;
    box-shadow:0 24px 64px rgba(0,0,0,.6);
  }
  .gc-modal-head {
    display:flex; justify-content:space-between; align-items:center;
    padding:14px 18px; border-bottom:1px solid var(--border-subtle);
    font-size:15px; font-weight:700; color:var(--text-primary); flex-shrink:0;
  }
  .gc-modal-close {
    width:28px; height:28px; display:flex; align-items:center; justify-content:center;
    background:none; border:none; color:var(--text-muted); cursor:pointer;
    border-radius:7px; transition:all .12s;
  }
  .gc-modal-close:hover { background:var(--bg-elevated); color:var(--text-primary); }
  .gc-modal-body { flex:1; overflow-y:auto; overflow-x:visible; padding:16px 18px 8px; display:flex; flex-direction:column; gap:4px; }
  .gc-modal-title-input {
    width:100%; font-size:22px; font-weight:600; color:var(--text-primary);
    background:none; border:none; border-bottom:2px solid var(--border-default);
    padding:6px 0 10px; outline:none; margin-bottom:12px; font-family:inherit;
    transition:border-color .15s;
  }
  .gc-modal-title-input:focus { border-bottom-color:#1a73e8; }
  .gc-modal-title-input::placeholder { color:var(--text-muted); }
  
  .gc-modal-section {
    display:flex; align-items:center; gap:14px;
    padding:8px 0; border-bottom:1px solid var(--border-subtle);
    overflow:visible;
  }
  .gc-modal-section.align-top { align-items:flex-start; }
  .gc-modal-section > svg { flex-shrink:0; color:var(--text-muted); margin-top:1px; }
  .gc-modal-section-body { flex:1; display:flex; flex-direction:column; gap:6px; }
  .gc-dt-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .gc-field {
    background:var(--bg-elevated); border:1px solid var(--border-default);
    border-radius:8px; padding:7px 11px; color:var(--text-primary);
    font-size:13px; outline:none; font-family:inherit; transition:border-color .15s;
  }
  .gc-field:focus { border-color:#1a73e8; }
  .gc-field.flex { flex:1; width:100%; box-sizing:border-box; position:relative; overflow:visible; }
  .gc-field.time { width:90px; }
  .gc-textarea { resize:vertical; min-height:60px; line-height:1.5; }
  .gc-dt-sep { color:var(--text-muted); font-size:14px; }
  .gc-toggle-label {
    display:flex; align-items:center; gap:8px;
    font-size:13px; color:var(--text-secondary); cursor:pointer;
  }
  .gc-checkbox { accent-color:#1a73e8; width:14px; height:14px; }
  
  /* Guests */
  .gc-guest-chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:6px; }
  .gc-guest-chip {
    display:flex; align-items:center; gap:5px;
    padding:3px 8px 3px 4px;
    background:rgba(26,115,232,.12); border-radius:20px;
  }
  .gc-gc-av {
    width:20px; height:20px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    font-size:9px; font-weight:700; color:#fff;
  }
  .gc-gc-name { font-size:12.5px; color:var(--text-primary); }
  .gc-gc-remove {
    background:none; border:none; color:var(--text-muted);
    cursor:pointer; font-size:14px; line-height:1; padding:0 2px;
    transition:color .12s;
  }
  .gc-gc-remove:hover { color:var(--text-primary); }
  .gc-gc-photo { width:100%; height:100%; object-fit:cover; border-radius:50%; display:block; }
  .gc-guest-input-wrap { position:relative; z-index:20; }
  .gc-guest-input {
    width:100%; background:none; border:none; outline:none;
    color:var(--text-primary); font-size:13.5px; font-family:inherit;
    padding:4px 0;
  }
  .gc-guest-input::placeholder { color:var(--text-muted); }
  /* gc-suggest-dropdown moved to global style below (Teleported to body) */
  
  .gc-suggest-item {
    display:flex; align-items:center; gap:10px;
    padding:9px 13px; cursor:pointer; transition:background .1s;
  }
  .gc-suggest-item:hover { background:var(--bg-elevated); }
  .gc-suggest-av {
    width:32px; height:32px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:12px; font-weight:700; color:#fff;
  }
  .gc-suggest-info { flex:1; min-width:0; }
  .gc-suggest-name  { font-size:13px; color:var(--text-primary); font-weight:500; }
  .gc-suggest-email { font-size:11.5px; color:var(--text-muted); }
  
  .gc-meet-row { padding:6px 0; }
  .gc-color-picker { display:flex; flex-wrap:wrap; gap:8px; padding:4px 0; }
  .gc-color-swatch {
    width:24px; height:24px; border-radius:50%; border:none; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    transition:transform .12s, box-shadow .12s;
  }
  .gc-color-swatch:hover { transform:scale(1.15); }
  .gc-color-swatch.selected { box-shadow:0 0 0 2px var(--bg-surface), 0 0 0 4px currentColor; }
  
  .gc-modal-foot {
    display:flex; justify-content:flex-end; align-items:center; gap:10px;
    padding:12px 18px; border-top:1px solid var(--border-subtle); flex-shrink:0;
  }
  .gc-modal-delete {
    display:flex; align-items:center; gap:6px;
    padding:8px 16px; background:rgba(239,68,68,.1);
    border:1px solid rgba(239,68,68,.25); border-radius:20px;
    color:#f87171; font-size:13px; font-weight:500;
    cursor:pointer; transition:all .15s;
  }
  .gc-modal-delete:hover:not(:disabled) { background:rgba(239,68,68,.2); border-color:rgba(239,68,68,.5); }
  .gc-modal-delete:disabled { opacity:.4; cursor:not-allowed; }
  .gc-modal-cancel {
    padding:8px 18px; background:none;
    border:1px solid var(--border-default); border-radius:20px;
    color:var(--text-secondary); font-size:13px; cursor:pointer; transition:all .12s;
  }
  .gc-modal-cancel:hover { border-color:var(--border-strong); color:var(--text-primary); }
  .gc-modal-save {
    display:flex; align-items:center; gap:7px;
    padding:9px 22px; background:#1a73e8; border:none;
    border-radius:20px; color:#fff; font-size:13px; font-weight:600;
    cursor:pointer; transition:all .15s;
  }
  .gc-modal-save:hover:not(:disabled) { background:#1557b0; }
  .gc-modal-save:disabled { opacity:.4; cursor:not-allowed; }
  
  /* ── Spinner ── */
  .gc-spinner {
    display:inline-block; width:16px; height:16px;
    border:2px solid rgba(255,255,255,.3); border-top-color:#fff;
    border-radius:50%; animation:spin .7s linear infinite;
  }
  .gc-spinner.sm { width:12px; height:12px; border-width:1.5px; }
  @keyframes spin { to { transform:rotate(360deg); } }
  
  /* ── Transitions ── */
  .gc-pop-enter-active, .gc-pop-leave-active { transition:opacity .15s; }
  .gc-pop-enter-from,  .gc-pop-leave-to      { opacity:0; }
  .gc-modal-enter-active, .gc-modal-leave-active { transition:opacity .18s, transform .18s; }
  .gc-modal-enter-from,   .gc-modal-leave-to     { opacity:0; transform:scale(.96) translateY(8px); }
  
  
  /* ══ OWNER FIELD ══ */
  .gc-owner-row { flex-direction:column; gap:6px; padding:4px 0; }
  .gc-owner-label { font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; }
  .gc-owner-input-wrap { display:flex; flex-direction:column; gap:4px; width:100%; }
  .gc-owner-input {
    background:var(--bg-elevated); border:1px solid var(--border-default);
    border-radius:8px; padding:7px 11px; color:var(--text-primary);
    font-size:13px; outline:none; font-family:inherit; transition:border-color .15s; width:100%; box-sizing:border-box;
  }
  .gc-owner-input:focus { border-color:#1a73e8; }
  .gc-owner-hint { font-size:11px; color:var(--text-muted); line-height:1.4; }
  
  /* ══ DELETE CONFIRM MODAL ══ */
  .gc-delete-overlay { background:rgba(0,0,0,.5); backdrop-filter:blur(4px); }
  .gc-delete-modal {
    background:var(--bg-surface); border:1px solid var(--border-default);
    border-radius:16px; width:500px; max-width:94vw;
    box-shadow:0 24px 64px rgba(0,0,0,.6);
    overflow:hidden;
  }
  .gc-delete-modal-body { padding:28px 28px 20px; }
  .gc-delete-title {
    font-size:18px; font-weight:600; color:var(--text-primary);
    line-height:1.4; margin-bottom:18px;
  }
  .gc-delete-note {
    width:100%; box-sizing:border-box;
    background:var(--bg-elevated); border:1px solid var(--border-default);
    border-radius:10px; padding:12px 14px;
    color:var(--text-primary); font-size:13.5px; font-family:inherit;
    line-height:1.6; resize:none; outline:none;
    transition:border-color .15s; min-height:90px;
  }
  .gc-delete-note:focus { border-color:#1a73e8; }
  .gc-delete-note::placeholder { color:var(--text-muted); }
  .gc-delete-foot {
    display:flex; align-items:center; gap:8px;
    padding:14px 20px;
    border-top:1px solid var(--border-subtle);
  }
  .gc-delete-help {
    width:32px; height:32px; border-radius:50%; background:none; border:none;
    color:var(--text-muted); cursor:pointer; display:flex; align-items:center;
    justify-content:center; transition:background .12s;
  }
  .gc-delete-help:hover { background:var(--bg-elevated); color:var(--text-primary); }
  .gc-delete-back {
    padding:8px 14px; background:none; border:none;
    color:var(--text-secondary); font-size:13px; cursor:pointer;
    border-radius:8px; transition:background .12s;
  }
  .gc-delete-back:hover { background:var(--bg-elevated); }
  .gc-delete-nosend {
    padding:9px 18px; background:none;
    border:1px solid var(--border-default); border-radius:20px;
    color:var(--text-secondary); font-size:13px; font-weight:500;
    cursor:pointer; transition:all .12s; display:flex; align-items:center; gap:6px;
  }
  .gc-delete-nosend:hover:not(:disabled) { border-color:var(--border-strong); color:var(--text-primary); }
  .gc-delete-nosend:disabled { opacity:.4; cursor:not-allowed; }
  .gc-delete-send {
    padding:9px 22px; background:#1a73e8; border:none;
    border-radius:20px; color:#fff; font-size:13px; font-weight:600;
    cursor:pointer; transition:all .15s; display:flex; align-items:center; gap:6px;
    box-shadow:0 2px 8px rgba(26,115,232,.35);
  }
  .gc-delete-send:hover:not(:disabled) { background:#1557b0; }
  .gc-delete-send:disabled { opacity:.4; cursor:not-allowed; }
  
  
  /* ══ ROOT LAYOUT — sidebar + main ══ */
  .gc-root { flex-direction:row !important; }
  .gc-main {
    flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0;
  }
  
  /* ══ PEOPLE PANEL ══ */
  .gc-people-panel {
    width:0; flex-shrink:0; overflow:hidden;
    background:var(--bg-surface);
    border-right:1px solid var(--border-subtle);
    display:flex; flex-direction:column;
    transition:width .22s cubic-bezier(.4,0,.2,1);
  }
  .gc-people-panel.open { width:280px; }
  .gc-pp-head {
    display:flex; align-items:center; justify-content:space-between;
    padding:14px 16px 8px; flex-shrink:0;
  }
  .gc-pp-title { font-size:13px; font-weight:700; color:var(--text-primary); }
  .gc-pp-close {
    width:26px; height:26px; display:flex; align-items:center; justify-content:center;
    background:none; border:none; border-radius:50%; color:var(--text-muted);
    cursor:pointer; transition:background .12s;
  }
  .gc-pp-close:hover { background:var(--bg-elevated); }
  .gc-pp-search-wrap {
    display:flex; align-items:center; gap:8px; margin:0 12px 8px;
    background:var(--bg-elevated); border:1px solid var(--border-default);
    border-radius:24px; padding:7px 12px; flex-shrink:0;
    transition:border-color .15s;
  }
  .gc-pp-search-wrap:focus-within { border-color:#1a73e8; }
  .gc-pp-search-icon { color:var(--text-muted); flex-shrink:0; }
  .gc-pp-search {
    flex:1; background:none; border:none; outline:none;
    color:var(--text-primary); font-size:13px; font-family:inherit;
  }
  .gc-pp-search::placeholder { color:var(--text-muted); }
  .gc-pp-clear {
    background:none; border:none; color:var(--text-muted); cursor:pointer;
    display:flex; align-items:center; padding:0; transition:color .12s;
  }
  .gc-pp-clear:hover { color:var(--text-primary); }
  .gc-pp-results {
    flex-shrink:0; background:var(--bg-surface);
    border:1px solid var(--border-default); border-radius:12px;
    margin:0 12px 8px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,.3);
  }
  .gc-pp-result-item {
    display:flex; align-items:center; gap:10px;
    padding:9px 12px; cursor:pointer; transition:background .1s;
  }
  .gc-pp-result-item:hover { background:var(--bg-elevated); }
  .gc-pp-av {
    width:34px; height:34px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:13px; font-weight:700; color:#fff;
  }
  .gc-pp-av.sm { width:24px; height:24px; font-size:10px; }
  .gc-pp-result-info { flex:1; min-width:0; }
  .gc-pp-result-name { font-size:13px; font-weight:500; color:var(--text-primary); }
  .gc-pp-result-email { font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  
  .gc-pp-selected-chip {
    display:flex; align-items:center; gap:8px;
    margin:0 12px 8px; padding:6px 10px;
    background:rgba(26,115,232,.1); border-radius:20px;
    border:1px solid rgba(26,115,232,.2); flex-shrink:0;
  }
  .gc-pp-chip-name { flex:1; font-size:12.5px; font-weight:600; color:#4C9AFF; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .gc-pp-chip-remove {
    background:none; border:none; color:#4C9AFF; cursor:pointer;
    font-size:16px; line-height:1; padding:0 2px; opacity:.7; transition:opacity .12s;
  }
  .gc-pp-chip-remove:hover { opacity:1; }
  
  .gc-pp-events { flex:1; overflow-y:auto; padding:0 0 8px; }
  .gc-pp-loading { display:flex; align-items:center; gap:8px; padding:16px; font-size:12.5px; color:var(--text-muted); }
  .gc-pp-empty { padding:24px 16px; text-align:center; font-size:12.5px; color:var(--text-muted); }
  .gc-pp-events-label { font-size:10.5px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; padding:8px 16px 4px; }
  .gc-pp-event-row {
    display:flex; align-items:flex-start; gap:10px;
    padding:8px 16px; cursor:pointer; transition:background .1s;
  }
  .gc-pp-event-row:hover { background:var(--bg-elevated); }
  .gc-pp-event-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; margin-top:5px; }
  .gc-pp-event-info { flex:1; min-width:0; }
  .gc-pp-event-title { font-size:12.5px; font-weight:600; color:var(--text-primary); }
  .gc-pp-event-time { font-size:11px; color:var(--text-muted); margin-top:2px; }
  
  .gc-pp-placeholder {
    flex:1; display:flex; flex-direction:column; align-items:center;
    justify-content:center; gap:10px; padding:24px 20px; text-align:center;
  }
  .gc-pp-placeholder p { font-size:12px; color:var(--text-muted); line-height:1.5; }
  
  /* People toggle button in header */
  .gc-people-btn {
    width:36px; height:36px; display:flex; align-items:center; justify-content:center;
    background:none; border:1px solid var(--border-default); border-radius:50%;
    color:var(--text-secondary); cursor:pointer; transition:all .15s; flex-shrink:0;
  }
  .gc-people-btn:hover { background:rgba(255,255,255,.06); color:var(--text-primary); }
  .gc-people-btn.active { background:rgba(26,115,232,.12); border-color:rgba(26,115,232,.4); color:#4C9AFF; }
  
  
  
  
  /* ══ HOLIDAY INDICATORS ══ */
  .gc-mcell-top { display:flex; align-items:flex-start; justify-content:space-between; gap:3px; min-height:22px; }
  .gc-mcell-holiday {
    font-size:9px; font-weight:600; color:#e67e22;
    line-height:1.2; text-align:right; flex:1; word-break:break-word;
    padding-top:2px; overflow:hidden; display:-webkit-box;
    -webkit-line-clamp:2; -webkit-box-orient:vertical;
  }
  .gc-mcell.is-holiday { background: rgba(230,126,34,.05); }
  .gc-mcell.is-holiday .gc-mcell-num { color:#e67e22; }
  /* Holiday in week/day header */
  .gc-col-holiday {
    font-size:9px; font-weight:600; color:#e67e22;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    max-width:90%; text-align:center; margin-top:1px;
  }
  
  /* ══ PERSON COLUMNS ══ */
  .gc-col-person-av {
    width:32px; height:32px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:12px; font-weight:700; color:#fff; margin-bottom:3px;
  }
  .gc-col-person-name {
    font-size:11px; font-weight:600; color:var(--text-secondary);
    max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .gc-person-col-head { background:rgba(255,255,255,.02); }
  .gc-person-day-col { background:rgba(255,255,255,.01); }
  
  
  
  /* ══ UPDATED PEOPLE PANEL CSS ══ */
  .gc-pp-chips-wrap {
    display:flex; flex-direction:column; gap:5px;
    padding:0 12px 6px; flex-shrink:0;
  }
  .gc-pp-chip {
    display:flex; align-items:center; gap:8px;
    padding:5px 8px; border-radius:20px;
    background:var(--bg-elevated); border:1px solid var(--border-default);
  }
  .gc-pp-chip-av {
    width:24px; height:24px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:10px; font-weight:700; color:#fff;
  }
  .gc-pp-chip-label {
    flex:1; font-size:12px; font-weight:500; color:var(--text-primary);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .gc-pp-chip-x {
    background:none; border:none; color:var(--text-muted);
    cursor:pointer; font-size:15px; line-height:1; padding:0 2px;
    transition:color .1s;
  }
  .gc-pp-chip-x:hover { color:var(--text-primary); }
  .gc-pp-add-icon { color:var(--text-muted); flex-shrink:0; }
  .gc-pp-all-added { padding:10px 14px; font-size:12px; color:var(--text-muted); text-align:center; }
  .gc-pp-person-section { padding:4px 0; }
  .gc-pp-person-header {
    display:flex; align-items:center; gap:7px;
    padding:6px 16px 3px; font-size:11px; font-weight:700;
    color:var(--text-muted); text-transform:uppercase; letter-spacing:.04em;
  }
  .gc-pp-person-name { flex:1; }
  .gc-pp-av.xs { width:18px; height:18px; font-size:8px; }
  .gc-pp-person-empty { font-size:11.5px; color:var(--text-muted); padding:4px 16px 8px; }
  
  
  /* ══ CURSOR / DRAG — FINAL ══ */
  .gc-time-view, .gc-month-view, .gc-year-view { position:relative; }
  .gc-time-view:not(.dragging) .gc-time-header,
  .gc-time-view:not(.dragging) .gc-allday-row { cursor:ew-resize; }
  .gc-month-view:not(.dragging) .gc-month-grid,
  .gc-year-view:not(.dragging) .gc-year-grid { cursor:ew-resize; }
  .gc-time-view.dragging,
  .gc-month-view.dragging,
  .gc-year-view.dragging { cursor:grabbing !important; user-select:none; }
  .gc-time-view.dragging *,
  .gc-month-view.dragging *,
  .gc-year-view.dragging * { cursor:grabbing !important; pointer-events:none; }
  .gc-time-scroll { cursor:default !important; }
  .gc-event-chip, .gc-allday-chip, .gc-mcell-event, button, input, textarea, a { cursor:pointer !important; }
  
  /* ══ TODAY BUTTON — greyed when already on today ══ */
  .gc-today-btn.on-today { opacity:.45; pointer-events:none; }
  
  /* ══ YEAR VIEW ══ */
  .gc-year-view { flex:1; overflow-y:auto; padding:16px 20px; }
  .gc-year-grid {
    display:grid; grid-template-columns:repeat(4, 1fr);
    gap:28px 32px;
  }
  @media (max-width:900px) { .gc-year-grid { grid-template-columns:repeat(3,1fr); } }
  @media (max-width:600px) { .gc-year-grid { grid-template-columns:repeat(2,1fr); } }
  .gc-year-month { display:flex; flex-direction:column; gap:4px; }
  .gc-year-month-label {
    font-size:13px; font-weight:700; color:var(--text-primary);
    margin-bottom:4px; cursor:pointer; transition:color .12s;
  }
  .gc-year-month-label:hover { color:#1a73e8; }
  .gc-year-mini-wdays {
    display:grid; grid-template-columns:repeat(7,1fr);
    margin-bottom:2px;
  }
  .gc-year-mini-wdays span {
    font-size:9px; font-weight:700; color:var(--text-muted);
    text-align:center; text-transform:uppercase;
  }
  .gc-year-mini-grid {
    display:grid; grid-template-columns:repeat(7,1fr);
    gap:1px 0;
  }
  .gc-year-cell {
    display:flex; flex-direction:column; align-items:center;
    padding:2px 0; border-radius:4px; cursor:pointer;
    transition:background .1s; min-width:0;
  }
  .gc-year-cell:hover:not(.outside) { background:rgba(255,255,255,.06); }
  .gc-year-cell.outside { opacity:.2; pointer-events:none; }
  .gc-year-cell.is-today .gc-year-cell-num {
    background:#1a73e8; color:#fff; border-radius:50%;
    width:20px; height:20px; display:flex; align-items:center; justify-content:center;
  }
  .gc-year-cell.is-holiday:not(.outside) .gc-year-cell-num { color:#e67e22; }
  .gc-year-cell-num { font-size:10.5px; color:var(--text-secondary); line-height:1; padding:2px; }
  .gc-year-holiday-dot { width:4px; height:4px; border-radius:50%; background:#e67e22; margin:1px auto 0; display:block; }
  
  /* ══ SCHEDULE — holiday row style ══ */
  .gc-sched-event.gc-sched-holiday { background:rgba(15,157,88,.06); border-radius:8px; }
  .gc-sched-holiday .gc-sched-bar { background:#0f9d58; }
  .gc-sched-holiday .gc-sched-title { color:#0f9d58; font-weight:700; }
  
  
  /* ══ SCHEDULE — month header ══ */
  .gc-sched-month-header {
    font-size:13px; font-weight:700; color:var(--text-primary);
    padding:14px 24px 6px;
    border-bottom:1px solid var(--border-subtle);
    position:sticky; top:0; background:var(--bg-base); z-index:4;
    letter-spacing:-.2px;
  }
  
  /* ══ SCHEDULE — loading bar ══ */
  .gc-sched-loading-bar {
    height:3px; background:var(--border-subtle); overflow:hidden; flex-shrink:0;
  }
  .gc-sched-loading-inner {
    height:100%; width:40%; background:#1a73e8;
    animation:sched-slide 1.2s ease-in-out infinite;
  }
  @keyframes sched-slide {
    0%   { transform:translateX(-100%); }
    100% { transform:translateX(350%); }
  }
  
  /* ══ SCHEDULE — load more button ══ */
  .gc-sched-load-more {
    display:flex; align-items:center; justify-content:center; gap:8px;
    padding:20px; cursor:pointer;
    font-size:13px; color:#1a73e8; font-weight:500;
    transition:opacity .12s;
  }
  .gc-sched-load-more:hover { opacity:.7; }
  
  /* ══ SCHEDULE — remove month from date col (now in header) ══ */
  .gc-sched-date-col { padding-top:4px; }
  
  </style>
  
  <!-- Global styles for Teleported elements (not scoped) -->
  <style>
  .gc-suggest-loading {
    display:flex; align-items:center; gap:8px;
    padding:10px 14px; font-size:12.5px; color:var(--text-muted);
  }
  .gc-suggest-hint {
    display:flex; align-items:center; gap:8px;
    padding:10px 14px; font-size:13px; color:#1a73e8;
    cursor:pointer; transition:background .1s;
  }
  .gc-suggest-hint:hover { background:var(--bg-elevated); }
  .gc-suggest-dropdown-fixed {
    background: var(--bg-surface, #1e1e2e);
    border: 1px solid var(--border-default, rgba(255,255,255,.12));
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0,0,0,.6);
    overflow: hidden;
    max-height: 240px;
    overflow-y: auto;
  }
  .gc-suggest-dropdown-fixed .gc-suggest-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px; cursor: pointer;
    transition: background .1s;
  }
  .gc-suggest-dropdown-fixed .gc-suggest-item:hover {
    background: var(--bg-elevated, rgba(255,255,255,.06));
  }
  .gc-suggest-dropdown-fixed .gc-suggest-av {
    width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: #fff;
  }
  .gc-suggest-dropdown-fixed .gc-suggest-info { flex: 1; min-width: 0; }
  .gc-suggest-dropdown-fixed .gc-suggest-name {
    font-size: 13px; color: var(--text-primary, #e8eaed); font-weight: 500;
  }
  .gc-suggest-dropdown-fixed .gc-suggest-email {
    font-size: 11.5px; color: var(--text-muted, #9aa0a6);
  }
  </style>