<template>
  <div class="gsg-shell" :style="gridVars">
    <div class="gsg-scroll">
      <table class="gsg-table" :class="{ 'gsg-table--no-lines': !showGridlines }">
        <colgroup>
          <col style="width: 54px" />
          <col
            v-for="columnIndex in columnIndices"
            :key="`col-${columnIndex}`"
            :style="{ width: `${columnWidth(columnIndex)}px` }"
          />
        </colgroup>
        <thead>
          <tr>
            <th class="gsg-corner"></th>
            <th
              v-for="columnIndex in columnIndices"
              :key="`head-${columnIndex}`"
              class="gsg-colhead"
            >
              <div class="gsg-head-inner">
                <span>{{ columnLabel(columnIndex) }}</span>
                <button
                  class="gsg-resizer gsg-resizer-col"
                  type="button"
                  aria-label="Resize column"
                  @mousedown.stop.prevent="startResize('COLUMNS', columnIndex, $event)"
                ></button>
              </div>
            </th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="rowIndex in rowIndices"
            :key="`row-${rowIndex}`"
            v-show="!sheet?.hiddenRows?.[rowIndex]"
          >
            <th class="gsg-rowhead">
              <div class="gsg-head-inner">
                <span>{{ rowIndex + 1 }}</span>
                <button
                  class="gsg-resizer gsg-resizer-row"
                  type="button"
                  aria-label="Resize row"
                  @mousedown.stop.prevent="startResize('ROWS', rowIndex, $event)"
                ></button>
              </div>
            </th>

            <template v-for="columnIndex in columnIndices" :key="`cell-${rowIndex}-${columnIndex}`">
              <td
                v-if="shouldRenderCell(rowIndex, columnIndex)"
                class="gsg-cell"
                :class="cellClasses(rowIndex, columnIndex)"
                :rowspan="rowSpan(rowIndex, columnIndex)"
                :colspan="columnSpan(rowIndex, columnIndex)"
                :style="cellStyle(rowIndex, columnIndex)"
                @mousedown.prevent="onCellMouseDown(rowIndex, columnIndex, $event)"
                @mouseenter="onCellMouseEnter(rowIndex, columnIndex)"
                @dblclick.stop="emit('begin-edit', { row: rowIndex, column: columnIndex })"
              >
                <input
                  v-if="isEditingCell(rowIndex, columnIndex)"
                  class="gsg-editor"
                  :value="editingValue"
                  @input="emit('update-edit', $event.target.value)"
                  @blur="emit('commit-edit', { row: rowIndex, column: columnIndex })"
                  @keydown.enter.prevent="emit('commit-edit', { row: rowIndex, column: columnIndex, move: 'down' })"
                  @keydown.tab.prevent="emit('commit-edit', { row: rowIndex, column: columnIndex, move: 'right' })"
                  @keydown.esc.prevent="emit('cancel-edit')"
                  :ref="setEditorRef"
                />
                <span v-else class="gsg-cell-text">{{ displayValue(rowIndex, columnIndex) }}</span>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  buildCellLabel,
  findMergeForCell,
  getCell,
  normalizeSelection,
} from "../../services/googleSheetsWorkbook";

