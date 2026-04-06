<template>
  <div class="jr-root" ref="rootEl" @keydown.escape="handleEsc">

    <!-- ══ PROJECT HEADER ════════════════════════════════════════ -->
    <div class="jr-topbar">
      <div class="jr-topbar-left">
        <div class="jr-project-logo">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#fff" d="M11.571 11.513H0a5.218 5.218 0 005.232 5.215h2.13v2.057A5.215 5.215 0 0012.575 24V12.518a1.005 1.005 0 00-1.004-1.005zm5.723-5.756H5.757a5.215 5.215 0 005.215 5.214h2.129v2.058a5.218 5.218 0 005.215 5.214V6.762a1.005 1.005 0 00-1.022-1.005zM23.013 0H11.455a5.215 5.215 0 005.215 5.215h2.129v2.057A5.215 5.215 0 0024.019 12.49V1.005A1.001 1.001 0 0023.013 0z"/>
          </svg>
        </div>
        <div>
          <div class="jr-project-title">{{ projectName || 'Jira Board' }}</div>
          <div class="jr-breadcrumb">
            <span>Projects</span><span class="jr-bc-sep">/</span>
            <span class="jr-bc-active">{{ projectKey || 'ENGG' }}</span>
          </div>
        </div>

        <!-- Project selector dropdown -->
        <div class="jr-proj-simple" v-if="projects.length > 1">
          <select v-model="selectedProject" class="jr-view-sel" @change="loadBoard()" style="font-size:12px;max-width:180px">
            <option value="">🌐 All Projects</option>
            <option v-for="p in projects" :key="p.key" :value="p.key">{{ p.name }} ({{ p.key }})</option>
          </select>
        </div>
      </div>

      <!-- View tabs -->
      <nav class="jr-nav">
        <button v-for="tab in TABS" :key="tab.id"
          :class="['jr-nav-tab', activeTab === tab.id && 'active']"
          @click="switchTab(tab.id)">
          <span class="jr-nav-icon">{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
        </button>
      </nav>

      <!-- Top-right actions -->
      <div class="jr-topbar-right">
        <button class="jr-icon-btn" @click="refreshData" title="Refresh (R)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ 'spin': loading }">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
        <button class="jr-create-btn" @click="openCreate()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create
        </button>
      </div>
    </div>

    <!-- ══ FILTER / SEARCH BAR ════════════════════════════════════ -->
    <div class="jr-toolbar">
      <div class="jr-search-wrap">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="jr-si"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input v-model="searchQ" class="jr-search" placeholder="Search tickets…" @keydown.escape="searchQ = ''"/>
        <kbd v-if="!searchQ" class="jr-kbd">/</kbd>
      </div>

      <div class="jr-filters-row">
        <div class="jr-filter-wrap" ref="filterRef">
          <button class="jr-filter-btn" :class="{ active: hasFilters }" @click="showFilters = !showFilters">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
            Filters<span v-if="activeFilterCount > 0" class="jr-filter-count">{{ activeFilterCount }}</span>
          </button>
          <transition name="jr-pop">
            <div v-if="showFilters" class="jr-filter-panel" @click.stop>
              <div class="jr-fp-head">Filters <button @click="clearFilters">Clear all</button></div>
              <div class="jr-fp-section">
                <label>Priority</label>
                <div class="jr-fp-pills">
                  <button v-for="p in PRIORITIES" :key="p.v"
                    :class="['jr-fp-pill', filterPriority.includes(p.v) && 'on']"
                    @click="toggleFilter('filterPriority', p.v)">
                    <span :class="'fp-dot fp-' + p.v"></span>{{ p.l }}
                  </button>
                </div>
              </div>
              <div class="jr-fp-section">
                <label>Type</label>
                <div class="jr-fp-pills">
                  <button v-for="t in TYPES" :key="t"
                    :class="['jr-fp-pill', filterType.includes(t) && 'on']"
                    @click="toggleFilter('filterType', t)">
                    {{ typeIcon(t) }} {{ t }}
                  </button>
                </div>
              </div>
              <div class="jr-fp-section">
                <label>Assignee</label>
                <div class="jr-fp-pills">
                  <button v-for="a in assigneeList" :key="a"
                    :class="['jr-fp-pill', filterAssignee.includes(a) && 'on']"
                    @click="toggleFilter('filterAssignee', a)">
                    <span class="jr-av-xs" :style="{ background: avColor(a) }">{{ avInit(a) }}</span>{{ a.split(' ')[0] }}
                  </button>
                </div>
              </div>
              <div class="jr-fp-section">
                <label>Sprint</label>
                <select v-model="filterSprint" class="jr-fp-sel">
                  <option value="">All sprints</option>
                  <option v-for="s in sprintNames" :key="s" :value="s">{{ s }}</option>
                </select>
              </div>
            </div>
          </transition>
        </div>

        <!-- Active filter tags -->
        <template v-if="hasFilters">
          <span v-for="p in filterPriority" :key="'p'+p" class="jr-active-tag" @click="toggleFilter('filterPriority', p)">
            <span :class="'fp-dot fp-' + p"></span>{{ p }} ✕
          </span>
          <span v-for="t in filterType" :key="'t'+t" class="jr-active-tag" @click="toggleFilter('filterType', t)">
            {{ typeIcon(t) }} {{ t }} ✕
          </span>
          <span v-for="a in filterAssignee" :key="'a'+a" class="jr-active-tag" @click="toggleFilter('filterAssignee', a)">
            {{ a.split(' ')[0] }} ✕
          </span>
          <span v-if="filterSprint" class="jr-active-tag" @click="filterSprint = ''">
            🏃 {{ filterSprint }} ✕
          </span>
        </template>
      </div>

      <div style="flex:1"></div>

      <template v-if="activeTab === 'board'">
        <div class="jr-groupby-wrap">
          <span class="jr-groupby-lbl">Group by</span>
          <select v-model="boardGroupBy" class="jr-view-sel">
            <option value="none">Status</option>
            <option value="assignee">Assignee</option>
            <option value="priority">Priority</option>
          </select>
        </div>
      </template>

      <div class="jr-mini-stats">
        <span class="jr-ms" title="Total">
          <strong>{{ allTickets.length }}</strong>
          <span v-if="totalTickets > allTickets.length" class="jr-total-real"> / {{ totalTickets }}</span>
          total
        </span>
        <span class="jr-ms text-orange" title="In Progress"><strong>{{ inProgCount }}</strong> active</span>
        <span class="jr-ms text-red" title="Overdue"><strong>{{ overdueTickets.length }}</strong> overdue</span>
        <span class="jr-ms text-green" title="Done"><strong>{{ doneCount }}</strong> done</span>
      </div>
    </div>

    <!-- ══ LOADING ════════════════════════════════════════════════ -->
    <div v-if="loading && !allTickets.length" class="jr-full-load">
      <div class="jr-load-ring"></div>
      <span>Loading Jira…</span>
    </div>

    <!-- ══ ERROR ══════════════════════════════════════════════════ -->
    <div v-else-if="error" class="jr-full-err">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p>{{ error }}</p>
      <button class="jr-create-btn" @click="refreshData">Try Again</button>
    </div>

    <template v-else>

      <!-- ══ BOARD VIEW ═════════════════════════════════════════ -->
      <div v-if="activeTab === 'board'" class="jr-board-wrap">
        <div v-if="boardGroupBy === 'none'" class="jr-board">
          <div v-for="col in boardColumns" :key="col.id" class="jr-column"
            :class="{ 'drag-over': dragOverCol === col.id }"
            @dragover.prevent="dragOverCol = col.id"
            @dragleave.self="dragOverCol = null"
            @drop.prevent="onDrop(col.id)">
            <div class="jr-col-head">
              <div class="jr-col-hl" :style="{ background: col.color }"></div>
              <span class="jr-col-name">{{ col.label }}</span>
              <span class="jr-col-cnt">{{ col.tickets.length }}</span>
              <button class="jr-col-add-btn" @click="openCreate(col.id)" title="Add ticket">＋</button>
            </div>
            <div class="jr-col-body">
              <div v-if="!col.tickets.length" class="jr-col-empty" @click="openCreate(col.id)">＋ Add ticket</div>
              <div v-for="t in col.tickets" :key="t.key"
                class="jr-card" :class="{ overdue: t.overdue, dragging: draggedKey === t.key }"
                draggable="true"
                @dragstart="draggedKey = t.key"
                @dragend="draggedKey = null; dragOverCol = null"
                @click="openDetail(t)">
                <div class="jr-card-head">
                  <span class="jr-card-type">{{ typeIcon(t.type) }}</span>
                  <span class="jr-card-key">{{ t.key }}</span>
                  <div style="flex:1"></div>
                  <span class="jr-card-pri" :class="'pri-' + nPri(t.priority)" :title="t.priority"></span>
                </div>
                <div class="jr-card-title">{{ t.title }}</div>
                <div v-if="t.labels?.length" class="jr-card-labels">
                  <span v-for="l in t.labels.slice(0,2)" :key="l" class="jr-lbl">{{ l }}</span>
                </div>
                <div class="jr-card-foot">
                  <span v-if="t.overdue" class="jr-overdue-chip">⚠ {{ t.daysOverdue }}d</span>
                  <span v-else-if="t.dueDate" class="jr-due-chip">{{ fmtShort(t.dueDate) }}</span>
                  <div style="flex:1"></div>
                  <div v-if="t.assignee && t.assignee !== 'Unassigned'" class="jr-av-sm"
                    :style="{ background: avColor(t.assignee) }" :title="t.assignee">{{ avInit(t.assignee) }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- FIX: Swimlanes with proper overflow-x scroll wrapper + correct div nesting -->
        <div v-else class="jr-swimlanes">
          <div v-for="(group, gname) in swimlaneGroups" :key="gname" class="jr-swimlane">
            <div class="jr-swimlane-head" @click="toggleSwimlane(gname)">
              <svg :style="{ transform: collapsedSwimlanes.has(gname) ? 'rotate(-90deg)' : '', transition: 'transform .15s', flexShrink: 0 }"
                width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              <div v-if="boardGroupBy === 'assignee'" class="jr-av-sm" :style="{ background: avColor(gname) }">{{ avInit(gname) }}</div>
              <span class="jr-sl-name">{{ gname }}</span>
              <span class="jr-col-cnt">{{ group.reduce((s, col) => s + col.tickets.length, 0) }}</span>
            </div>
            <!-- Collapsible: hide columns when group is collapsed -->
            <div v-if="!collapsedSwimlanes.has(gname)" class="jr-swimlane-cols-wrap">
              <div class="jr-swimlane-cols">
                <div v-for="col in group" :key="col.id" class="jr-sl-col"
                  :class="{ 'drag-over': dragOverCol === gname + ':' + col.id }"
                  @dragover.prevent="dragOverCol = gname + ':' + col.id"
                  @dragleave.self="dragOverCol = null"
                  @drop.prevent="onDrop(col.id)">
                  <div class="jr-sl-col-head">
                    <span class="jr-col-hl" :style="{ background: col.color }"></span>
                    {{ col.label }}
                    <span class="jr-col-cnt">{{ col.tickets.length }}</span>
                  </div>
                  <div v-if="!col.tickets.length" class="jr-col-empty sm">Empty</div>
                  <div v-for="t in col.tickets" :key="t.key"
                    class="jr-card compact" draggable="true"
                    @dragstart="draggedKey = t.key"
                    @dragend="draggedKey = null; dragOverCol = null"
                    @click="openDetail(t)">
                    <span class="jr-card-key">{{ t.key }}</span>
                    <span class="jr-card-title compact">{{ t.title }}</span>
                    <span class="jr-card-pri" :class="'pri-' + nPri(t.priority)"></span>
                  </div>
                </div>
              </div>
            </div><!-- /.jr-swimlane-cols-wrap (v-if) -->
          </div>
        </div>
      </div>

      <!-- ══ BACKLOG VIEW ═══════════════════════════════════════ -->
      <div v-else-if="activeTab === 'backlog'" class="jr-backlog-wrap">
        <div class="jr-bl-toolbar">
          <span class="jr-bl-count">{{ filteredTickets.length }} issues</span>
          <div style="flex:1"></div>
          <label class="jr-tbl-lbl">Sort</label>
          <select v-model="blSort" class="jr-view-sel">
            <option value="updated">Last updated</option>
            <option value="priority">Priority</option>
            <option value="due">Due date</option>
            <option value="created">Created</option>
            <option value="key">Key</option>
          </select>
          <label class="jr-tbl-lbl">Group</label>
          <select v-model="blGroup" class="jr-view-sel">
            <option value="none">None</option>
            <option value="status">Status</option>
            <option value="priority">Priority</option>
            <option value="assignee">Assignee</option>
            <option value="sprint">Sprint</option>
          </select>
          <button class="jr-icon-btn" @click="openCreate()" title="Create issue (C)">＋</button>
        </div>

        <!-- Table header — FIX: added tc-reporter column -->
        <div class="jr-tbl-head">
          <div class="jr-tc tc-type"></div>
          <div class="jr-tc tc-key" @click="blSort = blSort === 'key' ? '-key' : 'key'" style="cursor:pointer">
            Key <span class="jr-sort-arrow">{{ blSort.includes('key') ? '↕' : '' }}</span>
          </div>
          <div class="jr-tc tc-title">Summary</div>
          <div class="jr-tc tc-status">Status</div>
          <div class="jr-tc tc-pri" @click="blSort = blSort === 'priority' ? '-priority' : 'priority'" style="cursor:pointer">
            Priority <span class="jr-sort-arrow">{{ blSort.includes('priority') ? '↕' : '' }}</span>
          </div>
          <div class="jr-tc tc-assign">Assignee</div>
          <div class="jr-tc tc-reporter">Reporter</div>
          <div class="jr-tc tc-due" @click="blSort = blSort === 'due' ? '-due' : 'due'" style="cursor:pointer">
            Due <span class="jr-sort-arrow">{{ blSort.includes('due') ? '↕' : '' }}</span>
          </div>
          <div class="jr-tc tc-sprint">Sprint</div>
        </div>

        <!-- FIX: no v-else+v-for on same element — use template wrapper -->
        <div class="jr-tbl-body">
          <template v-if="blGroup === 'none'">
            <div v-for="t in sortedBacklog" :key="t.key"
              class="jr-tbl-row" :class="{ overdue: t.overdue }"
              @click="openDetail(t)">
              <div class="jr-tc tc-type"><span class="jr-type-sm">{{ typeIcon(t.type) }}</span></div>
              <div class="jr-tc tc-key"><span class="jr-key-lnk">{{ t.key }}</span></div>
              <div class="jr-tc tc-title">
                <span class="jr-row-title">{{ t.title }}</span>
                <div v-if="t.labels?.length" class="jr-row-lbls">
                  <span v-for="l in t.labels.slice(0,2)" :key="l" class="jr-lbl xs">{{ l }}</span>
                </div>
              </div>
              <div class="jr-tc tc-status"><span class="jr-sbadge" :class="sCls(t.status)">{{ t.status }}</span></div>
              <div class="jr-tc tc-pri">
                <span class="jr-card-pri" :class="'pri-' + nPri(t.priority)"></span>
                <span class="jr-pri-lbl">{{ t.priority }}</span>
              </div>
              <div class="jr-tc tc-assign">
                <template v-if="t.assignee && t.assignee !== 'Unassigned'">
                  <div class="jr-av-xs" :style="{ background: avColor(t.assignee) }" :title="t.assignee">{{ avInit(t.assignee) }}</div>
                  <span class="jr-assign-name">{{ t.assignee.split(' ')[0] }}</span>
                </template>
                <span v-else class="jr-none">—</span>
              </div>
              <!-- FIX: reporter column -->
              <div class="jr-tc tc-reporter">
                <span v-if="t.reporter" class="jr-assign-name">{{ t.reporter.split(' ')[0] }}</span>
                <span v-else class="jr-none">—</span>
              </div>
              <div class="jr-tc tc-due">
                <span v-if="t.overdue" class="jr-due-red">⚠ {{ t.daysOverdue }}d</span>
                <span v-else-if="t.dueDate" class="jr-due-ok">{{ fmtShort(t.dueDate) }}</span>
                <span v-else class="jr-none">—</span>
              </div>
              <div class="jr-tc tc-sprint">
                <span v-if="t.sprint" class="jr-sprint-tag">{{ t.sprint }}</span>
                <span v-else class="jr-none">—</span>
              </div>
            </div>
          </template>

          <template v-else>
            <div v-for="(items, gkey) in groupedBacklog" :key="gkey">
              <div class="jr-group-row" @click="toggleGroup(gkey)">
                <svg :style="{ transform: collapsedGroups.has(gkey) ? 'rotate(-90deg)' : '', transition: 'transform .15s' }"
                  width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                <span class="jr-group-title">{{ gkey }}</span>
                <span class="jr-col-cnt">{{ items.length }}</span>
                <span v-if="items.filter(t=>t.overdue).length" class="jr-overdue-cnt">
                  {{ items.filter(t=>t.overdue).length }} overdue
                </span>
              </div>
              <template v-if="!collapsedGroups.has(gkey)">
                <div v-for="t in items" :key="t.key"
                  class="jr-tbl-row sub" :class="{ overdue: t.overdue }"
                  @click="openDetail(t)">
                  <div class="jr-tc tc-type"><span class="jr-type-sm">{{ typeIcon(t.type) }}</span></div>
                  <div class="jr-tc tc-key"><span class="jr-key-lnk">{{ t.key }}</span></div>
                  <div class="jr-tc tc-title"><span class="jr-row-title">{{ t.title }}</span></div>
                  <div class="jr-tc tc-status"><span class="jr-sbadge" :class="sCls(t.status)">{{ t.status }}</span></div>
                  <div class="jr-tc tc-pri">
                    <span class="jr-card-pri" :class="'pri-' + nPri(t.priority)"></span>
                    <span class="jr-pri-lbl">{{ t.priority }}</span>
                  </div>
                  <div class="jr-tc tc-assign">
                    <template v-if="t.assignee && t.assignee !== 'Unassigned'">
                      <div class="jr-av-xs" :style="{ background: avColor(t.assignee) }">{{ avInit(t.assignee) }}</div>
                      <span class="jr-assign-name">{{ t.assignee.split(' ')[0] }}</span>
                    </template>
                    <span v-else class="jr-none">—</span>
                  </div>
                  <div class="jr-tc tc-reporter">
                    <span v-if="t.reporter" class="jr-assign-name">{{ t.reporter.split(' ')[0] }}</span>
                    <span v-else class="jr-none">—</span>
                  </div>
                  <div class="jr-tc tc-due">
                    <span v-if="t.overdue" class="jr-due-red">⚠ {{ t.daysOverdue }}d</span>
                    <span v-else-if="t.dueDate" class="jr-due-ok">{{ fmtShort(t.dueDate) }}</span>
                    <span v-else class="jr-none">—</span>
                  </div>
                  <div class="jr-tc tc-sprint">
                    <span v-if="t.sprint" class="jr-sprint-tag">{{ t.sprint }}</span>
                    <span v-else class="jr-none">—</span>
                  </div>
                </div>
              </template>
            </div>
          </template>

          <div v-if="!filteredTickets.length" class="jr-tbl-empty">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".25"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            <p>No issues match your filters</p>
            <button class="jr-create-btn" @click="clearFilters">Clear filters</button>
          </div>
        </div>
      </div>

      <!-- ══ ACTIVE SPRINTS VIEW ════════════════════════════════ -->
      <div v-else-if="activeTab === 'sprints'" class="jr-sprints-wrap">
        <div v-if="loadingSprints" class="jr-full-load"><div class="jr-load-ring"></div><span>Loading sprints…</span></div>
        <template v-else-if="sprints.length">
          <div v-for="sprint in sprints" :key="sprint.id" class="jr-sprint-card">
            <div class="jr-sprint-header">
              <div class="jr-sprint-header-left">
                <span :class="['jr-sprint-state', sprint.state]">{{ sprint.state === 'active' ? '🟢 Active' : '✅ Completed' }}</span>
                <span class="jr-sprint-name">{{ sprint.name }}</span>
                <span v-if="sprint.state === 'active' && sprint.daysLeft >= 0" class="jr-days-left">{{ sprint.daysLeft }}d left</span>
              </div>
              <div class="jr-sprint-dates" v-if="sprint.startDate">
                {{ fmtDate(sprint.startDate) }} → {{ fmtDate(sprint.endDate) }}
              </div>
            </div>
            <div class="jr-sprint-kpis">
              <div v-for="kpi in sprintKPIs(sprint)" :key="kpi.label" class="jr-kpi">
                <span class="jr-kpi-val" :style="{ color: kpi.color }">{{ kpi.val }}</span>
                <span class="jr-kpi-lbl">{{ kpi.label }}</span>
              </div>
              <div class="jr-kpi-prog">
                <div class="jr-kpi-bar-wrap">
                  <div class="jr-kpi-bar-done" :style="{ width: sprintDone(sprint) + '%' }"></div>
                  <div class="jr-kpi-bar-prog" :style="{ width: sprintInProg(sprint) + '%', left: sprintDone(sprint) + '%' }"></div>
                </div>
                <span class="jr-kpi-pct">{{ sprintDone(sprint) }}%</span>
              </div>
            </div>
            <div class="jr-sprint-board">
              <div v-for="col in BOARD_COLS" :key="col.id" class="jr-sprint-col">
                <div class="jr-sprint-col-head">
                  <span class="jr-sprint-col-dot" :style="{ background: col.color }"></span>
                  {{ col.label }}
                  <span class="jr-col-cnt">{{ (sprint.tickets || []).filter(t => matchCol(t, col)).length }}</span>
                </div>
                <div v-for="t in (sprint.tickets || []).filter(t => matchCol(t, col))" :key="t.key"
                  class="jr-sprint-ticket" @click="openDetail(t)">
                  <span class="jr-card-type">{{ typeIcon(t.type) }}</span>
                  <span class="jr-key-lnk">{{ t.key }}</span>
                  <span class="jr-sprint-ticket-title">{{ t.title }}</span>
                  <div v-if="t.assignee && t.assignee !== 'Unassigned'" class="jr-av-xs ml-auto" :style="{ background: avColor(t.assignee) }">{{ avInit(t.assignee) }}</div>
                </div>
              </div>
            </div>
            <div v-if="(sprint.tickets||[]).length > 12 && !expandedSprints.has(sprint.id)" class="jr-show-all">
              <button @click="expandedSprints.add(sprint.id); expandedSprints = new Set(expandedSprints)">
                Show all {{ sprint.tickets.length }} tickets ↓
              </button>
            </div>
          </div>
        </template>
        <div v-else class="jr-empty-view">
          <p>No sprint data available</p>
          <button class="jr-create-btn" @click="loadSprints">Load Sprints</button>
        </div>
      </div>

      <!-- ══ TIMELINE / GANTT VIEW ══════════════════════════════ -->
      <div v-else-if="activeTab === 'timeline'" class="jr-timeline-wrap" ref="timelineEl">
        <div class="jr-tl-toolbar">
          <button class="jr-tl-nav" @click="tlOffsetDays -= 14">‹ Earlier</button>
          <button class="jr-tl-today" @click="tlOffsetDays = 0">Today</button>
          <button class="jr-tl-nav" @click="tlOffsetDays += 14">Later ›</button>
          <div style="flex:1"></div>
          <select v-model="tlGroupBy" class="jr-view-sel">
            <option value="assignee">Group by Assignee</option>
            <option value="status">Group by Status</option>
            <option value="priority">Group by Priority</option>
          </select>
          <select v-model="tlZoom" class="jr-view-sel">
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
          </select>
        </div>
        <div class="jr-tl-container">
          <div class="jr-tl-labels">
            <div class="jr-tl-labels-head">Assignee / Group</div>
            <template v-for="(rows, gname) in tlGroups" :key="gname">
              <div class="jr-tl-group-label">{{ gname }}</div>
              <div v-for="t in rows" :key="t.key" class="jr-tl-row-label" @click="openDetail(t)">
                <span class="jr-type-sm">{{ typeIcon(t.type) }}</span>
                <span class="jr-key-lnk">{{ t.key }}</span>
                <span class="jr-tl-title">{{ t.title }}</span>
              </div>
            </template>
          </div>
          <div class="jr-tl-grid-wrap" ref="tlGrid">
            <div class="jr-tl-date-row">
              <div v-for="(d, i) in tlDates" :key="i" class="jr-tl-date-cell"
                :class="{ today: isToday(d), weekend: isWeekend(d) }">
                <span class="jr-tl-day-num">{{ d.getDate() }}</span>
                <span class="jr-tl-day-name">{{ d.toLocaleDateString([], { weekday: 'short' }) }}</span>
              </div>
            </div>
            <div class="jr-tl-grid">
              <div v-for="(d, i) in tlDates" :key="'bg'+i"
                class="jr-tl-col-bg"
                :class="{ today: isToday(d), weekend: isWeekend(d) }"
                :style="{ left: (i / tlDates.length * 100) + '%', width: (1 / tlDates.length * 100) + '%' }">
              </div>
              <template v-for="(rows, gname) in tlGroups" :key="gname">
                <div class="jr-tl-group-spacer"></div>
                <div v-for="t in rows" :key="t.key" class="jr-tl-bar-row">
                  <div v-if="tlBarStyle(t)" class="jr-tl-bar"
                    :class="sCls(t.status)"
                    :style="tlBarStyle(t)"
                    :title="t.title + ' (' + (t.dueDate || 'no due date') + ')'"
                    @click="openDetail(t)">
                    <span class="jr-tl-bar-label">{{ t.key }}: {{ t.title }}</span>
                  </div>
                  <div v-else class="jr-tl-bar-empty">
                    <span class="jr-tl-no-date">No due date</span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ CALENDAR VIEW ══════════════════════════════════════ -->
      <div v-else-if="activeTab === 'calendar'" class="jr-cal-wrap">
        <div class="jr-cal-head">
          <button class="jr-tl-nav" @click="calPrev">‹</button>
          <h2 class="jr-cal-title">{{ calTitle }}</h2>
          <button class="jr-tl-nav" @click="calNext">›</button>
          <button class="jr-tl-today" @click="calToday">Today</button>
          <div style="flex:1"></div>
          <div class="jr-cal-legend">
            <span v-for="col in BOARD_COLS" :key="col.id" class="jr-cal-leg-item">
              <span class="jr-cal-leg-dot" :style="{ background: col.color }"></span>{{ col.label }}
            </span>
          </div>
        </div>
        <div class="jr-cal-grid">
          <div v-for="d in ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']" :key="d" class="jr-cal-dname">{{ d }}</div>
          <div v-for="(cell, i) in calCells" :key="i" class="jr-cal-cell"
            :class="{ 'other-month': !cell.inMonth, today: cell.isToday, 'has-tickets': cell.tickets.length }">
            <div class="jr-cal-cell-top">
              <span class="jr-cal-day">{{ cell.date.getDate() }}</span>
              <button v-if="cell.inMonth" class="jr-cal-add" @click="openCreateForDate(cell.date)">＋</button>
            </div>
            <div class="jr-cal-tickets">
              <div v-for="t in cell.tickets.slice(0, calCellLimit(cell))" :key="t.key"
                class="jr-cal-chip"
                :style="{ background: colForTicket(t) + '22', borderColor: colForTicket(t) + '55', color: colForTicket(t) }"
                :title="t.key + ': ' + t.title"
                @click.stop="openDetail(t)">
                <span class="jr-cal-chip-type">{{ typeIcon(t.type) }}</span>
                <span class="jr-cal-chip-key">{{ t.key }}</span>
                <span class="jr-cal-chip-title">{{ t.title }}</span>
              </div>
              <div v-if="cell.tickets.length > calCellLimit(cell)" class="jr-cal-more" @click="calExpandCell = cell">
                +{{ cell.tickets.length - calCellLimit(cell) }} more
              </div>
            </div>
          </div>
        </div>
        <div v-if="calExpandCell" class="jr-cal-expand-bg" @click="calExpandCell = null">
          <div class="jr-cal-expand" @click.stop>
            <div class="jr-cal-expand-head">
              {{ calExpandCell.date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) }}
              <button @click="calExpandCell = null">✕</button>
            </div>
            <div v-for="t in calExpandCell.tickets" :key="t.key" class="jr-tbl-row" @click="openDetail(t); calExpandCell = null">
              <span class="jr-type-sm">{{ typeIcon(t.type) }}</span>
              <span class="jr-key-lnk">{{ t.key }}</span>
              <span class="jr-row-title">{{ t.title }}</span>
              <span class="jr-sbadge" :class="sCls(t.status)">{{ t.status }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ LIST VIEW ══════════════════════════════════════════ -->
      <div v-else-if="activeTab === 'list'" class="jr-list-wrap">
        <div class="jr-list-toolbar">
          <span class="jr-bl-count">{{ filteredTickets.length }} issues</span>
          <div style="flex:1"></div>
          <label class="jr-tbl-lbl">Sort</label>
          <select v-model="listSort" class="jr-view-sel">
            <option value="updated">Last updated</option>
            <option value="priority">Priority</option>
            <option value="due">Due</option>
            <option value="created">Created</option>
          </select>
          <button class="jr-icon-btn" @click="openCreate()">＋</button>
        </div>
        <div v-for="section in listSections" :key="section.status" class="jr-list-section">
          <div class="jr-list-section-head" @click="toggleGroup('list:' + section.status)">
            <svg :style="{ transform: collapsedGroups.has('list:'+section.status) ? 'rotate(-90deg)' : '', transition: 'transform .15s' }"
              width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            <span class="jr-sbadge lg" :class="sCls(section.status)">{{ section.status }}</span>
            <span class="jr-col-cnt">{{ section.tickets.length }}</span>
          </div>
          <template v-if="!collapsedGroups.has('list:' + section.status)">
            <div v-for="t in section.tickets" :key="t.key" class="jr-list-row"
              :class="{ overdue: t.overdue }"
              @click="openDetail(t)">
              <span class="jr-type-sm">{{ typeIcon(t.type) }}</span>
              <span class="jr-key-lnk">{{ t.key }}</span>
              <span class="jr-card-pri sm" :class="'pri-' + nPri(t.priority)" :title="t.priority"></span>
              <span class="jr-list-title">{{ t.title }}</span>
              <div style="flex:1"></div>
              <span v-if="t.labels?.[0]" class="jr-lbl xs">{{ t.labels[0] }}</span>
              <span v-if="t.overdue" class="jr-due-red">⚠ {{ t.daysOverdue }}d</span>
              <span v-else-if="t.dueDate" class="jr-due-ok">{{ fmtShort(t.dueDate) }}</span>
              <span v-else class="jr-none">—</span>
              <div v-if="t.assignee && t.assignee !== 'Unassigned'" class="jr-av-xs" :style="{ background: avColor(t.assignee) }" :title="t.assignee">{{ avInit(t.assignee) }}</div>
              <span v-else class="jr-none" style="width:20px">—</span>
            </div>
          </template>
        </div>
      </div>

      <!-- ══ REPORTS VIEW ═══════════════════════════════════════ -->
      <div v-else-if="activeTab === 'reports'" class="jr-reports-wrap">
        <div class="jr-kpi-row">
          <div class="jr-kpi-card">
            <div class="jr-kpi-card-val">{{ allTickets.length }}</div>
            <div class="jr-kpi-card-lbl">Total Issues</div>
            <div class="jr-kpi-card-sub">across all sprints</div>
          </div>
          <div class="jr-kpi-card">
            <div class="jr-kpi-card-val text-green">{{ doneCount }}</div>
            <div class="jr-kpi-card-lbl">Completed</div>
            <div class="jr-kpi-card-sub">{{ allTickets.length ? Math.round(doneCount / allTickets.length * 100) : 0 }}% of total</div>
          </div>
          <div class="jr-kpi-card">
            <div class="jr-kpi-card-val text-red">{{ overdueTickets.length }}</div>
            <div class="jr-kpi-card-lbl">Overdue</div>
            <div class="jr-kpi-card-sub">{{ allTickets.length ? Math.round(overdueTickets.length / allTickets.length * 100) : 0 }}% of open issues</div>
          </div>
          <div class="jr-kpi-card">
            <div class="jr-kpi-card-val text-orange">{{ inProgCount }}</div>
            <div class="jr-kpi-card-lbl">In Progress</div>
            <div class="jr-kpi-card-sub">actively worked on</div>
          </div>
          <div class="jr-kpi-card">
            <div class="jr-kpi-card-val text-purple">{{ unassignedCount }}</div>
            <div class="jr-kpi-card-lbl">Unassigned</div>
            <div class="jr-kpi-card-sub">need an owner</div>
          </div>
        </div>
        <div class="jr-charts-row">
          <div class="jr-chart-card">
            <div class="jr-chart-title">Status Breakdown</div>
            <div class="jr-donut-wrap">
              <svg viewBox="0 0 120 120" class="jr-donut-svg">
                <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="18"/>
                <circle v-for="(seg, i) in statusDonut" :key="i"
                  cx="60" cy="60" r="50" fill="none"
                  :stroke="seg.color" stroke-width="18"
                  :stroke-dasharray="seg.dash"
                  :stroke-dashoffset="seg.offset"
                  stroke-linecap="round"
                  transform="rotate(-90 60 60)"/>
              </svg>
              <div class="jr-donut-center">
                <span class="jr-donut-pct">{{ allTickets.length ? Math.round(doneCount / allTickets.length * 100) : 0 }}%</span>
                <span class="jr-donut-lbl">done</span>
              </div>
            </div>
            <div class="jr-donut-legend">
              <div v-for="s in statusBreakdown" :key="s.label" class="jr-legend-item">
                <span class="jr-legend-dot" :style="{ background: s.color }"></span>
                <span class="jr-legend-lbl">{{ s.label }}</span>
                <span class="jr-legend-val">{{ s.count }}</span>
              </div>
            </div>
          </div>
          <div class="jr-chart-card">
            <div class="jr-chart-title">Priority Distribution</div>
            <div class="jr-hbars">
              <div v-for="p in priorityBreakdown" :key="p.label" class="jr-hbar-row">
                <span class="jr-hbar-lbl">{{ p.label }}</span>
                <div class="jr-hbar-wrap">
                  <div class="jr-hbar-fill" :style="{ width: (allTickets.length ? p.count / allTickets.length * 100 : 0) + '%', background: p.color }"></div>
                </div>
                <span class="jr-hbar-val">{{ p.count }}</span>
              </div>
            </div>
          </div>
          <div class="jr-chart-card">
            <div class="jr-chart-title">Team Workload</div>
            <div class="jr-workload-list">
              <div v-for="a in workloadBreakdown.slice(0, 8)" :key="a.name" class="jr-wl-row">
                <div class="jr-av-sm" :style="{ background: avColor(a.name) }">{{ avInit(a.name) }}</div>
                <div class="jr-wl-info">
                  <div class="jr-wl-name">{{ a.name }}</div>
                  <div class="jr-wl-bar-wrap">
                    <div class="jr-wl-bar" :style="{ width: a.pct + '%', background: a.overdue > 0 ? '#ef4444' : '#3b82f6' }"></div>
                  </div>
                </div>
                <div class="jr-wl-nums">
                  <span class="jr-wl-total">{{ a.total }}</span>
                  <span v-if="a.overdue > 0" class="jr-wl-overdue">{{ a.overdue }}⚠</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="jr-chart-card wide">
          <div class="jr-chart-title">Weekly Activity <span class="jr-chart-sub">(tickets updated per week)</span></div>
          <div class="jr-activity-chart">
            <div v-for="(w, i) in weeklyActivity" :key="i" class="jr-act-bar-col">
              <div class="jr-act-bar" :style="{ height: (maxWeekly ? w.count / maxWeekly * 100 : 0) + '%' }" :title="w.count + ' updates'"></div>
              <span class="jr-act-wk-lbl">{{ w.label }}</span>
            </div>
          </div>
        </div>
        <div v-if="overdueTickets.length" class="jr-chart-card wide">
          <div class="jr-chart-title">Overdue Issues <span class="jr-chart-sub">({{ overdueTickets.length }} total)</span></div>
          <div class="jr-tbl-head">
            <div class="jr-tc tc-key">Key</div>
            <div class="jr-tc tc-title">Summary</div>
            <div class="jr-tc tc-assign">Assignee</div>
            <div class="jr-tc tc-due">Due Date</div>
            <div class="jr-tc tc-due">Days Overdue</div>
          </div>
          <div v-for="t in overdueTickets.slice(0,10)" :key="t.key" class="jr-tbl-row" @click="openDetail(t)">
            <div class="jr-tc tc-key"><span class="jr-key-lnk">{{ t.key }}</span></div>
            <div class="jr-tc tc-title"><span class="jr-row-title">{{ t.title }}</span></div>
            <div class="jr-tc tc-assign">
              <div v-if="t.assignee && t.assignee !== 'Unassigned'" class="jr-av-xs" :style="{ background: avColor(t.assignee) }">{{ avInit(t.assignee) }}</div>
              <span class="jr-assign-name">{{ t.assignee || '—' }}</span>
            </div>
            <div class="jr-tc tc-due"><span class="jr-due-red">{{ fmtDate(t.dueDate) }}</span></div>
            <div class="jr-tc tc-due"><span class="jr-due-red">{{ t.daysOverdue }} days</span></div>
          </div>
        </div>
      </div>

    </template>

    <!-- ══ TICKET DETAIL SLIDEOVER ══════════════════════════════ -->
    <transition name="jr-slide">
      <div v-if="detailTicket" class="jr-detail-overlay" @click.self="detailTicket = null">
        <div class="jr-detail">
          <div class="jr-detail-head">
            <div class="jr-detail-head-left">
              <span class="jr-type-sm lg">{{ typeIcon(detailTicket.type) }}</span>
              <a :href="jiraUrl(detailTicket.key)" target="_blank" rel="noopener" class="jr-detail-key" title="Open in Jira">
                {{ detailTicket.key }}
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
            </div>
            <div class="jr-detail-head-right">
              <button class="jr-icon-btn" @click="detailTicket = null">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          <div class="jr-detail-body">
            <!-- Inline-editable title -->
            <div class="jr-detail-title-wrap">
              <div v-if="!editingTitle" class="jr-detail-title" @click="startEditTitle">
                {{ detailTicket.title }}
                <span class="jr-edit-hint">click to edit</span>
              </div>
              <textarea v-else v-model="editTitleVal" class="jr-detail-title-input" rows="2"
                @blur="saveTitle" @keydown.enter.exact.prevent="saveTitle"
                @keydown.escape="editingTitle = false" ref="titleInput"></textarea>
            </div>

            <div class="jr-detail-meta-row">
              <span class="jr-sbadge lg" :class="sCls(detailTicket.status)">{{ detailTicket.status }}</span>
              <span class="jr-pri-badge" :class="'pri-badge-' + nPri(detailTicket.priority)">
                <span class="jr-card-pri xs" :class="'pri-' + nPri(detailTicket.priority)"></span>
                {{ detailTicket.priority }}
              </span>
              <span v-if="detailTicket.overdue" class="jr-detail-overdue">⚠ {{ detailTicket.daysOverdue }}d overdue</span>
            </div>

            <div class="jr-quick-actions">
              <span class="jr-qa-lbl">Move to:</span>
              <button v-for="s in nextStatusList(detailTicket.status)" :key="s"
                class="jr-qa-btn" :disabled="!!movingTo" @click="moveTicket(detailTicket.key, s)">
                <span v-if="movingTo === s" class="jr-spin-xs"></span>
                <span v-else>{{ s }}</span>
              </button>
            </div>

            <div class="jr-detail-divider"></div>

            <div class="jr-detail-meta-grid">
              <div class="jr-dm-item">
                <label>Assignee</label>
                <!-- Editable assignee -->
                <div v-if="!editingAssignee">
                  <div v-if="detailTicket.assignee && detailTicket.assignee !== 'Unassigned'"
                    class="jr-dm-val av-val jr-dm-editable" @click="startEditAssignee" title="Click to change">
                    <div class="jr-av-sm" :style="{ background: avColor(detailTicket.assignee) }">{{ avInit(detailTicket.assignee) }}</div>
                    {{ detailTicket.assignee }}
                    <span class="jr-edit-hint">✎</span>
                  </div>
                  <span v-else class="jr-dm-val muted jr-dm-editable" @click="startEditAssignee" title="Click to assign">Unassigned <span class="jr-edit-hint">✎</span></span>
                </div>
                <div v-else class="jr-user-search-wrap">
                  <input v-model="assigneeSearchQ" ref="assigneeSearchRef" class="jr-mf-input sm"
                    placeholder="Search by name or email…"
                    @input="debounceFetchAssignees"
                    @keydown.escape="editingAssignee = false"/>
                  <div v-if="assigneeSuggestions.length" class="jr-user-drop">
                    <div class="jr-user-opt unassign" @click="saveAssignee(null)">✕ Unassign</div>
                    <div v-for="u in assigneeSuggestions" :key="u.accountId" class="jr-user-opt" @click="saveAssignee(u)">
                      <div class="jr-av-xs" :style="{ background: avColor(u.displayName) }">{{ avInit(u.displayName) }}</div>
                      <div>
                        <div class="jr-user-name">{{ u.displayName }}</div>
                        <div class="jr-user-email">{{ u.email }}</div>
                      </div>
                    </div>
                  </div>
                  <button class="jr-cancel-btn-sm" @click="editingAssignee = false" style="margin-top:5px">Cancel</button>
                </div>
              </div>
              <div class="jr-dm-item">
                <label>Reporter</label>
                <div v-if="detailTicket.reporter" class="jr-dm-val av-val">
                  <div class="jr-av-sm" :style="{ background: avColor(detailTicket.reporter) }">{{ avInit(detailTicket.reporter) }}</div>
                  {{ detailTicket.reporter }}
                </div>
                <span v-else class="jr-dm-val muted">—</span>
              </div>
              <div class="jr-dm-item">
                <label>Type</label>
                <span class="jr-dm-val">{{ typeIcon(detailTicket.type) }} {{ detailTicket.type }}</span>
              </div>
              <div class="jr-dm-item">
                <label>Sprint</label>
                <span class="jr-dm-val">{{ detailTicket.sprint || '—' }}</span>
              </div>
              <div class="jr-dm-item">
                <label>Due Date</label>
                <div v-if="!editingDueDate" class="jr-dm-val jr-dm-editable"
                  :class="{ 'text-red': detailTicket.overdue }"
                  @click="startEditDueDate" title="Click to change">
                  {{ detailTicket.dueDate ? fmtDate(detailTicket.dueDate) : '—' }}
                  <span class="jr-edit-hint">✎</span>
                </div>
                <div v-else class="jr-edit-field" style="gap:4px">
                  <input v-model="dueDateEditVal" type="date" class="jr-mf-input sm"
                    @keydown.enter="saveDueDate" @keydown.escape="editingDueDate = false"/>
                  <button class="jr-save-btn" style="padding:3px 8px;font-size:11px" @click="saveDueDate">Save</button>
                  <button class="jr-cancel-btn-sm" @click="editingDueDate = false">✕</button>
                </div>
              </div>
              <div class="jr-dm-item">
                <label>Start Date</label>
                <span class="jr-dm-val">{{ detailTicket.startDate ? fmtDate(detailTicket.startDate) : '—' }}</span>
              </div>
              <div class="jr-dm-item">
                <label>Story Points</label>
                <span class="jr-dm-val">{{ detailTicket.storyPoints ?? '—' }}</span>
              </div>
              <div class="jr-dm-item" v-if="detailTicket.created">
                <label>Created</label>
                <span class="jr-dm-val">{{ fmtDateTime(detailTicket.created) }}</span>
              </div>
            </div>

            <!-- Labels -->
            <div v-if="detailTicket.labels?.length" class="jr-detail-section">
              <label>Labels</label>
              <div class="jr-detail-labels">
                <span v-for="l in detailTicket.labels" :key="l" class="jr-lbl">{{ l }}</span>
              </div>
            </div>

            <!-- Components -->
            <div v-if="detailTicket.components?.length" class="jr-detail-section">
              <label>Components</label>
              <div class="jr-detail-labels">
                <span v-for="c in detailTicket.components" :key="c" class="jr-lbl">{{ c }}</span>
              </div>
            </div>

            <!-- FIX: Description rendered as structured paragraphs, not raw text -->
            <div class="jr-detail-section">
              <div class="jr-section-head">
                <label class="jr-sec-lbl">Description</label>
                <button class="jr-edit-icon-btn" @click="startEditDesc">✎ Edit</button>
              </div>
              <div v-if="!editingDesc">
                <div v-if="detailTicket.description" class="jr-desc-content">
                  <p v-for="(para, i) in descParagraphs(detailTicket.description)" :key="i"
                    class="jr-desc-para"
                    :class="{ 'is-code': para.isCode, 'is-heading': para.isHeading, 'is-bullet': para.isBullet }">
                    {{ para.text }}
                  </p>
                </div>
                <div v-else class="jr-desc-empty" @click="startEditDesc">Click to add description…</div>
              </div>
              <div v-else class="jr-edit-field col">
                <textarea v-model="descEditVal" ref="descInputRef" class="jr-edit-textarea" rows="5"
                  placeholder="Add a description…"></textarea>
                <div class="jr-edit-actions">
                  <button class="jr-save-btn" @click="saveDesc">Save</button>
                  <button class="jr-cancel-btn-sm" @click="editingDesc = false">Cancel</button>
                </div>
              </div>
            </div>

            <div class="jr-detail-divider"></div>

            <!-- Comments -->
            <div class="jr-detail-section">
              <label>Comments <span class="jr-comment-count">{{ (detailTicket.comments || []).length }}</span></label>

              <!-- FIX: Comment input NOW at top -->
              <div class="jr-comment-input-wrap" style="margin-bottom:16px">
                <div class="jr-av-sm self" style="background:#0052CC">Me</div>
                <div class="jr-comment-editor" style="position:relative">
                  <textarea v-model="newComment" ref="commentTextareaRef" class="jr-comment-ta" rows="2"
                    placeholder="Add a comment… (type @ to mention, ⌘↵ to save)"
                    @input="onCommentInput"
                    @keydown.meta.enter.prevent="submitComment"
                    @keydown.ctrl.enter.prevent="submitComment"
                    @keydown.escape="mentionActive = false; newComment && (mentionActive = false)"></textarea>
                  <!-- @ Mention suggestions dropdown -->
                  <div v-if="mentionActive && mentionSuggestions.length" class="jr-mention-drop">
                    <div v-for="u in mentionSuggestions" :key="u.accountId"
                      class="jr-mention-opt" @mousedown.prevent="insertMention(u)">
                      <div class="jr-av-xs" :style="{ background: avColor(u.displayName) }">{{ avInit(u.displayName) }}</div>
                      <span>{{ u.displayName }}</span>
                    </div>
                  </div>
                  <div class="jr-comment-actions" v-if="newComment.trim()">
                    <button class="jr-qa-btn primary" :disabled="submittingComment" @click="submitComment">
                      <span v-if="submittingComment" class="jr-spin-xs"></span>
                      <span v-else>Save</span>
                    </button>
                    <button class="jr-qa-btn" @click="newComment = ''">Cancel</button>
                  </div>
                </div>
              </div>

              <!-- Comments list below input -->
              <div v-if="detailTicket.comments?.length" class="jr-comments-list">
                <div v-for="c in detailTicket.comments" :key="c.id" class="jr-comment">
                  <div class="jr-av-sm" :style="{ background: avColor(c.author) }">{{ avInit(c.author) }}</div>
                  <div class="jr-comment-body">
                    <div class="jr-comment-head">
                      <span class="jr-comment-author">{{ c.author }}</span>
                      <span class="jr-comment-time">{{ fmtDateTime(c.created) }}</span>
                    </div>
                    <!-- FIX: comments rendered as structured paragraphs too -->
                    <div class="jr-comment-text">
                      <p v-for="(para, pi) in descParagraphs(c.body)" :key="pi"
                        class="jr-desc-para" :class="{ 'is-code': para.isCode }">{{ para.text }}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="jr-no-comments">No comments yet — be the first</div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- ══ CREATE MODAL ══════════════════════════════════════════ -->
    <div v-if="showCreate" class="jr-modal-bg" @click.self="showCreate = false">
      <div class="jr-modal">
        <div class="jr-modal-head">
          <div class="jr-modal-head-left">
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#0052CC" d="M11.571 11.513H0a5.218 5.218 0 005.232 5.215h2.13v2.057A5.215 5.215 0 0012.575 24V12.518a1.005 1.005 0 00-1.004-1.005zm5.723-5.756H5.757a5.215 5.215 0 005.215 5.214h2.129v2.058a5.218 5.218 0 005.215 5.214V6.762a1.005 1.005 0 00-1.022-1.005zM23.013 0H11.455a5.215 5.215 0 005.215 5.215h2.129v2.057A5.215 5.215 0 0024.019 12.49V1.005A1.001 1.001 0 0023.013 0z"/></svg>
            <span>Create Issue</span>
          </div>
          <button class="jr-modal-close" @click="showCreate = false">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="jr-modal-body">
          <!-- Project selector in create modal -->
          <div class="jr-mf-group" v-if="projects.length > 1">
            <label>Project *</label>
            <select v-model="form.projectKey" class="jr-mf-sel">
              <option v-for="p in projects" :key="p.key" :value="p.key">{{ p.name }} ({{ p.key }})</option>
            </select>
          </div>
          <div class="jr-mf-row two">
            <div class="jr-mf-group">
              <label>Issue Type *</label>
              <div class="jr-type-picker">
                <button v-for="t in TYPES" :key="t" :class="['jr-type-opt', form.type === t && 'on']" @click="form.type = t">
                  <span>{{ typeIcon(t) }}</span>
                  <span>{{ t }}</span>
                </button>
              </div>
            </div>
            <div class="jr-mf-group">
              <label>Priority</label>
              <div class="jr-pri-picker">
                <button v-for="p in PRIORITIES" :key="p.v" :class="['jr-pri-opt', form.priority === p.full && 'on']" @click="form.priority = p.full">
                  <span :class="'fp-dot fp-' + p.v"></span>{{ p.l }}
                </button>
              </div>
            </div>
          </div>
          <div class="jr-mf-group">
            <label>Summary *</label>
            <input v-model="form.title" class="jr-mf-input" placeholder="What needs to be done?" ref="titleInputEl" @keydown.enter="form.title && submitCreate()"/>
          </div>
          <div class="jr-mf-group">
            <label>Description</label>
            <textarea v-model="form.description" class="jr-mf-input" rows="3" placeholder="Add more context…"></textarea>
          </div>
          <div class="jr-mf-row two">
            <div class="jr-mf-group">
              <label>Status</label>
              <select v-model="form.status" class="jr-mf-sel">
                <option v-for="s in STATUS_LIST" :key="s">{{ s }}</option>
              </select>
            </div>
            <div class="jr-mf-group">
              <label>Due Date</label>
              <input v-model="form.dueDate" type="date" class="jr-mf-input"/>
            </div>
          </div>
          <div class="jr-mf-row two">
            <div class="jr-mf-group" style="position:relative">
              <label>Assignee</label>
              <!-- Show chip when user is selected -->
              <div v-if="createAssigneeSelected" class="jr-selected-user-chip">
                <div class="jr-av-xs" :style="{ background: avColor(createAssigneeSelected.displayName) }">{{ avInit(createAssigneeSelected.displayName) }}</div>
                <div style="flex:1;min-width:0">
                  <div class="jr-user-name">{{ createAssigneeSelected.displayName }}</div>
                  <div class="jr-user-email">{{ createAssigneeSelected.email }}</div>
                </div>
                <button class="jr-chip-close" @click="createAssigneeSelected = null; createAssigneeQ = ''">✕</button>
              </div>
              <input v-else v-model="createAssigneeQ" class="jr-mf-input"
                placeholder="Search by name or email…"
                @input="debounceFetchCreateAssignees"
                @focus="createAssigneeQ && debounceFetchCreateAssignees()"/>
              <!-- User dropdown -->
              <div v-if="showCreateAssigneeDrop && createAssigneeSugg.length" class="jr-user-drop create-drop">
                <div v-for="u in createAssigneeSugg" :key="u.accountId"
                  class="jr-user-opt" @mousedown.prevent="selectCreateAssignee(u)">
                  <div class="jr-av-xs" :style="{ background: avColor(u.displayName) }">{{ avInit(u.displayName) }}</div>
                  <div>
                    <div class="jr-user-name">{{ u.displayName }}</div>
                    <div class="jr-user-email">{{ u.email }}</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="jr-mf-group">
              <label>Labels <span class="jr-mf-hint">(comma separated)</span></label>
              <input v-model="form.labels" class="jr-mf-input" placeholder="bug, frontend, urgent"/>
            </div>
          </div>
          <div class="jr-mf-row two">
            <div class="jr-mf-group">
              <label>Story Points</label>
              <input v-model="form.storyPoints" type="number" min="0" class="jr-mf-input" placeholder="3"/>
            </div>
            <div class="jr-mf-group">
              <label>Start Date</label>
              <input v-model="form.startDate" type="date" class="jr-mf-input"/>
            </div>
          </div>
        </div>
        <div class="jr-modal-foot">
          <span class="jr-modal-hint">Enter ↵ to create</span>
          <button class="jr-cancel-btn" @click="showCreate = false">Cancel</button>
          <button class="jr-create-btn" :disabled="!form.title.trim() || creating" @click="submitCreate">
            <span v-if="creating" class="jr-spin-xs"></span>
            <span v-else>Create Issue</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ══ LOAD MORE / BACKGROUND LOADING BAR ══════════════════════ -->
    <!-- Shows at bottom of board/backlog/list when more tickets exist -->
    <transition name="jr-loadbar">
      <div v-if="loadingMore || hasMore" class="jr-loadmore-bar">
        <template v-if="loadingMore">
          <div class="jr-loadmore-spinner"></div>
          <span>Loading tickets… {{ allTickets.length }} / {{ totalTickets }}</span>
          <div class="jr-loadmore-progress">
            <div class="jr-loadmore-fill"
              :style="{ width: totalTickets ? (allTickets.length / totalTickets * 100) + '%' : '0%' }">
            </div>
          </div>
        </template>
        <template v-else>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="jr-loadmore-icon"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Showing <strong>{{ allTickets.length }}</strong> of <strong>{{ totalTickets }}</strong> tickets</span>
          <button class="jr-loadmore-btn" @click="loadMoreTickets">Load next 100</button>
          <button class="jr-loadall-btn" @click="loadRemainingInBackground">Load all remaining</button>
        </template>
      </div>
    </transition>

    <!-- ══ TOAST ════════════════════════════════════════════════ -->
    <transition name="jr-toast">
      <div v-if="toast" class="jr-toast" :class="toast.type">
        <svg v-if="toast.type === 'success'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {{ toast.msg }}
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue'
import api from '../services/api'
import { store, setModuleContext } from '../stores/app'




defineEmits(['close'])

// ── Constants ─────────────────────────────────────────────────────
const TABS = [
  { id: 'board',    icon: '⬛', label: 'Board'    },
  { id: 'backlog',  icon: '📋', label: 'Backlog'  },
  { id: 'sprints',  icon: '🏃', label: 'Sprints'  },
  { id: 'timeline', icon: '📅', label: 'Timeline' },
  { id: 'calendar', icon: '🗓', label: 'Calendar' },
  { id: 'list',     icon: '☰',  label: 'List'     },
  { id: 'reports',  icon: '📊', label: 'Reports'  },
]
const STATUS_LIST = ['To Do', 'In Progress', 'In Review', 'Done']
const PRIORITIES = [
  { v: 'highest', l: 'Highest', full: 'Highest' },
  { v: 'high',    l: 'High',    full: 'High'    },
  { v: 'medium',  l: 'Medium',  full: 'Medium'  },
  { v: 'low',     l: 'Low',     full: 'Low'     },
]
const TYPES = ['Task', 'Bug', 'Story', 'Epic']
const BOARD_COLS = [
  { id: 'todo',   label: 'TO DO',       color: '#64748b', match: s => /to.?do|open|backlog|new|todo/i.test(s) },
  { id: 'inprog', label: 'IN PROGRESS', color: '#3b82f6', match: s => /progress|doing|active|dev|testing|stage/i.test(s) },
  { id: 'review', label: 'IN REVIEW',   color: '#8b5cf6', match: s => /review|ready.for|qa/i.test(s) },
  { id: 'done',   label: 'DONE',        color: '#22c55e', match: s => /done|closed|resolved|complete|production/i.test(s) },
]

// ── State ──────────────────────────────────────────────────────────
const rootEl        = ref(null)
const filterRef     = ref(null)
const titleInputEl  = ref(null)
const titleInput    = ref(null)
const timelineEl    = ref(null)
const tlGrid        = ref(null)
const descInputRef  = ref(null)

const activeTab      = ref('board')
const loading        = ref(false)
const loadingSprints = ref(false)
const error          = ref('')
const allTickets     = ref([])
const totalTickets     = ref(0)        // approximate total from Jira
const nextPageToken    = ref(null)     // cursor for next page (replaces startAt)
const loadingMore      = ref(false)
const hasMore          = computed(() => !!nextPageToken.value)
const PAGE_SIZE        = 100
const projects       = ref([])
const sprints        = ref([])
const projectKey     = ref('')
const projectName    = ref('')
const selectedProject = ref('')
const activeSprint   = ref(null)
const boardScope     = ref('all')
const overdueOnly    = ref(false)
const blockedOnly    = ref(false)
const priorityBucket = ref('')

// Filters
const searchQ        = ref('')
const showFilters    = ref(false)
const filterPriority = ref([])
const filterType     = ref([])
const filterAssignee = ref([])
const filterSprint   = ref('')

// Board
const boardGroupBy      = ref('none')
const draggedKey        = ref(null)
const dragOverCol       = ref(null)
const collapsedSwimlanes = ref(new Set())

function toggleSwimlane(key) {
  const s = new Set(collapsedSwimlanes.value)
  s.has(key) ? s.delete(key) : s.add(key)
  collapsedSwimlanes.value = s
}

// Backlog
const blSort          = ref('updated')
const blGroup         = ref('none')
const collapsedGroups = ref(new Set())

// List
const listSort = ref('updated')

// Timeline
const tlOffsetDays = ref(-7)
const tlZoom       = ref('30')
const tlGroupBy    = ref('assignee')

// Calendar
const calYear       = ref(new Date().getFullYear())
const calMonth      = ref(new Date().getMonth())
const calExpandCell = ref(null)

// Sprints
const expandedSprints = ref(new Set())

// Detail
const detailTicket      = ref(null)
const editingTitle      = ref(false)
const editTitleVal      = ref('')
const editingDesc       = ref(false)
const descEditVal       = ref('')
const movingTo          = ref('')
const newComment        = ref('')
const submittingComment = ref(false)

// FIX 1: Editable Assignee in detail
const editingAssignee     = ref(false)
const assigneeSearchQ     = ref('')
const assigneeSuggestions = ref([])
const assigneeSearchRef   = ref(null)

// FIX 1: Editable Due Date in detail
const editingDueDate  = ref(false)
const dueDateEditVal  = ref('')

// FIX 2: @mention in comment textarea
const mentionActive      = ref(false)
const mentionQuery       = ref('')
const mentionSuggestions = ref([])
const mentionCursorPos   = ref(0)
const commentTextareaRef = ref(null)

// FIX 6: Create modal assignee search
const createAssigneeQ          = ref('')
const createAssigneeSugg       = ref([])
const createAssigneeSelected   = ref(null)
const showCreateAssigneeDrop   = ref(false)

// Create form
const showCreate = ref(false)
const creating   = ref(false)
const form = reactive({
  title: '', description: '', type: 'Task', priority: 'Medium',
  status: 'To Do', dueDate: '', assigneeEmail: '', labels: '',
  storyPoints: '', startDate: '', projectKey: '',
})

// Toast
const toast    = ref(null)
let toastTimer = null

// ── Computed: filters ─────────────────────────────────────────────
const hasFilters = computed(() =>
  filterPriority.value.length || filterType.value.length ||
  filterAssignee.value.length || filterSprint.value || searchQ.value
)
const activeFilterCount = computed(() =>
  filterPriority.value.length + filterType.value.length +
  filterAssignee.value.length + (filterSprint.value ? 1 : 0)
)
const assigneeList = computed(() => {
  const s = new Set(allTickets.value.map(t => t.assignee).filter(a => a && a !== 'Unassigned'))
  return [...s].sort()
})
const sprintNames = computed(() => {
  const s = new Set(allTickets.value.map(t => t.sprint).filter(Boolean))
  return [...s].sort()
})

function isBlockedJiraTicket(ticket = {}) {
  const haystack = [
    ticket.status,
    ...(ticket.labels || []),
    ticket.title,
  ]
    .join(' ')
    .toLowerCase()

  return /blocked|waiting|dependency|stuck/.test(haystack)
}

const filteredTickets = computed(() => {
  let list = allTickets.value
  if (searchQ.value) {
    const q = searchQ.value.toLowerCase()
    list = list.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.key.toLowerCase().includes(q) ||
      (t.assignee || '').toLowerCase().includes(q)
    )
  }
  if (filterPriority.value.length) list = list.filter(t => filterPriority.value.includes(nPri(t.priority)))
  if (filterType.value.length)     list = list.filter(t => filterType.value.includes(t.type))
  if (filterAssignee.value.length) list = list.filter(t => filterAssignee.value.includes(t.assignee))
  if (filterSprint.value)          list = list.filter(t => t.sprint === filterSprint.value)
  if (blockedOnly.value)           list = list.filter(isBlockedJiraTicket)
  return list
})

// ── Stats ─────────────────────────────────────────────────────────
const overdueTickets  = computed(() => allTickets.value.filter(t => t.overdue))
const doneCount       = computed(() => allTickets.value.filter(t => /done|closed|resolved/i.test(t.status)).length)
const inProgCount     = computed(() => allTickets.value.filter(t => /progress/i.test(t.status)).length)
const unassignedCount = computed(() => allTickets.value.filter(t => !t.assignee || t.assignee === 'Unassigned').length)

// ── Board ─────────────────────────────────────────────────────────
function matchCol(t, col) { return col.match(t.status) }

const boardColumns = computed(() => {
  const assigned = new Set()
  const cols = BOARD_COLS.map(col => {
    const tickets = filteredTickets.value.filter(t => {
      if (assigned.has(t.key)) return false
      if (col.match(t.status)) { assigned.add(t.key); return true }
      return false
    })
    return { ...col, tickets }
  })
  filteredTickets.value.filter(t => !assigned.has(t.key)).forEach(t => cols[0].tickets.push(t))
  return cols
})

const swimlaneGroups = computed(() => {
  const groups = {}
  for (const t of filteredTickets.value) {
    const k = boardGroupBy.value === 'assignee' ? (t.assignee || 'Unassigned')
            : boardGroupBy.value === 'priority' ? t.priority
            : t.status
    if (!groups[k]) groups[k] = BOARD_COLS.map(c => ({ ...c, tickets: [] }))
    const col = groups[k].find(c => c.match(t.status)) || groups[k][0]
    col.tickets.push(t)
  }
  return groups
})

// ── Backlog ───────────────────────────────────────────────────────
const SORT_FNS = {
  updated:     (a, b) => (b.updated  || '').localeCompare(a.updated  || ''),
  priority:    (a, b) => priOrd(a.priority) - priOrd(b.priority),
  due:         (a, b) => ((a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1),
  created:     (a, b) => (b.created  || '').localeCompare(a.created  || ''),
  key:         (a, b) => a.key.localeCompare(b.key),
  '-key':      (a, b) => b.key.localeCompare(a.key),
  '-priority': (a, b) => priOrd(b.priority) - priOrd(a.priority),
  '-due':      (a, b) => ((b.dueDate || '0000') < (a.dueDate || '0000') ? -1 : 1),
}
const sortedBacklog = computed(() =>
  [...filteredTickets.value].sort(SORT_FNS[blSort.value] || SORT_FNS.updated)
)
const groupedBacklog = computed(() => {
  const out = {}
  for (const t of sortedBacklog.value) {
    const k = blGroup.value === 'status'   ? t.status
            : blGroup.value === 'priority' ? t.priority
            : blGroup.value === 'assignee' ? (t.assignee || 'Unassigned')
            : blGroup.value === 'sprint'   ? (t.sprint   || 'No Sprint')
            : 'all'
    ;(out[k] = out[k] || []).push(t)
  }
  return out
})

// ── List ──────────────────────────────────────────────────────────
const listSections = computed(() => {
  const byStatus = {}
  const sorted = [...filteredTickets.value].sort(SORT_FNS[listSort.value] || SORT_FNS.updated)
  for (const t of sorted) {
    ;(byStatus[t.status] = byStatus[t.status] || []).push(t)
  }
  return Object.entries(byStatus).map(([status, tickets]) => ({ status, tickets }))
    .sort((a, b) => {
      const ord = { 'In Progress': 0, 'In Review': 1, 'To Do': 2, 'Done': 3 }
      return (ord[a.status] ?? 9) - (ord[b.status] ?? 9)
    })
})

// ── Timeline ──────────────────────────────────────────────────────
const tlDates = computed(() => {
  const days  = parseInt(tlZoom.value) || 30
  const start = new Date()
  start.setDate(start.getDate() + tlOffsetDays.value)
  start.setHours(0, 0, 0, 0)
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start); d.setDate(d.getDate() + i); return d
  })
})
const tlStart = computed(() => tlDates.value[0])
const tlEnd   = computed(() => tlDates.value[tlDates.value.length - 1])

