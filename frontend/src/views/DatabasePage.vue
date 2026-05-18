<template>
  <div class="db-page">
    <form class="db-autofill-trap" autocomplete="on" @submit.prevent>
      <input type="text" name="username" autocomplete="username" tabindex="-1" />
      <input type="password" name="password" autocomplete="current-password" tabindex="-1" />
    </form>

    <div class="topbar">
      <div class="topbar-left">
        <button class="back-btn" @click="emit('close')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <div class="topbar-divider" />
        <div class="db-identity">
          <span
            class="db-vendor-badge"
            :style="{ background: `${vendorColor}22`, color: vendorColor, borderColor: `${vendorColor}44` }"
          >
            {{ vendorEmoji }} {{ dbInfo.vendor }}
          </span>
          <span class="db-alias">{{ dbInfo.alias || integrationName }}</span>
          <span class="db-status-dot" :class="dbInfo.status === 'ok' ? 'ok' : 'err'" />
        </div>
      </div>

      <div class="topbar-right">
        <button class="mode-toggle" :class="{ active: queryMode === 'nl' }" @click="queryMode = 'nl'">
          ✨ Natural language
        </button>
        <button class="mode-toggle" :class="{ active: queryMode === 'raw' }" @click="queryMode = 'raw'">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          Raw query
        </button>
        <button class="settings-btn" @click="emit('open-integrations')">Settings</button>
        <!-- <button class="btn-open-data" @click="emit('open-data-mode')">Open in Data mode</button> -->
      </div>
    </div>

    <div class="body">
      <aside class="schema-panel" :class="{ collapsed: schemaCollapsed }">
        <div class="schema-header">
          <template v-if="!schemaCollapsed">
            <span class="panel-label">{{ databaseObjectLabel.toUpperCase() }}</span>
            <div class="schema-header-actions">
              <button class="refresh-btn" :class="{ spinning: refreshing }" title="Refresh" @click="refreshSchema">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
              </button>
              <button class="collapse-btn" title="Collapse sidebar" @click="toggleSchemaCollapse">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            </div>
          </template>

          <template v-else>
            <button class="collapse-btn collapse-btn--icon-only" title="Expand sidebar" @click="toggleSchemaCollapse">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </template>
        </div>

        <div v-if="!schemaCollapsed" class="schema-search-wrap">
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="schema-search-icon"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            v-model="schemaFilter"
            class="schema-search"
            name="orion_database_schema_filter"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            data-lpignore="true"
            data-form-type="other"
            :placeholder="`Filter ${databaseObjectLabel.toLowerCase()}...`"
          />
        </div>

        <div v-if="schemaLoading" class="schema-loading">
          <div v-for="i in schemaCollapsed ? 4 : 6" :key="i" class="skeleton" />
        </div>

        <div v-else class="collection-list" :class="{ 'collection-list--collapsed': schemaCollapsed }">
          <div v-if="schemaError" class="schema-empty schema-empty--error">{{ schemaError }}</div>
          <div v-else-if="!filteredCollections.length" class="schema-empty">
            {{ schemaFilter ? 'No matches' : `No ${databaseObjectLabel.toLowerCase()} found` }}
          </div>
          <template v-else>
            <button
              v-for="col in filteredCollections"
              :key="col.name"
              class="collection-item"
              :class="{ active: selectedCollection === col.name, compact: schemaCollapsed }"
              :title="schemaCollapsed ? `${col.name} (${formatCount(resolveCollectionCount(col))})` : ''"
              @click="selectCollection(col)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="col-icon">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
              <template v-if="!schemaCollapsed">
                <span class="col-name">{{ col.name }}</span>
                <span class="col-count">{{ formatCount(resolveCollectionCount(col)) }}</span>
              </template>
            </button>
          </template>
        </div>

        <div v-if="!schemaCollapsed" class="schema-footer">
          <div class="stat-row">
            <span class="stat-label">{{ databaseObjectLabel }}</span>
            <span class="stat-val">{{ collections.length }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Rows/docs</span>
            <span class="stat-val">{{ formatCount(totalDocs) }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Connected</span>
            <span class="stat-val ok-text">{{ dbInfo.status === 'ok' ? 'Live' : 'Error' }}</span>
          </div>
        </div>
      </aside>

      <section class="query-panel">
        <div v-if="queryMode === 'nl'" class="nl-section">
          <div class="chip-row">
            <button v-for="chip in smartChips" :key="chip" class="chip" @click="runSuggestedQuery(chip)">
              {{ chip }}
            </button>
          </div>

          <div class="nl-input-wrap">
            <div class="nl-input-inner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="nl-icon">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              <input
                v-model="nlQuery"
                class="nl-input"
                :placeholder="selectedCollection ? `Ask anything about ${selectedCollection}...` : 'Ask anything about your data...'"
                :disabled="nlLoading"
                @keydown.enter.exact.prevent="runNL"
              />
              <button
                class="nl-clear-btn"
                :disabled="nlLoading || (!nlQuery.trim() && !nlResult && !nlError)"
                @click="clearNlResult"
              >
                Clear
              </button>
              <button class="nl-send" :class="{ loading: nlLoading }" :disabled="!nlQuery.trim() || nlLoading" @click="runNL">
                <svg v-if="!nlLoading" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
                <span v-else class="btn-spinner" />
              </button>
            </div>
            <div class="nl-hint">
              Press Enter to run
              <span v-if="selectedCollection"> · Focused on <strong>{{ selectedCollection }}</strong></span>
            </div>
          </div>

          <div v-if="nlLoading" class="result-loading">
            <div class="thinking-dots"><span /><span /><span /></div>
            <span class="thinking-label">Running query...</span>
          </div>

          <div v-else-if="nlError" class="result-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {{ nlError }}
          </div>

          <div v-else-if="nlResult" class="result-section">
            <div class="result-meta-bar result-meta-bar--menu-only">
              <div class="result-meta-actions result-meta-actions--menu">
                <div class="result-menu-wrap">
                  <button class="result-menu-btn" @click="toggleResultMenu">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="12" cy="19" r="1.8" />
                    </svg>
                  </button>
                  <div v-if="showResultMenu" class="result-menu-dropdown">
                    <button
                      v-if="selectedCollection"
                      class="result-menu-item"
                      :disabled="!permissions.insert"
                      @click="handleAddRow"
                    >
                      Add row
                    </button>
                    <button class="result-menu-item" @click="handleCopyResult">Copy</button>
                    <button class="result-menu-item" @click="handleExportResult('json')">Export JSON</button>
                    <button class="result-menu-item" @click="handleExportResult('csv')">Export CSV</button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="showGeneratedQuery && nlResult.generatedQuery" class="generated-query">
              <pre>{{ nlResult.generatedQuery }}</pre>
            </div>

            <!-- <div v-if="displayedNlSummaryText" class="ai-summary ai-summary--compact">
              <span class="ai-badge">✨</span>
              <span class="ai-summary-text">{{ displayedNlSummaryText }}</span>
            </div> -->

            <template v-if="resultRows.length">
              <ResultTable
                :rows="resultRows"
                :columns="resultColumns"
                :show-row-actions="showResultRowActions"
                :permissions="permissions"
                @cell-click="openCellDetail"
                @copy-row="copyRow"
                @edit-row="openEditRow"
                @delete-row="deleteRow"
              />

              <div v-if="showPreviewPagination" class="floating-pagination-shell">
                <div class="floating-pagination compact">
                  <button
                    class="floating-pagination__nav-btn"
                    :disabled="previewPage <= 1 || nlLoading"
                    @click="changePreviewPage(previewPage - 1)"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                    <span>Prev</span>
                  </button>

                  <div class="floating-pagination__pages">
                    <template v-for="(item, index) in previewVisiblePages" :key="`${item}-${index}`">
                      <span v-if="item === 'ellipsis'" class="floating-pagination__ellipsis">…</span>
                      <button
                        v-else
                        class="floating-pagination__page-btn"
                        :class="{ active: Number(item) === previewPage }"
                        :disabled="Number(item) === previewPage || nlLoading"
                        @click="goToPreviewPage(Number(item))"
                      >
                        {{ item }}
                      </button>
                    </template>
                  </div>

                  <button
                    class="floating-pagination__nav-btn"
                    :disabled="!previewHasNext || nlLoading"
                    @click="changePreviewPage(previewPage + 1)"
                  >
                    <span>Next</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>

                  <div class="floating-pagination__summary">
                    {{ previewRangeLabel }}
                  </div>
                </div>
              </div>
            </template>

            <div v-else class="no-rows">No rows returned.</div>
          </div>
        </div>

        <div v-else class="raw-section">
          <div class="raw-toolbar">
            <span class="raw-label">{{ rawQueryLabel }}</span>
            <div class="raw-toolbar-right">
              <select v-model="rawCollection" class="raw-select" :disabled="!usesCollections">
                <option value="">{{ usesCollections ? 'Select collection...' : 'Table chosen inside SQL' }}</option>
                <option v-for="item in collections" :key="item.name" :value="item.name">{{ item.name }}</option>
              </select>
              <button class="btn-run" :disabled="rawLoading || !rawQuery.trim()" @click="runRaw">
                <span v-if="rawLoading" class="btn-spinner" />
                <template v-else>Run</template>
              </button>
            </div>
          </div>

          <div class="raw-editor-wrap">
            <textarea
              v-model="rawQuery"
              class="raw-editor"
              spellcheck="false"
              :placeholder="rawPlaceholder"
              @keydown.meta.enter.prevent="runRaw"
              @keydown.ctrl.enter.prevent="runRaw"
            />
          </div>

          <div v-if="rawLoading" class="result-loading">
            <div class="thinking-dots"><span /><span /><span /></div>
            <span class="thinking-label">Executing raw query...</span>
          </div>

          <div v-else-if="rawError" class="result-error">{{ rawError }}</div>

          <div v-else-if="rawResult" class="result-section no-top-pad">
            <div class="result-meta-bar">
              <span class="result-meta-label">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {{ rawResultRows.length }} row{{ rawResultRows.length !== 1 ? 's' : '' }}
                <span v-if="rawResult.executionMs" class="ms-badge">{{ rawResult.executionMs }}ms</span>
              </span>
              <div class="result-meta-actions">
                <button class="meta-btn" @click="copyRaw">{{ rawCopied ? 'Copied!' : 'Copy JSON' }}</button>
                <button class="meta-btn" @click="exportRows('json', rawResultRows)">Export JSON</button>
                <button class="meta-btn" @click="exportRows('csv', rawResultRows)">Export CSV</button>
                <button class="meta-btn" @click="showRawExecutedQuery = !showRawExecutedQuery">
                  {{ showRawExecutedQuery ? 'Hide' : 'Show' }} query
                </button>
                <button class="meta-btn" @click="clearRawResult">Clear</button>
              </div>
            </div>

            <div v-if="showRawExecutedQuery && rawResult.executedQuery" class="generated-query">
              <pre>{{ rawResult.executedQuery }}</pre>
            </div>

            <ResultTable
              v-if="rawResultRows.length"
              :rows="rawResultRows"
              :columns="rawResultColumns"
              :show-row-actions="false"
              :can-write="false"
              @cell-click="openCellDetail"
            />
            <div v-else class="no-rows">No rows returned.</div>
          </div>
        </div>
      </section>
    </div>

    <div v-if="selectedCell" class="db-modal-backdrop" @click.self="closeCellDetail">
      <div class="db-modal">
        <div class="db-modal-head">
          <div>
            <div class="db-modal-title">{{ selectedCell.column }}</div>
            <div class="db-modal-subtitle">Full field value</div>
          </div>
          <button class="meta-btn" @click="closeCellDetail">Close</button>
        </div>
        <pre class="db-modal-pre">{{ selectedCell.text }}</pre>
      </div>
    </div>

    <div v-if="rowEditorOpen" class="db-modal-backdrop" @click.self="closeRowEditor">
      <div class="db-modal db-modal--wide">
        <div class="db-modal-head">
          <div>
            <div class="db-modal-title">{{ rowEditorMode === 'add' ? 'Add row' : 'Edit row' }}</div>
            <div class="db-modal-subtitle">{{ selectedCollection || 'Selected table' }}</div>
          </div>
          <button class="meta-btn" @click="closeRowEditor">Close</button>
        </div>
        <div v-if="selectedCollectionMeta?.fieldNames?.length" class="db-modal-hint">
          Known fields: {{ selectedCollectionMeta.fieldNames.join(', ') }}
        </div>
        <textarea v-model="rowEditorText" class="db-json-editor" spellcheck="false" />
        <div v-if="rowMutationError" class="result-error db-inline-error">{{ rowMutationError }}</div>
        <div class="db-modal-actions">
          <button class="meta-btn" @click="closeRowEditor">Cancel</button>
          <button class="btn-run" :disabled="rowMutationLoading" @click="saveRowMutation">
            <span v-if="rowMutationLoading" class="btn-spinner" />
            <template v-else>{{ rowEditorMode === 'add' ? 'Insert row' : 'Save changes' }}</template>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, ref, watch } from 'vue'
import api from '../services/api'

const emit = defineEmits(['close', 'open-integrations', 'open-data-mode'])

const dbInfo = ref({
  vendor: 'Database',
  alias: 'Database',
  status: 'ok',
})

const VENDOR_META = {
  MongoDB: { color: '#10d080', emoji: '🍃' },
  PostgreSQL: { color: '#4186c7', emoji: '🐘' },
  MySQL: { color: '#e48f41', emoji: '🐬' },
  SQLite: { color: '#a895f5', emoji: '🪨' },
  Database: { color: '#7c6fff', emoji: '🗄️' },
}

const vendorColor = computed(() => VENDOR_META[dbInfo.value.vendor]?.color || '#7c6fff')
const vendorEmoji = computed(() => VENDOR_META[dbInfo.value.vendor]?.emoji || '🗄️')
const integrationName = computed(() => dbInfo.value.alias || 'Database')
const canWrite = ref(false)
const permissions = ref({ insert: false, update: false, delete: false })

const collections = ref([])
const schemaLoading = ref(false)
const schemaError = ref('')
const refreshing = ref(false)
const schemaFilter = ref('')
const schemaCollapsed = ref(false)
const selectedCollection = ref('')
const selectedCollectionMeta = computed(() => collections.value.find((item) => item.name === selectedCollection.value) || null)

const filteredCollections = computed(() => {
  const q = schemaFilter.value.trim().toLowerCase()
  if (!q) return collections.value
  return collections.value.filter((item) => {
    const haystack = `${item.name} ${(item.columns || []).join(' ')}`.toLowerCase()
    return haystack.includes(q)
  })
})

const totalDocs = computed(() => {
  if (!collections.value.length) return null

  let total = 0
  let hasKnownCounts = false

  for (const item of collections.value) {
    const count = resolveCollectionCount(item)
    if (count === null) return null
    total += count
    hasKnownCounts = true
  }

  return hasKnownCounts ? total : null
})

const usesCollections = computed(() => dbInfo.value.vendor === 'MongoDB')
const databaseObjectLabel = computed(() => {
  if (usesCollections.value) return 'Collections'
  if (['PostgreSQL', 'MySQL', 'SQLite'].includes(dbInfo.value.vendor)) {
    return 'Tables'
  }
  return 'Objects'
})

const queryMode = ref('nl')
const nlQuery = ref('')
const nlLoading = ref(false)
const nlResult = ref(null)
const nlError = ref('')
const showGeneratedQuery = ref(false)
const copied = ref(false)
const showResultMenu = ref(false)

const previewPage = ref(1)
const previewPageSize = 25
const previewTotalCount = ref(0)
const previewHasNext = ref(false)
const previewSearchTerm = ref('')

const selectedCell = ref(null)
const rowEditorOpen = ref(false)
const rowEditorMode = ref('add')
const rowEditorText = ref('{}')
const rowMutationLoading = ref(false)
const rowMutationError = ref('')
const activeRow = ref(null)

const resultRows = computed(() => Array.isArray(nlResult.value?.rows) ? nlResult.value.rows : [])
const resultColumns = computed(() => {
  const keys = new Set()
  resultRows.value.slice(0, 25).forEach((row) => Object.keys(row || {}).forEach((key) => keys.add(key)))
  return [...keys].filter((key) => key !== '__v')
})

const rawQuery = ref('')
const rawCollection = ref('')
const rawLoading = ref(false)
const rawResult = ref(null)
const rawError = ref('')
const rawCopied = ref(false)
const showRawExecutedQuery = ref(false)

const rawQueryLabel = computed(() => (usesCollections.value ? 'Aggregation pipeline or find JSON' : 'Read-only SQL query'))
const rawPlaceholder = computed(() =>
  usesCollections.value
    ? '[\n  { "$match": {} },\n  { "$limit": 25 }\n]'
    : 'SELECT * FROM your_table\nLIMIT 25'
)

const rawResultRows = computed(() => Array.isArray(rawResult.value?.rows) ? rawResult.value.rows : [])
const rawResultColumns = computed(() => {
  const keys = new Set()
  rawResultRows.value.slice(0, 25).forEach((row) => Object.keys(row || {}).forEach((key) => keys.add(key)))
  return [...keys].filter((key) => key !== '__v')
})

const previewResolvedTotalCount = computed(() => {
  const explicitTotal = Number(previewTotalCount.value)
  if (Number.isFinite(explicitTotal) && explicitTotal > 0) return explicitTotal

  const responseEstimated = Number(nlResult.value?.table?.estimated_rows)
  if (Number.isFinite(responseEstimated) && responseEstimated > 0) return responseEstimated

  const selectedCount = Number(resolveCollectionCount(selectedCollectionMeta.value))
  if (Number.isFinite(selectedCount) && selectedCount > 0) return selectedCount

  return resultRows.value.length
})

const previewPageCount = computed(() => {
  const total = previewResolvedTotalCount.value
  if (Number.isFinite(total) && total > 0) {
    return Math.max(1, Math.ceil(total / previewPageSize))
  }
  return previewHasNext.value ? previewPage.value + 1 : previewPage.value
})

const showPreviewPagination = computed(() => {
  return nlResult.value?.source === 'preview' && (previewPageCount.value > 1 || previewHasNext.value || previewPage.value > 1)
})

const showResultRowActions = computed(() => {
  if (!selectedCollection.value || !resultRows.value.length) return false

  if (nlResult.value?.source === 'preview') return true
  if (!canWrite.value) return false

  const knownFields = Array.isArray(selectedCollectionMeta.value?.fieldNames)
    ? selectedCollectionMeta.value.fieldNames
    : Array.isArray(selectedCollectionMeta.value?.columns)
      ? selectedCollectionMeta.value.columns
      : []

  if (!knownFields.length) return false

  const rowKeys = Object.keys(resultRows.value[0] || {})
  if (!rowKeys.length) return false

  const overlap = rowKeys.filter((key) => knownFields.includes(key)).length
  return overlap >= Math.min(2, rowKeys.length)
})

const previewRangeLabel = computed(() => {
  if (!resultRows.value.length) return '0'

  const start = (previewPage.value - 1) * previewPageSize + 1
  const total = previewResolvedTotalCount.value
  const end = start + resultRows.value.length - 1

  if (Number.isFinite(total) && total > 0) {
    return `${start}–${Math.min(end, total)} of ${formatCountExact(total)}`
  }

  return `${start}–${end}`
})

const previewVisiblePages = computed(() => buildPreviewPageItems(previewPage.value, previewPageCount.value))

// const displayedNlSummary = computed(() => {
//   const summary = String(nlResult.value?.summary || '').trim()
//   if (!summary) return ''
//   if (resultRows.value.length === 0) return summary
//   return summary
// })

// const displayedNlSummaryText = computed(() => stripBasicMarkdown(displayedNlSummary.value))

const smartChips = computed(() => {
  if (selectedCollection.value) {
    return [
      `Show latest 10 from ${selectedCollection.value}`,
      `Count documents in ${selectedCollection.value}`,
      `Group ${selectedCollection.value} by status`,
      `${selectedCollection.value} from last 7 days`,
    ]
  }

  return [
    'Show latest 10 records',
    'Count rows by status',
    'Show last 7 days activity',
    'What looks important today?',
  ]
})

const DIRECT_SEARCH_PREFIXES = [
  'show ',
  'count ',
  'group ',
  'list ',
  'what ',
  'which ',
  'how ',
  'sum ',
  'avg ',
  'average ',
  'latest ',
  'last ',
  'top ',
  'find ',
  'give ',
  'get ',
]

function toggleSchemaCollapse() {
  schemaCollapsed.value = !schemaCollapsed.value
}

function toggleResultMenu() {
  showResultMenu.value = !showResultMenu.value
}

function closeResultMenu() {
  showResultMenu.value = false
}

function handleAddRow() {
  closeResultMenu()
  openAddRow()
}

async function handleCopyResult() {
  closeResultMenu()
  await copyResult()
}

function handleExportResult(format) {
  closeResultMenu()
  exportRows(format, resultRows.value)
}

// function stripBasicMarkdown(text = '') {
//   return String(text || '')
//     .replace(/\*\*(.*?)\*\*/g, '$1')
//     .replace(/__(.*?)__/g, '$1')
//     .trim()
// }

function buildPreviewPageItems(currentPage, totalPages) {
  const current = Math.max(1, Number(currentPage) || 1)
  const total = Math.max(1, Number(totalPages) || 1)

  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1)
  }

  if (current <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', total]
  }

  if (current >= total - 3) {
    return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total]
  }

  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total]
}

