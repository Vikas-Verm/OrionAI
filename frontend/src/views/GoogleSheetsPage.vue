<template>
  <div class="gs-page">
    <div class="gs-shell">
      <!-- <WorkspaceAppTabs
        :tabs="workspaceTabs"
        @select="handleWorkspaceTabSelect"
        @add="emit('open-integrations')"
      /> -->

      <div v-if="pageError" class="gs-state">
        <div class="gs-state-card">
          <div class="gs-state-title">Google Sheets isn’t ready yet</div>
          <div class="gs-state-copy">{{ pageError }}</div>
          <button class="gs-state-btn" type="button" @click="emit('open-integrations')">
            Open Integrations
          </button>
        </div>
      </div>

      <div v-else-if="loading && !currentWorkbook" class="gs-state">
        <div class="gs-editor-loading"><span class="gs-spinner"></span>Loading Google Sheets…</div>
      </div>

      <div v-else-if="!currentWorkbook && !loading && !workbookLoading" class="gs-state">
        <div class="gs-state-card">
          <div class="gs-state-title">No Google Sheets found</div>
          <div class="gs-state-copy">
            Connect Google Sheets and OrionAI will open your recent spreadsheets here in a native spreadsheet workspace.
          </div>
          <button class="gs-state-btn" type="button" @click="emit('open-integrations')">
            Connect Google Sheets
          </button>
        </div>
      </div>

      <template v-else>
        <section class="gs-top-shell" :class="{ 'gs-top-shell--collapsed': topShellCollapsed }">
          <div class="gs-top-shell-main">
            <div class="gs-docbar">
              <div class="gs-docbar-left">
                <div class="gs-doc-badge" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M7 4.5h7l4 4v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5v-13A2 2 0 0 1 8 4.5Z"/>
                    <path d="M14 4.5v4h4"/>
                    <path d="M8.5 13.5h7"/>
                    <path d="M8.5 16.5h7"/>
                  </svg>
                </div>
                <div class="gs-doc-meta">
                  <div class="gs-doc-breadcrumb">
                    <span>Google Sheets</span>
                    <span class="gs-doc-sep">›</span>
                    <input
                      ref="titleInputRef"
                      v-model="titleDraft"
                      class="gs-doc-title-input"
                      type="text"
                      :disabled="!currentPermissions.canRename"
                      spellcheck="false"
                      @keydown.enter.prevent="submitRenameFile"
                      @blur="submitRenameFile"
                    />
                    <span class="gs-doc-star">☆</span>
                  </div>
                </div>
              </div>

              <div class="gs-docbar-center">
                <span class="gs-save-dot" :class="{ error: saveError }"></span>
                <span class="gs-save-text">{{ saveError || driveSaveLabel }}</span>
              </div>

              <div class="gs-docbar-right">
                <button class="gs-icon-btn" type="button" title="Open in Google Sheets" @click="openSpreadsheetInGoogle">⧉</button>
                <button class="gs-icon-btn" type="button" title="Refresh" @click="refreshWorkbook">↻</button>
                <button
                  v-if="currentPermissions.canShare"
                  class="gs-share-btn"
                  type="button"
                  @click="shareDialogOpen = true"
                >
                  Share
                </button>
                <button class="gs-plus-btn" type="button" title="Browse recent sheets" @click="openRecentSheetsBrowser">+</button>
                <div class="gs-menu-wrap">
                  <button class="gs-icon-btn" type="button" @click.stop="moreMenuOpen = !moreMenuOpen">⋯</button>
                  <div v-if="moreMenuOpen" class="gs-popover gs-popover--right">
                    <button type="button" @click="handleMenuAction('duplicate_file')">Duplicate spreadsheet</button>
                    <button type="button" @click="handleMenuAction('download_xlsx')">Download XLSX</button>
                    <button type="button" @click="handleMenuAction('download_csv')">Download CSV</button>
                    <button type="button" @click="handleMenuAction('print_file')">Print</button>
                    <button
                      v-if="currentPermissions.canDelete"
                      type="button"
                      class="danger"
                      @click="deleteFileDialogOpen = true"
                    >
                      Delete spreadsheet
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="gs-menubar">
              <div v-for="menu in visibleMenus" :key="menu" class="gs-menu-wrap">
                <button class="gs-menu-btn" type="button" @click.stop="toggleMenu(menu)">{{ menu }}</button>
                <div v-if="activeMenu === menu" class="gs-popover">
                  <button
                    v-for="item in menuItems[menu]"
                    :key="item.action"
                    type="button"
                    :disabled="item.disabled"
                    @click="handleMenuAction(item.action)"
                  >
                    {{ item.label }}
                  </button>
                </div>
              </div>
            </div>

          
          </div>

          <SheetsToolbar
            :disabled="!currentPermissions.canEdit"
            :zoom="zoom"
            :format="currentCellFormat"
            :header-collapsed="topShellCollapsed"
            @action="handleToolbarAction"
          />
          <div v-if="showFormulaBar" class="gs-formula-bar">
              <input
                v-model="nameBoxDraft"
                class="gs-name-box"
                type="text"
                @keydown.enter.prevent="applyNameBoxSelection"
              />
              <div class="gs-formula-pill">fx</div>
              <input
                v-model="formulaDraft"
                class="gs-formula-input"
                type="text"
                :disabled="!currentPermissions.canEdit"
                @focus="handleFormulaBarFocus"
                @blur="handleFormulaBarBlur"
                @keydown.enter.prevent="commitFormulaBar({ focusAfter: true })"
              />
            </div>
        </section>

        <div class="gs-workspace" :class="{ 'gs-workspace--wide': !aiPanelOpen }">
          <section class="gs-center" :class="{ 'gs-center--wide': !aiPanelOpen }">
            <div class="gs-sheet-card">
              <div
                ref="gridFocusRef"
                class="gs-grid-wrap"
                tabindex="0"
                @mousedown.capture="focusGrid"
                @keydown="handleGridKeydown"
                @copy.prevent="handleCopy"
                @cut.prevent="handleCut"
                @paste.prevent="handlePaste"
              >
                <SheetsGrid
                  :sheet="displaySheet"
                  :selection="selection"
                  :editing-cell="editingCell"
                  :editing-value="editingValue"
                  :zoom="zoom"
                  :show-gridlines="showGridlines"
                  :preview-cell="formulaBarPreviewCell"
                  @select="setSelection"
                  @begin-edit="beginCellEdit"
                  @commit-edit="commitCellEdit"
                  @cancel-edit="cancelCellEdit"
                  @update-edit="editingValue = $event"
                  @resize-dimension="handleResize"
                />
              </div>

              <div v-if="chartsExpanded && resolvedCharts.length" class="gs-chart-grid">
                <SheetsChartCard
                  v-for="item in resolvedCharts"
                  :key="item.chart.chartId"
                  :chart="item.chart"
                  :data="item.data"
                  :selected="selectedChartId === item.chart.chartId"
                  @edit="openChartEditor"
                  @delete="deleteChart"
                />
              </div>

              <div class="gs-tabsbar">
                <div class="gs-tabsbar-left">
                  <button class="gs-tab-plain" type="button" @click="addSheet">＋</button>
                  <button
                    v-for="sheet in currentWorkbook?.sheets || []"
                    :key="sheet.sheetId"
                    class="gs-sheet-tab"
                    :class="{ active: sheet.sheetId === currentWorkbook?.activeSheetId }"
                    type="button"
                    @click="switchSheet(sheet.sheetId)"
                  >
                    <span>{{ sheet.title }}</span>
                    <span
                      v-if="sheet.sheetId === currentWorkbook?.activeSheetId"
                      class="gs-sheet-tab-caret"
                      @click.stop="sheetMenuSheetId = sheet.sheetId === sheetMenuSheetId ? null : sheet.sheetId"
                    >
                      ▾
                    </span>
                    <div
                      v-if="sheetMenuSheetId === sheet.sheetId"
                      class="gs-popover gs-popover--tab"
                    >
                      <button type="button" @click="renameSheet(sheet)">Rename sheet</button>
                      <button type="button" @click="duplicateSheet(sheet)">Duplicate sheet</button>
                      <button
                        type="button"
                        :disabled="(currentWorkbook?.sheets?.length || 0) <= 1"
                        class="danger"
                        @click="deleteSheet(sheet)"
                      >
                        Delete sheet
                      </button>
                    </div>
                  </button>
                </div>

                <div class="gs-tabsbar-right">
                  <span>Count: {{ selectionMetrics.count }}</span>
                  <span>Sum: {{ selectionMetrics.sum }}</span>
                  <span class="gs-status-ok"></span>
                </div>
              </div>
            </div>

            <div v-if="!aiPanelOpen" class="gs-side-rail">
              <button class="gs-side-rail-btn" type="button" title="Open AI Assistant" @click="aiPanelOpen = true">AI</button>
              <button class="gs-side-rail-btn" type="button" title="Analyze sheet" @click="handleAssistantQuickAction('analyze_data')">◎</button>
              <button class="gs-side-rail-btn" type="button" title="Generate chart" @click="handleAssistantQuickAction('generate_chart')">◫</button>
              <button class="gs-side-rail-btn" type="button" title="Format sheet" @click="handleAssistantQuickAction('format_sheet')">✦</button>
              <button class="gs-side-rail-btn" type="button" title="Monthly summary" @click="handleAssistantQuickAction('monthly_summary')">⌘</button>
            </div>
          </section>

          <SheetsAssistantPanel
            v-if="aiPanelOpen"
            :active-tab="activeAiTab"
            :loading="aiLoading"
            :messages="aiMessages"
            :suggestions="assistantSuggestions"
            :user-name="userName"
            @set-tab="activeAiTab = $event"
            @quick-action="handleAssistantQuickAction"
            @send="handleAiSend"
            @close="aiPanelOpen = false"
          />
        </div>

        <div v-if="recentSheetsDialogOpen" class="gs-modal-backdrop" @click.self="recentSheetsDialogOpen = false">
          <div class="gs-modal gs-modal--recent">
            <div class="gs-dialog-head">
              <div>
                <div class="gs-modal-title">Recent spreadsheets</div>
                <div class="gs-modal-copy">Open older Google Sheets inside OrionAI without leaving the current workspace.</div>
              </div>
              <button class="gs-dialog-close" type="button" @click="recentSheetsDialogOpen = false">×</button>
            </div>

            <label class="gs-field">
              <span>Search</span>
              <input v-model.trim="recentSheetsQuery" class="gs-modal-input" type="search" placeholder="Search spreadsheets, owners, or email..." />
            </label>

            <div class="gs-recent-list">
              <button
                v-for="item in filteredSpreadsheets"
                :key="item.spreadsheetId"
                class="gs-recent-item"
                :class="{ active: item.spreadsheetId === currentWorkbook?.spreadsheetId }"
                type="button"
                @click="openRecentSpreadsheet(item.spreadsheetId)"
              >
                <div class="gs-recent-item-main">
                  <div class="gs-recent-item-title">{{ item.title || "Untitled spreadsheet" }}</div>
                  <div class="gs-recent-item-meta">
                    <span>{{ formatSpreadsheetTimestamp(item.modifiedTime) }}</span>
                    <span v-if="item.ownerName">• {{ item.ownerName }}</span>
                    <span v-else-if="item.ownerEmail">• {{ item.ownerEmail }}</span>
                  </div>
                </div>
                <span class="gs-recent-item-open">Open</span>
              </button>

              <div v-if="loading && !filteredSpreadsheets.length" class="gs-recent-empty">
                Loading spreadsheets…
              </div>
              <div v-else-if="!filteredSpreadsheets.length" class="gs-recent-empty">
                No spreadsheets match your search.
              </div>
            </div>

            <div class="gs-modal-actions">
              <button class="gs-modal-btn ghost" type="button" @click="recentSheetsDialogOpen = false">Close</button>
              <button class="gs-modal-btn" type="button" @click="handleMenuAction('new_file')">New spreadsheet</button>
            </div>
          </div>
        </div>

        <div v-if="shareDialogOpen" class="gs-modal-backdrop" @click.self="shareDialogOpen = false">
          <div class="gs-modal">
            <div class="gs-modal-title">Share spreadsheet</div>
            <input v-model="shareEmail" class="gs-modal-input" type="text" placeholder="name@example.com" />
            <div class="gs-modal-actions">
              <button class="gs-modal-btn ghost" type="button" @click="shareDialogOpen = false">Cancel</button>
              <button class="gs-modal-btn" type="button" @click="submitShare">Share</button>
            </div>
            <div v-if="shareNotice" class="gs-modal-note">{{ shareNotice }}</div>
          </div>
        </div>

        <div v-if="chartDialogOpen" class="gs-modal-backdrop" @click.self="closeChartDialog">
          <div class="gs-modal">
            <div class="gs-modal-title">{{ chartDraft.chartId ? "Edit chart" : "Insert chart" }}</div>
            <label class="gs-field">
              <span>Chart title</span>
              <input v-model="chartDraft.title" class="gs-modal-input" type="text" />
            </label>
            <label class="gs-field">
              <span>Chart type</span>
              <select v-model="chartDraft.type" class="gs-modal-input">
                <option value="column">Column</option>
                <option value="bar">Bar</option>
                <option value="line">Line</option>
                <option value="pie">Pie</option>
                <option value="area">Area</option>
              </select>
            </label>
            <div class="gs-modal-actions">
              <button class="gs-modal-btn ghost" type="button" @click="closeChartDialog">Cancel</button>
              <button class="gs-modal-btn" type="button" @click="submitChartDialog">Save</button>
            </div>
          </div>
        </div>

        <div v-if="findDialogOpen" class="gs-modal-backdrop" @click.self="findDialogOpen = false">
          <div class="gs-modal">
            <div class="gs-modal-title">Find and replace</div>
            <label class="gs-field">
              <span>Find</span>
              <input v-model="findDraft.query" class="gs-modal-input" type="text" />
            </label>
            <label class="gs-field">
              <span>Replace with</span>
              <input v-model="findDraft.replace" class="gs-modal-input" type="text" />
            </label>
            <div class="gs-modal-actions">
              <button class="gs-modal-btn ghost" type="button" @click="findNext">Find next</button>
              <button class="gs-modal-btn ghost" type="button" @click="replaceCurrent">Replace</button>
              <button class="gs-modal-btn" type="button" @click="replaceAll">Replace all</button>
            </div>
          </div>
        </div>

        <div v-if="filterDialogOpen" class="gs-modal-backdrop" @click.self="filterDialogOpen = false">
          <div class="gs-modal">
            <div class="gs-modal-title">Filter current sheet</div>
            <label class="gs-field">
              <span>Column</span>
              <select v-model.number="filterDraft.columnIndex" class="gs-modal-input">
                <option
                  v-for="columnIndex in columnOptions"
                  :key="columnIndex"
                  :value="columnIndex"
                >
                  {{ columnIndexToLetter(columnIndex) }}
                </option>
              </select>
            </label>
            <label class="gs-field">
              <span>Operator</span>
              <select v-model="filterDraft.operator" class="gs-modal-input">
                <option value="contains">Contains</option>
                <option value="equals">Equals</option>
              </select>
            </label>
            <label class="gs-field">
              <span>Value</span>
              <input v-model="filterDraft.value" class="gs-modal-input" type="text" />
            </label>
            <div class="gs-modal-actions">
              <button class="gs-modal-btn ghost" type="button" @click="clearFilter">Clear</button>
              <button class="gs-modal-btn" type="button" @click="applyFilter">Apply</button>
            </div>
          </div>
        </div>

        <div v-if="deleteFileDialogOpen" class="gs-modal-backdrop" @click.self="deleteFileDialogOpen = false">
          <div class="gs-modal">
            <div class="gs-modal-title">Delete spreadsheet?</div>
            <div class="gs-modal-copy">
              This moves {{ currentWorkbook?.title }} to trash in Google Drive.
            </div>
            <div class="gs-modal-actions">
              <button class="gs-modal-btn ghost" type="button" @click="deleteFileDialogOpen = false">Cancel</button>
              <button class="gs-modal-btn danger" type="button" @click="confirmDeleteFile">Delete</button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { store } from "../stores/app";