const tlGroups = computed(() => {
  const g = {}
  for (const t of filteredTickets.value) {
    const k = tlGroupBy.value === 'assignee' ? (t.assignee || 'Unassigned')
            : tlGroupBy.value === 'status'   ? t.status
            : t.priority
    ;(g[k] = g[k] || []).push(t)
  }
  return g
})

function tlBarStyle(t) {
  if (!t.dueDate) return null
  const start     = tlStart.value, end = tlEnd.value
  const totalDays = (end - start) / 86400000
  const created   = t.created ? new Date(t.created) : new Date(t.dueDate)
  const due       = new Date(t.dueDate)
  const barStart  = Math.max(0, (created - start) / 86400000 / totalDays * 100)
  const barEnd    = Math.min(100, (due - start) / 86400000 / totalDays * 100)
  const width     = Math.max(barEnd - barStart, 1.5)
  if (barEnd < 0 || barStart > 100) return null
  return { left: barStart + '%', width: width + '%' }
}

// ── Calendar ──────────────────────────────────────────────────────
const calTitle = computed(() =>
  new Date(calYear.value, calMonth.value, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })
)
const calCells = computed(() => {
  const cells = []
  const first = new Date(calYear.value, calMonth.value, 1)
  const last  = new Date(calYear.value, calMonth.value + 1, 0)
  let dow     = (first.getDay() + 6) % 7
  for (let i = 0; i < dow; i++) {
    const d = new Date(first); d.setDate(d.getDate() - (dow - i))
    cells.push({ date: d, inMonth: false, isToday: false, tickets: [] })
  }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  for (let d = 1; d <= last.getDate(); d++) {
    const date    = new Date(calYear.value, calMonth.value, d)
    const dateStr = date.toISOString().split('T')[0]
    const tickets = filteredTickets.value.filter(t => t.dueDate === dateStr)
    cells.push({ date, inMonth: true, isToday: date.getTime() === today.getTime(), tickets })
  }
  while (cells.length % 7 !== 0) {
    const d = new Date(last); d.setDate(d.getDate() + cells.length - last.getDate() - dow + 1)
    cells.push({ date: d, inMonth: false, isToday: false, tickets: [] })
  }
  return cells
})
function calCellLimit(cell) { return cell.tickets.length <= 3 ? 3 : 2 }
function colForTicket(t) {
  if (/done|closed|resolved/i.test(t.status)) return '#22c55e'
  if (/progress/i.test(t.status))             return '#3b82f6'
  if (/review|test/i.test(t.status))          return '#8b5cf6'
  return '#64748b'
}