function quoteSqlIdentifier(identifier = '') {
  const parts = String(identifier)
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)

  if (!parts.length) return identifier

  if (dbInfo.value.vendor === 'MySQL') {
    return parts.map((part) => `\`${part.replace(/`/g, '``')}\``).join('.')
  }

  return parts.map((part) => `"${part.replace(/"/g, '""')}"`).join('.')
}

function formatCount(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  const n = Number(value)
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function resolveCollectionCount(collection) {
  const raw = collection?.count ?? collection?.estimatedRows
  if (raw === null || raw === undefined || raw === '') return null

  const numeric = Number(raw)
  if (!Number.isFinite(numeric) || numeric < 0) return null

  return numeric
}

function formatCountExact(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString('en-IN')
}

function normalizeVendor(vendor = '') {
  const map = {
    postgres: 'PostgreSQL',
    mysql: 'MySQL',
    mongodb: 'MongoDB',
    sqlite: 'SQLite',
  }
  return map[String(vendor).toLowerCase()] || vendor || 'Database'
}

function defaultRawQuery() {
  if (usesCollections.value) {
    return '[\n  { "$match": {} },\n  { "$limit": 25 }\n]'
  }
  return 'SELECT *\nFROM your_table\nLIMIT 25'
}

function toPrettyText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function shouldUseCollectionSearch(query = '') {
  if (!selectedCollection.value) return false
  const text = String(query || '').trim()
  if (text.length < 3) return false
  const normalized = text.toLowerCase()
  return !DIRECT_SEARCH_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

async function loadSchema({ keepSelection = true } = {}) {
  schemaLoading.value = true
  schemaError.value = ''

  try {
    const res = await api.get('/api/integrations/database/schema')
    const nextCollections = Array.isArray(res.data.tables) ? res.data.tables : []
    collections.value = nextCollections
    dbInfo.value = {
      vendor: normalizeVendor(res.data.connection?.vendor || res.data.vendor),
      alias: res.data.connection?.alias || res.data.name || 'Database',
      status: res.data.connection?.status || 'ok',
    }
    canWrite.value = true
    permissions.value = {
      insert: true,
      update: true,
      delete: true,
    }

    if (!keepSelection || !nextCollections.some((item) => item.name === selectedCollection.value)) {
      selectedCollection.value = nextCollections[0]?.name || ''
    }

    if (usesCollections.value && selectedCollection.value && !rawCollection.value) {
      rawCollection.value = selectedCollection.value
    }

    if (!rawQuery.value.trim()) {
      rawQuery.value = defaultRawQuery()
    }
  } catch (err) {
    schemaError.value = err.response?.data?.error || 'Failed to load database schema.'
    collections.value = []
    selectedCollection.value = ''
  } finally {
    schemaLoading.value = false
  }
}

async function refreshSchema() {
  refreshing.value = true
  await loadSchema({ keepSelection: true })
  window.setTimeout(() => {
    refreshing.value = false
  }, 500)
}

function selectCollection(collection) {
  selectedCollection.value = selectedCollection.value === collection.name ? '' : collection.name
}

function buildPreviewQuery(collectionName) {
  if (usesCollections.value) {
    return '[\n  { "$limit": 25 }\n]'
  }

  return `SELECT *\nFROM ${quoteSqlIdentifier(collectionName)}\nLIMIT 25`
}

async function loadCollectionPreview(collectionName, page = 1, options = {}) {
  const searchTerm = String(options.searchTerm || '').trim()

  if (!collectionName) {
    nlResult.value = null
    nlError.value = ''
    previewTotalCount.value = 0
    previewSearchTerm.value = ''
    return
  }

  nlLoading.value = true
  nlError.value = ''
  nlResult.value = null
  showGeneratedQuery.value = false
  closeResultMenu()

  try {
    const res = await api.post('/db-chat/preview', {
      target: collectionName,
      page,
      pageSize: previewPageSize,
      searchTerm,
    })

    const incomingPage = Number(res.data.page || page)
    const rows = Array.isArray(res.data.rows) ? res.data.rows : []

    const explicitTotal = Number(res.data.totalCount)
    const estimatedTotal = Number(
      res.data.table?.estimated_rows ??
      resolveCollectionCount(selectedCollectionMeta.value) ??
      0
    )

    const resolvedTotal =
      Number.isFinite(explicitTotal) && explicitTotal > 0
        ? explicitTotal
        : Number.isFinite(estimatedTotal) && estimatedTotal > 0
          ? estimatedTotal
          : 0

    previewPage.value = incomingPage
    previewTotalCount.value = resolvedTotal
    previewSearchTerm.value = searchTerm

    if (typeof res.data.hasNext === 'boolean') {
      previewHasNext.value = res.data.hasNext
    } else if (resolvedTotal > 0) {
      previewHasNext.value = incomingPage * previewPageSize < resolvedTotal
    } else {
      previewHasNext.value = rows.length === previewPageSize
    }

    const nextPermissions = {
      insert: res.data.permissions?.insert ?? permissions.value.insert ?? true,
      update: res.data.permissions?.update ?? permissions.value.update ?? true,
      delete: res.data.permissions?.delete ?? permissions.value.delete ?? true,
    }

    permissions.value = nextPermissions
    canWrite.value = nextPermissions.insert || nextPermissions.update || nextPermissions.delete

    nlResult.value = {
      rows,
      summary: searchTerm
        ? `Showing matches for "${searchTerm}" in ${collectionName}.`
        : `Showing ${collectionName}.`,
      generatedQuery: res.data.executedQuery || buildPreviewQuery(collectionName),
      executionMs: res.data.executionMs || null,
      source: 'preview',
      target: collectionName,
      table: res.data.table || null,
    }
  } catch (err) {
    nlError.value = err.response?.data?.error || `Failed to load ${collectionName}.`
    previewTotalCount.value = 0
    previewHasNext.value = false
  } finally {
    nlLoading.value = false
  }
}

async function changePreviewPage(page) {
  if (!selectedCollection.value || page < 1) return
  if (page > previewPage.value && !previewHasNext.value) return
  if (page === previewPage.value) return

  await loadCollectionPreview(selectedCollection.value, page, {
    searchTerm: previewSearchTerm.value,
  })
}

async function goToPreviewPage(page) {
  await changePreviewPage(page)
}

function runSuggestedQuery(text) {
  nlQuery.value = text
  runNL()
}

function clearNlResult() {
  nlQuery.value = ''
  showGeneratedQuery.value = false
  previewSearchTerm.value = ''
  closeResultMenu()
  if (selectedCollection.value) {
    loadCollectionPreview(selectedCollection.value, 1)
    return
  }
  nlResult.value = null
  nlError.value = ''
  previewTotalCount.value = 0
  previewHasNext.value = false
}

async function runNL() {
  const query = nlQuery.value.trim()
  if (!query || nlLoading.value) return

  if (shouldUseCollectionSearch(query)) {
    await loadCollectionPreview(selectedCollection.value, 1, { searchTerm: query })
    return
  }

  nlLoading.value = true
  nlError.value = ''
  nlResult.value = null
  showGeneratedQuery.value = false
  closeResultMenu()

  try {
    const focusedQuery = selectedCollection.value
      ? `[Collection: ${selectedCollection.value}] ${query}`
      : query
    const res = await api.post('/db-chat', {
      message: focusedQuery,
      sessionId: null,
    })

    nlResult.value = {
      rows: Array.isArray(res.data.rows) ? res.data.rows : [],
      summary: buildNaturalLanguageSummary(res.data, query),
      generatedQuery: res.data.generatedQuery || res.data.queryPlan?.executedQuery || '',
      executionMs: res.data.executionMs || null,
      source: 'nl',
      target: res.data.queryMeta?.collection || selectedCollection.value || '',
      table: res.data.table || null,
    }

    previewTotalCount.value = 0
    previewHasNext.value = false
  } catch (err) {
    nlError.value = err.response?.data?.error || 'Query failed.'
  } finally {
    nlLoading.value = false
  }
}

async function runRaw() {
  const query = rawQuery.value.trim()
  if (!query || rawLoading.value) return

  rawLoading.value = true
  rawError.value = ''
  rawResult.value = null
  showRawExecutedQuery.value = false

  try {
    const res = await api.post('/db-chat/raw', {
      collection: rawCollection.value,
      query,
    })

    rawResult.value = {
      rows: Array.isArray(res.data.rows) ? res.data.rows : [],
      executionMs: res.data.executionMs || null,
      executedQuery: res.data.executedQuery || query,
      source: 'raw',
    }
  } catch (err) {
    rawError.value = err.response?.data?.error || 'Raw query failed.'
  } finally {
    rawLoading.value = false
  }
}

async function copyResult() {
  await navigator.clipboard.writeText(JSON.stringify(resultRows.value, null, 2))
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1800)
}

async function copyRaw() {
  await navigator.clipboard.writeText(JSON.stringify(rawResultRows.value, null, 2))
  rawCopied.value = true
  window.setTimeout(() => {
    rawCopied.value = false
  }, 1800)
}

function clearRawResult() {
  rawResult.value = null
  rawError.value = ''
  showRawExecutedQuery.value = false
  if (selectedCollection.value) {
    loadCollectionPreview(selectedCollection.value, previewPage.value, {
      searchTerm: previewSearchTerm.value,
    })
  }
}

function openCellDetail(payload) {
  selectedCell.value = {
    column: payload.column,
    text: toPrettyText(payload.value),
  }
}

function closeCellDetail() {
  selectedCell.value = null
}

async function copyRow(row) {
  await navigator.clipboard.writeText(JSON.stringify(row, null, 2))
}

function openAddRow() {
  rowEditorMode.value = 'add'
  activeRow.value = null
  rowEditorErrorReset()
  rowEditorText.value = '{}'
  rowEditorOpen.value = true
}

function openEditRow(row) {
  rowEditorMode.value = 'edit'
  activeRow.value = row
  rowEditorErrorReset()
  rowEditorText.value = JSON.stringify(row, null, 2)
  rowEditorOpen.value = true
}

function closeRowEditor() {
  rowEditorOpen.value = false
  rowMutationLoading.value = false
  rowMutationError.value = ''
}

function rowEditorErrorReset() {
  rowMutationError.value = ''
}

function parseEditorPayload() {
  try {
    const parsed = JSON.parse(rowEditorText.value || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Row payload must be a JSON object.')
    }
    return parsed
  } catch (err) {
    throw new Error(err.message || 'Row payload must be valid JSON.')
  }
}

async function saveRowMutation() {
  if (!selectedCollection.value) return
  rowMutationLoading.value = true
  rowMutationError.value = ''

  try {
    const nextRow = parseEditorPayload()
    await api.post('/db-chat/mutate', {
      action: rowEditorMode.value === 'add' ? 'insert' : 'update',
      target: selectedCollection.value,
      originalRow: activeRow.value,
      nextRow,
    })
    closeRowEditor()
    await loadCollectionPreview(selectedCollection.value, rowEditorMode.value === 'add' ? 1 : previewPage.value)
  } catch (err) {
    rowMutationError.value = err.response?.data?.error || err.message || 'Failed to save row.'
  } finally {
    rowMutationLoading.value = false
  }
}

async function deleteRow(row) {
  if (!selectedCollection.value) return
  const confirmed = window.confirm('Delete this row? This action cannot be undone.')
  if (!confirmed) return

  try {
    await api.post('/db-chat/mutate', {
      action: 'delete',
      target: selectedCollection.value,
      originalRow: row,
    })
    const nextPage = resultRows.value.length === 1 && previewPage.value > 1 ? previewPage.value - 1 : previewPage.value
    await loadCollectionPreview(selectedCollection.value, nextPage)
  } catch (err) {
    nlError.value = err.response?.data?.error || 'Failed to delete row.'
  }
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function exportRows(format, rows) {
  const safeRows = Array.isArray(rows) ? rows : []
  const suffix = selectedCollection.value ? selectedCollection.value.replace(/[^\w.-]+/g, '_') : 'query'

  if (format === 'json') {
    downloadBlob(`${suffix}.json`, JSON.stringify(safeRows, null, 2), 'application/json')
    return
  }

  const columns = new Set()
  safeRows.forEach((row) => Object.keys(row || {}).forEach((key) => columns.add(key)))
  const orderedColumns = [...columns]
  const lines = [
    orderedColumns.join(','),
    ...safeRows.map((row) =>
      orderedColumns
        .map((key) => {
          const value = row?.[key]
          const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')
          return `"${text.replace(/"/g, '""')}"`
        })
        .join(',')
    ),
  ]
  downloadBlob(`${suffix}.csv`, lines.join('\n'), 'text/csv;charset=utf-8')
}

function buildNaturalLanguageSummary(response = {}, query = '') {
  const reply = String(response.reply || '').trim()
  const rows = Array.isArray(response.rows) ? response.rows : []
  const collectionName = String(response.queryMeta?.collection || selectedCollection.value || '').trim()

  if (reply) return reply

  if (rows.length) {
    return buildCompactResultSummary({
      rowCount: rows.length,
      collectionName,
    })
  }

  return query
}

function buildCompactResultSummary({ rowCount = 0, collectionName = '' } = {}) {
  const label = String(collectionName || '').trim()
  const suffix = label ? ` from ${label}` : ''
  return `Showing ${rowCount} row${rowCount === 1 ? '' : 's'}${suffix}.`
}

watch(selectedCollection, (value) => {
  nlQuery.value = ''
  showGeneratedQuery.value = false
  closeResultMenu()

  if (usesCollections.value && value) {
    rawCollection.value = value
  }
  if (value) {
    previewSearchTerm.value = ''
    loadCollectionPreview(value, 1)
  } else {
    nlResult.value = null
    nlError.value = ''
    previewTotalCount.value = 0
    previewHasNext.value = false
    previewSearchTerm.value = ''
  }
})

watch(nlQuery, (value, previousValue) => {
  if (queryMode.value !== 'nl') return
  if (nlLoading.value) return
  const nextText = String(value || '').trim()
  const previousText = String(previousValue || '').trim()
  if (nextText || !previousText || !selectedCollection.value) return
  previewSearchTerm.value = ''
  loadCollectionPreview(selectedCollection.value, 1)
})

watch(usesCollections, () => {
  rawQuery.value = defaultRawQuery()
  if (!usesCollections.value) {
    rawCollection.value = ''
  } else if (selectedCollection.value) {
    rawCollection.value = selectedCollection.value
  }
})

const ResultTable = defineComponent({
  name: 'ResultTable',
  props: {
    rows: { type: Array, default: () => [] },
    columns: { type: Array, default: () => [] },
    showRowActions: { type: Boolean, default: false },
    permissions: { type: Object, default: () => ({ insert: false, update: false, delete: false }) },
  },
  emits: ['cell-click', 'copy-row', 'edit-row', 'delete-row'],
  setup(props, { emit }) {
    const copiedRowIndex = ref(null)

    function renderIcon(kind) {
      if (kind === 'check') {
        return h(
          'svg',
          {
            width: 14,
            height: 14,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': 2.2,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          },
          [h('polyline', { points: '20 6 9 17 4 12' })]
        )
      }

      if (kind === 'copy') {
        return h(
          'svg',
          {
            width: 14,
            height: 14,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': 1.9,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          },
          [
            h('rect', { x: '9', y: '9', width: '11', height: '11', rx: '2' }),
            h('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }),
          ]
        )
      }

      if (kind === 'edit') {
        return h(
          'svg',
          {
            width: 14,
            height: 14,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': 1.9,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          },
          [
            h('path', { d: 'M12 20h9' }),
            h('path', { d: 'M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z' }),
          ]
        )
      }

      return h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.9,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        },
        [
          h('polyline', { points: '3 6 5 6 21 6' }),
          h('path', { d: 'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2' }),
          h('path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }),
          h('line', { x1: '10', y1: '11', x2: '10', y2: '17' }),
          h('line', { x1: '14', y1: '11', x2: '14', y2: '17' }),
        ]
      )
    }

    function cellVal(row, column) {
      const value = row?.[column]
      if (value === null || value === undefined) return ''
      if (typeof value === 'object') {
        if (value.$oid) return value.$oid
        if (value.$date) return new Date(value.$date).toLocaleString('en-IN')
        return JSON.stringify(value).slice(0, 80)
      }
      return String(value)
    }

    function cellCls(row, column) {
      const value = row?.[column]
      const normalized = String(value || '').toLowerCase()
      if (typeof value === 'number') return 'cell-num'
      if (typeof value === 'boolean') return 'cell-bool'
      if (normalized.includes('paid') || normalized === 'done' || normalized === 'active') return 'cell-paid'
      if (normalized.includes('pending') || normalized.includes('overdue') || normalized.includes('failed')) return 'cell-warn'
      return ''
    }

    return () =>
      h('div', { class: 'table-wrap' }, [
        h('table', { class: 'result-table' }, [
          h(
            'thead',
            [
              h(
                'tr',
                [
                  ...props.columns.map((column) => h('th', { key: column }, column)),
                  ...(props.showRowActions ? [h('th', { key: '__actions' }, 'Actions')] : []),
                ]
              ),
            ]
          ),
          h(
            'tbody',
            props.rows.map((row, index) =>
              h(
                'tr',
                { key: index },
                [
                  ...props.columns.map((column) =>
                    h(
                      'td',
                      { key: column, class: cellCls(row, column) },
                      h(
                        'button',
                        {
                          class: 'cell-button',
                          onClick: () => {
                            emit('cell-click', { column, value: row?.[column], row })
                          },
                        },
                        cellVal(row, column)
                      )
                    )
                  ),
                  ...(props.showRowActions
                    ? [
                        h('td', { key: '__actions', class: 'row-actions-cell' }, [
                          h('div', { class: 'row-actions' }, [
                            h(
                              'button',
                              {
                                class: [
                                  'row-action-btn',
                                  copiedRowIndex.value === index ? 'row-action-btn--success' : '',
                                ],
                                title: copiedRowIndex.value === index ? 'Copied' : 'Copy row',
                                'aria-label': copiedRowIndex.value === index ? 'Copied' : 'Copy row',
                                onClick: async () => {
                                  emit('copy-row', row)
                                  copiedRowIndex.value = index
                                  window.setTimeout(() => {
                                    if (copiedRowIndex.value === index) copiedRowIndex.value = null
                                  }, 1500)
                                },
                              },
                              renderIcon(copiedRowIndex.value === index ? 'check' : 'copy')
                            ),
                            h(
                              'button',
                              {
                                class: 'row-action-btn',
                                title: 'Edit row',
                                'aria-label': 'Edit row',
                                disabled: !props.permissions?.update,
                                onClick: () => emit('edit-row', row),
                              },
                              renderIcon('edit')
                            ),
                            h(
                              'button',
                              {
                                class: 'row-action-btn row-action-btn--danger',
                                title: 'Delete row',
                                'aria-label': 'Delete row',
                                disabled: !props.permissions?.delete,
                                onClick: () => emit('delete-row', row),
                              },
                              renderIcon('delete')
                            ),
                          ]),
                        ]),
                      ]
                    : []),
                ]
              )
            )
          ),
        ]),
      ])
  },
})

onMounted(() => {
  rawQuery.value = defaultRawQuery()
  loadSchema({ keepSelection: false })
})
</script>

<style scoped>
.db-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--db-page-bg);
  color: var(--db-text-strong, var(--text-primary));
  overflow: hidden;
  font-size: 14px;
}

.db-autofill-trap {
  position: absolute;
  opacity: 0;
  pointer-events: none;
  width: 0;
  height: 0;
  overflow: hidden;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--db-panel-border);
  flex-shrink: 0;
  background: rgba(7, 13, 28, 0.32);
  backdrop-filter: blur(16px);
}

.topbar-left,
.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.back-btn,
.mode-toggle,
.settings-btn,
.btn-open-data,
.refresh-btn,
.collection-item,
.meta-btn,
.btn-run,
.page-btn,
.chip,
.nl-send,
.collapse-btn,
.nl-clear-btn,
.result-menu-btn {
  cursor: pointer;
}

.back-btn,
.mode-toggle,
.settings-btn,
.meta-btn,
.page-btn,
.nl-clear-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--db-border-soft);
  border-radius: 999px;
  color: var(--db-text-soft);
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
}