import { useGoogleSheets } from "../composables/useGoogleSheets";
// import WorkspaceAppTabs from "../components/google-workspace/WorkspaceAppTabs.vue";
import SheetsToolbar from "../components/google-sheets/SheetsToolbar.vue";
import SheetsGrid from "../components/google-sheets/SheetsGrid.vue";
import SheetsAssistantPanel from "../components/google-sheets/SheetsAssistantPanel.vue";
import SheetsChartCard from "../components/google-sheets/SheetsChartCard.vue";
import { executeScopedAssistantCommand } from "../services/orionAssistant/orchestrator";
import {
  buildPerCellFormatOperations,
  buildUpdateCellsOperation,
  columnIndexToLetter,
  extractRangeMatrix,
  getCell,
  getCellInput,
  normalizeSelection,
  parseNameBoxValue,
  resolveChartData,
  selectionLabel,
} from "../services/googleSheetsWorkbook";

const emit = defineEmits(["close", "open-integrations"]);

const {
  aiLoading,
  currentPermissions,
  currentSheet,
  currentWorkbook,
  createSpreadsheet,
  deleteCurrentSpreadsheet,
  duplicateCurrentSpreadsheet,
  exportCurrentSpreadsheet,
  getSelectionContext,
  loadInitialSpreadsheet,
  loadSpreadsheets,
  loading,
  mutateSpreadsheet,
  openSpreadsheet,
  openSpreadsheetInGoogle,
  refreshCurrentSpreadsheet,
  renameCurrentSpreadsheet,
  runAiAction,
  saveError,
  saveState,
  setZoom,
  shareCurrentSpreadsheet,
  spreadsheets,
  workbookLoading,
  zoom,
} = useGoogleSheets();

const pageError = ref("");
const titleInputRef = ref(null);
const gridFocusRef = ref(null);
const activeMenu = ref("");
const moreMenuOpen = ref(false);
const aiPanelOpen = ref(true);
const activeAiTab = ref("chat");
const topShellCollapsed = ref(false);
const chartsExpanded = ref(true);
const shareDialogOpen = ref(false);
const recentSheetsDialogOpen = ref(false);
const recentSheetsQuery = ref("");
const shareEmail = ref("");
const shareNotice = ref("");
const chartDialogOpen = ref(false);
const deleteFileDialogOpen = ref(false);
const findDialogOpen = ref(false);
const filterDialogOpen = ref(false);
const sheetMenuSheetId = ref(null);
const showFormulaBar = ref(true);
const showGridlines = ref(true);
const titleDraft = ref("");
const selection = ref({
  anchorRow: 0,
  anchorColumn: 0,
  focusRow: 0,
  focusColumn: 0,
});
const editingCell = ref(null);
const editingValue = ref("");
const formulaDraft = ref("");
const nameBoxDraft = ref("A1");
const formulaBarFocused = ref(false);
const formulaBarEditingTarget = ref(null);
const aiMessages = ref([]);
const aiRequestCounter = ref(0);
const selectedChartId = ref(null);
const undoStack = ref([]);
const redoStack = ref([]);
const chartDraft = reactive({
  chartId: null,
  title: "",
  type: "column",
});
const findDraft = reactive({
  query: "",
  replace: "",
});
const filterDraft = reactive({
  columnIndex: 0,
  operator: "contains",
  value: "",
});
const filtersBySheet = reactive({});

// const workspaceTabs = computed(() => [
//   { id: "agent", label: "Chat", icon: "C", accent: "#344155", active: false },
//   { id: "jira", label: "Jira", icon: "J", accent: "#0052cc", active: false },
//   { id: "gmail", label: "Gmail", icon: "M", accent: "#ea4335", active: false },
//   { id: "google_calendar", label: "Calendar", icon: "C", accent: "#1a73e8", active: false },
//   { id: "drive", label: "Drive", icon: "D", accent: "#1a73e8", active: false },
//   { id: "google_docs", label: "Google Docs", icon: "D", accent: "#4285f4", active: false },
//   { id: "google_sheets", label: "Sheets", icon: "S", accent: "#34a853", active: true },
//   { id: "slides", label: "Slides", icon: "S", accent: "#fbbc04", active: false },
// ]);

const normalizedSelection = computed(() => normalizeSelection(selection.value));
const selectedRangeLabel = computed(() => selectionLabel(selection.value));
const currentCell = computed(() =>
  getCell(currentSheet.value, normalizedSelection.value.focusRow, normalizedSelection.value.focusColumn)
);
const currentCellFormat = computed(() => currentCell.value?.format || {});
const userName = computed(() => store.user?.username || "there");
const assistantSuggestions = computed(() => buildAssistantSuggestions());
const formulaBarPreviewCell = computed(() => {
  if (!formulaBarFocused.value || !formulaBarEditingTarget.value) return null;
  return {
    row: Number(formulaBarEditingTarget.value.row || 0),
    column: Number(formulaBarEditingTarget.value.column || 0),
    value: formulaDraft.value,
  };
});
const filteredSpreadsheets = computed(() => {
  const query = recentSheetsQuery.value.trim().toLowerCase();
  if (!query) return spreadsheets.value;
  return spreadsheets.value.filter((item) =>
    [item.title, item.ownerName, item.ownerEmail]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
});
const currentFilter = computed(
  () => filtersBySheet[currentWorkbook.value?.activeSheetId || ""] || null
);
const columnOptions = computed(() =>
  Array.from({ length: Math.max(1, Number(currentSheet.value?.loadedColumnCount || 1)) }, (_, index) => index)
);
const displayHiddenRows = computed(() => {
  const baseRows = [...(currentSheet.value?.hiddenRows || [])];
  const filter = currentFilter.value;
  if (!filter?.value) return baseRows;

  const next = [...baseRows];
  for (let rowIndex = 0; rowIndex < Number(currentSheet.value?.loadedRowCount || 0); rowIndex += 1) {
    const cell = getCell(currentSheet.value, rowIndex, Number(filter.columnIndex || 0));
    const text = String(cell?.display || cell?.raw || "").toLowerCase();
    const value = String(filter.value || "").toLowerCase();
    const matches =
      filter.operator === "equals" ? text === value : text.includes(value);
    if (!matches && rowIndex !== 0) next[rowIndex] = true;
  }
  return next;
});
const displaySheet = computed(() =>
  currentSheet.value
    ? {
        ...currentSheet.value,
        hiddenRows: displayHiddenRows.value,
      }
    : null
);
const resolvedCharts = computed(() =>
  (currentSheet.value?.charts || [])
    .map((chart) => ({
      chart,
      data: resolveChartData(currentWorkbook.value, chart),
    }))
    .filter((item) => item.data?.labels?.length)
);
const selectionMetrics = computed(() => {
  const sheet = currentSheet.value;
  if (!sheet) return { count: 0, sum: "0.00" };
  const values = extractRangeMatrix(sheet, normalizedSelection.value, "display")
    .flat()
    .map((value) => Number(String(value || "").replace(/[^0-9.-]/g, "")))
    .filter((value) => Number.isFinite(value));
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    count: values.length,
    sum: sum.toLocaleString("en-IN", { maximumFractionDigits: 2 }),
  };
});
const driveSaveLabel = computed(() => {
  if (saveState.value === "saving") return "Saving to Drive";
  if (saveState.value === "saved") return "Saved to Drive";
  if (saveState.value === "error") return "Drive sync failed";
  if (saveState.value === "dirty") return "Changes not synced yet";
  return "Ready in Drive";
});