// ── Reports ───────────────────────────────────────────────────────
const statusBreakdown = computed(() => [
  { label: 'To Do',       color: '#64748b', count: allTickets.value.filter(t => /to.?do|open|backlog/i.test(t.status)).length },
  { label: 'In Progress', color: '#3b82f6', count: allTickets.value.filter(t => /progress/i.test(t.status)).length },
  { label: 'In Review',   color: '#8b5cf6', count: allTickets.value.filter(t => /review|test/i.test(t.status)).length },
  { label: 'Done',        color: '#22c55e', count: allTickets.value.filter(t => /done|closed|resolved/i.test(t.status)).length },
])
const statusDonut = computed(() => {
  const total = allTickets.value.length || 1
  const circ  = 2 * Math.PI * 50
  let offset  = 0
  return statusBreakdown.value.map(s => {
    const pct  = s.count / total
    const dash = `${pct * circ} ${circ}`
    const seg  = { color: s.color, dash, offset: -offset * circ }
    offset += pct
    return seg
  })
})
const priorityBreakdown = computed(() => [
  { label: 'Highest', color: '#ef4444', count: allTickets.value.filter(t => /highest|critical/i.test(t.priority)).length },
  { label: 'High',    color: '#f97316', count: allTickets.value.filter(t => /^high$/i.test(t.priority)).length },
  { label: 'Medium',  color: '#eab308', count: allTickets.value.filter(t => /medium/i.test(t.priority)).length },
  { label: 'Low',     color: '#22c55e', count: allTickets.value.filter(t => /low/i.test(t.priority)).length },
])
const workloadBreakdown = computed(() => {
  const map = {}
  for (const t of allTickets.value) {
    if (!t.assignee || t.assignee === 'Unassigned') continue
    if (!map[t.assignee]) map[t.assignee] = { name: t.assignee, total: 0, overdue: 0 }
    map[t.assignee].total++
    if (t.overdue) map[t.assignee].overdue++
  }
  const list = Object.values(map).sort((a, b) => b.total - a.total)
  const max  = list[0]?.total || 1
  return list.map(a => ({ ...a, pct: Math.round(a.total / max * 100) }))
})
const weeklyActivity = computed(() => {
  const weeks = 8, now = new Date()
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - (weeks - 1 - i) * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    const count = allTickets.value.filter(t => {
      if (!t.updated) return false
      const d = new Date(t.updated)
      return d >= weekStart && d <= weekEnd
    }).length
    return { label: weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' }), count }
  })
})
const maxWeekly = computed(() => Math.max(...weeklyActivity.value.map(w => w.count), 1))