.back-btn:hover,
.mode-toggle:hover,
.settings-btn:hover,
.meta-btn:hover,
.page-btn:hover:not(:disabled),
.nl-clear-btn:hover:not(:disabled) {
  border-color: rgba(120, 100, 255, 0.35);
  color: var(--db-text-strong);
}

.topbar-divider {
  width: 1px;
  height: 16px;
  background: var(--db-divider);
}

.db-identity {
  display: flex;
  align-items: center;
  gap: 8px;
}

.db-vendor-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  border: 1px solid;
}

.db-alias {
  font-size: 15px;
  font-weight: 700;
  color: var(--db-text-strong);
}

.db-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.db-status-dot.ok {
  background: #10d4a0;
  box-shadow: 0 0 8px rgba(16, 212, 160, 0.55);
}

.db-status-dot.err {
  background: #ff5b6b;
  box-shadow: 0 0 8px rgba(255, 91, 107, 0.5);
}

.mode-toggle.active {
  background: var(--db-chip-bg);
  border-color: rgba(124, 111, 255, 0.5);
  color: #a78bfa;
}

.settings-btn {
  color: var(--db-text-soft);
}

.btn-open-data,
.nl-send,
.btn-run {
  border: none;
  border-radius: 999px;
  color: white;
  font-size: 12px;
  font-weight: 700;
  transition: all 0.15s;
}