function formatSpreadsheetTimestamp(value) {
  if (!value) return "Recently updated";
  try {
    return new Date(value).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

const menuItems = computed(() => ({
  File: [
    { label: "New spreadsheet", action: "new_file" },
    { label: "Open recent", action: "open_recent" },
    { label: "Duplicate spreadsheet", action: "duplicate_file" },
    { label: "Rename spreadsheet", action: "rename_file", disabled: !currentPermissions.value.canRename },
    { label: "Share", action: "share_file", disabled: !currentPermissions.value.canShare },
    { label: "Download XLSX", action: "download_xlsx", disabled: !currentPermissions.value.canDownload },
    { label: "Download CSV", action: "download_csv", disabled: !currentPermissions.value.canDownload },
    { label: "Download PDF", action: "download_pdf", disabled: !currentPermissions.value.canDownload },
    { label: "Print", action: "print_file" },
    { label: "Open in Google Sheets", action: "open_google" },
    { label: "Delete spreadsheet", action: "delete_file", disabled: !currentPermissions.value.canDelete },
  ],
  Edit: [
    { label: "Undo", action: "undo" },
    { label: "Redo", action: "redo" },
    { label: "Copy", action: "copy" },
    { label: "Cut", action: "cut" },
    { label: "Paste", action: "paste" },
    { label: "Find and replace", action: "find_replace" },
    { label: "Clear values", action: "clear_values", disabled: !currentPermissions.value.canEdit },
    { label: "Clear formatting", action: "clear_formatting", disabled: !currentPermissions.value.canEdit },
  ],
  View: [
    { label: showGridlines.value ? "Hide gridlines" : "Show gridlines", action: "toggle_gridlines" },
    { label: showFormulaBar.value ? "Hide formula bar" : "Show formula bar", action: "toggle_formula_bar" },
    { label: "Freeze first row", action: "freeze_row", disabled: !currentPermissions.value.canEdit },
    { label: "Freeze first column", action: "freeze_column", disabled: !currentPermissions.value.canEdit },
    { label: "Toggle AI assistant", action: "toggle_ai" },
    { label: "Zoom in", action: "zoom_in" },
    { label: "Zoom out", action: "zoom_out" },
  ],
  Insert: [
    { label: "Chart", action: "open_chart", disabled: !currentPermissions.value.canEdit },
    { label: "New sheet", action: "add_sheet", disabled: !currentPermissions.value.canEdit },
    { label: "Link in active cell", action: "insert_link", disabled: !currentPermissions.value.canEdit },
  ],
  Format: [
    { label: "Bold", action: "toggle_bold", disabled: !currentPermissions.value.canEdit },
    { label: "Italic", action: "toggle_italic", disabled: !currentPermissions.value.canEdit },
    { label: "Underline", action: "toggle_underline", disabled: !currentPermissions.value.canEdit },
    { label: "Currency", action: "currency", disabled: !currentPermissions.value.canEdit },
    { label: "Percent", action: "percent", disabled: !currentPermissions.value.canEdit },
    { label: "Wrap", action: "toggle_wrap", disabled: !currentPermissions.value.canEdit },
    { label: "Merge cells", action: "toggle_merge", disabled: !currentPermissions.value.canEdit },
    { label: "Clear formatting", action: "clear_formatting", disabled: !currentPermissions.value.canEdit },
  ],
  Data: [
    { label: "Sort range A → Z", action: "sort_asc", disabled: !currentPermissions.value.canEdit },
    { label: "Sort range Z → A", action: "sort_desc", disabled: !currentPermissions.value.canEdit },
    { label: "Filter current sheet", action: "open_filter" },
    { label: "Remove duplicates", action: "remove_duplicates", disabled: !currentPermissions.value.canEdit },
  ],
  Tools: [
    { label: "Analyze selection", action: "ai_analyze" },
    { label: "Explain formula", action: "ai_formula" },
    { label: "Clean duplicate rows", action: "remove_duplicates", disabled: !currentPermissions.value.canEdit },
  ],
  Extensions: [
    { label: "Summarize sheet", action: "ai_summarize" },
    { label: "Generate chart", action: "ai_chart" },
  ],
  Help: [
    { label: "Ask AI about this sheet", action: "ai_chat" },
    { label: "Manage integration", action: "manage_integration" },
  ],
}));
const visibleMenus = computed(() =>
  ["File", "Edit", "View", "Insert", "Format", "Data", "Tools", "Extensions", "Help"]
);

function resetSelection() {
  selection.value = {
    anchorRow: 0,
    anchorColumn: 0,
    focusRow: 0,
    focusColumn: 0,
  };
}

function syncDraftsToSelection() {
  if (formulaBarFocused.value && formulaBarEditingTarget.value) return;
  const context = getSelectionContext(selection.value);
  formulaDraft.value = getCellInput(context.activeCell);
  nameBoxDraft.value = context.activeRangeLabel;
}

function pushHistory(entry) {
  if (!entry?.undo?.length || !entry?.redo?.length) return;
  undoStack.value.push(entry);
  redoStack.value = [];
}

async function runOperations(operations, historyEntry = null, options = {}) {
  if (!operations?.length) return null;
  try {
    const result = await mutateSpreadsheet(operations, options);
    if (historyEntry) pushHistory(historyEntry);
    syncDraftsToSelection();
    return result;
  } catch (error) {
    pageError.value =
      error.response?.data?.error ||
      error.message ||
      "Failed to update spreadsheet.";
    return null;
  }
}

function buildRangeFromSelection() {
  const sheetId = currentSheet.value?.sheetId;
  return {
    sheetId: Number(sheetId || 0),
    startRow: normalizedSelection.value.startRow,
    endRow: normalizedSelection.value.endRow,
    startColumn: normalizedSelection.value.startColumn,
    endColumn: normalizedSelection.value.endColumn,
  };
}

function clampSelection(nextSelection) {
  const rowLimit = Math.max(0, Number(currentSheet.value?.loadedRowCount || 1) - 1);
  const columnLimit = Math.max(0, Number(currentSheet.value?.loadedColumnCount || 1) - 1);
  return {
    anchorRow: Math.min(rowLimit, Math.max(0, Number(nextSelection.anchorRow || 0))),
    anchorColumn: Math.min(columnLimit, Math.max(0, Number(nextSelection.anchorColumn || 0))),
    focusRow: Math.min(rowLimit, Math.max(0, Number(nextSelection.focusRow || 0))),
    focusColumn: Math.min(columnLimit, Math.max(0, Number(nextSelection.focusColumn || 0))),
  };
}

function setSelection(nextSelection) {
  selection.value = clampSelection(nextSelection);
}

function focusGrid() {
  gridFocusRef.value?.focus?.();
}

function beginCellEdit(payload = {}) {
  if (!currentPermissions.value.canEdit) return;
  editingCell.value = {
    row: Number(payload.row || normalizedSelection.value.focusRow),
    column: Number(payload.column || normalizedSelection.value.focusColumn),
  };
  editingValue.value = getCellInput(
    getCell(currentSheet.value, editingCell.value.row, editingCell.value.column)
  );
}

function cancelCellEdit() {
  editingCell.value = null;
  editingValue.value = "";
  syncDraftsToSelection();
  focusGrid();
}

async function applySingleCellValue(row, column, value, move = "") {
  const sheetId = currentSheet.value?.sheetId;
  const range = {
    sheetId,
    startRow: Number(row),
    endRow: Number(row) + 1,
    startColumn: Number(column),
    endColumn: Number(column) + 1,
  };
  const previousRows = extractRangeMatrix(currentSheet.value, range, "input");
  const nextRows = [[value]];
  const pending = runOperations(
    [buildUpdateCellsOperation(sheetId, range, nextRows)],
    {
      undo: [buildUpdateCellsOperation(sheetId, range, previousRows)],
      redo: [buildUpdateCellsOperation(sheetId, range, nextRows)],
    },
    { optimistic: true }
  );

  if (move === "down") {
    setSelection({
      anchorRow: Math.min(
        Number(currentSheet.value?.loadedRowCount || 1) - 1,
        Number(row) + 1
      ),
      anchorColumn: Number(column),
      focusRow: Math.min(
        Number(currentSheet.value?.loadedRowCount || 1) - 1,
        Number(row) + 1
      ),
      focusColumn: Number(column),
    });
  } else if (move === "right") {
    setSelection({
      anchorRow: Number(row),
      anchorColumn: Math.min(
        Number(currentSheet.value?.loadedColumnCount || 1) - 1,
        Number(column) + 1
      ),
      focusRow: Number(row),
      focusColumn: Math.min(
        Number(currentSheet.value?.loadedColumnCount || 1) - 1,
        Number(column) + 1
      ),
    });
  }
  return pending;
}

async function commitCellEdit(payload = {}) {
  if (!editingCell.value) return;
  const target = {
    row: Number(editingCell.value.row || 0),
    column: Number(editingCell.value.column || 0),
    value: editingValue.value,
  };
  editingCell.value = null;
  editingValue.value = "";
  focusGrid();
  await applySingleCellValue(
    target.row,
    target.column,
    target.value,
    payload.move || ""
  );
}

async function commitFormulaBar({ focusAfter = false } = {}) {
  const target = formulaBarEditingTarget.value || {
    row: normalizedSelection.value.focusRow,
    column: normalizedSelection.value.focusColumn,
  };
  const existing = getCellInput(getCell(currentSheet.value, target.row, target.column));
  formulaBarEditingTarget.value = null;
  if (formulaDraft.value === existing) {
    syncDraftsToSelection();
    if (focusAfter) focusGrid();
    return;
  }
  await applySingleCellValue(target.row, target.column, formulaDraft.value);
  syncDraftsToSelection();
  if (focusAfter) focusGrid();
}

function handleFormulaBarFocus() {
  formulaBarFocused.value = true;
  formulaBarEditingTarget.value = {
    row: normalizedSelection.value.focusRow,
    column: normalizedSelection.value.focusColumn,
  };
  editingCell.value = null;
}

function handleFormulaBarBlur() {
  formulaBarFocused.value = false;
  void commitFormulaBar();
}

function toggleMenu(menu) {
  moreMenuOpen.value = false;
  activeMenu.value = activeMenu.value === menu ? "" : menu;
}

async function openRecentSheetsBrowser() {
  recentSheetsDialogOpen.value = true;
  recentSheetsQuery.value = "";
  try {
    await loadSpreadsheets(30);
  } catch (error) {
    pageError.value =
      error.response?.data?.error || error.message || "Failed to load recent spreadsheets.";
  }
}

async function openRecentSpreadsheet(spreadsheetId) {
  try {
    await openSpreadsheet(spreadsheetId);
    recentSheetsDialogOpen.value = false;
    resetSelection();
    syncDraftsToSelection();
  } catch (error) {
    pageError.value =
      error.response?.data?.error || error.message || "Failed to open spreadsheet.";
  }
}

async function refreshWorkbook() {
  activeMenu.value = "";
  moreMenuOpen.value = false;
  pageError.value = "";
  try {
    await refreshCurrentSpreadsheet();
  } catch (error) {
    pageError.value =
      error.response?.data?.error || error.message || "Failed to refresh spreadsheet.";
  }
}

async function submitRenameFile() {
  const title = String(titleDraft.value || "").trim();
  if (!title || !currentPermissions.value.canRename || title === currentWorkbook.value?.title) {
    titleDraft.value = currentWorkbook.value?.title || "";
    return;
  }
  try {
    await renameCurrentSpreadsheet(title);
  } catch (error) {
    pageError.value =
      error.response?.data?.error || error.message || "Failed to rename spreadsheet.";
  }
}

function applyNameBoxSelection() {
  const nextSelection = parseNameBoxValue(nameBoxDraft.value);
  if (!nextSelection) {
    nameBoxDraft.value = selectedRangeLabel.value;
    return;
  }
  setSelection(nextSelection);
  focusGrid();
}

async function applyUniformFormat(patch) {
  if (!currentPermissions.value.canEdit) return;
  const range = buildRangeFromSelection();
  const previousFormats = extractRangeMatrix(currentSheet.value, range, "format");
  const requiresAuthoritativeRefresh =
    patch?.numberFormatType != null || patch?.numberFormatPattern != null;
  await runOperations(
    [
      {
        type: "format_cells",
        sheetId: range.sheetId,
        range,
        format: patch,
      },
    ],
    {
      undo: buildPerCellFormatOperations(range.sheetId, range, previousFormats),
      redo: [
        {
          type: "format_cells",
          sheetId: range.sheetId,
          range,
          format: patch,
        },
      ],
    },
    { optimistic: !requiresAuthoritativeRefresh }
  );
}

async function clearSelectedValues() {
  const range = buildRangeFromSelection();
  const previousRows = extractRangeMatrix(currentSheet.value, range, "input");
  await runOperations(
    [
      {
        type: "clear_cells",
        sheetId: range.sheetId,
        range,
      },
    ],
    {
      undo: [buildUpdateCellsOperation(range.sheetId, range, previousRows)],
      redo: [
        {
          type: "clear_cells",
          sheetId: range.sheetId,
          range,
        },
      ],
    },
    { optimistic: true }
  );
}

async function clearSelectedFormatting() {
  const range = buildRangeFromSelection();
  const previousFormats = extractRangeMatrix(currentSheet.value, range, "format");
  await runOperations(
    [
      {
        type: "clear_formatting",
        sheetId: range.sheetId,
        range,
      },
    ],
    {
      undo: buildPerCellFormatOperations(range.sheetId, range, previousFormats),
      redo: [
        {
          type: "clear_formatting",
          sheetId: range.sheetId,
          range,
        },
      ],
    },
    { optimistic: true }
  );
}

async function toggleMerge() {
  if (!currentPermissions.value.canEdit) return;
  const selectionRange = buildRangeFromSelection();
  const merge = (currentSheet.value?.merges || []).find(
    (item) =>
      item.endRow > selectionRange.startRow &&
      item.startRow < selectionRange.endRow &&
      item.endColumn > selectionRange.startColumn &&
      item.startColumn < selectionRange.endColumn
  );
  const range = merge
    ? {
        sheetId: selectionRange.sheetId,
        startRow: merge.startRow,
        endRow: merge.endRow,
        startColumn: merge.startColumn,
        endColumn: merge.endColumn,
      }
    : selectionRange;
  await runOperations([
    {
      type: merge ? "unmerge_cells" : "merge_cells",
      sheetId: range.sheetId,
      range,
    },
  ], null, { optimistic: true });
}

async function handleResize(payload) {
  if (!currentPermissions.value.canEdit) return;
  const before =
    payload.dimension === "ROWS"
      ? currentSheet.value?.rowHeights?.[payload.startIndex] || 32
      : currentSheet.value?.columnWidths?.[payload.startIndex] || 120;
  await runOperations(
    [
      {
        type: "resize_dimension",
        sheetId: currentSheet.value?.sheetId,
        ...payload,
      },
    ],
    {
      undo: [
        {
          type: "resize_dimension",
          sheetId: currentSheet.value?.sheetId,
          dimension: payload.dimension,
          startIndex: payload.startIndex,
          endIndex: payload.endIndex,
          pixelSize: before,
        },
      ],
      redo: [
        {
          type: "resize_dimension",
          sheetId: currentSheet.value?.sheetId,
          dimension: payload.dimension,
          startIndex: payload.startIndex,
          endIndex: payload.endIndex,
          pixelSize: payload.pixelSize,
        },
      ],
    },
    { optimistic: true }
  );
}

function moveSelection(rowDelta, columnDelta, extend = false) {
  const base = normalizeSelection(selection.value);
  const nextFocusRow = base.focusRow + rowDelta;
  const nextFocusColumn = base.focusColumn + columnDelta;
  setSelection({
    anchorRow: extend ? base.anchorRow : nextFocusRow,
    anchorColumn: extend ? base.anchorColumn : nextFocusColumn,
    focusRow: nextFocusRow,
    focusColumn: nextFocusColumn,
  });
}

function clipboardTextForSelection() {
  return extractRangeMatrix(currentSheet.value, normalizedSelection.value, "input")
    .map((row) => row.join("\t"))
    .join("\n");
}

function handleCopy(event) {
  event.clipboardData?.setData("text/plain", clipboardTextForSelection());
}

async function handleCut(event) {
  handleCopy(event);
  await clearSelectedValues();
}

async function handlePaste(event) {
  if (!currentPermissions.value.canEdit) return;
  const text = event.clipboardData?.getData("text/plain") || "";
  if (!text.trim()) return;
  const rows = text.split(/\r?\n/).map((line) => line.split("\t"));
  const start = normalizedSelection.value;
  const range = {
    sheetId: currentSheet.value?.sheetId,
    startRow: start.startRow,
    endRow: start.startRow + rows.length,
    startColumn: start.startColumn,
    endColumn:
      start.startColumn + Math.max(...rows.map((row) => row.length), 0),
  };
  const previousRows = extractRangeMatrix(currentSheet.value, range, "input");
  await runOperations(
    [buildUpdateCellsOperation(range.sheetId, range, rows)],
    {
      undo: [buildUpdateCellsOperation(range.sheetId, range, previousRows)],
      redo: [buildUpdateCellsOperation(range.sheetId, range, rows)],
    },
    { optimistic: true }
  );
}

async function performUndo() {
  const entry = undoStack.value.pop();
  if (!entry) return;
  redoStack.value.push(entry);
  await runOperations(entry.undo, null);
}

async function performRedo() {
  const entry = redoStack.value.pop();
  if (!entry) return;
  undoStack.value.push(entry);
  await runOperations(entry.redo, null);
}

function adjustNumberPattern(delta = 1) {
  const format = currentCellFormat.value || {};
  const type = format.numberFormatType || "number";
  const currentPattern = format.numberFormatPattern || "0.00";
  const decimals = Math.max(0, (currentPattern.split(".")[1] || "").length + delta);
  const suffix = decimals ? `.${"0".repeat(decimals)}` : "";
  if (type === "percent") return `0${suffix}%`;
  if (type === "currency") return `$#,##0${suffix}`;
  return `0${suffix}`;
}

function numericValue(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "")
    .trim()
    .replace(/,/g, "")
    .replace(/[$₹€£]/g, "");
  if (!text) return Number.NaN;
  if (text.endsWith("%")) {
    const percent = Number(text.slice(0, -1));
    return Number.isFinite(percent) ? percent / 100 : Number.NaN;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatNumeric(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

function cellHasContent(cell = null) {
  return Boolean(
    String(cell?.display || cell?.raw || cell?.formula || "").trim()
  );
}

function getUsedRange(sheet = currentSheet.value) {
  const rowCount = Number(sheet?.loadedRowCount || 0);
  const columnCount = Number(sheet?.loadedColumnCount || 0);
  let lastRow = 0;
  let lastColumn = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      if (!cellHasContent(getCell(sheet, rowIndex, columnIndex))) continue;
      lastRow = Math.max(lastRow, rowIndex + 1);
      lastColumn = Math.max(lastColumn, columnIndex + 1);
    }
  }

  return {
    sheetId: Number(sheet?.sheetId || 0),
    startRow: 0,
    endRow: Math.max(lastRow, 1),
    startColumn: 0,
    endColumn: Math.max(lastColumn, 1),
  };
}

function activeTableRange() {
  const selected = buildRangeFromSelection();
  const selectedRowCount = selected.endRow - selected.startRow;
  const selectedColumnCount = selected.endColumn - selected.startColumn;
  if (selectedRowCount > 1 || selectedColumnCount > 1) {
    return selected;
  }
  return getUsedRange();
}

function sheetMatrix(range = activeTableRange(), mode = "display") {
  return extractRangeMatrix(currentSheet.value, range, mode);
}

function lowerHeaderValues(range = activeTableRange()) {
  const matrix = sheetMatrix(range, "display");
  return (matrix[0] || []).map((value) => String(value || "").trim().toLowerCase());
}

function findColumns(headers = [], keywords = []) {
  return headers.reduce((matches, header, index) => {
    if (keywords.some((keyword) => header.includes(keyword))) {
      matches.push(index);
    }
    return matches;
  }, []);
}

function quartile(values = [], percentile = 0.25) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return Number.NaN;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile)));
  return sorted[index];
}