// ── Sprint helpers ─────────────────────────────────────────────────
function sprintKPIs(sprint) {
  const t = sprint.tickets || []
  return [
    { label: 'Total',       val: t.length,                                                          color: 'var(--text-primary)' },
    { label: 'Done',        val: t.filter(x => /done|closed|resolved/i.test(x.status)).length,     color: '#22c55e' },
    { label: 'In Progress', val: t.filter(x => /progress/i.test(x.status)).length,                 color: '#3b82f6' },
    { label: 'Overdue',     val: t.filter(x => x.overdue).length,                                  color: '#ef4444' },
  ]
}
function sprintDone(sprint) {
  const t = sprint.tickets || []; if (!t.length) return 0
  return Math.round(t.filter(x => /done|closed|resolved/i.test(x.status)).length / t.length * 100)
}
function sprintInProg(sprint) {
  const t = sprint.tickets || []; if (!t.length) return 0
  return Math.round(t.filter(x => /progress/i.test(x.status)).length / t.length * 100)
}

// ── Data loading ──────────────────────────────────────────────────
async function loadProjects() {
  if (projects.value.length) return
  try {
    const res = await api.get('/api/jira/projects')
    projects.value = res.data.projects || []
    if (projects.value.length && !form.projectKey) {
      form.projectKey = projects.value[0].key
    }
  } catch {}
}