.btn-open-data {
  padding: 8px 14px;
  background: linear-gradient(135deg, rgba(82, 212, 255, 0.94), rgba(139, 125, 255, 0.84));
  box-shadow: var(--shadow-accent);
}

.btn-open-data:hover,
.nl-send:hover:not(:disabled),
.btn-run:hover:not(:disabled) {
  transform: translateY(-1px);
}

.body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.schema-panel {
  width: 270px;
  flex-shrink: 0;
  border-right: 1px solid var(--db-panel-border);
  display: flex;
  flex-direction: column;
  background: var(--db-panel-bg);
  overflow: hidden;
  backdrop-filter: blur(18px);
  transition: width 0.22s ease;
}

.schema-panel.collapsed {
  width: 72px;
}

.schema-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 8px;
}

.schema-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.panel-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--db-panel-label);
}

.refresh-btn,
.collapse-btn,
.result-menu-btn {
  background: none;
  border: none;
  color: var(--db-panel-label);
  padding: 4px;
  border-radius: 8px;
}

.refresh-btn:hover,
.collapse-btn:hover,
.result-menu-btn:hover {
  background: rgba(124, 111, 255, 0.08);
  color: var(--db-text-strong);
}

.collapse-btn--icon-only {
  margin: 0 auto;
  padding: 8px;
}