function buildAssistantSuggestions() {
  const fallback = [
    "Create a table",
    "Summarize this sheet",
    "Format this sheet professionally",
    "Generate a chart for this range",
  ];

  const sheet = currentSheet.value;
  if (!sheet) return fallback;

  const range = getUsedRange(sheet);
  const matrix = extractRangeMatrix(sheet, range, "display");
  const hasContent = matrix.some((row) => row.some((value) => String(value || "").trim()));
  if (!hasContent) return fallback;

  const headers = lowerHeaderValues(range);
  const suggestions = [];
  const hasBudgetColumns = findColumns(headers, ["budget", "spend", "spent", "remaining", "balance"]).length >= 2;
  const hasMonthColumns = headers.some((header) => /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i.test(header));
  const selectionIsRange =
    normalizedSelection.value.endRow - normalizedSelection.value.startRow > 1 ||
    normalizedSelection.value.endColumn - normalizedSelection.value.startColumn > 1;

  if (currentCell.value?.formula) suggestions.push("Explain this formula");
  if (hasBudgetColumns) suggestions.push("Calculate total spend");
  if (hasBudgetColumns && hasMonthColumns) suggestions.push("Which month has the highest spend?");
  if (selectionIsRange && normalizedSelection.value.endColumn - normalizedSelection.value.startColumn > 1) {
    suggestions.push("Generate a chart for this range");
  }
  if (headers.some((header) => /date|month|week|year|trend|status/i.test(header))) {
    suggestions.push("Analyze this sheet and tell me the key insights");
  }
  if (headers.some((header) => /remaining|balance|budget/i.test(header))) {
    suggestions.push("Highlight cells with low remaining budget");
  }
  if (headers.some((header) => /budget|spend|planned|actual/i.test(header))) {
    suggestions.push("Create a monthly summary sheet");
  }
  suggestions.push("Clean duplicate rows");
  suggestions.push("Format this sheet professionally");
  suggestions.push("Summarize this sheet");

  return Array.from(new Set(suggestions.map((item) => String(item).trim()).filter(Boolean))).slice(0, 4);
}

function answerTotalSpend() {
  const range = activeTableRange();
  const matrix = sheetMatrix(range, "display");
  const headers = lowerHeaderValues(range);
  const spendColumns = findColumns(headers, ["spend", "spent", "expense", "cost"]);

  if (spendColumns.length) {
    const totals = spendColumns
      .map((index) => {
        const total = matrix.slice(1).reduce((sum, row) => {
          const value = numericValue(row[index]);
          return Number.isFinite(value) ? sum + value : sum;
        }, 0);
        return {
          header: matrix[0]?.[index] || "Spend",
          total,
        };
      })
      .filter((item) => Number.isFinite(item.total));

    if (totals.length === 1) {
      return `Total ${totals[0].header} is ${formatNumeric(totals[0].total)}.`;
    }

    if (totals.length > 1) {
      return totals.map((item) => `${item.header}: ${formatNumeric(item.total)}`).join("\n");
    }
  }

  const selectedValues = extractRangeMatrix(currentSheet.value, normalizedSelection.value, "display")
    .flat()
    .map(numericValue)
    .filter(Number.isFinite);
  if (selectedValues.length) {
    const total = selectedValues.reduce((sum, value) => sum + value, 0);
    return `Total for the active range is ${formatNumeric(total)}.`;
  }

  return "";
}

