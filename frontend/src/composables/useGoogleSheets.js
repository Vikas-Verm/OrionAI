import { computed, ref } from "vue";
import { store, setModuleContext } from "../stores/app";
import { googleSheetsAPI } from "../services/api";
import {
  applyOperationsLocally,
  getActiveSheet,
  getCell,
  normalizeSelection,
  selectionLabel,
} from "../services/googleSheetsWorkbook";

export function useGoogleSheets() {
  const spreadsheets = ref([]);
  const loading = ref(false);
  const workbookLoading = ref(false);
  const currentWorkbook = ref(null);
  const saveState = ref("idle");
  const saveError = ref("");
  const exportLoading = ref(false);
  const aiLoading = ref(false);
  const zoom = ref(100);

  let mutationChain = Promise.resolve();

  const currentSheet = computed(() => getActiveSheet(currentWorkbook.value));
  const currentPermissions = computed(
    () =>
      currentWorkbook.value?.permissions || {
        canEdit: false,
        canRename: false,
        canShare: false,
        canDelete: false,
        canDownload: false,
        canCopy: false,
        viewOnly: true,
      }
  );

  function setWorkspace(workspace) {
    currentWorkbook.value = workspace || null;
    saveState.value = workspace ? "saved" : "idle";
    saveError.value = "";
  }

  async function loadSpreadsheets(limit = 24) {
    loading.value = true;
    try {
      const { data } = await googleSheetsAPI.list(limit);
      spreadsheets.value = data.spreadsheets || [];
      return spreadsheets.value;
    } finally {
      loading.value = false;
    }
  }

  async function openSpreadsheet(spreadsheetId, options = {}) {
    if (!spreadsheetId) return null;
    workbookLoading.value = true;
    saveError.value = "";
    try {
      const { data } = await googleSheetsAPI.get(spreadsheetId, options.sheetId);
      setWorkspace(data);
      spreadsheets.value = [
        {
          spreadsheetId: data.spreadsheetId,
          title: data.title,
          modifiedTime: data.lastSyncedAt,
          webViewUrl: data.webViewUrl,
          iconUrl: data.iconUrl,
          permissions: data.permissions,
        },
        ...spreadsheets.value.filter((item) => item.spreadsheetId !== data.spreadsheetId),
      ];
      setModuleContext({
        ...(store.moduleContext || {}),
        module: "google_sheets",
        spreadsheetId: data.spreadsheetId || spreadsheetId,
        sheetId: data.activeSheetId || options.sheetId || null,
      });
      return data;
    } finally {
      workbookLoading.value = false;
    }
  }

  async function createSpreadsheet(title = "Untitled spreadsheet") {
    workbookLoading.value = true;
    try {
      const { data } = await googleSheetsAPI.create({ title });
      setWorkspace(data);
      spreadsheets.value = [
        {
          spreadsheetId: data.spreadsheetId,
          title: data.title,
          modifiedTime: data.lastSyncedAt,
          webViewUrl: data.webViewUrl,
          iconUrl: data.iconUrl,
          permissions: data.permissions,
        },
        ...spreadsheets.value.filter((item) => item.spreadsheetId !== data.spreadsheetId),
      ];
      setModuleContext({
        ...(store.moduleContext || {}),
        module: "google_sheets",
        spreadsheetId: data.spreadsheetId,
        sheetId: data.activeSheetId || null,
      });
      return data;
    } finally {
      workbookLoading.value = false;
    }
  }

  async function loadInitialSpreadsheet() {
    const context =
      store.moduleContext?.module === "google_sheets" ? store.moduleContext : null;
    const targetId = context?.spreadsheetId || null;
    const targetSheetId = context?.sheetId || null;
    const list = await loadSpreadsheets(24);

    if (targetId) {
      return openSpreadsheet(targetId, { sheetId: targetSheetId });
    }

    if (list.length) {
      return openSpreadsheet(list[0].spreadsheetId);
    }

    setWorkspace(null);
    return null;
  }

  function queueMutation(task) {
    const next = mutationChain.then(task, task);
    mutationChain = next.catch(() => {});
    return next;
  }

  async function mutateSpreadsheet(operations = [], options = {}) {
    if (!currentWorkbook.value?.spreadsheetId || !operations.length) return null;

    const spreadsheetId = currentWorkbook.value.spreadsheetId;
    const activeSheetId = options.activeSheetId || currentWorkbook.value.activeSheetId;
    const previous = currentWorkbook.value;

    if (options.optimistic !== false) {
      currentWorkbook.value = applyOperationsLocally(currentWorkbook.value, operations);
    }

    saveState.value = "saving";
    saveError.value = "";

    return queueMutation(async () => {
      try {
        const { data } = await googleSheetsAPI.mutate(spreadsheetId, {
          activeSheetId,
          operations,
        });
        setWorkspace(data);
        setModuleContext({
          ...(store.moduleContext || {}),
          module: "google_sheets",
          spreadsheetId: data.spreadsheetId,
          sheetId: data.activeSheetId || activeSheetId || null,
        });
        return data;
      } catch (error) {
        currentWorkbook.value = previous;
        saveState.value = "error";
        saveError.value =
          error.response?.data?.error || error.message || "Failed to save spreadsheet.";
        throw error;
      }
    });
  }

  async function renameCurrentSpreadsheet(title) {
    if (!currentWorkbook.value?.spreadsheetId) return null;
    saveState.value = "saving";
    try {
      const { data } = await googleSheetsAPI.update(currentWorkbook.value.spreadsheetId, {
        title,
      });
      setWorkspace(data);
      spreadsheets.value = spreadsheets.value.map((item) =>
        item.spreadsheetId === data.spreadsheetId
          ? { ...item, title: data.title, modifiedTime: data.lastSyncedAt }
          : item
      );
      return data;
    } catch (error) {
      saveState.value = "error";
      saveError.value =
        error.response?.data?.error || error.message || "Failed to rename spreadsheet.";
      throw error;
    }
  }

  async function duplicateCurrentSpreadsheet(title = "") {
    if (!currentWorkbook.value?.spreadsheetId) return null;
    const { data } = await googleSheetsAPI.duplicate(currentWorkbook.value.spreadsheetId, {
      title,
    });
    setWorkspace(data);
    spreadsheets.value = [
      {
        spreadsheetId: data.spreadsheetId,
        title: data.title,
        modifiedTime: data.lastSyncedAt,
        webViewUrl: data.webViewUrl,
        iconUrl: data.iconUrl,
        permissions: data.permissions,
      },
      ...spreadsheets.value,
    ];
    return data;
  }

  async function deleteCurrentSpreadsheet() {
    if (!currentWorkbook.value?.spreadsheetId) return null;
    const currentId = currentWorkbook.value.spreadsheetId;
    const { data } = await googleSheetsAPI.delete(currentId);
    spreadsheets.value = spreadsheets.value.filter((item) => item.spreadsheetId !== currentId);
    setWorkspace(null);
    setModuleContext(null);
    return data;
  }

  async function refreshCurrentSpreadsheet(options = {}) {
    if (!currentWorkbook.value?.spreadsheetId) return null;
    return openSpreadsheet(currentWorkbook.value.spreadsheetId, {
      sheetId: options.sheetId || currentWorkbook.value.activeSheetId,
    });
  }

  async function shareCurrentSpreadsheet(payload) {
    if (!currentWorkbook.value?.spreadsheetId) return null;
    const { data } = await googleSheetsAPI.share(
      currentWorkbook.value.spreadsheetId,
      payload
    );
    return data;
  }

  async function exportCurrentSpreadsheet(format, payload = {}) {
    if (!currentWorkbook.value?.spreadsheetId) return null;
    exportLoading.value = true;
    try {
      const response = await googleSheetsAPI.export(currentWorkbook.value.spreadsheetId, {
        format,
        sheetId: payload.sheetId || currentWorkbook.value.activeSheetId,
      });
      const href = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      const extension =
        format === "pdf" ? "pdf" : format === "csv" ? "csv" : "xlsx";
      anchor.href = href;
      anchor.download = `${currentWorkbook.value.title || "spreadsheet"}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1200);
      return true;
    } finally {
      exportLoading.value = false;
    }
  }

  async function runAiAction(payload = {}) {
    if (!currentWorkbook.value?.spreadsheetId) return null;
    aiLoading.value = true;
    try {
      const { data } = await googleSheetsAPI.ai(
        currentWorkbook.value.spreadsheetId,
        {
          scope: "google_sheets",
          ...payload,
        }
      );
      return data;
    } finally {
      aiLoading.value = false;
    }
  }

  function setZoom(value) {
    const next = Math.max(50, Math.min(150, Number(value || 100)));
    zoom.value = next;
  }

  function openSpreadsheetInGoogle() {
    if (!currentWorkbook.value?.webViewUrl) return;
    window.open(currentWorkbook.value.webViewUrl, "_blank", "noopener,noreferrer");
  }

  function getSelectionContext(selection = {}) {
    const sheet = currentSheet.value;
    const normalized = normalizeSelection(selection);
    const activeCell = getCell(sheet, normalized.focusRow, normalized.focusColumn);
    return {
      activeCell,
      activeCellLabel: selectionLabel({
        anchorRow: normalized.focusRow,
        anchorColumn: normalized.focusColumn,
        focusRow: normalized.focusRow,
        focusColumn: normalized.focusColumn,
      }),
      activeRangeLabel: selectionLabel(normalized),
    };
  }

  return {
    aiLoading,
    currentPermissions,
    currentSheet,
    currentWorkbook,
    exportLoading,
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
    createSpreadsheet,
    deleteCurrentSpreadsheet,
    duplicateCurrentSpreadsheet,
    exportCurrentSpreadsheet,
  };
}