.refresh-btn.spinning svg {
  animation: spin 0.7s linear infinite;
}

.schema-search-wrap {
  position: relative;
  padding: 0 12px 10px;
}

.schema-search-icon {
  position: absolute;
  left: 19px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--db-input-placeholder);
  pointer-events: none;
}

.schema-search {
  width: 100%;
  box-sizing: border-box;
  background: var(--db-input-bg);
  border: 1px solid var(--db-input-border);
  border-radius: 9px;
  padding: 9px 10px 9px 30px;
  font-size: 12px;
  line-height: 1.2;
  color: var(--db-text-strong);
  outline: none;
  transition: border-color 0.15s;
}

.schema-search::placeholder,
.nl-input::placeholder,
.raw-editor::placeholder {
  color: var(--db-input-placeholder);
}

.schema-search:focus,
.raw-select:focus,
.raw-editor:focus,
.nl-input-inner:focus-within {
  border-color: rgba(124, 111, 255, 0.4);
  box-shadow: 0 0 0 3px rgba(124, 111, 255, 0.08);
}

.schema-loading {
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton {
  height: 11px;
  border-radius: 999px;
  background: var(--db-border-soft);
  animation: shimmer 1.3s infinite;
}

.collection-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 12px;
  scrollbar-width: thin;
}