function answerHighestMonth() {
  const range = activeTableRange();
  const matrix = sheetMatrix(range, "display");
  const headers = matrix[0] || [];
  const monthPattern = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i;
  const monthTotals = headers
    .map((header, index) => ({
      header: String(header || "").trim(),
      index,
    }))
    .filter((item) => monthPattern.test(item.header))
    .map((item) => ({
      ...item,
      total: matrix.slice(1).reduce((sum, row) => {
        const value = numericValue(row[item.index]);
        return Number.isFinite(value) ? sum + value : sum;
      }, 0),
    }))
    .filter((item) => Number.isFinite(item.total));

  if (!monthTotals.length) return "";
  const highest = monthTotals.reduce((best, item) => (item.total > best.total ? item : best));
  return `${highest.header} has the highest total spend at ${formatNumeric(highest.total)}.`;
}

async function formatActiveSheetProfessionally() {
  if (!currentPermissions.value.canEdit) return false;
  const range = activeTableRange();
  if (range.endRow - range.startRow < 2 || range.endColumn - range.startColumn < 1) return false;

  const headerRange = {
    ...range,
    endRow: range.startRow + 1,
  };

  await runOperations([
    {
      type: "format_cells",
      sheetId: range.sheetId,
      range,
      format: {
        fontFamily: currentCellFormat.value?.fontFamily || "Arial",
        fontSize: currentCellFormat.value?.fontSize || 10,
        verticalAlignment: "middle",
        wrapStrategy: "wrap",
        borders: {
          top: { style: "SOLID", color: "#d7dee9" },
          right: { style: "SOLID", color: "#d7dee9" },
          bottom: { style: "SOLID", color: "#d7dee9" },
          left: { style: "SOLID", color: "#d7dee9" },
        },
      },
    },
    {
      type: "format_cells",
      sheetId: range.sheetId,
      range: headerRange,
      format: {
        bold: true,
        textColor: "#ffffff",
        fillColor: "#1f6f43",
        horizontalAlignment: "center",
      },
    },
    {
      type: "freeze_sheet",
      sheetId: range.sheetId,
      frozenRowCount: Math.max(1, Number(currentSheet.value?.frozenRowCount || 0)),
      frozenColumnCount: Number(currentSheet.value?.frozenColumnCount || 0),
    },
  ]);

  return true;
}

async function highlightLowRemainingBudget() {
  if (!currentPermissions.value.canEdit) return false;
  const range = activeTableRange();
  const matrix = sheetMatrix(range, "display");
  const headers = lowerHeaderValues(range);
  const remainingColumns = findColumns(headers, ["remaining", "balance", "left"]);
  if (!remainingColumns.length) return false;

  const operations = [];
  for (const columnOffset of remainingColumns) {
    const values = matrix.slice(1).map((row) => numericValue(row[columnOffset])).filter(Number.isFinite);
    if (!values.length) continue;
    const threshold = values.length >= 4 ? quartile(values, 0.25) : Math.min(...values);
    matrix.slice(1).forEach((row, rowOffset) => {
      const value = numericValue(row[columnOffset]);
      if (!Number.isFinite(value) || value > threshold) return;
      operations.push({
        type: "format_cells",
        sheetId: range.sheetId,
        range: {
          sheetId: range.sheetId,
          startRow: range.startRow + rowOffset + 1,
          endRow: range.startRow + rowOffset + 2,
          startColumn: range.startColumn + columnOffset,
          endColumn: range.startColumn + columnOffset + 1,
        },
        format: {
          fillColor: "#fee2e2",
          textColor: "#991b1b",
          bold: true,
        },
      });
    });
  }

  if (!operations.length) return false;
  await runOperations(operations);
  return true;
}

async function addRemainingFormulas() {
  if (!currentPermissions.value.canEdit) return false;
  const range = activeTableRange();
  const headers = lowerHeaderValues(range);
  const budgetColumn = findColumns(headers, ["budget", "planned"])[0];
  const spendColumn = findColumns(headers, ["spend", "spent", "expense", "cost"])[0];
  const remainingColumn = findColumns(headers, ["remaining", "balance", "left"])[0];

  if ([budgetColumn, spendColumn, remainingColumn].some((value) => value == null)) {
    return false;
  }

  const bodyStartRow = range.startRow + 1;
  const bodyEndRow = range.endRow;
  if (bodyEndRow <= bodyStartRow) return false;

  const formulas = [];
  for (let rowIndex = bodyStartRow; rowIndex < bodyEndRow; rowIndex += 1) {
    formulas.push([
      `=${columnIndexToLetter(range.startColumn + budgetColumn)}${rowIndex + 1}-${columnIndexToLetter(range.startColumn + spendColumn)}${rowIndex + 1}`,
    ]);
  }

  const formulaRange = {
    sheetId: range.sheetId,
    startRow: bodyStartRow,
    endRow: bodyEndRow,
    startColumn: range.startColumn + remainingColumn,
    endColumn: range.startColumn + remainingColumn + 1,
  };

  await runOperations(
    [buildUpdateCellsOperation(range.sheetId, formulaRange, formulas)],
    null,
    { optimistic: false }
  );
  return true;
}

async function createTotalsRow() {
  if (!currentPermissions.value.canEdit) return false;
  const range = activeTableRange();
  const matrix = sheetMatrix(range, "display");
  if (matrix.length < 2) return false;
  const totalsRow = [];

  for (let columnOffset = 0; columnOffset < matrix[0].length; columnOffset += 1) {
    if (columnOffset === 0) {
      totalsRow.push("Total");
      continue;
    }
    const numericCells = matrix.slice(1).map((row) => numericValue(row[columnOffset])).filter(Number.isFinite);
    if (!numericCells.length) {
      totalsRow.push("");
      continue;
    }
    totalsRow.push(
      `=SUM(${columnIndexToLetter(range.startColumn + columnOffset)}${range.startRow + 2}:${columnIndexToLetter(range.startColumn + columnOffset)}${range.endRow})`
    );
  }

  const totalRange = {
    sheetId: range.sheetId,
    startRow: range.endRow,
    endRow: range.endRow + 1,
    startColumn: range.startColumn,
    endColumn: range.startColumn + totalsRow.length,
  };

  await runOperations(
    [buildUpdateCellsOperation(range.sheetId, totalRange, [totalsRow])],
    null,
    { optimistic: false }
  );
  return true;
}

async function createMonthlySummarySheet() {
  if (!currentPermissions.value.canEdit) return false;
  const range = getUsedRange();
  const matrix = sheetMatrix(range, "display");
  const headers = matrix[0] || [];
  const monthPattern = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i;
  const numericColumns = headers
    .map((header, index) => ({
      header: String(header || "").trim(),
      index,
      month: monthPattern.test(String(header || "").trim()),
    }))
    .filter((item) =>
      matrix.slice(1).some((row) => Number.isFinite(numericValue(row[item.index])))
    );

  if (!numericColumns.length) return false;

  const summaryRows = [
    [numericColumns.some((item) => item.month) ? "Month" : "Column", "Total", "Average"],
    ...numericColumns.map((item) => {
      const values = matrix.slice(1).map((row) => numericValue(row[item.index])).filter(Number.isFinite);
      const total = values.reduce((sum, value) => sum + value, 0);
      const average = values.length ? total / values.length : 0;
      return [item.header || `Column ${item.index + 1}`, total, Number(average.toFixed(2))];
    }),
  ];

  const created = await runOperations(
    [
      {
        type: "add_sheet",
        title: `${currentSheet.value?.title || "Sheet"} Summary`,
        rowCount: 80,
        columnCount: 8,
      },
    ],
    null,
    { optimistic: false }
  );

  const nextSheetId = created?.activeSheetId;
  if (!nextSheetId) return false;

  await runOperations(
    [
      buildUpdateCellsOperation(nextSheetId, {
        sheetId: nextSheetId,
        startRow: 0,
        endRow: summaryRows.length,
        startColumn: 0,
        endColumn: summaryRows[0].length,
      }, summaryRows),
      {
        type: "format_cells",
        sheetId: nextSheetId,
        range: {
          sheetId: nextSheetId,
          startRow: 0,
          endRow: 1,
          startColumn: 0,
          endColumn: summaryRows[0].length,
        },
        format: {
          bold: true,
          textColor: "#ffffff",
          fillColor: "#1f6f43",
          horizontalAlignment: "center",
        },
      },
    ],
    null,
    { activeSheetId: nextSheetId, optimistic: false }
  );

  chartsExpanded.value = false;
  return true;
}

async function sortSelection(order = "asc") {
  const range = buildRangeFromSelection();
  const matrix = extractRangeMatrix(currentSheet.value, range, "input");
  if (!matrix.length) return;
  const [header, ...body] = matrix;
  const sorted = [...body].sort((left, right) => {
    const leftValue = String(left[0] || "");
    const rightValue = String(right[0] || "");
    return order === "asc"
      ? leftValue.localeCompare(rightValue, undefined, { numeric: true })
      : rightValue.localeCompare(leftValue, undefined, { numeric: true });
  });
  await runOperations(
    [buildUpdateCellsOperation(range.sheetId, range, [header, ...sorted])],
    {
      undo: [buildUpdateCellsOperation(range.sheetId, range, matrix)],
      redo: [buildUpdateCellsOperation(range.sheetId, range, [header, ...sorted])],
    }
  );
}