const props = defineProps({
  sheet: {
    type: Object,
    default: null,
  },
  selection: {
    type: Object,
    default: () => ({
      anchorRow: 0,
      anchorColumn: 0,
      focusRow: 0,
      focusColumn: 0,
    }),
  },
  editingCell: {
    type: Object,
    default: null,
  },
  editingValue: {
    type: String,
    default: "",
  },
  zoom: {
    type: Number,
    default: 100,
  },
  showGridlines: {
    type: Boolean,
    default: true,
  },
  previewCell: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits([
  "select",
  "begin-edit",
  "commit-edit",
  "cancel-edit",
  "update-edit",
  "resize-dimension",
]);

const selecting = ref(false);
const editorRef = ref(null);
const MIN_VISIBLE_ROWS = 24;
const MIN_VISIBLE_COLUMNS = 10;

const normalizedSelection = computed(() => normalizeSelection(props.selection));
const rowIndices = computed(() =>
  Array.from(
    {
      length: Math.max(
        MIN_VISIBLE_ROWS,
        Number(props.sheet?.loadedRowCount || 0),
        Number(props.sheet?.rowCount || 0)
      ),
    },
    (_, index) => index
  )
);
const columnIndices = computed(() =>
  Array.from(
    {
      length: Math.max(
        MIN_VISIBLE_COLUMNS,
        Number(props.sheet?.loadedColumnCount || 0),
        Number(props.sheet?.columnCount || 0)
      ),
    },
    (_, index) => index
  )
);
const zoomScale = computed(() => Math.max(0.5, Math.min(1.5, Number(props.zoom || 100) / 100)));

const gridVars = computed(() => ({
  "--gsg-font-size": `${13 * zoomScale.value}px`,
}));

function columnLabel(index) {
  return buildCellLabel(0, index).replace(/\d+$/, "");
}

function columnWidth(index) {
  return Math.max(64, Number(props.sheet?.columnWidths?.[index] || 120) * zoomScale.value);
}

function rowHeight(index) {
  return Math.max(28, Number(props.sheet?.rowHeights?.[index] || 32) * zoomScale.value);
}

function activeCellFor(rowIndex, columnIndex) {
  const merge = findMergeForCell(props.sheet, rowIndex, columnIndex);
  if (!merge) return { row: rowIndex, column: columnIndex };
  return {
    row: merge.startRow,
    column: merge.startColumn,
  };
}

function isEditingCell(rowIndex, columnIndex) {
  return (
    Number(props.editingCell?.row) === Number(rowIndex) &&
    Number(props.editingCell?.column) === Number(columnIndex)
  );
}

function cellBounds(rowIndex, columnIndex) {
  const merge = findMergeForCell(props.sheet, rowIndex, columnIndex);
  if (merge && merge.startRow === rowIndex && merge.startColumn === columnIndex) {
    return merge;
  }
  return {
    startRow: rowIndex,
    endRow: rowIndex + 1,
    startColumn: columnIndex,
    endColumn: columnIndex + 1,
  };
}

function displayValue(rowIndex, columnIndex) {
  if (
    Number(props.previewCell?.row) === Number(rowIndex) &&
    Number(props.previewCell?.column) === Number(columnIndex)
  ) {
    return String(props.previewCell?.value || "");
  }
  const cell = getCell(props.sheet, rowIndex, columnIndex);
  return cell?.display || cell?.raw || "";
}

function cellStyle(rowIndex, columnIndex) {
  const cell = getCell(props.sheet, rowIndex, columnIndex);
  const format = cell?.format || {};
  const bounds = cellBounds(rowIndex, columnIndex);
  const merge = findMergeForCell(props.sheet, rowIndex, columnIndex);
  const selected =
    bounds.endRow > normalizedSelection.value.startRow &&
    bounds.startRow < normalizedSelection.value.endRow &&
    bounds.endColumn > normalizedSelection.value.startColumn &&
    bounds.startColumn < normalizedSelection.value.endColumn;
  const borderStyle = (border = null) => {
    if (!border?.style) return undefined;
    const color = border.color || "#9ca3af";
    if (border.style === "DOTTED") return `1px dotted ${color}`;
    if (border.style === "DASHED") return `1px dashed ${color}`;
    if (border.style === "DOUBLE") return `3px double ${color}`;
    return `1px solid ${color}`;
  };
  return {
    minHeight: `${rowHeight(rowIndex)}px`,
    background: format.fillColor || "",
    color: format.textColor || "",
    fontFamily: format.fontFamily || "Arial, sans-serif",
    fontSize: `${Math.max(8, Number(format.fontSize || 10) * (96 / 72)) * zoomScale.value}px`,
    fontWeight: format.bold ? 700 : 500,
    fontStyle: format.italic ? "italic" : "normal",
    textDecoration: format.underline ? "underline" : "none",
    textAlign: format.horizontalAlignment || "left",
    verticalAlign:
      format.verticalAlignment === "top"
        ? "top"
        : format.verticalAlignment === "bottom"
          ? "bottom"
          : "middle",
    whiteSpace: format.wrapStrategy === "wrap" ? "normal" : "nowrap",
    overflowWrap: format.wrapStrategy === "wrap" ? "anywhere" : "normal",
    borderTop: borderStyle(format.borders?.top),
    borderRight: borderStyle(format.borders?.right),
    borderBottom: borderStyle(format.borders?.bottom),
    borderLeft: borderStyle(format.borders?.left),
    position: "relative",
    width: merge ? `${columnWidth(columnIndex)}px` : undefined,
    "--gsg-selection-top":
      selected && bounds.startRow === normalizedSelection.value.startRow ? "2px" : "0px",
    "--gsg-selection-right":
      selected && bounds.endColumn === normalizedSelection.value.endColumn ? "2px" : "0px",
    "--gsg-selection-bottom":
      selected && bounds.endRow === normalizedSelection.value.endRow ? "2px" : "0px",
    "--gsg-selection-left":
      selected && bounds.startColumn === normalizedSelection.value.startColumn ? "2px" : "0px",
  };
}

function isSelected(rowIndex, columnIndex) {
  const cell = cellBounds(rowIndex, columnIndex);
  return (
    cell.endRow > normalizedSelection.value.startRow &&
    cell.startRow < normalizedSelection.value.endRow &&
    cell.endColumn > normalizedSelection.value.startColumn &&
    cell.startColumn < normalizedSelection.value.endColumn
  );
}

function isFocusCell(rowIndex, columnIndex) {
  const cell = activeCellFor(rowIndex, columnIndex);
  return (
    cell.row === normalizedSelection.value.focusRow &&
    cell.column === normalizedSelection.value.focusColumn
  );
}

function cellClasses(rowIndex, columnIndex) {
  return {
    selected: isSelected(rowIndex, columnIndex),
    focus: isFocusCell(rowIndex, columnIndex),
  };
}

function shouldRenderCell(rowIndex, columnIndex) {
  const merge = findMergeForCell(props.sheet, rowIndex, columnIndex);
  return !merge || (merge.startRow === rowIndex && merge.startColumn === columnIndex);
}

function rowSpan(rowIndex, columnIndex) {
  const merge = findMergeForCell(props.sheet, rowIndex, columnIndex);
  if (!merge || merge.startRow !== rowIndex || merge.startColumn !== columnIndex) return 1;
  return Math.max(1, Number(merge.endRow || rowIndex + 1) - rowIndex);
}

function columnSpan(rowIndex, columnIndex) {
  const merge = findMergeForCell(props.sheet, rowIndex, columnIndex);
  if (!merge || merge.startRow !== rowIndex || merge.startColumn !== columnIndex) return 1;
  return Math.max(1, Number(merge.endColumn || columnIndex + 1) - columnIndex);
}

function stopSelecting() {
  selecting.value = false;
  window.removeEventListener("mouseup", stopSelecting);
}

function onCellMouseDown(rowIndex, columnIndex) {
  const anchor = activeCellFor(rowIndex, columnIndex);
  selecting.value = true;
  emit("select", {
    anchorRow: anchor.row,
    anchorColumn: anchor.column,
    focusRow: anchor.row,
    focusColumn: anchor.column,
  });
  window.addEventListener("mouseup", stopSelecting, { once: true });
}

function onCellMouseEnter(rowIndex, columnIndex) {
  if (!selecting.value) return;
  const focus = activeCellFor(rowIndex, columnIndex);
  emit("select", {
    anchorRow: normalizedSelection.value.anchorRow,
    anchorColumn: normalizedSelection.value.anchorColumn,
    focusRow: focus.row,
    focusColumn: focus.column,
  });
}

function startResize(dimension, index, event) {
  const startPoint = dimension === "ROWS" ? event.clientY : event.clientX;
  const baseSize =
    dimension === "ROWS"
      ? Number(props.sheet?.rowHeights?.[index] || 32)
      : Number(props.sheet?.columnWidths?.[index] || 120);
  let nextSize = baseSize;

  const onMove = (moveEvent) => {
    const currentPoint = dimension === "ROWS" ? moveEvent.clientY : moveEvent.clientX;
    const delta = (currentPoint - startPoint) / zoomScale.value;
    nextSize = Math.max(dimension === "ROWS" ? 24 : 64, Math.round(baseSize + delta));
  };

  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    emit("resize-dimension", {
      dimension,
      startIndex: index,
      endIndex: index + 1,
      pixelSize: nextSize,
    });
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function setEditorRef(element) {
  editorRef.value = element;
}

watch(
  () => props.editingCell,
  async (value) => {
    if (!value) return;
    await nextTick();
    editorRef.value?.focus?.();
    editorRef.value?.select?.();
  }
);

onBeforeUnmount(() => {
  window.removeEventListener("mouseup", stopSelecting);
});
</script>

<style scoped>
.gsg-shell {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.gsg-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  height: 100%;
  max-height: 100%;
}

.gsg-table {
  border-collapse: collapse;
  table-layout: fixed;
  width: max-content;
  min-width: 100%;
  font-size: var(--gsg-font-size);
}

.gsg-corner,
.gsg-colhead,
.gsg-rowhead {
  position: sticky;
  z-index: 3;
  background: #f8fafc;
  color: #5b667b;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.gsg-corner {
  left: 0;
  top: 0;
  min-width: 54px;
  border-right: 1px solid #d9e2ee;
  border-bottom: 1px solid #d9e2ee;
}

.gsg-colhead {
  top: 0;
  border-bottom: 1px solid #d9e2ee;
  border-right: 1px solid #e6edf5;
}

.gsg-rowhead {
  left: 0;
  z-index: 2;
  min-width: 54px;
  border-right: 1px solid #d9e2ee;
  border-bottom: 1px solid #e6edf5;
}

.gsg-head-inner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 10px;
}

.gsg-resizer {
  position: absolute;
  border: 0;
  background: transparent;
}

.gsg-resizer-col {
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  cursor: col-resize;
}

.gsg-resizer-row {
  left: 0;
  bottom: -4px;
  width: 100%;
  height: 8px;
  cursor: row-resize;
}

.gsg-cell {
  border-right: 1px solid #e6edf5;
  border-bottom: 1px solid #e6edf5;
  padding: 0 10px;
  min-width: 60px;
  color: #0f172a;
  background: white;
  box-sizing: border-box;
  cursor: cell;
  position: relative;
}

.gsg-table--no-lines .gsg-cell {
  border-color: transparent;
}

.gsg-cell.selected::before {
  content: "";
  position: absolute;
  inset: -1px;
  background: rgba(66, 133, 244, 0.07);
  border-top: var(--gsg-selection-top, 0px) solid #4f7cff;
  border-right: var(--gsg-selection-right, 0px) solid #4f7cff;
  border-bottom: var(--gsg-selection-bottom, 0px) solid #4f7cff;
  border-left: var(--gsg-selection-left, 0px) solid #4f7cff;
  pointer-events: none;
}

.gsg-cell.focus::after {
  content: "";
  position: absolute;
  inset: -1px;
  border: 2px solid #4f7cff;
  pointer-events: none;
}

.gsg-cell-text {
  display: inline-flex;
  align-items: center;
  min-height: inherit;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  position: relative;
  z-index: 1;
}

.gsg-editor {
  width: 100%;
  min-height: 30px;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  color: inherit;
  padding: 0;
  position: relative;
  z-index: 1;
}
</style>