.collection-list--collapsed {
  padding-left: 10px;
  padding-right: 10px;
}

.schema-empty {
  padding: 18px 16px;
  text-align: center;
  color: var(--db-text-muted);
  font-size: 13px;
}

.schema-empty--error {
  color: #fca5a5;
}

.collection-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: none;
  background: transparent;
  border-radius: 9px;
  color: var(--db-text-soft);
  text-align: left;
  transition: background 0.12s;
}

.collection-item.compact {
  justify-content: center;
  padding: 10px 0;
}

.collection-item:hover {
  background: var(--db-table-row-hover);
  color: var(--db-text-strong);
}

.collection-item.active {
  background: var(--db-chip-bg);
  color: var(--db-text-strong);
}

.collection-item.active .col-icon {
  color: #a78bfa;
}

.col-icon {
  flex-shrink: 0;
  color: var(--db-panel-label);
}

.col-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.col-count {
  font-size: 11px;
  color: var(--db-text-muted);
  background: var(--db-input-bg);
  padding: 2px 6px;
  border-radius: 999px;
}

.schema-footer {
  border-top: 1px solid var(--db-border-soft);
  padding: 12px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  font-size: 12px;
  color: var(--db-text-muted);
}

.stat-val {
  font-size: 12px;
  font-weight: 700;
  color: var(--db-text-strong);
}

