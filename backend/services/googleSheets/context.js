"use strict";

function cellDisplay(cell = {}) {
  return String(cell?.display ?? cell?.raw ?? cell?.formula ?? "").trim();
}

function toMarkdownTable(rows = []) {
  if (!rows.length) return "";
  const widths = [];
  rows.forEach((row) => {
    row.forEach((value, index) => {
      widths[index] = Math.max(widths[index] || 0, String(value || "").length, 3);
    });
  });

  const renderRow = (row = []) =>
    `| ${row
      .map((value, index) => String(value || "").padEnd(widths[index], " "))
      .join(" | ")} |`;

  const header = renderRow(rows[0]);
  const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
  const body = rows.slice(1).map(renderRow);
  return [header, separator, ...body].join("\n");
}

function extractRangeRows(sheet = {}, range = null, limit = 18) {
  const cells = Array.isArray(sheet?.cells) ? sheet.cells : [];
  const totalRows = cells.length;
  const totalColumns = Math.max(
    ...cells.map((row) => (Array.isArray(row) ? row.length : 0)),
    0
  );

  if (!totalRows || !totalColumns) return [];

  const startRow = Math.max(0, Number(range?.startRow || 0));
  const endRow = Math.min(totalRows, Number(range?.endRow || totalRows));
  const startColumn = Math.max(0, Number(range?.startColumn || 0));
  const endColumn = Math.min(totalColumns, Number(range?.endColumn || totalColumns));
  const output = [];

  for (let rowIndex = startRow; rowIndex < endRow && output.length < limit; rowIndex += 1) {
    const row = [];
    for (let columnIndex = startColumn; columnIndex < endColumn; columnIndex += 1) {
      row.push(cellDisplay(cells[rowIndex]?.[columnIndex]));
    }
    output.push(row);
  }

  return output;
}

function summarizeNumericColumns(rows = []) {
  if (!rows.length) return [];
  const body = rows.slice(1);
  const columnCount = Math.max(...rows.map((row) => row.length), 0);
  const summaries = [];

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const values = body
      .map((row) => Number(String(row[columnIndex] || "").replace(/[^0-9.-]/g, "")))
      .filter((value) => Number.isFinite(value));

    if (!values.length) continue;

    const total = values.reduce((sum, value) => sum + value, 0);
    const average = total / values.length;
    const header = String(rows[0]?.[columnIndex] || `Column ${columnIndex + 1}`);
    summaries.push(
      `${header}: total ${total.toLocaleString("en-IN")}, average ${average.toFixed(
        2
      )}, min ${Math.min(...values).toLocaleString("en-IN")}, max ${Math.max(
        ...values
      ).toLocaleString("en-IN")}`
    );
  }

  return summaries;
}

function inferSheetDomain(headers = []) {
  const text = headers.join(" ").toLowerCase();
  if (/invoice|payment|due|paid|client|customer/.test(text)) return "invoices and payments";
  if (/budget|spend|expense|cost|remaining|balance/.test(text)) return "budget tracking";
  if (/status|owner|priority|stage|task/.test(text)) return "project tracking";
  if (/date|month|week|year|forecast|trend/.test(text)) return "time-based reporting";
  return "";
}

function buildSheetAiContext(payload = {}) {
  const workbookTitle = String(payload.workbookTitle || "Untitled spreadsheet");
  const activeSheet = payload.activeSheet || {};
  const selection = payload.selection || null;
  const activeCell = payload.activeCell || null;
  const charts = Array.isArray(activeSheet.charts) ? activeSheet.charts : [];
  const rangeRows = extractRangeRows(activeSheet, selection);
  const sheetPreview = extractRangeRows(activeSheet, null, 24);
  const previewRows = rangeRows.length ? rangeRows : sheetPreview;
  const headerLabels = (previewRows[0] || [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const isEmptySheet = !sheetPreview.some((row) =>
    row.some((value) => String(value || "").trim())
  );

  return {
    workbookTitle,
    activeSheetTitle: String(activeSheet.title || "Sheet1"),
    isEmptySheet,
    headerLabels,
    inferredDomain: inferSheetDomain(headerLabels),
    previewRowCount: previewRows.length,
    previewColumnCount: Math.max(...previewRows.map((row) => row.length), 0),
    activeRange: payload.activeRangeLabel || "",
    activeCell: payload.activeCellLabel || "",
    activeFormula: String(activeCell?.formula || ""),
    activeCellDisplay: cellDisplay(activeCell),
    selectionTable: rangeRows.length ? toMarkdownTable(rangeRows) : "",
    sheetPreviewTable: sheetPreview.length ? toMarkdownTable(sheetPreview) : "",
    numericSummary: summarizeNumericColumns(previewRows),
    chartSummary: charts
      .slice(0, 8)
      .map((chart) => `${chart.title || "Chart"} (${chart.type || "chart"})`)
      .join(", "),
  };
}

module.exports = {
  buildSheetAiContext,
};