async function loadBoard() {
  loading.value = true; error.value = ''
  allTickets.value = []; totalTickets.value = 0; nextPageToken.value = null
  try {
    const qs = buildBoardQuery({ maxResults: PAGE_SIZE })
    const res = await api.get(`/api/jira/board?${qs}`)
    const data = res.data
    allTickets.value   = data.tickets    || []
    totalTickets.value = data.total      || allTickets.value.length
    nextPageToken.value = data.nextPageToken || null
    projectKey.value   = data.projectKey || ''
    projectName.value  = data.projectName || projectKey.value
    if (data.activeSprint) activeSprint.value = data.activeSprint
  } catch (e) {
    error.value = e.response?.data?.error || e.message || 'Could not connect to Jira'
  } finally { loading.value = false }
}

function buildBoardQuery({ token = null, maxResults = PAGE_SIZE } = {}) {
  const p = new URLSearchParams()
  if (selectedProject.value) p.set('project', selectedProject.value)
  if (boardScope.value && boardScope.value !== 'all') p.set('scope', boardScope.value)
  if (overdueOnly.value) p.set('overdueOnly', '1')
  if (priorityBucket.value) p.set('priorityBucket', priorityBucket.value)
  p.set('maxResults', maxResults)
  if (token) p.set('nextPageToken', token)
  return p.toString()
}

function applyBriefingContext() {
  const context = store.moduleContext
  if (!context || context.module !== 'jira') return

  boardScope.value = context.scope || 'all'
  overdueOnly.value = Boolean(context.overdueOnly)
  blockedOnly.value = Boolean(context.blockedOnly)
  priorityBucket.value = context.priorityBucket || ''
  activeTab.value = context.activeTab || 'list'
  searchQ.value = context.searchQuery || ''
  setModuleContext(null)
}

async function loadRemainingInBackground() {
  loadingMore.value = true
  try {
    while (nextPageToken.value) {
      const qs  = buildBoardQuery({ token: nextPageToken.value, maxResults: PAGE_SIZE })
      const res = await api.get(`/api/jira/board?${qs}`)
      const newTickets = res.data.tickets || []
      if (!newTickets.length) break
      allTickets.value = [...allTickets.value, ...newTickets]
      nextPageToken.value = res.data.nextPageToken || null
      await new Promise(r => setTimeout(r, 200))
    }
  } catch {} finally { loadingMore.value = false }
}

async function loadMoreTickets() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const qs = buildBoardQuery({ token: nextPageToken.value, maxResults: PAGE_SIZE })
    const res = await api.get(`/api/jira/board?${qs}`)
    const newTickets = res.data.tickets || []
    allTickets.value.push(...newTickets)
    nextPageToken.value = res.data.nextPageToken || null
  } catch (e) {
    showToast('Load more failed: ' + e.message, 'error')
  } finally {
    loadingMore.value = false
  }
}

async function loadSprints() {
  if (sprints.value.length) return
  loadingSprints.value = true
  try {
    const res = await api.get('/api/jira/sprints')
    sprints.value = res.data.sprints || []
  } catch (e) { showToast('Could not load sprints: ' + e.message, 'error') }
  finally { loadingSprints.value = false }
}

async function loadDetail(key) {
  try {
    const res = await api.get(`/api/jira/ticket/${key}`)
    detailTicket.value = { ...detailTicket.value, ...res.data }
  } catch {}
}