.ok-text {
  color: #10d4a0;
}

.query-panel,
.nl-section,
.raw-section,
.result-section {
  display: flex;
  flex-direction: column;
}

.query-panel {
  flex: 1;
  overflow: hidden;
}

.nl-section,
.raw-section {
  height: 100%;
  overflow: hidden;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 14px 24px 0;
}

.chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--db-chip-border);
  background: var(--db-chip-bg);
  color: var(--db-chip-text);
  font-size: 12px;
}

.chip:hover {
  border-color: rgba(120, 100, 255, 0.6);
  background: rgba(120, 100, 255, 0.14);
}

.nl-input-wrap,
.raw-toolbar,
.raw-editor-wrap {
  padding: 12px 24px 0;
  flex-shrink: 0;
}

.nl-input-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--db-input-bg);
  border: 1px solid var(--db-input-border);
  border-radius: 12px;
  padding: 8px 10px;
  min-height: 46px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.nl-icon {
  color: var(--db-text-faint);
  flex-shrink: 0;
}

.nl-input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  color: var(--db-text-strong);
  font-size: 14px;
}

.nl-clear-btn {
  padding: 6px 10px;
  font-size: 11px;
}

.nl-send {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6c5fff, #8b78ff);
  box-shadow: 0 4px 12px rgba(108, 95, 255, 0.3);
}

.nl-send:disabled,
.btn-run:disabled,
.page-btn:disabled,
.result-menu-item:disabled,
.result-menu-btn:disabled,
.nl-clear-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.nl-hint,
.raw-label {
  font-size: 11px;
  color: var(--db-text-faint);
  padding-top: 6px;
}

.nl-hint strong {
  color: var(--accent);
}

.result-loading,
.result-error {
  margin: 12px 24px 0;
}

.result-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--db-text-muted);
  font-size: 13px;
}

.thinking-dots {
  display: flex;
  gap: 4px;
}

.thinking-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #7c6fff;
  animation: tdot 1.2s infinite;
}

.thinking-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.thinking-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

.result-error {
  padding: 11px 14px;
  background: rgba(255, 91, 107, 0.07);
  border: 1px solid rgba(255, 91, 107, 0.2);
  border-radius: 10px;
  color: #ff8a95;
  font-size: 12px;
}

.result-section {
  flex: 1;
  overflow: hidden;
  padding-top: 10px;
}

.result-section.no-top-pad {
  padding-top: 0;
}

.result-meta-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 24px 8px;
  flex-shrink: 0;
}

.result-meta-bar--menu-only {
  justify-content: flex-end;
}

.result-meta-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(16, 212, 160, 0.86);
}

.ms-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(16, 212, 160, 0.1);
  color: rgba(16, 212, 160, 0.75);
}

.result-meta-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.result-meta-actions--menu {
  position: relative;
}

.result-menu-wrap {
  position: relative;
}

.result-menu-btn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--db-border-soft);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
}

.result-menu-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 150px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: rgba(10, 16, 31, 0.96);
  border: 1px solid rgba(124, 111, 255, 0.18);
  border-radius: 12px;
  box-shadow: 0 18px 40px rgba(1, 5, 16, 0.36);
  z-index: 8;
}

.result-menu-item {
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  color: var(--db-text-soft);
  padding: 8px 10px;
  font-size: 12px;
  border-radius: 8px;
}

.result-menu-item:hover:not(:disabled) {
  background: rgba(124, 111, 255, 0.1);
  color: var(--db-text-strong);
}

.generated-query,
.ai-summary {
  margin: 0 24px 10px;
  border-radius: 10px;
  flex-shrink: 0;
}

.generated-query {
  background: var(--db-code-bg);
  border: 1px solid var(--db-border-soft);
  padding: 12px 14px;
}

.generated-query pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  color: rgba(167, 139, 250, 0.84);
  font-family: 'Courier New', monospace;
  max-height: 220px;
  overflow: auto;
}

.ai-summary {
  padding: 9px 11px;
  background: var(--db-summary-bg);
  border: 1px solid var(--db-summary-border);
  color: var(--db-summary-text);
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
}

.ai-summary--compact {
  max-width: fit-content;
}

.ai-summary-text {
  min-width: 0;
  white-space: pre-line;
  line-height: 1.5;
}

.ai-badge {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 5px;
  background: rgba(124, 111, 255, 0.18);
  color: #a78bfa;
}

.no-rows {
  padding: 28px;
  text-align: center;
  color: var(--db-text-muted);
  font-size: 13px;
}

.raw-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.raw-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.raw-select,
.raw-editor {
  background: var(--db-input-bg);
  border: 1px solid var(--db-input-border);
  color: var(--db-text-strong);
  outline: none;
}

.raw-select {
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
}

.btn-run {
  padding: 8px 16px;
  background: rgba(124, 111, 255, 0.18);
  border: 1px solid rgba(124, 111, 255, 0.45);
}