async function removeDuplicates() {
  const range = buildRangeFromSelection();
  const matrix = extractRangeMatrix(currentSheet.value, range, "input");
  if (!matrix.length) return false;
  const [header, ...body] = matrix;
  const seen = new Set();
  const unique = body.filter((row) => {
    const key = row.join("␟");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const padded = [header, ...unique];
  while (padded.length < matrix.length) padded.push(Array.from({ length: header.length }, () => ""));

  await runOperations(
    [buildUpdateCellsOperation(range.sheetId, range, padded)],
    {
      undo: [buildUpdateCellsOperation(range.sheetId, range, matrix)],
      redo: [buildUpdateCellsOperation(range.sheetId, range, padded)],
    }
  );
  return true;
}

function applyFilter() {
  filtersBySheet[currentWorkbook.value?.activeSheetId || ""] = {
    columnIndex: Number(filterDraft.columnIndex || 0),
    operator: filterDraft.operator,
    value: filterDraft.value,
  };
  filterDialogOpen.value = false;
}

function clearFilter() {
  delete filtersBySheet[currentWorkbook.value?.activeSheetId || ""];
  filterDialogOpen.value = false;
}

function findMatches() {
  const query = String(findDraft.query || "").toLowerCase();
  if (!query) return [];
  const matches = [];
  for (let rowIndex = 0; rowIndex < Number(currentSheet.value?.loadedRowCount || 0); rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < Number(currentSheet.value?.loadedColumnCount || 0); columnIndex += 1) {
      const cell = getCell(currentSheet.value, rowIndex, columnIndex);
      const text = String(cell?.display || cell?.raw || "").toLowerCase();
      if (text.includes(query)) {
        matches.push({ rowIndex, columnIndex });
      }
    }
  }
  return matches;
}

function findNext() {
  const matches = findMatches();
  if (!matches.length) return;
  const currentIndex = matches.findIndex(
    (item) =>
      item.rowIndex === normalizedSelection.value.focusRow &&
      item.columnIndex === normalizedSelection.value.focusColumn
  );
  const next = matches[(currentIndex + 1 + matches.length) % matches.length];
  setSelection({
    anchorRow: next.rowIndex,
    anchorColumn: next.columnIndex,
    focusRow: next.rowIndex,
    focusColumn: next.columnIndex,
  });
  focusGrid();
}

async function replaceCurrent() {
  if (!findDraft.query) return;
  const cell = currentCell.value;
  if (!cell) return;
  const nextValue = String(getCellInput(cell)).replace(findDraft.query, findDraft.replace);
  await applySingleCellValue(
    normalizedSelection.value.focusRow,
    normalizedSelection.value.focusColumn,
    nextValue
  );
}

async function replaceAll() {
  const query = String(findDraft.query || "");
  if (!query) return;
  const range = {
    sheetId: currentSheet.value?.sheetId,
    startRow: 0,
    endRow: Number(currentSheet.value?.loadedRowCount || 0),
    startColumn: 0,
    endColumn: Number(currentSheet.value?.loadedColumnCount || 0),
  };
  const matrix = extractRangeMatrix(currentSheet.value, range, "input");
  const replaced = matrix.map((row) =>
    row.map((value) => String(value || "").split(query).join(findDraft.replace))
  );
  await runOperations(
    [buildUpdateCellsOperation(range.sheetId, range, replaced)],
    {
      undo: [buildUpdateCellsOperation(range.sheetId, range, matrix)],
      redo: [buildUpdateCellsOperation(range.sheetId, range, replaced)],
    },
    { optimistic: false }
  );
}

async function insertLinkInActiveCell() {
  if (!currentPermissions.value.canEdit) return;
  const url = window.prompt("Paste the URL to link in the active cell:");
  if (!url) return;
  const label = window.prompt("Label for the link:", currentCell.value?.display || "Open link") || "Open link";
  await applySingleCellValue(
    normalizedSelection.value.focusRow,
    normalizedSelection.value.focusColumn,
    `=HYPERLINK("${url.replace(/"/g, '""')}", "${label.replace(/"/g, '""')}")`
  );
}

function closeChartDialog() {
  chartDialogOpen.value = false;
  chartDraft.chartId = null;
  chartDraft.type = "column";
  chartDraft.title = "";
  selectedChartId.value = null;
}

function openChartEditor(chart) {
  chartDraft.chartId = chart.chartId;
  chartDraft.type = chart.type || "column";
  chartDraft.title = chart.title || "";
  selectedChartId.value = chart.chartId;
  chartsExpanded.value = true;
  chartDialogOpen.value = true;
}

async function submitChartDialog() {
  const range = buildRangeFromSelection();
  if (range.endColumn - range.startColumn < 2) {
    pageError.value = "Select at least two columns before inserting a chart.";
    return;
  }

  if (chartDraft.chartId) {
    await runOperations([
      {
        type: "update_chart",
        chartId: chartDraft.chartId,
        chartType: chartDraft.type,
        title: chartDraft.title || "Chart",
        range,
      },
    ]);
  } else {
    await runOperations([
      {
        type: "create_chart",
        sheetId: range.sheetId,
        chartType: chartDraft.type,
        title: chartDraft.title || "Chart",
        range,
        position: {
          sheetId: range.sheetId,
          rowIndex: Number(currentSheet.value?.loadedRowCount || range.endRow) + 1,
          columnIndex: range.startColumn,
          widthPixels: 680,
          heightPixels: 320,
        },
      },
    ]);
  }

  chartsExpanded.value = true;
  closeChartDialog();
}

async function createChartFromSelection(payload = {}) {
  const range = buildRangeFromSelection();
  if (range.endColumn - range.startColumn < 2) return false;
  await runOperations([
    {
      type: "create_chart",
      sheetId: range.sheetId,
      chartType: payload.chartType || "column",
      title: payload.title || "Chart",
      range,
      position: {
        sheetId: range.sheetId,
        rowIndex: Number(currentSheet.value?.loadedRowCount || range.endRow) + 1,
        columnIndex: range.startColumn,
        widthPixels: 680,
        heightPixels: 320,
      },
    },
  ]);
  chartsExpanded.value = true;
  return true;
}

async function deleteChart(chart) {
  await runOperations([
    {
      type: "delete_chart",
      sheetId: currentSheet.value?.sheetId,
      chartId: chart.chartId,
    },
  ]);
}

async function submitShare() {
  if (!shareEmail.value.trim()) return;
  try {
    const result = await shareCurrentSpreadsheet({
      emails: shareEmail.value
        .split(/[,\n;]/g)
        .map((item) => item.trim())
        .filter(Boolean),
      role: "writer",
    });
    shareNotice.value = `Shared with ${result.shared?.map((item) => item.email).join(", ")}`;
    shareEmail.value = "";
  } catch (error) {
    shareNotice.value =
      error.response?.data?.error || error.message || "Failed to share spreadsheet.";
  }
}

async function confirmDeleteFile() {
  try {
    await deleteCurrentSpreadsheet();
    deleteFileDialogOpen.value = false;
  } catch (error) {
    pageError.value =
      error.response?.data?.error || error.message || "Failed to delete spreadsheet.";
  }
}

async function switchSheet(sheetId) {
  if (!currentWorkbook.value?.spreadsheetId || Number(sheetId) === Number(currentWorkbook.value?.activeSheetId)) {
    sheetMenuSheetId.value = null;
    return;
  }
  try {
    await openSpreadsheet(currentWorkbook.value.spreadsheetId, { sheetId });
    resetSelection();
    syncDraftsToSelection();
  } catch (error) {
    pageError.value =
      error.response?.data?.error || error.message || "Failed to switch sheet.";
  } finally {
    sheetMenuSheetId.value = null;
  }
}

async function addSheet() {
  await runOperations([
    {
      type: "add_sheet",
      title: `Sheet ${Number(currentWorkbook.value?.sheets?.length || 1) + 1}`,
      rowCount: 160,
      columnCount: 20,
    },
  ]);
}

async function renameSheet(sheet) {
  sheetMenuSheetId.value = null;
  const title = window.prompt("Rename sheet", sheet.title);
  if (!title || title === sheet.title) return;
  await runOperations([
    {
      type: "rename_sheet",
      sheetId: sheet.sheetId,
      title,
    },
  ]);
}

async function duplicateSheet(sheet) {
  sheetMenuSheetId.value = null;
  await runOperations([
    {
      type: "duplicate_sheet",
      sheetId: sheet.sheetId,
      title: `${sheet.title} copy`,
    },
  ]);
}

async function deleteSheet(sheet) {
  sheetMenuSheetId.value = null;
  if ((currentWorkbook.value?.sheets?.length || 0) <= 1) return;
  const confirmed = window.confirm(`Delete sheet "${sheet.title}"?`);
  if (!confirmed) return;
  await runOperations([
    {
      type: "delete_sheet",
      sheetId: sheet.sheetId,
    },
  ]);
}

function buildSheetsRuntime() {
  return {
    getScope: () => "google_sheets",
    getActiveEntityId: () => currentWorkbook.value?.spreadsheetId,
    getActiveEntityTitle: () => currentWorkbook.value?.title || "Untitled spreadsheet",
    getActiveSheetTitle: () => currentSheet.value?.title || "Sheet1",
    getPermissions: () => currentPermissions.value,
    getActiveCell: () => currentCell.value,
    getActiveRangeLabel: () => selectedRangeLabel.value,
    runAiAction: ({ action, question }) =>
      runAiAction({
        action,
        question,
        workbookTitle: currentWorkbook.value?.title,
        activeSheet: currentSheet.value,
        selection: normalizedSelection.value,
        activeCell: currentCell.value,
        activeRangeLabel: selectedRangeLabel.value,
        activeCellLabel: selectionLabel({
          anchorRow: normalizedSelection.value.focusRow,
          anchorColumn: normalizedSelection.value.focusColumn,
          focusRow: normalizedSelection.value.focusRow,
          focusColumn: normalizedSelection.value.focusColumn,
        }),
      }),
    calculateTotalSpend: answerTotalSpend,
    findHighestMonth: answerHighestMonth,
    createChartFromSelection,
    removeDuplicateRows: removeDuplicates,
    formatSheetProfessionally: formatActiveSheetProfessionally,
    createMonthlySummarySheet,
    highlightLowRemainingBudget,
    addRemainingFormulas,
    createTotalsRow,
    sortActiveRange: sortSelection,
    openFilterDialog: () => {
      filterDialogOpen.value = true;
      return true;
    },
    shareCurrentFile: shareCurrentSpreadsheet,
    renameCurrentFile: renameCurrentSpreadsheet,
    exportCurrentFile: exportCurrentSpreadsheet,
    printCurrentFile: printCurrentSpreadsheet,
  };
}

async function handleAiSend(question) {
  const trimmed = String(question || "").trim();
  if (!trimmed) return;
  aiMessages.value.push({
    id: `${Date.now()}-user`,
    role: "user",
    text: trimmed,
  });

  const requestId = ++aiRequestCounter.value;
  try {
    const result = await executeScopedAssistantCommand({
      question: trimmed,
      scope: "google_sheets",
      runtime: buildSheetsRuntime(),
    });
    if (requestId !== aiRequestCounter.value) return;
    aiMessages.value.push({
      id: `${Date.now()}-assistant`,
      role: "assistant",
      text: result?.assistantText || "No response returned.",
    });
  } catch (error) {
    aiMessages.value.push({
      id: `${Date.now()}-assistant-error`,
      role: "assistant",
      text:
        error.response?.data?.error ||
        error.message ||
        "I couldn’t complete that sheet action.",
    });
  }
}

function handleAssistantQuickAction(action) {
  if (action === "generate_chart") {
    createChartFromSelection({ chartType: "column", title: "Generated chart" });
    return;
  }
  if (action === "clean_data") {
    removeDuplicates();
    return;
  }
  if (action === "calculate_totals") {
    handleAiSend("Calculate total spend");
    return;
  }
  if (action === "format_sheet") {
    handleAiSend("Format this sheet professionally");
    return;
  }
  if (action === "monthly_summary") {
    handleAiSend("Create a monthly summary sheet");
    return;
  }
  if (action === "summarize_sheet") {
    handleAiSend("Summarize this sheet");
    return;
  }
  if (action === "formula_help") {
    handleAiSend("Explain this formula");
    return;
  }
  if (action === "add_remaining_formulas") {
    handleAiSend("Add formulas for remaining amount in this column");
    return;
  }
  if (action === "create_totals_row") {
    handleAiSend("Create a totals row for this table");
    return;
  }
  if (action === "find_trends") {
    handleAiSend("Find trends in the active sheet");
    return;
  }
  if (action === "highlight_low_budget") {
    handleAiSend("Highlight cells with low remaining budget");
    return;
  }
  if (action === "forecast") {
    handleAiSend("Forecast the next 3 months");
    return;
  }
  if (action === "remove_duplicates") {
    handleAiSend("Clean duplicate rows");
    return;
  }
  if (action === "pivot_summary") {
    handleAiSend("Create a pivot-style summary for the active range");
    return;
  }
  handleAiSend("Analyze the active sheet");
}

function printCurrentSpreadsheet() {
  const sheet = currentSheet.value;
  if (!sheet) return;
  const rows = extractRangeMatrix(
    sheet,
    {
      startRow: 0,
      endRow: Math.min(Number(sheet.loadedRowCount || 0), 30),
      startColumn: 0,
      endColumn: Math.min(Number(sheet.loadedColumnCount || 0), 12),
    },
    "display"
  );

  const html = `
    <html>
      <head>
        <title>${currentWorkbook.value?.title || "Spreadsheet"}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; }
          table { border-collapse: collapse; width: 100%; }
          td, th { border: 1px solid #d1d5db; padding: 6px 8px; font-size: 12px; }
          th { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>${currentWorkbook.value?.title || "Spreadsheet"}</h1>
        <h2>${sheet.title || "Sheet"}</h2>
        <table>
          ${rows
            .map(
              (row, rowIndex) =>
                `<tr>${row
                  .map((value) =>
                    rowIndex === 0 ? `<th>${value || ""}</th>` : `<td>${value || ""}</td>`
                  )
                  .join("")}</tr>`
            )
            .join("")}
        </table>
      </body>
    </html>
  `;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => iframe.remove(), 1200);
}