// ── Description: ADF text → structured paragraphs for display ────
function descParagraphs(text) {
  if (!text) return []
  return text.split('\n').filter(l => l.trim()).map(line => ({
    text:      line.replace(/^#{1,6}\s+/, '').replace(/^[•\-*]\s+/, '').replace(/^\d+\.\s+/, '').trim(),
    isHeading: /^#{1,6}\s/.test(line),
    isBullet:  /^[•\-*]\s/.test(line) || /^\d+\.\s/.test(line),
    isCode:    /^```/.test(line.trim()),
  })).filter(p => p.text)
}

function startEditDesc() {
  descEditVal.value = detailTicket.value?.description || ''
  editingDesc.value = true
  nextTick(() => descInputRef.value?.focus())
}

// FIX: Use regular template literals (not escaped backticks)
async function saveDesc() {
  editingDesc.value = false
  const val = descEditVal.value.trim()
  if (!detailTicket.value) return
  try {
    await api.put(`/api/jira/ticket/${detailTicket.value.key}`, { description: val })
    detailTicket.value.description = val
    showToast('Description updated')
  } catch (e) { showToast('Save failed: ' + e.message, 'error') }
}

function refreshData() {
  loadBoard()
  if (activeTab.value === 'sprints') { sprints.value = []; loadSprints() }
}

// ── Detail ────────────────────────────────────────────────────────
function openDetail(ticket) {
  detailTicket.value = { ...ticket }
  newComment.value   = ''
  editingTitle.value = false
  editingDesc.value  = false
  editingAssignee.value = false
  editingDueDate.value  = false
  mentionActive.value   = false
  mentionSuggestions.value = []
  loadDetail(ticket.key)
}

// ── Status transition ─────────────────────────────────────────────
async function moveTicket(key, newStatus) {
  movingTo.value = newStatus
  try {
    await api.put(`/api/jira/ticket/${key}`, { status: newStatus })
    const t = allTickets.value.find(x => x.key === key)
    if (t) t.status = newStatus
    if (detailTicket.value?.key === key) detailTicket.value.status = newStatus
    showToast(`${key} → ${newStatus}`)
  } catch (e) { showToast('Move failed: ' + e.message, 'error') }
  finally { movingTo.value = '' }
}

// ── Drag & drop ───────────────────────────────────────────────────
async function onDrop(colId) {
  dragOverCol.value = null
  if (!draggedKey.value) return
  const statusMap = { todo: 'To Do', inprog: 'In Progress', review: 'In Review', done: 'Done' }
  const newStatus = statusMap[colId]
  if (!newStatus) return
  const t = allTickets.value.find(x => x.key === draggedKey.value)
  if (!t || t.status === newStatus) return
  await moveTicket(draggedKey.value, newStatus)
  draggedKey.value = null
}

// ── Inline title edit ─────────────────────────────────────────────
function startEditTitle() {
  editTitleVal.value = detailTicket.value?.title || ''
  editingTitle.value = true
  nextTick(() => titleInput.value?.focus())
}
async function saveTitle() {
  const newTitle = editTitleVal.value.trim()
  editingTitle.value = false
  if (!newTitle || newTitle === detailTicket.value?.title) return
  try {
    await api.put(`/api/jira/ticket/${detailTicket.value.key}`, { title: newTitle })
    const t = allTickets.value.find(x => x.key === detailTicket.value.key)
    if (t) t.title = newTitle
    detailTicket.value.title = newTitle
    showToast('Title updated')
  } catch (e) { showToast('Failed to update title', 'error') }
}

// ── FIX 1: Editable Assignee ──────────────────────────────────────
function startEditAssignee() {
  assigneeSearchQ.value = ''
  assigneeSuggestions.value = []
  editingAssignee.value = true
  nextTick(() => {
    assigneeSearchRef.value?.focus()
    fetchAssigneeSuggestions('')
  })
}

let assigneeDebounce = null
function debounceFetchAssignees() {
  clearTimeout(assigneeDebounce)
  assigneeDebounce = setTimeout(() => fetchAssigneeSuggestions(assigneeSearchQ.value), 250)
}

async function fetchAssigneeSuggestions(q) {
  try {
    const res = await api.get('/api/jira/users', { params: { q: q || '.' } })
    assigneeSuggestions.value = res.data.users || []
  } catch {}
}

async function saveAssignee(user) {
  editingAssignee.value = false
  const prevAssignee = detailTicket.value.assignee
  const prevAssigneeId = detailTicket.value.assigneeId
  try {
    if (user) {
      detailTicket.value.assignee = user.displayName
      detailTicket.value.assigneeId = user.accountId
    } else {
      detailTicket.value.assignee = null
      detailTicket.value.assigneeId = null
    }
    const payload = user
      ? { assigneeId: user.accountId }
      : { assigneeId: null }
    await api.put(`/api/jira/ticket/${detailTicket.value.key}`, payload)
    const t = allTickets.value.find(x => x.key === detailTicket.value.key)
    if (t) { t.assignee = detailTicket.value.assignee; t.assigneeId = detailTicket.value.assigneeId }
    showToast(user ? `Assigned to ${user.displayName}` : 'Unassigned')
  } catch (e) {
    detailTicket.value.assignee = prevAssignee
    detailTicket.value.assigneeId = prevAssigneeId
    showToast('Failed to update assignee', 'error')
  }
}

// ── FIX 1: Editable Due Date ──────────────────────────────────────
function startEditDueDate() {
  dueDateEditVal.value = detailTicket.value?.dueDate || ''
  editingDueDate.value = true
}

async function saveDueDate() {
  editingDueDate.value = false
  const val = dueDateEditVal.value || null
  try {
    await api.put(`/api/jira/ticket/${detailTicket.value.key}`, { dueDate: val })
    detailTicket.value.dueDate = val
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const due = val ? new Date(val) : null
    const isDone = /done|closed|resolved/i.test(detailTicket.value.status)
    detailTicket.value.overdue = !!(due && due < now && !isDone)
    detailTicket.value.daysOverdue = detailTicket.value.overdue ? Math.floor((now - due) / 86400000) : 0
    const t = allTickets.value.find(x => x.key === detailTicket.value.key)
    if (t) { t.dueDate = val; t.overdue = detailTicket.value.overdue; t.daysOverdue = detailTicket.value.daysOverdue }
    showToast('Due date updated')
  } catch (e) { showToast('Failed to update due date', 'error') }
}

// ── FIX 2: @mention autocomplete ─────────────────────────────────
let mentionDebounce = null
function onCommentInput(e) {
  const val = e.target.value
  const pos = e.target.selectionStart
  // Find the last @ before cursor
  const beforeCursor = val.slice(0, pos)
  const atIdx = beforeCursor.lastIndexOf('@')
  if (atIdx !== -1) {
    const query = beforeCursor.slice(atIdx + 1)
    // Only trigger if no space in query (still typing)
    if (!query.includes(' ') && query.length <= 30) {
      mentionCursorPos.value = atIdx
      mentionQuery.value = query
      mentionActive.value = true
      clearTimeout(mentionDebounce)
      mentionDebounce = setTimeout(() => fetchMentionSuggestions(query), 200)
      return
    }
  }
  mentionActive.value = false
}

async function fetchMentionSuggestions(q) {
  try {
    const res = await api.get('/api/jira/users', { params: { q: q || '.' } })
    mentionSuggestions.value = (res.data.users || []).slice(0, 6)
  } catch {}
}

function insertMention(user) {
  const ta = commentTextareaRef.value
  if (!ta) return
  const val = newComment.value
  const atIdx = mentionCursorPos.value
  const beforeAt = val.slice(0, atIdx)
  const afterCursor = val.slice(ta.selectionStart)
  newComment.value = `${beforeAt}@${user.displayName} ${afterCursor}`
  mentionActive.value = false
  mentionSuggestions.value = []
  nextTick(() => {
    const newPos = (beforeAt + '@' + user.displayName + ' ').length
    ta.setSelectionRange(newPos, newPos)
    ta.focus()
  })
}

// ── FIX 6: Create modal assignee search ──────────────────────────
let createAssigneeDebounce = null
function debounceFetchCreateAssignees() {
  showCreateAssigneeDrop.value = true
  clearTimeout(createAssigneeDebounce)
  createAssigneeDebounce = setTimeout(() => fetchCreateAssignees(createAssigneeQ.value), 250)
}

async function fetchCreateAssignees(q) {
  if (!q.trim()) { createAssigneeSugg.value = []; return }
  try {
    const res = await api.get('/api/jira/users', { params: { q } })
    createAssigneeSugg.value = res.data.users || []
  } catch {}
}

function selectCreateAssignee(user) {
  createAssigneeSelected.value = user
  createAssigneeQ.value = ''
  createAssigneeSugg.value = []
  showCreateAssigneeDrop.value = false
  // Store for form submission
  form.assigneeEmail = user.email || ''
}

// ── Comment ───────────────────────────────────────────────────────
async function submitComment() {
  const body = newComment.value.trim()
  if (!body || submittingComment.value) return
  submittingComment.value = true
  try {
    const res = await api.post(`/api/jira/ticket/${detailTicket.value.key}/comment`, { body })
    if (!detailTicket.value.comments) detailTicket.value.comments = []
    detailTicket.value.comments.push(res.data)
    newComment.value = ''
    showToast('Comment added')
  } catch (e) { showToast('Comment failed: ' + e.message, 'error') }
  finally { submittingComment.value = false }
}

// ── Create ────────────────────────────────────────────────────────
function openCreate(statusId) {
  Object.assign(form, {
    title: '', description: '', type: 'Task', priority: 'Medium',
    dueDate: '', assigneeEmail: '', labels: '', storyPoints: '', startDate: '',
  })
  const sm = { todo: 'To Do', inprog: 'In Progress', review: 'In Review', done: 'Done' }
  form.status = sm[statusId] || 'To Do'
  if (!form.projectKey && projects.value.length) form.projectKey = projects.value[0].key
  // FIX 6: Reset assignee search
  createAssigneeSelected.value = null
  createAssigneeQ.value = ''
  createAssigneeSugg.value = []
  showCreateAssigneeDrop.value = false
  showCreate.value = true
  nextTick(() => titleInputEl.value?.focus())
}
function openCreateForDate(date) {
  openCreate()
  form.dueDate = date.toISOString().split('T')[0]
}
async function submitCreate() {
  if (!form.title.trim() || creating.value) return
  creating.value = true
  try {
    // FIX 6: use selected assignee accountId if available, else fall back to email
    const assigneeEmail = createAssigneeSelected.value
      ? createAssigneeSelected.value.email
      : (form.assigneeEmail || null)
    const assigneeId = createAssigneeSelected.value?.accountId || null

    const res = await api.post('/api/jira/ticket', {
      title:         form.title.trim(),
      description:   form.description,
      type:          form.type,
      priority:      form.priority,
      status:        form.status,
      dueDate:       form.dueDate    || null,
      startDate:     form.startDate  || null,
      assigneeEmail: assigneeEmail,
      assigneeId:    assigneeId,
      labels:        form.labels ? form.labels.split(',').map(s => s.trim()).filter(Boolean) : [],
      storyPoints:   form.storyPoints ? Number(form.storyPoints) : null,
      projectKey:    form.projectKey || null,
    })
    // Optimistic insert
    if (res.data.ticket) allTickets.value.unshift(res.data.ticket)
    showCreate.value = false
    showToast(`✓ Created ${res.data.key}`)
    if (!res.data.ticket) await loadBoard()
  } catch (e) { showToast(e.response?.data?.error || e.message, 'error') }
  finally { creating.value = false }
}

// ── Helpers ───────────────────────────────────────────────────────
function switchTab(id) {
  activeTab.value = id
  if (id === 'sprints' && !sprints.value.length) loadSprints()
}
function toggleGroup(k) {
  const s = new Set(collapsedGroups.value)
  s.has(k) ? s.delete(k) : s.add(k)
  collapsedGroups.value = s
}
function toggleFilter(key, val) {
  const arr = key === 'filterPriority' ? filterPriority
            : key === 'filterType'     ? filterType
            : filterAssignee
  const i = arr.value.indexOf(val)
  if (i >= 0) arr.value.splice(i, 1)
  else arr.value.push(val)
}
function clearFilters() {
  filterPriority.value = []; filterType.value = []; filterAssignee.value = []
  filterSprint.value = ''; searchQ.value = ''; showFilters.value = false
}
function calPrev()  { if (calMonth.value === 0) { calYear.value--; calMonth.value = 11 } else calMonth.value-- }
function calNext()  { if (calMonth.value === 11) { calYear.value++; calMonth.value = 0  } else calMonth.value++ }
function calToday() { calYear.value = new Date().getFullYear(); calMonth.value = new Date().getMonth() }

function nextStatusList(current) {
  const flows = {
    'To Do':      ['In Progress'],
    'In Progress':['In Review', 'Done', 'To Do'],
    'In Review':  ['Done', 'In Progress'],
    'Done':       ['To Do', 'In Progress'],
  }
  return flows[current] || STATUS_LIST.filter(s => s !== current)
}
function nPri(p) {
  const v = (p || '').toLowerCase()
  if (/highest|critical/.test(v)) return 'highest'
  if (/^high/.test(v))            return 'high'
  if (/medium/.test(v))           return 'medium'
  return 'low'
}
function priOrd(p) { return { highest: 0, high: 1, medium: 2, low: 3 }[nPri(p)] ?? 4 }
function typeIcon(t) {
  const v = (t || '').toLowerCase()
  if (v.includes('bug'))   return '🐛'
  if (v.includes('story')) return '📖'
  if (v.includes('epic'))  return '⚡'
  return '✅'
}
function sCls(s) {
  const v = (s || '').toLowerCase()
  if (/done|closed|resolved/.test(v)) return 's-done'
  if (/progress/.test(v))             return 's-inprog'
  if (/review|test|stage/.test(v))    return 's-review'
  return 's-todo'
}
// FIX: removed trailing semicolon after closing brace
function jiraUrl(key) {
  const d = (import.meta?.env?.VITE_JIRA_DOMAIN || 'yourcompany.atlassian.net')
    .replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `https://${d}/browse/${key}`
}

const AV = ['#0052CC','#36B37E','#FF5630','#6554C0','#00B8D9','#FF8B00','#8777D9','#2684FF']
function avColor(n = '') { let h = 0; for (const c of (n || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff; return AV[Math.abs(h) % AV.length] }
function avInit(n = '')  { const p = (n || '').trim().split(/\s+/); return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : (n.slice(0, 2) || '?').toUpperCase() }
function fmtDate(d)     { if (!d) return ''; return new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) }
function fmtShort(d)    { if (!d) return ''; return new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' }) }
function fmtDateTime(d) { if (!d) return ''; return new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
function isToday(d)  { const t = new Date(); return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear() }
function isWeekend(d){ return d.getDay() === 0 || d.getDay() === 6 }

function handleEsc() {
  if (calExpandCell.value) { calExpandCell.value = null; return }
  if (detailTicket.value)  { detailTicket.value  = null; return }
  if (showCreate.value)    { showCreate.value    = false; return }
  if (showFilters.value)   { showFilters.value   = false; return }
}
function showToast(msg, type = 'success') {
  toast.value = { msg, type }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3000)
}
function onKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  if (e.key === 'c' || e.key === 'C') openCreate()
  if (e.key === '/') { e.preventDefault(); document.querySelector('.jr-search')?.focus() }
  if (e.key === 'r' || e.key === 'R') refreshData()
}
function onDocClick(e) {
  if (filterRef.value && !filterRef.value.contains(e.target)) showFilters.value = false
}

onMounted(() => {
  applyBriefingContext()
  loadBoard()
  loadProjects()
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('click', onDocClick)
})
onMounted(() => {
  window.debugJira = {
    allTickets,
    totalTickets,
    nextPageToken,
    hasMore,
    loadingMore
  }
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', onDocClick)
})
</script>

<style scoped>
/* ══ ROOT ══════════════════════════════════════════════════════ */
.jr-root {
  height: 100%; display: flex; flex-direction: column; overflow: hidden;
  background:
    radial-gradient(circle at 16% 12%, rgba(82, 212, 255, 0.08), transparent 24%),
    linear-gradient(180deg, var(--bg-base-alt, var(--bg-base)), var(--bg-base));
  color: var(--text-primary); font-size: 13px;
  position: relative; font-family: inherit;
}

/* ══ TOP BAR ═══════════════════════════════════════════════════ */
.jr-topbar { display: flex; align-items: center; gap: 12px; padding: 0 20px; height: 56px; background: rgba(8, 13, 28, 0.56); border-bottom: 1px solid var(--border-subtle); flex-shrink: 0; backdrop-filter: blur(20px); }
.jr-topbar-left { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.jr-project-logo { width: 30px; height: 30px; background: #0052CC; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.jr-project-title { font-size: 14px; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
.jr-breadcrumb { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
.jr-bc-sep { opacity: .4; }
.jr-bc-active { color: var(--accent-hover); }
.jr-proj-simple { display: flex; align-items: center; }

/* Nav tabs */
.jr-nav { display: flex; gap: 1px; flex: 1; justify-content: center; overflow-x: auto; }
.jr-nav-tab { display: flex; align-items: center; gap: 5px; padding: 0 13px; height: 52px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-muted); font-size: 13px; cursor: pointer; transition: all .12s; white-space: nowrap; margin-bottom: -1px; }
.jr-nav-tab .jr-nav-icon { font-size: 11px; }
.jr-nav-tab:hover { color: var(--text-primary); background: rgba(255,255,255,.04); }
.jr-nav-tab.active { color: var(--accent-hover); border-bottom-color: var(--accent); font-weight: 600; }
.jr-topbar-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

/* ══ TOOLBAR ══════════════════════════════════════════════════ */
.jr-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: rgba(8, 13, 28, 0.46);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  flex-wrap: wrap;
  backdrop-filter: blur(16px);

  position: relative;
  z-index: 20;
  overflow: visible;
}
.jr-search-wrap { position: relative; flex-shrink: 0; }
.jr-si { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.jr-search { background: rgba(255,255,255,.045); border: 1px solid var(--border-default); border-radius: 999px; padding: 8px 30px 8px 30px; color: var(--text-primary); font-size: 12.5px; outline: none; width: 200px; transition: all .15s; backdrop-filter: blur(14px); }
.jr-search:focus { border-color: var(--border-strong); box-shadow: 0 0 0 4px rgba(82, 212, 255, 0.08); width: 260px; }
.jr-search::placeholder { color: var(--text-muted); }
.jr-kbd { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 10px; color: var(--text-muted); background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 3px; padding: 1px 4px; pointer-events: none; }
.jr-filters-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.jr-filter-btn { display: flex; align-items: center; gap: 5px; padding: 6px 12px; border: 1px solid var(--border-default); border-radius: 999px; background: rgba(255,255,255,.035); color: var(--text-secondary); font-size: 12px; cursor: pointer; position: relative; transition: all .12s; }
.jr-filter-btn:hover, .jr-filter-btn.active { background: rgba(82,212,255,.1); border-color: rgba(82,212,255,.24); color: var(--accent-hover); }
.jr-filter-count { background: linear-gradient(135deg, rgba(82,212,255,.92), rgba(139,125,255,.82)); color: white; border-radius: 999px; font-size: 10px; font-weight: 700; padding: 2px 6px; }
.jr-filter-wrap { position: relative; }
.jr-filter-panel { position: absolute; top: 42px; left: 0; z-index: 200; width: 320px; background: var(--surface-glass-strong); border: 1px solid var(--border-default); border-radius: 22px; padding: 16px; box-shadow: var(--shadow-lg); backdrop-filter: blur(22px); }
.jr-fp-head { display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 700; color: var(--text-primary); margin-bottom: 12px; }
.jr-fp-head button { background: none; border: none; color: var(--text-muted); font-size: 11px; cursor: pointer; }
.jr-fp-head button:hover { color: #ef4444; }
.jr-fp-section { margin-bottom: 12px; }
.jr-fp-section > label { font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; display: block; margin-bottom: 7px; }
.jr-fp-pills { display: flex; flex-wrap: wrap; gap: 5px; }
.jr-fp-pill { display: flex; align-items: center; gap: 5px; padding: 3px 10px; border: 1px solid var(--border-subtle); border-radius: 20px; background: transparent; color: var(--text-secondary); font-size: 11.5px; cursor: pointer; transition: all .1s; }
.jr-fp-pill:hover { background: rgba(255,255,255,.05); }
.jr-fp-pill.on { background: rgba(82,212,255,.1); border-color: rgba(82,212,255,.24); color: var(--accent-hover); font-weight: 600; }
.jr-fp-sel { width: 100%; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 7px; padding: 5px 8px; color: var(--text-primary); font-size: 12px; outline: none; }
.fp-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.fp-highest { background: #ef4444; } .fp-high { background: #f97316; } .fp-medium { background: #eab308; } .fp-low { background: #22c55e; }
.jr-active-tag { display: flex; align-items: center; gap: 4px; padding: 4px 10px; background: rgba(82,212,255,.1); border: 1px solid rgba(82,212,255,.22); border-radius: 999px; font-size: 11.5px; color: var(--accent-hover); cursor: pointer; white-space: nowrap; }
.jr-active-tag:hover { background: rgba(82,212,255,.16); }
.jr-groupby-wrap { display: flex; align-items: center; gap: 7px; }
.jr-tbl-lbl, .jr-groupby-lbl { font-size: 11.5px; color: var(--text-muted); white-space: nowrap; }
.jr-mini-stats { display: flex; align-items: center; gap: 12px; padding-left: 10px; border-left: 1px solid var(--border-subtle); }
.jr-ms { font-size: 12px; color: var(--text-muted); }
.jr-ms strong { color: var(--text-primary); }
.text-orange { color: #f97316 !important; } .text-red { color: #ef4444 !important; } .text-green { color: #22c55e !important; } .text-purple { color: #8b5cf6 !important; }
.jr-view-sel { background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 4px 8px; color: var(--text-primary); font-size: 12px; outline: none; }
.jr-icon-btn { width: 32px; height: 32px; border: 1px solid var(--border-default); border-radius: 999px; background: rgba(255,255,255,.035); color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .12s; }
.jr-icon-btn:hover { background: rgba(255,255,255,.06); color: var(--text-primary); border-color: var(--border-strong); }
.jr-create-btn { display: flex; align-items: center; gap: 5px; padding: 8px 15px; background: linear-gradient(135deg, rgba(82,212,255,.94), rgba(139,125,255,.84)); border: 1px solid rgba(255,255,255,.12); border-radius: 999px; color: white; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: opacity .15s, transform .15s; }
.jr-create-btn:hover:not(:disabled) { opacity: .92; transform: translateY(-1px); }
.jr-create-btn:disabled { opacity: .4; cursor: not-allowed; }
.jr-cancel-btn { padding: 8px 15px; background: rgba(255,255,255,.04); border: 1px solid var(--border-default); border-radius: 999px; color: var(--text-secondary); font-size: 12.5px; cursor: pointer; }
.jr-cancel-btn:hover { background: rgba(255,255,255,.06); }

/* ══ STATES ═══════════════════════════════════════════════════ */
.jr-full-load, .jr-full-err, .jr-empty-view { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--text-muted); font-size: 13px; }
.jr-load-ring { width: 30px; height: 30px; border: 3px solid rgba(82,212,255,.18); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin .7s linear infinite; }

/* ══ BOARD ════════════════════════════════════════════════════ */
.jr-board-wrap { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.jr-board { display: flex; gap: 12px; padding: 16px; overflow-x: auto; height: 100%; align-items: flex-start; scrollbar-width: thin; }
.jr-column { width: 260px; min-width: 260px; flex-shrink: 0; display: flex; flex-direction: column; background: rgba(255,255,255,.035); border: 1px solid var(--border-default); border-radius: 22px; max-height: 100%; overflow: hidden; transition: background .15s; backdrop-filter: blur(14px); }
.jr-column.drag-over { background: rgba(82,212,255,.08); border-color: rgba(82,212,255,.26); }
.jr-col-head { display: flex; align-items: center; gap: 7px; padding: 10px 12px 8px; flex-shrink: 0; }
.jr-col-hl { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.jr-col-name { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; flex: 1; }
.jr-col-cnt { background: rgba(255,255,255,.07); color: var(--text-muted); font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px; }
.jr-col-add-btn { width: 22px; height: 22px; border-radius: 5px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 15px; display: flex; align-items: center; justify-content: center; line-height: 1; }
.jr-col-add-btn:hover { background: rgba(255,255,255,.08); color: var(--text-primary); }
.jr-col-body { display: flex; flex-direction: column; gap: 7px; padding: 2px 10px 10px; overflow-y: auto; flex: 1; scrollbar-width: thin; }
.jr-col-empty { font-size: 12px; color: var(--text-muted); text-align: center; padding: 20px 10px; border: 1.5px dashed rgba(255,255,255,.08); border-radius: 8px; cursor: pointer; transition: all .15s; }
.jr-col-empty:hover { border-color: rgba(82,212,255,.24); color: var(--accent-hover); }
.jr-col-empty.sm { padding: 10px; font-size: 11px; }

/* Cards */
.jr-card { background: rgba(255,255,255,.04); border: 1px solid var(--border-default); border-radius: 16px; padding: 10px 11px; cursor: pointer; transition: all .12s; user-select: none; backdrop-filter: blur(12px); }
.jr-card:hover { border-color: rgba(82,212,255,.24); transform: translateY(-1px); box-shadow: 0 10px 24px rgba(2,8,24,.22); }
.jr-card.overdue { border-left: 3px solid #ef4444; }
.jr-card.dragging { opacity: .35; transform: scale(.96) rotate(1deg); }
.jr-card.compact { padding: 6px 8px; border-radius: 6px; display: flex; align-items: center; gap: 6px; }
.jr-card-head { display: flex; align-items: center; gap: 5px; margin-bottom: 5px; }
.jr-card-type { font-size: 11px; }
.jr-card-key { font-size: 11px; font-weight: 700; color: var(--accent-hover); }
.jr-card-title { font-size: 13px; color: var(--text-primary); line-height: 1.4; margin-bottom: 7px; }
.jr-card-title.compact { flex: 1; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 0; }
.jr-card-labels { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
.jr-card-foot { display: flex; align-items: center; gap: 6px; }
.jr-card-pri { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.jr-card-pri.xs { width: 6px; height: 6px; }
.jr-card-pri.sm { width: 7px; height: 7px; }
.pri-highest { background: #ef4444; } .pri-high { background: #f97316; } .pri-medium { background: #eab308; } .pri-low { background: #22c55e; }
.jr-overdue-chip { font-size: 11px; color: #ef4444; font-weight: 600; background: rgba(239,68,68,.1); padding: 1px 5px; border-radius: 4px; }
.jr-due-chip { font-size: 11px; color: var(--text-muted); }
.jr-due-red  { font-size: 12px; color: #ef4444; font-weight: 600; }
.jr-due-ok   { font-size: 12px; color: var(--text-muted); }
.jr-lbl { font-size: 10.5px; background: rgba(255,255,255,.07); border: 1px solid rgba(176,201,255,.1); color: var(--text-muted); padding: 1px 6px; border-radius: 20px; white-space: nowrap; }
.jr-lbl.xs { font-size: 9.5px; padding: 0 5px; }
.jr-av-sm { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 8.5px; font-weight: 700; color: white; }
.jr-av-xs { width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 7px; font-weight: 700; color: white; }
.jr-av-xs.ml-auto { margin-left: auto; }
.jr-av-sm.self { flex-shrink: 0; }
.jr-sbadge { font-size: 10.5px; font-weight: 600; padding: 2px 7px; border-radius: 4px; white-space: nowrap; display: inline-block; }
.jr-sbadge.lg { font-size: 12px; padding: 4px 10px; border-radius: 6px; }
.s-todo   { background: rgba(100,116,139,.15); color: #94a3b8; }
.s-inprog { background: rgba(59,130,246,.15);  color: #60a5fa; }
.s-review { background: rgba(139,92,246,.15);  color: #c084fc; }
.s-done   { background: rgba(34,197,94,.15);   color: #4ade80; }

/* ══ FIX: SWIMLANES with proper horizontal scroll ═════════════ */
.jr-swimlanes {
  display: flex; flex-direction: column; gap: 0;
  padding: 16px; padding-bottom: 8px;
  overflow-y: auto;   /* vertical scroll to reach all groups */
  overflow-x: hidden;
  flex: 1;
  scrollbar-width: thin;
}
.jr-swimlane { border: 1px solid var(--border-default); border-radius: 20px; overflow: hidden; margin-bottom: 12px; flex-shrink: 0; background: rgba(255,255,255,.025); backdrop-filter: blur(14px); }
.jr-swimlane-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: rgba(255,255,255,.03); border-bottom: 1px solid var(--border-subtle); cursor: pointer; user-select: none; }
.jr-swimlane-head:hover { background: rgba(255,255,255,.05); }
.jr-sl-name { font-size: 13px; font-weight: 600; color: var(--text-primary); flex: 1; }
/* Horizontal scroll per group row */
.jr-swimlane-cols-wrap { overflow-x: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.15) transparent; width: 100%; }
.jr-swimlane-cols-wrap::-webkit-scrollbar { height: 5px; }
.jr-swimlane-cols-wrap::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 3px; }
.jr-swimlane-cols { display: flex; min-width: max-content; }
/* Cap each column height — prevents one giant group from eating the screen */
.jr-sl-col {
  min-width: 260px; width: 260px; flex-shrink: 0;
  min-height: 60px;
  max-height: 380px;          /* scroll within the column if > ~10 cards */
  overflow-y: auto;
  padding: 8px;
  border-right: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; gap: 5px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,.1) transparent;
}
.jr-sl-col:last-child { border-right: none; }
.jr-sl-col-head { display: flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 5px; flex-shrink: 0; }
.jr-sl-col.drag-over { background: rgba(82,212,255,.06); }

/* ══ BACKLOG ══════════════════════════════════════════════════ */
.jr-backlog-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.jr-bl-toolbar { display: flex; align-items: center; gap: 9px; padding: 10px 18px; border-bottom: 1px solid var(--border-subtle); background: rgba(8,13,28,.42); flex-shrink: 0; backdrop-filter: blur(14px); }
.jr-bl-count { font-size: 12px; color: var(--text-muted); }
.jr-tbl-head { display: flex; align-items: center; padding: 8px 18px; background: rgba(255,255,255,.03); border-bottom: 1px solid var(--border-subtle); position: sticky; top: 0; z-index: 2; flex-shrink: 0; backdrop-filter: blur(14px); }
.jr-tc { font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; display: flex; align-items: center; gap: 4px; }
.tc-type     { width: 26px; flex-shrink: 0; }
.tc-key      { width: 90px; flex-shrink: 0; }
.tc-title    { flex: 1; min-width: 0; }
.tc-status   { width: 120px; flex-shrink: 0; }
.tc-pri      { width: 100px; flex-shrink: 0; }
.tc-assign   { width: 100px; flex-shrink: 0; display: flex; align-items: center; gap: 5px; }
/* FIX: tc-reporter CSS column width was missing */
.tc-reporter { width: 90px; flex-shrink: 0; }
.tc-due      { width: 90px; flex-shrink: 0; }
.tc-sprint   { width: 110px; flex-shrink: 0; }
.jr-sort-arrow { opacity: .5; }
.jr-tbl-body { flex: 1; overflow-y: auto; scrollbar-width: thin; }
.jr-tbl-row { display: flex; align-items: center; padding: 8px 18px; border-bottom: 1px solid rgba(255,255,255,.025); cursor: pointer; transition: background .1s; }
.jr-tbl-row:hover { background: rgba(255,255,255,.04); }
.jr-tbl-row.overdue { border-left: 3px solid rgba(239,68,68,.4); }
.jr-tbl-row.sub { padding-left: 36px; }
.jr-key-lnk { font-size: 11.5px; font-weight: 700; color: #4C9AFF; white-space: nowrap; }
.jr-row-title { font-size: 13px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jr-row-lbls { display: flex; gap: 3px; margin-top: 2px; }
.jr-assign-name { font-size: 11.5px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jr-pri-lbl { font-size: 11.5px; color: var(--text-secondary); }
.jr-sprint-tag { font-size: 10.5px; color: #60a5fa; background: rgba(59,130,246,.1); padding: 1px 6px; border-radius: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px; }
.jr-type-sm { font-size: 12px; }
.jr-type-sm.lg { font-size: 17px; }
.jr-none { color: var(--text-muted); font-size: 12px; }
.jr-group-row { display: flex; align-items: center; gap: 8px; padding: 8px 18px; background: rgba(255,255,255,.025); cursor: pointer; font-weight: 600; border-bottom: 1px solid var(--border-subtle); }
.jr-group-title { font-size: 12px; color: var(--text-primary); flex: 1; }
.jr-overdue-cnt { font-size: 11px; color: #ef4444; background: rgba(239,68,68,.1); padding: 1px 6px; border-radius: 20px; }
.jr-tbl-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px; color: var(--text-muted); font-size: 13px; }

/* ══ SPRINTS ══════════════════════════════════════════════════ */
.jr-sprints-wrap { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; scrollbar-width: thin; }
.jr-sprint-card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 12px; overflow: hidden; }
.jr-sprint-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); }
.jr-sprint-header-left { display: flex; align-items: center; gap: 10px; }
.jr-sprint-state { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
.jr-sprint-state.active { background: rgba(34,197,94,.1); color: #22c55e; border: 1px solid rgba(34,197,94,.2); }
.jr-sprint-state.closed { background: rgba(148,163,184,.1); color: #94a3b8; border: 1px solid rgba(148,163,184,.2); }
.jr-sprint-name { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.jr-days-left { font-size: 12px; color: #f97316; font-weight: 600; background: rgba(249,115,22,.1); padding: 1px 7px; border-radius: 20px; }
.jr-sprint-dates { font-size: 12px; color: var(--text-muted); }
.jr-sprint-kpis { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); gap: 20px; }
.jr-kpi { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.jr-kpi-val { font-size: 22px; font-weight: 700; color: var(--text-primary); }
.jr-kpi-lbl { font-size: 10.5px; color: var(--text-muted); }
.jr-kpi-prog { flex: 1; display: flex; align-items: center; gap: 10px; }
.jr-kpi-bar-wrap { flex: 1; height: 8px; background: rgba(255,255,255,.06); border-radius: 4px; overflow: hidden; position: relative; }
.jr-kpi-bar-done { position: absolute; left: 0; top: 0; height: 100%; background: #22c55e; border-radius: 4px; }
.jr-kpi-bar-prog { position: absolute; top: 0; height: 100%; background: #3b82f6; border-radius: 4px; }
.jr-kpi-pct { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
.jr-sprint-board { display: grid; grid-template-columns: repeat(4, 1fr); }
.jr-sprint-col { padding: 10px 12px; border-right: 1px solid rgba(255,255,255,.04); min-height: 80px; }
.jr-sprint-col:last-child { border-right: none; }
.jr-sprint-col-head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; }
.jr-sprint-col-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.jr-sprint-ticket { display: flex; align-items: center; gap: 5px; padding: 5px 8px; border-radius: 6px; cursor: pointer; transition: background .1s; border: 1px solid transparent; }
.jr-sprint-ticket:hover { background: rgba(255,255,255,.04); border-color: rgba(255,255,255,.05); }
.jr-sprint-ticket-title { font-size: 12px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.jr-show-all { padding: 8px 16px; border-top: 1px solid var(--border-subtle); }
.jr-show-all button { background: none; border: none; color: #4C9AFF; font-size: 12px; cursor: pointer; }
.jr-show-all button:hover { text-decoration: underline; }

/* ══ TIMELINE ═════════════════════════════════════════════════ */
.jr-timeline-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.jr-tl-toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface); flex-shrink: 0; }
.jr-tl-nav { padding: 5px 12px; border: 1px solid var(--border-default); border-radius: 6px; background: transparent; color: var(--text-secondary); font-size: 12px; cursor: pointer; }
.jr-tl-nav:hover { background: var(--bg-elevated); }
.jr-tl-today { padding: 5px 12px; border: 1px solid #4C9AFF; border-radius: 6px; background: rgba(0,82,204,.08); color: #4C9AFF; font-size: 12px; font-weight: 600; cursor: pointer; }
.jr-tl-container { display: flex; flex: 1; overflow: hidden; }
.jr-tl-labels { width: 260px; flex-shrink: 0; border-right: 1px solid var(--border-subtle); overflow-y: auto; scrollbar-width: thin; }
.jr-tl-labels-head { height: 48px; background: var(--bg-elevated); border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; padding: 0 12px; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
.jr-tl-group-label { padding: 7px 12px; background: rgba(255,255,255,.025); border-bottom: 1px solid rgba(255,255,255,.04); font-size: 11.5px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .03em; }
.jr-tl-row-label { height: 36px; display: flex; align-items: center; gap: 6px; padding: 0 12px; border-bottom: 1px solid rgba(255,255,255,.03); cursor: pointer; transition: background .1s; }
.jr-tl-row-label:hover { background: rgba(255,255,255,.025); }
.jr-tl-title { font-size: 12px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.jr-tl-grid-wrap { flex: 1; overflow: auto; position: relative; scrollbar-width: thin; }
.jr-tl-date-row { display: flex; height: 48px; background: var(--bg-elevated); border-bottom: 1px solid var(--border-subtle); position: sticky; top: 0; z-index: 5; min-width: max-content; }
.jr-tl-date-cell { min-width: 40px; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; border-right: 1px solid rgba(255,255,255,.04); padding: 2px 0; }
.jr-tl-date-cell.today { background: rgba(0,82,204,.12); }
.jr-tl-date-cell.weekend { background: rgba(255,255,255,.015); }
.jr-tl-day-num { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.jr-tl-day-name { font-size: 10px; color: var(--text-muted); }
.jr-tl-date-cell.today .jr-tl-day-num { color: #4C9AFF; }
.jr-tl-grid { position: relative; min-width: max-content; }
.jr-tl-col-bg { position: absolute; top: 0; bottom: 0; pointer-events: none; border-right: 1px solid rgba(255,255,255,.025); }
.jr-tl-col-bg.today { background: rgba(0,82,204,.04); }
.jr-tl-col-bg.weekend { background: rgba(255,255,255,.01); }
.jr-tl-group-spacer { height: 32px; background: rgba(255,255,255,.02); border-bottom: 1px solid rgba(255,255,255,.04); }
.jr-tl-bar-row { height: 36px; display: flex; align-items: center; border-bottom: 1px solid rgba(255,255,255,.03); padding: 0 2px; position: relative; }
.jr-tl-bar { position: absolute; height: 24px; border-radius: 4px; display: flex; align-items: center; padding: 0 8px; cursor: pointer; overflow: hidden; transition: opacity .12s; border: 1px solid transparent; min-width: 20px; }
.jr-tl-bar:hover { opacity: .85; }
.jr-tl-bar.s-todo   { background: rgba(100,116,139,.3); border-color: rgba(100,116,139,.5); }
.jr-tl-bar.s-inprog { background: rgba(59,130,246,.3);  border-color: rgba(59,130,246,.5); }
.jr-tl-bar.s-review { background: rgba(139,92,246,.3);  border-color: rgba(139,92,246,.5); }
.jr-tl-bar.s-done   { background: rgba(34,197,94,.3);   border-color: rgba(34,197,94,.5); }
.jr-tl-bar-label { font-size: 11px; color: white; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jr-tl-bar-empty { height: 36px; display: flex; align-items: center; padding: 0 8px; }
.jr-tl-no-date { font-size: 11px; color: var(--text-muted); font-style: italic; }

/* ══ CALENDAR ════════════════════════════════════════════════ */
.jr-cal-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.jr-cal-head { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface); flex-shrink: 0; }
.jr-cal-title { font-size: 16px; font-weight: 700; color: var(--text-primary); min-width: 180px; text-align: center; }
.jr-cal-legend { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.jr-cal-leg-item { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--text-muted); }
.jr-cal-leg-dot { width: 8px; height: 8px; border-radius: 50%; }
.jr-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); flex: 1; overflow-y: auto; scrollbar-width: thin; }
.jr-cal-dname { padding: 6px; text-align: center; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; background: var(--bg-elevated); border-bottom: 1px solid var(--border-subtle); }
.jr-cal-cell { min-height: 100px; padding: 6px; border-right: 1px solid rgba(255,255,255,.04); border-bottom: 1px solid rgba(255,255,255,.04); background: transparent; transition: background .1s; }
.jr-cal-cell:hover { background: rgba(255,255,255,.02); }
.jr-cal-cell.other-month { opacity: .35; }
.jr-cal-cell.today { background: rgba(0,82,204,.04); }
.jr-cal-cell.today .jr-cal-day { background: #0052CC; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; }
.jr-cal-cell-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.jr-cal-day { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); }
.jr-cal-add { width: 18px; height: 18px; border-radius: 4px; border: none; background: transparent; color: var(--text-muted); font-size: 14px; cursor: pointer; display: none; line-height: 1; align-items: center; justify-content: center; }
.jr-cal-cell:hover .jr-cal-add { display: flex; }
.jr-cal-add:hover { background: rgba(0,82,204,.1); color: #4C9AFF; }
.jr-cal-tickets { display: flex; flex-direction: column; gap: 2px; }
.jr-cal-chip { display: flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; border: 1px solid; cursor: pointer; font-size: 10.5px; font-weight: 600; transition: opacity .1s; }
.jr-cal-chip:hover { opacity: .8; }
.jr-cal-chip-type { font-size: 10px; }
.jr-cal-chip-key { font-weight: 700; flex-shrink: 0; }
.jr-cal-chip-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.jr-cal-more { font-size: 10.5px; color: var(--text-muted); cursor: pointer; padding: 1px 4px; }
.jr-cal-more:hover { color: #4C9AFF; }
.jr-cal-expand-bg { position: absolute; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.jr-cal-expand { background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 12px; width: 440px; max-height: 60vh; overflow-y: auto; box-shadow: 0 16px 48px rgba(0,0,0,.4); }
.jr-cal-expand-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); font-size: 13px; font-weight: 700; }
.jr-cal-expand-head button { background: none; border: none; color: var(--text-muted); cursor: pointer; }

/* ══ LIST ═════════════════════════════════════════════════════ */
.jr-list-wrap { flex: 1; overflow-y: auto; scrollbar-width: thin; }
.jr-list-toolbar { display: flex; align-items: center; gap: 9px; padding: 8px 18px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface); position: sticky; top: 0; z-index: 3; }
.jr-list-section { border-bottom: 1px solid var(--border-subtle); }
.jr-list-section-head { display: flex; align-items: center; gap: 8px; padding: 8px 18px; background: rgba(255,255,255,.02); cursor: pointer; }
.jr-list-row { display: flex; align-items: center; gap: 8px; padding: 8px 18px 8px 32px; border-bottom: 1px solid rgba(255,255,255,.02); cursor: pointer; transition: background .1s; }
.jr-list-row:hover { background: rgba(255,255,255,.025); }
.jr-list-row.overdue { border-left: 2px solid rgba(239,68,68,.4); }
.jr-list-title { font-size: 13px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }

/* ══ REPORTS ══════════════════════════════════════════════════ */
.jr-reports-wrap { flex: 1; overflow-y: auto; padding: 18px; scrollbar-width: thin; display: flex; flex-direction: column; gap: 16px; }
.jr-kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
.jr-kpi-card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 16px 18px; }
.jr-kpi-card-val { font-size: 28px; font-weight: 800; color: var(--text-primary); line-height: 1.1; }
.jr-kpi-card-lbl { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-top: 4px; }
.jr-kpi-card-sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.jr-charts-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
.jr-chart-card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 16px; }
.jr-chart-card.wide { grid-column: 1 / -1; }
.jr-chart-title { font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 14px; }
.jr-chart-sub { font-size: 11px; font-weight: 400; color: var(--text-muted); margin-left: 6px; }
.jr-donut-wrap { position: relative; width: 100px; height: 100px; margin: 0 auto 14px; }
.jr-donut-svg { width: 100%; height: 100%; }
.jr-donut-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.jr-donut-pct { font-size: 22px; font-weight: 800; color: var(--text-primary); line-height: 1; }
.jr-donut-lbl { font-size: 10px; color: var(--text-muted); }
.jr-donut-legend { display: flex; flex-direction: column; gap: 6px; }
.jr-legend-item { display: flex; align-items: center; gap: 7px; }
.jr-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.jr-legend-lbl { font-size: 12px; color: var(--text-secondary); flex: 1; }
.jr-legend-val { font-size: 12px; font-weight: 700; color: var(--text-primary); }
.jr-hbars { display: flex; flex-direction: column; gap: 10px; }
.jr-hbar-row { display: flex; align-items: center; gap: 8px; }
.jr-hbar-lbl { font-size: 12px; color: var(--text-secondary); width: 60px; flex-shrink: 0; }
.jr-hbar-wrap { flex: 1; height: 8px; background: rgba(255,255,255,.06); border-radius: 4px; overflow: hidden; }
.jr-hbar-fill { height: 100%; border-radius: 4px; transition: width .4s; }
.jr-hbar-val { font-size: 12px; font-weight: 700; color: var(--text-primary); min-width: 24px; text-align: right; }
.jr-workload-list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 200px; }
.jr-wl-row { display: flex; align-items: center; gap: 8px; }
.jr-wl-info { flex: 1; min-width: 0; }
.jr-wl-name { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 2px; }
.jr-wl-bar-wrap { height: 5px; background: rgba(255,255,255,.06); border-radius: 3px; overflow: hidden; }
.jr-wl-bar { height: 100%; border-radius: 3px; transition: width .4s; }
.jr-wl-nums { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
.jr-wl-total { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.jr-wl-overdue { font-size: 10px; color: #ef4444; font-weight: 600; }
.jr-activity-chart { display: flex; align-items: flex-end; gap: 4px; height: 80px; }
.jr-act-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; }
.jr-act-bar { width: 100%; background: #3b82f6; border-radius: 3px 3px 0 0; min-height: 2px; transition: height .4s; }
.jr-act-wk-lbl { font-size: 9px; color: var(--text-muted); white-space: nowrap; }

/* ══ TICKET DETAIL SLIDEOVER ══════════════════════════════════ */
.jr-detail-overlay { position: absolute; inset: 0; background: rgba(0,0,0,.4); display: flex; justify-content: flex-end; z-index: 50; }
.jr-detail { width: 480px; max-width: 95%; height: 100%; display: flex; flex-direction: column; background: var(--bg-surface); border-left: 1px solid var(--border-default); overflow: hidden; }
.jr-slide-enter-active, .jr-slide-leave-active { transition: all .2s ease; }
.jr-slide-enter-from .jr-detail, .jr-slide-leave-to .jr-detail { transform: translateX(100%); }
.jr-slide-enter-from, .jr-slide-leave-to { opacity: 0; }
.jr-detail-head { display: flex; align-items: center; justify-content: space-between; padding: 13px 18px; border-bottom: 1px solid var(--border-subtle); flex-shrink: 0; }
.jr-detail-head-left { display: flex; align-items: center; gap: 8px; }
.jr-detail-key { font-size: 13px; font-weight: 700; color: #4C9AFF; text-decoration: none; display: flex; align-items: center; gap: 4px; }
.jr-detail-key:hover { text-decoration: underline; }
.jr-detail-head-right { display: flex; gap: 6px; }
.jr-detail-body { flex: 1; overflow-y: auto; padding: 18px; scrollbar-width: thin; }
.jr-detail-title-wrap { margin-bottom: 12px; }
.jr-detail-title { font-size: 17px; font-weight: 700; color: var(--text-primary); line-height: 1.4; cursor: text; position: relative; padding: 4px 6px; border-radius: 6px; }
.jr-detail-title:hover { background: rgba(255,255,255,.04); }
.jr-edit-hint { font-size: 10px; color: var(--text-muted); margin-left: 8px; opacity: 0; transition: opacity .15s; vertical-align: middle; }
.jr-detail-title:hover .jr-edit-hint { opacity: 1; }
.jr-detail-title-input { width: 100%; background: var(--bg-elevated); border: 1.5px solid #0052CC; border-radius: 6px; padding: 7px 10px; color: var(--text-primary); font-size: 16px; font-weight: 700; font-family: inherit; resize: vertical; outline: none; box-sizing: border-box; }
.jr-detail-meta-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.jr-detail-overdue { font-size: 12px; font-weight: 700; color: #ef4444; background: rgba(239,68,68,.1); padding: 3px 9px; border-radius: 20px; }
.jr-pri-badge { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 20px; }
.pri-badge-highest { background: rgba(239,68,68,.1); color: #ef4444; }
.pri-badge-high    { background: rgba(249,115,22,.1); color: #f97316; }
.pri-badge-medium  { background: rgba(234,179,8,.1);  color: #eab308; }
.pri-badge-low     { background: rgba(34,197,94,.1);  color: #22c55e; }
.jr-quick-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-bottom: 14px; }
.jr-qa-lbl { font-size: 11px; color: var(--text-muted); }
.jr-qa-btn { display: flex; align-items: center; gap: 5px; padding: 4px 12px; border: 1px solid var(--border-default); border-radius: 6px; background: transparent; color: var(--text-secondary); font-size: 12px; cursor: pointer; transition: all .12s; }
.jr-qa-btn:hover:not(:disabled) { background: rgba(0,82,204,.08); border-color: #4C9AFF; color: #4C9AFF; }
.jr-qa-btn:disabled { opacity: .4; cursor: not-allowed; }
.jr-qa-btn.primary { background: #0052CC; border-color: #0052CC; color: white; }
.jr-qa-btn.primary:hover:not(:disabled) { background: #0747A6; }
.jr-detail-divider { height: 1px; background: var(--border-subtle); margin: 14px 0; }
.jr-detail-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 6px; }
.jr-dm-item { display: flex; flex-direction: column; gap: 4px; }
.jr-dm-item label { font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
.jr-dm-val { font-size: 13px; color: var(--text-primary); }
.jr-dm-val.muted { color: var(--text-muted); }
.jr-dm-val.av-val { display: flex; align-items: center; gap: 7px; }
.jr-detail-section { margin-top: 14px; }
.jr-detail-section > label { font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; display: block; margin-bottom: 8px; }
.jr-detail-labels { display: flex; flex-wrap: wrap; gap: 5px; }

/* FIX: Description paragraph rendering CSS */
.jr-desc-content { display: flex; flex-direction: column; gap: 3px; }
.jr-desc-para { font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin: 0; padding: 1px 0; }
.jr-desc-para.is-heading { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-top: 4px; }
.jr-desc-para.is-bullet { padding-left: 14px; position: relative; }
.jr-desc-para.is-bullet::before { content: "•"; position: absolute; left: 4px; color: var(--text-muted); }
.jr-desc-para.is-code { font-family: monospace; font-size: 12px; background: rgba(255,255,255,.04); padding: 3px 8px; border-radius: 4px; color: #60a5fa; }
.jr-desc-empty { font-size: 13px; color: var(--text-muted); font-style: italic; cursor: pointer; padding: 6px 4px; }
.jr-desc-empty:hover { color: var(--text-secondary); }
.jr-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px; }
.jr-edit-icon-btn { background: none; border: none; color: var(--text-muted); font-size: 11.5px; cursor: pointer; padding: 2px 7px; border-radius: 4px; }
.jr-edit-icon-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }
.jr-edit-field { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.jr-edit-field.col { flex-direction: column; align-items: flex-start; }
.jr-edit-textarea { width: 100%; background: var(--bg-elevated); border: 1px solid var(--border-default); border-radius: 7px; padding: 8px 10px; color: var(--text-primary); font-size: 12.5px; font-family: inherit; resize: vertical; outline: none; box-sizing: border-box; }
.jr-edit-textarea:focus { border-color: #0052CC; }
.jr-edit-actions { display: flex; gap: 5px; margin-top: 5px; }
.jr-save-btn { padding: 4px 10px; background: #0052CC; border: none; border-radius: 5px; color: white; font-size: 12px; cursor: pointer; }
.jr-cancel-btn-sm { padding: 4px 8px; background: none; border: 1px solid var(--border-subtle); border-radius: 5px; color: var(--text-muted); font-size: 12px; cursor: pointer; }
.jr-sec-lbl { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
.jr-comment-text { display: flex; flex-direction: column; gap: 2px; }
.jr-comment-count { background: rgba(255,255,255,.07); color: var(--text-muted); padding: 1px 6px; border-radius: 10px; font-size: 10px; font-weight: 700; margin-left: 5px; }
.jr-comments-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px; }
.jr-comment { display: flex; gap: 9px; }
.jr-comment-body { flex: 1; background: var(--bg-elevated); border-radius: 8px; padding: 8px 10px; }
.jr-comment-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.jr-comment-author { font-size: 12px; font-weight: 700; color: var(--text-primary); }
.jr-comment-time { font-size: 11px; color: var(--text-muted); }
.jr-no-comments { font-size: 12px; color: var(--text-muted); margin-bottom: 12px; font-style: italic; }
.jr-comment-input-wrap { display: flex; gap: 9px; align-items: flex-start; }
.jr-comment-editor { flex: 1; }
.jr-comment-ta { width: 100%; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 8px 10px; color: var(--text-primary); font-size: 13px; font-family: inherit; resize: vertical; outline: none; box-sizing: border-box; transition: border-color .15s; }
.jr-comment-ta:focus { border-color: #0052CC; }
.jr-comment-ta::placeholder { color: var(--text-muted); }
.jr-comment-actions { display: flex; gap: 6px; margin-top: 6px; justify-content: flex-end; }

/* ══ CREATE MODAL ════════════════════════════════════════════ */
.jr-modal-bg { position: absolute; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 60; }
.jr-modal { background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 16px; width: 560px; max-width: 96vw; max-height: 92vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.45); }
.jr-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--border-subtle); }
.jr-modal-head-left { display: flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 700; color: var(--text-primary); }
.jr-modal-close { background: none; border: none; color: var(--text-muted); cursor: pointer; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
.jr-modal-close:hover { background: var(--bg-elevated); }
.jr-modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
.jr-modal-foot { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--border-subtle); justify-content: flex-end; }
.jr-modal-hint { font-size: 11.5px; color: var(--text-muted); flex: 1; }
.jr-mf-group { display: flex; flex-direction: column; gap: 5px; }
.jr-mf-group > label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.jr-mf-hint { font-weight: 400; color: var(--text-muted); }
.jr-mf-row { display: flex; gap: 14px; }
.jr-mf-row.two > * { flex: 1; }
.jr-mf-input { background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 7px; padding: 8px 12px; color: var(--text-primary); font-size: 13px; font-family: inherit; outline: none; width: 100%; box-sizing: border-box; }
.jr-mf-input:focus { border-color: #0052CC; }
.jr-mf-input::placeholder { color: var(--text-muted); }
.jr-mf-sel { background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 7px; padding: 8px 12px; color: var(--text-primary); font-size: 13px; outline: none; width: 100%; }
.jr-type-picker { display: flex; gap: 6px; flex-wrap: wrap; }
.jr-type-opt { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 7px 12px; border: 1px solid var(--border-subtle); border-radius: 8px; background: transparent; color: var(--text-secondary); font-size: 11.5px; cursor: pointer; transition: all .12s; min-width: 52px; }
.jr-type-opt > span:first-child { font-size: 17px; }
.jr-type-opt:hover { border-color: rgba(0,82,204,.4); color: var(--text-primary); background: rgba(0,82,204,.05); }
.jr-type-opt.on { border-color: #0052CC; background: rgba(0,82,204,.1); color: #4C9AFF; font-weight: 600; }
.jr-pri-picker { display: flex; gap: 6px; flex-wrap: wrap; }
.jr-pri-opt { display: flex; align-items: center; gap: 5px; padding: 6px 10px; border: 1px solid var(--border-subtle); border-radius: 20px; background: transparent; color: var(--text-secondary); font-size: 12px; cursor: pointer; transition: all .12s; }
.jr-pri-opt:hover { background: var(--bg-elevated); }
.jr-pri-opt.on { border-color: #4C9AFF; background: rgba(0,82,204,.08); color: #4C9AFF; font-weight: 600; }

/* ══ SPINNERS ═════════════════════════════════════════════════ */
.jr-spin-xs { width: 11px; height: 11px; border: 1.5px solid rgba(255,255,255,.3); border-top-color: white; border-radius: 50%; animation: spin .65s linear infinite; display: inline-block; }

/* ══ TOAST ════════════════════════════════════════════════════ */
.jr-toast { position: absolute; bottom: 22px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 7px; padding: 9px 18px; border-radius: 20px; font-size: 13px; font-weight: 600; color: white; z-index: 500; box-shadow: 0 4px 16px rgba(0,0,0,.3); white-space: nowrap; }
.jr-toast.success { background: #22c55e; }
.jr-toast.error   { background: #ef4444; }
.jr-toast-enter-active, .jr-toast-leave-active { transition: opacity .2s, transform .2s; }
.jr-toast-enter-from, .jr-toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(10px); }

/* ══ FIX: Editable detail fields ════════════════════════════ */
.jr-dm-editable { cursor: pointer; border-radius: 5px; padding: 2px 5px; margin: -2px -5px; transition: background .12s; }
.jr-dm-editable:hover { background: rgba(255,255,255,.06); }
.jr-dm-editable .jr-edit-hint { opacity: 0; font-size: 10px; color: var(--text-muted); margin-left: 5px; transition: opacity .12s; }
.jr-dm-editable:hover .jr-edit-hint { opacity: 1; }

/* ══ FIX: User search dropdown (detail + create) ════════════ */
.jr-user-search-wrap { display: flex; flex-direction: column; gap: 5px; position: relative; }
.jr-user-drop { position: absolute; top: 100%; left: 0; right: 0; z-index: 300; background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 9px; box-shadow: 0 10px 30px rgba(0,0,0,.4); overflow: hidden; max-height: 220px; overflow-y: auto; margin-top: 4px; }
.jr-user-drop.create-drop { right: auto; min-width: 280px; }
.jr-user-opt { display: flex; align-items: center; gap: 9px; padding: 8px 12px; cursor: pointer; transition: background .1s; }
.jr-user-opt:hover { background: rgba(255,255,255,.06); }
.jr-user-opt.unassign { color: var(--text-muted); font-size: 12px; padding: 7px 12px; border-bottom: 1px solid var(--border-subtle); }
.jr-user-opt.unassign:hover { color: #ef4444; background: rgba(239,68,68,.06); }
.jr-user-name { font-size: 12.5px; font-weight: 600; color: var(--text-primary); }
.jr-user-email { font-size: 11px; color: var(--text-muted); }

/* ══ FIX: @mention autocomplete ════════════════════════════ */
.jr-mention-drop { position: absolute; bottom: calc(100% + 4px); left: 0; right: 0; z-index: 300; background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 9px; box-shadow: 0 -8px 24px rgba(0,0,0,.35); overflow: hidden; max-height: 200px; overflow-y: auto; }
.jr-mention-opt { display: flex; align-items: center; gap: 9px; padding: 7px 12px; cursor: pointer; font-size: 12.5px; color: var(--text-primary); transition: background .1s; }
.jr-mention-opt:hover { background: rgba(0,82,204,.1); }

/* ══ FIX: Selected user chip in create modal ════════════════ */
.jr-selected-user-chip { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: rgba(0,82,204,.08); border: 1px solid rgba(0,82,204,.25); border-radius: 8px; }
.jr-chip-close { background: none; border: none; color: var(--text-muted); font-size: 12px; cursor: pointer; padding: 0 2px; margin-left: auto; flex-shrink: 0; }
.jr-chip-close:hover { color: #ef4444; }

/* ══ FIX: Smaller input variant for inline edit ═════════════ */
.jr-mf-input.sm { padding: 5px 9px; font-size: 12px; }


/* ══ LOAD MORE BAR ════════════════════════════════════════════ */
.jr-loadmore-bar {
  /* FIX 3: regular flex item in .jr-root — always visible below the board */
  display: flex; align-items: center; gap: 12px;
  padding: 10px 20px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-subtle);
  font-size: 12.5px; color: var(--text-secondary);
  flex-shrink: 0;
  z-index: 30;
}
.jr-loadmore-spinner {
  width: 14px; height: 14px; border: 2px solid rgba(0,82,204,.2);
  border-top-color: #0052CC; border-radius: 50%;
  animation: spin .65s linear infinite; flex-shrink: 0;
}
.jr-loadmore-icon { color: var(--text-muted); flex-shrink: 0; }
.jr-loadmore-progress {
  flex: 1; max-width: 200px; height: 5px;
  background: rgba(255,255,255,.07); border-radius: 3px; overflow: hidden;
}
.jr-loadmore-fill { height: 100%; background: #0052CC; border-radius: 3px; transition: width .3s; }
.jr-loadmore-btn {
  padding: 4px 12px; background: rgba(0,82,204,.1); border: 1px solid rgba(0,82,204,.3);
  border-radius: 6px; color: #4C9AFF; font-size: 12px; cursor: pointer; white-space: nowrap;
}
.jr-loadmore-btn:hover { background: rgba(0,82,204,.2); }
.jr-loadall-btn {
  padding: 4px 12px; background: transparent; border: 1px solid var(--border-default);
  border-radius: 6px; color: var(--text-muted); font-size: 12px; cursor: pointer; white-space: nowrap;
}
.jr-loadall-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }
.jr-total-real { font-size: 11px; color: var(--text-muted); }
.jr-loadbar-enter-active, .jr-loadbar-leave-active { transition: transform .2s, opacity .2s; }
.jr-loadbar-enter-from, .jr-loadbar-leave-to { transform: translateY(100%); opacity: 0; }
</style>