.raw-editor {
  width: 100%;
  min-height: 132px;
  box-sizing: border-box;
  border-radius: 12px;
  padding: 13px 14px;
  resize: vertical;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--db-text-strong);
}

:deep(.table-wrap) {
  flex: 1;
  overflow: auto;
  padding: 0 0 12px 24px;
  scrollbar-width: thin;
}

:deep(.result-table) {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  table-layout: auto;
  min-width: max-content;
}

:deep(.result-table th) {
  position: sticky;
  top: 0;
  background: var(--db-table-head-bg);
  padding: 9px 12px;
  text-align: left;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.5px;
  color: var(--db-table-head-text);
  text-transform: uppercase;
  border-bottom: 1px solid var(--db-border-soft);
}

:deep(.result-table td) {
  padding: 8px 12px;
  border-bottom: 1px solid var(--db-table-border);
  color: var(--db-table-cell-text);
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  font-weight: 550;
}

:deep(.result-table tr:hover td) {
  background: var(--db-table-row-hover);
  color: var(--db-text-strong);
}

:deep(.cell-button) {
  width: 100%;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 0;
  cursor: pointer;
}

:deep(.cell-button:hover) {
  color: var(--db-text-strong);
}

:deep(.cell-num) {
  color: #a78bfa !important;
  text-align: right;
}

:deep(.cell-bool),
:deep(.cell-paid) {
  color: #10d4a0 !important;
}

:deep(.cell-warn) {
  color: #f59e0b !important;
}

:deep(.pagination) {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px 0 0;
}

:deep(.page-info) {
  font-size: 12px;
  color: var(--db-text-muted);
}

:deep(.row-actions-cell) {
  white-space: nowrap;
  position: sticky;
  right: 0;
  background: var(--db-action-rail);
  background-clip: padding-box;
  min-width: 128px;
  padding-left: 8px;
  padding-right: 8px;
  z-index: 4;
  box-shadow: var(--db-action-shadow);
  isolation: isolate;
}

:deep(.row-actions-cell::before) {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--db-action-rail);
  z-index: 0;
}

:deep(.row-actions-cell > *) {
  position: relative;
  z-index: 1;
}

:deep(.result-table th:last-child) {
  position: sticky;
  right: 0;
  z-index: 5;
  background: var(--db-action-rail);
  box-shadow: var(--db-action-shadow);
  min-width: 128px;
  padding-left: 8px;
  padding-right: 8px;
}

:deep(.result-table tr:hover .row-actions-cell) {
  background: var(--db-action-rail);
}

:deep(.row-actions) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

:deep(.row-action-btn) {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid var(--db-border-soft);
  background: var(--db-input-bg);
  color: var(--db-text-soft);
  font-size: 12px;
  cursor: pointer;
}

:deep(.row-action-btn:hover:not(:disabled)) {
  background: var(--db-table-row-hover);
  color: var(--db-text-strong);
}

:deep(.row-action-btn--success) {
  color: #67e8a3;
  border-color: rgba(16, 212, 160, 0.3);
  background: rgba(16, 212, 160, 0.1);
}

:deep(.row-action-btn--danger) {
  color: #ff9aa4;
}

:deep(.row-action-btn:disabled) {
  opacity: 0.35;
  cursor: not-allowed;
}

.floating-pagination-shell {
  display: flex;
  justify-content: center;
  padding: 4px 24px 12px;
  flex-shrink: 0;
}

.floating-pagination {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 16px;
  border: 1px solid rgba(120, 100, 255, 0.14);
  background: linear-gradient(180deg, rgba(12, 18, 35, 0.82), rgba(9, 14, 28, 0.72));
  box-shadow: 0 10px 24px rgba(1, 5, 16, 0.22);
  backdrop-filter: blur(16px);
}

.floating-pagination.compact {
  max-width: calc(100% - 12px);
}

.floating-pagination__nav-btn,
.floating-pagination__page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background: rgba(255, 255, 255, 0.03);
  color: var(--db-text-strong);
  transition: all 0.18s ease;
  backdrop-filter: blur(10px);
}

.floating-pagination__nav-btn {
  min-width: 76px;
  height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
}

.floating-pagination__page-btn {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
}

.floating-pagination__pages {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.floating-pagination__summary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 96px;
  height: 34px;
  padding: 0 8px;
  border-left: 1px solid rgba(120, 100, 255, 0.12);
  color: rgba(255, 255, 255, 0.48);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.floating-pagination__nav-btn:hover:not(:disabled),
.floating-pagination__page-btn:hover:not(:disabled) {
  border-color: rgba(139, 125, 255, 0.42);
  background: rgba(139, 125, 255, 0.12);
  color: #ffffff;
  transform: translateY(-1px);
}

.floating-pagination__page-btn.active {
  border-color: rgba(139, 125, 255, 0.5);
  background: linear-gradient(180deg, rgba(139, 125, 255, 0.18), rgba(108, 95, 255, 0.08));
  color: #ffffff;
}

.floating-pagination__nav-btn:disabled,
.floating-pagination__page-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
  transform: none;
}

.floating-pagination__ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  color: rgba(255, 255, 255, 0.26);
  font-size: 18px;
  line-height: 1;
  user-select: none;
}

.db-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 4, 12, 0.5);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 30;
}

.db-modal {
  width: min(720px, 100%);
  max-height: min(80vh, 900px);
  overflow: auto;
  background: var(--db-modal-bg);
  border: 1px solid var(--db-chip-border);
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  padding: 18px;
}

.db-modal--wide {
  width: min(860px, 100%);
}

.db-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.db-modal-title {
  font-size: 18px;
  font-weight: 700;
}

.db-modal-subtitle,
.db-modal-hint {
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
}

.db-modal-hint {
  margin-bottom: 12px;
}

.db-modal-pre {
  margin: 0;
  padding: 14px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: rgba(230, 226, 255, 0.9);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.db-json-editor {
  width: 100%;
  min-height: 300px;
  box-sizing: border-box;
  resize: vertical;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.28);
  color: #d6d0ff;
  padding: 14px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  outline: none;
}

.db-json-editor:focus {
  border-color: rgba(124, 111, 255, 0.4);
  box-shadow: 0 0 0 3px rgba(124, 111, 255, 0.08);
}

.db-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.db-inline-error {
  margin: 12px 0 0;
}

.btn-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: white;
  border-radius: 50%;
  display: inline-block;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes shimmer {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}

@keyframes tdot {
  0%,
  60%,
  100% {
    opacity: 0.2;
    transform: scale(0.8);
  }
  30% {
    opacity: 1;
    transform: scale(1);
  }
}

@media (max-width: 1100px) {
  .topbar,
  .topbar-right {
    flex-wrap: wrap;
  }

  .schema-panel {
    width: 230px;
  }

  .schema-panel.collapsed {
    width: 66px;
  }
}

@media (max-width: 900px) {
  .body {
    flex-direction: column;
  }

  .schema-panel,
  .schema-panel.collapsed {
    width: 100%;
    max-height: 280px;
    border-right: none;
    border-bottom: 1px solid rgba(120, 100, 255, 0.1);
  }

  .result-meta-bar,
  .raw-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .floating-pagination {
    width: 100%;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }

  .floating-pagination__summary {
    border-left: none;
    min-width: auto;
    width: 100%;
    height: auto;
    padding-top: 2px;
  }

  .floating-pagination__pages {
    order: 3;
    width: 100%;
    justify-content: center;
    overflow-x: auto;
    padding-bottom: 2px;
  }
}
</style>
