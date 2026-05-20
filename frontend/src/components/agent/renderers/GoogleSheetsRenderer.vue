<template>
  <div v-if="sheetsSteps.length" class="gsheets-root">

    <div v-for="(step, idx) in sheetsSteps" :key="idx" class="gsheets-section">

      <!-- ── Header ───────────────────────────────────────────────────── -->
      <div class="gsheets-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="gsheets-header-icon">
          <rect x="3" y="3" width="18" height="18" rx="3" stroke="#0F9D58" stroke-width="2"/>
          <line x1="3" y1="9" x2="21" y2="9" stroke="#0F9D58" stroke-width="1.5"/>
          <line x1="3" y1="15" x2="21" y2="15" stroke="#0F9D58" stroke-width="1.5"/>
          <line x1="9" y1="3" x2="9" y2="21" stroke="#0F9D58" stroke-width="1.5"/>
        </svg>
        <span class="gsheets-header-title">{{ headerTitle(step) }}</span>
        <span v-if="sheetsList(step)?.length" class="gsheets-count-badge">
          {{ sheetsList(step).length }}
        </span>
      </div>

      <!-- ── Spreadsheet list (list / search) ─────────────────────────── -->
      <div v-if="sheetsList(step)?.length" class="gsheets-cards">
        <div
          v-for="sheet in sheetsList(step)"
          :key="sheet.id"
          class="gsheets-card"
          @click="openInOrion(sheet.id)"
        >
          <div class="gsheets-card-icon">📊</div>
          <div class="gsheets-card-body">
            <div class="gsheets-card-title">{{ sheet.title }}</div>
            <div class="gsheets-card-meta">
              <span v-if="sheet.ownerName">{{ sheet.ownerName }}</span>
              <span v-if="sheet.modifiedTime" class="gsheets-card-date">
                {{ formatDate(sheet.modifiedTime) }}
              </span>
            </div>
          </div>
          <button class="gsheets-view-btn" @click.stop="openInOrion(sheet.id)">
            View
          </button>
        </div>
      </div>

      <!-- ── Single sheet view (get / create / rename / duplicate) ─────── -->
      <div v-else-if="step.richGoogleSheet" class="gsheets-single">
        <div class="gsheets-single-title">{{ step.richGoogleSheet.title }}</div>
        <div v-if="step.richGoogleSheet.sheetNames?.length" class="gsheets-tabs">
          <span
            v-for="name in step.richGoogleSheet.sheetNames"
            :key="name"
            class="gsheets-tab"
          >{{ name }}</span>
        </div>
        <button
          class="gsheets-open-btn"
          @click="openInOrion(step.richGoogleSheet.id)"
        >
          Open in Google Sheets
        </button>
      </div>

      <!-- ── Share result ─────────────────────────────────────────────── -->
      <div v-else-if="step.richGoogleSheetShare" class="gsheets-share-result">
        <div class="gsheets-share-title">{{ step.richGoogleSheetShare.title }}</div>
        <div class="gsheets-share-list">
          <span
            v-for="s in step.richGoogleSheetShare.sharedWith"
            :key="s.email"
            class="gsheets-share-chip"
          >
            {{ s.email }} ({{ s.role }})
          </span>
        </div>
      </div>

      <!-- ── Fallback summary ─────────────────────────────────────────── -->
      <div v-else-if="step.summary" class="gsheets-fallback">
        {{ step.summary }}
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  steps: Array,
  msg: Object,
})

const sheetsSteps = computed(() =>
  props.steps.filter(s => s.tool?.startsWith('google_sheets_'))
)

function sheetsList(step) {
  return step.richGoogleSheets || step.result?.richGoogleSheets || null
}

function headerTitle(step) {
  const map = {
    google_sheets_list: 'Recent Spreadsheets',
    google_sheets_search: 'Search Results',
    google_sheets_get: 'Spreadsheet',
    google_sheets_create: 'New Spreadsheet',
    google_sheets_rename: 'Renamed Spreadsheet',
    google_sheets_share: 'Shared Spreadsheet',
    google_sheets_delete: 'Deleted Spreadsheet',
    google_sheets_duplicate: 'Duplicated Spreadsheet',
  }
  return map[step.tool] || 'Google Sheets'
}

function openInOrion(spreadsheetId) {
  if (!spreadsheetId) return
  document.dispatchEvent(new CustomEvent('orion:open-module', {
    bubbles: true,
    detail: { module: 'google_sheets', context: { spreadsheetId } },
  }))
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<style scoped>
.gsheets-root {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gsheets-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.gsheets-header-icon {
  flex-shrink: 0;
}

.gsheets-header-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary, #e2e2f0);
}

.gsheets-count-badge {
  background: #0f9d58;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 10px;
}

/* ── Card list ───────────────────────────────────────────────────────── */
.gsheets-cards {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gsheets-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: background 0.15s;
}

.gsheets-card:hover {
  background: rgba(255, 255, 255, 0.1);
}

.gsheets-card-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.gsheets-card-body {
  flex: 1;
  min-width: 0;
}

.gsheets-card-title {
  font-weight: 500;
  font-size: 13px;
  color: var(--text-primary, #e2e2f0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gsheets-card-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted, #8e8ea0);
  margin-top: 2px;
}

.gsheets-view-btn {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 6px;
  border: none;
  background: rgba(15, 157, 88, 0.15);
  color: #6fcf97;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}

.gsheets-view-btn:hover {
  background: rgba(15, 157, 88, 0.3);
}

/* ── Single sheet ────────────────────────────────────────────────────── */
.gsheets-single {
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
}

.gsheets-single-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary, #e2e2f0);
  margin-bottom: 8px;
}

.gsheets-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.gsheets-tab {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted, #8e8ea0);
}

.gsheets-open-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 8px;
  border: none;
  background: rgba(15, 157, 88, 0.15);
  color: #6fcf97;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.gsheets-open-btn:hover {
  background: rgba(15, 157, 88, 0.3);
}

/* ── Share result ────────────────────────────────────────────────────── */
.gsheets-share-result {
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
}

.gsheets-share-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary, #e2e2f0);
  margin-bottom: 8px;
}

.gsheets-share-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.gsheets-share-chip {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(15, 157, 88, 0.12);
  color: #6fcf97;
}

/* ── Fallback ────────────────────────────────────────────────────────── */
.gsheets-fallback {
  font-size: 13px;
  color: var(--text-primary, #e2e2f0);
  padding: 8px 0;
}
</style>