async function handleMenuAction(action) {
  activeMenu.value = "";
  moreMenuOpen.value = false;

  switch (action) {
    case "new_file":
      recentSheetsDialogOpen.value = false;
      await createSpreadsheet("Untitled spreadsheet");
      break;
    case "open_recent":
      await openRecentSheetsBrowser();
      break;
    case "duplicate_file":
      await duplicateCurrentSpreadsheet(`${currentWorkbook.value?.title || "Spreadsheet"} copy`);
      break;
    case "rename_file":
      titleInputRef.value?.focus?.();
      titleInputRef.value?.select?.();
      break;
    case "share_file":
      shareDialogOpen.value = true;
      break;
    case "download_xlsx":
      await exportCurrentSpreadsheet("xlsx");
      break;
    case "download_csv":
      await exportCurrentSpreadsheet("csv");
      break;
    case "download_pdf":
      await exportCurrentSpreadsheet("pdf");
      break;
    case "print_file":
      printCurrentSpreadsheet();
      break;
    case "open_google":
      openSpreadsheetInGoogle();
      break;
    case "delete_file":
      deleteFileDialogOpen.value = true;
      break;
    case "undo":
      await performUndo();
      break;
    case "redo":
      await performRedo();
      break;
    case "copy":
      navigator.clipboard.writeText(clipboardTextForSelection());
      break;
    case "cut":
      navigator.clipboard.writeText(clipboardTextForSelection());
      await clearSelectedValues();
      break;
    case "paste": {
      try {
        const text = await navigator.clipboard.readText();
        if (!text.trim()) break;
        const rows = text.split(/\r?\n/).map((line) => line.split("\t"));
        const start = normalizedSelection.value;
        const range = {
          sheetId: currentSheet.value?.sheetId,
          startRow: start.startRow,
          endRow: start.startRow + rows.length,
          startColumn: start.startColumn,
          endColumn:
            start.startColumn + Math.max(...rows.map((row) => row.length), 0),
        };
        const previousRows = extractRangeMatrix(currentSheet.value, range, "input");
        await runOperations(
          [buildUpdateCellsOperation(range.sheetId, range, rows)],
          {
            undo: [buildUpdateCellsOperation(range.sheetId, range, previousRows)],
            redo: [buildUpdateCellsOperation(range.sheetId, range, rows)],
          },
          { optimistic: true }
        );
      } catch (error) {
        console.debug("Clipboard paste via menu failed:", error?.message || error);
      }
      break;
    }
    case "find_replace":
      findDialogOpen.value = true;
      break;
    case "clear_values":
      await clearSelectedValues();
      break;
    case "clear_formatting":
      await clearSelectedFormatting();
      break;
    case "toggle_gridlines":
      showGridlines.value = !showGridlines.value;
      break;
    case "toggle_formula_bar":
      showFormulaBar.value = !showFormulaBar.value;
      break;
    case "freeze_row":
      await runOperations([
        {
          type: "freeze_sheet",
          sheetId: currentSheet.value?.sheetId,
          frozenRowCount: 1,
          frozenColumnCount: Number(currentSheet.value?.frozenColumnCount || 0),
        },
      ]);
      break;
    case "freeze_column":
      await runOperations([
        {
          type: "freeze_sheet",
          sheetId: currentSheet.value?.sheetId,
          frozenRowCount: Number(currentSheet.value?.frozenRowCount || 0),
          frozenColumnCount: 1,
        },
      ]);
      break;
    case "toggle_ai":
      aiPanelOpen.value = !aiPanelOpen.value;
      break;
    case "zoom_in":
      setZoom(zoom.value + 10);
      break;
    case "zoom_out":
      setZoom(zoom.value - 10);
      break;
    case "open_chart":
    case "ai_chart":
      chartDialogOpen.value = true;
      break;
    case "add_sheet":
      await addSheet();
      break;
    case "insert_link":
      await insertLinkInActiveCell();
      break;
    case "toggle_bold":
      await applyUniformFormat({ bold: !currentCellFormat.value?.bold });
      break;
    case "toggle_italic":
      await applyUniformFormat({ italic: !currentCellFormat.value?.italic });
      break;
    case "toggle_underline":
      await applyUniformFormat({ underline: !currentCellFormat.value?.underline });
      break;
    case "currency":
      await applyUniformFormat({
        numberFormatType: "currency",
        numberFormatPattern: "$#,##0.00",
      });
      break;
    case "percent":
      await applyUniformFormat({
        numberFormatType: "percent",
        numberFormatPattern: "0.00%",
      });
      break;
    case "toggle_wrap":
      await applyUniformFormat({
        wrapStrategy:
          currentCellFormat.value?.wrapStrategy === "wrap" ? "overflow_cell" : "wrap",
      });
      break;
    case "toggle_merge":
      await toggleMerge();
      break;
    case "sort_asc":
      await sortSelection("asc");
      break;
    case "sort_desc":
      await sortSelection("desc");
      break;
    case "open_filter":
      filterDialogOpen.value = true;
      break;
    case "remove_duplicates":
      await removeDuplicates();
      break;
    case "ai_analyze":
      handleAiSend("Analyze the active range");
      break;
    case "ai_formula":
      handleAiSend("Explain this formula");
      break;
    case "ai_summarize":
      handleAiSend("Summarize this sheet");
      break;
    case "ai_chat":
      handleAiSend("Help me understand and work with this sheet.");
      break;
    case "manage_integration":
      emit("open-integrations");
      break;
  }
}

async function handleToolbarAction(payload = {}) {
  switch (payload.type) {
    case "toggle_top_shell":
      topShellCollapsed.value = !topShellCollapsed.value;
      return;
    case "undo":
      await performUndo();
      return;
    case "redo":
      await performRedo();
      return;
    case "print":
      printCurrentSpreadsheet();
      return;
    case "set_zoom":
      setZoom(payload.value);
      return;
    case "set_font_family":
      await applyUniformFormat({ fontFamily: payload.value });
      return;
    case "set_font_size":
      await applyUniformFormat({ fontSize: payload.value });
      return;
    case "toggle_bold":
      await handleMenuAction("toggle_bold");
      return;
    case "toggle_italic":
      await handleMenuAction("toggle_italic");
      return;
    case "toggle_underline":
      await handleMenuAction("toggle_underline");
      return;
    case "set_text_color":
      await applyUniformFormat({ textColor: payload.value });
      return;
    case "set_fill_color":
      await applyUniformFormat({ fillColor: payload.value });
      return;
    case "set_border":
      await applyUniformFormat({
        borders: {
          top: { style: "SOLID", color: "#cbd5e1" },
          right: { style: "SOLID", color: "#cbd5e1" },
          bottom: { style: "SOLID", color: "#cbd5e1" },
          left: { style: "SOLID", color: "#cbd5e1" },
        },
      });
      return;
    case "toggle_merge":
      await toggleMerge();
      return;
    case "set_horizontal_alignment":
      await applyUniformFormat({ horizontalAlignment: payload.value });
      return;
    case "set_vertical_alignment":
      await applyUniformFormat({ verticalAlignment: payload.value === "middle" ? "middle" : payload.value });
      return;
    case "toggle_wrap":
      await handleMenuAction("toggle_wrap");
      return;
    case "insert_link":
      await insertLinkInActiveCell();
      return;
    case "open_filter":
      filterDialogOpen.value = true;
      return;
    case "open_chart":
      chartDialogOpen.value = true;
      return;
    case "apply_number_format":
      await applyUniformFormat({
        numberFormatType: payload.value?.type || "number",
        numberFormatPattern: payload.value?.pattern || "0.00",
      });
      return;
    case "increase_decimals":
      await applyUniformFormat({
        numberFormatType: currentCellFormat.value?.numberFormatType || "number",
        numberFormatPattern: adjustNumberPattern(1),
      });
      return;
    case "decrease_decimals":
      await applyUniformFormat({
        numberFormatType: currentCellFormat.value?.numberFormatType || "number",
        numberFormatPattern: adjustNumberPattern(-1),
      });
      return;
    case "freeze_row":
      await handleMenuAction("freeze_row");
      return;
    case "freeze_column":
      await handleMenuAction("freeze_column");
      return;
    case "clear_formatting":
      await clearSelectedFormatting();
      return;
  }
}

async function handleGridKeydown(event) {
  if (editingCell.value) return;
  if (event.metaKey || event.ctrlKey) {
    const key = event.key.toLowerCase();
    if (key === "c") {
      event.preventDefault();
      navigator.clipboard.writeText(clipboardTextForSelection());
    } else if (key === "x") {
      event.preventDefault();
      navigator.clipboard.writeText(clipboardTextForSelection());
      await clearSelectedValues();
    } else if (key === "z") {
      event.preventDefault();
      await performUndo();
    } else if (key === "y") {
      event.preventDefault();
      await performRedo();
    } else if (key === "f") {
      event.preventDefault();
      findDialogOpen.value = true;
    }
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(1, 0, event.shiftKey);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(-1, 0, event.shiftKey);
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveSelection(0, -1, event.shiftKey);
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveSelection(0, 1, event.shiftKey);
    return;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    moveSelection(0, event.shiftKey ? -1 : 1);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    beginCellEdit({});
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    await clearSelectedValues();
    return;
  }
  if (event.key.length === 1 && !event.altKey) {
    event.preventDefault();
    beginCellEdit({});
    editingValue.value = event.key;
  }
}

async function boot() {
  pageError.value = "";
  try {
    await loadInitialSpreadsheet();
  } catch (error) {
    pageError.value =
      error.response?.data?.error || error.message || "Failed to open Google Sheets.";
  }
}

function handleOutsideClick(event) {
  if (
    !event.target.closest(".gs-menu-wrap") &&
    !event.target.closest(".gs-popover") &&
    !event.target.closest(".gs-sheet-tab")
  ) {
    activeMenu.value = "";
    moreMenuOpen.value = false;
    sheetMenuSheetId.value = null;
  }
}

watch(
  () => [currentWorkbook.value?.spreadsheetId, currentWorkbook.value?.activeSheetId, currentWorkbook.value?.title],
  ([spreadsheetId, activeSheetId], [previousSpreadsheetId, previousActiveSheetId]) => {
    const workbook = currentWorkbook.value;
    titleDraft.value = workbook?.title || "";
    if (spreadsheetId !== previousSpreadsheetId || activeSheetId !== previousActiveSheetId) {
      resetSelection();
      filterDraft.columnIndex = 0;
    }
    syncDraftsToSelection();
    sheetMenuSheetId.value = null;
  }
);

watch(
  () => [store.moduleContext?.module, store.moduleContext?.spreadsheetId, store.moduleContext?.sheetId],
  async ([module, spreadsheetId, sheetId]) => {
    if (module !== "google_sheets" || !spreadsheetId) return;
    if (spreadsheetId !== currentWorkbook.value?.spreadsheetId || Number(sheetId || 0) !== Number(currentWorkbook.value?.activeSheetId || 0)) {
      await openSpreadsheet(spreadsheetId, { sheetId });
    }
  }
);

watch(
  () => selection.value,
  () => {
    syncDraftsToSelection();
  },
  { deep: true }
);

