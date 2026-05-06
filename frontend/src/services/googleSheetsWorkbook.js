function safeClone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

const DEFAULT_ROW_HEIGHT = 21;
const DEFAULT_COLUMN_WIDTH = 100;

export function columnIndexToLetter(index = 0) {
  let value = Number(index || 0);
  if (!Number.isFinite(value) || value < 0) return "A";
  let result = "";
  while (value >= 0) {
    result = String.fromCharCode((value % 26) + 65) + result;
    value = Math.floor(value / 26) - 1;
  }
  return result || "A";
}

export function columnLetterToIndex(label = "") {
  const normalized = String(label || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (!normalized) return 0;
  let value = 0;
  for (const char of normalized) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return Math.max(0, value - 1);
}

export function buildCellLabel(rowIndex = 0, columnIndex = 0) {
  return `${columnIndexToLetter(columnIndex)}${Number(rowIndex || 0) + 1}`;
}

export function normalizeSelection(selection = {}) {
  const anchorRow = Math.max(0, Number(selection.anchorRow || 0));
  const anchorColumn = Math.max(0, Number(selection.anchorColumn || 0));
  const focusRow = Math.max(0, Number(selection.focusRow ?? anchorRow));
  const focusColumn = Math.max(0, Number(selection.focusColumn ?? anchorColumn));

  return {
    anchorRow,
    anchorColumn,
    focusRow,
    focusColumn,
    startRow: Math.min(anchorRow, focusRow),
    endRow: Math.max(anchorRow, focusRow) + 1,
    startColumn: Math.min(anchorColumn, focusColumn),
    endColumn: Math.max(anchorColumn, focusColumn) + 1,
  };
}

export function selectionLabel(selection = {}) {
  const normalized = normalizeSelection(selection);
  const start = buildCellLabel(normalized.startRow, normalized.startColumn);
  const end = buildCellLabel(normalized.endRow - 1, normalized.endColumn - 1);
  return start === end ? start : `${start}:${end}`;
}

export function parseNameBoxValue(value = "") {
  const input = String(value || "").trim().toUpperCase();
  if (!input) return null;

  const [startRaw, endRaw = startRaw] = input.split(":");
  const start = parseCellReference(startRaw);
  const end = parseCellReference(endRaw);
  if (!start || !end) return null;

  return {
    anchorRow: start.row,
    anchorColumn: start.column,
    focusRow: end.row,
    focusColumn: end.column,
  };
}

export function parseCellReference(value = "") {
  const match = String(value || "")
    .trim()
    .match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  return {
    column: columnLetterToIndex(match[1]),
    row: Math.max(0, Number(match[2]) - 1),
  };
}

export function getSheetById(workbook = null, sheetId = null) {
  return workbook?.sheets?.find((sheet) => Number(sheet.sheetId) === Number(sheetId)) || null;
}

export function getActiveSheet(workbook = null) {
  return getSheetById(workbook, workbook?.activeSheetId) || workbook?.sheets?.[0] || null;
}

export function getCell(sheet = null, rowIndex = 0, columnIndex = 0) {
  return sheet?.cells?.[rowIndex]?.[columnIndex] || null;
}

export function getCellInput(cell = null) {
  if (!cell) return "";
  return String(cell.formula || cell.raw || "");
}

function blankCell() {
  return {
    raw: "",
    input: "",
    display: "",
    formula: "",
    effectiveValue: "",
    note: "",
    hyperlink: "",
    format: {
      fontFamily: "",
      fontSize: 10,
      bold: false,
      italic: false,
      underline: false,
      textColor: "",
      fillColor: "",
      horizontalAlignment: "",
      verticalAlignment: "",
      wrapStrategy: "",
      numberFormatType: "",
      numberFormatPattern: "",
      borders: {
        top: null,
        right: null,
        bottom: null,
        left: null,
      },
    },
  };
}

function mutableRowsFor(sheet = {}) {
  if (!sheet.__mutableRows) {
    Object.defineProperty(sheet, "__mutableRows", {
      value: new Set(),
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
  return sheet.__mutableRows;
}

function ensureRowMutable(sheet = {}, rowIndex = 0) {
  const rows = mutableRowsFor(sheet);
  const currentRow = Array.isArray(sheet.cells?.[rowIndex]) ? sheet.cells[rowIndex] : [];
  if (!rows.has(rowIndex)) {
    sheet.cells[rowIndex] = currentRow.slice();
    rows.add(rowIndex);
  }
  return sheet.cells[rowIndex];
}

function ensureGrid(sheet = {}, rowIndex = 0, columnIndex = 0) {
  const targetRows = Math.max(Number(sheet.loadedRowCount || 0), rowIndex + 1);
  const targetColumns = Math.max(Number(sheet.loadedColumnCount || 0), columnIndex + 1);

  sheet.cells = Array.isArray(sheet.cells) ? sheet.cells : [];
  sheet.rowHeights = Array.isArray(sheet.rowHeights) ? sheet.rowHeights : [];
  sheet.columnWidths = Array.isArray(sheet.columnWidths) ? sheet.columnWidths : [];
  sheet.hiddenRows = Array.isArray(sheet.hiddenRows) ? sheet.hiddenRows : [];

  while ((sheet.cells?.length || 0) < targetRows) {
    sheet.cells.push(Array.from({ length: targetColumns }, () => blankCell()));
    sheet.rowHeights.push(DEFAULT_ROW_HEIGHT);
    sheet.hiddenRows.push(false);
  }

  while (sheet.rowHeights.length < targetRows) sheet.rowHeights.push(DEFAULT_ROW_HEIGHT);
  while (sheet.hiddenRows.length < targetRows) sheet.hiddenRows.push(false);
  while (sheet.columnWidths.length < targetColumns) sheet.columnWidths.push(DEFAULT_COLUMN_WIDTH);

  sheet.cells.forEach((row, rowIndexValue) => {
    if ((row?.length || 0) >= targetColumns) return;
    const nextRow = ensureRowMutable(sheet, rowIndexValue);
    while (nextRow.length < targetColumns) {
      nextRow.push(blankCell());
    }
  });

  sheet.loadedRowCount = targetRows;
  sheet.loadedColumnCount = targetColumns;
  sheet.rowCount = Math.max(Number(sheet.rowCount || 0), targetRows);
  sheet.columnCount = Math.max(Number(sheet.columnCount || 0), targetColumns);
}

function applyCellValue(cell = {}, value = "") {
  const input = value == null ? "" : String(value);
  cell.raw = input;
  cell.input = input;
  cell.formula = input.startsWith("=") ? input : "";
  cell.display = input;
  cell.effectiveValue = input;
}

function applyCellNote(cell = {}, note = "") {
  cell.note = note == null ? "" : String(note);
}

function applyCellFormat(cell = {}, format = {}) {
  cell.format = {
    ...(cell.format || blankCell().format),
    ...(format || {}),
    borders: {
      ...(cell.format?.borders || blankCell().format.borders),
      ...(format?.borders || {}),
    },
  };
}

function coversCell(range = {}, rowIndex = 0, columnIndex = 0) {
  return (
    rowIndex >= Number(range.startRow || 0) &&
    rowIndex < Number(range.endRow || 0) &&
    columnIndex >= Number(range.startColumn || 0) &&
    columnIndex < Number(range.endColumn || 0)
  );
}

export function findMergeForCell(sheet = {}, rowIndex = 0, columnIndex = 0) {
  return (sheet?.merges || []).find((merge) => coversCell(merge, rowIndex, columnIndex)) || null;
}

export function extractRangeMatrix(sheet = {}, range = {}, mode = "input") {
  const rows = [];
  for (let rowIndex = range.startRow; rowIndex < range.endRow; rowIndex += 1) {
    const row = [];
    for (let columnIndex = range.startColumn; columnIndex < range.endColumn; columnIndex += 1) {
      const cell = getCell(sheet, rowIndex, columnIndex);
      if (mode === "format") row.push(safeClone(cell?.format || blankCell().format));
      else if (mode === "display") row.push(String(cell?.display || ""));
      else row.push(getCellInput(cell));
    }
    rows.push(row);
  }
  return rows;
}

export function buildUpdateCellsOperation(sheetId, range = {}, rows = []) {
  return {
    type: "update_cells",
    sheetId: Number(sheetId),
    range: {
      sheetId: Number(sheetId),
      startRow: Number(range.startRow || 0),
      endRow: Number(range.startRow || 0) + rows.length,
      startColumn: Number(range.startColumn || 0),
      endColumn:
        Number(range.startColumn || 0) +
        Math.max(...rows.map((row) => row.length), 0),
    },
    rows,
  };
}

export function buildPerCellFormatOperations(sheetId, range = {}, formats = []) {
  const operations = [];
  for (let rowOffset = 0; rowOffset < formats.length; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < (formats[rowOffset] || []).length; columnOffset += 1) {
      operations.push({
        type: "format_cells",
        sheetId: Number(sheetId),
        range: {
          sheetId: Number(sheetId),
          startRow: Number(range.startRow || 0) + rowOffset,
          endRow: Number(range.startRow || 0) + rowOffset + 1,
          startColumn: Number(range.startColumn || 0) + columnOffset,
          endColumn: Number(range.startColumn || 0) + columnOffset + 1,
        },
        format: formats[rowOffset]?.[columnOffset] || {},
      });
    }
  }
  return operations;
}

export function resolveChartData(workbook = null, chart = null) {
  if (!workbook || !chart?.domainRange) return null;
  const sourceSheet = getSheetById(workbook, chart.domainRange.sheetId) || getActiveSheet(workbook);
  if (!sourceSheet) return null;

  const domainRows = extractRangeMatrix(sourceSheet, chart.domainRange, "display");
  const labels = domainRows.map((row) => String(row[0] || "")).filter(Boolean);
  const seriesRanges = Array.isArray(chart.seriesRanges) ? chart.seriesRanges : [];

  if (chart.type === "pie") {
    const range = seriesRanges[0];
    const values = range
      ? extractRangeMatrix(getSheetById(workbook, range.sheetId) || sourceSheet, range, "display").map(
          (row) => Number(String(row[0] || "").replace(/[^0-9.-]/g, "")) || 0
        )
      : [];
    return {
      labels,
      datasets: [
        {
          label: chart.title || "Series",
          data: values,
        },
      ],
    };
  }

  const datasets = seriesRanges.map((range, index) => {
    const seriesSheet = getSheetById(workbook, range.sheetId) || sourceSheet;
    const values = extractRangeMatrix(seriesSheet, range, "display").map(
      (row) => Number(String(row[0] || "").replace(/[^0-9.-]/g, "")) || 0
    );

    const headerCell = getCell(
      seriesSheet,
      Math.max(0, Number(range.startRow || 1) - 1),
      Number(range.startColumn || 0)
    );

    return {
      label:
        String(headerCell?.display || headerCell?.raw || "").trim() ||
        `Series ${index + 1}`,
      data: values,
    };
  });

  return {
    labels,
    datasets,
  };
}

function copySheet(sheet = {}) {
  return {
    ...safeClone(sheet),
    sheetId: Date.now() + Math.floor(Math.random() * 1000),
    title: `${sheet.title || "Sheet"} copy`,
  };
}

export function applyOperationsLocally(workbook = null, operations = []) {
  const next = workbook
    ? {
        ...workbook,
        sheets: Array.isArray(workbook.sheets) ? workbook.sheets.slice() : [],
      }
    : null;
  if (!next) return next;

  const mutableSheets = new Map();
  const getMutableSheet = (sheetId = null) => {
    const index = next.sheets.findIndex(
      (sheet) => Number(sheet.sheetId) === Number(sheetId)
    );
    if (index === -1) return null;
    if (!mutableSheets.has(index)) {
      const current = next.sheets[index] || {};
      const cloned = {
        ...current,
        cells: Array.isArray(current.cells) ? current.cells.slice() : [],
        rowHeights: Array.isArray(current.rowHeights) ? current.rowHeights.slice() : [],
        columnWidths: Array.isArray(current.columnWidths)
          ? current.columnWidths.slice()
          : [],
        hiddenRows: Array.isArray(current.hiddenRows) ? current.hiddenRows.slice() : [],
        merges: Array.isArray(current.merges) ? current.merges.slice() : [],
        charts: Array.isArray(current.charts) ? current.charts.slice() : [],
        basicFilter: current.basicFilter ? safeClone(current.basicFilter) : null,
      };
      next.sheets[index] = cloned;
      mutableSheets.set(index, cloned);
    }
    return mutableSheets.get(index);
  };

  for (const operation of operations || []) {
    const type = String(operation.type || "").trim();
    const targetSheetId =
      operation.sheetId || operation.range?.sheetId || next.activeSheetId;
    const sheet =
      type === "add_sheet"
        ? null
        : getMutableSheet(targetSheetId) ||
          getMutableSheet(next.activeSheetId) ||
          getSheetById(next, targetSheetId) ||
          getActiveSheet(next);
    if (!sheet && type !== "add_sheet") continue;

    if (type === "update_cells") {
      const startRow = Number(operation.range?.startRow || 0);
      const startColumn = Number(operation.range?.startColumn || 0);
      ensureGrid(
        sheet,
        startRow + Math.max((operation.rows || []).length - 1, 0),
        startColumn +
          Math.max(...(operation.rows || []).map((row) => row.length), 1) -
          1
      );

      (operation.rows || []).forEach((row, rowOffset) => {
        (row || []).forEach((value, columnOffset) => {
          const rowIndex = startRow + rowOffset;
          const columnIndex = startColumn + columnOffset;
          const targetRow = ensureRowMutable(sheet, rowIndex);
          targetRow[columnIndex] = {
            ...blankCell(),
            ...(targetRow[columnIndex] || {}),
          };
          applyCellValue(targetRow[columnIndex], value);
        });
      });
      continue;
    }

    if (type === "clear_cells") {
      for (let rowIndex = operation.range.startRow; rowIndex < operation.range.endRow; rowIndex += 1) {
        for (let columnIndex = operation.range.startColumn; columnIndex < operation.range.endColumn; columnIndex += 1) {
          ensureGrid(sheet, rowIndex, columnIndex);
          const targetRow = ensureRowMutable(sheet, rowIndex);
          targetRow[columnIndex] = {
            ...blankCell(),
            ...(targetRow[columnIndex] || {}),
          };
          applyCellValue(targetRow[columnIndex], "");
        }
      }
      continue;
    }

    if (type === "format_cells") {
      for (let rowIndex = operation.range.startRow; rowIndex < operation.range.endRow; rowIndex += 1) {
        for (let columnIndex = operation.range.startColumn; columnIndex < operation.range.endColumn; columnIndex += 1) {
          ensureGrid(sheet, rowIndex, columnIndex);
          const targetRow = ensureRowMutable(sheet, rowIndex);
          targetRow[columnIndex] = {
            ...blankCell(),
            ...(targetRow[columnIndex] || {}),
          };
          applyCellFormat(targetRow[columnIndex], operation.format || {});
        }
      }
      continue;
    }

    if (type === "set_note") {
      for (let rowIndex = operation.range.startRow; rowIndex < operation.range.endRow; rowIndex += 1) {
        for (let columnIndex = operation.range.startColumn; columnIndex < operation.range.endColumn; columnIndex += 1) {
          ensureGrid(sheet, rowIndex, columnIndex);
          const targetRow = ensureRowMutable(sheet, rowIndex);
          targetRow[columnIndex] = {
            ...blankCell(),
            ...(targetRow[columnIndex] || {}),
          };
          applyCellNote(targetRow[columnIndex], operation.note || "");
        }
      }
      continue;
    }

    if (type === "clear_formatting") {
      for (let rowIndex = operation.range.startRow; rowIndex < operation.range.endRow; rowIndex += 1) {
        for (let columnIndex = operation.range.startColumn; columnIndex < operation.range.endColumn; columnIndex += 1) {
          ensureGrid(sheet, rowIndex, columnIndex);
          const targetRow = ensureRowMutable(sheet, rowIndex);
          targetRow[columnIndex] = {
            ...blankCell(),
            ...(targetRow[columnIndex] || {}),
            format: blankCell().format,
          };
        }
      }
      continue;
    }

    if (type === "resize_dimension") {
      const sizes =
        String(operation.dimension || "COLUMNS").toUpperCase() === "ROWS"
          ? sheet.rowHeights
          : sheet.columnWidths;
      while (sizes.length < Number(operation.endIndex || 0)) {
        sizes.push(
          String(operation.dimension || "").toUpperCase() === "ROWS"
            ? DEFAULT_ROW_HEIGHT
            : DEFAULT_COLUMN_WIDTH
        );
      }
      for (let index = Number(operation.startIndex || 0); index < Number(operation.endIndex || operation.startIndex || 1); index += 1) {
        sizes[index] = Number(operation.pixelSize || sizes[index] || 120);
      }
      continue;
    }

    if (type === "merge_cells") {
      sheet.merges = sheet.merges || [];
      sheet.merges.push(safeClone(operation.range));
      continue;
    }

    if (type === "unmerge_cells") {
      sheet.merges = (sheet.merges || []).filter((merge) => {
        return !(
          merge.startRow === operation.range.startRow &&
          merge.endRow === operation.range.endRow &&
          merge.startColumn === operation.range.startColumn &&
          merge.endColumn === operation.range.endColumn
        );
      });
      continue;
    }

    if (type === "freeze_sheet") {
      sheet.frozenRowCount = Number(operation.frozenRowCount || 0);
      sheet.frozenColumnCount = Number(operation.frozenColumnCount || 0);
      continue;
    }

    if (type === "set_basic_filter") {
      sheet.basicFilter = safeClone(
        operation.filter || {
          range: {
            sheetId: Number(sheet.sheetId || 0),
            startRow: Number(operation.range?.startRow || 0),
            endRow: Number(operation.range?.endRow || 0),
            startColumn: Number(operation.range?.startColumn || 0),
            endColumn: Number(operation.range?.endColumn || 0),
          },
        }
      );
      continue;
    }

    if (type === "clear_basic_filter") {
      sheet.basicFilter = null;
      continue;
    }

    if (type === "add_sheet") {
      const rowCount = Number(operation.rowCount || 1000);
      const columnCount = Number(operation.columnCount || 26);
      const loadedRowCount = Number(
        operation.loadedRowCount || Math.max(80, Math.min(rowCount, 160))
      );
      const loadedColumnCount = Number(
        operation.loadedColumnCount || Math.max(18, Math.min(columnCount, 26))
      );
      const newSheet = {
        sheetId: Date.now() + Math.floor(Math.random() * 1000),
        title: operation.title || "Sheet",
        index: next.sheets.length,
        hidden: false,
        rowCount,
        columnCount,
        frozenRowCount: 0,
        frozenColumnCount: 0,
        tabColor: "",
        basicFilter: null,
        loadedRowCount,
        loadedColumnCount,
        rowHeights: Array.from({ length: loadedRowCount }, () => DEFAULT_ROW_HEIGHT),
        columnWidths: Array.from(
          { length: loadedColumnCount },
          () => DEFAULT_COLUMN_WIDTH
        ),
        hiddenRows: Array.from({ length: loadedRowCount }, () => false),
        cells: Array.from({ length: loadedRowCount }, () =>
          Array.from({ length: loadedColumnCount }, () => blankCell())
        ),
        merges: [],
        charts: [],
      };
      next.sheets.push(newSheet);
      next.activeSheetId = newSheet.sheetId;
      continue;
    }

    if (type === "rename_sheet") {
      sheet.title = operation.title || sheet.title;
      continue;
    }

    if (type === "duplicate_sheet") {
      const clone = copySheet(sheet);
      clone.title = operation.title || clone.title;
      clone.index = next.sheets.length;
      next.sheets.push(clone);
      next.activeSheetId = clone.sheetId;
      continue;
    }

    if (type === "delete_sheet") {
      next.sheets = next.sheets.filter(
        (item) => Number(item.sheetId) !== Number(operation.sheetId)
      );
      next.activeSheetId = next.sheets[0]?.sheetId || null;
      continue;
    }

    if (type === "create_chart") {
      sheet.charts = sheet.charts || [];
      sheet.charts.push({
        chartId: Date.now() + Math.floor(Math.random() * 1000),
        title: operation.title || "Chart",
        type: operation.chartType || "column",
        domainRange: {
          sheetId: Number(operation.range.sheetId),
          startRow: Number(operation.range.startRow || 0) + 1,
          endRow: Number(operation.range.endRow || 0),
          startColumn: Number(operation.range.startColumn || 0),
          endColumn: Number(operation.range.startColumn || 0) + 1,
        },
        seriesRanges: Array.from(
          {
            length: Math.max(
              0,
              Number(operation.range.endColumn || 0) -
                Number(operation.range.startColumn || 0) -
                1
            ),
          },
          (_, index) => ({
            sheetId: Number(operation.range.sheetId),
            startRow: Number(operation.range.startRow || 0) + 1,
            endRow: Number(operation.range.endRow || 0),
            startColumn: Number(operation.range.startColumn || 0) + index + 1,
            endColumn: Number(operation.range.startColumn || 0) + index + 2,
          })
        ),
        position: {
          sheetId: Number(operation.position?.sheetId || operation.range.sheetId),
          rowIndex: Number(operation.position?.rowIndex || operation.range.endRow || 0),
          columnIndex: Number(operation.position?.columnIndex || operation.range.startColumn || 0),
          widthPixels: Number(operation.position?.widthPixels || 680),
          heightPixels: Number(operation.position?.heightPixels || 320),
        },
      });
      continue;
    }

    if (type === "update_chart") {
      sheet.charts = (sheet.charts || []).map((chart) =>
        Number(chart.chartId) === Number(operation.chartId)
          ? {
              ...chart,
              title: operation.title || chart.title,
              type: operation.chartType || chart.type,
            }
          : chart
      );
      continue;
    }

    if (type === "delete_chart") {
      sheet.charts = (sheet.charts || []).filter(
        (chart) => Number(chart.chartId) !== Number(operation.chartId)
      );
    }
  }

  return next;
}