onMounted(async () => {
  document.addEventListener("click", handleOutsideClick);
  await boot();
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleOutsideClick);
});
</script>

<style scoped>
.gs-page {
  flex: 1;
  min-width: 0;
  min-height: 0;
  background:
    linear-gradient(rgba(96, 124, 176, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(96, 124, 176, 0.04) 1px, transparent 1px),
    radial-gradient(circle at 18% 6%, rgba(52, 211, 153, 0.08), transparent 24%),
    linear-gradient(180deg, #09131f 0%, #08111b 100%);
  background-size: 120px 120px, 120px 120px, auto, auto;
  background-position: 0 0, 0 0, 0 0, 0 0;
}

.gs-shell {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px 12px;
  box-sizing: border-box;
}

.gs-state {
  flex: 1;
  display: grid;
  place-items: center;
}

.gs-state-card {
  max-width: 440px;
  padding: 28px;
  text-align: center;
  border-radius: 24px;
  background: rgba(10, 18, 31, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.gs-state-title {
  color: #f6fbff;
  font-size: 22px;
  font-weight: 700;
}

.gs-state-copy {
  margin-top: 12px;
  color: #96a3be;
  line-height: 1.6;
}

.gs-state-btn {
  margin-top: 18px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(180deg, #4c83ff, #3f6dff);
  color: white;
  font-weight: 700;
  padding: 11px 16px;
  cursor: pointer;
}

.gs-editor-loading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #dbe5fb;
}

.gs-spinner {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.22);
  border-top-color: #6b9bff;
  animation: gs-spin 0.9s linear infinite;
}

.gs-top-shell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 10px 8px;
  border-radius: 18px 18px 14px 14px;
  background: linear-gradient(180deg, rgba(13, 19, 32, 0.98), rgba(11, 17, 28, 0.96));
  border: 1px solid rgba(176, 201, 255, 0.06);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.gs-top-shell-main {
  overflow: visible;
  max-height: 140px;
  transition: max-height 0.22s ease, opacity 0.18s ease, margin-bottom 0.18s ease;
}

.gs-top-shell--collapsed .gs-top-shell-main {
  max-height: 0;
  opacity: 0;
  margin-bottom: 0;
  overflow: hidden;
  pointer-events: none;
}

.gs-docbar,
.gs-docbar-left,
.gs-docbar-center,
.gs-docbar-right,
.gs-menubar,
.gs-formula-bar,
.gs-tabsbar {
  display: flex;
  align-items: center;
}

.gs-docbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 14px;
  min-height: 34px;
}

.gs-docbar-left {
  gap: 12px;
  min-width: 0;
}

.gs-doc-badge {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(52, 168, 83, 0.18);
  border: 1px solid rgba(93, 219, 137, 0.18);
  color: #d9f7e1;
}

.gs-doc-badge svg {
  width: 15px;
  height: 15px;
}

.gs-doc-meta {
  min-width: 0;
}

.gs-doc-breadcrumb {
  display: flex;
  align-items: center;
  gap: 7px;
  color: rgba(237, 243, 255, 0.9);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.gs-doc-sep,
.gs-doc-star {
  color: var(--text-faint);
}

.gs-doc-title-input {
  min-width: 0;
  width: min(360px, 38vw);
  border: none;
  background: transparent;
  color: #87d99b;
  font: inherit;
  font-weight: 600;
  padding: 0;
  outline: none;
}

.gs-doc-title-input:focus {
  color: #b3e9bf;
}

.gs-doc-title-input:disabled {
  opacity: 0.6;
}

.gs-docbar-center {
  justify-self: center;
  gap: 8px;
  color: rgba(149, 224, 190, 0.86);
  font-size: 11px;
  font-weight: 700;
}

.gs-save-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #34d399;
}

.gs-save-dot.error {
  background: #fb7185;
}

.gs-docbar-right {
  gap: 8px;
  position: relative;
  justify-self: end;
}

.gs-icon-btn,
.gs-meta-btn,
.gs-menu-btn,
.gs-zoom-btn,
.gs-tab-plain,
.gs-sheet-tab,
.gs-share-btn,
.gs-plus-btn {
  border: 1px solid rgba(176, 201, 255, 0.08);
  background: rgba(255, 255, 255, 0.035);
  color: rgba(228, 236, 250, 0.82);
  border-radius: 999px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.gs-icon-btn,
.gs-meta-btn,
.gs-menu-btn,
.gs-zoom-btn,
.gs-tab-plain {
  min-height: 32px;
  padding: 0 10px;
}

.gs-share-btn {
  min-height: 32px;
  padding: 0 16px;
  background: #2d6df6;
  color: white;
  border-color: rgba(45, 109, 246, 0.6);
}

.gs-plus-btn {
  width: 32px;
  min-width: 32px;
  min-height: 32px;
  padding: 0;
  background: #2d6df6;
  color: white;
  border-color: rgba(45, 109, 246, 0.6);
}

.gs-menubar {
  gap: 14px;
  min-height: 20px;
  padding: 2px 0 8px 40px;
}

.gs-menu-wrap {
  position: relative;
}

.gs-menu-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  padding: 0;
  min-height: auto;
  border-radius: 0;
}

.gs-menu-btn:hover {
  color: var(--text-primary);
}

.gs-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 190px;
  padding: 8px;
  border-radius: 14px;
  background: rgba(10, 16, 28, 0.98);
  border: 1px solid rgba(176, 201, 255, 0.12);
  box-shadow: 0 14px 36px rgba(2, 8, 24, 0.34);
  z-index: 16;
}

.gs-popover--right {
  left: auto;
  right: 0;
}

.gs-popover--tab {
  top: calc(100% + 6px);
}

.gs-popover button {
  width: 100%;
  border: 0;
  background: transparent;
  color: rgba(224, 232, 246, 0.8);
  text-align: left;
  padding: 9px 11px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
}

.gs-popover button:hover {
  background: rgba(255, 255, 255, 0.05);
  color: white;
}

.gs-popover button.danger {
  color: #ffb5b5;
}

.gs-popover button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.gs-formula-bar {
  margin-top: 6px;
  gap: 10px;
}

.gs-name-box,
.gs-formula-input,
.gs-modal-input {
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(176, 201, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: #eef4ff;
  padding: 0 12px;
  outline: none;
  box-sizing: border-box;
}

.gs-name-box {
  width: 84px;
}

.gs-formula-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  color: #aeb8d0;
  font-weight: 700;
}

.gs-formula-input {
  flex: 1;
}

.gs-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 270px;
  gap: 12px;
}

.gs-workspace--wide {
  grid-template-columns: minmax(0, 1fr);
}

.gs-center {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.gs-center--wide .gs-sheet-card {
  margin-right: 56px;
}

.gs-sheet-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px 8px 10px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(16, 23, 38, 0.96), rgba(11, 18, 30, 0.96));
  border: 1px solid rgba(176, 201, 255, 0.06);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.gs-tabsbar,
.gs-tabsbar-left,
.gs-tabsbar-right {
  display: flex;
  align-items: center;
}

.gs-tabsbar {
  justify-content: space-between;
}

.gs-tabsbar-left,
.gs-tabsbar-right {
  gap: 8px;
}

.gs-tabsbar-left {
  min-width: 0;
  flex: 1;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: none;
}

.gs-tabsbar-left::-webkit-scrollbar {
  display: none;
}

.gs-tabsbar-right {
  flex-shrink: 0;
}

.gs-sheet-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(176, 201, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(239, 244, 255, 0.86);
  font-size: 12px;
  font-weight: 600;
}

.gs-sheet-chip--muted {
  color: var(--text-faint);
}

.gs-grid-wrap {
  flex: 1;
  min-height: 0;
  min-height: clamp(420px, 56vh, 620px);
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  outline: none;
  background: #ffffff;
  border: 1px solid rgba(176, 201, 255, 0.08);
}

.gs-chart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
  padding: 0 6px;
}

.gs-tabsbar {
  position: relative;
  gap: 12px;
  min-height: 34px;
  padding: 0 6px;
  border-top: 1px solid rgba(176, 201, 255, 0.06);
  padding-top: 10px;
}

.gs-sheet-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-height: 32px;
  padding: 0 14px;
  border-radius: 10px;
}

.gs-sheet-tab.active {
  background: rgba(40, 56, 96, 0.92);
  border-color: rgba(79, 124, 255, 0.34);
  color: #f6fbff;
  box-shadow: inset 0 -2px 0 rgba(79, 124, 255, 0.96);
}

.gs-sheet-tab-caret {
  cursor: pointer;
  opacity: 0.82;
}

.gs-status-ok {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #34d399;
}

.gs-side-rail {
  position: absolute;
  right: 1px;
  top: 95px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 8px;
  border-radius: 18px;
  border: 1px solid rgba(176, 201, 255, 0.08);
  background: rgba(20, 29, 47, 0.92);
  z-index: 2;
}

.gs-side-rail-btn {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(230, 236, 246, 0.82);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.gs-side-rail-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(176, 201, 255, 0.08);
}

.gs-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 16, 0.58);
  display: grid;
  place-items: center;
  z-index: 40;
}

.gs-modal {
  width: min(420px, calc(100vw - 32px));
  border-radius: 22px;
  background: #0d1624;
  border: 1px solid rgba(148, 163, 184, 0.16);
  padding: 22px;
  box-shadow: 0 24px 44px rgba(3, 8, 20, 0.42);
}

.gs-modal--recent {
  width: min(640px, calc(100vw - 32px));
}

.gs-modal-title {
  color: #f5fbff;
  font-size: 20px;
  font-weight: 700;
}

.gs-dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.gs-dialog-close {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(176, 201, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  cursor: pointer;
}

.gs-modal-copy,
.gs-modal-note {
  margin-top: 10px;
  color: #9aa8c2;
  line-height: 1.55;
}

.gs-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
  color: #dce6fa;
  font-size: 12px;
}

.gs-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.gs-modal-btn {
  border: 0;
  border-radius: 12px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
  background: linear-gradient(180deg, #4f7cff, #3f6dff);
  color: white;
}

.gs-modal-btn.ghost {
  background: rgba(255, 255, 255, 0.06);
  color: #dce6fa;
}

.gs-modal-btn.danger {
  background: linear-gradient(180deg, #fb7185, #ef4444);
}

.gs-recent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  max-height: min(420px, calc(100vh - 280px));
  overflow: auto;
}

.gs-recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  border: 1px solid rgba(176, 201, 255, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
  padding: 12px 14px;
  cursor: pointer;
  text-align: left;
}

.gs-recent-item:hover,
.gs-recent-item.active {
  border-color: rgba(93, 168, 109, 0.28);
  background: rgba(93, 168, 109, 0.08);
}

.gs-recent-item-main {
  min-width: 0;
}

.gs-recent-item-title {
  color: #f3f8ff;
  font-size: 13px;
  font-weight: 700;
}

.gs-recent-item-meta {
  margin-top: 4px;
  color: #9fb0ca;
  font-size: 11.5px;
}

.gs-recent-item-open {
  color: #9dd5ab;
  font-size: 12px;
  font-weight: 700;
}

.gs-recent-empty {
  padding: 18px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  color: #9fb0ca;
  text-align: center;
}

@keyframes gs-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1280px) {
  .gs-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .gs-workspace--wide {
    grid-template-columns: minmax(0, 1fr);
  }

  .gs-side-rail {
    display: none;
  }

  .gs-center--wide .gs-sheet-card {
    margin-right: 0;
  }

  .gs-docbar {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .gs-docbar-center,
  .gs-docbar-right {
    justify-self: start;
  }

  .gs-menubar {
    padding-left: 0;
    flex-wrap: wrap;
  }

  .gs-grid-wrap {
    min-height: 360px;
  }
}
</style>
